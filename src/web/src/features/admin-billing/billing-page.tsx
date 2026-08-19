import { AlertTriangle, Check, CreditCard, Loader2 } from "lucide-react";
import { useState } from "react";
import {
  BillingCheckoutResponseSchema,
  BillingPortalResponseSchema,
  BillingSummarySchema,
  type BillingSummary,
  type PaidPlanKey,
  type Plan,
  type SubscriptionStatus,
} from "@shared/schemas/billing.schema";
import { Badge, type BadgeVariant } from "@web/components/badge";
import { Button } from "@web/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@web/components/card";
import { LoadingScreen } from "@web/components/loading-screen";
import { api, ApiRequestError } from "@web/lib/api";
import { redirectToExternalUrl } from "@web/lib/external-navigation";
import { useKeyedFetch } from "@web/lib/use-keyed-fetch";

type PendingAction = PaidPlanKey | "portal" | null;

const STATUS_LABELS: Record<SubscriptionStatus, string> = {
  incomplete: "Pagamento pendente",
  incomplete_expired: "Pagamento expirado",
  trialing: "Período de teste",
  active: "Ativa",
  past_due: "Pagamento em atraso",
  canceled: "Plano gratuito",
  unpaid: "Inadimplente",
  paused: "Pausada",
};

const STATUS_VARIANTS: Record<SubscriptionStatus, BadgeVariant> = {
  incomplete: "secondary",
  incomplete_expired: "outline",
  trialing: "secondary",
  active: "default",
  past_due: "destructive",
  canceled: "outline",
  unpaid: "destructive",
  paused: "destructive",
};

const LIMIT_LABELS = {
  rooms: "Salas",
  users: "Usuários",
  bookings: "Reservas neste mês",
} as const;

export function BillingPage() {
  const [version, setVersion] = useState(0);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const billingState = useKeyedFetch(`billing:${version}`, (signal) =>
    api.get("/billing", BillingSummarySchema, { signal }),
  );

  if (billingState.status === "loading") {
    return <LoadingScreen label="Carregando plano e uso..." />;
  }

  if (billingState.status === "error") {
    return (
      <div className="mx-auto flex max-w-4xl flex-col items-start gap-4 p-6">
        <h1 className="text-xl font-semibold">Plano e cobrança</h1>
        <p role="alert" className="text-sm text-destructive">
          Não foi possível carregar os dados de cobrança.
        </p>
        <Button variant="outline" onClick={() => setVersion((current) => current + 1)}>
          Tentar novamente
        </Button>
      </div>
    );
  }

  const billing = billingState.data;

  async function startCheckout(planKey: PaidPlanKey) {
    setActionError(null);
    setPendingAction(planKey);

    try {
      const checkout = await api.post("/billing/checkout", BillingCheckoutResponseSchema, {
        planKey,
      });
      redirectToExternalUrl(checkout.url);
    } catch (error) {
      setPendingAction(null);
      setActionError(actionErrorMessage(error, "Não foi possível abrir o checkout."));
    }
  }

  async function openPortal() {
    setActionError(null);
    setPendingAction("portal");

    try {
      const portal = await api.post("/billing/portal", BillingPortalResponseSchema);
      redirectToExternalUrl(portal.url);
    } catch (error) {
      setPendingAction(null);
      setActionError(actionErrorMessage(error, "Não foi possível abrir o portal de cobrança."));
    }
  }

  return (
    <div className="mx-auto w-full max-w-4xl p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Plano e cobrança</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Acompanhe o uso da empresa e gerencie sua assinatura.
          </p>
        </div>
        <Badge variant={STATUS_VARIANTS[billing.subscription.status]}>
          {STATUS_LABELS[billing.subscription.status]}
        </Badge>
      </div>

      {billing.accessMode === "read_only" && (
        <div
          role="alert"
          className="mt-6 flex gap-3 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm"
        >
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden="true" />
          <div>
            <p className="font-medium">Conta em modo somente leitura</p>
            <p className="mt-1 text-muted-foreground">
              Regularize a assinatura para voltar a criar ou alterar recursos. Seus dados continuam
              preservados.
            </p>
          </div>
        </div>
      )}

      {billing.subscription.cancelAtPeriodEnd && (
        <p className="mt-4 rounded-lg border border-border bg-muted p-4 text-sm">
          O cancelamento está agendado
          {billing.subscription.currentPeriodEnd
            ? ` para ${formatDate(billing.subscription.currentPeriodEnd)}`
            : " para o fim do período atual"}
          . Até lá, o plano continua ativo.
        </p>
      )}

      <section aria-labelledby="current-plan-heading" className="mt-6">
        <Card>
          <CardHeader>
            <CardDescription>Plano atual</CardDescription>
            <CardTitle id="current-plan-heading">{billing.plan.name}</CardTitle>
          </CardHeader>
          <CardContent>
            <UsageList billing={billing} />
          </CardContent>
          {billing.plan.key !== "free" && (
            <CardFooter>
              <Button variant="outline" onClick={openPortal} disabled={pendingAction !== null}>
                {pendingAction === "portal" ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <CreditCard className="h-4 w-4" aria-hidden="true" />
                )}
                Gerenciar cobrança
              </Button>
            </CardFooter>
          )}
        </Card>
      </section>

      {actionError && (
        <p role="alert" className="mt-4 text-sm text-destructive">
          {actionError}
        </p>
      )}

      <section aria-labelledby="plans-heading" className="mt-8">
        <h2 id="plans-heading" className="text-lg font-semibold">
          Planos disponíveis
        </h2>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          {billing.plans.map((plan) => (
            <PlanCard
              key={`${plan.key}:${plan.version}`}
              plan={plan}
              current={plan.key === billing.plan.key}
              pendingAction={pendingAction}
              onChoose={startCheckout}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

function UsageList({ billing }: { billing: BillingSummary }) {
  return (
    <dl className="grid gap-4 sm:grid-cols-3">
      {(Object.keys(LIMIT_LABELS) as Array<keyof typeof LIMIT_LABELS>).map((key) => {
        const used = billing.usage[key];
        const limit = billing.plan.limits[key];
        const atLimit = used >= limit;

        return (
          <div key={key} className="rounded-md bg-muted p-3">
            <dt className="text-sm text-muted-foreground">{LIMIT_LABELS[key]}</dt>
            <dd className="mt-1 text-lg font-semibold">
              {used} de {limit}
            </dd>
            {atLimit && <span className="text-xs text-destructive">Limite atingido</span>}
          </div>
        );
      })}
    </dl>
  );
}

interface PlanCardProps {
  plan: Plan;
  current: boolean;
  pendingAction: PendingAction;
  onChoose: (planKey: PaidPlanKey) => Promise<void>;
}

function PlanCard({ plan, current, pendingAction, onChoose }: PlanCardProps) {
  const paidPlanKey: PaidPlanKey | null = plan.key === "free" ? null : plan.key;

  return (
    <Card className={current ? "border-primary" : undefined}>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle>{plan.name}</CardTitle>
          {current && <Badge variant="secondary">Atual</Badge>}
        </div>
        <CardDescription>Versão {plan.version}</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2 text-sm">
          {(Object.keys(LIMIT_LABELS) as Array<keyof typeof LIMIT_LABELS>).map((key) => (
            <li key={key} className="flex items-center gap-2">
              <Check className="h-4 w-4 text-primary" aria-hidden="true" />
              {plan.limits[key]} {LIMIT_LABELS[key].toLocaleLowerCase("pt-BR")}
            </li>
          ))}
        </ul>
      </CardContent>
      <CardFooter>
        {current ? (
          <Button variant="outline" disabled className="w-full">
            Plano atual
          </Button>
        ) : paidPlanKey === null ? (
          <Button variant="outline" disabled className="w-full">
            Gratuito
          </Button>
        ) : (
          <Button
            className="w-full"
            onClick={() => onChoose(paidPlanKey)}
            disabled={pendingAction !== null}
          >
            {pendingAction === paidPlanKey && (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            )}
            Escolher {plan.name}
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "long", timeZone: "UTC" }).format(
    new Date(value),
  );
}

function actionErrorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiRequestError ? error.body.message : fallback;
}
