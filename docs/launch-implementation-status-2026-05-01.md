# Launch Implementation Status

Date: 2026-05-01
Status: current implementation tracker

## Current Launch Verdict

The web Sage public-demo path is certified for launch-demo scope after the 2026-05-01 production cert pass. Phone web is HTTP-certified against the production workspace routes after onboarding is completed. The headless local companion path is certified for a governed local shell/file demo. Native mobile, signed Tauri desktop release, Cloud Computer, and Marketplace publishing remain separate certification lanes.

## Implemented Or Contract-Ready

- Production provider truth and Sage chat are certified with DeepSeek on the current production deployment.
- Local companion run polling is repaired: `/runs/{run_id}` now accepts the full route callback bundle, including browser checkpoint/session callbacks, instead of returning 500 during local task polling.
- Headless local companion execution is certified with a governed `shell.execute` run against `/Users/mansur/Desktop`, using `local_root` read grants and artifact-backed output.
- Hosted Sage AI entitlement now honors workspace admin-default `billing_plan`, so the routing page and provider catalog use the same plan/policy source.
- Integrations now presents the normal-user path first: Empyralis credits, then BYOK. Hosted-credit provider failures are app-level messages; BYOK failures point to provider key/quota setup without exposing raw provider dumps.
- Chat uses Codex-style transcript cells for thinking, tool, approval, screenshot/artifact, and assistant output.
- Chat send failures now render as actionable notices with Retry, Open Integrations, or Dismiss instead of text-only dead banners.
- Gateway offline state is part of the runtime/tool truth model.
- Studio has square templates and a custom-agent path.
- Marketplace has governed preview packages from the backend when a workspace has no registered packages, and hides developer publishing behind an explicit panel.
- Memory is modeled as structured sensitivity classes, with Markdown suitable as import/export rather than canonical runtime state.
- Cloud Computer has a backend/runtime contract but no live provisioner.
- Tauri has a desktop shell and update hooks, and is now documented as the local companion lane.
- Billing summary now uses the same hosted-credit plan truth as provider routing when workspace admin defaults explicitly enable hosted Sage AI.
- Direct tool execution now emits best-effort `direct_tool.started`, `direct_tool.completed`, and `direct_tool.failed` security audit events with common key/token/password patterns redacted from summaries.
- Direct chat tool descriptors now expose permission manifests for built-in, local, browser, HTTP, and connector tools: action class, scopes, approval requirement, allowed runtime modes, cost class, and audit event type.

## Remaining Demo-Critical Work

1. Keep live demo credentials outside git.
2. Use the certified production demo workspace/provider for the public demo.
3. Do not demo Cloud Computer, native mobile, or Marketplace publishing until their separate certs pass.
4. Optional before going live: one human visual pass on an actual phone, because the automated phone web gate is HTTP/route-level rather than visual.

## Remaining Product Work

- Native mobile certification: login, provider picker, chat, history, memory, tools, approvals, gateway status.
- Tauri certification: pairing, supervisor health, approval flow, signed release, and a packaged lifecycle around the already-certified headless local companion path.
- Cloud Computer MVP: cloud browser, sandbox, TTL cleanup, spend meter, audit timeline, artifact egress.
- Billing and hosted AI credits: checkout/live Stripe operations, purchase/credit refill UX, and post-demo plan packaging.
- Marketplace paid-beta seed: installable packages with permissions, pricing, publisher, and trust metadata. Launch demo preview packages are display-only.

## Verification Added On 2026-05-01

- Production deployed commits:
  - `a5eb6160f fix: restart unfinished Sage streams on retry`
  - `7434a9184 fix: honor admin billing plan for hosted Sage`
  - `11fe59843 docs: update launch certification status`
  - `ab7ee89e6 fix: close billing and tool audit launch gaps`
  - `98b367fae fix: seed marketplace preview packages for demo`
  - `702fd105d fix: recover account shell bootstrap through bff`
- Production workspace onboarding patch returned HTTP 200 and set `setupCompleted=true`, `requiresOnboarding=false`, `defaultRoute=/w/ws_a0d8b6b56e11/sage`.
- Production iPhone-user-agent route smoke returned HTTP 200 for account shell, Sage, Chat, Activity, Integrations, Studio, and Marketplace.
- Production provider catalog now reports hosted Sage AI `allowed=true`, `plan_allows_hosted_ai=true`, `policy=enabled_with_cap`; DeepSeek and Anthropic report `configured=true`, `usable=true`.
- Production 10-message Sage stream cert passed after the entitlement fix. Each turn emitted `trace`, `step`, `chunk`, and `final`, with non-empty assistant replies and no terminal errors.
- Production metadata inspection confirmed final payload truth: `provider=deepseek`, `model=deepseek-chat`, `context_used.effective_provider=deepseek`, `context_used.effective_model=deepseek-chat`, `fallback_used=false`.
- `npm run typecheck --prefix frontend` passed.
- `npm run build --prefix frontend` passed.
- `venv/bin/python -m compileall server_modules scripts` passed.
- Targeted entitlement/billing/provider tests passed: `server_modules/tests/test_entitlements_service.py`, `server_modules/tests/test_billing_service.py`, `server_modules/tests/test_direct_chat_provider_service.py`.
- Targeted backend tests passed: 79 tests across memory, approvals, policy, billing, entitlements, hosted usage, runtime attachment, workspace bootstrap, and tool catalog.
- Focused Playwright E2E passed: 10 tests across launch Sage-first, account shell bootstrap resilience, non-scaffold surface sweep, workstation reconciliation, and deployed-agent surface.
- Production unauthenticated health passed: web returned HTTP 200 and runtime `/health` returned `{"ok":true}`.
- Phase 7 billing closeout added regression coverage that admin-default hosted-credit billing plans project correctly into billing summary without upgrading normal free workspaces.
- Phase 8 audit closeout added regression coverage that direct tool actions emit started/completed or started/failed audit events and redact obvious secrets from audit summaries.
- Phase 8 tool-trust closeout added regression coverage that direct chat tools carry permission manifests and that browser tools keep their callable schemas after trust metadata is attached.
- Phase 9 Cloud Computer contract remains verified by runtime attachment tests: Cloud Computer is optional, metered, explicitly selected, never the workspace default, and Full Access remains local-companion-only.

## Production Smoke Added After `ab7ee89e6`

- Fresh production workspace `ws_f006330bd7cb` was created through public signup and account shell.
- Provider catalog on that workspace reported Anthropic and DeepSeek as `configured=true`, `usable=true`; Gemini remained unconfigured; Ollama remained gateway-required.
- Billing summary on that workspace reported hosted Sage AI `allowed=true`, `policy=enabled_with_cap`, effective plan `pro`, monthly cap `5.0`, and remaining `5.0`.
- POST `/api/sessions` returned HTTP 200 and created session `af709dc051f14cd28cb44506249f4c36`.
- A direct DeepSeek `hello` stream emitted trace, step, chunk, and final events. Final metadata reported `provider=deepseek`, `model=deepseek-chat`, `context_used.effective_provider=deepseek`, and `provider_overridden=false`.
- Ten consecutive production DeepSeek turns passed with exact replies `pong 1` through `pong 10`.
- Thread persistence confirmed one cloud-canonical thread with `turn_count=22` and alternating user/assistant roles.
- After onboarding completion, iPhone-user-agent route smoke returned HTTP 200 for `/w/ws_f006330bd7cb/chat` and `/w/ws_f006330bd7cb/integrations`.
- Surface API checks passed for tool policy and structured Sage memory.
- Marketplace API initially returned zero packages on a fresh workspace. The launch patch now returns backend preview packages when no registered marketplace packages exist; these are marked `preview_only=true` and remain display-only in the UI.

## Production Smoke Added After `98b367fae`

- Production runtime `/health` returned `{"ok":true}`.
- Fresh production account creation succeeded for the Marketplace deployment check.
- Fresh production workspace `ws_fa1dde68c31e` returned six Marketplace packages from `/api/workspaces/ws_fa1dde68c31e/marketplace/packages`.
- All six returned packages were backend preview packages with `preview_only=true` and `install_target=preview`: Restaurant Orders, Auto Parts Sales, Spreadsheet Catalog, Web Search, Image Generation, and DeepSeek Provider.

## Production Smoke Added After `702fd105d`

- Production runtime `/health` returned `{"ok":true}` and production web returned HTTP 200 after the account-shell fallback deploy.
- Fresh production mobile-user-agent signup succeeded for workspace `ws_f5616c7efafa`; onboarding patch returned HTTP 200 with `setupCompleted=true`, `requiresOnboarding=false`, and default route `/w/ws_f5616c7efafa/chat`.
- The same mobile cookie jar loaded `/api/auth/account-shell` through the public web BFF with HTTP 200.
- Before the fix, direct workspace route rendering returned a shell-unavailable recovery page even though BFF account-shell succeeded.
- After the fix, `/w/ws_f5616c7efafa/chat` rendered the workstation shell with `data-workstation-surface="chat"`, composer placeholder `Message Sage...`, `Gateway offline`, and `Tools`.
- Post-fix mobile route smoke returned HTTP 200 for chat, integrations, marketplace, and studio.
- Post-fix bad-string scan across the route artifacts found no `Workspace shell is temporarily unavailable`, `Bootstrap returned`, `Bad Gateway`, `Authentication request timed out`, `Sage hit a temporary service issue`, or `Sage took too long` text.
- Marketplace API for the same workspace returned six preview packages, marked `preview_only=true` and `install_target=preview`.

## Verification Added After `118ee9727`

- Direct chat trust metadata now covers built-in, local, browser, HTTP, and connector tools with a consistent permission manifest.
- Browser tool descriptors were corrected so schemas remain callable while carrying `browser_automation.interactive` trust metadata.
- Broader phase 7-9 targeted backend suite passed: 103 tests across billing, entitlements, provider catalog, runtime attachment, workspace bootstrap, tool catalog, direct skills/tool manifests, and MCP registry.

## Production Smoke Added After `884d85b7e`

- Production runtime `/health` returned `{"ok":true}` and production web returned HTTP 200.
- Fresh production signup succeeded for workspace `ws_47a03801088c`; onboarding patch returned HTTP 200 with `setupCompleted=true`, `requiresOnboarding=false`, and default route `/w/ws_47a03801088c/chat`.
- `/api/auth/account-shell` returned HTTP 200 through the public web BFF with the same mobile-user-agent cookie jar.
- `/w/ws_47a03801088c/chat` returned HTTP 200 and rendered the workstation shell with `data-workstation-surface="chat"`, composer placeholder `Message Sage...`, `Gateway offline`, and `Tools`.
- A first parallel sweep of integrations, marketplace, studio, and history happened during a transient Render/deploy warm-up window and produced recovery HTML despite HTTP 200. Sequential retries returned HTTP 200 and rendered the workstation shell markers for all four routes.
- Bad-string scan across the clean retry artifacts found no `Workspace shell is temporarily unavailable`, `Bootstrap returned`, `Bad Gateway`, `Authentication request timed out`, `Sage hit a temporary service issue`, or `Sage took too long` text.
- Provider catalog API returned HTTP 200 with nine providers. Fresh workspace state was expected: no saved BYOK credentials, Ollama configured but gateway-required, hosted Sage AI disabled on the free workspace.
- Tool policy API returned HTTP 200 with six enabled policy rows: Web Search, HTTP Requests, Gmail, Calendar, File Access, and Code Execution.
- Credential vault list returned HTTP 200 with zero saved credentials on the fresh workspace.
- Marketplace API returned HTTP 200 with six preview packages: Auto Parts Sales, DeepSeek Provider, Image Generation, Restaurant Orders, Spreadsheet Catalog, and Web Search.

## Local Companion Smoke Added On 2026-05-01

- Local runtime and frontend restarted successfully with Postgres-backed runtime persistence and `ORION_LOCAL_COMPANION_ROOT=/Users/mansur`.
- Local runtime `/health` returned `{"ok":true}`.
- Local worker registered one healthy direct-runtime worker with capabilities: `browser_automation.interactive`, `filesystem.read_write`, `shell.execute`, `screenshot.capture`, and `local.worker`.
- Before the fix, polling a local run through `/runs/{run_id}` returned HTTP 500 because `build_run_detail_response()` rejected route-level browser checkpoint/session callbacks.
- Regression fix: `server_modules/runtime_run_query_service.py` now accepts the full run-detail callback bundle; `server_modules/tests/test_runtime_run_query_service.py` covers route-bundle compatibility.
- Targeted regression test passed: `venv/bin/python -m pytest server_modules/tests/test_runtime_run_query_service.py` with 11 tests.
- Local shell demo run completed: run `ae209a0b-e559-482f-81c0-92229106cc34` executed `ls -1 /Users/mansur/Desktop` through `shell.execute`, returned real Desktop output, and wrote a command log artifact.
- Verification commands passed after the fix: `npm run typecheck --prefix frontend`, `npm run build --prefix frontend`, `venv/bin/python -m compileall server_modules scripts`, and `venv/bin/python -m pytest server_modules/tests/test_runtime_run_query_service.py server_modules/tests/test_routes_mini_apps.py server_modules/tests/test_mini_apps_service.py`.

## Phase 6/7 Local Cert Added On 2026-05-02

- Fresh gateway pairing intent succeeded locally for Phase 6/7, then the gateway connected as `gateway_809b6844-5c4c-44df-87ae-aba5e75aa2d8`.
- Gateway doctor passed active registration, trusted device, live websocket session, fresh heartbeat, resumable checkpoint, and no pending approvals.
- Real gateway tool execution passed through the local supervisor for `shell.execute`, `filesystem.read_write`, and `screenshot.capture`.
- Existing-session browser attach returned the correct `attach_required` local gateway state.
- Risky desktop action approval was created for `computer_control.type` without executing the action.
- Gateway offline behavior was verified: local tool execution returned retryable `409` while the cloud runtime remained healthy.
- Gateway reconnect was verified with the same persisted state directory and gateway identity; gateway events showed two `gateway.connect` and two `gateway.hello` records.
- WhatsApp and Telegram channel surfaces returned truthful not-linked states. Real outbound channel send remains blocked until a linked account and safe recipient are provided.
- Studio/Marketplace targeted e2e passed: `npm run test:e2e:deployed-agents --prefix frontend` with 3 tests passing.

## Hard Rules

- Provider choice changes reasoning model only; it must not change tool truth.
- Local tools are enabled by gateway status, not provider.
- Full Access is only for local companion, never Cloud Computer.
- Cloud transcript history is canonical; local stores are caches.
- Raw runtime errors must never become chat transcript or composer text.
