-- Cada migration pode abrir uma sessão nova. O opclass GiST de UUID instalado por
-- btree_gist vive em extensions no Supabase, então não dependemos do SET da 0001.
SET search_path TO public, extensions;
--> statement-breakpoint
CREATE TABLE "room_blocks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL,
  "room_id" uuid NOT NULL,
  "starts_at" timestamp with time zone NOT NULL,
  "ends_at" timestamp with time zone NOT NULL,
  "reason" text NOT NULL,
  "created_by" text NOT NULL,
  "recurrence_group_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "period" tstzrange GENERATED ALWAYS AS (tstzrange("starts_at", "ends_at", '[)')) STORED,
  CONSTRAINT "room_blocks_period_valid" CHECK ("ends_at" > "starts_at"),
  CONSTRAINT "room_blocks_reason_valid" CHECK (length(btrim("reason")) BETWEEN 1 AND 500)
);
--> statement-breakpoint
ALTER TABLE "room_blocks" ADD CONSTRAINT "room_blocks_company_id_companies_id_fk"
  FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "room_blocks" ADD CONSTRAINT "room_blocks_room_id_company_id_fk"
  FOREIGN KEY ("room_id", "company_id") REFERENCES "public"."rooms"("id", "company_id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "room_blocks" ADD CONSTRAINT "room_blocks_no_overlap"
  EXCLUDE USING gist ("room_id" WITH =, "period" WITH &&);
--> statement-breakpoint
CREATE INDEX "room_blocks_company_starts_at_idx" ON "room_blocks" ("company_id", "starts_at");
--> statement-breakpoint
CREATE INDEX "room_blocks_room_starts_at_idx" ON "room_blocks" ("room_id", "starts_at");
--> statement-breakpoint
CREATE INDEX "room_blocks_recurrence_group_idx" ON "room_blocks" ("recurrence_group_id");
--> statement-breakpoint

-- Uma única linha de `rooms` é o mutex durável da ocupação. Tanto inserts/updates
-- de reserva quanto de bloqueio passam por ela antes de consultar a outra tabela.
-- Assim duas Functions concorrentes não podem observar ambas "sem conflito".
CREATE OR REPLACE FUNCTION "enforce_room_occupancy"() RETURNS trigger AS $$
BEGIN
  PERFORM 1 FROM "rooms"
   WHERE "id" = NEW."room_id" AND "company_id" = NEW."company_id"
   FOR UPDATE;

  IF TG_TABLE_NAME = 'bookings' THEN
    IF NEW."status" <> 'cancelled'
       AND (NEW."status" <> 'pending' OR NEW."expires_at" > now())
       AND EXISTS (
         SELECT 1 FROM "room_blocks" rb
          WHERE rb."company_id" = NEW."company_id"
            AND rb."room_id" = NEW."room_id"
            AND rb."starts_at" < NEW."ends_at"
            AND rb."ends_at" > NEW."starts_at"
       ) THEN
      RAISE EXCEPTION 'booking overlaps room block'
        USING ERRCODE = '23P01', CONSTRAINT = 'bookings_room_blocks_no_overlap';
    END IF;
  ELSE
    IF EXISTS (
      SELECT 1 FROM "bookings" b
       WHERE b."company_id" = NEW."company_id"
         AND b."room_id" = NEW."room_id"
         AND b."status" <> 'cancelled'
         AND (b."status" <> 'pending' OR b."expires_at" > now())
         AND b."starts_at" < NEW."ends_at"
         AND b."ends_at" > NEW."starts_at"
    ) THEN
      RAISE EXCEPTION 'room block overlaps booking'
        USING ERRCODE = '23P01', CONSTRAINT = 'room_blocks_bookings_no_overlap';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER "bookings_enforce_room_occupancy"
  BEFORE INSERT OR UPDATE OF "company_id", "room_id", "starts_at", "ends_at", "status", "expires_at"
  ON "bookings" FOR EACH ROW EXECUTE FUNCTION "enforce_room_occupancy"();
--> statement-breakpoint
CREATE TRIGGER "room_blocks_enforce_room_occupancy"
  BEFORE INSERT OR UPDATE OF "company_id", "room_id", "starts_at", "ends_at"
  ON "room_blocks" FOR EACH ROW EXECUTE FUNCTION "enforce_room_occupancy"();
--> statement-breakpoint

ALTER TABLE "audit_events" DROP CONSTRAINT "audit_events_action_known";
--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_action_known"
  CHECK ("action" IN ('create', 'update', 'cancel', 'delete'));
--> statement-breakpoint
ALTER TABLE "audit_events" DROP CONSTRAINT "audit_events_resource_known";
--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_resource_known"
  CHECK ("resource" IN ('room', 'room_schedule', 'booking', 'room_block'));
--> statement-breakpoint

ALTER TABLE "room_blocks" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DO $$
DECLARE api_role text;
BEGIN
  FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
      EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE "room_blocks" FROM %I', api_role);
    END IF;
  END LOOP;
END
$$;
