import { eq } from "drizzle-orm";
import { db } from "@services/database/client";
import { Plan } from "../../domain/plan";
import { SubscriptionRepository } from "../../domain/subscription.repository";
import { Subscription } from "../../domain/subscription";
import { subscriptions } from "./schema/billing";

export class DrizzleSubscriptionRepository extends SubscriptionRepository {
  async findByCompanyId(companyId: string): Promise<Subscription | null> {
    const [row] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.companyId, companyId))
      .limit(1);

    if (!row) return null;

    if (!Plan.isPlanKey(row.planKey)) {
      throw new Error(`Assinatura ${row.id} referencia plano desconhecido "${row.planKey}".`);
    }

    return Subscription.restore({
      id: row.id,
      companyId: row.companyId,
      planKey: row.planKey,
      planVersion: row.planVersion,
      status: row.status,
      stripeCustomerId: row.stripeCustomerId,
      stripeSubscriptionId: row.stripeSubscriptionId,
      stripePriceId: row.stripePriceId,
      currentPeriodEnd: row.currentPeriodEnd,
      cancelAtPeriodEnd: row.cancelAtPeriodEnd,
      stripeUpdatedAt: row.stripeUpdatedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }
}
