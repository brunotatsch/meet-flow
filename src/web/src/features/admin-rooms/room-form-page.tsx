import { useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  CreateRoomSchema,
  RoomResponseSchema,
  UpdateRoomSchema,
  type RoomResponse,
} from "@shared/schemas/room.schema";
import { Button } from "@web/components/button";
import { Input } from "@web/components/input";
import { Label } from "@web/components/label";
import { LoadingScreen } from "@web/components/loading-screen";
import { Textarea } from "@web/components/textarea";
import { useToast } from "@web/components/toast";
import { api, ApiRequestError } from "@web/lib/api";
import { centsToReaisInput, reaisToCents } from "@web/lib/money";
import { useKeyedFetch } from "@web/lib/use-keyed-fetch";

type FieldErrors = Partial<Record<"name" | "capacity" | "hourlyRate" | "photoUrl", string>>;

function amenitiesToText(amenities: string[]): string {
  return amenities.join(", ");
}

function textToAmenities(text: string): string[] {
  return text
    .split(",")
    .map((amenity) => amenity.trim())
    .filter((amenity) => amenity.length > 0);
}

export function RoomFormPage() {
  const { id } = useParams<{ id?: string }>();
  const isEditing = Boolean(id);
  const navigate = useNavigate();
  const { toast } = useToast();

  const existingRoomState = useKeyedFetch<RoomResponse>(
    isEditing ? id! : null,
    (signal) => api.get(`/rooms/${id}`, RoomResponseSchema, { signal }),
  );

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [capacity, setCapacity] = useState("");
  const [hourlyRate, setHourlyRate] = useState("");
  const [amenitiesText, setAmenitiesText] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [hydratedFrom, setHydratedFrom] = useState<string | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);

  /**
   * Popula os campos a partir da sala existente uma única vez, quando ela chega -
   * não é um `setState` de efeito repetido a cada render: `hydratedFrom` marca que
   * essa sala específica já preencheu o formulário, então digitar depois não é
   * sobrescrito pela mesma resposta de novo.
   */
  if (existingRoomState.status === "ready" && hydratedFrom !== existingRoomState.data.id) {
    const room = existingRoomState.data;
    setName(room.name);
    setDescription(room.description ?? "");
    setCapacity(String(room.capacity));
    setHourlyRate(centsToReaisInput(room.hourlyRateInCents));
    setAmenitiesText(amenitiesToText(room.amenities));
    setPhotoUrl(room.photoUrl ?? "");
    setHydratedFrom(room.id);
  }

  if (isEditing && existingRoomState.status === "loading") {
    return <LoadingScreen label="Carregando sala..." />;
  }

  if (isEditing && existingRoomState.status === "error") {
    return (
      <div className="p-6">
        <p role="alert" className="text-sm text-destructive">
          Não foi possível carregar esta sala.
        </p>
      </div>
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    /**
     * `undefined` na criação (`CreateRoomSchema` não aceita `null` nesses dois
     * campos), `null` na edição: é o que faz limpar a Descrição ou a URL da foto
     * de uma sala existente e salvar realmente apagar o valor no servidor, em vez
     * de `undefined` ser descartado do corpo do PATCH pelo `JSON.stringify` e o
     * valor antigo sobreviver em silêncio.
     */
    const payload = {
      name,
      description: description || (isEditing ? null : undefined),
      capacity: Number(capacity),
      hourlyRateInCents: reaisToCents(hourlyRate),
      amenities: textToAmenities(amenitiesText),
      photoUrl: photoUrl || (isEditing ? null : undefined),
    };

    const parsed = isEditing
      ? UpdateRoomSchema.safeParse(payload)
      : CreateRoomSchema.safeParse(payload);
    if (!parsed.success) {
      const nextErrors: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (field === "name") nextErrors.name ??= issue.message;
        else if (field === "capacity") nextErrors.capacity ??= issue.message;
        else if (field === "hourlyRateInCents") nextErrors.hourlyRate ??= issue.message;
        else if (field === "photoUrl") nextErrors.photoUrl ??= "URL da foto inválida.";
      }
      setErrors(nextErrors);
      return;
    }

    setErrors({});
    setSubmitting(true);

    try {
      if (isEditing) {
        await api.patch(`/rooms/${id}`, RoomResponseSchema, parsed.data);
      } else {
        await api.post("/rooms", RoomResponseSchema, parsed.data);
      }

      toast({ title: isEditing ? "Sala atualizada" : "Sala criada", variant: "success" });
      navigate("/admin", { replace: true });
    } catch (error) {
      setSubmitting(false);

      if (error instanceof ApiRequestError && error.status === 409) {
        setErrors({ name: error.body.message });
        return;
      }

      toast({
        title: error instanceof ApiRequestError ? error.body.message : "Não foi possível salvar a sala.",
        variant: "error",
      });
    }
  }

  return (
    <div className="mx-auto max-w-xl p-6">
      <h1 className="text-xl font-semibold">{isEditing ? "Editar sala" : "Nova sala"}</h1>

      <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4" noValidate>
        <div>
          <Label htmlFor="room-name">Nome</Label>
          <Input
            id="room-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            invalid={Boolean(errors.name)}
            className="mt-1.5"
          />
          {errors.name && (
            <p role="alert" className="mt-1 text-sm text-destructive">
              {errors.name}
            </p>
          )}
        </div>

        <div>
          <Label htmlFor="room-description">Descrição</Label>
          <Textarea
            id="room-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            className="mt-1.5"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="room-capacity">Capacidade</Label>
            <Input
              id="room-capacity"
              type="number"
              min={1}
              step={1}
              value={capacity}
              onChange={(event) => setCapacity(event.target.value)}
              invalid={Boolean(errors.capacity)}
              className="mt-1.5"
            />
            {errors.capacity && (
              <p role="alert" className="mt-1 text-sm text-destructive">
                {errors.capacity}
              </p>
            )}
          </div>

          <div>
            <Label htmlFor="room-hourly-rate">Valor por hora (R$)</Label>
            <Input
              id="room-hourly-rate"
              type="number"
              min={0}
              step={0.01}
              inputMode="decimal"
              value={hourlyRate}
              onChange={(event) => setHourlyRate(event.target.value)}
              invalid={Boolean(errors.hourlyRate)}
              className="mt-1.5"
            />
            {errors.hourlyRate && (
              <p role="alert" className="mt-1 text-sm text-destructive">
                {errors.hourlyRate}
              </p>
            )}
          </div>
        </div>

        <div>
          <Label htmlFor="room-amenities">Comodidades</Label>
          <Input
            id="room-amenities"
            value={amenitiesText}
            onChange={(event) => setAmenitiesText(event.target.value)}
            placeholder="projetor, wifi, ar-condicionado"
            className="mt-1.5"
          />
          <p className="mt-1 text-xs text-muted-foreground">Separadas por vírgula.</p>
        </div>

        <div>
          <Label htmlFor="room-photo-url">URL da foto</Label>
          <Input
            id="room-photo-url"
            type="url"
            value={photoUrl}
            onChange={(event) => setPhotoUrl(event.target.value)}
            invalid={Boolean(errors.photoUrl)}
            placeholder="https://..."
            className="mt-1.5"
          />
          {errors.photoUrl && (
            <p role="alert" className="mt-1 text-sm text-destructive">
              {errors.photoUrl}
            </p>
          )}
        </div>

        <div className="mt-2 flex items-center justify-between gap-4">
          <Button type="button" variant="outline" onClick={() => navigate("/admin")}>
            Cancelar
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Salvando..." : "Salvar"}
          </Button>
        </div>
      </form>
    </div>
  );
}
