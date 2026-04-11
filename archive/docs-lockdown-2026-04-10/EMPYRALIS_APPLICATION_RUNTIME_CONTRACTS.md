# Empyralis Application Runtime Contracts

## Purpose

This document defines the application runtime model and the separation contracts between:

- applications
- Sage
- specialists
- backend/runtime services

It answers one question exactly: how applications remain first-class product modules without collapsing into the personal captain or specialist worker layers.

If another note, app concept draft, or older plan conflicts with this paper, this paper wins.

## Core Thesis

Applications are product modules.

They are not:

- the personal captain
- disguised specialists
- mandatory chat wrappers

Applications must be able to use workflows, models, APIs, and allowed connectors directly, while still respecting strict separation from personal-agent memory and specialist-agent memory.

## Application Runtime Model

Each application runs inside an explicit application runtime contract.

That contract has four required parts:

- app identity
- app scope
- app storage and context
- app API/runtime envelope

### App Identity

Every application action must resolve through an explicit app identity boundary.

At minimum that identity includes:

- `app_id`
- `workspace_id`
- `actor_scope`
- `surface_origin`

Applications are not anonymous tool bundles. They are named product modules with stable identity and explicit scope.

### App Scope

Each application has its own bounded scope.

That scope defines:

- what inputs the app owns
- what data the app owns
- what workflows the app may run
- what connectors the app may use
- what bridge contracts the app may invoke

The app scope is separate from:

- Sage memory scope
- specialist install scope
- unrelated application scopes

### App Storage And Context

Applications may own and persist:

- app-owned history
- app workflow state
- scoped documents and structured records
- user-selected inputs
- connector-backed app state where allowed
- optional explicit imports from Sage

Applications do not automatically own:

- personal profile memory
- Sage episodic memory
- specialist memory
- unrestricted private user context

### App API / Runtime Envelope

Every application runtime request must carry a clean envelope.

That envelope must distinguish:

- app identity
- actor identity
- app-owned context
- explicit imported context
- allowed operations
- runtime target

The application runtime envelope must not depend on hidden chat-only state or implicit inheritance from the personal captain.

## Direct Application Capabilities

Applications may do these things directly:

- model calls
- workflow execution
- structured backend actions
- connector-backed actions where policy allows
- app-owned retrieval over app-scoped documents and data

This keeps applications first-class.

An educational or product application can run its own logic without forcing every action through Sage.

## Default Denials

Applications cannot do these things by default:

- read Sage memory
- read specialist memory
- access user-private context without explicit contract
- call unrestricted tools outside app policy
- silently impersonate Sage
- silently impersonate a specialist

The default rule is:

- app-owned context is allowed
- captain or specialist context requires an explicit bridge

## Bridge Contracts

Bridge contracts must be typed and explicit.

### App -> Sage

Applications may call Sage only through explicit captain bridges such as:

- `summary_request`
- `context_import_request`
- `recommendation_request`
- `delegation_request`

These bridges return explicit outputs, not unrestricted personal memory access.

### App -> Specialist

Applications may call specialists only through explicit specialist bridges such as:

- `task_request`
- `artifact_request`
- `status_request`

These requests must target a specific allowed specialist or specialist capability class.

They do not grant direct read access into specialist memory.

### Sage -> App

Sage may call applications through explicit application bridges such as:

- `launch_app_flow`
- `handoff_to_app`
- `request_app_action`

This allows Sage to route a user into the right product module without turning the app into a hidden chat tab.

### App -> Connector / Runtime

Applications may call connectors or runtime actions only through explicit app policy and brokered execution.

That includes:

- allowed connector-backed actions
- allowed workflow runtimes
- allowed structured backend routes

Applications do not get unrestricted runtime access just because they are first-party modules.

## App Context Envelope

Every application receives a bounded context envelope.

Default envelope classes are:

- user-selected inputs
- app-owned history
- scoped documents and data
- app workflow state

Optional envelope classes are:

- explicit imports from Sage
- explicit summaries from specialists
- explicit shared artifacts

The context envelope must never imply broad inheritance from the captain layer.

## Personal Captain And Specialist Separation

The separation rules are:

1. Sage remains the personal captain.
2. Specialists remain scoped workers.
3. Applications remain product modules.
4. Apps do not inherit Sage memory by default.
5. Apps do not inherit specialist memory by default.
6. Specialists do not become application runtimes.
7. Sage may launch or coordinate apps, but does not disappear into them.

## Cross-Surface Contract

The same application/runtime contract must hold on:

- mobile
- desktop-power
- cloud

The surface may change UX density and available controls.

It must not change:

- app identity
- app scope
- bridge rules
- default denials
- broker requirements

## Educational And Product App Rule

Educational and product applications must be able to run their own workflows without abusing the personal captain.

That means:

- the app owns its own product logic
- the app may use models and workflows directly
- the app may request explicit captain or specialist help when needed
- the app does not receive personal-agent memory unless explicitly imported

## Allowed Bridge Paths

The allowed bridge paths are:

- app -> Sage via explicit captain bridge
- app -> specialist via explicit specialist bridge
- Sage -> app via explicit application bridge
- app -> connector/runtime via brokered policy-bound app action

No implicit bridge path is allowed.

## Recommended Contract Model

The recommended model is:

- applications are first-class modules
- captain and specialist boundaries remain intact
- app context stays app-owned by default
- any captain or specialist access is explicit, typed, and policy-bound

That is the application contract Empyralis should preserve going forward.
