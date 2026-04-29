# Current State Handoff - 2026-04-29

This document is the short handoff for the next implementation session. It records what is active today, what changed in the Codex-style chat pass, and what must not be treated as current product truth.

## Active Product Path

- Web runtime: FastAPI/Python in `server_modules`, composed by `server.py`.
- Web shell: Next app under `frontend/app` with workspace surfaces in `frontend/lib/workspace`.
- Sage chat surface: `frontend/lib/workspace/workstation-chat-pane.tsx`.
- Composer: `frontend/lib/workspace/chat-composer.tsx`.
- Codex-style transcript cells: `frontend/lib/workspace/codex-chat/*`.
- Provider catalog truth: `server_modules/provider_catalog_service.py` and `server_modules/provider_profiles.py`.
- Direct chat/tool catalog truth: `server_modules/direct_chat_generation_service.py` and `server_modules/direct_chat_tool_catalog_service.py`.
- Gateway and local tool path: `empyralis-gateway`, `empyralis-supervisor`, `server_modules/routes_gateway.py`, and `server_modules/gateway_execution_service.py`.
- Mobile shell currently mounted: `mobile/app/(tabs)`.

## Chat Surface State

The Sage chat surface has been moved toward the Codex model:

- Transcript rendering now projects canonical messages and stream events into typed Codex-style cells.
- Normal chat no longer uses the old standalone `SageTraceView` / trace-card route.
- Tool inventory questions such as "what tools do you have" are answered from the backend tool catalog, not from model hallucination.
- Composer owns provider/model/reasoning/runtime/tools/send-stop controls.
- Stop state uses a filled square and Escape abort is wired through the chat pane.
- Private chain-of-thought is not exposed; only activity, reasoning summary, tool, file, search, approval, status, and assistant cells should be visible.

## Current Mobile Truth

The active mobile route group is `mobile/app/(tabs)`, not `mobile/app/(workspace)`.

Visible tab labels today are:

- Chat
- Agents
- Applications
- Profile
- Home
- Notifications

`today` and `spaces` remain mounted but hidden from the tab bar. The shared route manifest has been corrected away from non-existent `/(workspace)` mobile paths.

## Removed Dead Frontend Modules

The following product-unreachable modules were removed after static import checks:

- `frontend/lib/workspace/chat-inline-state-card.tsx`
- `frontend/lib/workspace/sage-trace-view.tsx`
- `frontend/lib/workspace/stage-detail-layout.tsx`
- `frontend/lib/workspace/workspace-channel-operations-console.tsx`
- `frontend/lib/workspace/workstation-run-detail.tsx`
- `frontend/lib/workspace/workstation-sage-providers-pane.tsx`
- `frontend/lib/workspace/workstation-timeline-projector.ts`

Related stale E2E specs for trace preview and removed run detail were also removed or trimmed.

## Known Boundaries

- Do not treat `/backend` as the active backend. It is legacy/off-path.
- Do not treat trace preview as normal product UX. `/trace-preview` currently returns `notFound()`.
- Do not reintroduce normal-chat "Run complete" or "Sage trace" cards.
- Do not add video generation to the current demo scope.
- Do not delete mobile `(tabs)` unless a real migration to a new route group is implemented and tested.

## Verification Commands

Use these after chat/frontend/backend changes:

```bash
npm run typecheck --prefix frontend
npm run build --prefix frontend
venv/bin/python -m compileall server_modules scripts
venv/bin/python -m pytest server_modules/tests/test_direct_chat_tool_catalog_service.py server_modules/tests/test_direct_chat_runtime_service.py server_modules/tests/test_direct_chat_provider_service.py server_modules/tests/test_provider_catalog_service.py server_modules/tests/test_provider_credential_flows.py server_modules/tests/test_gateway_execution_service.py server_modules/tests/test_auth_hardening.py server_modules/tests/test_auth_account_shell.py
npm run test:e2e --prefix frontend -- tests/e2e/approval-resolution-golden-path.spec.ts tests/e2e/artifact-preview-download.spec.ts tests/e2e/workspace-setup.spec.ts tests/e2e/deployed-agents.spec.ts
```

## Verification Snapshot - 2026-04-29

Latest local certification from this pass:

- `npm run typecheck --prefix frontend`: passed.
- `npm run build --prefix frontend`: passed.
- `venv/bin/python -m compileall server_modules scripts`: passed.
- Targeted backend suite for direct chat, provider catalog, credential flow, gateway, and auth: `98 passed`.
- Targeted E2E batch for approvals, artifacts, workspace setup, and deployed agents: `10 passed`.

Important caveat: this is local and production API certification. Public-demo readiness still needs a final human visual sweep in the chosen demo workspace.

## Follow-Up Local Cert - 2026-04-29

Additional demo-readiness evidence is recorded in `docs/demo-readiness-matrix-2026-04-29.md`.
Architecture-lane readiness is recorded in `docs/architecture-readiness-2026-04-29.md`.

- Restarted the active local stack with `server_modules` runtime, frontend, and worker.
- Verified DeepSeek provider catalog truth for local fallback workspace `ws-1`: configured and usable with static direct DeepSeek models only.
- Verified the BFF chat path through session creation, user-turn persistence, and streaming response.
- Ran 10 consecutive DeepSeek messages through the local BFF/runtime path: 10 passed, 0 failed.
- Fixed stream-manager duplicate-event churn that caused repeated reloads.
- Fixed DeepSeek retryable `IncompleteRead` handling with an OpenAI-compatible curl transport fallback.
- Fixed tool-inventory answers so they use the full backend tool catalog instead of a narrowed provider tool list.
- Certified Phase 3 provider truth for DeepSeek: final stream metadata reports requested/effective provider `deepseek`, requested/effective model `deepseek-chat`, no fallback, and no provider/model override.
- Certified fail-closed provider behavior for unconfigured Anthropic: it returns a provider-unavailable intervention instead of silently falling back.
- Completed a Phase 4 source-level visual hygiene pass: chat header readiness/status strips are disabled so the composer owns provider/runtime state, successful final stream events clear stale error/status notices, and final SSE reply text is preserved if the transport response omits `reply`.
- Reduced provider catalog request-path stalls by capping local Claude CLI and Ollama status probes. After restart, direct provider catalog returned `200` in about 2.7s instead of the previous 20-30s stalls.
- Ran the Sage-first Playwright smoke after the fixes: login lands on Sage, the chat pane and composer render, and setup/onboarding chrome is absent.

Current architecture verdict:

- Cloud provider path, gateway/local path, web shell, mobile shell, desktop shell, Studio lane, and hosted mini-app lane are implemented.
- Public-demo certification is narrower: DeepSeek Sage chat is locally certified and the production API golden path is certified. A clean human demo workspace still needs a final visual sweep.
- Visual certification is now passed for the narrow DeepSeek local demo path. Broader provider/gateway/product surfaces still need their own cert if they are included in the demo.

## Continuation Cert - 2026-04-29 23:50 Local

Latest local demo path after restart:

- Active stack: `server_modules` runtime on `127.0.0.1:8001`, Next frontend on `127.0.0.1:3000`, local worker on.
- Local runtime no longer inherits `backend/.env` Postgres by default. Set `ORION_LOCAL_RUNTIME_USE_POSTGRES=1` only when explicitly testing Postgres-backed local runtime.
- Local fallback canonical thread store now supports no-Postgres `agent_threads` and `agent_turns` so user turns can persist immediately in local demo mode.
- Empty `/api/threads/primary?workspace_id=ws-1` now returns a blank thread record instead of a 404 before the first turn.
- Provider credential save path has retryable transport fallback for `IncompleteRead`/connection-reset class failures.
- Gemini credential propagation is fixed, but the current Gemini demo key hit provider quota. Do not use Gemini as the public-demo default until quota is cleared.
- DeepSeek is configured and selected as the explicit demo chat provider in `ws-1`.
- Composer sends resolved provider and model, not just a stale auto-route provider with no model.
- Composer label now shows the real active model label (`DeepSeek Chat · Medium`) instead of the route suffix (`Workspace key · Medium`).
- Direct chat final SSE text is emitted before slow best-effort memory/transcript persistence, so users see the answer immediately instead of waiting behind embedding/model-load work.
- Known public fallback/error assistant strings are filtered from visible transcript and from prior-message context.

Latest smoke evidence:

- Playwright smoke against `http://127.0.0.1:3000/w/ws-1/sage`: passed for login, composer render, send, immediate draft clear, visible thinking row, visible assistant response `OK`, no timeout banner, no `Run complete`, no `Sage trace`, no duplicate `AI: Connect provider` header strip.
- API responses during that smoke: `/api/threads/primary`, `/api/sage-memory`, `/api/providers/profiles`, `/api/providers/catalog`, `/api/gateway/registrations`, `/api/sessions`, `/api/threads/primary/turns`, and `/api/turn` all returned `200`.
- Remaining non-blocking browser-console noise: `/api/approvals?workspace_id=ws-1` returns `403` because approvals are not included in this workspace plan. It is not visible in normal chat UI.

Latest verification:

- `venv/bin/python -m py_compile server_modules/db.py server_modules/runtime_common.py server_modules/control_plane_repository.py server_modules/direct_chat_context_service.py server_modules/direct_chat_runtime_service.py server_modules/direct_chat_generation_service.py server_modules/runtime_runs_api.py scripts/orion_local_worker_llm.py`: passed.
- `npm run typecheck --prefix frontend`: passed.
- `git diff --check`: passed.

## Production Follow-Up - 2026-04-30

Production no longer appears blocked on the credential vault key alone:

- `https://empyralis-web.onrender.com` returned `200`.
- `https://empyralis-runtime.onrender.com/health` returned `{"ok":true}`.
- A throwaway direct production `POST /api/credentials/vault` probe returned `200`, so the previous missing-vault-key failure is not currently reproducing.
- The full production cert run then failed earlier on `POST /api/auth/signup` with a client-side `IncompleteRead` while reading a normal JSON response from the web BFF.
- Confirmed fix in source: `frontend/lib/server/control-plane-proxy.ts` buffers non-SSE upstream responses and only streams `text/event-stream` responses. This preserves chat SSE while making auth/provider/credential JSON routes deterministic for production clients.
- Local verification after the proxy patch: `npm run typecheck --prefix frontend`, `npm run build --prefix frontend`, and `git diff --check` passed.

Next required production action: configure/confirm the final human demo workspace and run a visual browser smoke there.

## Production Cert Closed - 2026-04-30

The critical production Sage golden path passed after the web BFF response-buffering patch was pushed and deployed:

- Commit pushed: `2ef633ba fix: buffer non-streaming control-plane proxy responses`.
- Production web signup through `https://empyralis-web.onrender.com/api/auth/signup` returned `200`.
- Production provider credential save returned `200`.
- Provider catalog showed DeepSeek `configured=true`, `usable=true`, `state=active`, default model `deepseek-chat`.
- `/api/sessions` returned `200`.
- `/api/threads/primary/turns` returned `200`.
- Streamed `/api/turn` returned `200` with `trace`, `step`, `chunk`, and `final` events.
- Final stream metadata reported `effective_provider=deepseek`, `effective_model=deepseek-chat`, and `fallback_used=false`.

Remaining public-demo work is not an API blocker: create or choose the actual demo account/workspace, confirm the provider is configured there, then run the final visual sweep in the browser.
