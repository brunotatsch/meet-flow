import { z } from "zod";

export const REPORT_MAX_DAYS = 366;
const DAY_IN_MS = 86_400_000;

export const ReportPeriodSchema = z
  .object({
    from: z.iso.date(),
    to: z.iso.date(),
  })
  .superRefine((period, context) => {
    if (period.to < period.from) {
      context.addIssue({
        code: "custom",
        message: "A data final deve ser igual ou posterior à inicial.",
        path: ["to"],
      });
      return;
    }

    const inclusiveDays =
      (Date.parse(`${period.to}T00:00:00Z`) - Date.parse(`${period.from}T00:00:00Z`)) / DAY_IN_MS +
      1;

    if (inclusiveDays > REPORT_MAX_DAYS) {
      context.addIssue({
        code: "custom",
        message: `O período máximo do relatório é de ${REPORT_MAX_DAYS} dias.`,
        path: ["to"],
      });
    }
  });

export type ReportPeriod = z.infer<typeof ReportPeriodSchema>;

const RateSchema = z.number().min(0).max(100);

export const ReportSummarySchema = z.object({
  totalBookings: z.number().int().nonnegative(),
  paidBookings: z.number().int().nonnegative(),
  cancelledBookings: z.number().int().nonnegative(),
  occupancyRate: RateSchema,
  cancellationRate: RateSchema,
  revenueInCents: z.number().int().nonnegative(),
  averageTicketInCents: z.number().int().nonnegative(),
  peakHour: z.number().int().min(0).max(23).nullable(),
});

export const RoomOccupancySchema = z.object({
  roomId: z.uuid(),
  roomName: z.string(),
  bookedMinutes: z.number().nonnegative(),
  availableMinutes: z.number().nonnegative(),
  occupancyRate: RateSchema,
});

export const DailyOccupancySchema = z.object({
  date: z.iso.date(),
  bookedMinutes: z.number().nonnegative(),
  availableMinutes: z.number().nonnegative(),
  occupancyRate: RateSchema,
});

export const RoomRevenueSchema = z.object({
  roomId: z.uuid(),
  roomName: z.string(),
  bookings: z.number().int().nonnegative(),
  revenueInCents: z.number().int().nonnegative(),
});

export const ReportResponseSchema = z.object({
  period: ReportPeriodSchema,
  timezone: z.string().min(1),
  summary: ReportSummarySchema,
  occupancyByRoom: z.array(RoomOccupancySchema),
  occupancyByDay: z.array(DailyOccupancySchema),
  revenueByRoom: z.array(RoomRevenueSchema),
});

export type ReportResponse = z.infer<typeof ReportResponseSchema>;
