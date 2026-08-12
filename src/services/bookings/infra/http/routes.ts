import type { FastifyInstance } from "fastify";
import { DrizzleCompanyRepository } from "@services/companies/infra/database/drizzle-company.repository";
import { requireAuth } from "@services/identity/infra/http/require-auth";
import { CancelBookingUseCase } from "../../application/cancel-booking.use-case";
import { ListBookingsUseCase } from "../../application/list-bookings.use-case";
import { DrizzleBookingRepository } from "../database/drizzle-booking.repository";
import { BookingController } from "./booking.controller";

/**
 * Rotas administrativas de reservas, atrás de `requireAuth`.
 *
 * A dupla pública (`GET .../availability` e `POST .../bookings`) mora no plugin
 * `/public/:companySlug` (`@services/http/routes/public`), que centraliza a
 * resolução de slug e o rate limit das rotas do wizard. Ver `docs/architecture.md`.
 */
export async function registerBookingRoutes(app: FastifyInstance): Promise<void> {
  const companyRepository = new DrizzleCompanyRepository();
  const bookingRepository = new DrizzleBookingRepository();

  const bookingController = new BookingController(
    companyRepository,
    new ListBookingsUseCase(bookingRepository),
    new CancelBookingUseCase(bookingRepository),
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
