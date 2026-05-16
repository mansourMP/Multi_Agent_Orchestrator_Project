# DeepSeek Platform Audit Brief - 2026-05-17

## Mission

You are the platform audit agent for Empyralis. Inspect the backend, runtime contracts, data flow, security posture, and end-to-end readiness. Focus on what is logically broken, fragile, unsafe, missing, or likely to fail under real users.

Do not push. Do not create a branch. Do not mix UI polish work into this pass. If a UI issue is evidence of a deeper data or backend problem, document it with the responsible backend/frontend boundary.

## Baseline

Current `main` includes:

- Studio stabilization and motion polish.
- Workspace/account bootstrap recovery.
- Studio Model tab simplification.
- Studio AI provider and credits strategy.

Start from current `main`.

Before editing or running heavy tests:

```bash
git status --short
```

If the worktree is not clean, stop and report exact files. Other agents may be working locally.

## Files To Read First

Read these in this order:

1. `docs/bible.md`
2. `docs/context.md`
3. `docs/project-map.md`
4. `docs/architecture/canonical-architecture-contract.md`
5. `docs/studio-agents-launch-readiness-2026-05-15.md`
6. `docs/studio-ai-provider-credits-strategy-2026-05-16.md`
7. `docs/operations/hosted-provider-secret-governance.md`
8. `docs/gateway-architecture.md`
9. `docs/personal-vs-studio-channel-model.md`
10. `docs/transparency-runtime-audit.md`
11. `docs/pending-tasks.md`

Then inspect the code paths listed below.

## Platform Surfaces To Audit

### 1. Account And Workspace Bootstrap

Primary files:

- `frontend/lib/server/load-account-shell-session.ts`
- `frontend/lib/workspace/server-workspace-bootstrap.ts`
- `frontend/app/(account)/layout.tsx`
- `frontend/app/(account)/w/[workspaceId]/layout.tsx`
- `server_modules/account_shell_service.py`
- `server_modules/routes_auth.py`
- `server_modules/runtime_workspace_service.py`

Questions:

- Can transient backend failures still look like logout?
- Do stale-good caches ever mask real auth or membership changes?
- Are `401`, `403`, `404`, and missing workspace cases still fail-closed?
- Are cache keys scoped by cookie/auth/workspace/host strongly enough?
- Is there any path where one workspace can leak into another shell?

### 2. Studio Agent Runtime And Deployment

Primary files:

- `server_modules/deployed_agent_config_schema.py`
- `server_modules/deployed_agent_runtime_contract_service.py`
- `server_modules/deployed_agent_virtual_runtime_service.py`
- `server_modules/deployed_agent_test_turn_service.py`
- `server_modules/deployed_agent_memory_service.py`
- `server_modules/deployed_agent_cost_cap_service.py`
- `server_modules/deployed_agent_rate_limit_service.py`
- `server_modules/deployed_agent_daily_quota_adapter.py`
- `server_modules/deployed_agent_transparency_service.py`
- `server_modules/workspace_admin_service.py`
- `server_modules/agent_workspace_api.py`

Questions:

- Can a Studio text agent accidentally get a computer/VM runtime?
- Can request payloads override DB-owned `studio_agent_mode` or runtime placement?
- Does deploy fail clearly when model provider, channel, budget, or runtime requirements are missing?
- Are draft/live states consistent after edit, deploy, pause, and delete?
- Are customer-facing agents isolated from Sage personal-agent settings?
- Can a deployed agent accept a dynamic model ID that was fetched and cached?

### 3. AI Providers, Model Catalog, BYOK, Hosted Credits

Primary files:

- `server_modules/provider_profiles.py`
- `server_modules/provider_catalog_service.py`
- `server_modules/workspace_admin_service.py`
- `server_modules/secrets_broker.py`
- `server_modules/vault_store.py`
- `server_modules/vault_helpers.py`
- `server_modules/billing_service.py`
- `server_modules/credit_ledger_contract.py`
- `server_modules/empyralis_model_tier_routing_service.py`
- `server_modules/no_provider_service.py`
- `server_modules/direct_chat_runtime_service.py`
- `server_modules/sage_agent_runtime_service.py`

Questions:

- Are model lists truly dynamic where claimed?
- Do provider credentials fetch/cache models safely and avoid raw key exposure?
- Are cached model lists scoped to workspace/provider/key fingerprint?
- Does failed refresh preserve the last successful model cache?
- Is `fallback` only static UI/catalog metadata, not accidental runtime failover?
- Is hosted-credit routing separate from BYOK routing?
- Are provider prices never invented?
- Are custom OpenAI-compatible endpoints protected from SSRF?
- Are hosted provider secrets and customer BYOK secrets separated and audited?
- Does Sage still allow local/CLI routes while Studio hides them?

### 4. Actions, Tools, Skills, MCP, Integrations

Primary files:

- `server_modules/tool_broker.py`
- `server_modules/capability_registry.py`
- `server_modules/skills_service.py`
- `server_modules/skills_registry.py`
- `server_modules/skill_scanner.py`
- `server_modules/mcp_registry_service.py`
- `server_modules/connectors_actions.py`
- `server_modules/connector_validators.py`
- `server_modules/routes_connectors.py`
- `server_modules/workflow_service.py`
- `server_modules/routes_workflows.py`

Questions:

- Are Actions permissions separate from Integration setup?
- Can users add tools/skills/MCP/custom APIs safely?
- Are MCP/custom tool servers scoped and approved before use?
- Are external writes gated by approval/safety policy?
- Are skill manifests trusted too broadly?
- Are permissions enforced server-side, not only in UI?

### 5. Channels, Telegram, WhatsApp, Gmail, Calendar

Primary files:

- `server_modules/channel_types.py`
- `server_modules/channel_identity_service.py`
- `server_modules/channel_routing_models.py`
- `server_modules/channel_activity_service.py`
- `server_modules/channel_execution_quota_adapter.py`
- `server_modules/personal_channels_service.py`
- `server_modules/personal_channels_repository.py`
- `server_modules/personal_channel_handler_registry.py`
- `server_modules/routes_personal_channels.py`
- `server_modules/runtime_webhook_trigger_service.py`
- `server_modules/gateway_protocol_service.py`
- `server_modules/gateway_execution_service.py`
- `server_modules/outbox_service.py`
- `server_modules/external_write_safety.py`

Questions:

- Is Studio channel behavior separate from personal Sage channels?
- Are public inbound messages authenticated or validated correctly?
- Are outbound messages durable and replay-safe?
- Are quota, idempotency, and abuse controls enforced per workspace/deployment/channel?
- Do failures become visible operator states instead of silent loss?

### 6. Memory, Knowledge, Privacy

Primary files:

- `server_modules/deployed_agent_memory_service.py`
- `server_modules/sage_memory_service.py`
- `server_modules/unified_memory_service.py`
- `server_modules/conversation_memory_facade_service.py`
- `server_modules/channel_memory_overlay_service.py`
- `server_modules/external_user_privacy_service.py`
- `server_modules/sage_context_files_api.py`
- `server_modules/direct_chat_memory_facade_service.py`
- `server_modules/direct_chat_context_service.py`
- `server_modules/conversation_compaction.py`

Questions:

- Is Studio Memory only customer/session facts?
- Are Knowledge/source files kept separate from memory?
- Can one customer memory leak into another deployment/customer?
- Are deletion/privacy requests enforced across memory, transcripts, channel state, and analytics?
- Are retention windows enforced server-side?

### 7. Runtime, Computer Use, Gateway, Local Worker

Primary files:

- `server_modules/gateway_registry_service.py`
- `server_modules/gateway_browser_service.py`
- `server_modules/gateway_approval_service.py`
- `server_modules/gateway_quota_enforcement.py`
- `server_modules/gateway_transparency_service.py`
- `server_modules/browser_approval_service.py`
- `server_modules/browser_checkpoint_service.py`
- `server_modules/runtime_run_entry_service.py`
- `server_modules/runtime_route_bootstrap_service.py`
- `server_modules/runtime_route_registry_service.py`
- `server_modules/runtime_run_approval_service.py`
- `server_modules/runtime_local_execution_approval_service.py`
- `server_modules/runtime_state_store.py`
- `server_modules/local_queue.py`
- `server_modules/worker_dispatch_service.py`
- `server_modules/hosted_secure_worker.py`

Questions:

- Is computer-use clearly optional for Studio text agents?
- Can a public deployed agent trigger local/customer computer actions without explicit authorization?
- Are browser/file/shell capabilities permissioned and logged?
- Are runtime sessions scoped to workspace/deployment/actor?
- Are hosted hardware/customer-hosted/customer-local paths guarded distinctly?

### 8. Activity, Results, Transparency, Analytics

Primary files:

- `server_modules/agent_transparency_events.py`
- `server_modules/transparency_event_store_service.py`
- `server_modules/runtime_events.py`
- `server_modules/runtime_events_api.py`
- `server_modules/runtime_usage_service.py`
- `server_modules/usage_accounting_service.py`
- `server_modules/platform_analytics_service.py`
- `server_modules/routes_platform_analytics.py`
- `server_modules/runs_history.py`
- `server_modules/runs_core.py`
- `server_modules/runs_output.py`
- `server_modules/session_transcript_store.py`

Questions:

- Does every important customer-facing action produce operator-visible proof?
- Are Results and Activity backed by real events, not placeholder data?
- Are costs and usage linked to run/deployment/provider/model?
- Are errors visible without leaking secrets?
- Can repeated/replayed events duplicate cost or messages?

### 9. Security, Quotas, Kill Switches, External Writes

Primary files:

- `server_modules/auth.py`
- `server_modules/jwt_secret.py`
- `server_modules/egress_policy.py`
- `server_modules/external_content_guard.py`
- `server_modules/external_write_safety.py`
- `server_modules/kill_switch_gate.py`
- `server_modules/quota_policy_service.py`
- `server_modules/idempotency.py`
- `server_modules/error_response_service.py`
- `server_modules/doctor_gate.py`
- `server_modules/doctor_report.py`

Questions:

- Are dangerous operations fail-closed?
- Are external writes approved, audited, and idempotent?
- Are quota failures clear and enforceable?
- Are SSRF, prompt injection, secret leakage, replay, and cross-tenant leakage addressed?
- Are kill switches available for provider/channel/runtime failures?

## Tests To Run Or Inspect

Start with targeted test discovery:

```bash
find server_modules/tests -maxdepth 3 -type f | sort
find frontend/tests -maxdepth 3 -type f | sort
```

Important existing test families:

```bash
PYTHONPATH=. venv/bin/python -m pytest -q \
  server_modules/tests/test_deployed_agent_service.py \
  server_modules/tests/test_deployed_agent_virtual_runtime_service.py \
  server_modules/tests/test_deployed_agent_memory_service.py \
  server_modules/tests/test_provider_catalog_service.py \
  server_modules/tests/test_provider_credential_flows.py \
  server_modules/tests/test_run_state_repository.py \
  server_modules/tests/test_outbox_service.py
```

Public-channel blackbox tests:

```bash
PYTHONPATH=. venv/bin/python -m pytest -q \
  server_modules/tests/e2e/test_public_telegram_blackbox.py \
  server_modules/tests/e2e/test_public_policy_blackbox.py
```

Frontend smoke that matters for platform claims:

```bash
npm run typecheck --prefix frontend
npm run build --prefix frontend
npm run test:e2e:deployed-agents --prefix frontend
```

If tests are too slow or blocked, report the exact blocker. Do not claim pass without running.

## Required Audit Output

Write your report to:

`docs/reports/deepseek-platform-audit-report-2026-05-17.md`

If `docs/reports` does not exist, create it.

Report format:

```md
# DeepSeek Platform Audit Report - 2026-05-17

## Executive Verdict

Use one of:

- Not ready
- Partial / controlled pilot only
- Ready for controlled pilot
- Ready for public launch

## Highest-Risk Findings

| Severity | Area | Finding | Evidence | Required Fix |
|---|---|---|---|---|

## Surface-By-Surface Audit

## Security And Data Isolation Risks

## Runtime And Deployment Risks

## Provider / Credits / Billing Risks

## Channel / External Write Risks

## Memory / Knowledge Risks

## Test Coverage Gaps

## Tests Run

## Recommended Fix Order

## Files That Should Be Touched Next
```

Severity scale:

- P0: must fix before any real business user.
- P1: must fix before wider beta.
- P2: should fix for quality/durability.
- P3: cleanup or polish.

## What Not To Do

- Do not push.
- Do not create a branch.
- Do not rewrite UI for visual polish.
- Do not delete old docs or archive files in this pass.
- Do not treat archived `backend/` as active runtime unless current code references it.
- Do not claim a path works without evidence from code or tests.
- Do not silently change security behavior; report first unless it is a trivial test-safe fix.

## Expected Final Answer

When finished, reply with:

1. Verdict.
2. Report path.
3. Tests run.
4. Top 5 risks.
5. Whether any files were changed.
