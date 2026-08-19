import type { LimitedResource, PlanKey } from "./plan";

export class BillingConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BillingConfigurationError";
  }
}

export class InvalidWebhookSignatureError extends Error {
  constructor() {
    super("Assinatura do webhook Stripe inválida.");
    this.name = "InvalidWebhookSignatureError";
  }
}

export class CheckoutUnavailableError extends Error {
  constructor(message = "Não foi possível iniciar o pagamento desta reserva.") {
    super(message);
    this.name = "CheckoutUnavailableError";
  }
}

export class InvalidPlanError extends Error {
  constructor(planKey: string) {
    super(`Plano "${planKey}" não está disponível para assinatura.`);
    this.name = "InvalidPlanError";
  }
}

export class PlanLimitExceededError extends Error {
  constructor(
    readonly planKey: PlanKey,
    readonly resource: LimitedResource,
    readonly usage: number,
    readonly limit: number,
    readonly readOnly: boolean,
  ) {
    super(
      readOnly
        ? "A assinatura está inadimplente; o tenant opera somente para leitura."
        : `O limite de ${resource} do plano ${planKey} foi atingido.`,
    );
    this.name = "PlanLimitExceededError";
  }
}
