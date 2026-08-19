import { useCallback, useEffect, useState } from "react";
import {
  PublicCheckoutStatusResponseSchema,
  type PublicCheckoutStatusResponse,
} from "@shared/schemas/checkout.schema";
import { api } from "@web/lib/api";

export const CHECKOUT_STATUS_POLL_INTERVAL_MS = 2_000;
const MAX_AUTOMATIC_POLLS = 30;

type CheckoutStatusState =
  | { status: "missing" }
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; data: PublicCheckoutStatusResponse };

interface KeyedCheckoutStatus {
  key: string;
  state: Exclude<CheckoutStatusState, { status: "missing" } | { status: "loading" }>;
}

export interface UseCheckoutStatusResult {
  state: CheckoutStatusState;
  retry: () => void;
}

/**
 * Consulta o estado persistido da Checkout Session.
 *
 * O redirect do browser pode vencer a corrida contra o webhook. Enquanto o
 * backend responder `processing`, a página consulta novamente por até um minuto.
 * O timer e a requisição são descartados no unmount: nenhuma informação depende
 * da memória de uma Function ou do estado anterior do wizard.
 */
export function useCheckoutStatus(
  companySlug: string,
  sessionId: string | null,
): UseCheckoutStatusResult {
  const [generation, setGeneration] = useState(0);
  const [result, setResult] = useState<KeyedCheckoutStatus | null>(null);
  const key = `${companySlug}:${sessionId ?? "missing"}:${generation}`;

  useEffect(() => {
    if (!sessionId) return;

    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let pollCount = 0;

    async function poll(): Promise<void> {
      try {
        const data = await api.get(
          `/public/${companySlug}/checkout-sessions/${encodeURIComponent(sessionId!)}`,
          PublicCheckoutStatusResponseSchema,
          { signal: controller.signal },
        );

        if (controller.signal.aborted) return;

        pollCount += 1;
        setResult({ key, state: { status: "ready", data } });

        if (data.state === "processing" && pollCount < MAX_AUTOMATIC_POLLS) {
          timer = setTimeout(() => void poll(), CHECKOUT_STATUS_POLL_INTERVAL_MS);
        }
      } catch (error) {
        if (
          controller.signal.aborted ||
          (error instanceof DOMException && error.name === "AbortError")
        ) {
          return;
        }

        setResult({ key, state: { status: "error" } });
      }
    }

    void poll();

    return () => {
      controller.abort();
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [companySlug, key, sessionId]);

  const retry = useCallback(() => setGeneration((current) => current + 1), []);

  if (!sessionId) return { state: { status: "missing" }, retry };
  if (result?.key !== key) return { state: { status: "loading" }, retry };
  return { state: result.state, retry };
}
