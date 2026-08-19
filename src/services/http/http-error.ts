import type { FastifyError, FastifyInstance, FastifyReply } from "fastify";
import type { ApiError } from "@shared/types/api-error";
import { findPostgresUnavailableCode } from "@services/database/postgres-error";

/**
 * Erro de negócio com tradução direta para HTTP, serializado no formato `ApiError`
 * pelo handler registrado em `registerErrorHandler`.
 */
export class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

/**
 * Converte `HttpError` em resposta e deixa o resto virar 500.
 *
 * Hooks (`preHandler`) interrompem a pipeline lançando um erro, em vez de misturar
 * `reply.send()` com retorno normal do hook. Isso preserva uma única resposta sob
 * o servidor local, o bridge HTTP da Function e futuros adapters: o Fastify entrega
 * o erro direto ao error handler e nunca chama o handler da rota.
 * Regressão coberta em `test/services/http/pre-handler-abort.spec.ts`.
 */
export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof HttpError) {
      if (error.statusCode === 401 || error.statusCode === 403) preventCaching(reply);

      const body: ApiError = {
        code: error.code,
        message: error.message,
        requestId: request.id,
        ...(error.details === undefined ? {} : { details: error.details }),
      };

      return reply.code(error.statusCode).send(body);
    }

    const databaseErrorCode = findPostgresUnavailableCode(error);

    if (databaseErrorCode) {
      request.log.error(
        {
          event: "database_unavailable",
          requestId: request.id,
          errorCode: databaseErrorCode,
          ...(request.auth
            ? { companyId: request.auth.companyId, userId: request.auth.userId }
            : {}),
        },
        "database unavailable",
      );

      preventCaching(reply);
      reply.header("retry-after", "5");

      return reply.code(503).send({
        code: "SERVICE_UNAVAILABLE",
        message: "Serviço temporariamente indisponível. Tente novamente.",
        requestId: request.id,
      } satisfies ApiError);
    }

    /**
     * Erros que o próprio Fastify levanta (payload malformado, corpo grande demais)
     * já vêm com `statusCode` e `code`. Qualquer outra coisa é falha nossa e vira 500
     * com mensagem genérica: a mensagem original pode carregar detalhe interno.
     */
    const { statusCode = 500, code, message } = error as Partial<FastifyError>;

    if (statusCode >= 500) {
      request.log.error(
        {
          event: "unhandled_request_error",
          requestId: request.id,
          errorName: error instanceof Error ? error.name : "UnknownError",
          errorCode: code,
          statusCode,
          ...(request.auth
            ? { companyId: request.auth.companyId, userId: request.auth.userId }
            : {}),
        },
        "unhandled request error",
      );

      return reply.code(500).send({
        code: "INTERNAL_ERROR",
        message: "Erro interno.",
        requestId: request.id,
      } satisfies ApiError);
    }

    const isFastifyClientError = typeof code === "string" && code.startsWith("FST_");

    return reply.code(statusCode).send({
      code: isFastifyClientError ? code : "BAD_REQUEST",
      message: isFastifyClientError && message ? message : "Requisição inválida.",
      requestId: request.id,
    } satisfies ApiError);
  });
}

function preventCaching(reply: FastifyReply): void {
  reply.header("cache-control", "private, no-store, max-age=0");
  reply.header("pragma", "no-cache");
}
