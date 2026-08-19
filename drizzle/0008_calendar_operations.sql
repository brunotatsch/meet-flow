-- Estado operacional da reserva. Os carimbos são persistidos porque uma Function
-- Serverless pode desaparecer imediatamente após responder; nenhum timer ou mapa
-- em memória participa de check-in/check-out.
ALTER TYPE "public"."booking_status" ADD VALUE IF NOT EXISTS 'no_show';--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "checked_in_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "checked_out_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_actual_times_ordered" CHECK (
  "checked_out_at" IS NULL
  OR (
    "checked_in_at" IS NOT NULL
    AND "checked_out_at" >= "checked_in_at"
  )
);--> statement-breakpoint

-- `no_show` fica propositalmente dentro de `bookings_no_overlap`: ele representa
-- que a janela reservada foi consumida/encerrada sem presença, não um cancelamento
-- que devolve o horário. Depois de `ends_at`, a constraint não interfere em nada.
COMMENT ON COLUMN "bookings"."checked_in_at" IS
  'Horário real do check-in confirmado por um usuário da empresa.';--> statement-breakpoint
COMMENT ON COLUMN "bookings"."checked_out_at" IS
  'Horário real do check-out que encerrou a reserva como completed.';
