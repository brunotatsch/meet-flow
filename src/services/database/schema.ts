/**
 * Barrel do schema do banco, consumido pelo client Drizzle em runtime.
 * O drizzle-kit não lê este arquivo: ele varre
 * `src/services/**\/infra/database/schema/*.ts` direto (ver `drizzle.config.ts`).
 */
export {
  account,
  invitation,
  member,
  organization,
  session,
  user,
  verification,
} from "@services/identity/infra/database/schema/auth";
export { companies, companyType } from "@services/companies/infra/database/schema/companies";
export { rooms } from "@services/rooms/infra/database/schema/rooms";
export { roomSchedules } from "@services/rooms/infra/database/schema/room-schedules";
export { bookings, bookingStatus } from "@services/bookings/infra/database/schema/bookings";
export { auditEvents } from "@services/audit/infra/database/schema/audit-events";
export { roomBlocks } from "@services/room-blocks/infra/database/schema/room-blocks";
export {
  stripeEvents,
  subscriptions,
  subscriptionStatus,
} from "@services/billing/infra/database/schema/billing";
export {
  emailOutbox,
  emailOutboxKind,
  emailOutboxStatus,
} from "@services/notifications/infra/database/schema/email-outbox";
