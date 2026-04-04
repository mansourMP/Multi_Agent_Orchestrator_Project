# OpenClaw vs Hekor Architecture Gap Report

Date: 2026-03-25

Reference source used:

- [`reference/openclaw/openclaw-src/package.json`](/Users/mansur/Multi_Agent_Orchestrator_Project/reference/openclaw/openclaw-src/package.json)
- [`reference/openclaw/openclaw-src/docs/start/wizard.md`](/Users/mansur/Multi_Agent_Orchestrator_Project/reference/openclaw/openclaw-src/docs/start/wizard.md)
- [`reference/openclaw/openclaw-src/src/agents/tool-policy.ts`](/Users/mansur/Multi_Agent_Orchestrator_Project/reference/openclaw/openclaw-src/src/agents/tool-policy.ts)
- [`reference/openclaw/openclaw-src/src/security/audit.ts`](/Users/mansur/Multi_Agent_Orchestrator_Project/reference/openclaw/openclaw-src/src/security/audit.ts)
- [`reference/openclaw/openclaw-src/src/memory/sqlite.ts`](/Users/mansur/Multi_Agent_Orchestrator_Project/reference/openclaw/openclaw-src/src/memory/sqlite.ts)
- [`reference/openclaw/openclaw-src/src/acp/control-plane/manager.core.ts`](/Users/mansur/Multi_Agent_Orchestrator_Project/reference/openclaw/openclaw-src/src/acp/control-plane/manager.core.ts)
- [`reference/openclaw/openclaw-src/src/gateway/server/health-state.ts`](/Users/mansur/Multi_Agent_Orchestrator_Project/reference/openclaw/openclaw-src/src/gateway/server/health-state.ts)
- [`reference/openclaw/openclaw-src/src/gateway/server/ws-connection/connect-policy.ts`](/Users/mansur/Multi_Agent_Orchestrator_Project/reference/openclaw/openclaw-src/src/gateway/server/ws-connection/connect-policy.ts)

## What OpenClaw Gets Right

### 1. Control plane and runtime are explicitly separated

OpenClaw does not treat the UI as the execution engine.

Signals in source:

- `src/acp/control-plane/*`
- session manager, runtime cache, actor queue, runtime controls
- startup identity reconciliation for pending sessions

Why it matters for Hekor:

- this confirms the architecture decision already taken in Hekor is correct
- one customer-facing app with separate runtimes is the right direction
- Hekor should keep building the runtime boundary, not collapse back into a browser-only mental model

### 2. Safety is implemented as policy, not just UX

OpenClaw has explicit tool policy enforcement and owner-only tool guards.

Signals in source:

- `src/agents/tool-policy.ts`
- owner-only execution wrapping
- allow/deny policy normalization
- plugin allowlist stripping to avoid accidental disabling or unsafe additive behavior

Why it matters for Hekor:

- Hekor already has approval and route concepts, but the policy layer still needs to be treated as a first-class subsystem
- tool access must be resolvable, inspectable, and enforced consistently
- approval UI alone is not enough

### 3. Security audit is a built-in product feature

OpenClaw has a serious audit system, not a “health page” that only checks uptime.

Signals in source:

- `src/security/audit.ts`
- filesystem permission checks
- config path checks
- gateway auth checks
- sandbox risk checks
- secrets/config hygiene checks
- plugins trust checks

Why it matters for Hekor:

- Hekor needs a stronger “doctor / audit / readiness” story
- trust for a business AI OS comes from explainable operational safety, not just nice UI
- this is one of the biggest architecture gaps today

### 4. Health and presence are versioned and broadcastable

OpenClaw treats health as a structured snapshot with state versioning and presence changes.

Signals in source:

- `src/gateway/server/health-state.ts`
- presence version
- health version
- cached snapshot
- refresh/broadcast mechanism

Why it matters for Hekor:

- Hekor already has `/machines`, `/health`, and top-bar runtime status
- the next maturity step is to unify those into one authoritative health snapshot model instead of several partially overlapping fetches

### 5. Gateway auth rules are explicit and defensive

OpenClaw has dedicated connection policy logic around device identity, trusted proxy auth, local exceptions, and control UI behavior.

Signals in source:

- `src/gateway/server/ws-connection/connect-policy.ts`

Why it matters for Hekor:

- Hekor should keep separating:
  - user auth
  - machine identity
  - local-machine trust
  - browser control-plane access
- these should not stay mixed together in ad hoc route checks

### 6. Onboarding is opinionated but layered

OpenClaw’s wizard has:

- QuickStart
- Advanced
- local vs remote
- workspace
- model/auth
- channels
- daemon
- health
- skills

Signals in source:

- `docs/start/wizard.md`

Why it matters for Hekor:

- Hekor is correct to keep onboarding simpler for non-technical users
- but it still needs a second layer for advanced/runtime/operator setup
- that means:
  - simple setup flow for normal users
  - advanced configure/runtime path for operators/admins

### 7. Codebase discipline is treated as architecture

OpenClaw enforces LOC and dead-code checks in scripts.

Signals in source:

- `package.json`
- `check:loc`
- dead-code scripts
- docs/link/format/lint/test structure

Why it matters for Hekor:

- “clean codebase” is not cosmetic
- Hekor should continue the cleanup work and add architecture constraints so the codebase does not sprawl again

## Where Hekor Is Already Strong

Hekor already has strengths OpenClaw does not optimize for in the same way:

- cleaner business-facing onboarding
- a calmer premium web shell
- a simpler plain-language entry path
- explicit execution target language:
  - `Automatic`
  - `Local machine`
  - `Cloud runtime`
- a stronger business-operations framing rather than a channel-first gateway framing

This means Hekor should not try to become OpenClaw.

It should adopt OpenClaw’s reliability patterns while keeping its own front-door simplicity.

## The Biggest Gaps Hekor Still Has

### Gap 1. No single authoritative runtime health model

Current Hekor status is spread across:

- `/health`
- `/machines`
- top-bar runtime pill
- run routing hints

Needed:

- one canonical runtime health snapshot contract
- versioned machine/routing/health state
- one shared source of truth for UI surfaces

### Gap 2. Policy is still too UI-driven

Hekor needs a stronger internal policy layer for:

- tool allow/deny
- route eligibility
- owner/admin-only actions
- local-only capabilities
- approval-required actions

Needed:

- one policy evaluation contract
- one user-facing explanation layer
- one enforcement layer at runtime

### Gap 3. No real “doctor” grade audit yet

Hekor needs a deeper audit capability for:

- config integrity
- local runtime trust
- credentials hygiene
- directory permissions
- dangerous execution settings
- connector trust and routing safety

Needed:

- audit report with severities
- remediation guidance
- visible readiness score only after real checks exist

### Gap 4. Runtime identity is still basic

Hekor now has runtime registration, heartbeat, claim, and Machines UI.

Needed next:

- machine identity reconciliation
- capability change tracking
- machine trust state
- local vs headless vs cloud lifecycle semantics
- better stale/offline detection

### Gap 5. Advanced setup path is still underdeveloped

Hekor has a good simple setup flow.

Needed:

- advanced operator path
- machine registration/configure flow
- route defaults and policy setup
- business admin setup without exposing this to every normal user

### Gap 6. Architecture guardrails are still weak

Needed:

- LOC budgets for oversized frontend files
- dead-code and duplicate-style checks in CI
- stricter route/runtime contract tests
- explicit runtime protocol tests

## What Hekor Should Copy From OpenClaw

Copy these ideas:

1. Runtime/control-plane separation
2. Capability and policy enforcement as code
3. Built-in doctor/audit posture
4. Health snapshot as a real product contract
5. Layered onboarding:
   - simple
   - advanced
6. Codebase discipline as architecture

## What Hekor Should Not Copy

Do not copy:

1. Channel-first product framing
2. Developer-heavy setup language at the front door
3. Raw technical surface area for ordinary users
4. OpenClaw’s exact CLI/gateway mental model

Hekor should stay:

- business-first
- plain-language first
- execution-system second
- advanced complexity only when needed

## Recommended Next Build Order

### Phase 1. Runtime truth

Build one canonical runtime snapshot contract for:

- machine registry
- health
- connectivity
- claimed task
- route availability

### Phase 2. Policy truth

Build one policy evaluation layer for:

- route eligibility
- local-only actions
- approval-required actions
- restricted tools

### Phase 3. Doctor / audit

Build a real Hekor doctor surface that checks:

- runtime availability
- config integrity
- credentials presence
- permission posture
- dangerous flags

### Phase 4. Advanced operator setup

Keep `/setup` simple for non-technical users.

Add a separate advanced path for:

- machines
- runtime defaults
- trust and approval policy
- connector admin setup

### Phase 5. Architecture guardrails

Add automated checks for:

- oversized files
- dead code
- duplicate CSS
- runtime contract drift

## Final Decision

OpenClaw confirms the current Hekor direction:

- one frontend
- separate runtime
- optional local machine
- optional cloud/headless execution
- policy and audit as first-class architecture

The right move is not to copy OpenClaw visually.

The right move is to use OpenClaw as a reliability reference while Hekor keeps its simpler, more business-friendly product surface.

