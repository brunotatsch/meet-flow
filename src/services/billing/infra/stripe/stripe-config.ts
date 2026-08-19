import { z } from "zod";
import { BillingConfigurationError } from "../../domain/errors";
import { PlanKey, type PlanKey as PlanKeyType } from "../../domain/plan";

const secretConfigSchema = z.object({
  STRIPE_SECRET_KEY: z.string().startsWith("sk_"),
  STRIPE_WEBHOOK_SECRET: z.string().startsWith("whsec_"),
  STRIPE_PRICE_STARTER: z.string().startsWith("price_"),
  STRIPE_PRICE_PRO: z.string().startsWith("price_"),
});

export interface StripeConfiguration {
  secretKey: string;
  webhookSecret: string;
  prices: Record<Exclude<PlanKeyType, "free">, string>;
}

export function loadStripeConfiguration(
  source: NodeJS.ProcessEnv = process.env,
): StripeConfiguration {
  const result = secretConfigSchema.safeParse(source);

  if (!result.success) {
    throw new BillingConfigurationError(
      "Stripe não configurada. Defina STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, " +
        "STRIPE_PRICE_STARTER e STRIPE_PRICE_PRO.",
    );
  }

  return {
    secretKey: result.data.STRIPE_SECRET_KEY,
    webhookSecret: result.data.STRIPE_WEBHOOK_SECRET,
    prices: {
      [PlanKey.STARTER]: result.data.STRIPE_PRICE_STARTER,
      [PlanKey.PRO]: result.data.STRIPE_PRICE_PRO,
    },
  };
}

export function stripePriceForPlan(
  planKey: Exclude<PlanKeyType, "free">,
  source: NodeJS.ProcessEnv = process.env,
): string {
  return loadStripeConfiguration(source).prices[planKey];
}

export function planForStripePrice(
  priceId: string,
  source: NodeJS.ProcessEnv = process.env,
): PlanKeyType | null {
  const prices = loadStripeConfiguration(source).prices;
  if (prices.starter === priceId) return PlanKey.STARTER;
  if (prices.pro === priceId) return PlanKey.PRO;
  return null;
}
