import { useState } from "react";
import type { BookingResponse } from "@shared/schemas/booking.schema";
import { Badge } from "@web/components/badge";
import { Button } from "@web/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@web/components/dialog";
import { currencyFormatter } from "@web/lib/money";
import { formatDateInZone, formatTimeInZone } from "@web/lib/format-time";

const STATUS_LABEL: Record<BookingResponse["status"], string> = {
  pending: "Pendente",
  confirmed: "Confirmada",
  cancelled: "Cancelada",
  completed: "Concluída",
};

export function BookingDetailPanel({
  booking,
  roomName,
  timezone,
  onClose,
  onCancelBooking,
  cancelling,
}: {
  booking: BookingResponse | null;
  roomName: string | undefined;
  timezone: string;
  onClose: () => void;
  onCancelBooking: (booking: BookingResponse) => void;
  cancelling: boolean;
}) {
  const [confirmingCancel, setConfirmingCancel] = useState(false);

  return (
    <Dialog
      open={booking !== null}
      onOpenChange={(open) => {
        if (!open) {
          setConfirmingCancel(false);
          onClose();
        }
      }}
    >
      {booking && (
        <DialogContent className="left-auto right-0 top-0 h-dvh max-w-sm translate-x-0 translate-y-0 rounded-none">
          <DialogHeader>
            <DialogTitle>{booking.customerName}</DialogTitle>
            <DialogDescription>{roomName ?? "Sala"}</DialogDescription>
          </DialogHeader>

          <div className="mt-4 flex flex-col gap-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Status</span>
              <Badge variant={booking.status === "cancelled" ? "secondary" : "default"}>
                {STATUS_LABEL[booking.status]}
              </Badge>
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
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total</span>
              <span className="font-medium">{currencyFormatter.format(booking.totalInCents / 100)}</span>
            </div>

            <div className="mt-2 border-t border-border pt-3">
              <p className="text-muted-foreground">Contato</p>
              <p className="mt-1 font-medium">{booking.customerEmail}</p>
              {booking.customerPhone && <p className="font-medium">{booking.customerPhone}</p>}
            </div>

            {booking.notes && (
              <div className="border-t border-border pt-3">
                <p className="text-muted-foreground">Observações</p>
                <p className="mt-1">{booking.notes}</p>
              </div>
            )}
          </div>

          {booking.status !== "cancelled" && (
            <DialogFooter className="mt-6 sm:flex-col sm:items-stretch">
              {confirmingCancel ? (
                <div className="flex flex-col gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-3">
                  <p className="text-sm text-destructive">Cancelar esta reserva? Não pode ser desfeito.</p>
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={() => setConfirmingCancel(false)}>
                      Voltar
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => onCancelBooking(booking)}
                      disabled={cancelling}
                    >
                      {cancelling ? "Cancelando..." : "Confirmar cancelamento"}
                    </Button>
                  </div>
                </div>
              ) : (
                <Button variant="destructive" onClick={() => setConfirmingCancel(true)}>
                  Cancelar reserva
                </Button>
              )}
            </DialogFooter>
          )}
        </DialogContent>
      )}
    </Dialog>
  );
}
