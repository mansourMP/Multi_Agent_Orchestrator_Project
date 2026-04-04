# Empyralis Terminal Architecture (VNext Blueprint)

This document defines the target architecture for Empyralis terminal surfaces so we can scale features without turning the CLI into a monolith.

## 1) Product Intent

Empyralis terminal must be:
- fast to operate for power users,
- understandable for first-time users,
- safe by default for autonomous actions,
- maintainable as providers/channels/models evolve.

## 2) Current State (Reality)

Primary files today:
- `bin/orion`
- `scripts/orion_terminal/app.py`
- `scripts/orion_terminal/core.py`
- `scripts/orion_terminal/flows.py`
- `scripts/orion_terminal/widgets.py`
- `scripts/orion_terminal/wizard_engine.py`

Observed constraints:
- `flows.py` is very large and mixes flow logic, API calls, event processing, and presentation.
- shared constants and UI behavior are coupled in `core.py`.
- flow behavior is correct but hard to reason about for future changes.
- duplicated decision points can reappear if flow composition is not centralized.

## 3) Target Architecture

We keep one runtime contract but split terminal logic into clear layers.

### 3.1 Layer Model

1. Command Surface
- responsibility: shell UX, aliases, stack lifecycle shortcuts.
- file owner: `bin/orion`.

2. Entry Router
- responsibility: parse args, health gate, dispatch to flow entrypoint.
- file owner: `scripts/orion_terminal/app.py`.

3. Presentation Engine
- responsibility: selectors, prompts, panels, transcript rendering, spinners.
- file owners:
  - `scripts/orion_terminal/ui/renderer.py`
  - `scripts/orion_terminal/ui/widgets_curses.py`
  - `scripts/orion_terminal/ui/widgets_prompt_toolkit.py`
  - `scripts/orion_terminal/ui/spinner.py`

4. Flow Engine
- responsibility: stateful question flow and branching.
- file owners:
  - `scripts/orion_terminal/flows/launcher.py`
  - `scripts/orion_terminal/flows/setup.py`
  - `scripts/orion_terminal/flows/preflight.py`
  - `scripts/orion_terminal/flows/run.py`
  - `scripts/orion_terminal/flows/live_tui.py`

5. Domain Services
- responsibility: provider auth, connector orchestration, profiles, approvals, run lifecycle.
- file owners:
  - `scripts/orion_terminal/services/providers.py`
  - `scripts/orion_terminal/services/connectors.py`
  - `scripts/orion_terminal/services/setup_sessions.py`
  - `scripts/orion_terminal/services/runs.py`
  - `scripts/orion_terminal/services/doctor.py`

6. Runtime Client
- responsibility: typed wrappers over runtime API endpoints.
- file owner:
  - `scripts/orion_terminal/clients/runtime.py`

7. Shared Models
- responsibility: typed data contracts and enums used across UI, flow, service, client.
- file owners:
  - `scripts/orion_terminal/models.py`
  - `scripts/orion_terminal/constants.py`

8. Local State Store
- responsibility: workspace-local persisted preferences/checkpoints/caches.
- file owners:
  - `scripts/orion_terminal/state/workspace.py`
  - `scripts/orion_terminal/state/schemas.py`

## 4) Flow Architecture Rules

1. Each flow has one entry function and one return contract.
2. Flows may call services, never raw HTTP.
3. Services may call clients, never UI.
4. UI layer never decides business branching.
5. Every prompt step is recorded to wizard session logs via one adapter.
6. A flow may hand off to another flow only through explicit transition points.

## 5) UX Contracts

### 5.1 Prompt Contract

Every prompt must define:
- id,
- schema_version,
- title,
- prompt,
- options or input schema,
- default behavior,
- on_cancel behavior.

### 5.2 Transcript Contract

Decision transcript grammar:
- `◇ <topic>`
- `│ <selected value>`

Run transcript grammar:
- `◆ Run <mode> | trust=<mode> target=<target>`
- `run_id: <uuid>`
- `progress: live`
- spinner line
- final `Result`, `summary`, `details`.

### 5.3 Spinner Contract

Spinner state machine:
- `running`
- `waiting for sign-in`
- `waiting for approval`
- `queued local`
- `running local`
- `retrying`
- terminal state `run complete` or `run ended`

Spinner rendering must stay on one physical terminal line (no wrapping bleed).

## 6) Provider and Credential Architecture

Provider integration model:
- provider catalog from runtime,
- auth method selection by provider strategy,
- credential source resolution order:
  - explicit flow selection,
  - workspace vault,
  - runtime/env fallback.

Rules:
- never print raw secrets.
- credential labels are masked in transcript.
- verification is a service concern, not a flow concern.

## 7) Channel and Connector Architecture

Connector model:
- connector catalog from runtime,
- per-connector input schema,
- create/verify path in service layer.

Rules:
- flow only asks "connect now/later".
- connector-specific forms are registered by connector strategy.
- unsupported connectors degrade gracefully with recorded "not wired yet" message.

## 8) Live TUI Architecture

Live TUI is a command loop with a stable action registry.

Action registry contract:
- `id`
- `label`
- `description`
- `handler(state, deps) -> next_state`

State object contract:
- active mode
- trust mode
- execution target
- workspace id
- last selected action

No action handler should call raw HTTP directly.

## 9) Testing Architecture

Test tiers:
1. Unit tests for services and client adapters.
2. Flow tests with stubbed UI + stubbed runtime client.
3. Transcript snapshot tests for key flows.
4. End-to-end smoke tests against local runtime stack.

Required regression scenarios:
- setup flow runs without duplicate branch menus.
- run goal path is single-prompt in live TUI.
- spinner labels switch for sign-in and approval waits.
- first-run health redirect enters setup only once.

## 10) Migration Status (2026-02-26)

### Phase 1: Stabilize Interfaces (DONE)
- extracted runtime client wrappers to `clients/runtime.py`.
- extracted shared models/constants to `constants.py` and `theme.py`.

### Phase 2: Decompose Flows (DONE)
- split monolithic `flows.py` into specialized modules (`flows_launcher.py`, `flows_run.py`, etc.).
- moved business logic into domain services.

### Phase 3: TUI Action Registry (NEXT)
- convert live TUI action switch into registry + handlers.
- add deterministic state transitions and easier extension.

### Phase 4: Hardening
- add transcript snapshots.
- add integration smoke scripts for setup/preflight/run/tui.
- enforce architecture boundaries in code review.

## 11) Definition of Done (Architecture)

Architecture is considered healthy when:
- no terminal flow file exceeds 800 lines. (Updated from 1100)
- flow modules do not import `urllib` directly.
- services have unit tests for happy path + failure path.
- transcript snapshots are stable for core flows.
- adding a new provider requires only strategy + constants changes, not flow rewrites.
- CI Gate passes strictly (`scripts/orion_ci_gate.sh`).

## 12) Immediate Next PRs

1. Create `clients/runtime.py` and move all `http_json` endpoint wrappers there.
2. Create `services/runs.py` and move `run_once`, `stream_run`, approval helpers.
3. Create `services/setup_sessions.py` and move setup session API helpers.
4. Split setup/preflight/onboard flow files and keep function signatures stable.
5. Add first snapshot test suite for launcher + setup + run result transcript.

## 13) Runtime Contract and Compatibility

Runtime and terminal must follow explicit versioning rules.

Compatibility contract:
- runtime exposes `runtime_api_version` and `runtime_api_min_cli_version` in `/health`.
- terminal sends `orion_cli_version` in request headers.
- additive fields are allowed in minor versions.
- breaking changes require new major version and compatibility shim window.

Deprecation policy:
- deprecations are announced in runtime doctor output for at least one minor cycle.
- removed fields/endpoints must fail with typed compatibility errors, not generic 500.

Rollback rule:
- terminal refuses unsafe incompatible operations and falls back to read-only diagnostics when contract mismatch is detected.

## 14) Operational Reliability

Reliability is defined by error taxonomy, retries, idempotency, and SLOs.

Error taxonomy:
- `RuntimeUnavailable`
- `AuthExpired`
- `PermissionDenied`
- `ValidationFailed`
- `ConflictState`
- `TimeoutExceeded`
- `TransientUpstreamError`

Retry and timeout policy:
- only retry `RuntimeUnavailable`, `TransientUpstreamError`, and selected `TimeoutExceeded`.
- exponential backoff with cap and jitter.
- no retries for `ValidationFailed` or `PermissionDenied`.

Idempotency and resume:
- mutating start/setup/connector operations include idempotency key.
- flows persist checkpoint step ids and can resume safely after crash/interruption.

SLO targets:
- setup completion success rate >= 99%.
- run-start success rate >= 99.5%.
- p95 selector response < 120ms.
- p95 run stream update gap < 2s.

## 15) Security Enforcement Model

Security controls are enforced in runtime, not only expressed in terminal UX.

Mandatory policy gates:
- file access scope policy (`workspace`, `restricted`, `full`) checked before file tool execution.
- tool permission scope checked per action category (read/write/network/exec).
- network/channel scope checked before outbound actions.

Policy flow:
- terminal captures policy intent in metadata.
- runtime resolves effective policy from metadata + workspace policy + server defaults.
- runtime rejects policy violations with typed security errors.

Secret handling:
- no raw secrets in transcripts, logs, or replay payloads.
- masked rendering only in UI and wizard session records.

## 16) Plugin and Connector Trust Model

Connector and provider extensions require explicit trust boundaries.

Strategy model:
- each connector/provider implements a strategy interface with declared:
  - required secrets,
  - required permissions,
  - validation hooks,
  - health probe hooks.

Trust controls:
- allowlist of enabled strategies per workspace.
- optional signature/verified-source metadata for third-party plugins.
- runtime sandbox requirement for untrusted extensions.

## 17) Observability and Telemetry

Architecture requires structured telemetry to operate and improve safely.

Events:
- `flow.step_started`
- `flow.step_completed`
- `flow.step_failed`
- `run.started`
- `run.completed`
- `run.failed`
- `approval.wait_started`
- `approval.resolved`

Dimensions:
- workspace id, flow id, step id, provider id, target, trust mode, duration, retry count.

Dashboards:
- conversion funnel (setup -> first run -> successful run),
- approval wait time,
- error distribution by taxonomy,
- model/provider latency and cost trends.

## 18) Open Items and Sequencing

Open items:
1. Define the `runtime_api_version` field and compatibility handshake in `/health`.
2. Define local state schema (`.orion/` cache files) with migration rules.
3. Finalize service-level error classes and mapper.
4. Define connector strategy interface and registry loader.
5. Add policy enforcement checks in runtime path before sensitive actions.

Execution sequencing:
1. Phase 0: ship preflight flow improvements in existing `flows.py` (no file moves).
2. Phase 1: extract runtime client + service wrappers (no UX change).
3. Phase 2: split flow modules by domain.
4. Phase 3: action registry and state store.
5. Phase 4: hardening with snapshots, smoke tests, SLO dashboards.
