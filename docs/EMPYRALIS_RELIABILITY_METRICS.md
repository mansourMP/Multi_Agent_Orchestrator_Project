# Empyralis Reliability Metrics

This document defines the canonical reliability snapshot exposed by the runtime.

Primary reporting path:
- `GET /runtime/runtimes/reliability`

The snapshot is intended to be lightweight and auditable. It is not a historical warehouse or a synthetic dashboard.

## Measurement Rules

- Control-plane API health and latency are measured live from the current runtime process start.
- Run enqueue acknowledgment latency is measured live from `create_live_run()` entry to canonical activation or queue acknowledgment.
- Approval propagation latency is measured live from approval `requested_at` to approval `resolved_at`.
- Artifact availability latency is measured live from artifact-store request start to canonical artifact metadata persistence and object availability through the `artifact://` path.
- Machine revocation propagation latency is measured live from operator revoke acceptance to the first local control-state response that reports `machine_revoked` with `pause_requested=true`.
- Failed-run replay completeness is a current-state scan over live/archive failed or timeout run snapshots. It is not backfilled from an external SLO warehouse.

## Canonical Metrics

### Control Plane API Health

- Target: `99.9%`
- Measurement:
  - numerator: requests that return a non-`5xx` status
  - denominator: all control-plane requests observed by the runtime middleware
- Notes:
  - `4xx` responses count as available service responses, not server outages
  - measured only from current process start

### Run Enqueue Acknowledgment Latency

- Target: `p95 under 500 ms`
- Measurement:
  - from `create_live_run()` start
  - to successful activation / queue acknowledgment of the run

### Approval Propagation Latency

- Target: `p95 under 2 s`
- Measurement:
  - from approval `requested_at`
  - to approval `resolved_at`

### Artifact Availability Latency

- Target: `p95 under 5 s`
- Measurement:
  - from artifact store request start
  - to canonical artifact record persistence and object availability through the artifact service

### Failed Run Replay Completeness

- Target: `100%`
- Measurement:
  - a failed or timed-out run is considered replay-complete only if it retains:
    - `replay_request`
    - `run_detail_contract`
    - `events`

### Machine Lease Revocation Propagation

- Target: `under 5 s`
- Measurement:
  - from machine revoke request acceptance
  - to the first local run control-state response that pauses work due to `machine_revoked`

## Important Limits

- These metrics are truthful live/runtime measurements, not synthetic estimates.
- Historical gaps before this instrumentation existed are not backfilled.
- If a metric has insufficient live samples, the snapshot must say so explicitly instead of pretending compliance.
