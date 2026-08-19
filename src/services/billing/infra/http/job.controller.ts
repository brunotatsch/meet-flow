import type { FastifyReply, FastifyRequest } from "fastify";
import type { ExpirePendingBookingsUseCase } from "../../application/expire-pending-bookings.use-case";
import { requireCronSecret } from "@services/http/cron-auth";

export class BillingJobController {
  constructor(private readonly expirePending: ExpirePendingBookingsUseCase) {}

  async expire(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    requireCronSecret(request, "Job de expiração não configurado.");

    const expired = await this.expirePending.execute();
    return reply.send({ expired });
  }
}
