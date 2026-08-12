import type { FastifyInstance } from "fastify";
import { DrizzleCompanyRepository } from "@services/companies/infra/database/drizzle-company.repository";
import { requireAuth } from "@services/identity/infra/http/require-auth";
import { DrizzleRoomScheduleRepository } from "@services/rooms/infra/database/drizzle-room-schedule.repository";
import { DrizzleRoomRepository } from "@services/rooms/infra/database/drizzle-room.repository";
import { CancelBookingUseCase } from "../../application/cancel-booking.use-case";
import { CheckAvailabilityUseCase } from "../../application/check-availability.use-case";
import { CreateBookingUseCase } from "../../application/create-booking.use-case";
import { ListBookingsUseCase } from "../../application/list-bookings.use-case";
import { DrizzleBookingRepository } from "../database/drizzle-booking.repository";
import { SystemClock } from "../system-clock";
import { BookingController } from "./booking.controller";
import { PublicAvailabilityController } from "./public-availability.controller";
import { PublicBookingController } from "./public-booking.controller";

export async function registerBookingRoutes(app: FastifyInstance): Promise<void> {
  const companyRepository = new DrizzleCompanyRepository();
  const roomRepository = new DrizzleRoomRepository();
  const roomScheduleRepository = new DrizzleRoomScheduleRepository();
  const bookingRepository = new DrizzleBookingRepository();
  const clock = new SystemClock();

  const availabilityController = new PublicAvailabilityController(
    companyRepository,
    new CheckAvailabilityUseCase(
      companyRepository,
      roomRepository,
      roomScheduleRepository,
      bookingRepository,
      clock,
    ),
  );

  const publicBookingController = new PublicBookingController(
    companyRepository,
    new CreateBookingUseCase(
      companyRepository,
      roomRepository,
      roomScheduleRepository,
      bookingRepository,
      clock,
    ),
  );

  const bookingController = new BookingController(
    companyRepository,
    new ListBookingsUseCase(bookingRepository),
    new CancelBookingUseCase(bookingRepository),
  );

  /** Sem `requireAuth`: é o passo 2 do wizard, consumido por quem ainda não tem conta. */
  app.get<{
    Params: { companySlug: string; roomId: string };
    Querystring: { date?: string };
  }>("/public/:companySlug/rooms/:roomId/availability", (request, reply) =>
    availabilityController.availability(request, reply),
  );

  /**
   * Passo 4 do wizard, também sem sessão. A sala vem no corpo e a empresa no slug;
   * preço e status são decididos pelo servidor.
   */
  app.post<{ Params: { companySlug: string } }>("/public/:companySlug/bookings", (request, reply) =>
    publicBookingController.create(request, reply),
  );

  app.get("/bookings", { preHandler: requireAuth }, (request, reply) =>
    bookingController.list(request, reply),
  );

  /**
   * `DELETE` cancela em vez de apagar, como em `/rooms/:id`: a linha permanece com
   * `status = 'cancelled'`, sai do índice de `bookings_no_overlap` e devolve o
   * horário para a grade, sem perder o histórico.
   */
  app.delete<{ Params: { id: string } }>(
    "/bookings/:id",
    { preHandler: requireAuth },
    (request, reply) => bookingController.cancel(request, reply),
  );
}
