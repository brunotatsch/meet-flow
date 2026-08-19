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
import { STATUS_LABEL } from "../lib/booking-status";

export function BookingDetailPanel({
  booking,
  roomName,
  timezone,
  canUpdate,
  canCancel,
  onClose,
  onCancelBooking,
  onCheckIn,
  onCheckOut,
  onNoShow,
  cancelling,
  operating,
}: {
  booking: BookingResponse | null;
  roomName: string | undefined;
  timezone: string;
  canUpdate: boolean;
  canCancel: boolean;
  onClose: () => void;
  onCancelBooking: (booking: BookingResponse) => void;
  onCheckIn: (booking: BookingResponse) => void;
  onCheckOut: (booking: BookingResponse) => void;
  onNoShow: (booking: BookingResponse) => void;
  cancelling: boolean;
  operating: boolean;
}) {
  /**
   * Guardado pelo id da reserva, não por um booleano solto: o painel é uma única
   * instância reaproveitada para todas as reservas (sem `key` por `booking.id`), e
   * um booleano sobreviveria à troca de reserva selecionada. Fechar com sucesso
   * troca `booking` para `null` fora do `onOpenChange` do Radix (só dispara em
   * fechamento iniciado por ele - Escape, clique fora), então um reset manual ali
   * não bastava: ao abrir a reserva seguinte, a etapa de confirmação já aparecia
   * pré-marcada para ela.
   */
  const [confirmingCancelId, setConfirmingCancelId] = useState<string | null>(null);
  const [confirmingNoShowId, setConfirmingNoShowId] = useState<string | null>(null);
  const confirmingCancel = booking !== null && confirmingCancelId === booking.id;
  const confirmingNoShow = booking !== null && confirmingNoShowId === booking.id;

  return (
    <Dialog
      open={booking !== null}
      onOpenChange={(open) => {
        if (!open) {
          setConfirmingCancelId(null);
          setConfirmingNoShowId(null);
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

            {booking.checkedInAt && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Check-in real</span>
                <span className="font-medium">
                  {formatTimeInZone(booking.checkedInAt, timezone)}
                </span>
              </div>
            )}
            {booking.checkedOutAt && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Check-out real</span>
                <span className="font-medium">
                  {formatTimeInZone(booking.checkedOutAt, timezone)}
                </span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground">Data</span>
              <span className="font-medium capitalize">
                {formatDateInZone(booking.startsAt, timezone)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Horário</span>
              <span className="font-medium">
                {formatTimeInZone(booking.startsAt, timezone)} às{" "}
                {formatTimeInZone(booking.endsAt, timezone)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total</span>
              <span className="font-medium">
                {currencyFormatter.format(booking.totalInCents / 100)}
              </span>
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

          {(canUpdate || canCancel) &&
            (booking.status === "pending" || booking.status === "confirmed") && (
              <DialogFooter className="mt-6 sm:flex-col sm:items-stretch">
                {canUpdate && booking.status === "confirmed" && !booking.checkedInAt && (
                  <Button onClick={() => onCheckIn(booking)} disabled={operating}>
                    {operating ? "Processando..." : "Fazer check-in"}
                  </Button>
                )}
                {canUpdate && booking.status === "confirmed" && booking.checkedInAt && (
                  <Button onClick={() => onCheckOut(booking)} disabled={operating}>
                    {operating ? "Processando..." : "Fazer check-out"}
                  </Button>
                )}

                {canUpdate &&
                  booking.status === "confirmed" &&
                  !booking.checkedInAt &&
                  confirmingNoShow && (
                    <div className="flex flex-col gap-2 rounded-md border border-orange-500/50 bg-orange-500/10 p-3">
                      <p className="text-sm">Confirmar que o cliente não compareceu?</p>
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setConfirmingNoShowId(null)}
                        >
                          Voltar
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => onNoShow(booking)}
                          disabled={operating}
                        >
                          Confirmar não comparecimento
                        </Button>
                      </div>
                    </div>
                  )}
                {canUpdate &&
                  booking.status === "confirmed" &&
                  !booking.checkedInAt &&
                  !confirmingNoShow && (
                    <Button variant="secondary" onClick={() => setConfirmingNoShowId(booking.id)}>
                      Marcar não comparecimento
                    </Button>
                  )}

                {canCancel &&
                  !booking.checkedInAt &&
                  (confirmingCancel ? (
                    <div className="flex flex-col gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-3">
                      <p className="text-sm text-destructive">
                        Cancelar esta reserva? Não pode ser desfeito.
                      </p>
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setConfirmingCancelId(null)}
                        >
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
                    <Button variant="destructive" onClick={() => setConfirmingCancelId(booking.id)}>
                      Cancelar reserva
                    </Button>
                  ))}
              </DialogFooter>
            )}
        </DialogContent>
      )}
    </Dialog>
  );
}
