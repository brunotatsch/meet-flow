import { describe, expect, it } from "vitest";
import { buildServer } from "@services/http/server";

describe("GET /health", () => {
  it("retorna status ok e o uptime do processo", async () => {
    const app = buildServer();

    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body).toEqual({
      status: "ok",
      uptime: expect.any(Number),
    });

    await app.close();
  });
});
