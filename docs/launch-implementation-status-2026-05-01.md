# Launch Implementation Status

Date: 2026-05-01
Status: current implementation tracker

## Current Launch Verdict

The web Sage public-demo path is certified for launch-demo scope after the 2026-05-01 production cert pass. Phone web is HTTP-certified against the production workspace routes. Native mobile, Tauri desktop companion, Cloud Computer, and Marketplace publishing remain separate certification lanes.

## Implemented Or Contract-Ready

- Production provider truth and Sage chat are certified with DeepSeek on the current production deployment.
- Hosted Sage AI entitlement now honors workspace admin-default `billing_plan`, so the routing page and provider catalog use the same plan/policy source.
- Integrations now presents the normal-user path first: Empyralis credits, then BYOK. Hosted-credit provider failures are app-level messages; BYOK failures point to provider key/quota setup without exposing raw provider dumps.
- Chat uses Codex-style transcript cells for thinking, tool, approval, screenshot/artifact, and assistant output.
- Chat send failures now render as actionable notices with Retry, Open Integrations, or Dismiss instead of text-only dead banners.
- Gateway offline state is part of the runtime/tool truth model.
- Studio has square templates and a custom-agent path.
- Marketplace has governed preview packages and hides developer publishing behind an explicit panel.
- Memory is modeled as structured sensitivity classes, with Markdown suitable as import/export rather than canonical runtime state.
- Cloud Computer has a backend/runtime contract but no live provisioner.
- Tauri has a desktop shell and update hooks, and is now documented as the local companion lane.

## Remaining Demo-Critical Work

1. Keep live demo credentials outside git.
2. Use the certified production demo workspace/provider for the public demo.
3. Do not demo Cloud Computer, native mobile, or Marketplace publishing until their separate certs pass.
4. Optional before going live: one human visual pass on an actual phone, because the automated phone web gate is HTTP/route-level rather than visual.

## Remaining Product Work

- Native mobile certification: login, provider picker, chat, history, memory, tools, approvals, gateway status.
- Tauri certification: pairing, local tool execution, supervisor health, approval flow, signed release.
- Cloud Computer MVP: cloud browser, sandbox, TTL cleanup, spend meter, audit timeline, artifact egress.
- Billing and hosted AI credits: usage ledger, credit balance, spend caps, plan enforcement.
- Marketplace backend seed: installable packages with permissions, pricing, publisher, and trust metadata.

## Verification Added On 2026-05-01

- Production deployed commits:
  - `a5eb6160f fix: restart unfinished Sage streams on retry`
  - `7434a9184 fix: honor admin billing plan for hosted Sage`
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

## Hard Rules

- Provider choice changes reasoning model only; it must not change tool truth.
- Local tools are enabled by gateway status, not provider.
- Full Access is only for local companion, never Cloud Computer.
- Cloud transcript history is canonical; local stores are caches.
- Raw runtime errors must never become chat transcript or composer text.
