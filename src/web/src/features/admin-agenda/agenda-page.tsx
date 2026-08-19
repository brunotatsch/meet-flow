import { useMemo, useState } from "react";
import { z } from "zod";
import { PermissionAction, PermissionResource, can } from "@shared/auth/permissions";
import { SessionSchema } from "@shared/schemas/auth.schema";
import {
  BookingResponseSchema,
  type AdminCreateBookingInput,
  type BookingResponse,
} from "@shared/schemas/booking.schema";
import {
  RoomBlockCollectionResponseSchema,
  type RoomBlockResponse,
} from "@shared/schemas/room-block.schema";
import { RoomResponseSchema, type RoomResponse } from "@shared/schemas/room.schema";
import { Button } from "@web/components/button";
import { Skeleton } from "@web/components/skeleton";
import { useToast } from "@web/components/toast";
import { api, ApiRequestError } from "@web/lib/api";
import {
  calendarDateStringInZone,
  minutesFromMidnightInZone,
  minutesToTime,
  shiftIsoDate,
  startOfIsoWeek,
  todayIsoDate,
} from "@web/lib/format-time";
import { useKeyedFetch } from "@web/lib/use-keyed-fetch";
import { BookingDetailPanel } from "./components/booking-detail-panel";
import { DayNavigator } from "./components/day-navigator";
import { HourAxis } from "./components/hour-axis";
import { ManualBookingDialog } from "./components/manual-booking-dialog";
import { RoomColumn } from "./components/room-column";
import { WeekView } from "./components/week-view";

const RoomListSchema = z.array(RoomResponseSchema);
const BookingListSchema = z.array(BookingResponseSchema);
type AgendaMode = "day" | "week";

export function AgendaPage() {
  const { toast } = useToast();
  const [date, setDate] = useState(todayIsoDate());
  const [mode, setMode] = useState<AgendaMode>("day");
  const [version, setVersion] = useState(0);
  const [selectedBooking, setSelectedBooking] = useState<BookingResponse | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [operatingId, setOperatingId] = useState<string | null>(null);
  const [manualOpen, setManualOpen] = useState(false);

  const weekStart = startOfIsoWeek(date);
  const sessionState = useKeyedFetch("me", (signal) => api.get("/me", SessionSchema, { signal }));
  const roomsState = useKeyedFetch("rooms", (signal) =>
    api.get("/rooms", RoomListSchema, { signal }),
  );
  const bookingPeriod = mode === "day" ? `date=${date}` : `weekStart=${weekStart}`;
  const bookingsState = useKeyedFetch(`bookings:${bookingPeriod}:${version}`, (signal) =>
    api.get(`/bookings?${bookingPeriod}`, BookingListSchema, { signal }),
  );
  const blockRange = roomBlockQueryRange(mode, date, weekStart);
  const blocksState = useKeyedFetch(`room-blocks:${blockRange}:${version}`, (signal) =>
    api.get(`/room-blocks?${blockRange}`, RoomBlockCollectionResponseSchema, { signal }),
  );

  const bookingsByRoom = useMemo(() => {
    if (bookingsState.status !== "ready") return new Map<string, BookingResponse[]>();

    const grouped = new Map<string, BookingResponse[]>();
    for (const booking of bookingsState.data) {
      const list = grouped.get(booking.roomId) ?? [];
      list.push(booking);
      grouped.set(booking.roomId, list);
    }
    return grouped;
  }, [bookingsState]);

  const blocksByRoom = useMemo(() => {
    if (blocksState.status !== "ready") return new Map<string, RoomBlockResponse[]>();

    const grouped = new Map<string, RoomBlockResponse[]>();
    for (const block of blocksState.data.items) {
      const list = grouped.get(block.roomId) ?? [];
      list.push(block);
      grouped.set(block.roomId, list);
    }
    return grouped;
  }, [blocksState]);

  const activeRooms = useMemo(
    () => (roomsState.status === "ready" ? roomsState.data.filter((room) => room.isActive) : []),
    [roomsState],
  );
  const timezone = sessionState.status === "ready" ? sessionState.data.company.timezone : "UTC";
  const role = sessionState.status === "ready" ? sessionState.data.role : "";
  const canCreate = can(role, PermissionAction.CREATE, PermissionResource.BOOKING);
  const canUpdate = can(role, PermissionAction.UPDATE, PermissionResource.BOOKING);
  const canCancel = can(role, PermissionAction.CANCEL, PermissionResource.BOOKING);

  function refresh(closePanel = true) {
    if (closePanel) setSelectedBooking(null);
    setVersion((current) => current + 1);
  }

  async function handleCancel(booking: BookingResponse) {
    setCancellingId(booking.id);
    try {
      await api.delete(`/bookings/${booking.id}`, BookingResponseSchema);
      toast({ title: "Reserva cancelada", variant: "success" });
      refresh();
    } catch (error) {
      showApiError(error, "Não foi possível cancelar.");
    } finally {
      setCancellingId(null);
    }
  }

  async function handleCreate(input: AdminCreateBookingInput) {
    try {
      await api.post("/bookings", BookingResponseSchema, input);
      toast({ title: "Reserva manual criada", variant: "success" });
      refresh(false);
    } catch (error) {
      showApiError(error, "Não foi possível criar a reserva.");
      throw error;
    }
  }

  async function handleCheckIn(booking: BookingResponse) {
    setOperatingId(booking.id);
    try {
      try {
        await api.post(`/bookings/${booking.id}/check-in`, BookingResponseSchema, {
          confirmOutsideWindow: false,
        });
      } catch (error) {
        if (
          !(error instanceof ApiRequestError) ||
          error.body.code !== "CHECK_IN_OUTSIDE_WINDOW_CONFIRMATION_REQUIRED"
        ) {
          throw error;
        }

        const confirmed = window.confirm(
          "O check-in está fora da janela reservada. Deseja confirmar mesmo assim?",
        );
        if (!confirmed) return;
        await api.post(`/bookings/${booking.id}/check-in`, BookingResponseSchema, {
          confirmOutsideWindow: true,
        });
      }

      toast({ title: "Check-in registrado", variant: "success" });
      refresh();
    } catch (error) {
      showApiError(error, "Não foi possível fazer o check-in.");
    } finally {
      setOperatingId(null);
    }
  }

  async function handleCheckOut(booking: BookingResponse) {
    await runOperation(
      booking,
      "check-out",
      "Check-out registrado",
      "Não foi possível fazer o check-out.",
    );
  }

  async function handleNoShow(booking: BookingResponse) {
    await runOperation(
      booking,
      "no-show",
      "Não comparecimento registrado",
      "Não foi possível marcar o não comparecimento.",
    );
  }

  async function runOperation(
    booking: BookingResponse,
    operation: "check-out" | "no-show",
    successTitle: string,
    fallbackError: string,
  ) {
    setOperatingId(booking.id);
    try {
      await api.post(`/bookings/${booking.id}/${operation}`, BookingResponseSchema);
      toast({ title: successTitle, variant: "success" });
      refresh();
    } catch (error) {
      showApiError(error, fallbackError);
    } finally {
      setOperatingId(null);
    }
  }

  async function handleDropBooking(
    bookingId: string,
    targetRoomId: string,
    targetDate: string,
    startMinutes: number,
  ) {
    if (!canUpdate || bookingsState.status !== "ready") return;
    const booking = bookingsState.data.find((candidate) => candidate.id === bookingId);
    if (!booking) return;
    if (booking.roomId !== targetRoomId) {
      toast({ title: "Arraste a reserva dentro da mesma sala.", variant: "error" });
      return;
    }

    const durationMinutes = Math.round(
      (new Date(booking.endsAt).getTime() - new Date(booking.startsAt).getTime()) / 60_000,
    );
    const endMinutes = startMinutes + durationMinutes;
    if (endMinutes >= 24 * 60) {
      toast({ title: "A reserva não pode ultrapassar o fim do dia.", variant: "error" });
      return;
    }

    const startTime = minutesToTime(startMinutes);
    const endTime = minutesToTime(endMinutes);
    const samePosition =
      calendarDateStringInZone(booking.startsAt, timezone) === targetDate &&
      minutesFromMidnightInZone(booking.startsAt, timezone) === startMinutes;
    if (samePosition) return;

    if (!window.confirm(`Remarcar para ${targetDate}, das ${startTime} às ${endTime}?`)) return;

    setOperatingId(booking.id);
    try {
      await api.patch(`/bookings/${booking.id}/reschedule`, BookingResponseSchema, {
        date: targetDate,
        startTime,
        endTime,
      });
      toast({ title: "Reserva remarcada", variant: "success" });
      refresh();
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 409) {
        toast({ title: "O novo horário já está ocupado.", variant: "error" });
        refresh(false);
      } else {
        showApiError(error, "Não foi possível remarcar a reserva.");
      }
    } finally {
      setOperatingId(null);
    }
  }

  const roomName = (roomId: string): string | undefined =>
    (roomsState.status === "ready" ? roomsState.data : []).find((room) => room.id === roomId)?.name;
  const isLoading = sessionState.status === "loading" || roomsState.status === "loading";
  const hasError = sessionState.status === "error" || roomsState.status === "error";

  function showApiError(error: unknown, fallback: string) {
    toast({
      title: error instanceof ApiRequestError ? error.body.message : fallback,
      variant: "error",
    });
  }

  return (
    <div className="flex h-full flex-col p-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">Agenda</h1>
        {canCreate && activeRooms.length > 0 && (
          <Button onClick={() => setManualOpen(true)}>Nova reserva manual</Button>
        )}
      </div>

      {sessionState.status === "ready" && (
        <div className="mt-4">
          <DayNavigator
            date={date}
            timezone={timezone}
            mode={mode}
            onChange={setDate}
            onModeChange={setMode}
          />
        </div>
      )}

      {isLoading && (
        <div className="mt-6 flex gap-4">
          {[0, 1, 2].map((key) => (
            <Skeleton key={key} className="h-96 w-56" />
          ))}
        </div>
      )}

      {hasError && (
        <p role="alert" className="mt-6 text-sm text-destructive">
          Não foi possível carregar a agenda. Recarregue a página para tentar de novo.
        </p>
      )}

      {!isLoading && !hasError && activeRooms.length === 0 && (
        <p className="mt-6 text-sm text-muted-foreground">
          Nenhuma sala ativa. Cadastre uma sala para ver a agenda.
        </p>
      )}

      {!isLoading && !hasError && activeRooms.length > 0 && (
        <div className="relative mt-4 flex-1 overflow-auto rounded-lg border border-border">
          {bookingsState.status === "loading" && (
            <div className="p-4">
              <Skeleton className="h-96 w-full" />
            </div>
          )}
          {bookingsState.status === "error" && (
            <p role="alert" className="p-4 text-sm text-destructive">
              Não foi possível carregar as reservas do período.
            </p>
          )}
          {blocksState.status === "error" && (
            <p role="alert" className="p-4 text-sm text-amber-700 dark:text-amber-300">
              As reservas foram carregadas, mas não foi possível carregar os bloqueios de sala.
            </p>
          )}
          {bookingsState.status === "ready" &&
            bookingsState.data.length === 0 &&
            (blocksState.status !== "ready" || blocksState.data.items.length === 0) && (
              <p className="p-4 text-sm text-muted-foreground">
                {mode === "day" ? "Nenhuma reserva neste dia." : "Nenhuma reserva nesta semana."}
              </p>
            )}

          {bookingsState.status === "ready" && mode === "day" && (
            <div className="flex">
              <HourAxis />
              {activeRooms.map((room: RoomResponse) => (
                <RoomColumn
                  key={room.id}
                  room={room}
                  bookings={bookingsByRoom.get(room.id) ?? []}
                  blocks={blocksByRoom.get(room.id) ?? []}
                  date={date}
                  timezone={timezone}
                  canReschedule={canUpdate}
                  onSelectBooking={setSelectedBooking}
                  onDropBooking={handleDropBooking}
                />
              ))}
            </div>
          )}
          {bookingsState.status === "ready" && mode === "week" && (
            <WeekView
              rooms={activeRooms}
              bookings={bookingsState.data}
              blocks={blocksState.status === "ready" ? blocksState.data.items : []}
              weekStart={weekStart}
              timezone={timezone}
              canReschedule={canUpdate}
              onSelectBooking={setSelectedBooking}
              onDropBooking={handleDropBooking}
            />
          )}
        </div>
      )}

      <BookingDetailPanel
        booking={selectedBooking}
        roomName={selectedBooking ? roomName(selectedBooking.roomId) : undefined}
        timezone={timezone}
        canUpdate={canUpdate}
        canCancel={canCancel}
        onClose={() => setSelectedBooking(null)}
        onCancelBooking={handleCancel}
        onCheckIn={handleCheckIn}
        onCheckOut={handleCheckOut}
        onNoShow={handleNoShow}
        cancelling={selectedBooking ? cancellingId === selectedBooking.id : false}
        operating={selectedBooking ? operatingId === selectedBooking.id : false}
      />

      <ManualBookingDialog
        open={manualOpen}
        date={mode === "week" ? weekStart : date}
        rooms={activeRooms}
        onOpenChange={setManualOpen}
        onCreate={handleCreate}
      />
    </div>
  );
}

/**
 * Consulta com um dia de margem em cada lado. A margem cobre todos os offsets
 * IANA sem converter meia-noite civil no browser e os componentes filtram pelo
 * dia da empresa. Isso evita perder um bloqueio que cruza a meia-noite/DST.
 */
function roomBlockQueryRange(mode: AgendaMode, date: string, weekStart: string): string {
  const firstDay = mode === "week" ? weekStart : date;
  const lastExclusive = shiftIsoDate(firstDay, mode === "week" ? 7 : 1);
  return new URLSearchParams({
    from: new Date(`${shiftIsoDate(firstDay, -1)}T00:00:00Z`).toISOString(),
    to: new Date(`${shiftIsoDate(lastExclusive, 1)}T00:00:00Z`).toISOString(),
  }).toString();
}
