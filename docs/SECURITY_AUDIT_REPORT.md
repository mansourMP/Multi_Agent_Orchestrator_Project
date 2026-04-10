# Empyralis Security Audit Report

Date: 2026-04-09
Scope: API routes, control-plane logic, runtime execution paths, tenant routing, tool policy enforcement, and approval enforcement.
Role: CISO review for external multi-tenant scale.

## Executive Verdict

Empyralis is **not yet ready** to host hostile or semi-trusted external tenants on shared infrastructure.

The current platform has meaningful safety mechanisms:
- explicit `tenant_id` and `workspace_id` columns in the control plane
- app-layer workspace access enforcement on many API routes
- approval-backed local execution gates
- tool policy prechecks
- fail-closed durable run-state persistence
- CAS run claims
- local file write locking and atomic writes

Those are real controls, but they are **not sufficient** for external commercial multi-tenancy.

The core problem is simple:

1. **Compute is not sandboxed strongly enough.**
   Local worker execution still reaches the host through direct subprocesses, filesystem access, and desktop/browser control.

2. **Data isolation is enforced mostly in application code, not in the database.**
   There is no evidence of Postgres Row-Level Security, and there are still `default` workspace/tenant fallback paths.

3. **Tool entitlements are not yet enforced as a strict install-scoped keycard system.**
   Current controls are mostly workspace policy + runtime policy + approval checks, not hard per-agent product entitlements.

4. **Human approval is backend-enforced, but not cryptographically hardened.**
   The system does more than draw cards in the UI, but it is still approval-ID and run-state based, not signed capability-grant based.

If Empyralis were a building, the current security posture is:
- there is a front desk
- there are some door guards
- there are some approval clipboards
- but there are still shared hallways, master keys, and side entrances

That is acceptable for controlled internal deployment.
It is **not acceptable** for large-scale third-party tenancy.

## Overall Readiness Summary

- Compute sandboxing: **3/10**
- Data segregation: **4/10**
- Tool scoping / RBAC: **4/10**
- Human-in-the-loop enforcement: **6/10**

Overall external-tenant readiness: **4/10**

Release stance:
- Internal / founder-operated / trusted pilot: acceptable with guardrails
- Shared SMB multi-tenant cloud: not acceptable yet
- Enterprise multi-tenant with untrusted workloads: not acceptable yet

## Pillar 1: Compute Sandboxing

### What Exists Today

Agent execution currently happens in two materially different modes:

1. **Cloud/server-side execution**
   - orchestration and run logic are handled in-process through the backend runtime
   - key files:
     - `server_modules/run_service.py`
     - `server_modules/runs_execution.py`

2. **Local companion execution**
   - local actions are executed by the desktop/local worker
   - key file:
     - `scripts/orion_local_worker_execution.py`

The local worker currently has direct access to:
- shell execution
- filesystem read/write/delete
- browser automation
- screenshot capture
- desktop control primitives
- AppleScript / app launching / click / type / window control

The strongest evidence is in `scripts/orion_local_worker_execution.py`, which:
- imports and runs `subprocess`
- exposes `shell.execute`
- exposes `filesystem.read_write`
- exposes `computer_control.*`
- performs host-level file operations directly

The shell path uses `subprocess.Popen(...)` directly. That is host execution, not sandbox execution.

### Security Strengths Present Today

- dangerous or sensitive direct tools often require approval
- browser interactive/privileged execution has reviewed-approval checks
- browser execution paths perform binding-drift checks after approval
- same-file local mutation now has:
  - sidecar locks
  - advisory lock support via `fcntl`
  - atomic write/replace

These are important safety controls, but they are **operational controls**, not real compute isolation.

### Critical Gaps

#### 1. Local execution is still host-native
There is no evidence of:
- Docker-based execution isolation
- microVM isolation
- gVisor / Firecracker / Kata / jailer layer
- per-run OS user sandboxing
- per-tenant filesystem namespaces

An agent granted local execution is still operating on the actual machine/runtime, merely under policy checks.

#### 2. Cloud execution is not tenant-hardened compute isolation
The orchestration runtime runs in the backend process space. There is no demonstrated per-tenant or per-run isolated worker boundary for untrusted code or malicious prompts.

#### 3. Tool restrictions are policy restrictions, not kernel restrictions
The current system says “don’t do X unless approved” or “this path is blocked,” but the runtime is not yet built so that a compromised execution environment physically cannot do X.

### What This Means in Practice

If Business A’s agent is allowed to execute against a local or shared environment:
- it may be prevented by policy from doing some dangerous actions
- but if the runtime or dispatch boundary is bypassed or misrouted, the agent still operates near the host

That is not the “Titanium Room.” It is a guarded office.

### Required Architecture Blueprint

#### P0
- All untrusted or third-party agent execution must move into **sandboxed compute envelopes**
- Use one of:
  - per-run microVM
  - per-tenant isolated container pool with hardened seccomp/apparmor profiles
  - per-run container + network/filesystem namespace + short-lived credentials

#### P0
- Local companion execution must be treated as a **privileged edge runtime**
- It must never be assumed equivalent to safe cloud execution
- Product policy should explicitly distinguish:
  - cloud-safe tools
  - local-privileged tools

#### P1
- All local privileged tools must execute under a supervisor process that can:
  - start in a restricted OS account or jailed context where possible
  - kill process groups authoritatively
  - revoke temporary credentials
  - mount only approved folders

#### P1
- Runtime attestation:
  - every worker should register a machine/runtime capability envelope
  - every run should carry a verified execution envelope
  - approval must be tied to that exact envelope

### Verdict

Current status: **policy-gated host execution**

Required status before shared external tenants: **sandboxed execution with real OS/container boundaries**

---

## Pillar 2: Data Segregation

### What Exists Today

The control plane schema is tenant-aware.

Key file:
- `server_modules/control_plane_repository.py`

Tables include explicit tenant/workspace scoping, including:
- `tenants`
- `workspaces`
- `workspace_memberships`
- `agent_threads`
- `agent_sessions`
- `agent_turns`
- `agent_definitions`
- `agent_definition_versions`
- `workspace_agent_installs`
- `runtime_profiles`

This is a strong schema direction. The platform clearly intends to be tenant-aware.

App-layer route enforcement also exists in many places through:
- `server_modules/auth.py`
- `enforce_workspace_access(...)`

This enforcement is visible in routes such as:
- connector/profile/credential routes in `server_modules/routes_connectors.py`
- run APIs and runtime routes
- agent registry APIs

### Security Strengths Present Today

- many routes do validate `workspace_id` against current user access
- authorization metadata carries workspace/tenant awareness
- capability and connector policy checks exist per workspace
- control-plane records carry tenant/workspace columns consistently

### Critical Gaps

#### 1. No database-enforced tenant isolation was found
There is no evidence in the schema of:
- `ENABLE ROW LEVEL SECURITY`
- `CREATE POLICY`

That means the primary data wall is still the application layer.

For shared multi-tenant SaaS, that is too weak.

If one repository query forgets to scope by `tenant_id` or `workspace_id`, the database does not save you.

#### 2. `default` tenant/workspace fallback still exists
`server_modules/auth.py` still contains strong fallback behavior:
- `ORION_DEFAULT_TENANT_ID = "default"`
- `ORION_DEFAULT_WORKSPACE_IDS = ("default",)`

More importantly, `tenant_id_for_workspace(...)` falls back to local registry state and may create default mappings automatically if a workspace is missing.

That means absence of tenancy truth can silently become “default tenant.”

That is dangerous.

In a true external multi-tenant system, missing tenant mapping should fail closed, not self-heal into a shared default domain.

#### 3. Authorization truth is split between Postgres and local SQLite fallback
`server_modules/auth.py` maintains an auth SQLite database at:
- `~/.empyralis/state/auth/users.db`

It stores local tables such as:
- `workspace_registry`
- `workspace_memberships`
- workspace/tenant policy tables

`tenant_id_for_workspace(...)` checks the control plane first, then falls back to SQLite, and can write default mappings.

This is a serious architectural risk for production multi-tenant isolation:
- two sources of truth
- local fallback mutation
- default-tenant materialization

#### 4. API key auth is effectively owner/admin access
In `server_modules/auth.py`, a valid `X-API-Key` returns:
- `auth_type = "api_key"`
- `role = "owner"`
- `is_admin = True`

That is a service-level skeleton key.

This may be acceptable for internal backend service traffic, but it is not acceptable as a broad production access mode without strict audience separation and infrastructure boundaries.

#### 5. Auth-disabled mode behaves as owner-like access
The auth subsystem still supports disabled-auth operation. That is useful for local development, but extremely dangerous if not completely impossible in hosted production.

### What This Means in Practice

If Business A’s agent queries the system today, the main thing preventing it from reading Business B’s data is:
- route-level app logic
- workspace scoping discipline
- repository query correctness

That is not enough at scale.

### Required Architecture Blueprint

#### P0
- Add **Postgres Row-Level Security** to all tenant-scoped control-plane tables
- Drive RLS via session variables or dedicated DB roles that carry:
  - `tenant_id`
  - `workspace_id`
  - service role vs user role

#### P0
- Remove silent `default` tenant/workspace fallback in production mode
- Missing tenant/workspace binding must raise and stop

#### P0
- Make Postgres the only source of truth for:
  - workspaces
  - memberships
  - tenant bindings
  - authorization policies

#### P1
- Keep local SQLite only for local development or offline bootstrap modes
- Production must never make tenancy decisions from local per-node SQLite state

#### P1
- All repository methods must accept auth-derived scope only
- Never trust raw client-provided `tenant_id`
- Never infer cross-tenant access from request payload alone

### Verdict

Current status: **tenant-aware schema with app-layer isolation**

Required status before shared external tenants: **DB-enforced tenant isolation with RLS and no default fallback leakage**

---

## Pillar 3: Tool Scoping & RBAC

### What Exists Today

The platform has real policy machinery for tools.

Key files:
- `server_modules/policy_service.py`
- `server_modules/direct_tool_approval_service.py`
- `server_modules/skills_service.py`
- `server_modules/run_service.py`
- `server_modules/template_compiler_service.py`
- `server_modules/agent_registry_repository.py`

The current architecture includes:
- capability manifests on agent definitions
- tool toggles on installed agents
- folder grants on installed agents
- connector bindings on installed agents
- runtime policy prechecks
- approval-required action calculation

This is good product structure.

### Security Strengths Present Today

- tool toggles and folder grants exist in `workspace_agent_installs`
- template compilation carries tool toggles, folder grants, and connector bindings into compiled artifacts
- runtime policy precheck can block or require approval for dangerous actions
- direct-tool approval logic exists for:
  - shell
  - file writes
  - browser
  - computer control

### Critical Gaps

#### 1. Entitlement enforcement appears stronger at workspace/runtime policy level than at install keycard level
The product data model says:
- “this installed agent has these toggles, grants, and bindings”

But the hard enforcement boundary today looks more like:
- workspace capability policy
- runtime policy
- tool sensitivity rules
- approval checks

That is not the same thing as:
- “this specific sold agent install is allowed to use only these tools and nothing else”

#### 2. Tools are not yet clearly gated by an install-scoped execution grant
The run/turn metadata does carry:
- `active_agent_install_id`
- compiled workflow version IDs

But the actual runtime/tool enforcement path still appears to rely heavily on metadata-derived action policy and approval prechecks, not a server-minted install entitlement token.

If you sell Agent A to Business A and Agent B to Business B, the enforcement model should be:
- identify the install
- load the install’s allowed actions
- load the install’s allowed folders
- load the install’s allowed connectors
- deny everything else by default

That strict deny-by-default keycard model is not yet fully evident.

#### 3. Workspace-level access is not enough for product-boundary security
An agent should not inherit all tools available to a workspace simply because the workspace has them.

There must be a difference between:
- workspace can do this
- this installed agent is allowed to do this

Today that distinction exists in data, but not yet as a fully hardened universal gateway rule.

#### 4. Skills inventory is filesystem-backed
Installed skills are still discoverable from local filesystem roots.
That is operationally flexible, but not a secure entitlement system for large external commercialization.

### What This Means in Practice

Today, the platform can often decide:
- whether an action is dangerous
- whether approval is required
- whether a workspace is allowed to access a connector

But that is not yet equivalent to:
- whether **this exact sold agent** is entitled to that tool at all

### Required Architecture Blueprint

#### P0
- Introduce **install-scoped execution entitlements**
- Every run must resolve:
  - `active_agent_install_id`
  - compiled artifact
  - allowed actions
  - allowed connectors
  - allowed folders
  - trust mode

#### P0
- Enforce deny-by-default at dispatch:
  - if action not in install entitlement set: reject
  - if connector not bound to install: reject
  - if folder outside grant: reject

#### P0
- Separate:
  - workspace-wide policy
  - install-specific entitlement
  - runtime-specific capability

All three must pass.

#### P1
- Mint a server-side execution grant or signed capability envelope per run
- Bind it to:
  - run ID
  - install ID
  - workspace ID
  - runtime ID
  - expiry

The worker/tool gateway should trust only that grant, not loose metadata alone.

#### P1
- Connector access must require both:
  - workspace authorization
  - install connector binding

### Verdict

Current status: **policy-aware tool control**

Required status before external agent commerce: **strict install-scoped RBAC with deny-by-default execution grants**

---

## Pillar 4: Human-in-the-Loop Enforcement

### What Exists Today

The frontend approval card is backed by real server logic.

Key file:
- `server_modules/runtime_run_approval_service.py`

Current approval flow includes:
- pending confirmation records
- approval IDs
- expiration checks
- owner-access enforcement
- approval audit logging
- routing approved/rejected decisions into the live run input queue
- special handling for local execution start approval
- special handling for local worker recovery approval

This is materially better than a cosmetic UI card.

### Security Strengths Present Today

- backend validates pending confirmation exists
- backend checks `approval_id` matches the active pending approval
- backend checks expiration
- backend records approval audit events
- local execution approval is enforced in runtime state, not just the browser
- browser automation approval paths additionally validate execution binding drift

This is a real approval system.

### Critical Gaps

#### 1. Approval is not cryptographically strong
The current model is based on:
- run ID
- pending confirmation
- approval ID
- authenticated user access

That is valid application security, but it is not a cryptographic approval artifact with strong replay resistance and portable verification.

#### 2. Approval depends on live run state and in-memory routing
The final approval signal is routed into a live run’s `input_queue`.

This works, but it means:
- approval resolution is still closely coupled to process-local run state
- hardened distributed approval guarantees are limited

#### 3. Legacy path risk remains
The current architecture has improved substantially, but the broader codebase still has historical approval-shaped logic outside the single strongest approval path. That must be fully collapsed into one canonical server-side mechanism.

### What This Means in Practice

If a sensitive operation pauses for approval today:
- the backend really does enforce the pending approval state
- the run really does wait for a decision
- approval is audited

That is good.

But for large-scale external tenants, the final design must be stronger:
- signed approval grants
- one-time scoped approval tokens
- explicit binding to run/install/runtime/step

### Required Architecture Blueprint

#### P0
- Keep the current backend approval enforcement
- Make it the only approval path

#### P0
- Remove any legacy direct-chat or alternate approval bypass routes

#### P1
- Upgrade approval objects to signed or server-verifiable grants bound to:
  - approval ID
  - run ID
  - install ID
  - step/action hash
  - actor
  - expiry

#### P1
- Approval must be one-time and consequence-scoped
- Any change to the step payload, browser binding, action hash, or runtime target must invalidate prior approval

### Verdict

Current status: **real server-side approval enforcement**

Required status for hardened zero-trust external scale: **signed, one-time, scope-bound approval grants**

---

## Specific High-Risk Findings

### Finding 1: Host-Native Local Execution
Risk: Critical

Agents can trigger shell, filesystem, browser, and computer-control actions through the local runtime without kernel/container isolation.

Why it fails structurally:
- policy checks are not the same as sandboxing
- compromised or misrouted privileged local execution still operates near the host

Required fix:
- sandboxed worker envelope
- short-lived execution grants
- mount/network restrictions
- authoritative kill and revoke

### Finding 2: No Database-Level Tenant Wall
Risk: Critical

Isolation depends on application discipline, not the database.

Why it fails structurally:
- a missed `tenant_id` or `workspace_id` filter becomes a cross-tenant data leak
- no RLS backstop exists

Required fix:
- Postgres RLS everywhere tenant data exists
- production prohibition on default-tenant fallback

### Finding 3: Default Tenant/Workspace Self-Healing
Risk: Critical

Missing workspace-to-tenant bindings can resolve to `default`.

Why it fails structurally:
- “missing security context” is being treated as “shared default context”

Required fix:
- fail closed on missing scope in production

### Finding 4: API Key Is a Skeleton Key
Risk: High

Current API key auth yields owner/admin-style service access.

Why it fails structurally:
- no scoped service identity model
- too much authority attached to one shared mechanism

Required fix:
- scoped service principals
- audience-limited service tokens
- per-service role minimization

### Finding 5: Install RBAC Is Not Yet a Hard Universal Gate
Risk: High

Install metadata exists, but enforcement still appears more policy-driven than entitlement-driven.

Why it fails structurally:
- product packaging is not yet the hard execution boundary

Required fix:
- deny-by-default install-scoped execution authorization

### Finding 6: Approval Is Stronger Than The UI, But Not Yet Cryptographic
Risk: Medium

Approvals are real, but not yet signed and independently verifiable.

Why it fails structurally:
- approval trust remains tightly coupled to app state and live process routing

Required fix:
- signed approval grants with step/runtime binding

---

## Security Architecture Blueprint Before External Scale

## P0: Must Exist Before External Shared Tenants

1. **Compute isolation**
   - sandbox all cloud execution
   - treat local companion as privileged edge runtime only
   - no untrusted third-party agent execution in shared host process space

2. **Database isolation**
   - Postgres RLS on all tenant/workspace tables
   - fail-closed scope resolution
   - remove production dependency on SQLite auth/workspace registry

3. **Install-scoped RBAC**
   - enforce install entitlements at tool dispatch
   - deny by default for tools, connectors, folders, and privileged actions

4. **Approval hardening**
   - one canonical approval path
   - no bypass-shaped legacy routes
   - scope approval to exact action envelope

## P1: Must Exist Before Large SMB / Marketplace Expansion

1. **Signed execution grants**
   - run/install/runtime bound
   - short expiry
   - revocable

2. **Signed approval grants**
   - action hash + runtime binding + actor + expiry

3. **Service principal model**
   - replace broad owner-like API key access with scoped backend identities

4. **Per-tenant audit and anomaly detection**
   - cross-tenant access attempts
   - denied tool calls
   - unexpected runtime binding drift

## P2: Maturity / Enterprise Hardening

1. Customer-managed isolation tiers
2. Dedicated runtime pools
3. Dedicated key vault partitions
4. Tenant-level execution policy packs
5. Compliance-grade approval signing and attestation

---

## Final Readiness Verdict

Empyralis is currently:
- strong enough to continue internal development
- strong enough for trusted operator-led pilots
- not strong enough yet for broad external multi-tenant commercialization

The missing pieces are not cosmetic. They are architectural:
- true compute sandboxing
- real database-enforced tenant isolation
- install-scoped execution RBAC
- signed, hard approval artifacts

Until those are in place, the platform is still one building with guarded hallways, not sealed tenant suites.

That is the honest verdict.
