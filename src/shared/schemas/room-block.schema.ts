import { z } from "zod";

const TimeOfDaySchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "use o formato HH:mm");

export const RoomBlockRecurrenceFrequency = {
  DAILY: "daily",
  WEEKLY: "weekly",
} as const;

export const RoomBlockRecurrenceSchema = z.object({
  frequency: z.enum(RoomBlockRecurrenceFrequency),
  /** Última data que pode iniciar uma ocorrência, inclusive. */
  until: z.iso.date(),
});

export const CreateRoomBlockSchema = z
  .object({
    roomId: z.uuid(),
    /** Data e horários de parede; o backend aplica o fuso IANA da empresa. */
    date: z.iso.date(),
    startTime: TimeOfDaySchema,
    endTime: TimeOfDaySchema,
    reason: z.string().trim().min(1).max(500),
    recurrence: RoomBlockRecurrenceSchema.optional(),
  })
  .superRefine((input, context) => {
    if (input.endTime <= input.startTime) {
      context.addIssue({
        code: "custom",
        message: "endTime deve ser posterior a startTime",
        path: ["endTime"],
      });
    }

    if (input.recurrence && input.recurrence.until < input.date) {
      context.addIssue({
        code: "custom",
        message: "until não pode ser anterior à primeira ocorrência",
        path: ["recurrence", "until"],
      });
    }
  });

export type CreateRoomBlockInput = z.infer<typeof CreateRoomBlockSchema>;

export const RoomBlockFiltersSchema = z
  .object({
    from: z.iso.datetime({ offset: true }),
    to: z.iso.datetime({ offset: true }),
    roomId: z.uuid().optional(),
  })
  .refine((input) => new Date(input.to) > new Date(input.from), {
    error: "to deve ser posterior a from",
    path: ["to"],
  });

export type RoomBlockFilters = z.infer<typeof RoomBlockFiltersSchema>;

export const DeleteRoomBlockQuerySchema = z.object({
  scope: z.enum(["occurrence", "series"]).optional().default("occurrence"),
});

export const RoomBlockResponseSchema = z.object({
  id: z.uuid(),
  companyId: z.uuid(),
  roomId: z.uuid(),
  startsAt: z.iso.datetime({ offset: true }),
  endsAt: z.iso.datetime({ offset: true }),
  reason: z.string(),
  createdBy: z.string(),
  recurrenceGroupId: z.uuid().nullable(),
  createdAt: z.iso.datetime(),
});

export type RoomBlockResponse = z.infer<typeof RoomBlockResponseSchema>;

export const RoomBlockCollectionResponseSchema = z.object({
  timezone: z.string(),
  items: z.array(RoomBlockResponseSchema),
});

export type RoomBlockCollectionResponse = z.infer<typeof RoomBlockCollectionResponseSchema>;
