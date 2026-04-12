stage 3 


**Findings**

- `P1` The connector stack is still an active wrapper-over-wrapper graph, not a flat production path. [autopilot_runtime_exports.py#L24](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/autopilot_runtime_exports.py#L24) constructs [AutopilotConnectorExportFacade](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/autopilot_connector_export_facade.py#L6), which immediately forwards into shell, registry, bridge, and runtime facades at [autopilot_connector_export_facade.py#L13](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/autopilot_connector_export_facade.py#L13), [autopilot_connector_export_facade.py#L16](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/autopilot_connector_export_facade.py#L16), [autopilot_connector_export_facade.py#L19](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/autopilot_connector_export_facade.py#L19), and [autopilot_connector_export_facade.py#L22](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/autopilot_connector_export_facade.py#L22). The next layer still preserves explicit compatibility branches in [autopilot_registry_facade_service.py#L262](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/autopilot_registry_facade_service.py#L262) and [autopilot_bridge_facade_service.py#L126](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/autopilot_bridge_facade_service.py#L126). This is not dead code. It is live architectural fat. Classification: `merge candidate`.

- `P1` The connector registry layer still rebuilds large bridge objects even after the facade flattening work. [autopilot_registry_facade_service.py#L265](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/autopilot_registry_facade_service.py#L265) still constructs [AutopilotChannelRegistryBridgeService](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/autopilot_channel_registry_bridge_service.py#L11), and that bridge then assembles the real Telegram registry through dozens of injected lambdas at [autopilot_channel_registry_bridge_service.py#L136](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/autopilot_channel_registry_bridge_service.py#L136). The same pattern exists for runtime and support assembly at [autopilot_runtime_registry_bridge_service.py#L15](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/autopilot_runtime_registry_bridge_service.py#L15) and [autopilot_support_registry_bridge_service.py#L20](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/autopilot_support_registry_bridge_service.py#L20). Classification: `merge candidate`.

- `P3` Runtime route registration is over-layered enough to hide where the real run API is assembled. The chain is: [runtime_runs_api.py#L599](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runtime_runs_api.py#L599) -> [runtime_route_registration_service.py#L22](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runtime_route_registration_service.py#L22) -> bootstrap and binding assembly at [runtime_route_registration_service.py#L138](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runtime_route_registration_service.py#L138) and [runtime_route_registration_service.py#L179](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runtime_route_registration_service.py#L179) -> [runtime_route_binding_service.py#L33](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runtime_route_binding_service.py#L33) -> actual route definitions only at [runtime_route_registry_service.py#L50](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runtime_route_registry_service.py#L50). This is active code, but the assembly path is bloated. Classification: `merge candidate`.

- `P3` Auth still carries stacked workspace/tenant wrappers above the control-plane source of truth. The canonical repository lookup is [control_plane_repository.py#L1607](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/control_plane_repository.py#L1607). `auth.py` adds a sync wrapper at [auth.py#L1835](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/auth.py#L1835), then another wrapper at [auth.py#L3757](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/auth.py#L3757), and the actual gate consumes that chain at [auth.py#L3905](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/auth.py#L3905). This is not a split authority anymore, but it is still duplicated boundary logic. Classification: `merge candidate`.

- `P3` [WorkspaceScope.tsx#L11](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/(account)/w/[workspaceId]/WorkspaceScope.tsx#L11) is the only clean dead-code candidate I could prove in the active frontend. It is a debug snapshot component that still reads both account-shell and workspace-boundary state, but no active frontend route imports it. The only other textual hit in the active tree is the unrelated local component name [WorkspaceHomeRedirect.tsx#L50](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/(account)/w/[workspaceId]/WorkspaceHomeRedirect.tsx#L50). Classification: `dead and safe to delete`.

- `P3` The mobile v2 controller layer is not production-mounted yet. The only active app file is a null placeholder at [mobile/app/(tabs)/_layout.tsx#L1](/Users/mansur/Multi_Agent_Orchestrator_Project/mobile/app/(tabs)/_layout.tsx#L1). The controller bundle is exported at [mobile-workspace-surfaces.js#L8](/Users/mansur/Multi_Agent_Orchestrator_Project/mobile/src/lib/mobile-workspace-surfaces.js#L8), and the proven imports are tests at [phase96MobileWorkspaceSurfaces.test.mjs#L9](/Users/mansur/Multi_Agent_Orchestrator_Project/mobile/phase96MobileWorkspaceSurfaces.test.mjs#L9) and the internal switcher surface loader. That means this layer is scaffolded, not dead. Classification: `suspicious but not yet proven dead`.

**Dead Code Candidates**

- `dead and safe to delete`
  - [WorkspaceScope.tsx#L11](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/(account)/w/[workspaceId]/WorkspaceScope.tsx#L11)

- `not proven dead`
  - [mobile-workspace-surfaces.js#L8](/Users/mansur/Multi_Agent_Orchestrator_Project/mobile/src/lib/mobile-workspace-surfaces.js#L8)
  - [mobile-foundation.js#L10](/Users/mansur/Multi_Agent_Orchestrator_Project/mobile/src/lib/mobile-foundation.js#L10)
  - Reason: they are not app-mounted, but they are still exercised by tests and intended architecture scaffolds.

**Duplicate Logic Candidates**

- Workspace/tenant resolution wrappers:
  - [control_plane_repository.py#L1607](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/control_plane_repository.py#L1607)
  - [auth.py#L1835](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/auth.py#L1835)
  - [auth.py#L3757](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/auth.py#L3757)
  - [auth.py#L3905](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/auth.py#L3905)

- Connector export/facade/bridge chain:
  - [autopilot_runtime_exports.py#L24](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/autopilot_runtime_exports.py#L24)
  - [autopilot_connector_export_facade.py#L13](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/autopilot_connector_export_facade.py#L13)
  - [autopilot_registry_facade_service.py#L265](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/autopilot_registry_facade_service.py#L265)
  - [autopilot_bridge_facade_service.py#L129](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/autopilot_bridge_facade_service.py#L129)
  - [autopilot_channel_registry_bridge_service.py#L136](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/autopilot_channel_registry_bridge_service.py#L136)
  - [autopilot_runtime_registry_bridge_service.py#L169](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/autopilot_runtime_registry_bridge_service.py#L169)
  - [autopilot_support_registry_bridge_service.py#L122](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/autopilot_support_registry_bridge_service.py#L122)

- Runtime route assembly chain:
  - [runtime_runs_api.py#L599](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runtime_runs_api.py#L599)
  - [runtime_route_registration_service.py#L22](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runtime_route_registration_service.py#L22)
  - [runtime_route_binding_service.py#L33](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runtime_route_binding_service.py#L33)
  - [runtime_route_registry_service.py#L50](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runtime_route_registry_service.py#L50)

**Compatibility-Shell Debt**

- Explicit compat branches still exist:
  - [autopilot_registry_facade_service.py#L262](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/autopilot_registry_facade_service.py#L262)
  - [autopilot_bridge_facade_service.py#L126](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/autopilot_bridge_facade_service.py#L126)

- The export facade still forwards compatibility helpers directly:
  - [autopilot_connector_export_facade.py#L115](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/autopilot_connector_export_facade.py#L115)
  - [autopilot_connector_export_facade.py#L208](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/autopilot_connector_export_facade.py#L208)

- Support registry bridge still bootstraps the legacy approval service from cognitive helpers:
  - [autopilot_support_registry_bridge_service.py#L189](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/autopilot_support_registry_bridge_service.py#L189)

This is the backend area most obviously still carrying “wrapper around wrapper around registry” debt.

**Deletion/Merge Risk Assessment**

- `Safe delete`
  - [WorkspaceScope.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/(account)/w/[workspaceId]/WorkspaceScope.tsx)

- `High-value merge candidates, but active production code`
  - [autopilot_runtime_exports.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/autopilot_runtime_exports.py)
  - [autopilot_connector_export_facade.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/autopilot_connector_export_facade.py)
  - [autopilot_registry_facade_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/autopilot_registry_facade_service.py)
  - [autopilot_bridge_facade_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/autopilot_bridge_facade_service.py)
  - [autopilot_channel_registry_bridge_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/autopilot_channel_registry_bridge_service.py)
  - [autopilot_runtime_registry_bridge_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/autopilot_runtime_registry_bridge_service.py)
  - [autopilot_support_registry_bridge_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/autopilot_support_registry_bridge_service.py)

- `Medium-risk merge candidates`
  - [auth.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/auth.py)
  - [runtime_route_registration_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runtime_route_registration_service.py)
  - [runtime_route_binding_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runtime_route_binding_service.py)

- `Hold, not delete`
  - [mobile-foundation.js](/Users/mansur/Multi_Agent_Orchestrator_Project/mobile/src/lib/mobile-foundation.js)
  - [mobile-workspace-surfaces.js](/Users/mansur/Multi_Agent_Orchestrator_Project/mobile/src/lib/mobile-workspace-surfaces.js)
  - Reason: not mounted yet, but clearly still the intended v2 foundation.

**Confirmed Findings**

- The active frontend is mostly clean because it is small.
- The biggest remaining architectural fat is in backend connector composition and runtime route assembly.
- `archive_v1` is not currently contaminating the active runtime/import graph.
- The only clean dead file proven in the active app is `WorkspaceScope.tsx`.
- Most other suspects are not dead; they are active compatibility/composition layers that should be merged, not blindly deleted.

**Unproven Suspicions**

- [autopilot_runtime_exports.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/autopilot_runtime_exports.py) may still carry more historical exports than the live product path needs, but this stage only proves indirection, not dead exports.
- The runtime route assembly chain may contain additional callback bundles that are now redundant after the unification sprint, especially in [runtime_route_request_handlers_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runtime_route_request_handlers_service.py) and [runtime_route_run_handlers_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runtime_route_run_handlers_service.py).
- The mobile v2 foundation may become dead if the eventual UI rebuild chooses a different app integration shape, but today it is only scaffold-only, not dead.

**Exact Next Files To Inspect**

- [autopilot_connector_shell_builder.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/autopilot_connector_shell_builder.py)
- [autopilot_connector_shell_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/autopilot_connector_shell_service.py)
- [autopilot_runtime_facade_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/autopilot_runtime_facade_service.py)
- [runtime_route_bootstrap_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runtime_route_bootstrap_service.py)
- [runtime_route_request_handlers_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runtime_route_request_handlers_service.py)
- [runtime_route_run_handlers_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runtime_route_run_handlers_service.py)
- [workspace-switcher-surface.js](/Users/mansur/Multi_Agent_Orchestrator_Project/mobile/src/lib/surfaces/workspace-switcher-surface.js)

**Verdict**

This stage **passes** as a bloat hunt because the kill list is now credible.

It **fails** as a cleanliness audit today. The codebase is still lying in one important way: it presents several backend connector and runtime layers as if they are separate concerns, but many of them now exist mainly to construct other constructor layers. The frontend is not the problem here. The remaining spaghetti is concentrated in backend connector composition, route assembly, and auth boundary wrapping.




