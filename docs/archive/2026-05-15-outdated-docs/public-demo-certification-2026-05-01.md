# Public Demo Certification Handoff — 2026-05-01

## Current Verdict

The public Sage demo path is certified for web after the latest production DeepSeek smoke. The Marketplace preview seed patch is deployed and verified. The account-shell fallback patch is deployed and route-level mobile smoke now reaches the shell instead of the dead workspace-unavailable page. The headless local companion path is certified for an optional local shell/file demo. The remaining hard line is one real-device visual/mobile sweep. Cloud Computer is contract-ready only; it is not a live demo feature.

## Certified In This Pass

- Production provider catalog: DeepSeek showed `configured=true`, `usable=true`, and default model `deepseek-chat`.
- Production Sage chat: 10 direct runtime turns and 10 public web turns returned trace, step, chunk, and final events with non-empty replies after one transient Render 502 retry.
- Fresh production workspace smoke after the billing/audit closeout created a session, streamed one DeepSeek hello turn with truthful final metadata, then passed ten exact `pong` replies with no stream failure.
- Production history persisted the fresh cert thread with 22 turns and alternating user/assistant roles.
- Production phone route-level smoke returned HTTP 200 for chat and integrations after onboarding completion.
- Production Marketplace deployment check returned six backend preview packages on a fresh workspace; all were `preview_only=true`.
- Frontend shell reliability: account-shell bootstrap now calls the runtime directly from SSR instead of proxying through the public web app.
- Mobile/public shell recovery: if direct runtime account-shell bootstrap fails from SSR, the shell retries the same-origin `/api/auth/account-shell` BFF path with forwarded cookies before rendering a recovery state.
- Mobile/public dead screens: account and onboarding degraded states now provide Reload and Sign in again actions.
- Memory runtime model: Sage memory categories are structured as Green, Yellow, Orange, and Red classes, with legacy category aliases preserved.
- Hosted AI credits surface: billing summary exposes hosted Sage AI policy, cap, usage, and remaining balance for BYOK-free users.
- Approval policy: local file delete/remove/unlink/trash now requires approval.
- Cloud Computer contract: `sage_cloud_computer` remains explicit, paid, non-default, metered, and separate from the personal gateway.
- Execution mode contract: user-facing modes are Default and Full Access. Full Access is local-companion-only; internal connector autonomy remains policy-governed and is not exposed as a separate mode.
- Screenshot transparency contract: screenshot/image artifact trace events now have first-class chat cells for phone/web audit visibility.
- MCP trust metadata: MCP tools now expose permission manifests with risk, scopes, allowed modes, cost class, and audit event type.
- Direct chat trust metadata: built-in, local, browser, HTTP, and connector tools now expose the same permission manifest shape for Marketplace/Studio/tool transparency.

## Demo-Safe Surfaces

- Sage chat with provider/model/reasoning picker.
- Thinking/tool transparency cells, pending-message preservation, and stop-button behavior by source/test verification.
- Studio template grid and focused setup sheet.
- Marketplace as governed install/discovery surface with seed packages and hidden developer publishing.
- Marketplace backend preview packages for empty workspaces. Preview packages are display-only and marked `preview_only=true`.
- Gateway-offline status and local-tool availability by catalog contract.
- Optional headless local companion shell/file demo after the 2026-05-01 run-detail polling fix.

## Do Not Demo Yet

- Full Cloud Computer/hosted desktop. The runtime contract exists, but there is no real provisioner, cloud browser session, sandbox lifecycle, spend meter enforcement, or artifact egress flow certified for users.
- Full native phone certification. Source-level mobile controls exist, but the final physical phone sweep must still be run against production after deploy.
- Video generation. It is intentionally out of scope.
- Marketplace developer publishing as a normal-user flow. It must stay behind explicit developer mode.

## Verification Run

- `npm run typecheck --prefix frontend`
- `npm run build --prefix frontend`
- `venv/bin/python -m compileall server_modules scripts`
- `venv/bin/python -m pytest server_modules/tests/test_sage_memory_service.py server_modules/tests/test_direct_tool_approval_service.py server_modules/tests/test_policy_service.py server_modules/tests/test_billing_service.py server_modules/tests/test_entitlements_service.py server_modules/tests/test_direct_chat_hosted_usage_service.py`
- `venv/bin/python -m pytest server_modules/tests/test_runtime_attachment_service.py server_modules/tests/test_workspace_bootstrap_service.py server_modules/tests/test_direct_chat_tool_catalog_service.py`
- `venv/bin/python -m pytest server_modules/tests/test_skills_service.py server_modules/tests/test_direct_chat_tool_catalog_service.py server_modules/tests/test_mcp_registry_service.py`

## Production Route Smoke After Account-Shell Fallback

- Deployed commit: `702fd105d fix: recover account shell bootstrap through bff`.
- Runtime health: `https://empyralis-runtime.onrender.com/health` returned `{"ok":true}`.
- Fresh mobile-user-agent signup created workspace `ws_f5616c7efafa`.
- Onboarding patch returned HTTP 200 and marked setup complete.
- `/api/auth/account-shell` returned HTTP 200 through the public web BFF with the same mobile cookie jar.
- `/w/ws_f5616c7efafa/chat` returned HTTP 200 and rendered the workstation shell with the Sage composer, `Gateway offline`, and `Tools`.
- `/w/ws_f5616c7efafa/integrations`, `/w/ws_f5616c7efafa/marketplace`, and `/w/ws_f5616c7efafa/studio` returned HTTP 200.
- Bad-string scan across the post-fallback route artifacts found none of: `Workspace shell is temporarily unavailable`, `Bootstrap returned`, `Bad Gateway`, `Authentication request timed out`, `Sage hit a temporary service issue`, or `Sage took too long`.
- Marketplace API returned six preview packages for the same workspace.

## Local Verification After Direct Tool Manifest Patch

- Commit: `118ee9727 fix: expose direct tool permission manifests`.
- `venv/bin/python -m compileall server_modules/skills_service.py server_modules/tests/test_skills_service.py` passed.
- `venv/bin/python -m pytest server_modules/tests/test_skills_service.py server_modules/tests/test_direct_chat_tool_catalog_service.py server_modules/tests/test_mcp_registry_service.py` passed with 32 tests.
- Broader phase 7-9 targeted backend suite passed with 103 tests across billing, entitlements, provider catalog, runtime attachment, workspace bootstrap, tool catalog, skills/tool manifests, and MCP registry.

## Local Companion Verification After Run Polling Fix

- Fixed `build_run_detail_response()` so `/runs/{run_id}` accepts the same browser checkpoint/session callbacks passed by the route registry.
- `venv/bin/python -m pytest server_modules/tests/test_runtime_run_query_service.py` passed with 11 tests.
- Local stack restarted with `ORION_LOCAL_COMPANION_ROOT=/Users/mansur` and Postgres-backed runtime persistence.
- Local worker was healthy with `shell.execute`, `filesystem.read_write`, `screenshot.capture`, `browser_automation.interactive`, and `local.worker`.
- Local run `ae209a0b-e559-482f-81c0-92229106cc34` completed through `shell.execute`, ran `ls -1 /Users/mansur/Desktop`, returned real Desktop output, and persisted a command-log artifact.
- Post-fix verification passed: frontend typecheck, frontend production build, Python compile, runtime run-query tests, mini-app route tests, and mini-app service tests.

## Production Route/API Smoke After Tool Manifest Patch

- Latest deployed docs commit observed before this smoke: `884d85b7e docs: record tool manifest verification`.
- Production runtime health returned `{"ok":true}` and production web returned HTTP 200.
- Fresh mobile-user-agent signup created workspace `ws_47a03801088c`.
- Onboarding patch returned HTTP 200 and marked setup complete.
- `/api/auth/account-shell` returned HTTP 200 through the public web BFF with the same cookie jar.
- `/w/ws_47a03801088c/chat` returned HTTP 200 and rendered the workstation shell with the Sage composer, `Gateway offline`, and `Tools`.
- Integrations, Marketplace, Studio, and History returned one transient recovery render during a parallel deploy/warm-up sweep; sequential retries returned HTTP 200 and rendered workstation markers without recovery copy.
- Bad-string scan across the clean retry artifacts found none of: `Workspace shell is temporarily unavailable`, `Bootstrap returned`, `Bad Gateway`, `Authentication request timed out`, `Sage hit a temporary service issue`, or `Sage took too long`.
- Provider catalog, tool policy, credential vault, and Marketplace package APIs all returned HTTP 200. The fresh workspace had no saved provider credentials by design; Marketplace returned six preview packages.

## Next Required Action

Run one final human browser and phone visual sweep:

1. Production signup/login/account shell.
2. Production Sage with DeepSeek selected.
3. Send 10 messages.
4. Verify no 500/504 shell page, no disappearing messages, no false timeout banner, no raw service error.
5. Open Studio, Marketplace, History, Memory, and Integrations in light and dark mode.
6. Confirm Marketplace shows preview packages on an empty workspace and does not expose Marketplace publishing as a normal-user flow.
