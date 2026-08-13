import { useMemo, useState } from "react";
import { z } from "zod";
import { BookingResponseSchema, type BookingResponse } from "@shared/schemas/booking.schema";
import { SessionSchema } from "@shared/schemas/auth.schema";
import { RoomResponseSchema, type RoomResponse } from "@shared/schemas/room.schema";
import { Skeleton } from "@web/components/skeleton";
import { useToast } from "@web/components/toast";
import { api, ApiRequestError } from "@web/lib/api";
import { todayIsoDate } from "@web/lib/format-time";
import { useKeyedFetch } from "@web/lib/use-keyed-fetch";
import { BookingDetailPanel } from "./components/booking-detail-panel";
import { DayNavigator } from "./components/day-navigator";
import { HourAxis } from "./components/hour-axis";
import { RoomColumn } from "./components/room-column";

const RoomListSchema = z.array(RoomResponseSchema);
const BookingListSchema = z.array(BookingResponseSchema);

export function AgendaPage() {
  const { toast } = useToast();
  const [date, setDate] = useState(todayIsoDate());
  const [version, setVersion] = useState(0);
  const [selectedBooking, setSelectedBooking] = useState<BookingResponse | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const sessionState = useKeyedFetch("me", (signal) => api.get("/me", SessionSchema, { signal }));
  const roomsState = useKeyedFetch("rooms", (signal) => api.get("/rooms", RoomListSchema, { signal }));
  const bookingsState = useKeyedFetch(`bookings:${date}:${version}`, (signal) =>
    api.get(`/bookings?date=${date}`, BookingListSchema, { signal }),
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

  const activeRooms = useMemo(
    () => (roomsState.status === "ready" ? roomsState.data.filter((room) => room.isActive) : []),
    [roomsState],
  );

  async function handleCancel(booking: BookingResponse) {
    setCancellingId(booking.id);
    try {
      await api.delete(`/bookings/${booking.id}`, BookingResponseSchema);
      toast({ title: "Reserva cancelada", variant: "success" });
      setSelectedBooking(null);
      setVersion((current) => current + 1);
    } catch (error) {
      toast({
        title: error instanceof ApiRequestError ? error.body.message : "Não foi possível cancelar.",
        variant: "error",
      });
    } finally {
      setCancellingId(null);
    }
  }

  const roomName = (roomId: string): string | undefined =>
    (roomsState.status === "ready" ? roomsState.data : []).find((room) => room.id === roomId)?.name;

  const isLoading = sessionState.status === "loading" || roomsState.status === "loading";
  const hasError = sessionState.status === "error" || roomsState.status === "error";
  const timezone = sessionState.status === "ready" ? sessionState.data.company.timezone : "UTC";

  return (
    <div className="flex h-full flex-col p-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">Agenda</h1>
      </div>

      {sessionState.status === "ready" && (
        <div className="mt-4">
          <DayNavigator date={date} timezone={timezone} onChange={setDate} />
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
              Não foi possível carregar as reservas do dia.
            </p>
          )}

          {bookingsState.status === "ready" && bookingsState.data.length === 0 && (
            <p className="p-4 text-sm text-muted-foreground">Nenhuma reserva neste dia.</p>
          )}

          {bookingsState.status === "ready" && (
            <div className="flex">
              <HourAxis />
              {activeRooms.map((room: RoomResponse) => (
                <RoomColumn
                  key={room.id}
                  room={room}
                  bookings={bookingsByRoom.get(room.id) ?? []}
                  date={date}
                  timezone={timezone}
                  onSelectBooking={setSelectedBooking}
                />
              ))}
            </div>
          )}
        </div>
      )}

      <BookingDetailPanel
        booking={selectedBooking}
        roomName={selectedBooking ? roomName(selectedBooking.roomId) : undefined}
        timezone={timezone}
        onClose={() => setSelectedBooking(null)}
        onCancelBooking={handleCancel}
        cancelling={selectedBooking ? cancellingId === selectedBooking.id : false}
      />
    </div>
  );
}
