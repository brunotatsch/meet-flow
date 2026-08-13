import { Copy } from "lucide-react";
import { useState } from "react";
import { useParams } from "react-router-dom";
import { z } from "zod";
import {
  RoomScheduleResponseSchema,
  WeekScheduleSchema,
  type RoomScheduleResponse,
} from "@shared/schemas/schedule.schema";
import { RoomResponseSchema, type RoomResponse } from "@shared/schemas/room.schema";
import { weekdayValues } from "@shared/enums/weekday";
import { Button } from "@web/components/button";
import { LoadingScreen } from "@web/components/loading-screen";
import { useToast } from "@web/components/toast";
import { api, ApiRequestError } from "@web/lib/api";
import { useKeyedFetch } from "@web/lib/use-keyed-fetch";

const RoomScheduleListSchema = z.array(RoomScheduleResponseSchema);

/** Mesmo conjunto fechado de `ALLOWED_SLOT_MINUTES` em `schedule.schema.ts` - não exportado de lá, então espelhado aqui. */
const SLOT_MINUTES_OPTIONS = [15, 30, 60, 120] as const;

const WEEKDAY_LABEL: Record<number, string> = {
  0: "Domingo",
  1: "Segunda-feira",
  2: "Terça-feira",
  3: "Quarta-feira",
  4: "Quinta-feira",
  5: "Sexta-feira",
  6: "Sábado",
};

interface DayForm {
  weekday: number;
  enabled: boolean;
  opensAt: string;
  closesAt: string;
  slotMinutes: (typeof SLOT_MINUTES_OPTIONS)[number];
}

function defaultDayForm(weekday: number): DayForm {
  return { weekday, enabled: false, opensAt: "09:00", closesAt: "18:00", slotMinutes: 60 };
}

function buildInitialForm(schedules: RoomScheduleResponse[]): DayForm[] {
  return weekdayValues.map((weekday) => {
    const existing = schedules.find((schedule) => schedule.weekday === weekday);
    if (!existing) return defaultDayForm(weekday);

    return {
      weekday,
      enabled: true,
      opensAt: existing.opensAt.slice(0, 5),
      closesAt: existing.closesAt.slice(0, 5),
      slotMinutes: existing.slotMinutes as DayForm["slotMinutes"],
    };
  });
}

export function RoomSchedulePage() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();

  const roomState = useKeyedFetch<RoomResponse>(id ?? null, (signal) =>
    api.get(`/rooms/${id}`, RoomResponseSchema, { signal }),
  );
  const schedulesState = useKeyedFetch<RoomScheduleResponse[]>(id ?? null, (signal) =>
    api.get(`/rooms/${id}/schedules`, RoomScheduleListSchema, { signal }),
  );

  const [form, setForm] = useState<DayForm[] | null>(null);
  const [hydratedFrom, setHydratedFrom] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (schedulesState.status === "ready" && hydratedFrom !== id) {
    setForm(buildInitialForm(schedulesState.data));
    setHydratedFrom(id ?? null);
  }

  if (roomState.status === "loading" || schedulesState.status === "loading" || !form) {
    return <LoadingScreen label="Carregando agenda..." />;
  }

  if (roomState.status === "error" || schedulesState.status === "error") {
    return (
      <div className="p-6">
        <p role="alert" className="text-sm text-destructive">
          Não foi possível carregar a agenda desta sala.
        </p>
      </div>
    );
  }

  const room = roomState.data;

  function updateDay(weekday: number, patch: Partial<DayForm>) {
    setForm((current) =>
      current!.map((day) => (day.weekday === weekday ? { ...day, ...patch } : day)),
    );
  }

  function replicateToAllDays(source: DayForm) {
    setForm((current) =>
      current!.map((day) => ({
        ...day,
        enabled: true,
        opensAt: source.opensAt,
        closesAt: source.closesAt,
        slotMinutes: source.slotMinutes,
      })),
    );
  }

  async function handleSubmit() {
    setError(null);

    const payload = form!
      .filter((day) => day.enabled)
      .map((day) => ({
        weekday: day.weekday,
        opensAt: `${day.opensAt}:00`,
        closesAt: `${day.closesAt}:00`,
        slotMinutes: day.slotMinutes,
      }));

    const parsed = WeekScheduleSchema.safeParse(payload);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Agenda inválida.");
      return;
    }

    setSaving(true);
    try {
      await api.put(`/rooms/${id}/schedules`, RoomScheduleListSchema, parsed.data);
      toast({ title: "Agenda salva", variant: "success" });
    } catch (submitError) {
      setError(
        submitError instanceof ApiRequestError
          ? submitError.body.message
          : "Não foi possível salvar a agenda.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl p-6">
      <h1 className="text-xl font-semibold">Agenda de {room.name}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Dias sem horário definido ficam fechados - a sala não aparece disponível nesses dias.
      </p>

      <div className="mt-6 flex flex-col gap-3">
        {form.map((day) => (
          <div key={day.weekday} className="rounded-lg border border-border p-4">
            <div className="flex items-center justify-between gap-4">
              <label className="flex items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={day.enabled}
                  onChange={(event) => updateDay(day.weekday, { enabled: event.target.checked })}
                  className="h-4 w-4 rounded border-input"
                />
                {WEEKDAY_LABEL[day.weekday]}
              </label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => replicateToAllDays(day)}
                disabled={!day.enabled}
              >
                <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                Replicar para todos os dias
              </Button>
            </div>

            {day.enabled && (
              <div className="mt-3 grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground" htmlFor={`opens-${day.weekday}`}>
                    Abre
                  </label>
                  <input
                    id={`opens-${day.weekday}`}
                    type="time"
                    value={day.opensAt}
                    onChange={(event) => updateDay(day.weekday, { opensAt: event.target.value })}
                    className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground" htmlFor={`closes-${day.weekday}`}>
                    Fecha
                  </label>
                  <input
                    id={`closes-${day.weekday}`}
                    type="time"
                    value={day.closesAt}
                    onChange={(event) => updateDay(day.weekday, { closesAt: event.target.value })}
                    className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground" htmlFor={`slot-${day.weekday}`}>
                    Duração do slot
                  </label>
                  <select
                    id={`slot-${day.weekday}`}
                    value={day.slotMinutes}
                    onChange={(event) =>
                      updateDay(day.weekday, {
                        slotMinutes: Number(event.target.value) as DayForm["slotMinutes"],
                      })
                    }
                    className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                  >
                    {SLOT_MINUTES_OPTIONS.map((minutes) => (
                      <option key={minutes} value={minutes}>
                        {minutes} min
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {error && (
        <p role="alert" className="mt-4 text-sm text-destructive">
          {error}
        </p>
      )}

      <Button className="mt-6" onClick={handleSubmit} disabled={saving}>
        {saving ? "Salvando..." : "Salvar agenda"}
      </Button>
    </div>
  );
}
