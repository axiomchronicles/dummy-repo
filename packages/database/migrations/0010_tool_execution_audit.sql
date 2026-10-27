ALTER TABLE tool_executions DROP CONSTRAINT IF EXISTS tool_executions_execution_mode_check;
--> statement-breakpoint
ALTER TABLE tool_executions ADD CONSTRAINT tool_executions_execution_mode_check CHECK (execution_mode IN ('read','draft','simulation','side_effect'));
--> statement-breakpoint
ALTER TABLE tool_executions ADD COLUMN input_redacted jsonb;
--> statement-breakpoint
ALTER TABLE tool_executions ADD COLUMN output_redacted jsonb;
--> statement-breakpoint
ALTER TABLE tool_executions ADD COLUMN error_category text;
