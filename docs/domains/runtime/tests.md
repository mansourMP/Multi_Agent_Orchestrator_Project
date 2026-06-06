# Runtime Tests

Status: Active
Owner: Platform
Last verified: 2026-06-06
Source of truth: runtime test files

## Current Tests

- `server_modules/tests/test_runtime_runtime_api.py`: machine enrollment
  intent, bootstrap complete, self-hosted enrollment, self-hosted heartbeat with
  node session token, command enqueue workspace scope, hardware action
  execute/stop, non-operator blocking, command claim and command result flows.
- `server_modules/tests/test_runtime_common.py`: control-plane origin checks,
  mutation rate-limit behavior, runtime registration rate limiting, and hot-path
  exemptions for runtime heartbeat/task paths.
- `server_modules/tests/test_orion_local_worker_runtime.py`: stale session-token
  retry, registration enrollment token forwarding, permission probe forwarding,
  structured events, control-state payloads, pause retry, hard-kill and
  supervisor interrupt behavior.
- `server_modules/tests/test_local_queue_machine_controls.py`: local machine
  queue/control behavior.
- `server_modules/tests/test_runtime_attachment_service.py`: runtime attachment
  behavior.
- `server_modules/tests/test_machine_lease_service.py`: machine lease behavior.

Focused command:

```bash
python -m pytest \
  server_modules/tests/test_runtime_runtime_api.py \
  server_modules/tests/test_runtime_common.py \
  server_modules/tests/test_orion_local_worker_runtime.py \
  server_modules/tests/test_local_queue_machine_controls.py \
  server_modules/tests/test_runtime_attachment_service.py \
  server_modules/tests/test_machine_lease_service.py
```

## Missing Coverage To Keep Visible

- exact token expiry and revocation behavior
- abuse controls for runtime task hot paths
- duplicate runtime registration behavior under repeated enrollment attempts
