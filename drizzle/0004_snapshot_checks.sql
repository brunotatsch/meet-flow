CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"actor_user_id" text,
	"actor_type" text NOT NULL,
	"action" text NOT NULL,
	"resource" text NOT NULL,
	"resource_id" uuid NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audit_events_actor_type_known" CHECK ("actor_type" IN ('user', 'customer', 'system')),
	CONSTRAINT "audit_events_action_known" CHECK ("action" IN ('create', 'update', 'cancel')),
	CONSTRAINT "audit_events_resource_known" CHECK ("resource" IN ('room', 'room_schedule', 'booking')),
	CONSTRAINT "audit_events_user_actor_consistent" CHECK (("actor_type" = 'user') = ("actor_user_id" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_events_company_created_at_idx" ON "audit_events" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_events_resource_idx" ON "audit_events" USING btree ("resource","resource_id");--> statement-breakpoint
CREATE INDEX "audit_events_actor_user_id_idx" ON "audit_events" USING btree ("actor_user_id");--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_key_known" CHECK ("subscriptions"."plan_key" IN ('free', 'starter', 'pro'));--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_version_positive" CHECK ("subscriptions"."plan_version" > 0);--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_pending_requires_expiration" CHECK ("bookings"."status" <> 'pending' OR "bookings"."expires_at" IS NOT NULL);--> statement-breakpoint

ALTER TABLE "audit_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$
DECLARE
  api_role text;
BEGIN
  FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role']
  LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
      EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE "audit_events" FROM %I', api_role);
    END IF;
  END LOOP;
END
$$;
