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
    last_heartbeat_at TIMESTAMPTZ NULL,
    last_progress_at TIMESTAMPTZ NULL,
    ttl INTEGER NOT NULL,
    trace_id TEXT,
    last_worker_note TEXT NULL
);

CREATE TABLE IF NOT EXISTS local_queue_dead_letters (
    run_id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    workspace_id TEXT NOT NULL,
    specialist_key TEXT NULL,
    reason TEXT NOT NULL,
    trace_id TEXT,
    failure_count INTEGER NOT NULL DEFAULT 0,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    first_recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fleet_worker_registrations (
    worker_id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    workspace_id TEXT NOT NULL,
    machine_id TEXT NOT NULL,
    runtime_type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'idle',
    control_state TEXT NOT NULL DEFAULT 'active',
    current_run_id TEXT NULL,
    instance_id TEXT NULL,
    shard_key TEXT NOT NULL,
    prewarm_state TEXT NULL,
    warm_pool TEXT NULL,
    lease_seconds INTEGER NOT NULL DEFAULT 30,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_heartbeat_at TIMESTAMPTZ NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fleet_queue_partitions (
    partition_id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    workspace_id TEXT NOT NULL,
    specialist_key TEXT NOT NULL,
    pending_count INTEGER NOT NULL DEFAULT 0,
    claimed_count INTEGER NOT NULL DEFAULT 0,
    online_workers INTEGER NOT NULL DEFAULT 0,
    busy_workers INTEGER NOT NULL DEFAULT 0,
    idle_workers INTEGER NOT NULL DEFAULT 0,
    prewarmed_workers INTEGER NOT NULL DEFAULT 0,
    state TEXT NOT NULL DEFAULT 'healthy',
    retry_after_seconds INTEGER NOT NULL DEFAULT 0,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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

CREATE TABLE IF NOT EXISTS runtime_sessions (
    session_id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    tenant_id TEXT NOT NULL,
    channel TEXT NOT NULL,
    actor JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_live_runs_workspace_state ON live_runs(workspace_id, state);
CREATE INDEX IF NOT EXISTS idx_run_transitions_run_id ON run_transitions(run_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_run_approvals_run_id ON run_approvals(run_id, requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_local_queue_claims_worker_id ON local_queue_claims(worker_id, claimed_at DESC);
CREATE INDEX IF NOT EXISTS idx_local_queue_claims_heartbeat ON local_queue_claims(last_heartbeat_at DESC, claimed_at DESC);
CREATE INDEX IF NOT EXISTS idx_local_queue_dead_letters_workspace ON local_queue_dead_letters(workspace_id, last_recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_local_queue_dead_letters_specialist ON local_queue_dead_letters(specialist_key, last_recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_fleet_worker_registrations_workspace_seen ON fleet_worker_registrations(workspace_id, last_heartbeat_at DESC, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_fleet_worker_registrations_shard ON fleet_worker_registrations(shard_key, status, control_state);
CREATE INDEX IF NOT EXISTS idx_fleet_worker_registrations_prewarm ON fleet_worker_registrations(prewarm_state, runtime_type, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_fleet_queue_partitions_workspace ON fleet_queue_partitions(workspace_id, state, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_fleet_queue_partitions_specialist ON fleet_queue_partitions(specialist_key, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_run_archive_workspace_state ON run_archive(workspace_id, final_state, completed_at DESC);
CREATE INDEX IF NOT EXISTS idx_runtime_sessions_workspace_expires ON runtime_sessions(workspace_id, expires_at DESC);
