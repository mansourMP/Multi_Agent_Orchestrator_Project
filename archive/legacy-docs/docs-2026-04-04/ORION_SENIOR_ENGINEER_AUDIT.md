# Empyralis Platform: Senior Engineer Audit (AI Workspace Edition)

> Updated: 2026-03-03  
> Scope: practical path from current Empyralis to a reliable AI workspace (not vague "AGI someday").

---

## Executive Verdict

Empyralis has a strong core architecture and can become a serious AI workspace.  
It is already usable for Telegram + local web operation, but not production-safe at scale yet.

The right strategy is:
1. reliability and security hardening,
2. workspace capabilities (projects/tools/memory UX),
3. advanced autonomy later.

---

## Current Reality (Verified)

What is true today:
- Runtime, backend, frontend, worker model is in place and working.
- Telegram autopilot works in real runs.
- Policy framework exists (trust modes, approvals, blocked actions).
- Memory exists (LanceDB-backed profile/session/domain retrieval path).
- Skills and channel-level routing exist.
- Codex path is working in current environment (`provider: codex_cli` in successful runs).

What is not yet true:
- This is not a true computer-use agent yet.
- State durability and concurrency guarantees are weak.
- Security defaults and crypto implementation need upgrades.
- WhatsApp connector is not fully operational in current setup.

---

## What the Previous Audit Got Right

These are high-confidence issues and should stay top priority:

1. Runtime state durability is weak:
- Critical run/history/channel state is in-memory first, with JSON files.
- Crash/restart behavior and consistency are fragile.

2. Crypto implementation risk:
- Vault encryption relies on OpenSSL subprocess calls.
- Passphrase handling via CLI arg is a security smell.

3. Codebase hot spots:
- `server.py` is too large.
- `server_modules/autopilot_connectors.py` is too large and multi-responsibility.

4. AI workspace capability gap:
- Limited tool execution (code/browser/file automation not first-class yet).
- No robust long-horizon project execution model.

5. Observability gap:
- Health/status tooling exists, but no deep telemetry/cost/perf tracing pipeline.

---

## Corrections to Keep the Audit Accurate

The old version had a few overstatements:

1. "No auth" is inaccurate as an absolute statement:
- In practice, startup flows use API-key/Codex auth modes.
- Correct statement: auth model exists, but defaults/policy should be hardened and standardized.

2. "Single-user only" is directionally true for product posture, but:
- Workspace semantics and config scaffolding exist.
- Correct statement: not enterprise-grade multi-tenant yet.

3. "Just a chatbot relay":
- Too dismissive. The orchestration/policy/channel foundation is real.
- Correct statement: strong orchestration foundation, thin tool-execution layer.

---

## Target Product Definition: AI Workspace

For Empyralis, "AI workspace" should mean:
- One operational home (web + messaging), not terminal-heavy by default.
- Persistent projects with goals, checkpoints, and resumable runs.
- Safe tool execution (code, web, files, APIs) under policy and approvals.
- Structured memory that improves output quality over time.
- Clear operator controls (status, approvals, run traces, recovery actions).

Not required for initial success:
- Full AGI marketing claims.
- Fully autonomous computer takeover.

---

## Priority Matrix (What to Build First)

## P0 — Reliability + Security (blocker tier)

1. Durable state store:
- Move runtime state from in-memory/JSON to SQLite (minimum), with transactional writes.
- Keep JSON export as backup/reporting only, not source of truth.

2. Crypto hardening:
- Replace OpenSSL subprocess encryption with `cryptography` (Fernet/AES-GCM design).
- Support safe key rotation and migration.

3. Auth hardening:
- Make secure mode the default for runtime endpoints.
- Keep explicit dev override only.

4. Input safety:
- Add text sanitization + prompt injection checks for channel inputs.
- Add PII redaction path for persisted logs/history.

5. Module split:
- Break `autopilot_connectors.py` into channel modules.
- Continue extracting `server.py` responsibilities into `server_modules`.

Exit criteria (P0):
- Clean restarts with no state corruption.
- Consistent auth behavior.
- No secret leakage paths via process args/logs.

## P1 — AI Workspace Core

1. Project model:
- Create project-level entities: goal, milestones, status, owner, timeline.

2. Tool registry v1:
- Code execution (sandbox), web fetch/browse, file operations, API caller.
- Each tool mapped to policy risk level and approval requirements.

3. Run timeline UX:
- Show step-by-step run traces in web UI.
- Add explicit retries/fail reasons and "resume from step" action.

4. Better onboarding:
- Keep setup minimal.
- Move profile/context questions into chat experience progressively.

Exit criteria (P1):
- User can run practical multi-step workflows from web/Telegram without terminal.

## P2 — Advanced Autonomy

1. Planner-executor architecture:
- Intent -> task DAG -> step execution -> repair loop.

2. Long-horizon automation:
- Scheduled projects, recurring goals, checkpointed progress.

3. Specialist agents:
- Orchestrator delegates to focused worker profiles/tools.

Exit criteria (P2):
- Reliable multi-day outcomes with operator trust and control.

---

## File-Level Action Plan

### Runtime and state
- `server.py`
- `server_modules/*`

Actions:
- Introduce persistent runtime store interface.
- Route runs/history/events/schedules/profiles through DB-backed repositories.
- Reduce global mutable state usage.

### Connectors
- `server_modules/autopilot_connectors.py`

Actions:
- Split by channel and feature domains:
  - `connectors/telegram/*`
  - `connectors/whatsapp/*`
  - `connectors/common/*`
- Isolate menu logic, profile flow, event storage, delivery retries.

### Worker and execution
- `scripts/orion_local_worker.py`

Actions:
- Add tool-call execution loop and structured step results.
- Add bounded retries with explicit failure categories.

### Security and vault
- `server.py` vault helpers + state files in `.orion-*`

Actions:
- Implement cryptography-based encryption helpers.
- Add migration path for existing encrypted material.
- Add audit events for credential read/write operations.

### Web workspace UX
- `frontend/app/page.tsx`
- `frontend/app/page.api.ts`
- `frontend/components/orion/*`

Actions:
- Add project board, run timeline, approvals center, connector health panel.
- Ensure all critical operations can be triggered from browser.

---

## 90-Day Execution Plan (Gate-Based)

### Gate 1 (Days 1-21): Stabilize
- State persistence migration prototype (SQLite).
- Secure crypto migration.
- Auth defaults and safety filters.
- Connector/module split kickoff.

### Gate 2 (Days 22-50): Workspace Core
- Project entities + UI.
- Tool registry v1 with policy integration.
- Run timeline and resume controls.

### Gate 3 (Days 51-90): Agentic Expansion
- Planner-executor prototype.
- Multi-step scenario pack (5 real workflows).
- Long-horizon scheduled project alpha.

Success metric:
- Operators can run real business workflows through web/Telegram with low manual debugging.

---

## Non-Negotiable Engineering Rules

1. No new monolith modules.
2. No plaintext secret persistence.
3. No feature merge without observable failure modes and logs.
4. No "magic fallback" that hides errors from operators.
5. Every high-risk tool action must pass policy/approval checks.

---

## Final Assessment

Empyralis is not "done," but it is absolutely buildable into a serious AI workspace.

The architecture direction is correct.  
The next wins come from disciplined execution, not reinvention:
- harden state,
- harden security,
- add real tools,
- ship workspace UX around projects and traceable execution.

