import type { FastifyInstance } from "fastify";
import { describe, expect, it } from "vitest";
import { buildServer } from "@services/http/server";

/**
 * Limites minúsculos, só para este arquivo: os padrões de produção
 * (`defaultPublicRateLimitConfig` em `@services/http/routes/public`) são altos de
 * propósito, para não estourar sob o volume legítimo das outras suítes e2e. Aqui o
 * teste monta seu próprio servidor, com sua própria config, só para provar que o
 * 429 e o `Retry-After` funcionam.
 *
 * As chamadas são sequenciais, não `Promise.all`: o contador do
 * `@fastify/rate-limit` incrementa corretamente sob concorrência real, mas
 * `light-my-request` não garante que os `N` `inject()` concorrentes cheguem ao
 * `onRequest` na mesma ordem em que a asserção lê as respostas, o que tornaria a
 * contagem de 429 por resposta não determinística. Sequencial é o jeito de provar
 * o limiar sem depender de ordem de entrega.
 */
describe("rate limit da API pública", () => {
  it("libera até o limite geral e devolve 429 com Retry-After a partir daí", async () => {
    const app: FastifyInstance = buildServer({
      api: {
        publicRateLimit: {
          general: { max: 3, timeWindow: "1 minute" },
          booking: { max: 80, timeWindow: "1 minute" },
        },
      },
    });
    await app.ready();

    try {
      const statuses: number[] = [];

      for (let attempt = 0; attempt < 5; attempt += 1) {
        const response = await app.inject({
          method: "GET",
          url: "/api/v1/public/qualquer-empresa",
        });
        statuses.push(response.statusCode);

        if (response.statusCode === 429) {
          expect(response.json()).toMatchObject({ code: "RATE_LIMITED" });
          expect(response.headers["retry-after"]).toBeDefined();
        }
      }

      expect(statuses).toEqual([404, 404, 404, 429, 429]);
    } finally {
      await app.close();
    }
  });

  it("aplica em POST /bookings um limite independente e mais rígido que o geral", async () => {
    const app: FastifyInstance = buildServer({
      api: {
        publicRateLimit: {
          general: { max: 80, timeWindow: "1 minute" },
          booking: { max: 2, timeWindow: "1 minute" },
        },
      },
    });
    await app.ready();

    try {
      const bookingStatuses: number[] = [];

      for (let attempt = 0; attempt < 4; attempt += 1) {
        const response = await app.inject({
          method: "POST",
          url: "/api/v1/public/qualquer-empresa/bookings",
          payload: {},
        });
        bookingStatuses.push(response.statusCode);

        if (response.statusCode === 429) {
          expect(response.json()).toMatchObject({ code: "RATE_LIMITED" });
          expect(response.headers["retry-after"]).toBeDefined();
        }
      }

      expect(bookingStatuses).toEqual([404, 404, 429, 429]);

      /**
       * O contador de `POST /bookings` é próprio (`config.rateLimit` na rota), não o
       * geral do escopo: estourá-lo não consome o limite de leitura.
       */
      const stillFree = await app.inject({
        method: "GET",
        url: "/api/v1/public/qualquer-empresa",
      });

      expect(stillFree.statusCode).not.toBe(429);
    } finally {
      await app.close();
    }
  });
});
