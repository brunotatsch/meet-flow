import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import { normalizeIP, type FastifyRateLimitStoreCtor } from "@fastify/rate-limit";
import type { FastifyInstance } from "fastify";
import { env } from "@services/config/env";
import { HttpError } from "./http-error";
import { createPostgresRateLimitStore } from "./rate-limit/postgres-rate-limit-store";

export const LOGGER_REDACT_PATHS = [
  "req.headers.authorization",
  "req.headers.cookie",
  "req.headers['set-cookie']",
  "req.body.password",
  "req.body.token",
  "req.body.secret",
  "res.headers['set-cookie']",
  "request.headers.authorization",
  "request.headers.cookie",
  "request.body.password",
  "request.body.token",
  "request.body.secret",
  "headers.authorization",
  "headers.cookie",
  "headers['set-cookie']",
  "body.password",
  "body.currentPassword",
  "body.newPassword",
  "body.token",
  "body.secret",
  "body.cardNumber",
  "body.apiKey",
  "body.stripeSignature",
  "password",
  "token",
  "secret",
  "apiKey",
  "stripeSignature",
] as const;

export interface GlobalRateLimitOptions {
  max: number;
  timeWindow: number;
  store?: FastifyRateLimitStoreCtor;
}

export interface HttpSecurityOptions {
  allowedCorsOrigins?: readonly string[];
  helmet?: boolean;
  globalRateLimit?: false | GlobalRateLimitOptions;
}

/** Registra proteções que precisam viver no contexto raiz da aplicação. */
export function registerHttpSecurity(
  app: FastifyInstance,
  options: HttpSecurityOptions = {},
): void {
  const allowedOrigins = new Set(
    (options.allowedCorsOrigins ?? configuredCorsOrigins()).map(normalizeOrigin),
  );

  if (options.helmet !== false) {
    app.register(helmet, {
      global: true,
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'none'"],
          baseUri: ["'none'"],
          formAction: ["'none'"],
          frameAncestors: ["'none'"],
        },
      },
      crossOriginResourcePolicy: { policy: "same-site" },
      referrerPolicy: { policy: "no-referrer" },
      hsts:
        env.NODE_ENV === "production"
          ? { maxAge: 31_536_000, includeSubDomains: true, preload: true }
          : false,
    });
  }

  app.register(cors, {
    origin: (origin, callback) => {
      if (origin === undefined) return callback(null, true);
      const normalizedOrigin = safeNormalizeOrigin(origin);
      callback(null, normalizedOrigin && allowedOrigins.has(normalizedOrigin) ? origin : false);
    },
    credentials: true,
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Accept", "Authorization", "Content-Type", "Stripe-Signature", "X-Request-ID"],
    exposedHeaders: [
      "Retry-After",
      "X-RateLimit-Limit",
      "X-RateLimit-Remaining",
      "X-RateLimit-Reset",
      "X-Request-ID",
    ],
    maxAge: 600,
    cacheControl: "public, max-age=600",
    strictPreflight: true,
  });

  // Precisa preceder qualquer hook que possa lançar, inclusive o rate limit.
  app.addHook("onRequest", async (request, reply) => {
    reply.header("x-request-id", request.id);
  });

  if (options.globalRateLimit !== false) {
    const globalLimit = options.globalRateLimit ?? {
      max: env.GLOBAL_RATE_LIMIT_MAX,
      timeWindow: env.GLOBAL_RATE_LIMIT_WINDOW_MS,
    };

    const Store = globalLimit.store ?? createPostgresRateLimitStore("global");
    const store = new Store({});

    app.addHook("onRequest", async (request, reply) => {
      if (isProbeRoute(request.url)) return;

      const { current, ttl } = await incrementRateLimit(
        store,
        normalizeIP(request.ip),
        globalLimit.timeWindow,
        globalLimit.max,
      );
      const ttlSeconds = Math.max(1, Math.ceil(ttl / 1000));

      reply.header("x-ratelimit-limit", globalLimit.max);
      reply.header("x-ratelimit-remaining", Math.max(0, globalLimit.max - current));
      reply.header("x-ratelimit-reset", ttlSeconds);

      if (current > globalLimit.max) {
        reply.header("retry-after", ttlSeconds);
        throw new HttpError(
          429,
          "RATE_LIMITED",
          `Muitas requisições. Tente novamente em ${ttlSeconds} segundos.`,
        );
      }
    });
  }

  app.addHook("onSend", async (request, reply) => {
    if (!request.auth && !isBetterAuthRoute(request.url)) return;

    reply.header("cache-control", "private, no-store, max-age=0");
    reply.header("pragma", "no-cache");
    reply.header("vary", appendVary(reply.getHeader("vary"), "Cookie"));
  });

  app.addHook("onResponse", async (request, reply) => {
    const authContext = request.auth
      ? { companyId: request.auth.companyId, userId: request.auth.userId }
      : {};

    request.log.info(
      {
        event: "request_completed",
        requestId: request.id,
        method: request.method,
        route: request.routeOptions.url,
        statusCode: reply.statusCode,
        elapsedMs: Math.round(reply.elapsedTime),
        ...authContext,
      },
      "request completed",
    );
  });
}

export function configuredCorsOrigins(): string[] {
  return [env.APP_URL, ...env.CORS_ALLOWED_ORIGINS.split(",")]
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function isProbeRoute(url: string): boolean {
  const [path = ""] = url.split("?", 1);
  return path === "/api/health" || path === "/api/ready";
}

function isBetterAuthRoute(url: string): boolean {
  const [path = ""] = url.split("?", 1);
  return path === "/api/auth" || path.startsWith("/api/auth/");
}

function incrementRateLimit(
  store: InstanceType<FastifyRateLimitStoreCtor>,
  key: string,
  timeWindow: number,
  max: number,
): Promise<{ current: number; ttl: number }> {
  return new Promise((resolve, reject) => {
    store.incr(
      key,
      (error, result) => {
        if (error) return reject(error);
        if (!result) return reject(new Error("Store de rate limit não retornou resultado."));
        resolve(result);
      },
      timeWindow,
      max,
    );
  });
}

function normalizeOrigin(origin: string): string {
  return new URL(origin).origin;
}

function safeNormalizeOrigin(origin: string): string | undefined {
  try {
    return normalizeOrigin(origin);
  } catch {
    return undefined;
  }
}

function appendVary(current: string | string[] | number | undefined, value: string): string {
  const values = Array.isArray(current)
    ? current.flatMap((entry) => entry.split(","))
    : String(current ?? "").split(",");
  const normalized = values.map((entry) => entry.trim()).filter(Boolean);

  if (!normalized.some((entry) => entry.toLowerCase() === value.toLowerCase())) {
    normalized.push(value);
  }

  return normalized.join(", ");
}
