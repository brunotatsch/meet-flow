import { useMemo, useState } from "react";
import { AvailabilityResponseSchema, type AvailabilitySlot } from "@shared/schemas/booking.schema";
import { Button } from "@web/components/button";
import { Input } from "@web/components/input";
import { Label } from "@web/components/label";
import { Skeleton } from "@web/components/skeleton";
import { api } from "@web/lib/api";
import { todayIsoDate } from "@web/lib/format-time";
import { useBookingWizardContext } from "../use-booking-wizard-context";
import { SlotGrid } from "../components/slot-grid";
import { currencyFormatter } from "@web/lib/money";
import { useKeyedFetch } from "@web/lib/use-keyed-fetch";
import { toggleSlotSelection, totalPriceInCents } from "../lib/slot-selection";

interface Availability {
  slots: AvailabilitySlot[];
  timezone: string;
}

export function ScheduleStep() {
  const { companySlug, state, dispatch } = useBookingWizardContext();
  const room = state.room;

  const [date, setDate] = useState(state.date ?? todayIsoDate());
  const scheduleKey = room ? `${room.id}:${date}` : null;

  const fetchState = useKeyedFetch<Availability>(scheduleKey, (signal) =>
    api
      .get(
        `/public/${companySlug}/rooms/${room!.id}/availability?date=${date}`,
        AvailabilityResponseSchema,
        { signal },
      )
      .then((availability) => ({ slots: availability.slots, timezone: availability.timezone })),
  );

  /**
   * Derivada de `scheduleKey`, não de um efeito: trocar a data zera a seleção sem
   * `setState` síncrono. Enquanto o usuário não clica em nada NESSA passagem pelo
   * passo, a seleção recai no que já estava salvo no wizard (`state.slot`) - é o
   * que preserva o horário escolhido ao clicar "Voltar" a partir do passo 3, em vez
   * de forçar escolher de novo.
   */
  const [selection, setSelection] = useState<{ key: string; slots: AvailabilitySlot[] } | null>(null);
  const selected = useMemo(() => {
    if (selection?.key === scheduleKey) return selection.slots;
    if (fetchState.status !== "ready" || !state.slot || state.date !== date) return [];

    return fetchState.data.slots.filter(
      (candidate) => candidate.startsAt >= state.slot!.startsAt && candidate.startsAt < state.slot!.endsAt,
    );
  }, [selection, scheduleKey, fetchState, state.slot, state.date, date]);

  if (!room) return null;

  const total = totalPriceInCents(selected);

  function toggleSlot(slot: AvailabilitySlot) {
    if (fetchState.status !== "ready" || !scheduleKey) return;
    setSelection({ key: scheduleKey, slots: toggleSlotSelection(fetchState.data.slots, selected, slot) });
  }

  function handleContinue() {
    if (selected.length === 0 || fetchState.status !== "ready") return;

    dispatch({
      type: "SELECT_SLOT",
      date,
      timezone: fetchState.data.timezone,
      slot: {
        startsAt: selected[0]!.startsAt,
        endsAt: selected[selected.length - 1]!.endsAt,
        priceInCents: total,
      },
    });
  }

  return (
    <div>
      <h1 className="text-xl font-semibold">Data e horário</h1>
      <p className="mt-1 text-sm text-muted-foreground">{room.name}</p>

      {state.notice && (
        <p role="alert" className="mt-4 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {state.notice}
        </p>
      )}

      <div className="mt-4 max-w-xs">
        <Label htmlFor="booking-date">Data</Label>
        <Input
          id="booking-date"
          type="date"
          min={todayIsoDate()}
          value={date}
          onChange={(event) => setDate(event.target.value)}
          className="mt-1.5"
        />
      </div>

      {fetchState.status === "loading" && (
        <div className="mt-6 grid grid-cols-3 gap-2 sm:grid-cols-4">
          {Array.from({ length: 8 }, (_, index) => (
            <Skeleton key={index} className="h-14" />
          ))}
        </div>
      )}

      {fetchState.status === "error" && (
        <p role="alert" className="mt-6 text-sm text-destructive">
          Não foi possível carregar a disponibilidade. Tente escolher a data de novo.
        </p>
      )}

      {fetchState.status === "ready" && fetchState.data.slots.length === 0 && (
        <p className="mt-6 text-sm text-muted-foreground">A sala não abre nesse dia.</p>
      )}

      {fetchState.status === "ready" && fetchState.data.slots.length > 0 && (
        <div className="mt-6">
          <SlotGrid
            slots={fetchState.data.slots}
            selected={selected}
            timezone={fetchState.data.timezone}
            onToggle={toggleSlot}
          />
        </div>
      )}

      <div className="mt-8 flex items-center justify-between gap-4">
        <Button variant="outline" onClick={() => dispatch({ type: "BACK" })}>
          Voltar
        </Button>
        <div className="flex items-center gap-4">
          {selected.length > 0 && (
            <span className="text-sm font-medium">Total: {currencyFormatter.format(total / 100)}</span>
          )}
          <Button onClick={handleContinue} disabled={selected.length === 0}>
            Continuar
          </Button>
        </div>
      </div>
    </div>
  );
}
