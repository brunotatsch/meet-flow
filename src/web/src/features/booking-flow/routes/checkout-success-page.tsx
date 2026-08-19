import { CheckCircle2, Clock3, Loader2, XCircle } from "lucide-react";
import { Link, useOutletContext, useSearchParams } from "react-router-dom";
import type { PublicCheckoutStatusResponse } from "@shared/schemas/checkout.schema";
import { Button } from "@web/components/button";
import { Card, CardContent } from "@web/components/card";
import { LoadingScreen } from "@web/components/loading-screen";
import type { PublicBookingContext } from "@web/layouts/public-booking-layout";
import { formatDateInZone, formatTimeInZone } from "@web/lib/format-time";
import { currencyFormatter } from "@web/lib/money";
import { useCheckoutStatus } from "../use-checkout-status";

export function CheckoutSuccessPage() {
  const { companySlug } = useOutletContext<PublicBookingContext>();
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get("session_id");
  const freeBookingId = searchParams.get("free") === "1" ? searchParams.get("booking_id") : null;
  const { state, retry } = useCheckoutStatus(companySlug, sessionId);
  const bookingPath = `/${companySlug}/agendar`;

  if (freeBookingId) {
    return <FreeBookingConfirmation bookingId={freeBookingId} bookingPath={bookingPath} />;
  }

  if (state.status === "missing") {
    return (
      <ReturnMessage
        icon={XCircle}
        title="Não foi possível localizar o pagamento"
        description="O link de retorno está incompleto. Volte ao agendamento para consultar um novo horário."
        bookingPath={bookingPath}
      />
    );
  }

  if (state.status === "loading") {
    return <LoadingScreen label="Confirmando pagamento..." />;
  }

  if (state.status === "error") {
    return (
      <ReturnMessage
        icon={Clock3}
        title="Não conseguimos confirmar agora"
        description="Sua cobrança pode ter sido concluída. Tente consultar novamente antes de fazer outra reserva."
        bookingPath={bookingPath}
        onRetry={retry}
      />
    );
  }

  if (state.data.state === "processing") {
    return (
      <div className="flex flex-col items-center text-center" role="status">
        <Loader2 className="h-12 w-12 animate-spin text-primary" aria-hidden="true" />
        <h1 className="mt-4 text-xl font-semibold">Pagamento em processamento</h1>
        <p className="mt-2 max-w-md text-sm text-muted-foreground">
          Estamos aguardando a confirmação segura do pagamento. Esta página será atualizada
          automaticamente.
        </p>
        <Button className="mt-6" variant="outline" onClick={retry}>
          Atualizar agora
        </Button>
      </div>
    );
  }

  if (state.data.state === "confirmed") {
    return (
      <ConfirmedBooking
        booking={state.data.booking}
        timeZone={state.data.timeZone}
        bookingPath={bookingPath}
      />
    );
  }

  if (state.data.state === "expired") {
    return (
      <ReturnMessage
        icon={Clock3}
        title="A reserva temporária expirou"
        description="O pagamento não foi confirmado a tempo e o horário foi liberado para novas reservas."
        bookingPath={bookingPath}
      />
    );
  }

  if (state.data.state === "payment_failed") {
    return (
      <ReturnMessage
        icon={XCircle}
        title="Pagamento não confirmado"
        description="A cobrança falhou e a reserva não foi confirmada. Você pode escolher o horário novamente."
        bookingPath={bookingPath}
      />
    );
  }

  return (
    <ReturnMessage
      icon={Clock3}
      title="Confirmação ainda indisponível"
      description="Recebemos o retorno, mas os dados da reserva ainda não estão disponíveis. Consulte novamente."
      bookingPath={bookingPath}
      onRetry={retry}
    />
  );
}

function FreeBookingConfirmation({
  bookingId,
  bookingPath,
}: {
  bookingId: string;
  bookingPath: string;
}) {
  return (
    <div className="flex flex-col items-center text-center">
      <CheckCircle2 className="h-12 w-12 text-primary" aria-hidden="true" />
      <h1 className="mt-4 text-xl font-semibold">Reserva confirmada</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Esta reserva não exige pagamento. Guarde o código abaixo.
      </p>
      <Card className="mt-6 w-full max-w-sm text-left">
        <CardContent className="pt-6 text-sm">
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Código da reserva</span>
            <span className="break-all text-right font-mono font-medium">{bookingId}</span>
          </div>
        </CardContent>
      </Card>
      <Button className="mt-6" variant="outline" asChild>
        <Link to={bookingPath}>Fazer outra reserva</Link>
      </Button>
    </div>
  );
}

function ConfirmedBooking({
  booking,
  timeZone,
  bookingPath,
}: {
  booking: PublicCheckoutStatusResponse["booking"];
  timeZone: string;
  bookingPath: string;
}) {
  return (
    <div className="flex flex-col items-center text-center">
      <CheckCircle2 className="h-12 w-12 text-primary" aria-hidden="true" />
      <h1 className="mt-4 text-xl font-semibold">Reserva confirmada</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        O pagamento foi confirmado. Guarde o código da reserva.
      </p>

      <Card className="mt-6 w-full max-w-sm text-left">
        <CardContent className="grid gap-3 pt-6 text-sm">
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Código da reserva</span>
            <span className="break-all text-right font-mono font-medium">{booking.id}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Data</span>
            <span className="font-medium capitalize">
              {formatDateInZone(booking.startsAt, timeZone)}
            </span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Horário</span>
            <span className="font-medium">
              {formatTimeInZone(booking.startsAt, timeZone)} às{" "}
              {formatTimeInZone(booking.endsAt, timeZone)}
            </span>
          </div>
          <div className="flex justify-between gap-4 border-t border-border pt-3 text-base">
            <span className="font-medium">Total pago</span>
            <span className="font-semibold">
              {currencyFormatter.format(booking.totalInCents / 100)}
            </span>
          </div>
        </CardContent>
      </Card>

      <Button className="mt-6" variant="outline" asChild>
        <Link to={bookingPath}>Fazer outra reserva</Link>
      </Button>
    </div>
  );
}

function ReturnMessage({
  icon: Icon,
  title,
  description,
  bookingPath,
  onRetry,
}: {
  icon: typeof Clock3;
  title: string;
  description: string;
  bookingPath: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex flex-col items-center text-center">
      <Icon className="h-12 w-12 text-muted-foreground" aria-hidden="true" />
      <h1 className="mt-4 text-xl font-semibold">{title}</h1>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">{description}</p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        {onRetry && <Button onClick={onRetry}>Tentar novamente</Button>}
        <Button variant="outline" asChild>
          <Link to={bookingPath}>Voltar ao agendamento</Link>
        </Button>
      </div>
    </div>
  );
}
