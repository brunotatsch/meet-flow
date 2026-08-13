import type { ZodType } from "zod";
import { ApiErrorSchema, type ApiError } from "@shared/types/api-error";

/**
 * Erro de API tratável: o `status` deixa a UI decidir por código (409 recarrega a
 * disponibilidade, 404 mostra "não encontrado", etc.) sem parsear a mensagem, e o
 * `body` já vem validado contra `ApiErrorSchema` - nunca um erro de rede cru.
 */
export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly body: ApiError,
  ) {
    super(body.message);
    this.name = "ApiRequestError";
  }
}

/** Erro de transporte: a resposta não chegou, ou não veio no formato de `ApiError`. */
export class ApiTransportError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, { cause });
    this.name = "ApiTransportError";
  }
}

type Method = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

interface RequestOptions {
  body?: unknown;
  signal?: AbortSignal;
}

/**
 * Lê o corpo da resposta como JSON, tolerando corpo vazio (`204`, `DELETE` sem
 * payload) sem lançar por conta do `response.json()` reclamar de string vazia.
 */
async function readJsonBody(response: Response): Promise<unknown> {
  const text = await response.text();

  if (!text) return null;

  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new ApiTransportError("Resposta da API não é um JSON válido.", error);
  }
}

/**
 * `credentials: "include"` manda o cookie de sessão do Better Auth em toda
 * chamada; é o que faz `requireAuth` no backend enxergar a sessão do navegador.
 * `/api/v1` é fixo porque é o único prefixo de negócio que este client fala - o
 * fluxo público entra por aqui também, via `/api/v1/public/...`.
 */
async function request<T>(
  path: string,
  method: Method,
  schema: ZodType<T>,
  options: RequestOptions = {},
): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`/api/v1${path}`, {
      method,
      credentials: "include",
      signal: options.signal,
      headers: options.body === undefined ? undefined : { "Content-Type": "application/json" },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch (error) {
    throw new ApiTransportError("Falha de rede ao chamar a API.", error);
  }

  const payload = await readJsonBody(response);

  if (!response.ok) {
    const parsedError = ApiErrorSchema.safeParse(payload);

    throw new ApiRequestError(
      response.status,
      parsedError.success
        ? parsedError.data
        : { code: "UNKNOWN_ERROR", message: `Erro inesperado (HTTP ${response.status}).` },
    );
  }

  const parsed = schema.safeParse(payload);

  if (!parsed.success) {
    throw new ApiTransportError(
      "Resposta da API não bate com o contrato esperado.",
      parsed.error,
    );
  }

  return parsed.data;
}

export const api = {
  get: <T>(path: string, schema: ZodType<T>, options?: RequestOptions) =>
    request(path, "GET", schema, options),
  post: <T>(path: string, schema: ZodType<T>, body?: unknown, options?: RequestOptions) =>
    request(path, "POST", schema, { ...options, body: body ?? {} }),
  patch: <T>(path: string, schema: ZodType<T>, body?: unknown, options?: RequestOptions) =>
    request(path, "PATCH", schema, { ...options, body: body ?? {} }),
  put: <T>(path: string, schema: ZodType<T>, body?: unknown, options?: RequestOptions) =>
    request(path, "PUT", schema, { ...options, body: body ?? {} }),
  delete: <T>(path: string, schema: ZodType<T>, options?: RequestOptions) =>
    request(path, "DELETE", schema, options),
};
