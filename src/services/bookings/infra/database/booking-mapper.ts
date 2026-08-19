import { Booking } from "@services/bookings/domain/booking.entity";
import type { bookings } from "./schema/bookings";

type BookingRow = typeof bookings.$inferSelect;
type BookingInsert = typeof bookings.$inferInsert;

export function toBookingEntity(row: BookingRow): Booking {
  return Booking.restore({
    id: row.id,
    companyId: row.companyId,
    roomId: row.roomId,
    customerName: row.customerName,
    customerEmail: row.customerEmail,
    customerPhone: row.customerPhone,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    status: row.status,
    totalInCents: row.totalInCents,
    notes: row.notes,
    expiresAt: row.expiresAt,
    stripeCheckoutSessionId: row.stripeCheckoutSessionId,
    stripePaymentIntentId: row.stripePaymentIntentId,
    confirmedAt: row.confirmedAt,
    cancellationReason: row.cancellationReason,
    checkedInAt: row.checkedInAt,
    checkedOutAt: row.checkedOutAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

/**
 * `period` não aparece aqui, e não é esquecimento: a coluna é `GENERATED ALWAYS`
 * (ver `drizzle/0001_booking_no_overlap.sql`) e o Postgres recusa qualquer escrita
 * nela. Quem a mantém é o banco, a partir de `starts_at` e `ends_at`.
 */
export function toBookingRow(booking: Booking): BookingInsert {
  return {
    id: booking.id,
    companyId: booking.companyId,
    roomId: booking.roomId,
    customerName: booking.customerName,
    customerEmail: booking.customerEmail,
    customerPhone: booking.customerPhone,
    startsAt: booking.startsAt,
    endsAt: booking.endsAt,
    status: booking.status,
    totalInCents: booking.totalInCents,
    notes: booking.notes,
    expiresAt: booking.expiresAt,
    stripeCheckoutSessionId: booking.stripeCheckoutSessionId,
    stripePaymentIntentId: booking.stripePaymentIntentId,
    confirmedAt: booking.confirmedAt,
    cancellationReason: booking.cancellationReason,
    checkedInAt: booking.checkedInAt,
    checkedOutAt: booking.checkedOutAt,
    createdAt: booking.createdAt,
    updatedAt: booking.updatedAt,
  };
}
