import type { FastifyRequest } from "fastify";
import {
  can,
  type PermissionAction,
  type PermissionResource,
} from "@shared/auth/permissions";
import { HttpError } from "@services/http/http-error";
import { getRequestAuth } from "./require-auth";

/**
 * Autorização de rota executada depois de `requireAuth`.
 *
 * O tenant e o papel vêm da sessão persistida; nenhum header ou campo do body
 * participa da decisão. Papéis desconhecidos são negados pelo helper compartilhado.
 */
export function requirePermission(action: PermissionAction, resource: PermissionResource) {
  return async function authorize(request: FastifyRequest): Promise<void> {
    const { role } = getRequestAuth(request);

    if (!can(role, action, resource)) {
      throw new HttpError(403, "FORBIDDEN", "Você não tem permissão para esta ação.");
    }
  };
}
