import { z } from "zod";

export const PlanKeySchema = z.enum(["free", "starter", "pro"]);
export type PlanKey = z.infer<typeof PlanKeySchema>;

export const PaidPlanKeySchema = z.enum(["starter", "pro"]);
export type PaidPlanKey = z.infer<typeof PaidPlanKeySchema>;

export const SubscriptionStatusSchema = z.enum([
  "incomplete",
  "incomplete_expired",
  "trialing",
  "active",
  "past_due",
  "canceled",
  "unpaid",
  "paused",
]);
export type SubscriptionStatus = z.infer<typeof SubscriptionStatusSchema>;

export const PlanLimitsSchema = z.object({
  rooms: z.number().int().nonnegative(),
  users: z.number().int().nonnegative(),
  bookings: z.number().int().nonnegative(),
});
export type PlanLimits = z.infer<typeof PlanLimitsSchema>;

export const PlanSchema = z.object({
  key: PlanKeySchema,
  name: z.string().min(1),
  version: z.number().int().positive(),
  limits: PlanLimitsSchema,
});
export type Plan = z.infer<typeof PlanSchema>;

export const BillingUsageSchema = PlanLimitsSchema;
export type BillingUsage = z.infer<typeof BillingUsageSchema>;

export const SubscriptionSchema = z.object({
  status: SubscriptionStatusSchema,
  planKey: PlanKeySchema,
  currentPeriodEnd: z.iso.datetime().nullable(),
  cancelAtPeriodEnd: z.boolean(),
});
export type Subscription = z.infer<typeof SubscriptionSchema>;

export const BillingSummarySchema = z.object({
  subscription: SubscriptionSchema,
  plan: PlanSchema,
  usage: BillingUsageSchema,
  accessMode: z.enum(["read_write", "read_only"]),
  plans: z.array(PlanSchema),
});
export type BillingSummary = z.infer<typeof BillingSummarySchema>;

export const CreateBillingCheckoutSchema = z.object({
  planKey: PaidPlanKeySchema,
});
export type CreateBillingCheckout = z.infer<typeof CreateBillingCheckoutSchema>;

export const BillingCheckoutResponseSchema = z.object({
  url: z.url({ protocol: /^https$/ }),
  sessionId: z.string().min(1),
  expiresAt: z.iso.datetime(),
});
export type BillingCheckoutResponse = z.infer<typeof BillingCheckoutResponseSchema>;

export const BillingPortalResponseSchema = z.object({
  url: z.url({ protocol: /^https$/ }),
});
export type BillingPortalResponse = z.infer<typeof BillingPortalResponseSchema>;
