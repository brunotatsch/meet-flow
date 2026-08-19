import { db } from "@services/database/client";
import type { AuditLog, AuditLogEntry } from "../../domain/audit-log";
import { auditEvents } from "./schema/audit-events";

export class DrizzleAuditLog implements AuditLog {
  async record(entry: AuditLogEntry): Promise<void> {
    await db.insert(auditEvents).values({
      companyId: entry.companyId,
      actorUserId: entry.actorUserId ?? null,
      actorType: entry.actorType,
      action: entry.action,
      resource: entry.resource,
      resourceId: entry.resourceId,
      metadata: entry.metadata ?? {},
    });
  }
}
