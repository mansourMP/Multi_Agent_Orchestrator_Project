# Empyralis Product Surfaces

## Purpose

This document defines the product-surface split for Empyralis.

It answers one question exactly: what belongs on mobile, what belongs on desktop-power surfaces, and what core model must remain identical across both.

This is a product-surface boundary, not a separate runtime architecture. The surfaces still share one Sage, one workspace model, one memory system, one specialist system, and one runtime-attachment model.

The explicit cross-surface no-downgrade rule is defined in [docs/EMPYRALIS_SURFACE_PARITY_CONTRACT.md](/Users/mansur/Multi_Agent_Orchestrator_Project/docs/EMPYRALIS_SURFACE_PARITY_CONTRACT.md).

## Product Thesis

Empyralis is mobile-first for daily use and desktop-power for deep control.

That means:

- mobile is the default daily-use surface
- desktop is the builder, power-user, and control surface
- the browser-hosted web app and the Tauri desktop shell are the same desktop-power family
- neither surface gets a separate Sage, separate workspace, or separate memory model

## Shared Core Model

Every product surface must map to the same core:

- same Sage identity
- same workspace
- same unified memory system
- same specialist installs
- same runtime attachments
- same approvals, audit, and policy boundaries

The surface may change the amount of control and density. It must not change the underlying platform model.

That means mobile and desktop-power are different surface densities on top of the same platform, not different execution contracts.

## Mobile-First Product Map

Mobile is the main daily-use product.

Its primary responsibilities are:

- chat with Sage and specialists
- notifications and approvals
- lightweight activity summaries
- applications as a first-class tab
- quick actions
- daily context and personal updates
- pairing and device linking
- hybrid state summaries
- artifact previews and lightweight monitoring

Mobile must remain focused on fast, high-frequency use.

It must not become:

- a squeezed desktop admin UI
- the primary builder surface
- the main policy-debug surface
- the place where deep connector or runtime management lives

### Required Mobile Bottom Tabs

The mobile bottom tabs are fixed:

- `Home`
- `Chat`
- `Applications`
- `Notifications`
- `Profile`

These names should not be renamed casually because they define the primary daily-use product navigation.

## Desktop-Power Product Map

Desktop is the builder, power-user, and control surface.

This includes:

- the browser-hosted full workspace in [frontend](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend)
- the packaged Tauri shell in [src-tauri](/Users/mansur/Multi_Agent_Orchestrator_Project/src-tauri)

Its primary responsibilities are:

- specialist creation and editing
- connector management
- MCP/server connections
- runtime attachment management
- deeper activity and timeline review
- hybrid sync and placement controls
- memory controls and sync settings
- advanced automations
- policy, debug, and admin depth
- richer artifact and workbench views

Desktop should feel deeper than mobile, but not like a separate product.

## Surface Responsibility Split

### Mobile Primary

- daily conversations
- notification triage
- lightweight activity summaries
- approvals
- applications launcher and app-centric actions
- quick follow-ups
- daily context digest
- hybrid continuity and degraded-state summaries
- pairing start flow

### Desktop Primary

- specialist builder workflows
- connector and vault setup
- MCP/server registration
- runtime attachment management
- deeper activity timeline and review
- hybrid sync and placement policy controls
- memory/privacy configuration
- automation authoring
- policy inspection
- debug and admin depth

### Shared Or Bidirectional

- Sage identity
- thread history
- artifact access
- runtime status summaries
- approvals and audit state
- scoped memory retrieval

## Pairing And Runtime Attachment Placement

Pairing belongs on both surfaces, but with different roles:

- mobile is the primary everyday pairing entry for QR and short-code flows
- desktop/web is the primary runtime-attachment management surface after pairing

Runtime attachment management belongs primarily on desktop-power surfaces because it requires deeper visibility into:

- local companion health
- self-hosted node status
- attachment revocation
- machine/runtime policy

Mobile can show attachment summaries and health, but it should not become the main runtime-control console.

## Browser And Desktop Relationship

The browser-hosted web app and the packaged Tauri shell should be treated as one desktop-power product family.

The Tauri shell is the packaged local wrapper for the same deeper control surface. The browser-hosted web app remains useful for customers who want the full builder/control experience without installing the packaged shell.

## Design Guardrails

1. Daily use defaults to mobile.
2. Deep control defaults to desktop-power.
3. Applications remains first-class on mobile.
4. Sage remains visually and conceptually primary across both.
5. Specialists remain visible on both, but creation and heavy management stay desktop-first.
6. The same task should not behave differently on mobile and desktop unless the difference is caused by capability depth or safety boundary, not arbitrary UI divergence.
7. Agent power is determined by runtime, policy, memory scope, connector scope, and approval state, not by whether the request started on mobile or desktop.

## Recommended Product Surface Model

The recommended model is:

- `mobile-first daily-use surface`
- `desktop-power control surface`
- `shared Sage/workspace/runtime/memory core`
- `same platform model, different depth`

That is the product architecture Empyralis should preserve going forward.
