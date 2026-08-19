import { AlertTriangle, CheckCircle2, Loader2, ShieldCheck, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  CancelBookingByTokenResponseSchema,
  CancelBookingByTokenSchema,
} from "@shared/schemas/cancellation.schema";
import { Button } from "@web/components/button";
import { Card, CardContent } from "@web/components/card";
import { ApiRequestError, api } from "@web/lib/api";

type CancellationState =
  | "confirmation"
  | "submitting"
  | "cancelled"
  | "expired"
  | "invalid"
  | "not_allowed"
  | "transient_error";

export function CancellationPage() {
  const { hash, pathname, search } = useLocation();
  const navigate = useNavigate();
  const [token] = useState(() => readTokenFromFragment(hash));
  const [state, setState] = useState<CancellationState>(token ? "confirmation" : "invalid");

  useEffect(() => {
    const searchParams = new URLSearchParams(search);
    const hadQueryToken = searchParams.has("token");
    searchParams.delete("token");

    if (!hash && !hadQueryToken) return;

    const sanitizedSearch = searchParams.toString();
    void navigate(
      {
        pathname,
        search: sanitizedSearch ? `?${sanitizedSearch}` : "",
        hash: "",
      },
      { replace: true },
    );
  }, [hash, navigate, pathname, search]);

  async function cancelBooking(): Promise<void> {
    if (!token || state === "submitting") return;

    setState("submitting");

    try {
      await api.post("/public/bookings/cancel", CancelBookingByTokenResponseSchema, { token });
      setState("cancelled");
    } catch (error) {
      setState(classifyCancellationError(error));
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4 py-10">
      <Card className="w-full max-w-lg">
        <CardContent className="p-6 sm:p-8" aria-live="polite" aria-busy={state === "submitting"}>
          {state === "confirmation" && (
            <CancellationMessage
              icon={ShieldCheck}
              title="Cancelar esta reserva?"
              description="Confirme somente se você realmente deseja liberar o horário. Esta ação não pode ser desfeita."
            >
              <Button variant="destructive" onClick={() => void cancelBooking()}>
                Confirmar cancelamento
              </Button>
            </CancellationMessage>
          )}

          {state === "submitting" && (
            <CancellationMessage
              icon={Loader2}
              iconClassName="animate-spin text-primary"
              title="Cancelando a reserva..."
              description="Aguarde enquanto confirmamos o cancelamento com segurança."
            >
              <Button variant="destructive" disabled>
                Cancelando...
              </Button>
            </CancellationMessage>
          )}

          {state === "cancelled" && (
            <CancellationMessage
              icon={CheckCircle2}
              iconClassName="text-primary"
              title="Reserva cancelada"
              description="O cancelamento foi confirmado e o horário foi liberado."
            />
          )}

          {state === "expired" && (
            <CancellationMessage
              role="alert"
              icon={AlertTriangle}
              title="Link de cancelamento expirado"
              description="Este link não é mais válido. Nenhuma alteração foi feita na reserva."
            />
          )}

          {state === "invalid" && (
            <CancellationMessage
              role="alert"
              icon={XCircle}
              title="Link de cancelamento inválido"
              description="O link está incompleto ou não é válido. Nenhuma alteração foi feita; confira o e-mail original e tente novamente."
            />
          )}

          {state === "not_allowed" && (
            <CancellationMessage
              role="alert"
              icon={AlertTriangle}
              title="Cancelamento indisponível"
              description="Esta reserva já foi cancelada ou não pode mais ser alterada por este link."
            />
          )}

          {state === "transient_error" && (
            <CancellationMessage
              role="alert"
              icon={AlertTriangle}
              title="Não foi possível cancelar agora"
              description="A reserva não foi alterada. Verifique sua conexão e tente novamente em instantes."
            >
              <Button onClick={() => void cancelBooking()}>Tentar novamente</Button>
            </CancellationMessage>
          )}
        </CardContent>
      </Card>
    </main>
  );
}

function CancellationMessage({
  icon: Icon,
  iconClassName = "text-muted-foreground",
  title,
  description,
  role,
  children,
}: {
  icon: typeof ShieldCheck;
  iconClassName?: string;
  title: string;
  description: string;
  role?: "alert";
  children?: React.ReactNode;
}) {
  return (
    <section className="flex flex-col items-center text-center" role={role}>
      <Icon className={`h-12 w-12 ${iconClassName}`} aria-hidden="true" />
      <h1 className="mt-4 text-xl font-semibold">{title}</h1>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">{description}</p>
      {children && <div className="mt-6 flex justify-center">{children}</div>}
    </section>
  );
}

function readTokenFromFragment(hash: string): string | null {
  if (!hash.startsWith("#")) return null;

  const token = new URLSearchParams(hash.slice(1)).get("token");
  const parsed = CancelBookingByTokenSchema.safeParse({ token });

  return parsed.success ? parsed.data.token : null;
}

function classifyCancellationError(error: unknown): CancellationState {
  if (!(error instanceof ApiRequestError)) return "transient_error";

  if (error.status === 410 || error.body.code === "CANCELLATION_LINK_EXPIRED") {
    return "expired";
  }

  if (
    error.status === 400 ||
    error.body.code === "INVALID_CANCELLATION_TOKEN" ||
    error.body.code === "VALIDATION_ERROR"
  ) {
    return "invalid";
  }

  if (error.status === 409 || error.body.code === "BOOKING_CANCELLATION_NOT_ALLOWED") {
    return "not_allowed";
  }

  return "transient_error";
}
