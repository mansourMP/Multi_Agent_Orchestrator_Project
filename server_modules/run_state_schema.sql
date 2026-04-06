CREATE TABLE IF NOT EXISTS live_runs (
    run_id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    tenant_id TEXT NOT NULL,
    state TEXT NOT NULL,
    payload JSONB NOT NULL,
    trace_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS run_transitions (
    id BIGSERIAL PRIMARY KEY,
    run_id TEXT NOT NULL,
    from_state TEXT NOT NULL,
    to_state TEXT NOT NULL,
    actor TEXT NOT NULL,
    trace_id TEXT,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS run_approvals (
    id BIGSERIAL PRIMARY KEY,
    run_id TEXT NOT NULL,
    step_id TEXT NOT NULL,
    requested_at TIMESTAMPTZ NOT NULL,
    resolved_at TIMESTAMPTZ,
    resolution TEXT,
    actor TEXT,
    trace_id TEXT
);

CREATE TABLE IF NOT EXISTS local_queue_claims (
    run_id TEXT PRIMARY KEY,
    worker_id TEXT NOT NULL,
    claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ttl INTEGER NOT NULL,
    trace_id TEXT
);

CREATE TABLE IF NOT EXISTS run_archive (
    run_id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    tenant_id TEXT NOT NULL,
    final_state TEXT NOT NULL,
    payload JSONB NOT NULL,
    trace_id TEXT,
    completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_live_runs_workspace_state ON live_runs(workspace_id, state);
CREATE INDEX IF NOT EXISTS idx_run_transitions_run_id ON run_transitions(run_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_run_approvals_run_id ON run_approvals(run_id, requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_local_queue_claims_worker_id ON local_queue_claims(worker_id, claimed_at DESC);
CREATE INDEX IF NOT EXISTS idx_run_archive_workspace_state ON run_archive(workspace_id, final_state, completed_at DESC);
