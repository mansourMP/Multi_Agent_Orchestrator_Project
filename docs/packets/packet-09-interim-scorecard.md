stage 9 

**Findings**

1. `P0` Runtime session isolation is broken. A leaked foreign `session_id` can be adopted across workspaces because the turn path stamps workspace ownership but does not scope session lookup before loading and extending runtime session state: [runtime_runs_api.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runtime_runs_api.py#L279), [runtime_runs_api.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runtime_runs_api.py#L305), [agent_turn.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/agent_turn.py#L1085), [session_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/session_service.py#L312).
2. `P0` Direct chat is a second tool engine outside the broker envelope. Approved actions flow through direct-chat execution instead of broker authorization: [direct_chat_response_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/direct_chat_response_service.py#L178), [direct_tool_execution_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/direct_tool_execution_service.py#L205), [skills_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/skills_service.py#L1138), [connectors_actions.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors_actions.py#L352).
3. `P1` Direct chat/provider access is broader than install/manifest scope. It resolves workspace provider credentials directly instead of staying inside install-specific connector scope: [direct_chat_provider_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/direct_chat_provider_service.py#L59), [provider_profiles.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/provider_profiles.py#L1255), [skills_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/skills_service.py#L1331), [runs_execution.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runs_execution.py#L1943).
4. `P1` `local_companion` is a second auth plane. Enrollment is workspace-gated, but runtime operations later trust runtime session tokens instead of normal user/workspace auth: [runtime_runtime_api.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runtime_runtime_api.py#L724), [local_queue.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/local_queue.py#L1170), [runtime_runtime_api.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runtime_runtime_api.py#L1144).
5. `P1` Approvals still run through two systems: live run approvals and legacy cognitive approvals. Telegram/WhatsApp approval commands still hit the cognitive side path: [runtime_route_registry_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runtime_route_registry_service.py#L445), [autopilot_approval_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/autopilot_approval_service.py#L28), [runs_history.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runs_history.py#L288).
6. `P1` Channel ingress is not one execution model. Generic inbound channels, Telegram, and WhatsApp still enter through different orchestration contracts and even different `AgentTurnRequest` shapes: [agent_registry_api.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/agent_registry_api.py#L1147), [routes_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/routes_connectors.py#L422), [agent_channel_router.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/agent_channel_router.py#L262), [agent_turn.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/agent_turn.py#L744).
7. `P1` Live run registration is crash-lossy. Runs enter memory before durable `live_runs` persistence, and initial durable failure is swallowed while execution continues: [run_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/run_service.py#L339), [run_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/run_service.py#L345), [run_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/run_service.py#L1296).
8. `P1` The durable outbox still has a duplicate-send race. Rows are selected without claim/lock, side effects happen before `delivered_at`, and each runtime starts its own poller: [run_state_repository.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/run_state_repository.py#L1322), [outbox_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/outbox_service.py#L581), [outbox_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/outbox_service.py#L619), [run_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/run_service.py#L2263).
9. `P1` The active surfaces are still not aligned with the canonical engine. Web chat is scaffold-only, mobile targets non-mounted workspace-scoped routes, and the live mobile tab shell is still null: [workspace-feature-surface.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/lib/workspace/workspace-feature-surface.tsx#L145), [mobile/src/lib/surfaces/shared.js](/Users/mansur/Multi_Agent_Orchestrator_Project/mobile/src/lib/surfaces/shared.js#L10), [mobile/app/(tabs)/_layout.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/mobile/app/(tabs)/_layout.tsx#L1).
10. `P1` The backend still has split roots and hybrid truth. There are two FastAPI app objects, plural persistence systems, and a config/assembly monolith: [server.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server.py#L141), [shared.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/shared.py#L18), [runtime_state_store.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runtime_state_store.py#L11), [runtime_config.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runtime_config.py#L42).

**Final Scorecard**

- `Security / Isolation`: `fail`. Proven: `session_id` wall breach; direct-chat broker bypass; direct-chat provider overbreadth; second auth plane in `local_companion`. Strong core remains in control-plane RLS and pairing-based workspace rebinding: [enable_rls.sql](/Users/mansur/Multi_Agent_Orchestrator_Project/migrations/enable_rls.sql#L80), [channel_pairing_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/channel_pairing_service.py#L763).
- `Architectural Purity`: `fail`. Proven: duplicate app roots, plural ingress, approval split, hybrid persistence, active web/mobile not actually on one execution model: [server.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server.py#L148), [agent_registry_api.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/agent_registry_api.py#L1147), [routes_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/routes_connectors.py#L423), [runtime_runs_api.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runtime_runs_api.py#L664).
- `Redundancy / Bloat`: `fail`. Proven: active connector wrapper graph, over-layered runtime route assembly, stacked auth wrappers, one clean dead file: [autopilot_runtime_exports.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/autopilot_runtime_exports.py#L24), [runtime_route_registration_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runtime_route_registration_service.py#L22), [auth.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/auth.py#L1835), [WorkspaceScope.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/(account)/w/[workspaceId]/WorkspaceScope.tsx#L11).
- `Durability / Reliability`: `fail`. Proven: memory-first run state, non-atomic approval convergence, outbox duplicate race, send-before-write channel delivery, unfenced local claim/release, last-write-wins durable read models: [runtime_run_approval_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runtime_run_approval_service.py#L469), [machine_lease_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/machine_lease_service.py#L614), [telegram_run_dispatch_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/telegram_run_dispatch_service.py#L305), [run_state_repository.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/run_state_repository.py#L290).
- `Scale / Performance`: `fail`. Proven: full `live_runs` scans, per-client polling streams, uncached workspace bootstrap fanout, runtime target assembly cost, single-thread dispatch/delivery loops: [run_state_repository.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/run_state_repository.py#L412), [notification_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/notification_service.py#L757), [server-workspace-bootstrap.ts](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/lib/workspace/server-workspace-bootstrap.ts#L19), [runtime_attachment_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runtime_attachment_service.py#L611), [run_state_repository.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/run_state_repository.py#L126).
- `Frontend / Mobile Tenancy Integrity`: `mixed`. Proven: web boundary/services are structurally sound and capability-driven; no raw role-based gating found; web account-shell key is global; persistence prefixes omit boundary version; mobile shell architecture exists but is not mounted: [workspace-boundary.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/lib/workspace/workspace-boundary.tsx#L53), [workspace-services.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/lib/workspace/workspace-services.tsx#L487), [account-shell-storage.ts](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/lib/shell/account-shell-storage.ts#L3), [mobile-foundation.js](/Users/mansur/Multi_Agent_Orchestrator_Project/mobile/src/lib/mobile-foundation.js#L30).

**Top 20 Deletion / Merge Candidates**

1. Delete dead [WorkspaceScope.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/(account)/w/[workspaceId]/WorkspaceScope.tsx#L11).
2. Remove one backend app root anchored in [shared.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/shared.py#L18).
3. Remove duplicate app reassignment in [server.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server.py#L148).
4. Collapse [autopilot_runtime_exports.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/autopilot_runtime_exports.py#L24).
5. Collapse [autopilot_connector_export_facade.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/autopilot_connector_export_facade.py#L13).
6. Merge [autopilot_registry_facade_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/autopilot_registry_facade_service.py#L262).
7. Merge [autopilot_bridge_facade_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/autopilot_bridge_facade_service.py#L126).
8. Merge [autopilot_channel_registry_bridge_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/autopilot_channel_registry_bridge_service.py#L136).
9. Merge [autopilot_runtime_registry_bridge_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/autopilot_runtime_registry_bridge_service.py#L15).
10. Merge [autopilot_support_registry_bridge_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/autopilot_support_registry_bridge_service.py#L20).
11. Collapse [runtime_route_registration_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runtime_route_registration_service.py#L22).
12. Collapse [runtime_route_binding_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runtime_route_binding_service.py#L33).
13. Flatten auth wrapper layer in [auth.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/auth.py#L1835).
14. Flatten auth wrapper layer in [auth.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/auth.py#L3757).
15. Flatten auth gate chain in [auth.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/auth.py#L3905).
16. Split or shrink config/assembly monolith in [runtime_config.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runtime_config.py#L42).
17. Merge compatibility inbound route in [agent_registry_api.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/agent_registry_api.py#L1147).
18. Collapse public webhook wrapper layer in [routes_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/routes_connectors.py#L119).
19. Retire cognitive approval bridge in [autopilot_approval_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/autopilot_approval_service.py#L28).
20. Retire legacy cognitive approval resolver in [runs_history.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runs_history.py#L288).

**Top 10 Scale Bottlenecks**

1. Full `live_runs` scan on run listing in [run_state_repository.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/run_state_repository.py#L412); failure mode: DB CPU and latency blow up as active runs grow.
2. Full `live_runs` scan on approvals in [runtime_runs_api.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runtime_runs_api.py#L796); failure mode: approval surfaces stall under active-run growth.
3. Notification SSE poll loop in [notification_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/notification_service.py#L757); failure mode: DB and worker saturation at a few hundred streams.
4. Channel event SSE polling and full in-memory scan in [runtime_events.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runtime_events.py#L270); failure mode: CPU and lock contention.
5. Uncached workspace bootstrap on every workspace route render in [server-workspace-bootstrap.ts](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/lib/workspace/server-workspace-bootstrap.ts#L19) and [workspace_bootstrap_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/workspace_bootstrap_service.py#L205); failure mode: control-plane fanout on normal navigation.
6. Runtime target assembly and registry seeding in [runtime_attachment_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runtime_attachment_service.py#L611) and [agent_registry_repository.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/agent_registry_repository.py#L577); failure mode: run-start latency rises with runtimes/workers.
7. Single sync dispatch thread in [run_state_repository.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/run_state_repository.py#L126); failure mode: head-of-line blocking across unrelated sync callers.
8. Full-thread reread after each turn write in [control_plane_repository.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/control_plane_repository.py#L2085); failure mode: hot-thread p95 climbs with thread length.
9. Serial Telegram polling in [telegram_autopilot_loop_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/telegram_autopilot_loop_service.py#L32); failure mode: connector starvation.
10. Single-thread outbox delivery in [outbox_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/outbox_service.py#L666); failure mode: outbound backlog under bursty provider latency.

**Top 10 “Do Not Build More Features Until This Is Fixed” Blockers**

1. Fix the `session_id` workspace-wall breach: [session_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/session_service.py#L312).
2. Eliminate direct-chat broker bypass: [direct_chat_response_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/direct_chat_response_service.py#L178).
3. Collapse approvals onto one authority: [autopilot_approval_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/autopilot_approval_service.py#L28), [runtime_route_registry_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runtime_route_registry_service.py#L465).
4. Add outbox row claiming/serialization before side effects: [run_state_repository.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/run_state_repository.py#L1322), [outbox_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/outbox_service.py#L581).
5. Make live run creation durable before execution: [run_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/run_service.py#L339).
6. Remove the second auth plane or hard-bind it to the first: [local_queue.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/local_queue.py#L1170).
7. Put web/mobile on the canonical turn contract or stop claiming cross-surface unification: [workspace-feature-surface.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/lib/workspace/workspace-feature-surface.tsx#L145), [mobile/src/lib/surfaces/shared.js](/Users/mansur/Multi_Agent_Orchestrator_Project/mobile/src/lib/surfaces/shared.js#L10).
8. Replace full `live_runs` scans with real bounded read models: [run_state_repository.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/run_state_repository.py#L412).
9. Collapse connector wrapper/facade layers so the system is auditable: [autopilot_runtime_exports.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/autopilot_runtime_exports.py#L24), [autopilot_registry_facade_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/autopilot_registry_facade_service.py#L262).
10. Finish the mounted mobile shell before claiming enterprise cross-surface tenancy: [mobile/app/(tabs)/_layout.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/mobile/app/(tabs)/_layout.tsx#L1).

**Confidence**

- `Proven issues`: everything in the findings list, scorecard, deletion/merge list, bottleneck list, and blocker list above.
- `Strong suspicions`:
  - Workflow connector nodes may also be broader than install-specific connector policy in [runs_execution.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runs_execution.py#L1702).
  - Same-workspace entitlement/profile changes may leave stale admin/operator cache because persistence prefixes omit boundary version in [workspace-services.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/lib/workspace/workspace-services.tsx#L488).
  - Route-assembly callback bundles may contain more removable indirection in [runtime_route_request_handlers_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runtime_route_request_handlers_service.py) and [runtime_route_run_handlers_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runtime_route_run_handlers_service.py).
- `Low-confidence concerns`:
  - The `list_fleet_workers` query shape may produce weaker Postgres plans in [run_state_repository.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/run_state_repository.py#L1007).
  - Next.js prefetch may amplify bootstrap load beyond the proven baseline in [AccountTenantSwitcher.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/(account)/AccountTenantSwitcher.tsx#L20).
  - Some non-channel outbox sinks may also duplicate under multi-poller races, but I did not trace every sink to user-visible duplication.

**Recommended Remediation Order**

1. Restore a single security boundary: scope runtime sessions by tenant/workspace and close the direct-chat broker bypass.
2. Collapse to one approval authority and remove the cognitive side path.
3. Remove the second auth plane or hard-bind `local_companion` to the primary identity model.
4. Make run creation and approval convergence durable-before-visible.
5. Add outbox row claiming, replay fencing, and transport-level idempotency where available.
6. Put every surface on one canonical turn contract, or explicitly quarantine non-canonical surfaces.
7. Replace full `live_runs` scans with bounded read models and stop per-client poll loops from doing collection scans.
8. Collapse connector facades/bridges and runtime route assembly layers until the live graph is auditable.
9. Tighten shell persistence scoping and boundary-version cache invalidation.
10. Only then resume feature work and live-infrastructure proofs.

**Verdict**

No. This platform is not enterprise-grade today.

What prevents that verdict is not styling or cleanup debt. It is four structural failures:
- the isolation model is not singular
- the execution model is not singular
- the durability model is not singular
- the read model is not scalable

The salvageable core is real: control-plane RLS, brokered specialist execution, runtime target placement, and the web workspace boundary are all substantive. But leadership should treat the platform today as a strong prototype with enterprise-grade components, not as an enterprise-grade system.




