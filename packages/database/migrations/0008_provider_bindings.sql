CREATE TABLE provider_agent_bindings (
 workspace_id uuid NOT NULL,
 agent_version_id uuid NOT NULL,
 app_id text NOT NULL,
 app_version integer NOT NULL CHECK(app_version>0),
 voice_id text NOT NULL,
 voice_model text NOT NULL,
 language text NOT NULL,
 fingerprint text NOT NULL,
 read_contract jsonb NOT NULL,
 synchronized_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(workspace_id,agent_version_id),
 FOREIGN KEY(workspace_id,agent_version_id) REFERENCES agent_versions(workspace_id,id)
);
