import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

const TokenPayloadSchema = z.object({
  v: z.literal(1),
  bookingId: z.uuid(),
  companyId: z.uuid(),
  exp: z.number().int().positive(),
});

export type CancellationTokenPayload = z.infer<typeof TokenPayloadSchema>;

export class InvalidCancellationTokenError extends Error {
  constructor() {
    super("O link de cancelamento é inválido.");
    this.name = "InvalidCancellationTokenError";
  }
}

export class ExpiredCancellationTokenError extends Error {
  constructor() {
    super("O link de cancelamento expirou e nenhuma reserva foi alterada.");
    this.name = "ExpiredCancellationTokenError";
  }
}

/**
 * Token compacto autenticado por HMAC. O conteúdo contém apenas ids opacos e
 * expiração; nome, e-mail, telefone e detalhes da reserva nunca vão para a URL.
 */
export class BookingCancellationToken {
  constructor(private readonly secret: string) {
    if (secret.length < 32) {
      throw new Error("BOOKING_CANCELLATION_SECRET deve ter ao menos 32 caracteres.");
    }
  }

  issue(input: { bookingId: string; companyId: string; expiresAt: Date }): string {
    const payload = TokenPayloadSchema.parse({
      v: 1,
      bookingId: input.bookingId,
      companyId: input.companyId,
      exp: Math.floor(input.expiresAt.getTime() / 1_000),
    });
    const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
    return `${encoded}.${this.sign(encoded)}`;
  }

  verify(token: string, now = new Date()): CancellationTokenPayload {
    const [encoded, suppliedSignature, extra] = token.split(".");
    if (!encoded || !suppliedSignature || extra !== undefined) {
      throw new InvalidCancellationTokenError();
    }

    const expected = Buffer.from(this.sign(encoded), "base64url");
    let supplied: Buffer;
    try {
      supplied = Buffer.from(suppliedSignature, "base64url");
    } catch {
      throw new InvalidCancellationTokenError();
    }

    if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
      throw new InvalidCancellationTokenError();
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    } catch {
      throw new InvalidCancellationTokenError();
    }

    const result = TokenPayloadSchema.safeParse(parsed);
    if (!result.success) throw new InvalidCancellationTokenError();

    if (result.data.exp <= Math.floor(now.getTime() / 1_000)) {
      throw new ExpiredCancellationTokenError();
    }

    return result.data;
  }

  private sign(encodedPayload: string): string {
    return createHmac("sha256", this.secret).update(encodedPayload).digest("base64url");
  }
}
