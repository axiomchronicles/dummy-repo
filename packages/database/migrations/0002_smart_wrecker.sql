ALTER TABLE "call_attempts" ALTER COLUMN "duration_seconds" SET DATA TYPE double precision;--> statement-breakpoint
ALTER TABLE "call_attempts" ADD COLUMN "provider_config" jsonb;