import type { AvailabilitySlot } from "@shared/schemas/booking.schema";
import { cn } from "@web/lib/utils";
import { currencyFormatter, formatTimeInZone } from "../lib/format-time";

export function SlotGrid({
  slots,
  selected,
  timezone,
  onToggle,
}: {
  slots: AvailabilitySlot[];
  selected: AvailabilitySlot[];
  timezone: string;
  onToggle: (slot: AvailabilitySlot) => void;
}) {
  return (
    <div role="group" aria-label="Horários disponíveis" className="grid grid-cols-3 gap-2 sm:grid-cols-4">
      {slots.map((slot) => {
        const isSelected = selected.includes(slot);
        const startLabel = formatTimeInZone(slot.startsAt, timezone);
        const endLabel = formatTimeInZone(slot.endsAt, timezone);
        const priceLabel = currencyFormatter.format(slot.priceInCents / 100);

        return (
          <button
            key={slot.startsAt}
            type="button"
            disabled={!slot.available}
            aria-pressed={isSelected}
            aria-label={`${startLabel} às ${endLabel}, ${slot.available ? "disponível" : "ocupado"}, ${priceLabel}`}
            onClick={() => onToggle(slot)}
            className={cn(
              "flex flex-col items-center rounded-md border px-2 py-2 text-sm transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              !slot.available && "cursor-not-allowed border-border bg-muted text-muted-foreground line-through",
              slot.available && !isSelected && "border-input bg-background hover:bg-accent",
              isSelected && "border-primary bg-primary text-primary-foreground",
            )}
          >
            <span className="font-medium">{startLabel}</span>
            <span className="text-xs opacity-80">{priceLabel}</span>
          </button>
        );
      })}
    </div>
  );
}
