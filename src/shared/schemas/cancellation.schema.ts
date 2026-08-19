import { z } from "zod";

export const CancelBookingByTokenSchema = z.object({
  token: z.string().min(40).max(2_000),
});

export const CancelBookingByTokenResponseSchema = z.object({
  status: z.literal("cancelled"),
});
