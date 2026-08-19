import type { PublicRoomResponse } from "@shared/schemas/room.schema";

export const WIZARD_STEPS = ["sala", "horario", "dados", "revisao"] as const;
export type WizardStep = (typeof WIZARD_STEPS)[number];

export const NAVIGABLE_STEPS = WIZARD_STEPS;

export interface SelectedSlot {
  startsAt: string;
  endsAt: string;
  priceInCents: number;
}

export interface CustomerDetails {
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
}

export interface BookingWizardState {
  step: WizardStep;
  room: PublicRoomResponse | null;
  /** Fuso IANA devolvido pela grade de disponibilidade, para formatar horários sem depender do fuso do navegador. */
  timezone: string | null;
  date: string | null;
  slot: SelectedSlot | null;
  customer: CustomerDetails | null;
  /** Aviso de uma linha para o passo atual mostrar uma vez (ex.: o 409 ao confirmar). */
  notice: string | null;
}

export type BookingWizardAction =
  | { type: "SELECT_ROOM"; room: PublicRoomResponse }
  | { type: "SELECT_SLOT"; date: string; slot: SelectedSlot; timezone: string }
  | { type: "SUBMIT_CUSTOMER"; customer: CustomerDetails }
  | { type: "BACK" }
  /** 409 na confirmação: a grade mudou debaixo do usuário, volta pro passo 2 sem o slot antigo. */
  | { type: "SLOT_NO_LONGER_AVAILABLE" }
  | { type: "HYDRATE"; state: Partial<BookingWizardState> };

export const SLOT_CONFLICT_NOTICE = "Este horário acabou de ser reservado. Escolha outro horário.";

export const initialBookingWizardState: BookingWizardState = {
  step: "sala",
  room: null,
  timezone: null,
  date: null,
  slot: null,
  customer: null,
  notice: null,
};

export function bookingWizardReducer(
  state: BookingWizardState,
  action: BookingWizardAction,
): BookingWizardState {
  switch (action.type) {
    case "SELECT_ROOM":
      return { ...state, room: action.room, date: null, slot: null, step: "horario", notice: null };

    case "SELECT_SLOT":
      return {
        ...state,
        date: action.date,
        slot: action.slot,
        timezone: action.timezone,
        step: "dados",
        notice: null,
      };

    case "SUBMIT_CUSTOMER":
      return { ...state, customer: action.customer, step: "revisao" };

    case "BACK": {
      const currentIndex = NAVIGABLE_STEPS.indexOf(state.step);
      if (currentIndex <= 0) return state;
      return { ...state, step: NAVIGABLE_STEPS[currentIndex - 1]! };
    }

    case "SLOT_NO_LONGER_AVAILABLE":
      return { ...state, slot: null, step: "horario", notice: SLOT_CONFLICT_NOTICE };

    case "HYDRATE":
      return { ...state, ...action.state };

    default:
      return state;
  }
}
