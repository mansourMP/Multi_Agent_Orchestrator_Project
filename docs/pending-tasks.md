# Pending Tasks

Last verified: 2026-04-11

## Re-Audit Snapshot

Proven WORKING after phases 40-60:
- fail-closed auth and provider-verified public webhook ingress
- canonical backend golden path smoke proof for `/turn -> parent run -> delegated research child -> artifact -> activity -> approval -> /runs`
- rendered web auth/session proof on the current shell
- rendered web cloud-backed assistant answer on the current shell
- canonical parent and delegated install-backed placement enforcement
- live install-backed local completion through the canonical `/agents/{install_id}/run` path
- automatic local summary publish into the hybrid summary-bridge store for allowed payload classes
- validated hybrid summary-bridge publish/ingest contract with fail-closed offline fallback
- contract-aligned `/runs`, `/activity/timeline`, `/approvals`, and notifications backend truth
- typed `app_to_sage` and `app_to_specialist` bridge execution through canonical install-backed turn paths
- serious rendered web first-send requests now enter the canonical durable run path
- minimum scale-safety baseline for durable intake, queueing, provider cooldown/backpressure, and retry/dead-letter visibility
- full backend suite passes locally in this workspace

Still PARTIAL:
- rendered local and hybrid user-facing demo proofs
- live hosted-captain degraded consumption of the summary bridge
- true remote summary-bridge replication beyond the local persisted bridge store
- non-install ad hoc local routing without explicit runtime binding
- `sage_to_app` and `app_to_connector_runtime` productized execution flow
- operator and admin UX for activity, local cluster control, and specialist management

Environment blockers from this audit:
- local worker availability can still drop back to `online_workers: 0`, which blocks hybrid rendered proof even when policy and attachment logic are correct
- the rendered cloud path still needs a fresh live proof for artifact and approval visibility through the durable first-send experience
- the scale baseline is explicit, but it is still a baseline, not a promise of unlimited burst capacity
- the Nest control-plane sidecar in `/backend` is out of the active local launch path because it still fails to compile; default startup now skips it instead of advertising it as a healthy core service

## Highest Priority

### 1. Durable Rendered Demo Completion

Not done.

Needed:
- re-prove the current web shell durable first-send path with live artifact, approval, and final result visibility
- prove one rendered cloud demo through the canonical run path
- prove one rendered local or hybrid demo once a healthy local worker is online

### 2. Full Frontend Rebuild From Frozen Contracts

Not done.

Needed:
- purge legacy route sprawl in `frontend/app`
- rebuild the web and desktop-power surfaces around the captain-specialist-app model
- rebuild the mobile daily-use experience around the same contracts with cleaner information architecture
- enforce the dumb-UI strategy everywhere
- move to a tighter Radix + Framer Motion design system

Constraint:
- do not change backend or BFF semantics while doing this rebuild

### 3. End-To-End Dogfood Readiness

Not done.

Needed:
- rendered surface proof for the canonical durable run path on mobile and web
- cloud-only, local-only, and hybrid proof runs
- degraded-mode rendered proof
- surface-parity proof across mobile and desktop

Update:
- 2026-04-10 phase 40 adds a canonical backend smoke proof for `/turn -> parent run -> research child delegation -> artifact -> activity -> approval -> /runs` through `server_modules/tests/test_golden_path.py`
- 2026-04-11 phase 43 proves backend contract visibility for `/runs`, `/activity/timeline`, `/approvals`, and notifications
- 2026-04-11 phase 44 proves backend `app_to_sage` and `app_to_specialist` execution through canonical install-backed turns
- 2026-04-11 phase 50 proves real browser auth/session through the current web shell
- 2026-04-11 phase 51 proves a rendered cloud-backed assistant answer in the current web shell, but still through direct chat instead of the durable run path
- 2026-04-11 phase 52 proves a live install-backed local completion and persisted safe summary-bridge emission
- 2026-04-11 phase 57 promotes serious `/turn` task requests into durable runs and makes the current web shell first-send use the durable run path for serious work
- this reduces uncertainty on the runtime and surface path, but broader rendered durable-run and mixed-runtime dogfood readiness is still not complete

### 4. Hybrid Summary Bridge Transport

Validated local publish, persisted status, and ingestion contract exists.
Full distributed transport pipeline does not.

Needed:
- remote control-plane replication or equivalent distributed transport
- operator visibility for summary-bridge state
- live hosted-captain degraded consumption proof

### 5. Shared Placement Enforcement Everywhere

Canonical install-backed parent and delegated child paths are enforced.
Remaining drift is outside those proven paths.

Needed:
- resolve generic non-install local routing without explicit runtime binding
- remove any remaining placement drift between ad hoc entry paths

### 6. Activity UI Completion

Contract-aligned backend truth exists.
Full product surfaces do not.

Needed:
- dedicated activity timeline UI on desktop-power
- refined notification stream on mobile
- artifact review surfacing
- better noise ranking and grouping

### 7. App-Agent Bridge Productization

Typed backend execution exists for `app_to_sage` and `app_to_specialist`.
Full product workflow does not.

Needed:
- `sage_to_app` handoff product flow
- `app_to_connector_runtime` execution UX and control path
- per-app grants and admin controls
- clear operator visibility for bridge contracts

### 8. Local Cluster Operator Surface

Local lifecycle APIs exist.
Operator UX does not.

Needed:
- runtime registration and status surface
- local worker health and recovery UI
- revoke and recover controls
- artifact and summary surfacing from local cluster state

### 9. Specialist Admin Surface

Specialist service contracts exist.
Full business-specialist configuration UX does not.

Needed:
- scoped memory tuning
- scoped connector tuning
- scoped runtime tuning
- policy and approval tuning

## Secondary Infrastructure Work

### 10. Scale And Capacity Beyond The Baseline

Minimum scale-safety is now explicit.
Infinite or launch-grade capacity is not.

Needed:
- real burst/load rehearsal beyond the current deterministic baseline
- worker autoscaling and fleet-sharding strategy
- provider spillover/fallback policy under sustained rate limiting
- stronger queue partition and admission policy tuning under high concurrency

### 11. Billing And Metering Hardening

Entitlements are implemented, but billing-grade ledgering is incomplete.

Needed:
- billing ledger for hosted usage
- stronger quota accounting
- retention and memory metering completion

### 12. Open-Core Packaging Enforcement

The boundary is documented.
Release packaging enforcement is not complete.

Needed:
- packaging rules for open-source, source-available, managed-cloud-only, and enterprise/self-host artifacts
- build and release pipeline enforcement

### 13. Release Hardening

Needed:
- stronger CI and release workflow coverage for frontend/mobile builds
- stable release tagging
- packaging validation
- production smoke and rollback runbooks aligned with the new architecture

## Known Constraints

- Latest verified committed green baseline is `b3eca81`.
- Full backend suite passes locally through phase 52.
- GitHub Actions were not rerun in this audit session.
- Local `node` and `npm` are available in this audit environment, and web build/auth smoke proof was completed locally.
- Live local worker availability is not stable enough yet to treat hybrid rendered proof as complete.

## Demo Gate Freeze

Exact state after phases 49-57:
- cloud rendered: PARTIAL
  - real browser auth/session works
  - real rendered cloud-backed assistant answer works
  - serious first-send task requests now enter the canonical durable run/artifact path
  - lightweight question-and-answer turns can still stay on direct chat
- local rendered: NO
  - contract-equivalent live local completion is proven
  - rendered local surface proof is not
- hybrid rendered: NO
  - hybrid policy and summary bridge are real
  - rendered hybrid proof is blocked by unstable local worker availability
- degraded safe mode: PARTIAL
  - fail-closed policy and safe-summary status are proven
  - live hosted-captain degraded consume proof is not

Demo gate: NO.

Why:
- only the backend golden path and part of the rendered cloud path are proven
- rendered local and hybrid proofs are still missing
- degraded rendered proof is still missing

Beta gate: NO.

Why:
- the durable rendered demo loop is not complete
- local and hybrid rendered proofs are not complete
- operator and admin surfaces are incomplete
- broader dogfood and degraded-mode proof is still incomplete
- the frontend rebuild has not yet shipped on the frozen contract boundary

## Rule For The Next Session

Do not create new architecture sprawl.

The next session should spend time on:
- implementation
- durable rendered demo completion
- UI rebuild on frozen contracts
- operator surfaces
- hardening
