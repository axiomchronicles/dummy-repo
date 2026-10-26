ALTER TABLE "analyses" ADD COLUMN "summary_source" text DEFAULT 'local' NOT NULL;--> statement-breakpoint
ALTER TABLE "analyses" ADD COLUMN "summary_model" text;--> statement-breakpoint
ALTER TABLE "analyses" ADD COLUMN "summary_failure_code" text;--> statement-breakpoint
ALTER TABLE "analyses" ADD COLUMN "processing_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "analyses" ADD COLUMN "processing_token" uuid;--> statement-breakpoint
ALTER TABLE "analyses" ADD CONSTRAINT "analyses_summary_source_allowed" CHECK ("analyses"."summary_source" IN ('local','sarvam-sdk'));