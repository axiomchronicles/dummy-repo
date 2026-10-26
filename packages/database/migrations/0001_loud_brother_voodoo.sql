ALTER TABLE "analyses" ADD CONSTRAINT "analyses_status_allowed" CHECK ("analyses"."status" IN ('pending','processing','completed','failed','cancelled'));--> statement-breakpoint
ALTER TABLE "call_attempts" ADD CONSTRAINT "call_attempts_status_allowed" CHECK ("call_attempts"."status" IN ('created','dispatching','accepted','connected','completed','failed','unknown','cancelled'));--> statement-breakpoint
ALTER TABLE "call_attempts" ADD CONSTRAINT "call_attempts_provider_allowed" CHECK ("call_attempts"."provider" IN ('mock','sarvam'));--> statement-breakpoint
ALTER TABLE "call_attempts" ADD CONSTRAINT "call_attempts_mode_allowed" CHECK ("call_attempts"."mode" IN ('simulation','live'));--> statement-breakpoint
ALTER TABLE "call_attempts" ADD CONSTRAINT "call_attempts_outcome_allowed" CHECK ("call_attempts"."outcome" IN ('connected','no_answer','busy','failed','unknown','cancelled'));--> statement-breakpoint
ALTER TABLE "campaign_contacts" ADD CONSTRAINT "campaign_contacts_status_allowed" CHECK ("campaign_contacts"."status" IN ('pending','queued','calling','completed','excluded','unknown','cancelled'));--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_status_allowed" CHECK ("campaigns"."status" IN ('draft','planned','running','paused','completed','cancelled','failed'));--> statement-breakpoint
ALTER TABLE "import_rows" ADD CONSTRAINT "import_rows_status_allowed" CHECK ("import_rows"."status" IN ('valid','invalid','excluded','duplicate'));--> statement-breakpoint
ALTER TABLE "imports" ADD CONSTRAINT "imports_status_allowed" CHECK ("imports"."status" IN ('uploaded','validating','ready','needs_correction','failed','cancelled'));--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_status_allowed" CHECK ("reports"."status" IN ('pending','processing','completed','failed','cancelled'));--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_format_allowed" CHECK ("reports"."format" IN ('csv','xlsx'));--> statement-breakpoint
ALTER TABLE "usage_ledger" ADD CONSTRAINT "usage_ledger_mode_allowed" CHECK ("usage_ledger"."mode" IN ('simulation','live'));--> statement-breakpoint
ALTER TABLE "usage_ledger" ADD CONSTRAINT "usage_ledger_kind_allowed" CHECK ("usage_ledger"."kind" IN ('reservation','estimated','verified'));--> statement-breakpoint
ALTER TABLE "webhook_inbox" ADD CONSTRAINT "webhook_inbox_status_allowed" CHECK ("webhook_inbox"."status" IN ('pending','completed','failed'));