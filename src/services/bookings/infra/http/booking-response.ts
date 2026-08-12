import type { BookingResponse } from "@shared/schemas/booking.schema";
import type { Booking } from "../../domain/booking.entity";
import { formatIsoWithOffset } from "../../domain/time-zone";

/**
 * Serializa a reserva no contrato compartilhado.
 *
 * `startsAt` e `endsAt` saem no fuso da empresa, com offset explícito, pela mesma
 * razão dos slots da grade: a confirmação precisa mostrar o horário da sala, e um
 * `Z` obrigaria cada cliente a refazer a conversão - com o fuso do navegador, que
 * quase nunca é o da sala.
 */
export function toBookingResponse(booking: Booking, timezone: string): BookingResponse {
  return {
    id: booking.id,
    companyId: booking.companyId,
    roomId: booking.roomId,
    customerName: booking.customerName,
    customerEmail: booking.customerEmail,
    customerPhone: booking.customerPhone,
    startsAt: formatIsoWithOffset(booking.startsAt, timezone),
    endsAt: formatIsoWithOffset(booking.endsAt, timezone),
    status: booking.status,
    totalInCents: booking.totalInCents,
    notes: booking.notes,
    createdAt: booking.createdAt.toISOString(),
    updatedAt: booking.updatedAt.toISOString(),
  };
}
