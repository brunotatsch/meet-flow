import type { FastifyInstance } from "fastify";
import { DrizzleCompanyRepository } from "@services/companies/infra/database/drizzle-company.repository";
import { DrizzleRoomScheduleRepository } from "@services/rooms/infra/database/drizzle-room-schedule.repository";
import { DrizzleRoomRepository } from "@services/rooms/infra/database/drizzle-room.repository";
import { CheckAvailabilityUseCase } from "../../application/check-availability.use-case";
import { DrizzleBookingRepository } from "../database/drizzle-booking.repository";
import { SystemClock } from "../system-clock";
import { PublicAvailabilityController } from "./public-availability.controller";

export async function registerBookingRoutes(app: FastifyInstance): Promise<void> {
  const companyRepository = new DrizzleCompanyRepository();
  const controller = new PublicAvailabilityController(
    companyRepository,
    new CheckAvailabilityUseCase(
      companyRepository,
      new DrizzleRoomRepository(),
      new DrizzleRoomScheduleRepository(),
      new DrizzleBookingRepository(),
      new SystemClock(),
    ),
  );

  /** Sem `requireAuth`: é o passo 2 do wizard, consumido por quem ainda não tem conta. */
  app.get<{
    Params: { companySlug: string; roomId: string };
    Querystring: { date?: string };
  }>("/public/:companySlug/rooms/:roomId/availability", (request, reply) =>
    controller.availability(request, reply),
  );
}
