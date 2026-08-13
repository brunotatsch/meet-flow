import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { api, ApiRequestError, ApiTransportError } from "@web/lib/api";

const RoomSchema = z.object({ id: z.string(), name: z.string() });

function mockFetchOnce(status: number, body: unknown): void {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(body === undefined ? null : JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      }),
    ),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("api", () => {
  it("faz GET em /api/v1<path> e valida a resposta com o schema", async () => {
    mockFetchOnce(200, { id: "sala-1", name: "Sala Atlântico" });

    const room = await api.get("/rooms/sala-1", RoomSchema);

    expect(room).toEqual({ id: "sala-1", name: "Sala Atlântico" });
    expect(fetch).toHaveBeenCalledWith(
      "/api/v1/rooms/sala-1",
      expect.objectContaining({ method: "GET", credentials: "include" }),
    );
  });

  it("envia POST com corpo serializado e Content-Type", async () => {
    mockFetchOnce(201, { id: "sala-2", name: "Sala Pacífico" });

    await api.post("/rooms", RoomSchema, { name: "Sala Pacífico" });

    expect(fetch).toHaveBeenCalledWith(
      "/api/v1/rooms",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ name: "Sala Pacífico" }),
        headers: { "Content-Type": "application/json" },
      }),
    );
  });

  it("converte resposta de erro em ApiRequestError com o status e o body da API", async () => {
    mockFetchOnce(409, { code: "BOOKING_CONFLICT", message: "Horário já reservado." });

    const error = await api.get("/rooms/sala-1", RoomSchema).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiRequestError);
    expect((error as ApiRequestError).status).toBe(409);
    expect((error as ApiRequestError).body).toEqual({
      code: "BOOKING_CONFLICT",
      message: "Horário já reservado.",
    });
  });

  it("lança ApiTransportError quando a resposta não bate com o schema esperado", async () => {
    mockFetchOnce(200, { unexpected: true });

    const error = await api.get("/rooms/sala-1", RoomSchema).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiTransportError);
  });
});
