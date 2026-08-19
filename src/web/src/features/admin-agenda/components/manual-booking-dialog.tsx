import { useState, type FormEvent } from "react";
import type { AdminCreateBookingInput } from "@shared/schemas/booking.schema";
import type { RoomResponse } from "@shared/schemas/room.schema";
import { Button } from "@web/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@web/components/dialog";
import { Input } from "@web/components/input";

export function ManualBookingDialog({
  open,
  date,
  rooms,
  onOpenChange,
  onCreate,
}: {
  open: boolean;
  date: string;
  rooms: RoomResponse[];
  onOpenChange: (open: boolean) => void;
  onCreate: (input: AdminCreateBookingInput) => Promise<void>;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && (
        <ManualBookingForm
          key={date}
          date={date}
          rooms={rooms}
          onCancel={() => onOpenChange(false)}
          onCreate={async (input) => {
            await onCreate(input);
            onOpenChange(false);
          }}
        />
      )}
    </Dialog>
  );
}

function ManualBookingForm({
  date,
  rooms,
  onCancel,
  onCreate,
}: {
  date: string;
  rooms: RoomResponse[];
  onCancel: () => void;
  onCreate: (input: AdminCreateBookingInput) => Promise<void>;
}) {
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setSubmitting(true);
    try {
      await onCreate({
        roomId: String(data.get("roomId")),
        date: String(data.get("date")),
        startTime: String(data.get("startTime")),
        endTime: String(data.get("endTime")),
        customerName: String(data.get("customerName")),
        customerEmail: String(data.get("customerEmail")),
        customerPhone: String(data.get("customerPhone") ?? "") || undefined,
        notes: String(data.get("notes") ?? "") || undefined,
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Nova reserva manual</DialogTitle>
        <DialogDescription>
          Cadastre um walk-in usando as mesmas regras de grade e conflito do fluxo público.
        </DialogDescription>
      </DialogHeader>

      <form className="mt-5 grid gap-4" onSubmit={handleSubmit}>
        <label className="grid gap-1 text-sm">
          <span>Sala</span>
          <select
            name="roomId"
            required
            defaultValue={rooms[0]?.id}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          >
            {rooms.map((room) => (
              <option key={room.id} value={room.id}>
                {room.name}
              </option>
            ))}
          </select>
        </label>
        <div className="grid grid-cols-3 gap-3">
          <label htmlFor="manual-booking-date" className="grid gap-1 text-sm">
            <span>Data</span>
            <Input id="manual-booking-date" name="date" type="date" defaultValue={date} required />
          </label>
          <label htmlFor="manual-booking-start" className="grid gap-1 text-sm">
            <span>Início</span>
            <Input
              id="manual-booking-start"
              name="startTime"
              type="time"
              defaultValue="09:00"
              required
            />
          </label>
          <label htmlFor="manual-booking-end" className="grid gap-1 text-sm">
            <span>Fim</span>
            <Input
              id="manual-booking-end"
              name="endTime"
              type="time"
              defaultValue="10:00"
              required
            />
          </label>
        </div>
        <label htmlFor="manual-booking-name" className="grid gap-1 text-sm">
          <span>Nome</span>
          <Input
            id="manual-booking-name"
            name="customerName"
            minLength={3}
            maxLength={100}
            required
          />
        </label>
        <label htmlFor="manual-booking-email" className="grid gap-1 text-sm">
          <span>E-mail</span>
          <Input id="manual-booking-email" name="customerEmail" type="email" required />
        </label>
        <label htmlFor="manual-booking-phone" className="grid gap-1 text-sm">
          <span>Telefone</span>
          <Input id="manual-booking-phone" name="customerPhone" />
        </label>
        <label htmlFor="manual-booking-notes" className="grid gap-1 text-sm">
          <span>Observações</span>
          <textarea
            name="notes"
            id="manual-booking-notes"
            className="min-h-20 rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </label>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancelar
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Salvando..." : "Criar reserva"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
