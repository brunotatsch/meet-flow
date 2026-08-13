import { Button } from "@web/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@web/components/dialog";

export function DeactivateRoomDialog({
  roomName,
  open,
  onOpenChange,
  onConfirm,
  confirming,
}: {
  roomName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  confirming: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Desativar {roomName}?</DialogTitle>
          <DialogDescription>
            A sala some da listagem pública e deixa de aceitar novas reservas. Reservas futuras já
            confirmadas para esta sala <strong>não são canceladas</strong> - cancele cada uma
            separadamente se for o caso.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={confirming}>
            Cancelar
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={confirming}>
            {confirming ? "Desativando..." : "Desativar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
