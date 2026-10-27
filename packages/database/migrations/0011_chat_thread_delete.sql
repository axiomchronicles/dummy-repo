-- Deleting a chat thread must keep its tool-execution audit rows.
ALTER TABLE tool_executions ALTER COLUMN thread_id DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE tool_executions DROP CONSTRAINT IF EXISTS tool_executions_thread_id_fkey;
--> statement-breakpoint
ALTER TABLE tool_executions DROP CONSTRAINT IF EXISTS tool_executions_thread_id_chat_threads_id_fk;
--> statement-breakpoint
ALTER TABLE tool_executions ADD CONSTRAINT tool_executions_thread_id_fkey FOREIGN KEY (thread_id) REFERENCES chat_threads(id) ON DELETE SET NULL;
