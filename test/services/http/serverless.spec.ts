import { EventEmitter } from "node:events";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { afterAll, describe, expect, it, vi } from "vitest";
import handler, { app } from "../../../api/server";

afterAll(async () => {
  await app.close();
});

describe("Vercel Serverless wrapper", () => {
  it("roteia /api para a Function antes do fallback da SPA", async () => {
    const config = (await Bun.file(new URL("../../../vercel.json", import.meta.url)).json()) as {
      framework?: string;
      bunVersion?: string;
      outputDirectory?: string;
      rewrites?: Array<{ source: string; destination: string }>;
    };

    expect(config).toMatchObject({
      framework: "vite",
      bunVersion: "1.x",
      outputDirectory: "dist/web",
      rewrites: [
        { source: "/api", destination: "/api/server" },
        { source: "/api/:path*", destination: "/api/server" },
        { source: "/(.*)", destination: "/index.html" },
      ],
    });
  });

  it("prepara o Fastify sem abrir uma porta", async () => {
    await app.ready();

    expect(app.server.listening).toBe(false);
  });

  it("encaminha request e response ao servidor HTTP interno do Fastify", async () => {
    const request = {} as IncomingMessage;
    const response = new EventEmitter() as ServerResponse;
    const emit = vi.spyOn(app.server, "emit").mockImplementation(() => {
      queueMicrotask(() => response.emit("finish"));
      return true;
    });

    await handler(request, response);

    expect(emit).toHaveBeenCalledWith("request", request, response);
    expect(response.listenerCount("finish")).toBe(0);
    emit.mockRestore();
  });

  it("mantém o pathname público sob /api sem prefixo duplicado", async () => {
    const response = await app.inject({ method: "GET", url: "/api/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
  });

  it("conclui uma resposta real pelo bridge Node HTTP", async () => {
    const server = createServer((request, response) => {
      void handler(request, response);
    });

    try {
      const port = await listenOnRandomPort(server);
      const response = await fetch(`http://127.0.0.1:${port}/api/health`);

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ status: "ok" });
    } finally {
      await closeServer(server);
    }
  });
});

function listenOnRandomPort(server: Server): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      const address = server.address();
      if (!address || typeof address === "string") return reject(new Error("Porta não resolvida."));
      resolve(address.port);
    });
  });
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}
