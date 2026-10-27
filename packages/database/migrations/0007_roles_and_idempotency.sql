ALTER TABLE memberships DROP CONSTRAINT membership_role;
--> statement-breakpoint
ALTER TABLE memberships ADD CONSTRAINT membership_role CHECK (role IN ('superadmin','admin','owner','operator','viewer'));
--> statement-breakpoint
CREATE UNIQUE INDEX campaigns_launch_key_idx ON campaigns(workspace_id,launch_key) WHERE launch_key IS NOT NULL;
--> statement-breakpoint
ALTER TABLE call_attempts ADD COLUMN provider_polled_at timestamptz;
