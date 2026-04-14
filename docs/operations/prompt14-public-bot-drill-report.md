# Prompt 14 Public Bot Drill Report

Generated: 2026-04-14

## Assumptions

- Channel: Telegram public deployed-agent ingress
- Provider stub latency: 250 ms
- Database pool size: 16
- Message shape: short single-sentence customer texts
- Real ingress and real core policy paths were used; only external provider and transport edges were stubbed

## Hard Numbers

- Fan-in first visible failure count: 2 concurrent external users
- Fan-in first visible failure reason: `hosted_runtime_concurrency_exhausted`
- Fan-out first visible failure count: 8 concurrent external users
- Fan-out first visible failure reason: `hosted_runtime_concurrency_exhausted`
- First visible failure under quota pressure: `deployed_agent_daily_limit_exceeded`
- Wrong quota fallback responses under stress: 0
- First visible failure under connector transport fault: `transport_delivery_failure`
- First injected DB latency with operationally unacceptable customer p95: 50 ms
- First injected DB latency with material runtime caps: not observed through 1000 ms
- Notification visibility safe window under notification failure: 0 ms
- Notification recovery after fault removal: 576.83 ms
- Budget-settlement p95 during notification-loss drill: 35.87 ms
- Connector delivery backlog drain after recovery: not achieved within 45 s; 8 undelivered events remained
- Maximum sustainable inbound rate before `workspace_rate_limited` became common: not reached; hosted-runtime entitlement saturated first

## Scenario Results

### 1000-User Fan-In

- Workload: 1000 distinct users, 1 deployment, 1 workspace, 1 public Telegram endpoint
- First failing component: hosted runtime entitlement gate
- First visible failure chain: `public ingress -> canonical turn -> hosted_runtime_entitlement -> hosted_runtime_concurrency_exhausted`
- Status mix: `completed=26`, `error=920`, `internal_error=54`
- Customer latency: `p50=29476.66 ms`, `p95=46401.96 ms`, `p99=47483.11 ms`
- Secondary observation: saturation arrived before channel lease, workspace rate, runtime cap, or DB bottlenecks became the first visible user failure

### 1000-User Fan-Out

- Workload: 1000 distinct users spread across 8 workspaces and 16 live deployments
- First failing component: hosted runtime entitlement gate
- First visible failure chain: `public ingress -> canonical turn -> hosted_runtime_entitlement -> hosted_runtime_concurrency_exhausted`
- Status mix: `completed=40`, `error=920`, `internal_error=40`
- Customer latency: `p50=39381.48 ms`, `p95=51795.97 ms`, `p99=52872.64 ms`
- Shared-control-plane dominance was not observed before the same entitlement bottleneck; deployment-local and workspace-local limits were not the first break

### Quota Pressure

- Workload: one user forced over the daily deployed-agent limit while normal public traffic continued
- First failing component: deployed-agent daily quota
- First visible failure chain: `public ingress -> deployed_agent_daily_quota -> deployed_agent_daily_limit_exceeded`
- Status mix: `completed=22`, `deployed_agent_daily_limit_exceeded=1`, `internal_error=43`
- Branded quota CTA precedence held under stress: wrong-response count was `0`

### Connector Failure

- Fault: Telegram final delivery failure induced while inbound execution remained healthy
- First failing component: Telegram transport delivery
- First visible failure chain: `public ingress accepted -> run/outbox path -> telegram_transport_delivery -> transport_delivery_failure`
- Initial backlog snapshot: `undelivered_count=9`, `total_retry_count=3`, `poisoned_count=0`
- Recovery after fault removal: outbox did not drain within the 45 s recovery window
- Residual recovery state: `undelivered_count=8`, `claimed_count=0`, `poisoned_count=0`
- Customer impact: no duplicate replies observed, but delivery backlog remained operationally unsafe

### Database Slowness

- Faults were injected into real hot queries: pool acquire, channel-event writes, daily quota, lease acquisition, monthly ledger
- 50 ms injected latency:
  `p95=8587.34 ms`, `completed=4`
- 200 ms injected latency:
  `p95=11295.53 ms`, `completed=4`
- 500 ms injected latency:
  `p95=25368.90 ms`, `completed=4`
- 1000 ms injected latency:
  `p95=50014.35 ms`, `completed=4`
- Runtime caps were not the first user-visible break through the 1000 ms sweep; reply latency became unacceptable much earlier

### Notification Loss

- Fault: notification delivery/feed path failed while core execution and budget settlement stayed live
- First failing component: notification delivery
- First visible failure chain: `run complete -> budget settlement -> deployment pause -> notification_delivery_failure`
- Owner-visible inconsistency was immediate: deployment entered `paused` before any budget notification was visible
- Notification counts: `before_recovery=0`, `after_recovery=2`
- Recovery after fault removal: `576.83 ms`
- Paused state and budget cycle remained internally consistent during the drill; the visibility gap was in notifications, not settlement

## Direct Answers To Prompt 14

- The first visible failure for one live deployment appeared at 2 concurrent external users.
- Under both fan-in and fan-out, the first visible failure was not `thread_busy`, `agent_busy`, `workspace_busy`, `workspace_rate_limited`, or `runtime_cap_exceeded`. It was `hosted_runtime_concurrency_exhausted`.
- Shared control-plane pressure did not dominate before the hosted-runtime entitlement gate. Fan-out still failed first at the entitlement layer at 8 concurrent users.
- Customer p95 became operationally unacceptable at the first injected DB latency tier, 50 ms.
- `runtime_cap_exceeded` did not appear materially through the 1000 ms DB-latency sweep.
- `workspace_rate_limited` never became common before the earlier entitlement bottleneck.
- Owner visibility becomes unsafe immediately when notification delivery is impaired because pause state can advance with zero notifications visible.
- Budget settlement lag did not become the cause of pause/cap inconsistency in this drill. Settlement p95 stayed at 35.87 ms during notification loss; the observed inconsistency window was notification-path only.
- Recovery times:
  notification loss recovered in 576.83 ms after fault removal
  connector delivery did not fully recover within 45 s

## Recovery Playbooks

### Saturation

- Trigger signal: first visible `hosted_runtime_concurrency_exhausted`
- Customer-visible symptom: normal public replies collapse into errors before channel-local busy states appear
- Owner-visible symptom: activity continues but completion mix degrades sharply
- First mitigation: reduce ingress or enable incident drain at the public channel boundary
- Exit criteria: completion mix returns to baseline and entitlement denials stop dominating

### DB Slowness

- Trigger signal: customer p95 crosses 5000 ms, starting at 50 ms injected DB latency
- Customer-visible symptom: reply latency becomes operationally unacceptable well before runtime caps appear
- Owner-visible symptom: pool wait, channel-event write latency, lease timing, and ledger writes inflate together
- First mitigation: drain traffic or pause public ingress while control-plane query latency normalizes
- Exit criteria: pool wait and hot-query latency return to baseline and customer p95 drops below 5000 ms

### Connector Delivery Failure

- Trigger signal: inbound work accepted while outbox undelivered backlog rises
- Customer-visible symptom: execution may succeed without delivered customer replies
- Owner-visible symptom: undelivered outbox count climbs and does not drain after recovery
- First mitigation: restore transport edge, then replay and drain the outbox under idempotency guard
- Exit criteria: `undelivered_count=0`, `claimed_count=0`, and no duplicate replies during replay

### Notification Loss

- Trigger signal: paused deployment state appears before any corresponding owner budget notification
- Customer-visible symptom: customer path can remain healthy while owner alerts are absent
- Owner-visible symptom: notification count stays at zero until the notification path is restored
- First mitigation: recover notification delivery and replay the notification outbox/feed path
- Exit criteria: budget notifications are visible and fresh, and owner alert state matches deployment pause state

### Budget Inconsistency

- Trigger signal: paused state, budget cycle, and notification surfaces diverge
- Customer-visible symptom: pause behavior may not match what owners can currently see
- Owner-visible symptom: budget-cycle state is current but alerts lag or are missing
- First mitigation: inspect budget-cycle state, monthly ledger rows, and notification backlog together
- Exit criteria: deployment state, budget cycle, and owner notifications all agree on the same cap event

## Notes

- A secondary live-run persistence conflict appeared during one fan-out threshold probe. It was not the first visible customer failure, but it is worth separate follow-up because it indicates additional concurrency sensitivity in background run-state writes.
