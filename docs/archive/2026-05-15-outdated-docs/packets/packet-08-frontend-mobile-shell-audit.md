stage 8 


**Findings**

- `P2` The mobile shell is architected but not actually mounted in the live app tree. The active Expo tab layout still returns `null` in [mobile/app/(tabs)/_layout.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/mobile/app/(tabs)/_layout.tsx#L1), with only scaffold comments at [mobile/app/(tabs)/_layout.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/mobile/app/(tabs)/_layout.tsx#L5). That means the mobile foundation can be audited as architecture, but not as a live rendered shell.
- `P3` The web account-shell snapshot uses one global browser key instead of an account-scoped key. The key is fixed at [frontend/lib/shell/account-shell-storage.ts](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/lib/shell/account-shell-storage.ts#L3). The reducer correctly gates remembered workspace routes by `accountId` at [frontend/lib/shell/account-shell-store.ts](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/lib/shell/account-shell-store.ts#L109), but global theme and chrome prefs are still reused across accounts at [frontend/lib/shell/account-shell-store.ts](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/lib/shell/account-shell-store.ts#L94) and [frontend/lib/shell/account-shell-store.ts](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/lib/shell/account-shell-store.ts#L113). This is shell impurity, not a workspace data bleed.
- `P3` Workspace persistence namespaces are scoped by `accountId + workspaceId`, but not by `membership.version` or `shellProfileId`, so same-workspace entitlement/profile changes reuse old persisted cache. Web boundary remounts on `workspaceId:membership.version:shellProfileId` at [frontend/lib/workspace/workspace-boundary.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/lib/workspace/workspace-boundary.tsx#L53) and [frontend/lib/workspace/workspace-boundary.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/lib/workspace/workspace-boundary.tsx#L61), but persistence prefix omits those dimensions at [frontend/lib/workspace/workspace-services.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/lib/workspace/workspace-services.tsx#L487). Mobile has the same pattern at [mobile/src/lib/mobile-foundation.js](/Users/mansur/Multi_Agent_Orchestrator_Project/mobile/src/lib/mobile-foundation.js#L30) and [mobile/src/lib/workspace/workspace-services.js](/Users/mansur/Multi_Agent_Orchestrator_Project/mobile/src/lib/workspace/workspace-services.js#L405). I did not prove a cross-workspace breach from this, but I did prove stale same-workspace cache reuse across boundary-version changes.

**Boundary Violations**

- No proven workspace-content boundary violation was found in the active web shell.
- Route authority is route-driven on web. The account shell derives current workspace from pathname at [frontend/lib/shell/account-shell-context.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/lib/shell/account-shell-context.tsx#L42) and [frontend/lib/shell/account-shell-context.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/lib/shell/account-shell-context.tsx#L81), while the workspace layout loads bootstrap from the route param at [frontend/app/(account)/w/[workspaceId]/layout.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/(account)/w/[workspaceId]/layout.tsx#L13).
- The web boundary key is structurally correct. It is derived from `workspaceId + membership.version + shellProfileId` at [frontend/lib/workspace/workspace-boundary.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/lib/workspace/workspace-boundary.tsx#L50), and the subtree is remounted on that key at [frontend/lib/workspace/workspace-boundary.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/lib/workspace/workspace-boundary.tsx#L60).
- Web per-workspace services are below the boundary and disposable. The provider creates a scoped bundle at [frontend/lib/workspace/workspace-services.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/lib/workspace/workspace-services.tsx#L483), and disposes query, transport, realtime, stores, and disposables on unmount at [frontend/lib/workspace/workspace-services.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/lib/workspace/workspace-services.tsx#L520) and [frontend/lib/workspace/workspace-services.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/lib/workspace/workspace-services.tsx#L543).
- Mobile foundation validates workspace/account binding before service creation at [mobile/src/lib/mobile-foundation.js](/Users/mansur/Multi_Agent_Orchestrator_Project/mobile/src/lib/mobile-foundation.js#L19) and [mobile/src/lib/mobile-foundation.js](/Users/mansur/Multi_Agent_Orchestrator_Project/mobile/src/lib/mobile-foundation.js#L24). Workspace switching disposes the old foundation when the boundary key changes at [mobile/src/lib/surfaces/workspace-switcher-surface.js](/Users/mansur/Multi_Agent_Orchestrator_Project/mobile/src/lib/surfaces/workspace-switcher-surface.js#L28) and [mobile/src/lib/surfaces/workspace-switcher-surface.js](/Users/mansur/Multi_Agent_Orchestrator_Project/mobile/src/lib/surfaces/workspace-switcher-surface.js#L37).
- I found no active imports from quarantined v1 UI in the active `frontend` or `mobile` trees. The only hit was documentation at [mobile/README.md](/Users/mansur/Multi_Agent_Orchestrator_Project/mobile/README.md#L3).

**Stale-State Risk List**

- Web account-shell local persistence is not key-scoped by account. Evidence: [frontend/lib/shell/account-shell-storage.ts](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/lib/shell/account-shell-storage.ts#L3).
- Same-workspace membership/profile changes retain persisted workspace cache because persistence prefixes omit `membership.version` and `shellProfileId`. Evidence: [frontend/lib/workspace/workspace-boundary.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/lib/workspace/workspace-boundary.tsx#L53), [frontend/lib/workspace/workspace-services.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/lib/workspace/workspace-services.tsx#L488), [mobile/src/lib/mobile-foundation.js](/Users/mansur/Multi_Agent_Orchestrator_Project/mobile/src/lib/mobile-foundation.js#L30), [mobile/src/lib/workspace/workspace-services.js](/Users/mansur/Multi_Agent_Orchestrator_Project/mobile/src/lib/workspace/workspace-services.js#L405).
- Mobile persistence is safe by namespace when used, but the default bundle storage is in-memory only at [mobile/src/lib/workspace/workspace-services.js](/Users/mansur/Multi_Agent_Orchestrator_Project/mobile/src/lib/workspace/workspace-services.js#L395). That avoids bleed by default, but it also means persistence guarantees depend on the embedding app supplying real storage.

**Capability-Gating Violations**

- No proven raw role-based access gating exists in the active web/mobile shell.
- Web route access is manifest/capability-driven in [frontend/lib/workspace/workspace-shell.ts](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/lib/workspace/workspace-shell.ts#L85) and [frontend/lib/workspace/workspace-shell.ts](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/lib/workspace/workspace-shell.ts#L290). The boundary exposes `hasCapability` and `canAccessRoute` at [frontend/lib/workspace/workspace-boundary.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/lib/workspace/workspace-boundary.tsx#L91).
- Mobile route access is manifest/capability-driven in [mobile/src/lib/workspace/workspace-shell.js](/Users/mansur/Multi_Agent_Orchestrator_Project/mobile/src/lib/workspace/workspace-shell.js#L22) and [mobile/src/lib/workspace/workspace-shell.js](/Users/mansur/Multi_Agent_Orchestrator_Project/mobile/src/lib/workspace/workspace-shell.js#L193).
- Active admin/operator surfaces use capability checks, not role strings. Example: [frontend/lib/workspace/workspace-channel-operations-console.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/lib/workspace/workspace-channel-operations-console.tsx#L325).
- The role fields I found in active shell code are display-only in switchers/session summaries, not gates: [frontend/app/(account)/AccountTenantSwitcher.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/(account)/AccountTenantSwitcher.tsx#L79), [mobile/src/lib/surfaces/workspace-switcher-surface.js](/Users/mansur/Multi_Agent_Orchestrator_Project/mobile/src/lib/surfaces/workspace-switcher-surface.js#L14).

**Shell Integrity Verdict**

The web Chameleon shell is structurally real, not cosmetic. Route authority is route-derived, the boundary key is correct, services live below the boundary, query/persistence namespaces are workspace-scoped, and teardown is explicit.

The mobile foundation is also structurally real at the controller/foundation layer. Surfaces read and write through the scoped foundation bundle in [mobile/src/lib/surfaces/shared.js](/Users/mansur/Multi_Agent_Orchestrator_Project/mobile/src/lib/surfaces/shared.js#L51), [mobile/src/lib/surfaces/chat-surface.js](/Users/mansur/Multi_Agent_Orchestrator_Project/mobile/src/lib/surfaces/chat-surface.js#L37), [mobile/src/lib/surfaces/runs-approvals-surface.js](/Users/mansur/Multi_Agent_Orchestrator_Project/mobile/src/lib/surfaces/runs-approvals-surface.js#L18), [mobile/src/lib/surfaces/notifications-surface.js](/Users/mansur/Multi_Agent_Orchestrator_Project/mobile/src/lib/surfaces/notifications-surface.js#L12), and [mobile/src/lib/surfaces/artifacts-surface.js](/Users/mansur/Multi_Agent_Orchestrator_Project/mobile/src/lib/surfaces/artifacts-surface.js#L12). But the actual mobile UI shell is still not mounted, so the category cannot be declared fully enterprise-safe across both surfaces yet.

**Confirmed Findings**

- The active web shell is route-driven and boundary-driven.
- Web and mobile both use per-workspace service bundles with explicit disposal.
- Web and mobile route manifests are capability-driven rather than raw-role-driven.
- No active v1/quarantine imports were found in the active web/mobile trees.
- The web account-shell browser key is globally scoped.
- Same-workspace capability/profile changes reuse persisted cache because persistence prefixes omit boundary versioning.
- The mobile v2 shell is not yet wired into the live app layout.

**Unproven Suspicions**

- Same-workspace cache reuse across membership/profile changes may create user-visible stale admin/operator cache after entitlement downgrades, but I did not prove an actual blocked surface rendering stale data because route manifest gating still prevents mount.
- The eventual Expo Router integration could introduce new state above the boundary when the placeholder tab shell is replaced. Today that risk is architectural, not proven.

**Exact Next Files To Inspect**

- [frontend/lib/workspace/workspace-channel-pairing-surface.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/lib/workspace/workspace-channel-pairing-surface.tsx)
- [frontend/app/(account)/AccountHomeClient.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/(account)/AccountHomeClient.tsx)
- [mobile/src/lib/mobile-workspace-surfaces.js](/Users/mansur/Multi_Agent_Orchestrator_Project/mobile/src/lib/mobile-workspace-surfaces.js)
- [mobile/src/lib/surfaces/account-session-surface.js](/Users/mansur/Multi_Agent_Orchestrator_Project/mobile/src/lib/surfaces/account-session-surface.js)
- [mobile/app/(tabs)/_layout.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/mobile/app/(tabs)/_layout.tsx)

**Verdict**

This audit category does **not** fully pass today.

The web shell passes the structural test with minor scoping debt. The mobile foundation passes as architecture, but the live mobile shell is still a placeholder. So the system is not “cosmetically refactored,” but it is also not yet fully enterprise-safe across both web and mobile until the mobile shell is actually mounted and the web account-shell persistence keying is tightened.



