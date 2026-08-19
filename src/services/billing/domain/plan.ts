export const PLAN_CATALOG_VERSION = 1;

export const PlanKey = {
  FREE: "free",
  STARTER: "starter",
  PRO: "pro",
} as const;

export type PlanKey = (typeof PlanKey)[keyof typeof PlanKey];
export type LimitedResource = "rooms" | "users" | "bookings";

export interface PlanLimits {
  rooms: number;
  users: number;
  bookings: number;
}

export interface PlanProps {
  key: PlanKey;
  name: string;
  version: number;
  limits: PlanLimits;
}

/**
 * Limites versionados em código. Alterar estes números exige incrementar
 * `PLAN_CATALOG_VERSION`, para que suporte e auditoria saibam qual regra valeu.
 */
const definitions: Record<PlanKey, PlanProps> = {
  free: {
    key: PlanKey.FREE,
    name: "Gratuito",
    version: PLAN_CATALOG_VERSION,
    limits: { rooms: 1, users: 1, bookings: 50 },
  },
  starter: {
    key: PlanKey.STARTER,
    name: "Starter",
    version: PLAN_CATALOG_VERSION,
    limits: { rooms: 5, users: 5, bookings: 500 },
  },
  pro: {
    key: PlanKey.PRO,
    name: "Pro",
    version: PLAN_CATALOG_VERSION,
    limits: { rooms: 25, users: 25, bookings: 5_000 },
  },
};

export class Plan {
  private constructor(private readonly props: PlanProps) {}

  static of(key: PlanKey): Plan {
    return new Plan(definitions[key]);
  }

  static isPlanKey(value: string): value is PlanKey {
    return value in definitions;
  }

  get key(): PlanKey {
    return this.props.key;
  }

  get name(): string {
    return this.props.name;
  }

  get version(): number {
    return this.props.version;
  }

  get limits(): Readonly<PlanLimits> {
    return this.props.limits;
  }

  limitFor(resource: LimitedResource): number {
    return this.props.limits[resource];
  }
}

export const allPlans = (): Plan[] => [PlanKey.FREE, PlanKey.STARTER, PlanKey.PRO].map(Plan.of);
