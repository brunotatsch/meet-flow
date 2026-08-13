import { useContext } from "react";
import { BookingWizardContext, type BookingWizardContextValue } from "./booking-wizard-context";

export function useBookingWizardContext(): BookingWizardContextValue {
  const context = useContext(BookingWizardContext);

  if (!context) {
    throw new Error("useBookingWizardContext precisa estar dentro de <BookingWizardProvider>.");
  }

  return context;
}
