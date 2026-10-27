ALTER TABLE consent_records ADD COLUMN scope text NOT NULL DEFAULT 'unspecified';
--> statement-breakpoint
CREATE TABLE tool_executions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 workspace_id uuid NOT NULL REFERENCES workspaces(id),
 actor_id uuid NOT NULL REFERENCES users(id),
 thread_id uuid NOT NULL REFERENCES chat_threads(id),
 name text NOT NULL,
 execution_mode text NOT NULL CHECK (execution_mode IN ('read','draft','simulation','live')),
 status text NOT NULL CHECK (status IN ('running','completed','failed')),
 error_code text,
 started_at timestamptz NOT NULL DEFAULT now(),
 completed_at timestamptz
);
--> statement-breakpoint
CREATE INDEX tool_executions_thread_idx ON tool_executions(workspace_id,thread_id,started_at);
--> statement-breakpoint
CREATE TABLE call_artifacts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 workspace_id uuid NOT NULL,
 call_attempt_id uuid NOT NULL UNIQUE,
 interaction_id text NOT NULL,
 transcript_status text NOT NULL DEFAULT 'processing',
 recording_status text NOT NULL DEFAULT 'processing',
 recording bytea,
 recording_content_type text,
 attempts integer NOT NULL DEFAULT 0,
 next_poll_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 failure_code text,
 FOREIGN KEY(workspace_id,call_attempt_id) REFERENCES call_attempts(workspace_id,id)
);
--> statement-breakpoint
CREATE INDEX call_artifacts_poll_idx ON call_artifacts(next_poll_at) WHERE recording_status='processing' OR transcript_status='processing';
