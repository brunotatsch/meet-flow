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
