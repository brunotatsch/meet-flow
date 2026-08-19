import { sql } from "drizzle-orm";
import type { ReportResponse } from "@shared/schemas/report.schema";
import { db } from "@services/database/client";
import { ReportRepository, type ReportRange } from "../../application/report.repository";

type AggregatedReport = Omit<ReportResponse, "period" | "timezone">;

type AggregateRow = Record<string, unknown> & {
  summary: AggregatedReport["summary"];
  occupancyByRoom: AggregatedReport["occupancyByRoom"];
  occupancyByDay: AggregatedReport["occupancyByDay"];
  revenueByRoom: AggregatedReport["revenueByRoom"];
};

/**
 * Uma única ida ao Postgres produz todos os indicadores. `generate_series`
 * materializa apenas os dias do período (máximo 366), enquanto reservas continuam
 * filtradas pelos índices de tenant/período e agregadas dentro do banco.
 */
export class DrizzleReportRepository extends ReportRepository {
  async aggregate(range: ReportRange): Promise<AggregatedReport> {
    const rows = await db.execute<AggregateRow>(sql`
      WITH params AS (
        SELECT
          ${range.companyId}::uuid AS company_id,
          ${range.timezone}::text AS timezone,
          ${range.fromDate}::date AS from_date,
          ${range.toDate}::date AS to_date,
          ${range.from}::timestamptz AS from_instant,
          ${range.toExclusive}::timestamptz AS to_instant
      ),
      days AS (
        SELECT (p.from_date + offset_days)::date AS day
        FROM params p,
          generate_series(0, p.to_date - p.from_date) AS offsets(offset_days)
      ),
      company_rooms AS (
        SELECT r.id, r.name
        FROM rooms r
        JOIN params p ON p.company_id = r.company_id
      ),
      schedule_capacity AS (
        SELECT
          r.id AS room_id,
          d.day,
          COALESCE(SUM(
            EXTRACT(EPOCH FROM (
              ((d.day + rs.closes_at) AT TIME ZONE p.timezone) -
              ((d.day + rs.opens_at) AT TIME ZONE p.timezone)
            )) / 60
          ), 0)::double precision AS available_minutes
        FROM company_rooms r
        CROSS JOIN days d
        CROSS JOIN params p
        LEFT JOIN room_schedules rs
          ON rs.room_id = r.id
          AND rs.weekday = EXTRACT(DOW FROM d.day)::integer
        GROUP BY r.id, d.day
      ),
      occupancy_bookings AS (
        SELECT b.*
        FROM bookings b
        JOIN params p ON p.company_id = b.company_id
        WHERE b.status IN ('confirmed', 'completed')
          AND b.confirmed_at IS NOT NULL
          AND b.starts_at < p.to_instant
          AND b.ends_at > p.from_instant
      ),
      occupied_by_room AS (
        SELECT
          b.room_id,
          COALESCE(SUM(
            EXTRACT(EPOCH FROM (
              LEAST(b.ends_at, p.to_instant) -
              GREATEST(b.starts_at, p.from_instant)
            )) / 60
          ), 0)::double precision AS booked_minutes
        FROM occupancy_bookings b
        CROSS JOIN params p
        GROUP BY b.room_id
      ),
      occupancy_room AS (
        SELECT
          r.id AS room_id,
          r.name AS room_name,
          COALESCE(o.booked_minutes, 0)::double precision AS booked_minutes,
          COALESCE(SUM(c.available_minutes), 0)::double precision AS available_minutes
        FROM company_rooms r
        LEFT JOIN schedule_capacity c ON c.room_id = r.id
        LEFT JOIN occupied_by_room o ON o.room_id = r.id
        GROUP BY r.id, r.name, o.booked_minutes
      ),
      day_bounds AS (
        SELECT
          d.day,
          (d.day::timestamp AT TIME ZONE p.timezone) AS day_start,
          ((d.day + 1)::timestamp AT TIME ZONE p.timezone) AS day_end
        FROM days d
        CROSS JOIN params p
      ),
      occupied_day AS (
        SELECT
          bounds.day,
          COALESCE(SUM(
            EXTRACT(EPOCH FROM (
              LEAST(b.ends_at, bounds.day_end) -
              GREATEST(b.starts_at, bounds.day_start)
            )) / 60
          ) FILTER (
            WHERE b.id IS NOT NULL
              AND b.starts_at < bounds.day_end
              AND b.ends_at > bounds.day_start
          ), 0)::double precision AS booked_minutes
        FROM day_bounds bounds
        LEFT JOIN occupancy_bookings b
          ON b.starts_at < bounds.day_end
          AND b.ends_at > bounds.day_start
        GROUP BY bounds.day
      ),
      occupancy_day AS (
        SELECT
          d.day,
          COALESCE(o.booked_minutes, 0)::double precision AS booked_minutes,
          COALESCE(SUM(c.available_minutes), 0)::double precision AS available_minutes
        FROM days d
        LEFT JOIN schedule_capacity c ON c.day = d.day
        LEFT JOIN occupied_day o ON o.day = d.day
        GROUP BY d.day, o.booked_minutes
      ),
      business_bookings AS (
        SELECT b.*
        FROM bookings b
        JOIN params p ON p.company_id = b.company_id
        WHERE b.starts_at >= p.from_instant
          AND b.starts_at < p.to_instant
          -- Holds pendentes e Checkouts expirados/falhos nunca viraram reservas.
          AND b.confirmed_at IS NOT NULL
      ),
      paid_bookings AS (
        SELECT b.*
        FROM business_bookings b
        -- confirmed_at também existe em reservas manuais. O PaymentIntent é a
        -- evidência persistida de pagamento concluído pela Stripe.
        WHERE b.stripe_payment_intent_id IS NOT NULL
      ),
      revenue_room AS (
        SELECT
          r.id AS room_id,
          r.name AS room_name,
          COUNT(b.id)::integer AS bookings,
          COALESCE(SUM(b.total_in_cents), 0)::bigint AS revenue_in_cents
        FROM company_rooms r
        LEFT JOIN paid_bookings b
          ON b.room_id = r.id
        GROUP BY r.id, r.name
      ),
      totals AS (
        SELECT
          COUNT(*)::integer AS total_bookings,
          COUNT(*) FILTER (WHERE stripe_payment_intent_id IS NOT NULL)::integer AS paid_bookings,
          COUNT(*) FILTER (WHERE status = 'cancelled')::integer AS cancelled_bookings,
          COALESCE(SUM(total_in_cents) FILTER (
            WHERE stripe_payment_intent_id IS NOT NULL
          ), 0)::bigint AS revenue_in_cents,
          COALESCE(ROUND(AVG(total_in_cents) FILTER (
            WHERE stripe_payment_intent_id IS NOT NULL
          )), 0)::bigint AS average_ticket_in_cents
        FROM business_bookings
      ),
      peak AS (
        SELECT
          EXTRACT(HOUR FROM (b.starts_at AT TIME ZONE p.timezone))::integer AS peak_hour
        FROM business_bookings b
        CROSS JOIN params p
        WHERE b.status IN ('confirmed', 'completed')
        GROUP BY peak_hour
        ORDER BY COUNT(*) DESC, peak_hour ASC
        LIMIT 1
      ),
      capacity_totals AS (
        SELECT
          COALESCE(SUM(booked_minutes), 0)::double precision AS booked_minutes,
          COALESCE(SUM(available_minutes), 0)::double precision AS available_minutes
        FROM occupancy_room
      )
      SELECT
        json_build_object(
          'totalBookings', t.total_bookings,
          'paidBookings', t.paid_bookings,
          'cancelledBookings', t.cancelled_bookings,
          'occupancyRate', CASE
            WHEN capacity.available_minutes = 0 THEN 0
            ELSE ROUND(
              LEAST(100, capacity.booked_minutes * 100 / capacity.available_minutes)::numeric,
              2
            )
          END,
          'cancellationRate', CASE
            WHEN t.total_bookings = 0 THEN 0
            ELSE ROUND((t.cancelled_bookings * 100.0 / t.total_bookings)::numeric, 2)
          END,
          'revenueInCents', t.revenue_in_cents,
          'averageTicketInCents', t.average_ticket_in_cents,
          'peakHour', peak.peak_hour
        ) AS "summary",
        COALESCE((
          SELECT json_agg(json_build_object(
            'roomId', room_id,
            'roomName', room_name,
            'bookedMinutes', ROUND(booked_minutes::numeric, 2),
            'availableMinutes', ROUND(available_minutes::numeric, 2),
            'occupancyRate', CASE
              WHEN available_minutes = 0 THEN 0
              ELSE ROUND(LEAST(100, booked_minutes * 100 / available_minutes)::numeric, 2)
            END
          ) ORDER BY room_name)
          FROM occupancy_room
        ), '[]'::json) AS "occupancyByRoom",
        COALESCE((
          SELECT json_agg(json_build_object(
            'date', day::text,
            'bookedMinutes', ROUND(booked_minutes::numeric, 2),
            'availableMinutes', ROUND(available_minutes::numeric, 2),
            'occupancyRate', CASE
              WHEN available_minutes = 0 THEN 0
              ELSE ROUND(LEAST(100, booked_minutes * 100 / available_minutes)::numeric, 2)
            END
          ) ORDER BY day)
          FROM occupancy_day
        ), '[]'::json) AS "occupancyByDay",
        COALESCE((
          SELECT json_agg(json_build_object(
            'roomId', room_id,
            'roomName', room_name,
            'bookings', bookings,
            'revenueInCents', revenue_in_cents
          ) ORDER BY revenue_in_cents DESC, room_name)
          FROM revenue_room
        ), '[]'::json) AS "revenueByRoom"
      FROM totals t
      CROSS JOIN capacity_totals capacity
      LEFT JOIN peak ON true
      GROUP BY
        t.total_bookings,
        t.paid_bookings,
        t.cancelled_bookings,
        t.revenue_in_cents,
        t.average_ticket_in_cents,
        capacity.booked_minutes,
        capacity.available_minutes,
        peak.peak_hour
    `);

    const row = rows[0];
    if (!row) {
      throw new Error("Consulta agregada de relatórios não retornou resultado.");
    }

    return {
      summary: row.summary,
      occupancyByRoom: row.occupancyByRoom,
      occupancyByDay: row.occupancyByDay,
      revenueByRoom: row.revenueByRoom,
    };
  }
}
