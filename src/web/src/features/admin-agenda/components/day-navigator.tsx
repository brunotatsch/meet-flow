import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@web/components/button";
import { Input } from "@web/components/input";
import { shiftIsoDate, todayIsoDateInZone } from "@web/lib/format-time";

export function DayNavigator({
  date,
  timezone,
  mode,
  onChange,
  onModeChange,
}: {
  date: string;
  timezone: string;
  mode: "day" | "week";
  onChange: (date: string) => void;
  onModeChange: (mode: "day" | "week") => void;
}) {
  const step = mode === "day" ? 1 : 7;

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        variant="outline"
        size="icon"
        onClick={() => onChange(shiftIsoDate(date, -step))}
        aria-label={mode === "day" ? "Dia anterior" : "Semana anterior"}
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
        onClick={() => onChange(shiftIsoDate(date, step))}
        aria-label={mode === "day" ? "Próximo dia" : "Próxima semana"}
      >
        <ChevronRight className="h-4 w-4" aria-hidden="true" />
      </Button>
      <Button variant="outline" size="sm" onClick={() => onChange(todayIsoDateInZone(timezone))}>
        Hoje
      </Button>
      <div className="flex rounded-md border border-input p-0.5" aria-label="Modo da agenda">
        <Button
          variant={mode === "day" ? "secondary" : "ghost"}
          size="sm"
          aria-pressed={mode === "day"}
          onClick={() => onModeChange("day")}
        >
          Dia
        </Button>
        <Button
          variant={mode === "week" ? "secondary" : "ghost"}
          size="sm"
          aria-pressed={mode === "week"}
          onClick={() => onModeChange("week")}
        >
          Semana
        </Button>
      </div>
      <span className="text-sm text-muted-foreground">Horários em {timezone}</span>
    </div>
  );
}
