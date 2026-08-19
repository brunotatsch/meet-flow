import { z } from "zod";
import { BookingResponseSchema } from "@shared/schemas/booking.schema";

/** Dados da Checkout Session devolvidos ao passo final do wizard público. */
export const CheckoutSessionSchema = z.object({
  sessionId: z.string().min(1),
  url: z.url(),
  expiresAt: z.iso.datetime({ offset: true }),
});

export const CreateBookingCheckoutResponseSchema = z.object({
  booking: BookingResponseSchema,
  /** `null` quando o total é zero e o backend confirma sem abrir o Stripe. */
  checkout: CheckoutSessionSchema.nullable(),
});

export type CreateBookingCheckoutResponse = z.infer<typeof CreateBookingCheckoutResponseSchema>;

export const publicCheckoutStateValues = [
  "processing",
  "confirmed",
  "expired",
  "payment_failed",
] as const;

/**
 * Recorte sem PII usado pela página pública de retorno.
 *
 * O id opaco da Checkout Session funciona como credencial de consulta. Mesmo
 * assim, a resposta do frontend descarta nome, e-mail e telefone caso o backend
 * devolva o objeto completo da reserva por compatibilidade.
 */
export const PublicCheckoutBookingSchema = BookingResponseSchema.pick({
  id: true,
  roomId: true,
  startsAt: true,
  endsAt: true,
  status: true,
  totalInCents: true,
});

export const PublicCheckoutStatusResponseSchema = z.object({
  state: z.enum(publicCheckoutStateValues),
  booking: PublicCheckoutBookingSchema,
  timeZone: z.string().min(1),
});

export type PublicCheckoutStatusResponse = z.infer<typeof PublicCheckoutStatusResponseSchema>;
