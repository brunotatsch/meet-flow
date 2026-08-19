import { CalendarOff, Plus, Trash2 } from "lucide-react";
import { type FormEvent, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { z } from "zod";
import { PermissionAction, PermissionResource, can } from "@shared/auth/permissions";
import { SessionSchema } from "@shared/schemas/auth.schema";
import {
  RoomBlockCollectionResponseSchema,
  type RoomBlockResponse,
} from "@shared/schemas/room-block.schema";
import { RoomResponseSchema } from "@shared/schemas/room.schema";
import { Button } from "@web/components/button";
import { Input } from "@web/components/input";
import { Skeleton } from "@web/components/skeleton";
import { Textarea } from "@web/components/textarea";
import { useToast } from "@web/components/toast";
import { ApiRequestError, api } from "@web/lib/api";
import { useKeyedFetch } from "@web/lib/use-keyed-fetch";

const EmptyResponseSchema = z.null();
const DAY_IN_MS = 86_400_000;

type Recurrence = "none" | "daily" | "weekly";

export function RoomBlocksPage() {
  const { id: roomId = "" } = useParams<{ id: string }>();
  const { toast } = useToast();
  const [version, setVersion] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [date, setDate] = useState(today);
  const [startTime, setStartTime] = useState("12:00");
  const [endTime, setEndTime] = useState("13:00");
  const [reason, setReason] = useState("");
  const [recurrence, setRecurrence] = useState<Recurrence>("none");
  const [until, setUntil] = useState(today);

  const roomState = useKeyedFetch(`room:${roomId}`, (signal) =>
    api.get(`/rooms/${roomId}`, RoomResponseSchema, { signal }),
  );
  const sessionState = useKeyedFetch("me", (signal) => api.get("/me", SessionSchema, { signal }));
  const [range] = useState(() => {
    const now = Date.now();
    return {
      from: new Date(now - 30 * DAY_IN_MS).toISOString(),
      to: new Date(now + 366 * DAY_IN_MS).toISOString(),
    };
  });
  const blocksState = useKeyedFetch(`room-blocks:${roomId}:${version}`, (signal) => {
    const query = new URLSearchParams({ ...range, roomId });
    return api.get(`/room-blocks?${query}`, RoomBlockCollectionResponseSchema, { signal });
  });

  const role = sessionState.status === "ready" ? sessionState.data.role : null;
  const mayCreate =
    role !== null && can(role, PermissionAction.CREATE, PermissionResource.ROOM_BLOCK);
  const mayDelete =
    role !== null && can(role, PermissionAction.DELETE, PermissionResource.ROOM_BLOCK);

  async function createBlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);

    try {
      const body = {
        roomId,
        date,
        startTime,
        endTime,
        reason,
        ...(recurrence === "none" ? {} : { recurrence: { frequency: recurrence, until } }),
      };
      const created = await api.post("/room-blocks", RoomBlockCollectionResponseSchema, body);
      toast({
        title: created.items.length > 1 ? "Série de bloqueios criada" : "Bloqueio criado",
        description: `${created.items.length} ocorrência(s) adicionada(s).`,
        variant: "success",
      });
      setReason("");
      setVersion((current) => current + 1);
    } catch (error) {
      toast({
        title:
          error instanceof ApiRequestError && error.status === 409
            ? "Horário ocupado"
            : "Falha ao criar bloqueio",
        description: error instanceof Error ? error.message : undefined,
        variant: "error",
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function removeBlock(block: RoomBlockResponse, scope: "occurrence" | "series") {
    setDeletingId(block.id);
    try {
      await api.delete(`/room-blocks/${block.id}?scope=${scope}`, EmptyResponseSchema);
      toast({
        title: scope === "series" ? "Série removida" : "Bloqueio removido",
        variant: "success",
      });
      setVersion((current) => current + 1);
    } catch (error) {
      toast({
        title: "Falha ao remover bloqueio",
        description: error instanceof Error ? error.message : undefined,
        variant: "error",
      });
    } finally {
      setDeletingId(null);
    }
  }

  if (roomState.status === "loading" || sessionState.status === "loading") {
    return <Skeleton className="mx-auto mt-8 h-96 max-w-4xl" />;
  }

  if (roomState.status === "error" || sessionState.status === "error") {
    return (
      <p role="alert" className="p-6 text-sm text-destructive">
        Não foi possível carregar a sala e suas permissões.
      </p>
    );
  }

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Bloqueios de {roomState.data.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manutenções, eventos internos e pausas recorrentes deixam de aparecer como horários
            livres.
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link to="/admin/rooms">Voltar às salas</Link>
        </Button>
      </div>

      {mayCreate && (
        <form onSubmit={createBlock} className="mt-6 rounded-lg border border-border p-4">
          <h2 className="flex items-center gap-2 font-medium">
            <Plus className="h-4 w-4" aria-hidden="true" /> Novo bloqueio
          </h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <label htmlFor="room-block-date" className="text-sm font-medium">
              Data
              <Input
                id="room-block-date"
                className="mt-1"
                type="date"
                value={date}
                onChange={(event) => {
                  setDate(event.target.value);
                  if (until < event.target.value) setUntil(event.target.value);
                }}
                required
              />
            </label>
            <label htmlFor="room-block-start-time" className="text-sm font-medium">
              Início
              <Input
                id="room-block-start-time"
                className="mt-1"
                type="time"
                value={startTime}
                onChange={(event) => setStartTime(event.target.value)}
                required
              />
            </label>
            <label htmlFor="room-block-end-time" className="text-sm font-medium">
              Fim
              <Input
                id="room-block-end-time"
                className="mt-1"
                type="time"
                value={endTime}
                onChange={(event) => setEndTime(event.target.value)}
                required
              />
            </label>
          </div>
          <label htmlFor="room-block-reason" className="mt-4 block text-sm font-medium">
            Motivo
            <Textarea
              id="room-block-reason"
              className="mt-1"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              maxLength={500}
              required
            />
          </label>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label htmlFor="room-block-recurrence" className="text-sm font-medium">
              Repetição
              <select
                id="room-block-recurrence"
                className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={recurrence}
                onChange={(event) => setRecurrence(event.target.value as Recurrence)}
              >
                <option value="none">Não repetir</option>
                <option value="daily">Todos os dias</option>
                <option value="weekly">Toda semana</option>
              </select>
            </label>
            {recurrence !== "none" && (
              <label htmlFor="room-block-until" className="text-sm font-medium">
                Repetir até
                <Input
                  id="room-block-until"
                  className="mt-1"
                  type="date"
                  min={date}
                  value={until}
                  onChange={(event) => setUntil(event.target.value)}
                  required
                />
              </label>
            )}
          </div>
          <Button className="mt-4" type="submit" disabled={submitting}>
            {submitting ? "Criando..." : "Criar bloqueio"}
          </Button>
        </form>
      )}

      <section className="mt-8" aria-labelledby="existing-blocks-title">
        <h2 id="existing-blocks-title" className="font-medium">
          Bloqueios cadastrados
        </h2>
        {blocksState.status === "loading" && <Skeleton className="mt-3 h-32" />}
        {blocksState.status === "error" && (
          <p role="alert" className="mt-3 text-sm text-destructive">
            Não foi possível carregar os bloqueios.
          </p>
        )}
        {blocksState.status === "ready" && blocksState.data.items.length === 0 && (
          <p className="mt-3 text-sm text-muted-foreground">
            Nenhum bloqueio no período consultado.
          </p>
        )}
        {blocksState.status === "ready" && blocksState.data.items.length > 0 && (
          <ul className="mt-3 space-y-3">
            {blocksState.data.items.map((block) => (
              <li
                key={block.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100"
              >
                <div>
                  <p className="flex items-center gap-2 font-medium">
                    <CalendarOff className="h-4 w-4" aria-hidden="true" /> {block.reason}
                  </p>
                  <p className="mt-1 text-sm">{formatPeriod(block, blocksState.data.timezone)}</p>
                  {block.recurrenceGroupId && (
                    <p className="mt-1 text-xs">Ocorrência de uma série recorrente</p>
                  )}
                </div>
                {mayDelete && (
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => removeBlock(block, "occurrence")}
                      disabled={deletingId === block.id}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" /> Remover
                    </Button>
                    {block.recurrenceGroupId && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => removeBlock(block, "series")}
                        disabled={deletingId === block.id}
                      >
                        Remover série
                      </Button>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function formatPeriod(block: RoomBlockResponse, timezone: string): string {
  const formatter = new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: timezone,
  });
  return `${formatter.format(new Date(block.startsAt))} – ${formatter.format(new Date(block.endsAt))}`;
}
