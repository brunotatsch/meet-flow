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

export const UpdateRoomSchema = CreateRoomSchema.partial().extend({
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
