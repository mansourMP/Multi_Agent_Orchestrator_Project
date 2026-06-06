# Studio Rules

Status: Active
Owner: Platform
Last verified: 2026-06-06
Source of truth: deployed-agent code and tests

## Coding Rules

- Use deployed-agent lifecycle helpers for state changes. Do not set `live`, `paused`, or `suspended` through generic update payloads; `update_deployed_agent` rejects those direct transitions and requires dedicated lifecycle controls. Source: `server_modules/deployed_agent_service.py`.
- Keep workspace ownership checks on all Studio admin operations. `require_deployed_agent_admin_access` requires platform admin or workspace owner access. Source: `server_modules/deployed_agent_service.py`.
- Keep backing specialist linkage intact. Live deployment requires the deployed-agent record and backing specialist install to share id linkage, tenant, and workspace. Source: `server_modules/deployed_agent_service.py`.
- Normalize runtime through the contract service and call the mode/capability matrix before create, update, or deploy paths that can alter runtime behavior. Source: `server_modules/deployed_agent_runtime_contract_service.py`.
- For self-hosted agents, require explicit agent-to-node binding through `runtime_profile_id`; do not silently fall back to cloud or local. Source: `server_modules/deployed_agent_service.py`.
- For Telegram business deployment, save channel config through the enrichment path so connector id, credential id, endpoint key, and inbound ownership are recorded. Source: `server_modules/deployed_agent_service.py`.
- Enforce quotas before create/deploy/update effects. The quota path checks created agents, live agents, concurrent running agents, daily message limit, tool availability, monthly spend cap, runtime minutes, computer sessions, and memory storage entitlement. Source: `server_modules/deployed_agent_service.py`.
- For Studio AI billing routes, keep the distinction between Empyralis credits, workspace API key, local model, and subscription passthrough. BYOK-first providers cannot use Empyralis credits; local model and subscription passthrough require local runtime; provider/model pricing must be known for Empyralis-credit usage. Source: `server_modules/deployed_agent_runtime_contract_service.py`.
- Keep connected external agents in the connected-external-agent surface. Manifests must not contain raw secrets, endpoints must pass public HTTPS or Agent Computer private-proxy validation, and credential injection must resolve through vault references. Source: `server_modules/connected_external_agent_service.py`.

Not implemented in the inspected code: a single frontend E2E that proves create -> instructions -> sources -> provider -> channel -> private test -> deploy -> customer message -> results. The launch-readiness doc lists that as missing coverage. Source: `docs/reports/studio-agents-launch-readiness-2026-05-15.md`.
