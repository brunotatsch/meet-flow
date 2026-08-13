import type { ReactNode } from "react";
import { BookingWizardContext, type BookingWizardContextValue } from "./booking-wizard-context";

export function BookingWizardProvider({
  value,
  children,
}: {
  value: BookingWizardContextValue;
  children: ReactNode;
}) {
  return <BookingWizardContext.Provider value={value}>{children}</BookingWizardContext.Provider>;
}
