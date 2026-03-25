# Hekor V1 Architecture

## Core decision

Hekor is one product with two layers:

1. `Control plane`
   - the web application and installable PWA
   - onboarding, tasks, approvals, runs, monitoring, builder, integrations
2. `Execution runtime`
   - the thing that actually performs work
   - can run locally on a laptop, remotely on a server, or headless on another machine

Desktop is not the product architecture.
Desktop is an optional management surface for the runtime.

## What users should experience

Users should mostly see one Hekor interface.

They should not need to care whether work runs:

- in the cloud
- on their own machine
- on a headless server

Those are routing decisions made by Hekor.

## User-facing route language

In the product, users should see only three route choices:

- `Automatic`
  - Hekor chooses the best place to run the task
  - best default for most users
- `Local machine`
  - run on a connected machine the user controls
  - use when work needs local files, local apps, or device-only permissions
- `Cloud runtime`
  - run in Hekor without depending on the current device
  - use for hosted work, remote execution, or when the machine should stay out of the loop

This language should stay plain and consistent across Setup, chat/task entry, Builder, Workflows, Runs, Machines, and Health.

## Product model

Hekor should behave like a business AI operating system:

- a user asks for work in plain language
- Hekor decides whether the task needs one agent or many
- Hekor decides whether the task should run locally, remotely, or in cloud
- Hekor asks for approvals only when needed
- Hekor records status, outputs, and artifacts in one place

The user-facing flow stays simple even when the runtime is sophisticated.

## Locked decisions

These decisions are considered settled for V1:

- `Web-first`: the main product surface is the web app
- `PWA-first installability`: the web app is the primary installable experience
- `Separate runtime`: powerful execution does not live inside the browser alone
- `Optional desktop shell`: native desktop UI is a helper surface, not the core product
- `One customer-facing product`: do not fork the product into unrelated web and desktop experiences

## Not locked yet

These decisions stay open until the runtime contract is exercised in practice:

- runtime implementation language
- whether the first native shell is Tauri or another thin wrapper
- exact local capability set beyond V1
- packaging and update mechanism for the runtime

## Runtime types

Hekor should support the same runtime protocol in multiple environments.

### 1. Cloud runtime

Use when:

- the task only needs hosted integrations or hosted models
- no local file or app access is required
- the user wants zero-device setup

Examples:

- summarize CRM activity
- draft an outbound campaign
- research competitors and produce a report

### 2. Local runtime

Use when:

- the task needs local files, local apps, local models, or local machine permissions
- the task should run on the user's own laptop or desktop

Examples:

- inspect a local folder
- run a local shell command
- read or write project files
- capture a local screenshot

### 3. Headless runtime

Use when:

- the task should run on a server, VM, container, or always-on box
- there is no screen, browser session, or user logged in interactively

Examples:

- nightly data processing
- server-side monitoring
- recurring internal operations

## What the web app owns

The control plane owns:

- authentication
- workspace and team model
- onboarding and setup
- task submission
- plan preview
- integration selection
- approval requests
- run history
- artifacts and output review
- builder and reusable workflows
- runtime selection and status display

The web app does not need direct arbitrary machine access.

## What the runtime owns

The runtime owns:

- capability registration
- machine identity
- heartbeat and availability
- task claiming and execution
- local policy enforcement
- local artifacts
- bounded previews and structured outputs
- reporting execution status back to Hekor

The runtime should be able to run without a visible desktop window.

## Runtime protocol

Hekor should treat every runtime as a registered worker with capabilities.

At minimum, the runtime protocol should support:

1. `register`
   - runtime identifies itself
   - reports environment and supported capabilities
2. `heartbeat`
   - runtime reports health and availability
3. `claim`
   - runtime asks for the next compatible task
4. `execute`
   - runtime performs the assigned task within policy
5. `complete`
   - runtime returns structured results and artifacts
6. `fail`
   - runtime returns a bounded error state

This protocol is intentionally implementation-agnostic.

## Capability model

Capabilities should be explicit and narrow.

Examples:

- `cloud.models`
- `connectors.gmail`
- `connectors.slack`
- `filesystem.read`
- `filesystem.write`
- `shell.exec`
- `desktop.screenshot`
- `desktop.notifications`

Tasks should route to runtimes based on capability, not based on a hardcoded product mode.

## Role of the desktop shell

If Hekor later ships a native desktop shell, its role should be:

- install the runtime
- manage local permissions
- show device/runtime status
- open logs, folders, and diagnostics
- provide a small local control surface when useful

Its role should not be:

- replace the web app
- become the primary product architecture
- own all business UI

## Current repo mapping

Today, the repo already aligns partially with this model:

- `frontend/`
  - current control plane and PWA surface
- `desktop/`
  - frozen Electron shell kept only for local bridge capabilities
- `scripts/orion_local_worker.py`
  - existing local worker path
- `docs/ORION_LOCAL_EXECUTION_V1.md`
  - existing local execution scope and constraints

What is missing is a clearly defined, implementation-independent runtime boundary.

## V1 delivery plan

### Phase 1

Stabilize the web control plane:

- onboarding
- approvals
- runs
- integrations
- PWA installability

### Phase 2

Formalize the runtime boundary:

- runtime identity
- capability manifest
- heartbeat
- claim/execute/complete lifecycle

### Phase 3

Lift the current local worker path behind the runtime contract:

- preserve existing local execution behavior
- stop treating it as an ad hoc side path

### Phase 4

Add a native shell only if it materially improves:

- local installation
- local permissions
- local visibility

## Final rule

Hekor should be built as:

- `one front end`
- `one product`
- `many execution targets`

That is the architecture least likely to become a dead end.
