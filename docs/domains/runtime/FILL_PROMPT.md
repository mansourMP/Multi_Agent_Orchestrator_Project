# Fill Prompt: Runtime Docs

Status: Active prompt
Owner: Platform
Last verified: 2026-06-06

Read:

- `server_modules/runtime_runtime_api.py`
- `server_modules/runtime_common.py`
- `server_modules/local_queue.py`
- `server_modules/machine_lease_service.py`
- `server_modules/runtime_attachment_service.py`
- `scripts/orion_local_worker_runtime.py`
- `server_modules/tests/test_runtime_runtime_api.py`
- `server_modules/tests/test_runtime_common.py`
- `server_modules/tests/test_orion_local_worker_runtime.py`
- `server_modules/tests/test_local_queue_machine_controls.py`
- `docs/agent-runtime-simplification.md`
- `docs/history-storage-runtime-boundary-2026-05-01.md`
- `docs/platform/canonical-architecture-contract.md`

Fill Runtime docs with code-backed facts only.

Required output:

- Explain how runtimes register.
- Explain session token creation, scope, expiry, and revocation if implemented.
- Explain customer/workspace/machine binding.
- Explain local worker queue claim and completion flow.
- Explain lease checks, quotas, and rate limits.
- Document tests and missing tests.

Do not widen or narrow runtime access in docs. Describe only what code does.
