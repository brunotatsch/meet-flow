CREATE TYPE "public"."email_outbox_kind" AS ENUM(
  'booking_confirmation_customer',
  'booking_new_company',
  'booking_cancellation_customer',
  'booking_reminder_customer',
  'generic'
);--> statement-breakpoint
CREATE TYPE "public"."email_outbox_status" AS ENUM(
  'pending',
  'processing',
  'sent',
  'failed',
  'dead'
);--> statement-breakpoint
CREATE TABLE "email_outbox" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "kind" "email_outbox_kind" NOT NULL,
  "booking_id" uuid,
  "payload" jsonb,
  "dedupe_key" text NOT NULL,
  "status" "email_outbox_status" DEFAULT 'pending' NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
  "locked_at" timestamp with time zone,
  "last_error" text,
  "provider_message_id" text,
  "delivered_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "email_outbox_dedupe_key_unique" UNIQUE("dedupe_key"),
  CONSTRAINT "email_outbox_attempts_non_negative" CHECK ("attempts" >= 0),
  CONSTRAINT "email_outbox_source_valid" CHECK (
    ("kind" = 'generic' AND "booking_id" IS NULL AND "payload" IS NOT NULL)
    OR
    ("kind" <> 'generic' AND "booking_id" IS NOT NULL AND "payload" IS NULL)
  )
);--> statement-breakpoint
ALTER TABLE "email_outbox"
  ADD CONSTRAINT "email_outbox_booking_id_bookings_id_fk"
  FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id")
  ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "email_outbox_booking_id_idx" ON "email_outbox" ("booking_id");--> statement-breakpoint
CREATE INDEX "email_outbox_due_idx"
  ON "email_outbox" ("status", "next_attempt_at")
  WHERE "status" IN ('pending', 'failed', 'processing');--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.enqueue_booking_email_events()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  became_confirmed boolean;
  became_cancelled boolean;
BEGIN
  became_confirmed :=
    NEW.status = 'confirmed'
    AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status);
  became_cancelled :=
    NEW.status = 'cancelled'
    AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status)
    AND NEW.cancellation_reason IN ('cancelled', 'customer');

  IF became_confirmed THEN
    INSERT INTO public.email_outbox (kind, booking_id, dedupe_key)
    VALUES
      ('booking_confirmation_customer', NEW.id, 'booking-confirmation:' || NEW.id),
      ('booking_new_company', NEW.id, 'booking-company:' || NEW.id)
    ON CONFLICT (dedupe_key) DO NOTHING;

    IF NEW.starts_at > CURRENT_TIMESTAMP + interval '24 hours' THEN
      INSERT INTO public.email_outbox (
        kind,
        booking_id,
        dedupe_key,
        next_attempt_at
      )
      VALUES (
        'booking_reminder_customer',
        NEW.id,
        'booking-reminder:' || NEW.id,
        NEW.starts_at - interval '24 hours'
      )
      ON CONFLICT (dedupe_key) DO NOTHING;
    END IF;
  END IF;

  IF became_cancelled THEN
    INSERT INTO public.email_outbox (kind, booking_id, dedupe_key)
    VALUES (
      'booking_cancellation_customer',
      NEW.id,
      'booking-cancellation:' || NEW.id
    )
    ON CONFLICT (dedupe_key) DO NOTHING;
  END IF;

  RETURN NEW;
END
$$;--> statement-breakpoint
CREATE TRIGGER "bookings_email_outbox_trigger"
AFTER INSERT OR UPDATE OF "status" ON "bookings"
FOR EACH ROW EXECUTE FUNCTION public.enqueue_booking_email_events();--> statement-breakpoint

ALTER TABLE "email_outbox" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$
DECLARE
  api_role text;
BEGIN
  FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role']
  LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
      EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.email_outbox FROM %I', api_role);
    END IF;
  END LOOP;
END
$$;
