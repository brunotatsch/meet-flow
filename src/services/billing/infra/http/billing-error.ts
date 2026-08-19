import {
  BillingConfigurationError,
  CheckoutUnavailableError,
  InvalidPlanError,
  InvalidWebhookSignatureError,
  PlanLimitExceededError,
} from "../../domain/errors";
import { HttpError } from "@services/http/http-error";

export function mapBillingError(error: unknown): never {
  if (error instanceof InvalidWebhookSignatureError) {
    throw new HttpError(400, "INVALID_STRIPE_SIGNATURE", error.message);
  }

  if (error instanceof InvalidPlanError) {
    throw new HttpError(400, "INVALID_PLAN", error.message);
  }

  if (error instanceof PlanLimitExceededError) {
    throw planLimitHttpError(error);
  }

  if (error instanceof BillingConfigurationError) {
    throw new HttpError(503, "BILLING_NOT_CONFIGURED", "Billing indisponível neste ambiente.");
  }

  if (error instanceof CheckoutUnavailableError) {
    throw new HttpError(503, "CHECKOUT_UNAVAILABLE", error.message);
  }

  throw error;
}

export function planLimitHttpError(error: PlanLimitExceededError): HttpError {
  return new HttpError(402, "PLAN_LIMIT_EXCEEDED", error.message, {
    planKey: error.planKey,
    resource: error.resource,
    usage: error.usage,
    limit: error.limit,
    readOnly: error.readOnly,
  });
}
