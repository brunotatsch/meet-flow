import type { FastifyInstance } from "fastify";
import { env } from "@services/config/env";
import { auth } from "../auth/auth";
import { applyWebHeaders, toWebHeaders } from "./web-headers";

const HANDLED_METHODS = ["GET", "POST"] as const;

/**
 * Monta o handler do Better Auth em `/api/auth/*`.
 *
 * Registre com `app.register(registerAuthHandler, { prefix: "/api/auth" })`. O prefixo
 * precisa bater com o `basePath` do Better Auth (`/api/auth`, o padrão), porque o
 * roteamento interno dele usa o caminho completo da URL.
 *
 * O parser de conteúdo é substituído por um que entrega o corpo cru. O Better Auth
 * recebe uma `Request` da Fetch API e faz a própria desserialização; deixar o Fastify
 * parsear e depois reserializar com `JSON.stringify` mudaria o corpo (ordem de chaves,
 * datas, tipos numéricos) antes da validação dele. Como `register` encapsula, essa
 * troca vale só para as rotas deste plugin.
 */
export async function registerAuthHandler(app: FastifyInstance): Promise<void> {
  app.removeAllContentTypeParsers();
  app.addContentTypeParser("*", { parseAs: "buffer" }, (_request, body, done) => {
    done(null, body);
  });

  app.route({
    method: [...HANDLED_METHODS],
    url: "/*",
    handler: async (request, reply) => {
      /**
       * A origem vem de `BETTER_AUTH_URL`, não do header `Host`: é a mesma base que o
       * Better Auth usa para validar origem e montar links, e confiar no `Host` deixaria
       * um proxy mal configurado reescrever a base da autenticação.
       */
      const url = new URL(request.url, env.BETTER_AUTH_URL);
      const body = Buffer.isBuffer(request.body) && request.body.length > 0 ? request.body : null;

      const response = await auth.handler(
        new Request(url.toString(), {
          method: request.method,
          headers: toWebHeaders(request),
          body,
        }),
      );

      applyWebHeaders(reply, response.headers);

      return reply
        .code(response.status)
        .send(response.body ? Buffer.from(await response.arrayBuffer()) : null);
    },
  });
}
