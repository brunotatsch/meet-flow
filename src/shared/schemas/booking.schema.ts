import { z } from "zod";
import { bookingStatusValues } from "@shared/enums/booking-status";

export const AvailabilityQuerySchema = z.object({
  roomId: z.uuid(),
  date: z.iso.date(),
});

export type AvailabilityQuery = z.infer<typeof AvailabilityQuerySchema>;

/**
 * Slot da grade do passo 2 do fluxo público.
 *
 * `startsAt` e `endsAt` exigem offset explícito: a grade é montada no fuso da
 * empresa, que raramente é o do navegador de quem reserva, e horário local sem fuso
 * cruzando a API é exatamente como se agenda uma sala na hora errada.
 */
export const AvailabilitySlotSchema = z.object({
  startsAt: z.iso.datetime({ offset: true }),
  endsAt: z.iso.datetime({ offset: true }),
  available: z.boolean(),
  priceInCents: z.number().int().nonnegative(),
});

export type AvailabilitySlot = z.infer<typeof AvailabilitySlotSchema>;

export const AvailabilityResponseSchema = z.object({
  roomId: z.uuid(),
  date: z.iso.date(),
  /**
   * Fuso IANA em que a grade foi calculada. Vai junto para o cliente rotular a
   * grade ("horários de Brasília") sem ter que inferir isso do offset, que muda
   * entre dias do mesmo ano.
   */
  timezone: z.string(),
  slots: z.array(AvailabilitySlotSchema),
});

export type AvailabilityResponse = z.infer<typeof AvailabilityResponseSchema>;

/**
 * Forma dos campos do passo 4, sem o `.refine` de `endsAt > startsAt`.
 *
 * Existe separada de `CreateBookingSchema` para o wizard público reaproveitar só
 * o pedaço de um passo por vez - por exemplo `CreateBookingObjectSchema.pick({
 * customerName: true, customerEmail: true, customerPhone: true })` no passo 3 -
 * sem duplicar as regras de validação entre frontend e backend.
 * `ZodEffects` (o tipo de `CreateBookingSchema`, depois do `.refine`) não tem
 * `.pick`, por isso o objeto base precisa existir à parte.
 */
export const CreateBookingObjectSchema = z.object({
  roomId: z.uuid(),
  startsAt: z.iso.datetime({ offset: true }),
  endsAt: z.iso.datetime({ offset: true }),
  customerName: z.string().min(3).max(100),
  customerEmail: z.email(),
  customerPhone: z.string().optional(),
  notes: z.string().optional(),
});

/**
 * Corpo do passo 4 do fluxo público.
 *
 * Não existe campo de preço, e isso é proposital: `z.object` descarta chaves
 * desconhecidas, então um `totalInCents` enviado pelo cliente é silenciosamente
 * removido aqui e o servidor recalcula o valor a partir da tarifa da sala.
 * `companyId` também não aparece - o tenant vem do slug da URL, nunca do corpo.
 */
export const CreateBookingSchema = CreateBookingObjectSchema.refine(
  (data) => new Date(data.endsAt) > new Date(data.startsAt),
  {
    error: "endsAt deve ser posterior a startsAt",
    path: ["endsAt"],
  },
);

export type CreateBookingInput = z.infer<typeof CreateBookingSchema>;

const TimeOfDaySchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "use o formato HH:mm");

/**
 * Reserva criada pelo painel. Horários de parede chegam separados da data para
 * que o servidor os interprete no fuso da empresa autenticada, nunca no fuso do
 * navegador ou do runtime Serverless.
 */
export const AdminCreateBookingSchema = z
  .object({
    roomId: z.uuid(),
    date: z.iso.date(),
    startTime: TimeOfDaySchema,
    endTime: TimeOfDaySchema,
    customerName: z.string().min(3).max(100),
    customerEmail: z.email(),
    customerPhone: z.string().optional(),
    notes: z.string().optional(),
  })
  .refine((data) => data.endTime > data.startTime, {
    error: "endTime deve ser posterior a startTime",
    path: ["endTime"],
  });

export type AdminCreateBookingInput = z.infer<typeof AdminCreateBookingSchema>;

export const RescheduleBookingSchema = z
  .object({
    date: z.iso.date(),
    startTime: TimeOfDaySchema,
    endTime: TimeOfDaySchema,
  })
  .refine((data) => data.endTime > data.startTime, {
    error: "endTime deve ser posterior a startTime",
    path: ["endTime"],
  });

export type RescheduleBookingInput = z.infer<typeof RescheduleBookingSchema>;

export const CheckInBookingSchema = z.object({
  confirmOutsideWindow: z.boolean().optional().default(false),
});

export type CheckInBookingInput = z.infer<typeof CheckInBookingSchema>;

/**
 * Recorte da agenda pedido pelo admin. O período é obrigatório: a listagem alimenta
 * um calendário, que sempre olha um intervalo, e sem corte a resposta cresceria
 * junto com o histórico do tenant.
 */
export const BookingFiltersSchema = z
  .object({
    from: z.iso.datetime({ offset: true }),
    to: z.iso.datetime({ offset: true }),
    roomId: z.uuid().optional(),
  })
  .refine((data) => new Date(data.to) > new Date(data.from), {
    error: "to deve ser posterior a from",
    path: ["to"],
  });

export type BookingFilters = z.infer<typeof BookingFiltersSchema>;

/**
 * Recorte de um dia só, para a agenda diária do admin (MVP-12).
 *
 * Alternativa a `BookingFiltersSchema`: em vez de o cliente calcular `from`/`to`
 * em ISO com offset (o que exigiria saber o fuso da empresa e acertar a virada de
 * horário de verão na mão), ele manda só a data de calendário e o servidor resolve
 * o instante inicial e final usando `zonedTimeToInstant`, a mesma aritmética de
 * fuso que o motor de disponibilidade já usa.
 */
export const DayBookingFiltersSchema = z.object({
  date: z.iso.date(),
  roomId: z.uuid().optional(),
});

export type DayBookingFilters = z.infer<typeof DayBookingFiltersSchema>;

/** Primeiro dia (segunda-feira) da semana exibida na agenda administrativa. */
export const WeekBookingFiltersSchema = z.object({
  weekStart: z.iso.date(),
  roomId: z.uuid().optional(),
});

export type WeekBookingFilters = z.infer<typeof WeekBookingFiltersSchema>;

export const BookingResponseSchema = z.object({
  id: z.uuid(),
  companyId: z.uuid(),
  roomId: z.uuid(),
  customerName: z.string(),
  customerEmail: z.email(),
  customerPhone: z.string().nullable(),
  /**
   * Offset explícito, no fuso da empresa, pela mesma razão dos slots da grade: a
   * confirmação precisa dizer "14:00 na sala", e não a tradução disso para o fuso do
   * navegador de quem reservou. `createdAt` e `updatedAt` seguem em UTC porque são
   * carimbos de auditoria, não horário de parede da sala.
   */
  startsAt: z.iso.datetime({ offset: true }),
  endsAt: z.iso.datetime({ offset: true }),
  status: z.enum(bookingStatusValues),
  totalInCents: z.number().int().nonnegative(),
  notes: z.string().nullable(),
  expiresAt: z.iso.datetime().nullable(),
  stripeCheckoutSessionId: z.string().nullable(),
  checkedInAt: z.iso.datetime().nullable().optional().default(null),
  checkedOutAt: z.iso.datetime().nullable().optional().default(null),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type BookingResponse = z.infer<typeof BookingResponseSchema>;
