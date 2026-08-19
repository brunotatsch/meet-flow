import type { BookingResponse } from "@shared/schemas/booking.schema";
import type { RoomBlockResponse } from "@shared/schemas/room-block.schema";
import type { RoomResponse } from "@shared/schemas/room.schema";
import {
  calendarDateStringInZone,
  formatTimeInZone,
  minutesFromMidnightInZone,
} from "@web/lib/format-time";
import { BookingBlock, PIXELS_PER_HOUR } from "./booking-block";

export function RoomColumn({
  room,
  bookings,
  blocks,
  date,
  timezone,
  canReschedule,
  onSelectBooking,
  onDropBooking,
}: {
  room: RoomResponse;
  bookings: BookingResponse[];
  blocks: RoomBlockResponse[];
  date: string;
  timezone: string;
  canReschedule: boolean;
  onSelectBooking: (booking: BookingResponse) => void;
  onDropBooking: (bookingId: string, roomId: string, date: string, startMinutes: number) => void;
}) {
  return (
    <div className="flex w-56 shrink-0 flex-col border-l border-border first:border-l-0">
      <div className="sticky top-0 z-10 border-b border-border bg-background px-3 py-2">
        <p className="truncate text-sm font-medium">{room.name}</p>
      </div>
      <div
        data-testid={`room-timeline-${room.id}`}
        className="relative"
        style={{ height: 24 * PIXELS_PER_HOUR }}
        onDragOver={(event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
        }}
        onDrop={(event) => {
          event.preventDefault();
          const bookingId = event.dataTransfer.getData("application/x-meet-flow-booking");
          if (!bookingId) return;

          const bounds = event.currentTarget.getBoundingClientRect();
          const rawMinutes = ((event.clientY - bounds.top) / PIXELS_PER_HOUR) * 60;
          const snappedMinutes = Math.max(
            0,
            Math.min(23 * 60 + 45, Math.round(rawMinutes / 15) * 15),
          );
          onDropBooking(bookingId, room.id, date, snappedMinutes);
        }}
      >
        {Array.from({ length: 24 }, (_, hour) => (
          <div
            key={hour}
            className="absolute inset-x-0 border-t border-border/60"
            style={{ top: hour * PIXELS_PER_HOUR }}
          />
        ))}
        {blocks.map((block) => (
          <RoomBlockOverlay key={block.id} block={block} date={date} timezone={timezone} />
        ))}
        {bookings.map((booking) => (
          <BookingBlock
            key={booking.id}
            booking={booking}
            date={date}
            timezone={timezone}
            canReschedule={canReschedule}
            onSelect={onSelectBooking}
          />
        ))}
      </div>
    </div>
  );
}

function RoomBlockOverlay({
  block,
  date,
  timezone,
}: {
  block: RoomBlockResponse;
  date: string;
  timezone: string;
}) {
  const startsOn = calendarDateStringInZone(block.startsAt, timezone);
  const endsOn = calendarDateStringInZone(block.endsAt, timezone);
  const endAtMidnight = minutesFromMidnightInZone(block.endsAt, timezone) === 0;
  if (startsOn > date || endsOn < date || (endsOn === date && endAtMidnight)) return null;

  const startsAtMinutes = startsOn < date ? 0 : minutesFromMidnightInZone(block.startsAt, timezone);
  const endsAtMinutes = endsOn > date ? 24 * 60 : minutesFromMidnightInZone(block.endsAt, timezone);
  const top = (startsAtMinutes / 60) * PIXELS_PER_HOUR;
  const height = Math.max(((endsAtMinutes - startsAtMinutes) / 60) * PIXELS_PER_HOUR, 18);
  const label = `Bloqueio: ${block.reason}, ${formatTimeInZone(
    block.startsAt,
    timezone,
  )}–${formatTimeInZone(block.endsAt, timezone)}`;

  return (
    <div
      aria-label={label}
      data-testid={`room-block-${block.id}`}
      className="pointer-events-none absolute inset-x-1 z-[1] overflow-hidden rounded border border-amber-500/70 bg-amber-400/30 px-2 py-1 text-xs text-amber-950 dark:bg-amber-500/20 dark:text-amber-100"
      style={{ top, height }}
    >
      <span className="block truncate font-medium">{block.reason}</span>
      <span className="block truncate">
        {formatTimeInZone(block.startsAt, timezone)}–{formatTimeInZone(block.endsAt, timezone)}
      </span>
    </div>
  );
}
