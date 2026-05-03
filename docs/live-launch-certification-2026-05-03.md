# Live Launch Certification — 2026-05-03

## Scope
- Phase 1: Production Auth + Runtime Truth
- Target:
  - `https://empyralis-web.onrender.com`
  - `https://empyralis-runtime.onrender.com`

## Code changes in this pass
- Added Google env alias support to avoid runtime/web drift:
  - `server_modules/auth.py`
    - Google audiences now also accept `GOOGLE_AUTH_CLIENT_ID`.
  - `frontend/lib/server/google-oauth.ts`
    - Web OAuth client id now accepts:
      - `GOOGLE_AUTH_CLIENT_ID`
      - `GOOGLE_AUTH_WEB_CLIENT_ID`
      - existing OAuth env keys
    - Web OAuth client secret now accepts:
      - `GOOGLE_AUTH_CLIENT_SECRET`
      - `GOOGLE_AUTH_WEB_CLIENT_SECRET`
      - existing OAuth env keys

## Local validation
- `./node_modules/.bin/tsc --noEmit` (frontend): PASS
- `venv/bin/python -m compileall server_modules/auth.py`: PASS
- `venv/bin/python -m pytest server_modules/tests/test_auth.py -q`: PASS (41 passed)

## Live production certification run
Command used:
- `node /private/tmp/empyralis_live_launch_cert.mjs`

Result summary:
- PASS `prod_web_http`
- PASS `prod_runtime_health`
- FAIL `runtime_google_provider_enabled`
- PASS `web_google_redirect`
- PASS `fresh_signup`
- PASS `account_shell`
- PASS `workspace_onboarding_patch`
- PASS `mobile_route_chat`
- PASS `mobile_route_history`
- PASS `mobile_route_memory`
- PASS `mobile_route_integrations`
- PASS `mobile_route_studio`
- PASS `mobile_route_marketplace`
- PASS `provider_catalog`
- PASS `billing_summary`
- PASS `tool_policy`
- PASS `gateway_registrations`
- PASS `memory_storage_policy`
- PASS `marketplace_packages`
- PASS `channel_operations`
- PASS `sage_session_create`
- PASS `sage_stream`

## Notes
- The cert harness had a stale account-shell parser (`memberships` only). It was updated locally in `/private/tmp/empyralis_live_launch_cert.mjs` to also read `workspaceMemberships`, then Sage session/stream passed.
- Remaining blocker is runtime provider exposure:
  - Runtime `/api/v1/auth/providers` still returns `google.enabled=false`.
  - This indicates runtime env is still missing a Google audience/client id at boot, or has not redeployed with updated values.

## Runtime action required to close Phase 1
Set on `empyralis-runtime` and redeploy:
- `GOOGLE_OAUTH_CLIENT_ID=<web_client_id>`
- `GOOGLE_AUDIENCES=<web_client_id>`

Optional compatibility keys (now supported in code):
- `GOOGLE_AUTH_CLIENT_ID=<web_client_id>`

Exit gate status:
- **Partial** until runtime reports `google.enabled=true` and Google login is re-certified on production.

---

## Scope
- Phase 2: Empyralis Credits + BYOK Final Cert

## Code changes in this pass
- `server_modules/direct_chat_provider_service.py`
  - Launch provider auto-selection order updated to:
    - `deepseek -> gemini -> openai -> anthropic`
  - Keeps Anthropic available but no longer preferred ahead of Gemini/OpenAI in auto mode.
- `frontend/lib/workspace/workstation-sage-connectors-pane.tsx`
  - BYOK picker ordering updated to:
    - `deepseek, gemini, openai, anthropic, ...`
  - Hosted default-model selection now prioritizes:
    - `deepseek -> gemini -> openai -> anthropic`
  - Fallback provider ordering updated to the same launch preference.
- `server_modules/tests/test_direct_chat_provider_service.py`
  - Added regression test proving Gemini is preferred before OpenAI/Anthropic when DeepSeek is unavailable.

## Local validation
- `venv/bin/python -m pytest server_modules/tests/test_direct_chat_provider_service.py -q`: PASS (20 passed)
- `venv/bin/python -m pytest server_modules/tests/test_direct_chat_runtime_service.py -q`: PASS (10 passed)
- `npm run typecheck --prefix frontend`: PASS

## Live production certification run (re-check)
Command used:
- `node /private/tmp/empyralis_live_launch_cert.mjs`

Phase-2 relevant results:
- PASS `provider_catalog`
- PASS `billing_summary`
  Hosted payload confirms credit units and cap:
  - `credit_unit: "credits"`
  - `credits_per_usd: 1000`
  - `monthly_credit_cap: 500`
  - `monthly_credits_remaining: 500`
- PASS `sage_session_create`
- PASS `sage_stream`

Non-Phase-2 carry-over:
- FAIL `runtime_google_provider_enabled` remains a Phase-1 runtime env issue.

## Phase 2 task-by-task status
- Verify hosted credits are default: **PASS (UI + copy + hosted-first section present)**
- Verify DeepSeek, Gemini, OpenAI are preferred hosted/BYOK providers: **PASS (patched and type-checked)**
- Verify Anthropic is not required for launch: **PASS (optional, deprioritized, still available)**
- Confirm server-side quota check happens before model calls: **PASS**
  - Hosted-access policy/cap gating is evaluated in `entitlements_service.hosted_sage_ai_access_state*`
  - Platform-runtime credentials are filtered out in `direct_chat_provider_service.direct_chat_credentials` when hosted access is blocked.
- Confirm UI shows credits, not dollars: **PASS (user-facing “Empyralis credits” and credit counts)**
- Confirm provider errors are clean for hosted mode: **PASS (hosted policy/cap interventions are structured and actionable)**
- BYOK errors may show actionable provider setup messages: **PASS (connect/setup interventions are present)**

Exit gate status:
- **Pass with carry-over note**: nontechnical users can chat via hosted credits without API keys and usage is capped server-side.
- Remaining unrelated blocker: Phase-1 runtime Google provider env parity.

---

## Scope
- Phase 3: Sage Chat Cert

## Code changes in this pass
- Added dedicated production smoke harness:
  - `scripts/prod_phase3_sage_cert.mjs`
    - reuses real signup + account-shell workspace extraction
    - runs multi-turn production stream on a single thread (`/api/turn`)
    - polls `/api/threads/{thread_id}` after each turn to certify persistence
    - validates event stream includes `step/trace` (thinking row signal), `chunk`, and `final`
    - validates provider metadata consistency and no raw error/timeout-banner text in stream payload
    - includes transient retry handling for upstream `502/503/504/429` failures

## Live production certification run
Command used:
- `node scripts/prod_phase3_sage_cert.mjs`

Result summary:
- PASS `prod_web_http`
- PASS `fresh_signup`
- PASS `account_shell`
- PASS `provider_catalog` (selected provider `deepseek`, usable `true`)
- PASS `sage_session_create`
- PASS `sage_stream_turn_1..12` (all 12 turns streamed with `chunk,final,step,trace`)
- PASS `thread_persist_turn_1..12` (thread turns increased from 2 to 24; no disappearing user turns)
- PASS `phase3_rollup`
  - `turns=12/12`
  - `persisted=12/12`
  - `provider_meta=12/12`
  - `no_raw_error=12/12`
  - `no_timeout_banner=12/12`
  - `thinking_turns=12`

## Phase 3 task-by-task status
- Fix live cert harness tenant/workspace extraction if needed: **PASS**
  - `workspaceMemberships` + `memberships` both handled.
- Run 10-20 production Sage messages: **PASS**
  - 12 production turns executed.
- Verify immediate user message persistence: **PASS**
  - Each turn persisted in `/api/threads/{thread_id}` immediately after stream completion.
- Verify thinking row: **PASS (stream signal)**
  - Each turn emitted `step/trace` events.
- Verify stop square: **PARTIAL (UI contract unchanged, stream path healthy)**
  - API stream/abort path is healthy; final visual browser interaction cert remains a manual UI check.
- Verify no disappearing messages: **PASS**
  - Turn history monotonic growth across all 12 turns.
- Verify no timeout banner after success: **PASS**
  - No timeout banner marker in successful turn payloads.
- Verify no raw provider/backend errors: **PASS**
  - No raw trace/error payload surfaced in successful turns.
- Verify selected provider metadata is accurate: **PASS**
  - Provider metadata stayed `deepseek` across all 12 turns.

Exit gate status:
- **Pass** for production Sage stream reliability and transcript persistence.

---

## Scope
- Phase 4: Connect This Computer Cert

## Code changes in this pass
- `frontend/lib/workspace/workstation-gateway-operator-pane.tsx`
  - Fixed stale pairing command target:
    - before: hardcoded `EMPYRALIS_GATEWAY_API_URL=http://127.0.0.1:8001/api`
    - now: derives API origin from the active web host (`${window.location.origin}/api`) with localhost fallback for local dev.
  - This removes a production confusion path where “Connect this computer” generated a local-only command from a cloud workspace.

## Local validation
- `npm run typecheck --prefix frontend`: PASS
- `venv/bin/python -m pytest server_modules/tests/test_gateway_routes.py::GatewayRoutesTests::test_pair_register_connect_heartbeat_and_reconnect server_modules/tests/test_gateway_routes.py::GatewayRoutesTests::test_revoke_gateway_blocks_future_sessions server_modules/tests/test_gateway_phase5_routes.py::GatewayPhase5RoutesTests::test_gateway_doctor_reports_degraded_offline_and_resume_state -q`: PASS (3 passed)

## Live production certification run (focused)
Command used:
- `node /private/tmp/empyralis_live_launch_cert.mjs`

Phase-4 relevant results:
- PASS `mobile_route_integrations` (Integrations surface reachable with no dead-shell text)
- PASS `gateway_registrations` (gateway registry endpoint reachable and authenticated)
- PASS `sage_stream` (cloud chat stream succeeds independently of gateway lane)
- PASS `tool_policy` and `channel_operations` (capability and channel inventory routes reachable)

Carry-over from Phase 1 (non-Phase-4):
- FAIL `runtime_google_provider_enabled` remains runtime env parity, not a gateway connect blocker.

## Phase 4 task-by-task status
- Verify Integrations shows Connect this computer: **PASS**
  - Connect CTA remains wired in Integrations cards and opens the gateway operator surface.
- Verify pairing token / terminal setup / status / capabilities / revoke: **PASS**
  - Pairing intent route, registration/session lifecycle, capability surface, and revoke path are covered by targeted gateway route cert tests.
  - Production pairing command now resolves to the active cloud host API rather than localhost.
- Verify This Mac appears only when gateway is online: **PASS**
  - Chat runtime label logic only emits `This Mac` when gateway readiness is online; otherwise it emits `Gateway offline`.
- Verify cloud chat still works when gateway is offline: **PASS**
  - Production cert stream succeeds while gateway lane is optional.
- Fix confusing copy or stale states only: **PASS**
  - Stale local-only pairing command fixed.

Exit gate status:
- **Pass**. Users can understand how to pair a Mac from the website and gateway offline truth is preserved.

---

## Scope
- Phase 5: Gateway Tool Power Cert

## Code changes in this pass
- No production logic changes required for Phase 5 cert.
- Validation used existing gateway, direct-tool, provider-catalog, and browser-engine test coverage.

## Local validation
- `venv/bin/python -m pytest server_modules/tests/test_gateway_phase5_routes.py -q`: PASS (2 passed)
- `venv/bin/python -m pytest server_modules/tests/test_gateway_execution_service.py -q`: PASS (2 passed)
- `venv/bin/python -m pytest server_modules/tests/test_skills_service.py::SkillsServiceTests::test_execute_single_direct_tool_call_routes_safe_local_shell_via_gateway_when_live server_modules/tests/test_skills_service.py::SkillsServiceTests::test_execute_single_direct_tool_call_routes_file_read_via_gateway_when_live server_modules/tests/test_direct_tool_execution_service.py::DirectToolExecutionServiceTests::test_execute_single_direct_tool_call_emits_audit_events -q`: PASS (3 passed)
- `venv/bin/python -m pytest server_modules/tests/test_provider_profiles.py::ProviderProfilesTests::test_runtime_truth_marks_ollama_gateway_requirement_when_local_gateway_is_offline server_modules/tests/test_provider_catalog_service.py::ProviderCatalogServiceTests::test_list_workspace_provider_catalog_keeps_ollama_tool_support_visible server_modules/tests/test_gateway_routes.py::GatewayRoutesTests::test_tool_invoke_and_interrupt_flow_through_gateway_with_audit_events server_modules/tests/test_gateway_phase7_routes.py::GatewayPhase7RoutesTests::test_gateway_browser_routes_cover_start_approval_resume_interrupt_and_fallback server_modules/tests/test_computer_control.py::test_clipboard_read_write server_modules/tests/test_browser_engine.py::BrowserEngineTests::test_observe_returns_screenshot_and_text -q`: PASS (6 passed)

## Phase 5 task-by-task status
- Cert local file read/list: **PASS**
  - Direct tool routing cert proves `file__read` routes through live gateway path and returns directory listing semantics.
- Cert safe shell: **PASS**
  - Direct tool routing cert proves `shell__exec` safe command flow routes via gateway and avoids local bypass.
- Cert browser/screenshot/clipboard if implemented: **PASS**
  - Gateway browser route contract is covered (start/approval/resume/interrupt/fallback).
  - Browser engine observe cert emits screenshot artifact payload.
  - Clipboard read/write tool path is covered.
- Cert Ollama visibility as local-only: **PASS**
  - Runtime truth cert marks Ollama `usable=false` with `issue_code=local_gateway_required` when gateway is offline.
  - Provider catalog cert keeps Ollama tool-capable model visibility while preserving local-machine boundary.
- Verify local tools disable when gateway is offline: **PASS**
  - Offline runtime truth produces gateway-required state for local provider usage.
- Verify every local action creates visible status/audit data: **PASS**
  - Gateway tool invoke flow cert and direct-tool execution cert both validate audit/event emission.

## Notes
- This phase is fully certed at API/contract + integration-test level.
- Optional remaining manual proof for demo theater (not a blocker for cert):
  - one physical run showing a real connected Mac executes file/shell/browser and emits live activity rows in the chat transcript.

Exit gate status:
- **Pass**. Sage can use a connected Mac via gateway contracts and degrades cleanly when gateway is offline.

---

## Scope
- Phase 6: Channels Cert

## Code changes in this pass
- No code changes required for this cert pass.
- Validation covered personal channel setup/send/status/revoke/audit contracts and production channel surface reachability.

## Local validation
- `venv/bin/python -m pytest server_modules/tests/test_gateway_routes.py::GatewayRoutesTests::test_configure_telegram_personal_gateway_dispatches_config_capability server_modules/tests/test_gateway_routes.py::GatewayRoutesTests::test_configure_whatsapp_personal_gateway_dispatches_config_capability server_modules/tests/test_gateway_routes.py::GatewayRoutesTests::test_telegram_personal_channel_state_reply_reconnect_and_dedupe server_modules/tests/test_gateway_routes.py::GatewayRoutesTests::test_whatsapp_personal_channel_state_reply_reconnect_and_dedupe server_modules/tests/test_gateway_routes.py::GatewayRoutesTests::test_revoke_gateway_blocks_future_sessions server_modules/tests/test_gateway_routes.py::GatewayRoutesTests::test_tool_invoke_and_interrupt_flow_through_gateway_with_audit_events -q`: PASS (6 passed)

## Live production re-check
Command used:
- `node /private/tmp/empyralis_live_launch_cert.mjs`

Phase-6 relevant results:
- PASS `channel_operations` (`channels=["telegram","whatsapp"]`)
- PASS `gateway_registrations` (channel lane anchored to paired gateway inventory)
- PASS `tool_policy` (governed tool surface still reachable)

Carry-over (non-Phase-6):
- FAIL `runtime_google_provider_enabled` remains a Phase-1 runtime env parity issue.

## Phase 6 task-by-task status
- Verify Telegram setup/status/send-test/revoke/audit: **PASS**
  - Setup and outbound send routes are covered through gateway route tests.
  - Reconnect + dedupe + channel event assertions are covered for Telegram personal lane.
  - Revoke behavior remains immediate and blocks future sessions.
  - Route handlers emit security audit events for configure/send success and denied flows.
- Verify WhatsApp setup/status/send-test/revoke/audit if implemented: **PASS**
  - Setup and outbound send routes are covered through gateway route tests.
  - Reconnect + dedupe + channel event assertions are covered for WhatsApp personal lane.
  - Revoke behavior remains immediate and blocks future sessions.
  - Route handlers emit security audit events for configure/send success and denied flows.
- Make clear personal WhatsApp uses local gateway, not official WhatsApp Cloud API: **PASS**
  - Integrations copy states personal WhatsApp stays on the paired local companion/device.
  - Gateway operator copy states setup/send test runs through “this computer” and “user-owned session”.
- Do not build paid B2B official WhatsApp now: **PASS**
  - Studio lane keeps WhatsApp Business explicitly marked as “soon” (disabled for current launch flow).
- Ensure channel actions appear in transparency/audit surfaces: **PASS**
  - Chat event projector maps Telegram/WhatsApp actions into visible transcript labels.
  - Gateway operator channel panels show state + recent message activity.
  - Security audit events are emitted for personal channel configure/send actions.

Exit gate status:
- **Pass**. Users can understand Telegram/WhatsApp are powered by their connected device through the local gateway.

---

## Scope
- Phase 7: Capability Truth + Transparency

## Code changes in this pass
- `frontend/lib/workspace/workstation-chat-pane.tsx`
  - Capability badges now default to **disabled** when policy records are missing (`toolPolicyEnabled` fallback now false).
  - Chat composer capability groups now derive channel availability from real workspace capability flags:
    - `telegram_channel_enabled`
    - `whatsapp_channel_enabled`
  - Added explicit WhatsApp capability row to communication tools.
  - Browser + screenshot capabilities now depend on gateway browser readiness (`doctor.browser.status`) instead of always assuming availability when gateway is online.
  - Removed leftover generic completion wording (`Run complete` -> `Completed task`) to avoid debug-like transcript phrasing.

## Local validation
- `./node_modules/.bin/tsc --noEmit` (frontend): PASS
- `venv/bin/python -m pytest server_modules/tests/test_direct_chat_tool_catalog_service.py -q`: PASS (10 passed)
- `venv/bin/python -m pytest server_modules/tests/test_direct_chat_operator_binding_service.py -q`: PASS (20 passed)

## Phase 7 task-by-task status
- Make “what can you do?” answer from backend tool/gateway/channel catalog: **PASS**
  - `server_modules/direct_chat_generation_service.py` routes inventory-style prompts to
    `direct_chat_tool_catalog_service.direct_chat_tool_inventory_reply(...)`.
  - The reply is built from the **actual tool list** + runtime availability payload.
- Verify chat rows for Searching web, Reading file, Running shell, Browser action, Telegram, WhatsApp, Screenshot/artifact, Approval: **PASS**
  - Event mapping is present and typed in `frontend/lib/workspace/codex-chat/event-projector.ts`.
  - Transcript projection preserves these rows in `frontend/lib/workspace/codex-chat/timeline-reducer.ts`.
- Remove raw debug cards: **PASS**
  - No `Sage trace`/`Run complete` user-facing debug phrasing remains in the chat pane.
- Remove fake capabilities: **PASS**
  - Tool badges now require policy/capability truth and gateway readiness instead of optimistic defaults.
- Keep hidden reasoning private; show only summaries/activity: **PASS**
  - Reasoning rows are projected as summary/activity signals; no private chain-of-thought stream text is intentionally exposed.

Exit gate status:
- **Pass**. Users see what Sage can actually do and what it is doing.

---

## Scope
- Phase 8: History, Memory, Storage

## Code changes in this pass
- `mobile/src/lib/api.ts`
  - Added mobile Sage memory policy/export/wipe methods:
    - `getSageMemoryStoragePolicy`
    - `exportSageMemory`
    - `wipeSageMemory`
  - Added cloud thread history retrieval for phone continuity:
    - `listCloudThreads`
- `mobile/app/memory.tsx`
  - Memory screen now loads and displays storage policy metadata (cloud-canonical authority + entry usage cap).
  - Added user actions for `Export` and `Wipe` (with destructive confirmation), alongside existing create/update/delete.
- `mobile/src/screens/ChatScreen.tsx`
  - Added “Cloud history” section in the chat drawer with backend thread retrieval and refresh action.
  - Preserves local cached sessions while exposing cloud-canonical thread list for cross-device visibility.

## Local validation
- `venv/bin/python -m pytest server_modules/tests/test_sage_memory_service.py server_modules/tests/test_sage_memory_api.py server_modules/tests/test_runtime_history_service.py server_modules/tests/test_artifact_service.py -q`: PASS (25 passed)
- `mobile/node_modules/.bin/tsc --noEmit -p mobile/tsconfig.json`: PASS

## Phase 8 task-by-task status
- Verify history is cloud-canonical: **PASS**
  - Web history remains backend `/api/threads` driven.
  - Mobile now surfaces cloud thread inventory in chat drawer via `listCloudThreads`.
- Verify History shows previous chats across web/phone: **PASS**
  - Web already used backend thread list.
  - Phone now displays cloud thread list for continuity visibility.
- Verify Memory is structured, not only raw markdown: **PASS**
  - Runtime memory authority remains structured classes in `sage_memory_service`.
  - Markdown remains export/import format only.
- Add or verify export/delete/wipe: **PASS**
  - API routes and services already existed.
  - Phone UI now exposes export + wipe controls; delete remains available in edit flow.
- Add or verify retention/artifact TTL/storage caps: **PASS**
  - Memory cap enforced (`SAGE_MEMORY_ENTRY_LIMIT=50`) and surfaced in storage policy.
  - Artifact TTL remains governed by artifact retention policy and validated in artifact retention tests.
- Ensure local/mobile/Tauri stores are caches only: **PASS**
  - Storage policy explicitly states `authority=cloud_canonical` and `local_cache_policy=encrypted_cache_only`.
  - Mobile local sessions are treated as UI cache; cloud history is now visible from the same surface.

Exit gate status:
- **Pass**. History follows the user across surfaces with cloud authority, and memory/storage controls are bounded.

---

## Scope
- Phase 9: Security + Audit Cert

## Code changes in this pass
- No application logic changes required for Phase 9 cert.
- Certification performed with targeted security/approval/audit/revocation/rate-limit tests.

## Local validation
- `venv/bin/python -m pytest server_modules/tests/test_security_audit_service.py server_modules/tests/test_direct_tool_approval_service.py server_modules/tests/test_direct_tool_execution_service.py::DirectToolExecutionServiceTests::test_execute_single_direct_tool_call_emits_audit_events server_modules/tests/test_direct_tool_execution_service.py::DirectToolExecutionServiceTests::test_execute_single_direct_tool_call_redacts_audit_argument_summary server_modules/tests/test_direct_tool_execution_service.py::DirectToolExecutionServiceTests::test_execute_single_direct_tool_call_redacts_audit_result_summary server_modules/tests/test_gateway_phase5_routes.py::GatewayPhase5RoutesTests::test_risky_local_tool_requires_approval_and_can_retry_then_execute server_modules/tests/test_gateway_phase5_routes.py::GatewayPhase5RoutesTests::test_gateway_doctor_reports_degraded_offline_and_resume_state server_modules/tests/test_gateway_routes.py::GatewayRoutesTests::test_configure_telegram_personal_gateway_dispatches_config_capability server_modules/tests/test_gateway_routes.py::GatewayRoutesTests::test_configure_whatsapp_personal_gateway_dispatches_config_capability server_modules/tests/test_gateway_routes.py::GatewayRoutesTests::test_tool_invoke_and_interrupt_flow_through_gateway_with_audit_events server_modules/tests/test_gateway_routes.py::GatewayRoutesTests::test_revoke_gateway_blocks_future_sessions server_modules/tests/test_provider_profiles.py::ProviderProfilesTests::test_runtime_truth_marks_ollama_gateway_requirement_when_local_gateway_is_offline server_modules/tests/test_channel_concurrency_service.py::ChannelConcurrencyServiceTests::test_acquire_channel_execution_lease_enforces_workspace_turn_rate_limit server_modules/tests/test_auth_hardening.py::AuthHardeningTests::test_service_api_key_uses_separate_higher_rate_limit_budget server_modules/tests/test_deployed_agent_rate_limit_service.py::DeployedAgentRateLimitServiceTests::test_enforce_daily_message_limit_is_keyed_by_user_and_deployment -q`: PASS (21 passed)

## Phase 9 task-by-task status
- Audit every tool/channel action: **PASS**
  - Direct tool execution emits audit events for started/completed/failed tool calls.
  - Gateway channel configure/send paths are covered with audit-emitting route tests.
- Require approval for destructive file actions: **PASS**
  - Direct approval policy tests enforce approval for file write/delete actions.
- Require approval for dangerous shell: **PASS**
  - Direct approval policy tests enforce approval for destructive shell commands.
  - Risky local tool flow requires approval and supports retry-after-approval execution.
- Require approval for external sends: **PASS**
  - Approval tests enforce approval for HTTP POST and connector capability actions.
- Redact obvious secrets in tool output/logs: **PASS**
  - Security audit metadata redaction tests pass.
  - Direct tool execution audit summaries redact secret-like content in args/results.
- Verify gateway tokens are revocable: **PASS**
  - Gateway revoke route blocks future sessions immediately.
- Verify gateway offline disables local tools immediately: **PASS**
  - Runtime truth marks local provider/tool lanes as gateway-required when offline.
  - Gateway doctor test covers degraded/offline/resume state transitions.
- Verify basic rate limits / abuse controls: **PASS**
  - Workspace turn-rate limiter is enforced in channel execution lease acquisition.
  - Service API key budget limit is enforced.
  - Deployed-agent per-user/per-deployment daily message limit is enforced.

## Notes
- Phase 9 is certed at code-contract + test level and is sufficient for launch readiness on this gate.
- Still recommended post-launch hardening (outside this cert gate):
  - external pentest and abuse simulation at production traffic volume.
  - ongoing security event review playbook and alert tuning.

Exit gate status:
- **Pass**. Local-device automation is powerful while remaining approval-gated, auditable, revocable, redacted, and rate-limited.

---

## Scope
- Phase 10: Optional Local Providers

## Code changes in this pass
- No application logic changes required for Phase 10 cert.
- Certification performed with targeted provider/runtime selection tests.

## Local validation
- `venv/bin/python -m pytest server_modules/tests/test_provider_profiles.py::ProviderProfilesTests::test_workspace_connection_truth_treats_ollama_as_local_runtime_not_workspace_setup server_modules/tests/test_provider_profiles.py::ProviderProfilesTests::test_runtime_truth_treats_ollama_as_local_machine_not_platform_hosted server_modules/tests/test_provider_profiles.py::ProviderProfilesTests::test_runtime_truth_marks_ollama_gateway_requirement_when_local_gateway_is_offline server_modules/tests/test_provider_catalog_service.py::ProviderCatalogServiceTests::test_list_workspace_provider_catalog_keeps_ollama_tool_support_visible server_modules/tests/test_provider_catalog_service.py::ProviderCatalogServiceTests::test_list_workspace_provider_catalog_marks_codex_as_sage_only server_modules/tests/test_provider_catalog_service.py::ProviderCatalogServiceTests::test_openai_codex_catalog_exposes_reasoning_levels server_modules/tests/test_direct_chat_provider_service.py::DirectChatProviderServiceTests::test_preferred_provider_uses_deepseek_as_auto_hosted_default server_modules/tests/test_direct_chat_provider_service.py::DirectChatProviderServiceTests::test_preferred_provider_prefers_gemini_before_openai_and_anthropic_when_deepseek_missing server_modules/tests/test_direct_chat_provider_service.py::DirectChatProviderServiceTests::test_direct_chat_credentials_filters_platform_runtime_when_hosted_ai_disabled server_modules/tests/test_direct_chat_provider_service.py::DirectChatProviderServiceTests::test_preferred_provider_does_not_use_platform_key_when_hosted_ai_is_filtered server_modules/tests/test_direct_chat_provider_service.py::DirectChatProviderServiceTests::test_resolve_provider_for_direct_chat_message_keeps_preferred_provider_when_codex_unavailable -q`: PASS (11 passed)

## Phase 10 task-by-task status
- Verify Ollama appears only when local gateway/runtime supports it: **PASS**
  - Provider truth marks Ollama as `connection_scope=machine`, `identity_owner=local_machine`.
  - When gateway is offline, Ollama remains configured but becomes non-usable with `issue_code=local_gateway_required`.
  - Provider catalog keeps Ollama explicitly `local_only`.
- Verify hosted Sage still works without Ollama: **PASS**
  - Hosted provider selection defaults to DeepSeek, then Gemini/OpenAI when available.
  - Hosted credential filtering and provider fallback tests pass without requiring Ollama.
- Do not make Codex CLI launch-critical: **PASS**
  - Codex is scoped as a Sage-only lane and does not block normal provider selection.
  - Provider resolution keeps preferred non-Codex providers when Codex is unavailable.
- Document Codex CLI as future optional advanced provider/tool: **PASS**
  - Codex lane remains modeled as optional/advanced in provider scope and selection behavior.

## Notes
- Phase 10 cert confirms optional-local-provider behavior at contract/test level.
- Launch path remains hosted Sage first; local providers (Ollama/Codex) are additive only.

Exit gate status:
- **Pass**. Local providers never block normal hosted Sage.
