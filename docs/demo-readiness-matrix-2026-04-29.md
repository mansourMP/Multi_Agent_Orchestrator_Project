# Demo Readiness Matrix - 2026-04-29

This matrix records the current public-demo path after the local Phase 1/2 cert pass. It is intentionally narrow: it covers demo readiness, not the full long-term platform roadmap.

## Source Boundary

- Active backend: `server_modules` through `server.py`.
- Active frontend: `frontend/app` and `frontend/lib/workspace`.
- Legacy `/backend` is off the active launch path.
- Current local stack command: `bash scripts/start_orion_local_stack.sh restart` or `bash scripts/start_empyralis_local_stack.sh`.
- Current local demo workspace: `ws-1`.
- Do not stage unrelated local files: `mobile/app/(tabs)/_layout.tsx`, `mobile/package-lock.json`, `.gemini/`, `GEMINI.md`, `graphify-out/`, or `frontend/test-results/.last-run.json`.

## Local Certification Snapshot

| Surface | Status | Evidence | Remaining Risk |
| --- | --- | --- | --- |
| Chat lifecycle | Passed locally | BFF path returned `POST /api/sessions 200`, `POST /api/threads/primary/turns 200`, `POST /api/turn 200`; 10 consecutive DeepSeek messages passed with final replies; latest Playwright smoke showed visible `OK` reply with no timeout banner. | Keep demo prompts short; provider latency can vary. |
| Message persistence | Passed locally | User turns persist before stream start; `/api/threads/primary` now returns 200 before and after a first turn; latest smoke showed no disappearance/reappearance. | In-memory local fallback thread state resets on stack restart unless Postgres is explicitly enabled. |
| Provider picker truth | Passed for DeepSeek | `ws-1` provider catalog shows DeepSeek `configured=true`, `usable=true`, default model `deepseek-chat`; composer shows `DeepSeek Chat · Medium`. Stale route suffix labels are hidden. | Gemini is configured but quota-blocked in the current local key; Anthropic is not the demo default. |
| DeepSeek generation | Passed locally | Normal chat path passed after adding a curl transport fallback for retryable `IncompleteRead` failures. | DeepSeek tool-call latency can still vary; demo should use short prompts. |
| Tool inventory answer | Passed locally | "what tools do you have" is now answered from the full backend tool catalog instead of the narrowed provider tool list or model hallucination. | Keep this backend-owned; do not let the model invent capability lists. |
| Tool transparency events | Passed by stream evidence | SSE includes `trace`, `step`, `chunk`, and `final` events on normal turns; latest smoke showed an inline `Thinking` row before the assistant answer. | Advanced tool rows still need separate local/gateway visual cert if demoed. |
| Stream-manager churn | Passed locally | The old rapid `/api/sage-memory` request loop did not reappear in `frontend.log` after stream-manager duplicate-event dedupe. | Watch logs during browser demo. |
| Gateway state | Online locally | `/api/gateway/registrations?workspace_id=ws_abf0aa394d44` returns an active, verified gateway with live health metadata. | Gateway-offline degradation must be rechecked before demo if local tool demo is included. |
| Composer UI | Passed for demo path | Browser smoke shows model/reasoning picker, runtime pill, tools button, send arrow, and clean textarea in the composer. | Stop-square abort should be shown only if demo script includes abort. |
| History | Not rechecked in this pass | Existing source target is flat conversation rows. | Needs visual browser pass. |
| Memory | Not rechecked in this pass | Existing source target is sensitivity groups and count. | Needs visual browser pass. |
| Integrations | Not rechecked in this pass | Existing source target is active provider row plus picker. | Needs provider-save production cert. |
| Studio | Future demo path only | Studio specialists remain the B2B expansion path. | Do not demo as core unless separately certified. |
| Production auth | Passed | Production web/runtime health returned `200`; production web signup returned `200` after deploying the buffered JSON proxy fix. | None for demo path. |
| Production provider save | Passed | Production provider credential save returned `200`; provider catalog showed DeepSeek `configured=true`, `usable=true`, `state=active`, model `deepseek-chat`. | Provider key/quota can still vary outside the certified demo key. |

## Latest Browser Smoke - 2026-04-29 23:50

Playwright smoke against the running local app passed the narrow Sage demo path:

- URL: `http://127.0.0.1:3000/w/ws-1/sage`
- Sent message: `live smoke <timestamp>`
- Draft after send: empty.
- Visible transcript after send: user message, `Thinking`, assistant response `OK`.
- No timeout/temporary-error banner.
- No `Run complete` or `Sage trace` card.
- No duplicate top-center provider/gateway readiness strip.
- API statuses observed: `/api/threads/primary`, `/api/sage-memory`, `/api/providers/profiles`, `/api/providers/catalog`, `/api/gateway/registrations`, `/api/sessions`, `/api/threads/primary/turns`, and `/api/turn` all returned `200`.
- Non-blocking console noise: `/api/approvals` returns `403` when approvals are not in the workspace plan; it is not visible in the chat UI.

## Production Proxy Follow-Up - 2026-04-30

Production readiness moved from "unknown vault 500" to closed for the critical production Sage golden path.

- `https://empyralis-web.onrender.com` returned `200`.
- `https://empyralis-runtime.onrender.com/health` returned `{"ok":true}`.
- A direct production `POST /api/credentials/vault` probe through the web BFF returned `200` with a throwaway credential, so the missing `CREDENTIAL_VAULT_KEY` blocker appears resolved after redeploy.
- Root cause patch: `frontend/lib/server/control-plane-proxy.ts` now buffers non-SSE upstream responses and only streams `text/event-stream`. This avoids chunked/body truncation for auth, provider, and credential JSON routes while preserving `/api/turn` streaming.
- Verification after patch: `npm run typecheck --prefix frontend`, `npm run build --prefix frontend`, and `git diff --check` passed locally.
- Commit pushed: `2ef633ba fix: buffer non-streaming control-plane proxy responses`.
- Production web signup through the BFF returned `200`.
- Full production cert passed with a throwaway workspace:
  - provider save returned `200`
  - provider catalog returned DeepSeek `configured=true`, `usable=true`, `state=active`, model `deepseek-chat`
  - `/api/sessions` returned `200`
  - `/api/threads/primary/turns` returned `200`
  - streamed `/api/turn` returned `200` with `trace`, `step`, `chunk`, and `final` events
  - final metadata reported `effective_provider=deepseek`, `effective_model=deepseek-chat`, `fallback_used=false`

Next production gate: use the same certified path in a clean human demo workspace and do a final visual browser sweep before the public demo.

## Phase 3 Provider Runtime Truth - 2026-04-29

Phase 3 is locally certified for the currently usable provider.

| Check | Status | Evidence | Remaining Risk |
| --- | --- | --- | --- |
| DeepSeek catalog truth | Passed | Provider catalog shows DeepSeek `configured=true`, `usable=true`, `state=active`, default model `deepseek-chat`, models `deepseek-chat` and `deepseek-reasoner`. | Production must still save at least one provider credential successfully. |
| DeepSeek stream truth | Passed | Authenticated BFF `/api/turn` stream returned `trace`, `step`, `chunk`, and `final`; final content was `provider cert ok`. | Visual browser pass still required. |
| Effective provider metadata | Passed | Final `context_used` reported `requested_provider=deepseek`, `effective_provider=deepseek`, `requested_model=deepseek-chat`, `effective_model=deepseek-chat`, `provider_overridden=false`, `model_overridden=false`, `fallback_used=false`. | None for DeepSeek local cert. |
| Unconfigured provider behavior | Passed | Requesting Anthropic while unconfigured returned a `provider_unavailable` intervention with no effective provider/model. | Anthropic itself is not certified until a credential is saved and catalog becomes usable. |
| Ollama readiness | Partial | Catalog shows Ollama `configured=true` but `usable=false` in this local snapshot. | Needs Ollama/gateway runtime cert if used in demo. |
| OpenAI/Gemini/Codex readiness | Not certified | Catalog shows setup-required locally. | Needs credentials/runtime setup before demo. |

Conclusion: provider selection is truthful for DeepSeek and fail-closed for unconfigured Anthropic. Phase 3 is passed for the local demo provider, but the broader provider matrix remains partial until additional provider credentials are configured and tested.

## Phase 4 Visual Demo Hygiene - 2026-04-29

Phase 4 is partially certified by source and typecheck. A true in-app browser visual pass could not be completed from this execution context because the Browser Use plugin could not attach to the current Codex session metadata.

| Check | Status | Evidence | Remaining Risk |
| --- | --- | --- | --- |
| Composer owns provider/runtime status | Passed by source/typecheck | Header readiness strip rendering is disabled; the composer remains the single visible source for model/reasoning, runtime status, tools, send, and stop. | Needs live browser confirmation after reload. |
| Stale success notices | Fixed by source/typecheck | Successful final stream events now clear stale status/failure notices; normal successful turns no longer write non-actionable "cloud mode" or "routed" notices into the chat surface. | Needs live browser check with multiple sends. |
| Final reply preservation | Fixed by source/typecheck | Final SSE payload text is now captured and copied into the normalized turn response if the transport response omits `reply`. | Needs live browser check against the provider currently selected in UI. |
| Duplicate gateway/provider badges above chat | Fixed by source/typecheck | Readiness pills such as `AI: Connect provider` and `Gateway: Offline` are not rendered in the chat header path. | Needs visual confirmation that no top-center duplicate remains. |
| Provider catalog hydration latency | Fixed locally | Runtime provider catalog status probes are capped for the request path; after restart, direct provider catalog returned `200` in about 2.7s instead of the previous 20-30s stalls. | Further reduction would require async/background provider health caching, but this is no longer a demo-blocking stall. |
| Sage-first shell smoke | Passed by Playwright | `launch-sage-first.spec.ts` logged in, landed on Sage, found the chat pane and composer, and confirmed setup/onboarding chrome was absent. | Does not send a chat message; manual visual send check still required. |

Conclusion: Phase 4 source-level hygiene is improved, but the visual certification remains partial until the local browser is reloaded and checked manually or through a working browser automation session.

## Bugs Fixed In This Pass

- `frontend/lib/workspace/workstation-stream-manager.ts`: duplicate notification/activity events no longer increment stream versions or trigger reload churn.
- `scripts/orion_local_worker_llm.py`: OpenAI-compatible chat-completions requests now fall back to curl on retryable transport failures such as `IncompleteRead`.
- `server_modules/provider_catalog_service.py`: stale cached DeepSeek aliases are no longer presented or accepted as valid direct DeepSeek models.
- `server_modules/direct_chat_runtime_service.py`: tool-inventory questions now receive the full tool catalog, while normal provider chat still receives the narrowed tool list only when tool use is obvious.
- `frontend/lib/workspace/workstation-chat-pane.tsx`: duplicate header readiness strips are disabled, stale success notices are cleared on final events, and final SSE reply text is preserved even when the returned transport response omits `reply`.
- `server_modules/provider_profiles.py`: provider catalog runtime-status probes no longer block the request path for up to 20 seconds; Claude CLI status is capped to 2s and local Ollama status to 1s in catalog truth.

## Verification Commands Run

- `npm run typecheck --prefix frontend`: passed.
- `npm run build --prefix frontend`: passed.
- `venv/bin/python -m py_compile server_modules/direct_chat_runtime_service.py scripts/orion_local_worker_llm.py server_modules/provider_catalog_service.py`: passed.
- `venv/bin/python -m py_compile server_modules/provider_profiles.py`: passed.
- `venv/bin/python -m unittest server_modules.tests.test_direct_chat_tool_catalog_service server_modules.tests.test_provider_catalog_service server_modules.tests.test_orion_local_worker_llm_direct_tools`: passed.
- `venv/bin/python -m unittest server_modules.tests.test_provider_profiles server_modules.tests.test_provider_catalog_service`: passed.
- Provider catalog after runtime restart: direct `GET /api/providers/catalog?workspace_id=ws_abf0aa394d44` returned `200` in about 2.7s.
- `npm run test:e2e --prefix frontend -- tests/e2e/launch-sage-first.spec.ts`: passed.
- Local BFF chat cert: 10/10 consecutive DeepSeek messages passed.

## Next Required Demo Steps

1. Reload the local app and run a visual browser pass: send a normal message, stop one message mid-stream, open the tools palette, and confirm no timeout banner remains after successful turns.
2. Recheck gateway-offline degradation only if the demo includes local tools.
3. Create or choose the final human demo workspace.
4. Save/confirm the demo provider credential in that workspace.
5. Run one visual production Sage "hello" smoke in the browser before public demo.

## Hard Demo Blocks

- A clean production demo workspace does not have one usable provider configured.
- Provider catalog has no usable provider in the demo workspace.
- A successful turn leaves a timeout/error banner visible.
- User messages disappear/reappear in the visual browser path.
- Basic cloud chat requires gateway online.
