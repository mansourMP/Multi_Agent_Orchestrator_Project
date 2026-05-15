# Prompt 15 Controlled Launch Runbook

Status: operational runbook

## Scope

- Channel in scope: Telegram only
- Exposure model: staged operational rollout
- Enforcement model: operational discipline, not technical cohort gating
- Prerequisites:
  [prompt14-public-bot-drill-report.md](/Users/mansur/Multi_Agent_Orchestrator_Project/docs/operations/prompt14-public-bot-drill-report.md)
  and
  [canonical-architecture-contract.md](/Users/mansur/Multi_Agent_Orchestrator_Project/docs/architecture/canonical-architecture-contract.md)

## Non-Negotiable Constraints

- Public customer traffic only reaches a deployment in `live` state.
- Telegram is the only live customer rollout surface in scope.
- Public exposure starts as soon as the Telegram handle or entrypoint is shared externally.
- Stage 2 and Stage 3 are not technically cohort-enforced in the current product.
- If hard allowlists or percentage rollout are required, do not proceed past internal pilot until those controls exist.

## Global Entry Gate

Do not start Stage 1 unless all of the following are true:

- Prompt 13 black-box suite is green.
- Prompt 14 drill report exists and is accepted.
- Exactly one deployed agent is selected for rollout.
- Only Telegram is enabled for public live traffic on that deployment.
- Deploy and pause have both been exercised successfully on the target deployment.
- The operator can load:
  `GET /health`
  `GET /health/internal`
  `GET /health/db`
  `GET /api/deployed-agents/{id}/analytics`
  `GET /api/deployed-agents/{id}/conversations`
  `GET /api/workspaces/{workspace_id}/routing`
  `GET /api/workspaces/{workspace_id}/channel-operations`
  `GET /notifications?workspace_id=...`
- One named primary on-call owner is assigned.
- One named backup on-call owner is assigned.
- One named business owner is assigned.
- One rollback operator has confirmed pause access.

Use:
[prompt15-launch-control-sheet.template.json](/Users/mansur/Multi_Agent_Orchestrator_Project/docs/operations/prompt15-launch-control-sheet.template.json)
as the required pre-stage artifact.

## Stage Plan

### Stage 1: Internal Only

- Exposure:
  deployment is `live`, but the Telegram handle is shared only with internal testers
- Minimum dwell:
  24 hours and at least 20 meaningful conversations
- Entry gate:
  global gate complete
- Exit gate:
  `/health`, `/health/internal`, and `/health/db` remain healthy
  `poisoned_count == 0`
  `pairing_failures == 0`
  no wrong public fallback response observed
  conversation inbox and transcript detail are readable
  notifications are visible for live operational events
  no unexplained auto-pause
  no privacy-delete or transcript-corruption incident
- Rollback trigger:
  any poisoned delivery
  any wrong public fallback response
  any unexplained health degradation
  missing live conversation visibility
  any red safety/privacy incident

### Stage 2: 25-50 External Users

- Exposure:
  invite-only manual cohort, no public listing or broad distribution
- Minimum dwell:
  72 hours
- Entry gate:
  Stage 1 stayed green for its full dwell window
  primary on-call completed one rehearsal alert and one rollback rehearsal
- Exit gate:
  external-user conversations remain observable through inbox/transcript APIs
  delivery backlog stays controlled
  budget burn remains below warning threshold
  escalations are reviewed by a human daily
  no unresolved P1/P0 defect carried from Stage 1
- Rollback trigger:
  any Stage 1 rollback trigger
  repeated delivery failures
  sustained backlog growth
  customer-visible privacy or safety failure
  missed on-call acknowledgment window

### Stage 3: 100-200 External Users

- Exposure:
  expanded invite-only cohort, still not public
- Minimum dwell:
  7 days
- Entry gate:
  Stage 2 stayed green for its full dwell window
- Exit gate:
  no poisoned deliveries
  no unreviewed escalations accumulating
  notification feed remains trustworthy
  routing and channel-operations data stay current
  budget/cap behavior is stable and understood
  observed traffic stays comfortably below Prompt 14 breakpoints
- Rollback trigger:
  any red alert
  sustained yellow alerts without a clear recovery slope
  operator support burden exceeds staffing plan
  telemetry or notification blindness

### Stage 4: Public Share

- Exposure:
  public Telegram handle publication
- Entry gate:
  Stage 3 stayed green for its full dwell window
  on-call schedule is active
  rollback drill was rehearsed recently
  Prompt 14 breakpoints are documented in the launch packet
  technical owner, support owner, and business owner explicitly sign off
- Rollback trigger:
  any earlier rollback trigger
  any visibility degradation during live public traffic
- Rule:
  pause first, investigate second

## Alert Thresholds

These are runbook thresholds until the product has encoded threshold configuration.

### Red

- `GET /health` is not healthy
- `GET /health/internal` or `GET /health/db` is degraded
- `poisoned_count > 0`
- wrong public fallback response observed
- customer-visible privacy or safety incident
- unexpected pause/cap state mismatch
- notifications, routing summary, or conversation visibility unavailable during live traffic

### Yellow

- pending deliveries grow and do not drain
- `repeated_failure_count > 0`
- `stuck_count > 0`
- `pairing_failures > 0`
- budget burn is at or above 80% of cap
- observed traffic reaches 50% of the Prompt 14 first-failure breakpoint
- escalation rate materially worsens versus the previous stage baseline

## Response Targets

- Red alert acknowledgment: 5 minutes
- Yellow alert acknowledgment: 30 minutes

## Stage Transition Checklist

Before moving to the next stage, verify all of the following:

- deployment state is correct
- Telegram binding and endpoint key are correct
- current burn and cap percentage are known
- active users, message volume, escalation rate, and outcomes are reviewed
- pending, poisoned, stuck, and repeated delivery counts are reviewed
- health endpoints are green
- notifications stream is reachable
- conversation inbox is reachable
- rollback operator is authenticated and available

## Rollback Checklist

1. Pause the deployment immediately:
   `POST /api/deployed-agents/{id}/pause`
2. Verify `deployment_state == paused`.
3. Verify new Telegram traffic gets the paused response.
4. Review routing and channel-operations for pending, stuck, and poisoned deliveries.
5. Review notifications for budget, delivery, or incident events.
6. Inspect recent conversations and transcripts for impact scope.
7. If scoped cleanup is required, run:
   `POST /api/deployed-agents/{id}/external-users/{external_user_id}/delete`
8. Do not resume until root cause and recovery evidence are documented.

## Current Go / No-Go Rule

- Go only if the current stage stayed green for its full dwell window, no red alerts occurred, yellow alerts are understood, visibility remained intact, and rollback stayed available.
- No-go immediately if hard cohort enforcement is required but still unavailable.
- No-go immediately if notifications, routing summary, or conversation visibility are untrusted.
- No-go immediately if pause cannot be executed safely in one step.

## Current Conclusion

The platform can support a controlled Telegram pilot now, but not a technically enforced cohort rollout.
Treat this runbook as mandatory operational control, not optional guidance.
