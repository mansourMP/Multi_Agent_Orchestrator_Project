# Platform Architecture

Status: Active
Owner: Platform
Last verified: 2026-06-06
Source of truth: code and active architecture contracts

## Current Map

Empyralis is split into a cloud/control-plane layer and local/customer-owned
runtime layers.

- Cloud control plane: Python/FastAPI-style route modules in `server_modules/`
  own auth, workspace checks, registries, channels, app bridge calls, runtime
  registration, billing, and hosted AI accounting.
- Frontend shell: `frontend/app/(account)/w/[workspaceId]/**` and
  `frontend/lib/workspace/**` render workspace surfaces and call the backend.
- Sage turn path: the chat surface routes user turns through direct-chat and
  agent execution services; provider availability and credential-plane truth are
  resolved by `server_modules/direct_chat_provider_service.py`.
- Studio path: deployed-agent services and registry APIs own specialist agents,
  installed agents, and external-agent boundaries.
- Agent Computer path: `server_modules/gateway_execution_service.py` dispatches
  approved tool actions to connected gateways, `empyralis-gateway/src/index.ts`
  maintains the local gateway process, and `empyralis-supervisor/src/main.rs`
  executes signed local capabilities.
- Runtime/session path: `server_modules/runtime_runtime_api.py`,
  `server_modules/runtime_common.py`, `server_modules/local_queue.py`, and
  `scripts/orion_local_worker_runtime.py` own runtime registration, session
  tokens, local queue claims, heartbeats, completion, and control events.
- Secrets and credits: `server_modules/secrets_broker.py`,
  `server_modules/provider_profiles.py`,
  `server_modules/direct_chat_hosted_usage_service.py`,
  `server_modules/billing_service.py`, and
  `server_modules/control_plane_repository.py` separate hosted provider secrets,
  workspace BYOK credentials, hosted AI usage rows, credit ledger events, and
  workspace credit debits.

Migration debt: this map is factual but still broad. Each domain folder should
remain the source for precise behavior.
