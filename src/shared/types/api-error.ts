import { z } from "zod";

export const ApiErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.unknown().optional(),
  /** Identificador opaco para correlacionar a resposta aos logs sem expor internals. */
  requestId: z.string().optional(),
});

export type ApiError = z.infer<typeof ApiErrorSchema>;
