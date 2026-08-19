import { and, count, eq, gte, lt } from "drizzle-orm";
import { bookings } from "@services/bookings/infra/database/schema/bookings";
import { companies } from "@services/companies/infra/database/schema/companies";
import { db } from "@services/database/client";
import { member } from "@services/identity/infra/database/schema/auth";
import { rooms } from "@services/rooms/infra/database/schema/rooms";
import { UsageRepository, type BillingUsage } from "../../application/usage.repository";

export class DrizzleUsageRepository extends UsageRepository {
  async getUsage(companyId: string, month: Date): Promise<BillingUsage> {
    const from = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), 1));
    const to = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 1));

    const [[roomUsage], [userUsage], [bookingUsage]] = await Promise.all([
      db.select({ value: count() }).from(rooms).where(eq(rooms.companyId, companyId)),
      db
        .select({ value: count() })
        .from(member)
        .innerJoin(companies, eq(companies.organizationId, member.organizationId))
        .where(eq(companies.id, companyId)),
      db
        .select({ value: count() })
        .from(bookings)
        .where(
          and(
            eq(bookings.companyId, companyId),
            gte(bookings.createdAt, from),
            lt(bookings.createdAt, to),
          ),
        ),
    ]);

    return {
      rooms: Number(roomUsage?.value ?? 0),
      users: Number(userUsage?.value ?? 0),
      bookings: Number(bookingUsage?.value ?? 0),
    };
  }
}
