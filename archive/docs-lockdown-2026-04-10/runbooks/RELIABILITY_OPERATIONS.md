# Reliability Operations Runbook

This is the customer-facing baseline reliability runbook for Empyralis.

## What Operators Watch

- control-plane API health
- run enqueue and claim flow
- approval latency
- artifact availability after run completion
- notification delivery backlog
- machine heartbeat freshness
- machine suspension and revocation propagation

## Daily Checks

- confirm runtime health endpoints respond
- confirm local workers are heartbeating
- confirm outbox retry and poison counts are not growing unexpectedly
- confirm artifact retrieval works for fresh runs
- confirm notification delivery receipts are advancing

## When To Trigger Safe Mode

Enable safe mode if any of the following are true:

- unsafe computer-control behavior is suspected
- policy evaluation appears degraded
- machine revocation is not stopping future actions
- approval-required actions are executing without review

## Recovery Expectations

- pause or revoke affected machines first when local execution is involved
- stop new risky work before replaying old work
- verify replay completeness before declaring recovery
- prefer explicit operator resume over automatic restart after unsafe behavior

## Customer-Facing Reliability Notes

When communicating externally:

- describe impact in product terms, not only internal component names
- give the current mitigation state
- give the next expected update time
- state whether replay artifacts and audit history remain intact

## Baseline Gaps

This runbook is operational guidance, not proof of an SLO program.

Measured reliability dashboards and formally tracked SLO compliance still remain separate work.
