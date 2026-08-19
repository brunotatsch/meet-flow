import { Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { z } from "zod";
import { PermissionAction, PermissionResource, can } from "@shared/auth/permissions";
import { SessionSchema } from "@shared/schemas/auth.schema";
import { RoomResponseSchema, type RoomResponse } from "@shared/schemas/room.schema";
import { Button } from "@web/components/button";
import { Input } from "@web/components/input";
import { Skeleton } from "@web/components/skeleton";
import { useToast } from "@web/components/toast";
import { api } from "@web/lib/api";
import { currencyFormatter } from "@web/lib/money";
import { useKeyedFetch } from "@web/lib/use-keyed-fetch";
import { DeactivateRoomDialog } from "./components/deactivate-room-dialog";
import { PublicLinkCard } from "./components/public-link-card";
import { RoomStatusBadge } from "./components/room-status-badge";

const RoomListSchema = z.array(RoomResponseSchema);

export function RoomListPage() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [version, setVersion] = useState(0);
  const [pendingDeactivation, setPendingDeactivation] = useState<RoomResponse | null>(null);
  const [mutatingId, setMutatingId] = useState<string | null>(null);

  const sessionState = useKeyedFetch("me", (signal) => api.get("/me", SessionSchema, { signal }));
  const roomsState = useKeyedFetch(`rooms:${version}`, (signal) =>
    api.get("/rooms", RoomListSchema, { signal }),
  );
  const role = sessionState.status === "ready" ? sessionState.data.role : null;
  const mayCreate = role !== null && can(role, PermissionAction.CREATE, PermissionResource.ROOM);
  const mayUpdate = role !== null && can(role, PermissionAction.UPDATE, PermissionResource.ROOM);
  const mayReadBlocks =
    role !== null && can(role, PermissionAction.READ, PermissionResource.ROOM_BLOCK);

  const filteredRooms = useMemo(() => {
    if (roomsState.status !== "ready") return [];
    const query = search.trim().toLowerCase();
    if (!query) return roomsState.data;
    return roomsState.data.filter((room) => room.name.toLowerCase().includes(query));
  }, [roomsState, search]);

  async function toggleActive(room: RoomResponse) {
    setMutatingId(room.id);
    try {
      await api.patch(`/rooms/${room.id}`, RoomResponseSchema, { isActive: !room.isActive });
      toast({
        title: room.isActive ? "Sala desativada" : "Sala ativada",
        variant: "success",
      });
      setVersion((current) => current + 1);
    } catch {
      toast({ title: "Não foi possível atualizar a sala.", variant: "error" });
    } finally {
      setMutatingId(null);
      setPendingDeactivation(null);
    }
  }

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">Salas</h1>
        {mayCreate && (
          <Button asChild>
            <Link to="/admin/rooms/new">
              <Plus className="h-4 w-4" aria-hidden="true" />
              Nova sala
            </Link>
          </Button>
        )}
      </div>

      {sessionState.status === "ready" && (
        <div className="mt-6">
          <PublicLinkCard companySlug={sessionState.data.company.slug} />
        </div>
      )}

      <div className="relative mt-6 max-w-sm">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Buscar sala por nome"
          className="pl-9"
          aria-label="Buscar sala por nome"
        />
      </div>

      {roomsState.status === "loading" && (
        <div className="mt-6 flex flex-col gap-3">
          {[0, 1, 2].map((key) => (
            <Skeleton key={key} className="h-20" />
          ))}
        </div>
      )}

      {roomsState.status === "error" && (
        <p role="alert" className="mt-6 text-sm text-destructive">
          Não foi possível carregar as salas. Recarregue a página para tentar de novo.
        </p>
      )}

      {roomsState.status === "ready" && roomsState.data.length === 0 && (
        <div className="mt-10 flex flex-col items-center gap-3 text-center">
          <p className="text-sm text-muted-foreground">Você ainda não cadastrou nenhuma sala.</p>
          {mayCreate && (
            <Button asChild>
              <Link to="/admin/rooms/new">Criar a primeira sala</Link>
            </Button>
          )}
        </div>
      )}

      {roomsState.status === "ready" &&
        roomsState.data.length > 0 &&
        filteredRooms.length === 0 && (
          <p className="mt-6 text-sm text-muted-foreground">
            Nenhuma sala encontrada para "{search}".
          </p>
        )}

      {filteredRooms.length > 0 && (
        <ul className="mt-6 flex flex-col gap-3">
          {filteredRooms.map((room) => (
            <li
              key={room.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-4"
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{room.name}</span>
                  <RoomStatusBadge isActive={room.isActive} />
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  Até {room.capacity} pessoas ·{" "}
                  {currencyFormatter.format(room.hourlyRateInCents / 100)}
                  /hora
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" asChild>
                  <Link to={`/admin/rooms/${room.id}/schedule`}>Agenda</Link>
                </Button>
                {mayReadBlocks && (
                  <Button variant="outline" size="sm" asChild>
                    <Link to={`/admin/rooms/${room.id}/blocks`}>Bloqueios</Link>
                  </Button>
                )}
                {mayUpdate && (
                  <Button variant="outline" size="sm" asChild>
                    <Link to={`/admin/rooms/${room.id}/edit`}>Editar</Link>
                  </Button>
                )}
                {mayUpdate &&
                  (room.isActive ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPendingDeactivation(room)}
                      disabled={mutatingId === room.id}
                    >
                      Desativar
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => toggleActive(room)}
                      disabled={mutatingId === room.id}
                    >
                      Ativar
                    </Button>
                  ))}
              </div>
            </li>
          ))}
        </ul>
      )}

      {pendingDeactivation && (
        <DeactivateRoomDialog
          roomName={pendingDeactivation.name}
          open={Boolean(pendingDeactivation)}
          onOpenChange={(open) => !open && setPendingDeactivation(null)}
          onConfirm={() => toggleActive(pendingDeactivation)}
          confirming={mutatingId === pendingDeactivation.id}
        />
      )}
    </div>
  );
}
