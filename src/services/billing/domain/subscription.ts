import { Plan, PlanKey } from "./plan";

export const SubscriptionStatus = {
  INCOMPLETE: "incomplete",
  INCOMPLETE_EXPIRED: "incomplete_expired",
  TRIALING: "trialing",
  ACTIVE: "active",
  PAST_DUE: "past_due",
  CANCELED: "canceled",
  UNPAID: "unpaid",
  PAUSED: "paused",
} as const;

export type SubscriptionStatus = (typeof SubscriptionStatus)[keyof typeof SubscriptionStatus];

const writableStatuses = new Set<SubscriptionStatus>([
  SubscriptionStatus.ACTIVE,
  SubscriptionStatus.TRIALING,
]);

const readOnlyStatuses = new Set<SubscriptionStatus>([
  SubscriptionStatus.PAST_DUE,
  SubscriptionStatus.UNPAID,
  SubscriptionStatus.PAUSED,
]);

export interface SubscriptionProps {
  id: string;
  companyId: string;
  planKey: PlanKey;
  planVersion: number;
  status: SubscriptionStatus;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  stripePriceId: string | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  stripeUpdatedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export class Subscription {
  private constructor(private readonly props: SubscriptionProps) {}

  static restore(props: SubscriptionProps): Subscription {
    return new Subscription(props);
  }

  /** Ausência de linha paga é deliberadamente o plano gratuito, não um erro. */
  static free(companyId: string): Subscription {
    const now = new Date();
    return new Subscription({
      id: crypto.randomUUID(),
      companyId,
      planKey: PlanKey.FREE,
      planVersion: Plan.of(PlanKey.FREE).version,
      status: SubscriptionStatus.CANCELED,
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      stripePriceId: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      stripeUpdatedAt: now,
      createdAt: now,
      updatedAt: now,
    });
  }

  get id(): string {
    return this.props.id;
  }
  get companyId(): string {
    return this.props.companyId;
  }
  get planKey(): PlanKey {
    return this.props.planKey;
  }
  get planVersion(): number {
    return this.props.planVersion;
  }
  get status(): SubscriptionStatus {
    return this.props.status;
  }
  get stripeCustomerId(): string | null {
    return this.props.stripeCustomerId;
  }
  get stripeSubscriptionId(): string | null {
    return this.props.stripeSubscriptionId;
  }
  get stripePriceId(): string | null {
    return this.props.stripePriceId;
  }
  get currentPeriodEnd(): Date | null {
    return this.props.currentPeriodEnd;
  }
  get cancelAtPeriodEnd(): boolean {
    return this.props.cancelAtPeriodEnd;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  /** Sem assinatura ativa usa free; inadimplência de uma ativa fica read-only. */
  get effectivePlan(): Plan {
    return Plan.of(writableStatuses.has(this.status) ? this.planKey : PlanKey.FREE);
  }

  get isReadOnly(): boolean {
    return readOnlyStatuses.has(this.status);
  }
}
