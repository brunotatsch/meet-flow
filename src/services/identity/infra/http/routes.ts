import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { Session } from "@shared/schemas/auth.schema";
import { SignUpSchema } from "@shared/schemas/company.schema";
import { companies } from "@services/companies/infra/database/schema/companies";
import { db } from "@services/database/client";
import { HttpError } from "@services/http/http-error";
import { SignUpConflictError, signUp } from "../auth/sign-up";
import { user } from "../database/schema/auth";
import { getRequestAuth, requireAuth } from "./require-auth";
import { applyWebHeaders, toWebHeaders } from "./web-headers";
import { registerTeamRoutes } from "./team.routes";

export async function registerIdentityRoutes(app: FastifyInstance): Promise<void> {
  await app.register(registerTeamRoutes);

  app.post("/sign-up", async (request, reply) => {
    const parsed = SignUpSchema.safeParse(request.body);

    if (!parsed.success) {
      throw new HttpError(
        400,
        "VALIDATION_ERROR",
        "Payload de cadastro inválido.",
        parsed.error.issues,
      );
    }

    try {
      const { session, headers } = await signUp(parsed.data, toWebHeaders(request));

      applyWebHeaders(reply, headers);

      return reply.code(201).send(session);
    } catch (error) {
      if (error instanceof SignUpConflictError) {
        throw new HttpError(409, error.code, error.message);
      }

      throw error;
    }
  });

  app.get("/me", { preHandler: requireAuth }, async (request, reply) => {
    const auth = getRequestAuth(request);

    const [[currentUser], [company]] = await Promise.all([
      db
        .select({ id: user.id, name: user.name, email: user.email })
        .from(user)
        .where(eq(user.id, auth.userId))
        .limit(1),
      db
        .select({
          id: companies.id,
          name: companies.name,
          slug: companies.slug,
          type: companies.type,
          timezone: companies.timezone,
        })
        .from(companies)
        .where(eq(companies.id, auth.companyId))
        .limit(1),
    ]);

    /**
     * `requireAuth` acabou de provar que as duas linhas existem; sumirem aqui só
     * acontece se a conta for excluída no meio da requisição.
     */
    if (!currentUser || !company) {
      throw new HttpError(401, "UNAUTHENTICATED", "Sessão ausente ou expirada.");
    }

    return reply.send({ user: currentUser, company, role: auth.role } satisfies Session);
  });
}
