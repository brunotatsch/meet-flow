import { Loader2 } from "lucide-react";
import { useState } from "react";
import { BookingResponseSchema } from "@shared/schemas/booking.schema";
import { Button } from "@web/components/button";
import { Card, CardContent } from "@web/components/card";
import { api, ApiRequestError } from "@web/lib/api";
import { useBookingWizardContext } from "../use-booking-wizard-context";
import { currencyFormatter } from "@web/lib/money";
import { formatDateInZone, formatDurationMinutes, formatTimeInZone } from "@web/lib/format-time";

type SubmitState = { status: "idle" | "submitting" } | { status: "error"; message: string };

export function ReviewStep() {
  const { companySlug, state, dispatch } = useBookingWizardContext();
  const [submitState, setSubmitState] = useState<SubmitState>({ status: "idle" });

  const { room, slot, customer, timezone, date } = state;
  if (!room || !slot || !customer || !timezone || !date) return null;

  async function handleConfirm() {
    setSubmitState({ status: "submitting" });

    try {
      const booking = await api.post(`/public/${companySlug}/bookings`, BookingResponseSchema, {
        roomId: room!.id,
        startsAt: slot!.startsAt,
        endsAt: slot!.endsAt,
        customerName: customer!.customerName,
        customerEmail: customer!.customerEmail,
        customerPhone: customer!.customerPhone,
      });

      dispatch({ type: "CONFIRM_SUCCESS", booking });
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 409) {
        dispatch({ type: "SLOT_NO_LONGER_AVAILABLE" });
        return;
      }

      const message =
        error instanceof ApiRequestError
          ? error.body.message
          : "Não foi possível confirmar a reserva. Tente novamente.";
      setSubmitState({ status: "error", message });
    }
  }

  const isSubmitting = submitState.status === "submitting";

  return (
    <div>
      <h1 className="text-xl font-semibold">Revise e confirme</h1>

      <Card className="mt-4">
        <CardContent className="grid gap-3 pt-6 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Sala</span>
            <span className="font-medium">{room.name}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Data</span>
            <span className="font-medium capitalize">{formatDateInZone(slot.startsAt, timezone)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Horário</span>
            <span className="font-medium">
              {formatTimeInZone(slot.startsAt, timezone)} às {formatTimeInZone(slot.endsAt, timezone)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Duração</span>
            <span className="font-medium">{formatDurationMinutes(slot.startsAt, slot.endsAt)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Cliente</span>
            <span className="font-medium">{customer.customerName}</span>
          </div>
          <div className="flex justify-between border-t border-border pt-3 text-base">
            <span className="font-medium">Total</span>
            <span className="font-semibold">{currencyFormatter.format(slot.priceInCents / 100)}</span>
          </div>
        </CardContent>
      </Card>

      {submitState.status === "error" && (
        <p role="alert" className="mt-4 text-sm text-destructive">
          {submitState.message}
        </p>
      )}

      <div className="mt-6 flex items-center justify-between gap-4">
        <Button variant="outline" onClick={() => dispatch({ type: "BACK" })} disabled={isSubmitting}>
          Voltar
        </Button>
        <Button onClick={handleConfirm} disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          Confirmar reserva
        </Button>
      </div>
    </div>
  );
}
