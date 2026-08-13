import { z } from "zod";

export const CreateRoomSchema = z.object({
  name: z.string().min(3).max(100),
  description: z.string().optional(),
  capacity: z.number().int().positive(),
  hourlyRateInCents: z.number().int().nonnegative(),
  amenities: z.array(z.string()).default([]),
  photoUrl: z.url().optional(),
});

export type CreateRoomInput = z.infer<typeof CreateRoomSchema>;

/**
 * `amenities` é reescrito sem o `.default([])` herdado de `CreateRoomSchema`.
 *
 * `.partial()` torna o campo opcional, mas não remove o `.default()`: omitir
 * `amenities` de um PATCH continuava resolvendo para `[]` em vez de `undefined`,
 * e `UpdateRoomUseCase` só preserva o valor atual quando o campo chega
 * `undefined` (`if (input.amenities !== undefined) room.changeAmenities(...)`).
 * Na prática, qualquer PATCH parcial que não mencionasse `amenities` - como
 * `{ isActive: false }` ao desativar uma sala - apagava as comodidades da sala
 * em silêncio. Sem `.default()`, omitir o campo vira `undefined` de verdade, e
 * o valor existente sobrevive.
 */
export const UpdateRoomSchema = CreateRoomSchema.partial().extend({
  amenities: z.array(z.string()).optional(),
  isActive: z.boolean().optional(),
});

export type UpdateRoomInput = z.infer<typeof UpdateRoomSchema>;

export const RoomFiltersSchema = z.object({
  minCapacity: z.number().int().positive().optional(),
  isActive: z.boolean().optional(),
});

export type RoomFilters = z.infer<typeof RoomFiltersSchema>;

export const RoomResponseSchema = z.object({
  id: z.uuid(),
  companyId: z.uuid(),
  name: z.string(),
  description: z.string().nullable(),
  capacity: z.number().int().positive(),
  hourlyRateInCents: z.number().int().nonnegative(),
  amenities: z.array(z.string()),
  photoUrl: z.url().nullable(),
  isActive: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type RoomResponse = z.infer<typeof RoomResponseSchema>;

/**
 * Sala exposta no wizard público (`GET /api/v1/public/:companySlug/rooms`).
 *
 * Sem `companyId`, `isActive`, `createdAt` nem `updatedAt`: são campos internos, e a
 * listagem pública já filtra só salas ativas - reafirmar `isActive: true` em toda
 * linha não informa nada a quem consome.
 */
export const PublicRoomResponseSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  description: z.string().nullable(),
  capacity: z.number().int().positive(),
  hourlyRateInCents: z.number().int().nonnegative(),
  amenities: z.array(z.string()),
  photoUrl: z.url().nullable(),
});

export type PublicRoomResponse = z.infer<typeof PublicRoomResponseSchema>;
