import type { FastifyError, FastifyInstance } from "fastify";
import type { ApiError } from "@shared/types/api-error";

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
 * Isto é o que permite que hooks (`preHandler`) interrompam a requisição lançando
 * um erro em vez de responderem por conta própria, o que **é obrigatório** neste
 * runtime: no Bun, `reply.sent` continua `false` logo depois de `reply.send()`,
 * porque ele deriva de `raw.writableEnded`. O Fastify usa esse sinal para decidir
 * se ainda roda o handler da rota, então um `return reply.code(401).send(...)`
 * dentro de um hook async responde 401 **e mesmo assim executa o handler** - que
 * então tenta responder de novo e derruba a requisição com `ERR_HTTP_HEADERS_SENT`.
 * Sob Node o mesmo código se comporta como a documentação do Fastify descreve.
 *
 * Erro lançado não tem essa ambiguidade: o Fastify o entrega direto ao
 * `preHandlerCallback`, que responde e nunca chama o handler.
 * Regressão coberta em `test/services/http/pre-handler-abort.spec.ts`.
 */
export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof HttpError) {
      const body: ApiError = {
        code: error.code,
        message: error.message,
        ...(error.details === undefined ? {} : { details: error.details }),
      };

      return reply.code(error.statusCode).send(body);
    }

    request.log.error(error);

    /**
     * Erros que o próprio Fastify levanta (payload malformado, corpo grande demais)
     * já vêm com `statusCode` e `code`. Qualquer outra coisa é falha nossa e vira 500
     * com mensagem genérica: a mensagem original pode carregar detalhe interno.
     */
    const { statusCode = 500, code, message } = error as Partial<FastifyError>;

    if (statusCode >= 500) {
      return reply.code(500).send({ code: "INTERNAL_ERROR", message: "Erro interno." });
    }

    return reply.code(statusCode).send({
      code: code ?? "BAD_REQUEST",
      message: message ?? "Requisição inválida.",
    } satisfies ApiError);
  });
}
