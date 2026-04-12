stgae 14 **Findings**

1. `P0` Workspace isolation is not absolute because runtime session adoption still trusts an unscoped foreign `session_id`: [agent_turn.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/agent_turn.py#L1085), [session_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/session_service.py#L312).
2. `P0` Tool isolation is not universal because direct chat bypasses the broker and can reach broader provider access paths: [direct_chat_response_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/direct_chat_response_service.py#L178), [direct_chat_provider_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/direct_chat_provider_service.py#L59).
3. `P0` Secret/config hardening is not fail-closed. Broker secrets have insecure fallbacks, and production auth-disable safety depends on mismatched env naming: [secrets_broker.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/secrets_broker.py#L79), [tool_broker.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tool_broker.py#L87), [auth.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/auth.py#L567), [render.yaml](/Users/mansur/Multi_Agent_Orchestrator_Project/render.yaml#L19).
4. `P1` The platform still runs on plural execution authorities: generic inbound, public connector webhooks, direct chat, local companion, brokered specialists, and split approval systems: [agent_registry_api.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/agent_registry_api.py#L1147), [routes_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/routes_connectors.py#L422), [autopilot_approval_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/autopilot_approval_service.py#L28).
5. `P1` Durable truth is fragmented across Postgres, SQLite, JSON side stores, vault files, and artifacts, with no repo-proven unified restore or legal-hold model: [control_plane_repository.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/control_plane_repository.py#L38), [runtime_state_store.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runtime_state_store.py#L51), [runtime_config.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runtime_config.py#L392), [artifact_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/artifact_service.py#L93).
6. `P1` Live run and approval durability are still memory-first in critical places, and outbox delivery still races under concurrency: [run_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/run_service.py#L339), [runtime_run_approval_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runtime_run_approval_service.py#L469), [outbox_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/outbox_service.py#L581).
7. `P1` The read/stream model is not scale-safe for thousands of users today because too many hot paths still scan `live_runs` or poll in tight loops: [run_state_repository.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/run_state_repository.py#L412), [notification_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/notification_service.py#L757), [runtime_events.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runtime_events.py#L270).
8. `P1` Build/deploy truth is not singular. Render, Tauri, local scripts, and stale compose paths describe materially different systems: [Dockerfile.runtime](/Users/mansur/Multi_Agent_Orchestrator_Project/Dockerfile.runtime#L1), [docker-compose.yml](/Users/mansur/Multi_Agent_Orchestrator_Project/docker-compose.yml#L17), [src-tauri/src/lib.rs](/Users/mansur/Multi_Agent_Orchestrator_Project/src-tauri/src/lib.rs#L1010).
9. `P1` The platform has many tests, but CI proves much less than the tree suggests, and there is no repo-proven full restore, rollback, or alert-backed ops discipline: [ci.yml](/Users/mansur/Multi_Agent_Orchestrator_Project/.github/workflows/ci.yml#L14), [test_local_runtime_recovery_scenarios.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_local_runtime_recovery_scenarios.py#L17), [pending-tasks.md](/Users/mansur/Multi_Agent_Orchestrator_Project/docs/pending-tasks.md#L181).
10. `P1` The web shell is structurally real, but the mobile shell is still not mounted, so cross-surface enterprise tenancy claims remain incomplete: [workspace-boundary.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/lib/workspace/workspace-boundary.tsx#L53), [mobile/app/(tabs)/_layout.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/mobile/app/(tabs)/_layout.tsx#L1).

**Final Scorecard**

- `Security / isolation`: `fail`
  - Strong control-plane RLS exists, but runtime session adoption, broker bypass, and second-auth-plane drift break the singular wall.
- `Architectural purity`: `fail`
  - The system still has plural ingress, plural approval paths, plural app/deploy roots, and active compatibility shells.
- `Redundancy / bloat`: `fail`
  - The backend connector/runtime stack still carries facade-over-bridge-over-registry indirection that mostly constructs other constructors.
- `Durability / reliability`: `fail`
  - Live state, approval convergence, channel delivery, and local claims are still only mostly-safe.
- `Scale / performance`: `fail`
  - Read models and event streams are still scan-and-poll heavy.
- `Frontend / mobile tenancy integrity`: `mixed`
  - Web shell discipline is real; mobile foundation is real as architecture; mounted mobile shell is still absent.
- `Data governance / retention / restore`: `fail`
  - Durable truth is split, audit trails are partly mutable, retention is weak, and restore/legal-hold are not repo-proven.
- `Build / deploy / config / secrets`: `fail`
  - Config truth is decentralized, secret handling is not fail-closed, and deploy surfaces drift.
- `Tests / observability / disaster recovery`: `fail`
  - Backend coverage is meaningful, but whole-platform proof and alert-backed recovery are not there.

**Top 10 P0/P1 Issues**

1. `P0` Foreign `session_id` can pierce workspace isolation: [session_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/session_service.py#L312).
2. `P0` Direct chat bypasses brokered tool enforcement: [direct_chat_response_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/direct_chat_response_service.py#L178).
3. `P0` Broker/JWT secret handling has insecure fallback behavior: [secrets_broker.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/secrets_broker.py#L79), [jwt_secret.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/jwt_secret.py#L27).
4. `P0` Production auth-disable guard is env-drift fragile: [auth.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/auth.py#L4433), [render.yaml](/Users/mansur/Multi_Agent_Orchestrator_Project/render.yaml#L19).
5. `P1` `local_companion` runs as a second auth plane: [local_queue.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/local_queue.py#L1170).
6. `P1` Approval authority is still split between canonical runtime and cognitive legacy paths: [autopilot_approval_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/autopilot_approval_service.py#L28).
7. `P1` Live run creation is crash-lossy: [run_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/run_service.py#L339).
8. `P1` Outbox delivery still duplicates under multi-poller concurrency: [run_state_repository.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/run_state_repository.py#L1322).
9. `P1` Durable truth is split across too many stores for defensible enterprise restore: [runtime_config.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runtime_config.py#L392).
10. `P1` The active platform is still not one deployable, test-proven system: [docker-compose.yml](/Users/mansur/Multi_Agent_Orchestrator_Project/docker-compose.yml#L17), [ci.yml](/Users/mansur/Multi_Agent_Orchestrator_Project/.github/workflows/ci.yml#L47).

**Top 20 Deletion / Merge Candidates**

1. Delete [WorkspaceScope.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/(account)/w/[workspaceId]/WorkspaceScope.tsx).
2. Retire stale [docker-compose.yml](/Users/mansur/Multi_Agent_Orchestrator_Project/docker-compose.yml).
3. Collapse duplicate app-root behavior in [server.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server.py#L148).
4. Collapse [autopilot_runtime_exports.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/autopilot_runtime_exports.py).
5. Collapse [autopilot_connector_export_facade.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/autopilot_connector_export_facade.py).
6. Merge [autopilot_registry_facade_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/autopilot_registry_facade_service.py).
7. Merge [autopilot_bridge_facade_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/autopilot_bridge_facade_service.py).
8. Merge [autopilot_channel_registry_bridge_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/autopilot_channel_registry_bridge_service.py).
9. Merge [autopilot_runtime_registry_bridge_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/autopilot_runtime_registry_bridge_service.py).
10. Merge [autopilot_support_registry_bridge_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/autopilot_support_registry_bridge_service.py).
11. Collapse [runtime_route_registration_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runtime_route_registration_service.py).
12. Collapse [runtime_route_binding_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runtime_route_binding_service.py).
13. Flatten wrapper layers in [auth.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/auth.py#L1835).
14. Flatten wrapper layers in [auth.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/auth.py#L3757).
15. Flatten wrapper layers in [auth.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/auth.py#L3905).
16. Retire cognitive approval bridge in [autopilot_approval_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/autopilot_approval_service.py).
17. Retire legacy approval history path in [runs_history.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runs_history.py#L288).
18. Shrink config/assembly monolith in [runtime_config.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runtime_config.py).
19. Collapse compatibility inbound route in [agent_registry_api.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/agent_registry_api.py#L1147).
20. Collapse public connector wrapper stack in [routes_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/routes_connectors.py#L119).

**Top 10 Scale Bottlenecks**

1. Full `live_runs` scan in [run_state_repository.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/run_state_repository.py#L412).
2. Full live-run scan on approvals in [runtime_runs_api.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runtime_runs_api.py#L796).
3. Notification polling loop in [notification_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/notification_service.py#L757).
4. Channel-event SSE polling and lock-scanning in [runtime_events.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runtime_events.py#L270).
5. Uncached workspace bootstrap in [server-workspace-bootstrap.ts](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/lib/workspace/server-workspace-bootstrap.ts#L19).
6. Runtime target assembly/seeding in [runtime_attachment_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runtime_attachment_service.py#L611).
7. Single sync dispatch thread in [run_state_repository.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/run_state_repository.py#L126).
8. Full-thread reread after turn writes in [control_plane_repository.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/control_plane_repository.py#L2085).
9. Serial Telegram poll loop in [telegram_autopilot_loop_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/telegram_autopilot_loop_service.py#L32).
10. Single-thread outbox delivery in [outbox_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/outbox_service.py#L666).

**Top 10 “Do Not Build More Features Until This Is Fixed” Blockers**

1. Scope runtime session adoption by tenant/workspace and close the `session_id` breach.
2. Eliminate direct-chat execution outside broker policy.
3. Remove insecure secret fallbacks and make production auth-disable fail closed.
4. Collapse approvals onto one authority and one route contract.
5. Bind `local_companion` to the primary identity model or stop treating it as equivalent.
6. Make run creation, approval convergence, and outbox claiming durable before side effects.
7. Replace scan-and-poll read models with bounded indexed read models and event-driven delivery.
8. Define one deployable/runtime truth and retire stale deployment surfaces.
9. Build a real restore/legal-hold/data-lifecycle model across all stores.
10. Add alert-backed operational control and restore verification before claiming enterprise readiness.

**Confidence Split**

- `Proven issues`
  - Everything in the findings, scorecard, blocker list, scale list, and deletion/merge list above.
- `Strong suspicions`
  - Workflow connector nodes may still be broader than install-specific connector policy in [runs_execution.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runs_execution.py#L1702).
  - Same-workspace profile/membership changes may leave stale persisted shell state because persistence prefixes omit boundary-version inputs in [workspace-services.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/lib/workspace/workspace-services.tsx#L487).
  - Some enterprise/self-host deployment automation may exist outside this repo, but it is not repository-proven.
- `Low-confidence concerns`
  - `list_fleet_workers()` query shape may also hurt Postgres planning in [run_state_repository.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/run_state_repository.py#L1007).
  - Next.js route prefetch may amplify workspace-bootstrap load beyond the baseline already proven.
  - Some non-channel outbox sinks may duplicate too, but I did not trace each sink to user-visible failure.

**Recommended Remediation Order**

1. Re-establish one hard security boundary: session scoping, broker-only execution, fail-closed secrets/auth.
2. Collapse execution-path plurality: one approval model, one turn contract, one runtime identity model.
3. Repair durability: durable-before-visible run/approval state, claimed outbox rows, replay fencing.
4. Repair governance: unified data inventory, restore plan, retention enforcement, legal-hold semantics.
5. Repair deploy truth: one supported deploy story per target, no stale compose/runtime ambiguity.
6. Repair observability: alert rules, dashboards, duplicate-delivery detection, restore verification.
7. Repair scale posture: bounded read models, event-driven streams, less bootstrap fanout.
8. Repair architectural fat: connector/runtime facade collapse and auth wrapper collapse.
9. Finish cross-surface honesty: mounted mobile shell and real web/mobile runtime proof.
10. Only then resume feature growth.

**Brutal Verdict**

This platform is **not enterprise-grade today**.

What prevents that verdict is structural, not cosmetic:
- the isolation model is not singular
- the execution model is not singular
- the durability model is not singular
- the data-governance model is not singular
- the deploy/config model is not singular
- the operational proof model is not singular

The core is salvageable. There is real value in the control-plane RLS, brokered specialist path, runtime targeting, and web workspace shell. But leadership should treat the system today as a capable, ambitious platform with enterprise-grade components, not as an enterprise-grade platform.




