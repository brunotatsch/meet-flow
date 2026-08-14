import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@web/components/button";
import { Input } from "@web/components/input";
import { shiftIsoDate, todayIsoDateInZone } from "@web/lib/format-time";

export function DayNavigator({
  date,
  timezone,
  onChange,
}: {
  date: string;
  timezone: string;
  onChange: (date: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        variant="outline"
        size="icon"
        onClick={() => onChange(shiftIsoDate(date, -1))}
        aria-label="Dia anterior"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
      </Button>
      <Input
        type="date"
        value={date}
        onChange={(event) => event.target.value && onChange(event.target.value)}
        aria-label="Escolher data"
        className="w-auto"
      />
      <Button
        variant="outline"
        size="icon"
        onClick={() => onChange(shiftIsoDate(date, 1))}
        aria-label="Próximo dia"
      >
        <ChevronRight className="h-4 w-4" aria-hidden="true" />
      </Button>
      <Button variant="outline" size="sm" onClick={() => onChange(todayIsoDateInZone(timezone))}>
        Hoje
      </Button>
      <span className="text-sm text-muted-foreground">Horários em {timezone}</span>
    </div>
  );
}
