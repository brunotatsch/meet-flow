import { z } from "zod";
import { bookingStatusValues } from "@shared/enums/booking-status";

export const AvailabilityQuerySchema = z.object({
  roomId: z.uuid(),
  date: z.iso.date(),
});

export type AvailabilityQuery = z.infer<typeof AvailabilityQuerySchema>;

export const CreateBookingSchema = z
  .object({
    roomId: z.uuid(),
    startsAt: z.iso.datetime({ offset: true }),
    endsAt: z.iso.datetime({ offset: true }),
    customerName: z.string().min(3).max(100),
    customerEmail: z.email(),
    customerPhone: z.string().optional(),
    notes: z.string().optional(),
  })
  .refine((data) => new Date(data.endsAt) > new Date(data.startsAt), {
    error: "endsAt deve ser posterior a startsAt",
    path: ["endsAt"],
  });

export type CreateBookingInput = z.infer<typeof CreateBookingSchema>;

export const BookingResponseSchema = z.object({
  id: z.uuid(),
  companyId: z.uuid(),
  roomId: z.uuid(),
  customerName: z.string(),
  customerEmail: z.email(),
  customerPhone: z.string().nullable(),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
  status: z.enum(bookingStatusValues),
  totalInCents: z.number().int().nonnegative(),
  notes: z.string().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type BookingResponse = z.infer<typeof BookingResponseSchema>;
