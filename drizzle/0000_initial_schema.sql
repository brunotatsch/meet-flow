CREATE TYPE "public"."booking_status" AS ENUM('pending', 'confirmed', 'cancelled', 'completed');--> statement-breakpoint
CREATE TYPE "public"."company_type" AS ENUM('hotel', 'coworking');--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"room_id" uuid NOT NULL,
	"customer_name" text NOT NULL,
	"customer_email" text NOT NULL,
	"customer_phone" text,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"status" "booking_status" DEFAULT 'pending' NOT NULL,
	"total_in_cents" integer NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bookings_period_valid" CHECK ("bookings"."ends_at" > "bookings"."starts_at"),
	CONSTRAINT "bookings_total_non_negative" CHECK ("bookings"."total_in_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"type" "company_type" NOT NULL,
	"timezone" text DEFAULT 'America/Sao_Paulo' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "companies_organization_id_unique" UNIQUE("organization_id"),
	CONSTRAINT "companies_slug_unique" UNIQUE("slug"),
	CONSTRAINT "companies_slug_not_blank" CHECK (length(btrim("companies"."slug")) > 0)
);
--> statement-breakpoint
CREATE TABLE "room_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"room_id" uuid NOT NULL,
	"weekday" smallint NOT NULL,
	"opens_at" time NOT NULL,
	"closes_at" time NOT NULL,
	"slot_minutes" integer DEFAULT 60 NOT NULL,
	CONSTRAINT "room_schedules_room_id_weekday_unique" UNIQUE("room_id","weekday"),
	CONSTRAINT "room_schedules_weekday_range" CHECK ("room_schedules"."weekday" between 0 and 6),
	CONSTRAINT "room_schedules_window_valid" CHECK ("room_schedules"."closes_at" > "room_schedules"."opens_at"),
	CONSTRAINT "room_schedules_slot_minutes_positive" CHECK ("room_schedules"."slot_minutes" > 0)
);
--> statement-breakpoint
CREATE TABLE "rooms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"capacity" integer NOT NULL,
	"hourly_rate_in_cents" integer NOT NULL,
	"amenities" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"photo_url" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rooms_company_id_name_unique" UNIQUE("company_id","name"),
	CONSTRAINT "rooms_id_company_id_unique" UNIQUE("id","company_id"),
	CONSTRAINT "rooms_capacity_positive" CHECK ("rooms"."capacity" > 0),
	CONSTRAINT "rooms_hourly_rate_non_negative" CHECK ("rooms"."hourly_rate_in_cents" >= 0)
);
--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_room_id_company_id_fk" FOREIGN KEY ("room_id","company_id") REFERENCES "public"."rooms"("id","company_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_schedules" ADD CONSTRAINT "room_schedules_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bookings_company_id_starts_at_idx" ON "bookings" USING btree ("company_id","starts_at");--> statement-breakpoint
CREATE INDEX "bookings_room_id_starts_at_idx" ON "bookings" USING btree ("room_id","starts_at");--> statement-breakpoint
CREATE INDEX "rooms_company_id_idx" ON "rooms" USING btree ("company_id");