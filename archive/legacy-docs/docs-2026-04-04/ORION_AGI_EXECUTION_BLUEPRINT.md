# Empyralis AGI Execution Blueprint

Single implementation source of truth for building Empyralis into a safe, reliable AGI-style operator platform.

## Objective

Deliver a production-stable assistant platform where channel chat (Telegram first) reliably maps to autonomous execution with governance, traceability, and operator controls.

## North Star

- Reliability first: inbound -> run -> outbound must be deterministic.
- Safety first: risky actions must be policy-gated and auditable.
- Empyralis-owned architecture: borrow OpenClaw patterns, keep Empyralis interfaces and product identity.

## Current Foundation (Accepted Baseline)

- Runtime + local stack up (`8001`, `4000`, `3000`).
- Telegram autopilot active and processing runs.
- Codex execution path functioning.
- Media ingestion exists for Telegram image attachments.

## Phase Plan

### Phase 1: Reliability Core

1. Stack start lock and conflict handling.
2. Runtime key integrity and key mismatch recovery.
3. Trace propagation across channel events and runs.
4. Dead-letter persistence for failed outbound channel deliveries.
5. Event-trace query endpoint for diagnostics.

### Phase 2: Safety and Governance

1. Enforce trust/approval policy defaults.
2. Add explicit command allowlist for local companion execution.
3. Ensure every escalation/rejection/approval is logged with correlation IDs.

### Phase 3: Memory and Context

1. Structured user memory profile.
2. Context retrieval policy (`recent + pinned + domain memory`).
3. Memory controls (`set`, `clear`, `redact`, channel/session scoping).

### Phase 4: Telegram UX (General Assistant)

1. Stateful menu chains with next-step buttons.
2. General productivity flows first; exam is optional branch.
3. Keep final replies concise by default; metadata only in debug mode.

### Phase 5: Browser Operations Console

1. Live runs and channel event stream view.
2. Approval queue and resolution actions.
3. Connector health, retries, and dead-letter visibility.

## Runtime Interface Additions

The following are additive and must remain backwards compatible:

1. Event trace endpoint:
   - `GET /channels/events/trace?run_id=<id>|trace_id=<id>`
2. Dead-letter endpoint:
   - `GET /channels/events/dead_letters`
3. Event payload correlation fields:
   - `trace_id`
   - `source_event_id`
   - `source_channel`
   - `delivery_status`

## Validation Gates

1. Telegram run lifecycle:
   - one inbound user message -> one run -> one final outbound reply.
2. Conflict policy:
   - `block` fails on active competitor consumer.
   - `auto_stop` resolves conflict and continues.
3. Key integrity:
   - invalid key is surfaced explicitly and recoverable via stack key.
4. Traceability:
   - run IDs can be traced through inbound/system/outbound event chain.
5. Dead-letter:
   - simulated outbound failure is persisted and queryable.

## Acceptance Criteria

- 24h soak: no silent Telegram drops, no duplicate start races.
- 100% run/event correlation for Telegram channel.
- Safe defaults enabled with auditable operator overrides.
- Browser and terminal diagnostics point to the same truth.

## Non-Break Rules

- Do not remove existing runtime endpoints.
- Do not break `bin/orion` command compatibility.
- Keep runtime stack scripts operational in local mode.
- Keep channel connector vault model unchanged.
