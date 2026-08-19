import type { BookingResponse } from "@shared/schemas/booking.schema";
import type { RoomBlockResponse } from "@shared/schemas/room-block.schema";
import type { RoomResponse } from "@shared/schemas/room.schema";
import {
  calendarDateStringInZone,
  formatTimeInZone,
  minutesFromMidnightInZone,
  shiftIsoDate,
} from "@web/lib/format-time";
import { cn } from "@web/lib/utils";
import { STATUS_LABEL } from "../lib/booking-status";

const DAY_FORMATTER = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "UTC",
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
});

export function WeekView({
  rooms,
  bookings,
  blocks,
  weekStart,
  timezone,
  canReschedule,
  onSelectBooking,
  onDropBooking,
}: {
  rooms: RoomResponse[];
  bookings: BookingResponse[];
  blocks: RoomBlockResponse[];
  weekStart: string;
  timezone: string;
  canReschedule: boolean;
  onSelectBooking: (booking: BookingResponse) => void;
  onDropBooking: (bookingId: string, roomId: string, date: string, startMinutes: number) => void;
}) {
  const days = Array.from({ length: 7 }, (_, index) => shiftIsoDate(weekStart, index));

  return (
    <div className="min-w-[70rem]">
      <div className="grid grid-cols-[12rem_repeat(7,minmax(8rem,1fr))] border-b border-border bg-muted/40">
        <div className="p-3 text-sm font-medium">Sala</div>
        {days.map((day) => (
          <div key={day} className="border-l border-border p-3 text-center text-sm font-medium">
            {DAY_FORMATTER.format(new Date(`${day}T12:00:00Z`))}
          </div>
        ))}
      </div>

      {rooms.map((room) => (
        <div
          key={room.id}
          className="grid grid-cols-[12rem_repeat(7,minmax(8rem,1fr))] border-b border-border last:border-b-0"
        >
          <div className="p-3 text-sm font-medium">{room.name}</div>
          {days.map((day) => {
            const dayBookings = bookings.filter(
              (booking) =>
                booking.roomId === room.id &&
                calendarDateStringInZone(booking.startsAt, timezone) === day,
            );
            const dayBlocks = blocks.filter(
              (block) => block.roomId === room.id && roomBlockTouchesDay(block, day, timezone),
            );

            return (
              <div
                key={day}
                data-testid={`week-cell-${room.id}-${day}`}
                className="min-h-28 border-l border-border p-2"
                onDragOver={(event) => {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  const bookingId = event.dataTransfer.getData("application/x-meet-flow-booking");
                  const booking = bookings.find((candidate) => candidate.id === bookingId);
                  if (!booking) return;
                  onDropBooking(
                    bookingId,
                    room.id,
                    day,
                    minutesFromMidnightInZone(booking.startsAt, timezone),
                  );
                }}
              >
                {dayBlocks.map((block) => (
                  <div
                    key={block.id}
                    aria-label={`Bloqueio: ${block.reason}`}
                    className="mb-1 rounded border border-amber-500/70 bg-amber-400/25 px-2 py-1 text-xs text-amber-950 dark:bg-amber-500/20 dark:text-amber-100"
                  >
                    <span className="block truncate font-medium">{block.reason}</span>
                    <span className="block truncate">
                      {formatTimeInZone(block.startsAt, timezone)}–
                      {formatTimeInZone(block.endsAt, timezone)}
                    </span>
                  </div>
                ))}
                {dayBookings.map((booking) => (
                  <button
                    key={booking.id}
                    type="button"
                    draggable={
                      canReschedule &&
                      booking.status === "confirmed" &&
                      booking.checkedInAt === null
                    }
                    onDragStart={(event) => {
                      event.dataTransfer.setData("application/x-meet-flow-booking", booking.id);
                      event.dataTransfer.effectAllowed = "move";
                    }}
                    onClick={() => onSelectBooking(booking)}
                    className={cn(
                      "mb-1 block w-full rounded border px-2 py-1 text-left text-xs",
                      booking.status === "cancelled" && "text-muted-foreground line-through",
                      booking.status === "no_show" && "border-orange-500/60 bg-orange-500/10",
                      booking.status === "confirmed" && "border-primary/50 bg-primary/10",
                    )}
                  >
                    <span className="block truncate font-medium">{booking.customerName}</span>
                    <span className="block truncate text-muted-foreground">
                      {formatTimeInZone(booking.startsAt, timezone)}–
                      {formatTimeInZone(booking.endsAt, timezone)} · {STATUS_LABEL[booking.status]}
                    </span>
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function roomBlockTouchesDay(block: RoomBlockResponse, day: string, timezone: string): boolean {
  const startsOn = calendarDateStringInZone(block.startsAt, timezone);
  const endsOn = calendarDateStringInZone(block.endsAt, timezone);
  const endsAtMidnight = minutesFromMidnightInZone(block.endsAt, timezone) === 0;
  return startsOn <= day && (endsOn > day || (endsOn === day && !endsAtMidnight));
}
