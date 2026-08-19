import type { SubscriptionRepository } from "../domain/subscription.repository";
import { CheckoutUnavailableError } from "../domain/errors";
import type { StripeGateway } from "./stripe-gateway";

export class CustomerPortalUseCase {
  constructor(
    private readonly subscriptions: SubscriptionRepository,
    private readonly gateway: StripeGateway,
    private readonly appUrl: string,
  ) {}

  async execute(companyId: string): Promise<string> {
    const subscription = await this.subscriptions.findByCompanyId(companyId);

    if (!subscription?.stripeCustomerId) {
      throw new CheckoutUnavailableError(
        "Este tenant ainda não possui cliente Stripe para abrir o portal.",
      );
    }

    return this.gateway.createCustomerPortal(
      subscription.stripeCustomerId,
      `${this.appUrl.replace(/\/$/, "")}/admin/billing`,
    );
  }
}
