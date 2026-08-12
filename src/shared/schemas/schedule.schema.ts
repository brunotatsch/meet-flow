import { z } from "zod";
import { weekdayValues } from "@shared/enums/weekday";

const ALLOWED_SLOT_MINUTES = [15, 30, 60, 120] as const;

export const RoomScheduleSchema = z
  .object({
    weekday: z.literal(weekdayValues),
    opensAt: z.iso.time(),
    closesAt: z.iso.time(),
    slotMinutes: z.literal(ALLOWED_SLOT_MINUTES),
  })
  .refine((data) => data.closesAt > data.opensAt, {
    error: "closesAt deve ser maior que opensAt",
    path: ["closesAt"],
  });

export type RoomScheduleInput = z.infer<typeof RoomScheduleSchema>;

/**
 * Semana completa da sala, do jeito que o formulário do admin a edita: um `PUT`
 * com a lista dos dias abertos. Dia ausente é dia fechado, e sala sem nenhuma
 * janela é tratada como indisponível pelo motor de disponibilidade, nunca como
 * aberta 24h.
 */
export const WeekScheduleSchema = z
  .array(RoomScheduleSchema)
  .max(7)
  .refine(
    (schedules) => new Set(schedules.map((schedule) => schedule.weekday)).size === schedules.length,
    { error: "cada dia da semana pode aparecer no máximo uma vez" },
  );

export type WeekScheduleInput = z.infer<typeof WeekScheduleSchema>;

export const RoomScheduleResponseSchema = z.object({
  id: z.uuid(),
  roomId: z.uuid(),
  weekday: z.literal(weekdayValues),
  opensAt: z.iso.time(),
  closesAt: z.iso.time(),
  slotMinutes: z.number().int().positive(),
});

export type RoomScheduleResponse = z.infer<typeof RoomScheduleResponseSchema>;
