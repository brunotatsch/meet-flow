import { useEffect, useReducer, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { z } from "zod";
import { AvailabilityResponseSchema } from "@shared/schemas/booking.schema";
import { PublicRoomResponseSchema } from "@shared/schemas/room.schema";
import { api } from "@web/lib/api";
import {
  bookingWizardReducer,
  initialBookingWizardState,
  type BookingWizardAction,
  type BookingWizardState,
} from "./booking-wizard-reducer";

const RoomListSchema = z.array(PublicRoomResponseSchema);

function toSearchParams(state: BookingWizardState): URLSearchParams {
  const params = new URLSearchParams();
  params.set("step", state.step);
  if (state.room) params.set("roomId", state.room.id);
  if (state.date) params.set("date", state.date);
  if (state.slot) {
    params.set("startsAt", state.slot.startsAt);
    params.set("endsAt", state.slot.endsAt);
  }
  return params;
}

/**
 * Reidrata a seleção a partir da URL depois de um reload.
 *
 * A URL guarda só identidade (`roomId`, `date`, horário), nunca os objetos
 * completos: sala e preço do slot são buscados de novo na API, o que também
 * revalida que os dois ainda existem e continuam do jeito que a URL registrou -
 * uma sala desativada ou um slot que sumiu da grade nesse meio-tempo fazem a
 * reidratação recuar para o passo anterior em vez de mostrar dado stale.
 */
async function hydrateFromUrl(
  companySlug: string,
  params: URLSearchParams,
  signal: AbortSignal,
): Promise<Partial<BookingWizardState>> {
  const roomId = params.get("roomId");
  if (!roomId) return { step: "sala" };

  const rooms = await api.get(`/public/${companySlug}/rooms`, RoomListSchema, { signal });
  const room = rooms.find((candidate) => candidate.id === roomId);
  if (!room) return { step: "sala" };

  const date = params.get("date");
  const startsAt = params.get("startsAt");
  const endsAt = params.get("endsAt");
  if (!date || !startsAt || !endsAt) return { step: "horario", room };

  const availability = await api.get(
    `/public/${companySlug}/rooms/${roomId}/availability?date=${date}`,
    AvailabilityResponseSchema,
    { signal },
  );
  const slot = availability.slots.find((candidate) => candidate.startsAt === startsAt);
  if (!slot || !slot.available) return { step: "horario", room };

  /**
   * Sempre "dados", nunca o `step` da URL: `customer` nunca é gravado na URL (é
   * informação da pessoa que reserva, não identidade de recurso) e por isso nunca
   * pode ser reidratado. Devolver `"revisao"` aqui deixaria `ReviewStep` com
   * `customer: null` e o guard `if (!customer) return null` renderizaria uma tela
   * em branco - um F5 na revisão (ou colar essa URL) precisa recuar para o passo
   * de dados, não tentar pousar num passo que a reidratação não consegue montar.
   */
  return {
    step: "dados",
    room,
    date,
    timezone: availability.timezone,
    slot: { startsAt, endsAt, priceInCents: slot.priceInCents },
  };
}

export interface UseBookingWizardResult {
  state: BookingWizardState;
  dispatch: (action: BookingWizardAction) => void;
  /** `true` enquanto a reidratação pós-reload busca sala/disponibilidade na API. */
  hydrating: boolean;
}

export function useBookingWizard(companySlug: string): UseBookingWizardResult {
  const [searchParams, setSearchParams] = useSearchParams();
  const [state, dispatch] = useReducer(bookingWizardReducer, initialBookingWizardState);
  const [hydrating, setHydrating] = useState(() => searchParams.has("roomId"));
  const hydratedOnce = useRef(false);

  useEffect(() => {
    if (hydratedOnce.current) return;
    hydratedOnce.current = true;

    if (!searchParams.has("roomId")) return;

    const controller = new AbortController();

    hydrateFromUrl(companySlug, searchParams, controller.signal)
      .then((partial) => {
        dispatch({ type: "HYDRATE", state: partial });
      })
      .catch(() => {
        dispatch({ type: "HYDRATE", state: { step: "sala" } });
      })
      .finally(() => setHydrating(false));

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companySlug]);

  useEffect(() => {
    if (hydrating) return;
    setSearchParams(toSearchParams(state), { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrating, state.step, state.room, state.date, state.slot]);

  return { state, dispatch, hydrating };
}
