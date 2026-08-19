-- Índices parciais de cobertura para as duas populações do relatório. O índice
-- geral `(company_id, starts_at)` já existe desde 0000 e atende os totais.
CREATE INDEX IF NOT EXISTS "bookings_company_report_occupancy_idx"
  ON "bookings" ("company_id", "status", "starts_at")
  INCLUDE ("ends_at", "room_id")
  WHERE "confirmed_at" IS NOT NULL
    AND "status" IN ('confirmed', 'completed');
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bookings_company_report_paid_idx"
  ON "bookings" ("company_id", "starts_at")
  INCLUDE ("room_id", "total_in_cents", "status")
  WHERE "stripe_payment_intent_id" IS NOT NULL;
