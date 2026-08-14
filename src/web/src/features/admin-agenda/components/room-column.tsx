import type { BookingResponse } from "@shared/schemas/booking.schema";
import type { RoomResponse } from "@shared/schemas/room.schema";
import { BookingBlock, PIXELS_PER_HOUR } from "./booking-block";

export function RoomColumn({
  room,
  bookings,
  date,
  timezone,
  onSelectBooking,
}: {
  room: RoomResponse;
  bookings: BookingResponse[];
  date: string;
  timezone: string;
  onSelectBooking: (booking: BookingResponse) => void;
}) {
  return (
    <div className="flex w-56 shrink-0 flex-col border-l border-border first:border-l-0">
      <div className="sticky top-0 z-10 border-b border-border bg-background px-3 py-2">
        <p className="truncate text-sm font-medium">{room.name}</p>
      </div>
      <div className="relative" style={{ height: 24 * PIXELS_PER_HOUR }}>
        {Array.from({ length: 24 }, (_, hour) => (
          <div
            key={hour}
            className="absolute inset-x-0 border-t border-border/60"
            style={{ top: hour * PIXELS_PER_HOUR }}
          />
        ))}
        {bookings.map((booking) => (
          <BookingBlock
            key={booking.id}
            booking={booking}
            date={date}
            timezone={timezone}
            onSelect={onSelectBooking}
          />
        ))}
      </div>
    </div>
  );
}
