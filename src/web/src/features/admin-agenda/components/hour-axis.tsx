import { PIXELS_PER_HOUR } from "./booking-block";

export function HourAxis() {
  return (
    <div className="sticky left-0 z-10 w-14 shrink-0 bg-background">
      <div className="h-[41px] border-b border-border" aria-hidden="true" />
      <div className="relative" style={{ height: 24 * PIXELS_PER_HOUR }}>
        {Array.from({ length: 24 }, (_, hour) => (
          <span
            key={hour}
            className="absolute right-2 -translate-y-1/2 text-xs text-muted-foreground"
            style={{ top: hour * PIXELS_PER_HOUR }}
          >
            {String(hour).padStart(2, "0")}:00
          </span>
        ))}
      </div>
    </div>
  );
}
