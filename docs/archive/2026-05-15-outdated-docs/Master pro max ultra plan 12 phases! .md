• Implementation Plan
  Use this as the operating plan for DeepSeek. It should build phase-by-phase. At the end of each phase, I will
  inspect the diff, run focused + full verification, fix gaps if needed, commit, and push.

  Global Rules

  - DeepSeek should not push.
  - DeepSeek should not touch unrelated files.
  - Each phase must be narrow, testable, and separately reviewable.
  - No new product areas: no marketplace expansion, no new providers, no large UI redesign.
  - Closed-pilot goal stays: Sage + Gateway + personal channels + audit/transparency + kill switch.

  Phase 1: Backend Truth Stabilization
  Goal: make the backend suite truthful and clean enough to trust.

  Scope:

  - Fix stale failing tests from the audit.
  - Repair tenant/workspace test setup causing channel/shop/deployed-agent failures.
  - Update Gateway tests that still expect risky local actions to execute without approval.
  - Fix Gateway doctor payload tests.
  - Fix deployed-agent cost-cap test failures if they are real regressions.

  Expected commits:

  - tests: stabilize backend tenant fixtures
  - tests: align gateway safety expectations
  - tests: stabilize deployed agent cost caps

  Gate:

  - PYTHONPATH=. venv/bin/python -m pytest server_modules/tests/test_*.py -v
  - Gateway TS tests still pass.
  - No runtime safety weakening to satisfy tests.

  Phase 2: UI Information Architecture Truth
  Goal: make the 5 launch surfaces truthful.

  Surfaces:

  - Sage
  - Studio Agents
  - Gateway
  - Memory
  - Activity / Safety

  Fix:

  - Marketplace must not be labeled as Memory.
  - Settings must not be mislabeled as Activity if it is not the actual activity surface.
  - Sage internal Memory tab is okay if it opens Sage memory.
  - Studio memory should be Agent Memory / Memory Policy, not Sage Memory.
  - Gateway channels should read Personal Channels.
  - Studio channels should read Customer Channels.

  Gate:

  - Frontend typecheck passes.
  - No backend behavior changes.
  - No hidden route exposed unless intended.

  Phase 3: Runtime Jargon Cleanup
  Goal: normal users only see product runtime names.

  Allowed visible names:

  - Text Agent
  - Cloud Computer Agent
  - My Computer Agent
  - Self-Hosted Agent

  Remove or hide from normal UI:

  - local_companion
  - runtime_type
  - runtime_class
  - runtime_choice
  - attachment_kind
  - InMemoryVirtualComputerRuntime
  - v1alpha1
  - provider-tagged runtime labels

  Gate:

  - Internal diagnostics may keep technical terms.
  - Normal Studio UI must not expose them.
  - Frontend typecheck passes.

  Phase 4: Gateway / My Computer Readiness
  Goal: make My Computer path demonstrably safe and understandable.

  Fix/verify:

  - Gateway doctor payload is stable.
  - Gateway offline failure is clear.
  - My Computer mode shows Needs Gateway if no paired Gateway exists.
  - Risky local actions require approval.
  - Kill switch blocks Gateway execution.
  - No cloud fallback for My Computer.
  - Activity/audit records exist for execute, deny, approve, kill.

  Gate:

  - test_gateway*.py passes.
  - Gateway TS tests pass.
  - Closed-pilot Gateway smoke still passes.

  Phase 5: Studio Agents Readiness
  Goal: Studio Agents are truthful before polish.

  Fix/verify:

  - Draft/private test-turn works.
  - Test-turn never sends real customer messages.
  - Policy decisions are visible.
  - Memory context is isolated from Sage private memory.
  - Cloud Computer fails closed without real provider in staging/prod.
  - My Computer requires Gateway.
  - Cost caps and quotas are enforced or clearly blocked.
  - Lifecycle states are truthful: draft, private_test, ready/live, paused, suspended, archived.

  Gate:

  - test_deployed_agent*.py passes.
  - No fake runtime shown as ready.
  - No owner Sage memory leaks into customer agents.

  Phase 6: Channels Readiness
  Goal: separate personal channels from business/customer channels.

  Personal channels:

  - Telegram personal to Sage through Gateway.
  - WhatsApp personal to Sage through Gateway.
  - Trace ID preserved.
  - Kill switch blocks inbound/manual send.
  - Credential redaction works.

  Studio/customer channels:

  - Web Chat status truthful.
  - Email/Telegram/WhatsApp/Slack/Discord marked working, partial, or roadmap based on backend reality.

  Gate:

  - test_personal_channel*.py and test_channel*.py pass or failures are fixed.
  - No business channel is shown as production-ready if backend is partial.

  Phase 7: Activity / Transparency Hardening
  Goal: operator can understand what happened.

  Fix/verify:

  - Trace search works reliably.
  - Timeline can find Sage, Gateway, approval, and audit events by trace_id.
  - Raw chain-of-thought is never exposed.
  - Secrets are redacted.
  - Failed/blocked actions are logged.
  - Activity UI does not dump raw internal metadata.

  Gate:

  - test_*transparency* passes.
  - test_activity* passes.
  - Closed-pilot trace lookup proves persistence.

  Phase 8: Memory Safety / Retention
  Goal: memory is safe and product-truthful.

  Fix/verify:

  - critical_restricted excluded from prompts by default.
  - Sage private memory does not leak to Studio agents.
  - Retention dry-run and apply are real.
  - Memory deletion/tombstone behavior is honest.
  - Cross-workspace memory access is blocked.
  - UI labels distinguish Sage Memory, Agent Memory, Workspace Memory.

  Gate:

  - Memory and retention tests pass.
  - No rewrite of memory architecture.
  - No arbitrary memory file work from the other agent’s scope unless explicitly needed.

  Phase 9: Production Config / Mobile / Desktop Truth
  Goal: no production path accidentally uses localhost or unsafe URLs.

  Fix/verify:

  - Frontend production requires HTTPS API.
  - Mobile production requires HTTPS API.
  - Gateway cloud mode requires HTTPS/WSS.
  - CORS is not wildcard in production.
  - Desktop/mobile surfaces are marked truthful: working, partial, or future.

  Gate:

  - Frontend typecheck passes.
  - Mobile lint passes or only existing non-blocking warnings remain.
  - Production config tests pass.

  Phase 10: Marketplace / Skills / Mini-Apps Containment
  Goal: keep future product areas from confusing pilot readiness.

  Fix/verify:

  - Marketplace preview packages are clearly preview.
  - Payment/billing is not implied as live if not implemented.
  - Mini-apps are not treated as launch-critical.
  - Skills scanning remains safe.
  - Install actions are blocked or gated where needed.

  Gate:

  - No launch UI claims production marketplace unless backend proves it.
  - No payment flow exposed as real if it is only metadata.

  Phase 11: Real Closed-Pilot Certification
  Goal: prove the wedge again after all fixes.

  Run:

  - Web Sage chat with real provider.
  - Sage loads profile/memory/heartbeat.
  - Risky action creates approval.
  - Approval accepted.
  - Gateway executes local action.
  - Activity timeline finds trace.
  - Audit records exist.
  - Kill switch blocks next Gateway action.
  - Kill switch clear re-enables action.

  Gate:

  - Real trace_id captured.
  - Real Gateway ID captured.
  - Activity/audit evidence captured.
  - No raw secrets or CoT exposed.

  Phase 12: Final Release Readiness Report
  Goal: make a final go/no-go call.

  Output:

  - P0 blockers: should be zero.
  - P1 risks: explicit and non-launch-blocking.
  - P2 backlog: deferred.
  - Tests run with results.
  - Smoke proof with trace ID.
  - Final recommendation: closed pilot, UI polish, or stop.

  Usage / Credits / Agent Limits Integration Addendum
  This addendum does not change the 12-phase order above. It maps the usage, credits, and "many agents without
  unlimited compute risk" work into the existing phases so the plan does not drift.

  Product principle:

  - Users may create many draft agents without burning platform compute.
  - The platform must limit what can be live, running, cloud-hosted, or concurrently active.
  - Local and self-hosted runtime should not consume Empyralis cloud-compute budget, but still needs control-plane
    quotas, audit, safety gates, and fair-use limits.
  - Credits must be based on actual metered usage, not fixed per-message guesses.
  - The UI must never imply exact token/credit cost before actual provider/runtime usage is known.

  Phase 2 integration:

  - Remove or hide misleading fixed-cost UI such as "7 credits per message" if it appears in normal chat or Studio UI.
  - If cost appears before send, label it as an estimate only.
  - If token-accurate metering is not implemented yet, do not show a fake precise credit number.
  - Do not build the credit wallet in Phase 2. Phase 2 only makes the UI truthful.

  Phase 5 integration:

  - Studio Agents may support generous created-agent counts, but live agents, running agents, cloud computer sessions,
    runtime minutes, and background jobs must be bounded.
  - Enforce cost caps and quotas server-side for deploy/run/action paths.
  - Cloud Computer Agent must consume metered runtime budget.
  - My Computer Agent must require Gateway health and safety gates, but should not be billed as hosted cloud compute.
  - Self-Hosted Agent must require a registered node and should be bounded by node capacity plus control-plane fair use.

  Phase 7 integration:

  - Activity / Safety must show useful usage evidence: model tokens when available, runtime seconds, tool calls,
    channel sends, approval events, blocked events, and trace_id.
  - Operators must be able to answer "what cost money and why?" from the activity/audit trail.
  - Failed, blocked, and refunded/reserved usage events must be logged.

  Phase 10 integration:

  - Billing and credits must be truthful and contained.
  - Do not expose payment processing as live if it is metadata-only.
  - Do not expose fake credit balances or fake exact per-message pricing.
  - If billing is not production-ready, label it as preview/internal or hide it from normal users.

  Future dedicated usage-metering phase:

  - Add a usage ledger for LLM input tokens, LLM output tokens, tool calls, cloud computer runtime seconds, Gateway
    actions, self-hosted node actions, storage/memory growth, and channel sends.
  - Use provider-reported token usage when available.
  - Use tokenizer estimates only as fallback when provider usage metadata is unavailable.
  - Reserve credits before expensive actions, settle after actual usage, and refund unused reservations.
  - Enforce hard daily/monthly spend caps and credit-balance caps before runtime execution.
  - Add tests proving short messages cost less than long messages, output-heavy responses cost more, provider usage
    metadata wins over estimates, no fixed per-message charge remains, cloud runtime bills runtime seconds, and local
    / self-hosted runtime does not bill hosted cloud compute.

  My Review / Push Routine At Each Phase
  After DeepSeek finishes each phase, I will do this before pushing:

  - Inspect git status --short.
  - Inspect exact diff and reject unrelated files.
  - Run focused tests for the phase.
  - Run required broader tests if touched area is risky.
  - Fix only gaps inside that phase.
  - Check commit message has no Claude/Co-Authored-By/Anthropic trailer.
  - Commit only phase files.
  - Push to origin/main.
  - Report commit hash, tests, remaining risks, and next phase.

  Immediate Next Phase
  Start with Phase 1: Backend Truth Stabilization. That is the highest-leverage next step because the platform smoke
  passed, but the full backend suite still contains P1 truth failures. Until that is clean or clearly classified, UI
  polish would be premature.
