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
