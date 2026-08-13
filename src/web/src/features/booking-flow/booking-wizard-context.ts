import { createContext } from "react";
import type { BookingWizardAction, BookingWizardState } from "./booking-wizard-reducer";

export interface BookingWizardContextValue {
  companySlug: string;
  state: BookingWizardState;
  dispatch: (action: BookingWizardAction) => void;
}

export const BookingWizardContext = createContext<BookingWizardContextValue | null>(null);
