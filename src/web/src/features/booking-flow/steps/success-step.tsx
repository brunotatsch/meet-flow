import { CheckCircle2 } from "lucide-react";
import { Button } from "@web/components/button";
import { Card, CardContent } from "@web/components/card";
import { useBookingWizardContext } from "../use-booking-wizard-context";
import { currencyFormatter, formatDateInZone, formatTimeInZone } from "../lib/format-time";

export function SuccessStep() {
  const { state, dispatch } = useBookingWizardContext();
  const { booking, room, timezone } = state;

  if (!booking || !room || !timezone) return null;

  return (
    <div className="flex flex-col items-center text-center">
      <CheckCircle2 className="h-12 w-12 text-primary" aria-hidden="true" />
      <h1 className="mt-4 text-xl font-semibold">Reserva confirmada</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Enviamos os detalhes para {booking.customerEmail}.
      </p>

      <Card className="mt-6 w-full max-w-sm text-left">
        <CardContent className="grid gap-3 pt-6 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Código da reserva</span>
            <span className="font-mono font-medium">{booking.id}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Sala</span>
            <span className="font-medium">{room.name}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Data</span>
            <span className="font-medium capitalize">{formatDateInZone(booking.startsAt, timezone)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Horário</span>
            <span className="font-medium">
              {formatTimeInZone(booking.startsAt, timezone)} às {formatTimeInZone(booking.endsAt, timezone)}
            </span>
          </div>
          <div className="flex justify-between border-t border-border pt-3 text-base">
            <span className="font-medium">Total pago na sala</span>
            <span className="font-semibold">{currencyFormatter.format(booking.totalInCents / 100)}</span>
          </div>
        </CardContent>
      </Card>

      <Button className="mt-6" variant="outline" onClick={() => dispatch({ type: "RESTART" })}>
        Fazer outra reserva
      </Button>
    </div>
  );
}
