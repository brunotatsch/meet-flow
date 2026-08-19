import type { LimitedResource } from "../domain/plan";

export interface BillingUsage {
  rooms: number;
  users: number;
  bookings: number;
}

export abstract class UsageRepository {
  abstract getUsage(companyId: string, month: Date): Promise<BillingUsage>;

  async count(companyId: string, resource: LimitedResource, month: Date): Promise<number> {
    return (await this.getUsage(companyId, month))[resource];
  }
}
