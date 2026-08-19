import type { Subscription } from "./subscription";

export abstract class SubscriptionRepository {
  abstract findByCompanyId(companyId: string): Promise<Subscription | null>;
}
