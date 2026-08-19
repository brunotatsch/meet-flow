import { createHash, timingSafeEqual } from "node:crypto";
import type { FastifyRequest } from "fastify";
import { HttpError } from "./http-error";

/**
 * Autenticação comum dos jobs disparados por scheduler externo/Supabase Cron.
 * Compara hashes de tamanho fixo para não revelar o segredo por timing.
 */
export function requireCronSecret(request: FastifyRequest, notConfiguredMessage: string): void {
  const configured = process.env.CRON_SECRET;
  if (!configured || configured.length < 32) {
    throw new HttpError(503, "CRON_NOT_CONFIGURED", notConfiguredMessage);
  }

  const authorization = request.headers.authorization ?? "";
  const supplied = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  const expectedDigest = createHash("sha256").update(configured).digest();
  const suppliedDigest = createHash("sha256").update(supplied).digest();

  if (!timingSafeEqual(expectedDigest, suppliedDigest)) {
    throw new HttpError(401, "INVALID_CRON_SECRET", "Credencial do job inválida.");
  }
}
