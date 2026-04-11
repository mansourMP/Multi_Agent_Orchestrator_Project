# Empyralis Agent Activity And Memory Timeline

## Purpose

This document defines the durable activity model for:

- Sage
- specialists
- applications
- artifacts
- approvals
- blocked actions
- memory updates

It answers one question exactly: how the user sees what agents and applications have been doing without turning the system into raw surveillance or unreadable logs.

If another note, notification concept, or legacy timeline plan conflicts with this paper, this paper wins.

## Core Thesis

Empyralis needs one durable activity model, not scattered logs.

The user should be able to understand:

- what Sage delegated
- what specialists completed
- what applications did
- what files or artifacts changed
- what was blocked
- what needs review

That model must stay attributable, durable, safe to summarize, and useful across mobile and desktop-power surfaces.

## Durable Activity Event Model

Every activity item must resolve through one durable event model.

That model must support:

- Sage activity
- specialist activity
- application activity
- artifact creation and update
- approvals and review state
- blocked or denied actions
- delegation
- memory updates

The durable event model must prioritize useful summaries over raw internals.

It is not:

- a raw keystroke log
- an unrestricted transcript dump
- a surveillance stream of private local internals

## Actor Identity

Every activity event must carry stable actor identity fields.

Required fields:

- `actor_type`
- `actor_id`
- `workspace_id`

Optional scoped fields:

- `install_id`
- `app_id`
- `run_id`
- `thread_id`

This keeps activity attributable across captain, specialist, and application domains.

## Event Classes And Retention

Canonical activity event classes are:

- `sage_activity`
- `specialist_activity`
- `application_activity`
- `delegation`
- `artifact_activity`
- `approval_state`
- `blocked_action`
- `memory_update`
- `connector_action`

Retention must be tiered.

Recommended tiers:

- `feed_window`
  Lightweight recent summaries for daily notification use.
- `timeline_window`
  Deeper durable activity history for desktop-power review.
- `audit_archive`
  Policy-controlled archive for traceability and operational review.

The product must summarize by default and preserve durable references for deeper inspection.

## Summary Vs Detail Levels

The same event may be rendered at multiple detail levels.

Canonical levels are:

- `feed_summary`
  Short mobile-safe summary for daily notifications.
- `timeline_detail`
  Deeper desktop-power history with actor, event class, and linked artifacts.
- `audit_reference`
  Durable trace/audit pointer when deeper investigation is required.

This keeps the user feed legible while preserving durable drill-down.

## Product Surface Placement

### Notifications

Notifications is the lightweight daily stream.

It should show:

- important recent agent activity
- pending approvals
- blocked actions
- review-needed items
- meaningful artifact creation or updates

It should not become a raw console dump.

### Desktop-Power Timeline

Desktop-power owns the deeper activity and memory timeline surface.

It should show:

- richer actor history
- event grouping by agent or app
- artifact previews and links
- deeper memory-update context
- longer reviewable history

### Mobile-Safe Summaries

Mobile should consume safe summaries:

- concise event text
- actor identity
- approval-needed items
- artifact previews where relevant

Mobile should not become the primary deep inspection surface.

## Sage Activity Ingestion

Sage must be able to consume recent activity safely.

Sage should ingest:

- recent specialist work
- recent application activity
- pending review items
- meaningful blocked-action summaries
- relevant artifact creation and updates
- recent memory-update summaries

Sage should ingest summaries and review markers, not unrestricted raw internals from every worker or app.

## Artifact Visibility

Activity must make artifacts legible.

Artifact visibility should support:

- created files
- updated files
- linked artifacts
- previews where available
- review-needed markers

Artifacts should be visible as part of activity history without forcing the user into raw storage views.

## Memory Timeline Model

Memory updates should appear as bounded timeline events, not hidden internal side effects.

Examples include:

- profile memory updated
- episodic summary refreshed
- specialist memory checkpoint created
- app-owned history checkpoint updated

These events should describe the change class and relevance, not dump the full private memory contents into the user feed.

## Guardrails

1. Activity must remain durable and attributable.
2. Notifications must remain useful rather than noisy.
3. Desktop-power must own deeper history and drill-down.
4. Sage may consume summaries, not unrestricted raw internal logs.
5. Applications, specialists, and Sage must keep distinct actor identity.
6. Sensitive internals should be referenced safely, not dumped into the main feed.

## Recommended Activity Model

The recommended model is:

- one durable activity event system
- one memory timeline model
- one lightweight notification stream
- one deeper desktop-power timeline
- one safe summary path for Sage

That is the activity and memory timeline architecture Empyralis should preserve going forward.
