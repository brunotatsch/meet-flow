import { XCircle } from "lucide-react";
import { Link, useOutletContext, useSearchParams } from "react-router-dom";
import { Button } from "@web/components/button";
import type { PublicBookingContext } from "@web/layouts/public-booking-layout";

export function CheckoutCancelPage() {
  const { companySlug } = useOutletContext<PublicBookingContext>();
  const [searchParams] = useSearchParams();
  const formattedExpiration = formatExpiration(
    searchParams.get("expires_at") ?? searchParams.get("expiresAt"),
  );

  return (
    <div className="flex flex-col items-center text-center">
      <XCircle className="h-12 w-12 text-muted-foreground" aria-hidden="true" />
      <h1 className="mt-4 text-xl font-semibold">Pagamento cancelado</h1>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">
        Nenhuma confirmação de pagamento foi recebida.
        {formattedExpiration
          ? ` O horário permanece reservado temporariamente até ${formattedExpiration}.`
          : " O horário será liberado automaticamente quando a reserva temporária expirar."}
      </p>
      <Button className="mt-6" asChild>
        <Link to={`/${companySlug}/agendar`}>Escolher outro horário</Link>
      </Button>
    </div>
  );
}

function formatExpiration(value: string | null): string | null {
  if (!value) return null;

  const expiresAt = new Date(value);
  if (Number.isNaN(expiresAt.getTime())) return null;

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(expiresAt);
}
