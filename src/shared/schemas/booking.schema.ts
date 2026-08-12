import { z } from "zod";
import { bookingStatusValues } from "@shared/enums/booking-status";

export const AvailabilityQuerySchema = z.object({
  roomId: z.uuid(),
  date: z.iso.date(),
});

export type AvailabilityQuery = z.infer<typeof AvailabilityQuerySchema>;

/**
 * Slot da grade do passo 2 do fluxo público.
 *
 * `startsAt` e `endsAt` exigem offset explícito: a grade é montada no fuso da
 * empresa, que raramente é o do navegador de quem reserva, e horário local sem fuso
 * cruzando a API é exatamente como se agenda uma sala na hora errada.
 */
export const AvailabilitySlotSchema = z.object({
  startsAt: z.iso.datetime({ offset: true }),
  endsAt: z.iso.datetime({ offset: true }),
  available: z.boolean(),
  priceInCents: z.number().int().nonnegative(),
});

export type AvailabilitySlot = z.infer<typeof AvailabilitySlotSchema>;

export const AvailabilityResponseSchema = z.object({
  roomId: z.uuid(),
  date: z.iso.date(),
  /**
   * Fuso IANA em que a grade foi calculada. Vai junto para o cliente rotular a
   * grade ("horários de Brasília") sem ter que inferir isso do offset, que muda
   * entre dias do mesmo ano.
   */
  timezone: z.string(),
  slots: z.array(AvailabilitySlotSchema),
});

export type AvailabilityResponse = z.infer<typeof AvailabilityResponseSchema>;

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
