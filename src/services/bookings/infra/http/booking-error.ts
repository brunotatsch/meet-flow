import { CompanyNotFoundError } from "@services/companies/domain/errors";
import { HttpError } from "@services/http/http-error";
import { RoomNotFoundError } from "@services/rooms/domain/errors";
import {
  BookingConflictError,
  BookingInThePastError,
  BookingNotFoundError,
  InvalidAvailabilityDateError,
  InvalidBookingDataError,
  OutsideBusinessHoursError,
  RoomNotAvailableError,
  SlotNotAlignedError,
} from "../../domain/errors";

/**
 * Tradução única dos erros do serviço de reservas para HTTP, compartilhada pelo
 * fluxo público e pelas rotas do admin.
 *
 * Três decisões valem destaque:
 *
 * - **409 em `BookingConflictError`**: o horário existia e era válido, outra pessoa
 *   chegou antes. É estado do recurso, não erro de sintaxe, e é a resposta que
 *   permite ao wizard recarregar a grade e pedir outro slot.
 * - **422 nos erros de janela**: o corpo está bem formado (por isso não é 400), mas
 *   o horário pedido não é ofertável. Separar `OUTSIDE_BUSINESS_HOURS` de
 *   `SLOT_NOT_ALIGNED` permite ao cliente dizer "a sala não abre nesse dia" ou
 *   "escolha um horário da grade", que são correções diferentes.
 * - **404 igual para sala inexistente e sala inativa**: o domínio distingue as duas,
 *   a borda pública não. Responder diferente transformaria o endpoint em oráculo
 *   para descobrir salas de outras empresas, o mesmo critério já adotado em
 *   `docs/architecture.md` para a rota de disponibilidade.
 *
 * Erro desconhecido é relançado para virar 500 no handler global.
 */
export function mapBookingError(error: unknown): never {
  if (error instanceof BookingConflictError) {
    throw new HttpError(409, "BOOKING_CONFLICT", error.message);
  }

  if (error instanceof BookingNotFoundError) {
    throw new HttpError(404, "BOOKING_NOT_FOUND", error.message);
  }

  if (error instanceof RoomNotFoundError || error instanceof RoomNotAvailableError) {
    throw new HttpError(404, "ROOM_NOT_FOUND", "Sala não encontrada.");
  }

  if (error instanceof CompanyNotFoundError) {
    throw new HttpError(404, "COMPANY_NOT_FOUND", "Empresa não encontrada.");
  }

  if (error instanceof OutsideBusinessHoursError) {
    throw new HttpError(422, "OUTSIDE_BUSINESS_HOURS", error.message);
  }

  if (error instanceof SlotNotAlignedError) {
    throw new HttpError(422, "SLOT_NOT_ALIGNED", error.message);
  }

  if (error instanceof BookingInThePastError) {
    throw new HttpError(422, "BOOKING_IN_THE_PAST", error.message);
  }

  if (error instanceof InvalidBookingDataError) {
    throw new HttpError(400, "INVALID_BOOKING_DATA", error.message);
  }

  if (error instanceof InvalidAvailabilityDateError) {
    throw new HttpError(400, "VALIDATION_ERROR", error.message);
  }

  throw error;
}
