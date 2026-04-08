# Incident Response Runbook

This is the customer-facing baseline incident response runbook for Empyralis.

## Severity Tiers

- `SEV-1`
  - active security exposure
  - broad control-plane outage
  - unsafe machine-control behavior
- `SEV-2`
  - major feature degradation
  - approval or notification delivery outage
  - artifact/replay path unavailable for active runs
- `SEV-3`
  - partial degradation with viable workaround
  - isolated tenant or workspace issue

## Immediate Actions

1. Confirm impact scope.
   - tenant
   - workspace
   - runtime
   - machine fleet
2. Preserve evidence.
   - run ids
   - trace ids
   - affected machine ids
   - approval ids
   - artifact URIs
3. Stabilize the platform.
   - use safe mode when operator risk exists
   - revoke or suspend affected machines when local execution is involved
   - pause active runs if they may continue unsafe actions
4. Communicate clearly.
   - first customer-facing acknowledgement target: within 30 minutes for `SEV-1`, within 2 hours for `SEV-2`
   - state impact, mitigation, and next update time

## Investigation Checklist

- identify first bad event timestamp
- identify affected run ids and workspaces
- verify whether replay data is intact
- verify whether approvals were bypassed or delayed
- verify whether machine revocation and pause signals propagated
- verify whether artifact storage or event delivery degraded

## Recovery Checklist

- confirm impacted paths are stable again
- replay or retry safe queued work where appropriate
- restore suspended functionality only after validation
- document operator actions taken during mitigation

## Post-Incident Output

Every `SEV-1` and `SEV-2` incident should produce:

- timeline
- root cause
- customer impact
- corrective action
- follow-up owner
- target date
