import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { HttpError, registerErrorHandler } from "@services/http/http-error";

/**
 * Regressão do bug que motivou `HttpError`.
 *
 * Sob o Bun, `reply.sent` continua `false` logo depois de `reply.send()` (ele deriva
 * de `raw.writableEnded`), e é esse sinal que o Fastify checa para decidir se ainda
 * roda o handler da rota. Um `preHandler` async que responde 401 e retorna `reply`
 * responde certo **e mesmo assim executa o handler**, que tenta responder de novo e
 * derruba a requisição com `ERR_HTTP_HEADERS_SENT`. Sob Node isso não acontece, então
 * o problema só aparece no runtime de produção.
 *
 * Lançar o erro não tem essa ambiguidade, e é o contrato que este teste fixa.
 */
describe("interrupção de requisição a partir de um preHandler", () => {
  it("não executa o handler quando o preHandler lança HttpError", async () => {
    const app = Fastify({ logger: false });
    registerErrorHandler(app);
    let handlerRan = false;

    app.get(
      "/protegida",
      {
        preHandler: async () => {
          throw new HttpError(401, "UNAUTHENTICATED", "Sessão ausente ou expirada.");
        },
      },
      async () => {
        handlerRan = true;
        return { ok: true };
      },
    );

    const response = await app.inject({ method: "GET", url: "/protegida" });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({
      code: "UNAUTHENTICATED",
      message: "Sessão ausente ou expirada.",
    });
    expect(handlerRan).toBe(false);

    await app.close();
  });

  it("inclui details quando o erro os carrega", async () => {
    const app = Fastify({ logger: false });
    registerErrorHandler(app);

    app.get("/invalida", async () => {
      throw new HttpError(400, "VALIDATION_ERROR", "Payload inválido.", [{ path: ["slug"] }]);
    });

    const response = await app.inject({ method: "GET", url: "/invalida" });

    expect(response.statusCode).toBe(400);
    expect(response.json().details).toEqual([{ path: ["slug"] }]);
  });

  it("esconde o erro real em uma falha inesperada", async () => {
    const app = Fastify({ logger: false });
    registerErrorHandler(app);

    app.get("/quebrada", async () => {
      throw new Error("senha=hunter2 vazou na mensagem");
    });

    const response = await app.inject({ method: "GET", url: "/quebrada" });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({ code: "INTERNAL_ERROR", message: "Erro interno." });
  });
});
