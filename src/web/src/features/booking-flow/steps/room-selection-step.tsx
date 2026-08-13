import { useMemo, useState } from "react";
import { PublicRoomResponseSchema, type PublicRoomResponse } from "@shared/schemas/room.schema";
import { z } from "zod";
import { Input } from "@web/components/input";
import { Label } from "@web/components/label";
import { Skeleton } from "@web/components/skeleton";
import { api } from "@web/lib/api";
import { useBookingWizardContext } from "../use-booking-wizard-context";
import { RoomCard } from "../components/room-card";
import { useKeyedFetch } from "@web/lib/use-keyed-fetch";

const RoomListSchema = z.array(PublicRoomResponseSchema);

export function RoomSelectionStep() {
  const { companySlug, dispatch } = useBookingWizardContext();
  const [minCapacity, setMinCapacity] = useState("");

  const fetchState = useKeyedFetch<PublicRoomResponse[]>(companySlug, (signal) =>
    api.get(`/public/${companySlug}/rooms`, RoomListSchema, { signal }),
  );

  const filteredRooms = useMemo(() => {
    if (fetchState.status !== "ready") return [];
    const min = Number(minCapacity);
    if (!minCapacity || Number.isNaN(min) || min <= 0) return fetchState.data;
    return fetchState.data.filter((room) => room.capacity >= min);
  }, [fetchState, minCapacity]);

  return (
    <div>
      <h1 className="text-xl font-semibold">Escolha uma sala</h1>
      <div className="mt-4 max-w-xs">
        <Label htmlFor="min-capacity">Capacidade mínima</Label>
        <Input
          id="min-capacity"
          type="number"
          min={1}
          inputMode="numeric"
          placeholder="Qualquer capacidade"
          value={minCapacity}
          onChange={(event) => setMinCapacity(event.target.value)}
          className="mt-1.5"
        />
      </div>

      {fetchState.status === "loading" && (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {[0, 1, 2].map((key) => (
            <Skeleton key={key} className="h-72" />
          ))}
        </div>
      )}

      {fetchState.status === "error" && (
        <p role="alert" className="mt-6 text-sm text-destructive">
          Não foi possível carregar as salas. Recarregue a página para tentar de novo.
        </p>
      )}

      {fetchState.status === "ready" && filteredRooms.length === 0 && (
        <p className="mt-6 text-sm text-muted-foreground">
          Nenhuma sala disponível com esse filtro.
        </p>
      )}

      {fetchState.status === "ready" && filteredRooms.length > 0 && (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {filteredRooms.map((room) => (
            <RoomCard key={room.id} room={room} onSelect={(room) => dispatch({ type: "SELECT_ROOM", room })} />
          ))}
        </div>
      )}
    </div>
  );
}
