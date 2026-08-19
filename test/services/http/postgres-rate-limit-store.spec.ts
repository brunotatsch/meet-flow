import { createHash } from "node:crypto";
import type { RouteOptions } from "fastify";
import { describe, expect, it, vi } from "vitest";
import {
  createPostgresRateLimitStore,
  type RateLimitCounter,
} from "@services/http/rate-limit/postgres-rate-limit-store";

describe("PostgresRateLimitStore", () => {
  it("persiste apenas o hash da chave e preserva TTL/contagem", async () => {
    const counter: RateLimitCounter = {
      increment: vi.fn().mockResolvedValue({ current: 3, ttl: 42_000 }),
    };
    const Store = createPostgresRateLimitStore("public", counter);
    const store = new Store({});

    const result = await increment(store, "203.0.113.42", 60_000, 10);

    expect(result).toEqual({ current: 3, ttl: 42_000 });
    expect(counter.increment).toHaveBeenCalledWith(
      "public:all:global",
      createHash("sha256").update("203.0.113.42").digest("hex"),
      60_000,
    );
    expect(JSON.stringify(vi.mocked(counter.increment).mock.calls)).not.toContain("203.0.113.42");
  });

  it("isola o contador filho pelo método e template da rota", async () => {
    const counter: RateLimitCounter = {
      increment: vi.fn().mockResolvedValue({ current: 1, ttl: 60_000 }),
    };
    const Store = createPostgresRateLimitStore("public", counter);
    const store = new Store({});
    const child = store.child({
      routeInfo: { method: "POST", url: "/public/:companySlug/bookings" },
    } as unknown as RouteOptions & { path: string; prefix: string });

    await increment(child, "client", 60_000, 2);

    expect(counter.increment).toHaveBeenCalledWith(
      "public:POST:/public/:companySlug/bookings",
      expect.stringMatching(/^[a-f0-9]{64}$/),
      60_000,
    );
  });

  it("propaga falha do Postgres ao plugin em vez de liberar requisições", async () => {
    const counter: RateLimitCounter = {
      increment: vi.fn().mockRejectedValue(new Error("database unavailable")),
    };
    const Store = createPostgresRateLimitStore("global", counter);
    const store = new Store({});

    await expect(increment(store, "client", 60_000, 2)).rejects.toThrow("database unavailable");
  });
});

function increment(
  store: InstanceType<ReturnType<typeof createPostgresRateLimitStore>>,
  key: string,
  timeWindow: number,
  max: number,
): Promise<{ current: number; ttl: number }> {
  return new Promise((resolve, reject) => {
    store.incr(
      key,
      (error, result) => {
        if (error) return reject(error);
        if (!result) return reject(new Error("store não retornou resultado"));
        resolve(result);
      },
      timeWindow,
      max,
    );
  });
}
