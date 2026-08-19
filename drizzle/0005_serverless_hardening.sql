CREATE TABLE "api_rate_limits" (
	"scope" text NOT NULL,
	"key_hash" text NOT NULL,
	"window_started_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"hits" integer NOT NULL,
	CONSTRAINT "api_rate_limits_scope_key_hash_pk" PRIMARY KEY("scope", "key_hash"),
	CONSTRAINT "api_rate_limits_hits_positive" CHECK ("hits" > 0),
	CONSTRAINT "api_rate_limits_window_valid" CHECK ("expires_at" > "window_started_at")
);
--> statement-breakpoint
CREATE INDEX "api_rate_limits_expires_at_idx" ON "api_rate_limits" USING btree ("expires_at");
--> statement-breakpoint
-- O backend usa o wire protocol; o contador nunca é superfície da Data API.
ALTER TABLE "api_rate_limits" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DO $$
DECLARE
  api_role text;
BEGIN
  FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role']
  LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
      EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE "api_rate_limits" FROM %I', api_role);
    END IF;
  END LOOP;
END
$$;
