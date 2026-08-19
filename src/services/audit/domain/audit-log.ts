export const AuditActorType = {
  USER: "user",
  CUSTOMER: "customer",
  SYSTEM: "system",
} as const;

export type AuditActorType = (typeof AuditActorType)[keyof typeof AuditActorType];

export const AuditAction = {
  CREATE: "create",
  UPDATE: "update",
  CANCEL: "cancel",
  DELETE: "delete",
} as const;

export type AuditAction = (typeof AuditAction)[keyof typeof AuditAction];

export const AuditResource = {
  ROOM: "room",
  ROOM_SCHEDULE: "room_schedule",
  BOOKING: "booking",
  ROOM_BLOCK: "room_block",
} as const;

export type AuditResource = (typeof AuditResource)[keyof typeof AuditResource];

export interface AuditLogEntry {
  companyId: string;
  actorType: AuditActorType;
  actorUserId?: string | null;
  action: AuditAction;
  resource: AuditResource;
  resourceId: string;
  metadata?: Record<string, unknown>;
}

/**
 * Porta pequena de auditoria para manter controllers testáveis e impedir que
 * detalhes do Drizzle vazem para os módulos de salas e reservas.
 */
export interface AuditLog {
  record(entry: AuditLogEntry): Promise<void>;
}
