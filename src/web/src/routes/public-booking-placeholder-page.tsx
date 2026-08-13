import { useOutletContext } from "react-router-dom";
import type { PublicBookingContext } from "@web/layouts/public-booking-layout";

/** Placeholder: o wizard de 4 passos chega na MVP-10. */
export function PublicBookingPlaceholderPage() {
  const { companySlug } = useOutletContext<PublicBookingContext>();

  return (
    <div>
      <h1 className="text-xl font-semibold">Agendar em {companySlug}</h1>
      <p className="mt-1 text-sm text-muted-foreground">O wizard de agendamento chega na MVP-10.</p>
    </div>
  );
}
