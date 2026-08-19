import type { IncomingMessage, ServerResponse } from "node:http";
import { buildServer } from "@services/http/server";

/**
 * Um módulo pode atender várias invocações quentes. Fastify e seus plugins são
 * construídos e preparados uma vez por isolate, sem abrir uma porta.
 */
export const app = buildServer();
const appReady = app.ready();

export default async function handler(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  await appReady;

  // `emit` entrega o par Node HTTP ao Fastify imediatamente, mas os handlers da
  // aplicação são assíncronos. Manter a Promise aberta até `finish` impede a
  // plataforma de considerar a invocação concluída antes de `response.end()`.
  await new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      response.off("finish", completed);
      response.off("close", completed);
      response.off("error", failed);
    };
    const completed = () => {
      cleanup();
      resolve();
    };
    const failed = (error: Error) => {
      cleanup();
      reject(error);
    };

    response.once("finish", completed);
    response.once("close", completed);
    response.once("error", failed);

    try {
      if (!app.server.emit("request", request, response)) {
        failed(new Error("Fastify não registrou o listener HTTP interno."));
      }
    } catch (error) {
      failed(error instanceof Error ? error : new Error("Falha ao encaminhar request."));
    }
  });
}
