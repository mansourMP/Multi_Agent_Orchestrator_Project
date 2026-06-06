# Runtime Domain

Status: Active
Owner: Platform
Last verified: 2026-06-06
Source of truth: runtime API, runtime common policy, queues, and worker code

Use this folder for cloud runtime, local runtime, runtime enrollment, session
tokens, worker queues, leases, quotas, and runtime security.

This folder is the shared runtime substrate, not a merged product contract for
all agents. Product-facing runtime rules live in the domain docs:

- Sage runtime: `docs/domains/sage/runtime.md`
- Studio runtime: `docs/domains/studio/runtime.md`
- Agent Computer runtime/access: `docs/domains/agent-computer/runtime.md`

Shared infrastructure may serve Sage, Studio, and future runtimes, but identity,
authorization, memory, channel ownership, and access mode rules must remain
separate per product domain.

Current source files:

- `server_modules/runtime_runtime_api.py`
- `server_modules/runtime_common.py`
- `server_modules/local_queue.py`
- `server_modules/machine_lease_service.py`
- `server_modules/runtime_attachment_service.py`
- `scripts/orion_local_worker_runtime.py`

## Files

- `enrollment.md`
- `session-tokens.md`
- `credits-quotas.md`
- `local-worker.md`
- `cloud-runtime.md`
- `security.md`
- `tests.md`
- `FILL_PROMPT.md`

## Existing Docs To Reconcile

- `docs/agent-runtime-simplification.md`
- `docs/history-storage-runtime-boundary-2026-05-01.md`
- `docs/platform/canonical-architecture-contract.md`
- `docs/domains/agent-computer/runtime.md`
