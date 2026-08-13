import type { BookingResponse } from "@shared/schemas/booking.schema";
import { cn } from "@web/lib/utils";
import { formatTimeInZone } from "@web/lib/format-time";
import { bookingBlockPosition } from "../lib/position";

/** Altura de uma hora na linha do tempo. 48 é múltiplo de 60, então todo slot de 15min cai em pixel inteiro. */
export const PIXELS_PER_HOUR = 48;
const PIXELS_PER_MINUTE = PIXELS_PER_HOUR / 60;

const STATUS_LABEL: Record<BookingResponse["status"], string> = {
  pending: "Pendente",
  confirmed: "Confirmada",
  cancelled: "Cancelada",
  completed: "Concluída",
};

const STATUS_CLASSES: Record<BookingResponse["status"], string> = {
  pending: "border-yellow-600/50 bg-yellow-500/15 text-yellow-900 dark:text-yellow-200",
  confirmed: "border-primary/50 bg-primary/15 text-foreground",
  cancelled: "border-border bg-muted text-muted-foreground line-through",
  completed: "border-border bg-secondary text-secondary-foreground",
};

export function BookingBlock({
  booking,
  date,
  timezone,
  onSelect,
}: {
  booking: BookingResponse;
  date: string;
  timezone: string;
  onSelect: (booking: BookingResponse) => void;
}) {
  const { startMinutes, endMinutes } = bookingBlockPosition(
    booking.startsAt,
    booking.endsAt,
    date,
    timezone,
  );
  const top = startMinutes * PIXELS_PER_MINUTE;
  const height = Math.max((endMinutes - startMinutes) * PIXELS_PER_MINUTE, 20);

  return (
    <button
      type="button"
      onClick={() => onSelect(booking)}
      style={{ top, height }}
      className={cn(
        "absolute left-1 right-1 overflow-hidden rounded-md border px-2 py-1 text-left text-xs",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
        STATUS_CLASSES[booking.status],
      )}
    >
      <span className="block truncate font-medium">{booking.customerName}</span>
      <span className="block truncate opacity-80">
        {formatTimeInZone(booking.startsAt, timezone)}–{formatTimeInZone(booking.endsAt, timezone)} ·{" "}
        {STATUS_LABEL[booking.status]}
      </span>
    </button>
  );
}
