# Frontend Chameleon Architecture Phase Spec

Status: approved planning spec  
Scope: unified React/Tauri shell, responsive phone-to-desktop behavior, workspace isolation, role-driven shell morphing  
Out of scope: visual styling, component cosmetics, final UI implementation details

## Purpose

This spec freezes the frontend architecture for a single multi-tenant shell that can safely serve:

- one global account
- multiple workspace memberships
- different roles and capabilities per workspace
- different deployment modes per workspace
- responsive layouts from small screens to large Tauri desktop workstations

The shell must support instant workspace switching with hard amnesia between workspaces. The frontend may not leak chats, files, agents, queries, realtime subscriptions, or in-memory UI state across workspace boundaries.

## Current Risks In The Repo

The current frontend shape is not sufficient for a secure multi-tenant shell.

- [PlatformShellContext.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/components/orion/PlatformShellContext.tsx) mixes account-shell concerns and active workspace concerns in one broad provider.
- [page.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/(shell)/page.tsx) keeps chat/session state too high in the tree and still treats workspace-scoped state as a shell concern.
- [AppSidebar.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/components/ui/AppSidebar.tsx) is navigation-driven, not workspace-profile-driven.
- [mobile-data.ts](/Users/mansur/Multi_Agent_Orchestrator_Project/mobile/src/lib/mobile-data.ts) uses globally prefixed surface caches rather than account-and-workspace-scoped cache namespaces.
- [layout.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/layout.tsx) mounts the current shell globally, so there is no hard workspace remount boundary yet.

These must be corrected before the UI rebuild.

## Non-Negotiable Invariants

1. The account shell may never own live workspace feature state.
2. The active workspace must be route-scoped.
3. Every server-state query, mutation, stream, and local cache key must include `workspaceId`.
4. Switching workspaces must hard-remount the workspace subtree.
5. Role and entitlement differences must resolve through a small shell-profile registry, not scattered `if role === ...` checks.
6. The same route tree and feature contracts must work across phone, tablet, browser, and Tauri desktop. Only slot layout changes by viewport.

## The Four-Layer Frontend Model

### 1. Account Shell

The account shell is the only truly global frontend layer.

Responsibilities:

- authenticated account session
- workspace membership list
- last selected workspace id
- account-level preferences
- global notifications/toasts
- global command palette shell
- tenant switcher UI

Allowed state:

- `account`
- `workspaceMemberships`
- `selectedWorkspaceId`
- `globalTheme`
- `globalChromePreferences`
- `globalCommandPaletteState`

Forbidden state:

- active chat transcript
- selected file or PDF position
- agents list
- workspace runs
- workspace approvals
- workspace artifacts
- workspace mini-app instances
- workspace-specific query caches

Target modules:

- `frontend/lib/shell/account-shell-store.ts`
- `frontend/lib/shell/account-shell-context.tsx`
- `frontend/lib/shell/workspace-membership-model.ts`

Current file migration:

- [PlatformShellContext.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/components/orion/PlatformShellContext.tsx) should be split. Only account-level session and membership state stays global.

### 2. Workspace Boundary

The workspace boundary is the hard reset/security wall.

It must be mounted at a route keyed by workspace id and shell identity.

Required key:

- `workspaceBoundaryKey = ${workspaceId}:${membershipVersion}:${shellProfileId}`

Responsibilities:

- bootstrap the active workspace
- own the workspace-scoped query client
- own the workspace-scoped realtime client
- own the workspace disposable registry
- own the workspace local persistence namespace
- hard-teardown everything on workspace switch

Target modules:

- `frontend/lib/workspace/workspace-boundary.tsx`
- `frontend/lib/workspace/workspace-bootstrap.ts`
- `frontend/lib/workspace/workspace-policy-context.tsx`
- `frontend/lib/workspace/workspace-disposable-registry.ts`

### 3. Workspace Services

Workspace services are the runtime layer mounted under the workspace boundary.

Required services:

- workspace query client
- workspace mutation queue
- workspace transport adapter
- workspace realtime adapter
- workspace persistence namespace
- workspace feature stores
- workspace disposable registry

Rules:

- each service is created fresh per workspace boundary mount
- no service instance may survive a workspace switch
- services expose only workspace-scoped APIs

Target modules:

- `frontend/lib/workspace/workspace-query-client.ts`
- `frontend/lib/workspace/workspace-transport.ts`
- `frontend/lib/workspace/workspace-realtime.ts`
- `frontend/lib/workspace/workspace-persistence.ts`
- `frontend/lib/workspace/workspace-store-factory.ts`

### 4. Shell Profile System

The shell profile system is how the UI morphs without becoming spaghetti.

The backend provides raw truth. The frontend derives one of a small number of shell profiles.

Raw truth inputs:

- membership role
- capabilities
- entitlements
- workspace traits
- deployment mode
- runtime targets
- feature flags

Derived frontend outputs:

- `shellProfileId`
- `defaultRoute`
- `navManifest`
- `layoutMode`
- `visibleTools`
- `enabledPanels`
- `inspectorCapabilities`

Example shell profiles:

- `personal_shell`
- `operations_admin_shell`
- `document_workstation_shell`
- `member_collaboration_shell`
- `readonly_observer_shell`

Target modules:

- `frontend/lib/shell-profile/derive-shell-profile.ts`
- `frontend/lib/shell-profile/shell-profile-registry.ts`
- `frontend/lib/shell-profile/build-route-manifest.ts`

## Exact State Layers

Frontend state is frozen into these layers only.

### A. Global Account State

Store type: React context or Zustand store at app root

Fields:

- `account.id`
- `account.email`
- `workspaceMemberships[]`
- `selectedWorkspaceId`
- `lastVisitedWorkspaceRouteById`
- `globalTheme`
- `globalChromePrefs`
- `accountSessionStatus`

### B. Workspace Bootstrap State

Store type: React query + derived memoized model under workspace boundary

Fields:

- `workspace.id`
- `workspace.label`
- `workspace.tenantId`
- `membership.role`
- `membership.permissions[]`
- `capabilities`
- `entitlements`
- `workspaceTraits`
- `deploymentMode`
- `runtimeTargets`
- `defaultRouteHint`
- `shellHints`
- `membershipVersion`

### C. Workspace Feature State

Store type: per-feature store factory under workspace boundary

Examples:

- `chatStore`
- `artifactStore`
- `pdfViewerStore`
- `agentWorkbenchStore`
- `approvalPanelStore`
- `runTimelineStore`
- `miniAppHostStore`

All of these must be recreated on workspace switch.

### D. Ephemeral View State

Examples:

- current split ratio
- selected tab
- open drawer/sheet
- hovered item
- inspector visibility

This state is local to the mounted shell profile and is discarded when the workspace boundary remounts.

### E. Persisted Workspace Local State

Only non-sensitive, restore-safe UI state may persist locally.

Allowed examples:

- last opened route in this workspace
- panel collapse state
- PDF zoom level and last page for a specific artifact
- draft text for a workspace thread

Forbidden examples:

- cross-workspace shared drafts
- raw connector secrets
- cross-workspace cached agent results
- ambiguous cache keys not containing `accountId + workspaceId`

Persistence key format:

- `empyralis:${accountId}:${workspaceId}:${feature}:${key}`

This replaces current global-style keys such as:

- [CHAT_STORE_STORAGE_KEY](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/(shell)/page.tsx)
- [SURFACE_CACHE_PREFIX](/Users/mansur/Multi_Agent_Orchestrator_Project/mobile/src/lib/mobile-data.ts)

## Route Tree

The route tree must be workspace-scoped.

```text
frontend/app/
  layout.tsx                                  # App root only
  (public)/
    sign-in/page.tsx
    sign-up/page.tsx
    invite/[token]/page.tsx
  (account)/
    layout.tsx                                # Account shell only
    page.tsx                                  # redirect to last/primary workspace
    settings/
      account/page.tsx                        # global account settings
      devices/page.tsx                        # global device/session settings
    w/
      [workspaceId]/
        layout.tsx                            # WorkspaceBoundary
        page.tsx                              # redirect to workspace default route
        chat/page.tsx
        workstation/page.tsx
        runs/page.tsx
        artifacts/page.tsx
        applications/page.tsx
        agents/page.tsx
        activity/page.tsx
        integrations/page.tsx
        settings/page.tsx                     # workspace settings
        admin/
          page.tsx
          billing/page.tsx
          routing/page.tsx
          members/page.tsx
          policies/page.tsx
```

Rules:

- everything under `/w/[workspaceId]/*` is workspace-scoped
- switching workspace means switching route
- account-level settings are outside the workspace boundary
- role-limited routes may still exist physically, but the route manifest must hide them and the server must enforce permissions

## Workspace Bootstrap Contract

The frontend needs one canonical bootstrap contract from the backend/BFF.

Recommended endpoint:

- `GET /api/workspaces/:workspaceId/bootstrap`

Required payload:

```ts
type WorkspaceBootstrap = {
  account: {
    id: string;
    email: string;
    displayName?: string | null;
  };
  workspace: {
    id: string;
    tenantId: string;
    label: string;
    kind: 'personal' | 'team' | 'enterprise' | 'side_business' | string;
  };
  membership: {
    role: 'viewer' | 'member' | 'owner' | 'admin';
    permissions: string[];
    version: string;
  };
  capabilities: Record<string, boolean>;
  entitlements: {
    plan: 'free' | 'personal' | 'business' | 'enterprise' | string;
    flags: Record<string, boolean>;
    limits: Record<string, number | null>;
  };
  workspaceTraits: {
    operatingMode?: 'personal' | 'document_workstation' | 'operations' | string;
    defaultSurface?: 'chat' | 'workstation' | 'dashboard' | string;
    documentHeavy?: boolean;
    adminHeavy?: boolean;
    complianceMode?: 'standard' | 'legal' | 'financial' | string;
  };
  runtime: {
    deploymentMode: 'cloud_default' | 'local_companion' | 'self_host_runtime' | 'hybrid';
    runtimeTargets: Array<{
      id: string;
      label: string;
      kind: 'cloud_default' | 'local_companion' | 'self_host_runtime';
      online?: boolean;
      preferred?: boolean;
    }>;
  };
  shellHints: {
    defaultRoute: string;
    preferredProfile?: string | null;
  };
};
```

Rules:

- the frontend may derive shell profile from this payload
- backend remains the authority on permissions and entitlements
- the frontend may not invent privileged routes if the bootstrap does not allow them

## Tenant Switcher Contract

The tenant switcher is an account-shell component, not a workspace component.

Required behavior:

- list all memberships from account shell state
- show active workspace
- switch by navigating to `/w/:workspaceId/...`
- restore last route per workspace when safe
- fall back to bootstrap `defaultRoute`

Switch algorithm:

1. User clicks a workspace.
2. Save current route as `lastVisitedWorkspaceRouteById[currentWorkspaceId]`.
3. Resolve destination:
   - preferred last route if still allowed by manifest
   - else workspace bootstrap `defaultRoute`
4. Navigate to `/w/:targetWorkspaceId/...`
5. New workspace boundary mounts with a new key.
6. Old workspace subtree unmounts and disposes all resources.

The switcher may never just update `activeWorkspaceId` in a global store while keeping the same mounted feature tree.

## Hard Cleanup Rules

The workspace boundary owns teardown. These are mandatory.

On workspace boundary unmount:

1. Cancel all in-flight workspace queries.
2. Cancel or mark stale all in-flight workspace mutations.
3. Clear the workspace query client from memory.
4. Unsubscribe SSE, websocket, polling timers, and broadcast channels.
5. Revoke all object URLs created for artifacts/files/previews.
6. Terminate all PDF workers, document workers, and background parsers.
7. Dispose Monaco, Lexical, ProseMirror, CodeMirror, or custom editors bound to that workspace.
8. Clear workspace command palette items and search indexes.
9. Reset drag/drop state and any clipboard helper state bound to workspace artifacts.
10. Flush workspace feature stores from memory.
11. Remove references from a workspace disposable registry to guarantee GC eligibility.

Cleanup must be centralized:

- `workspaceDisposableRegistry.register(disposeFn)`
- `workspaceDisposableRegistry.disposeAll()`

Every feature that creates resources must register a disposer.

## Role And Capability Morphing

Role and capability differences must not be spread across random components.

Required pipeline:

1. Bootstrap payload loads.
2. `deriveShellProfile(bootstrap)` runs once.
3. `buildRouteManifest(shellProfile, bootstrap)` runs once.
4. Shell renderer mounts the profile layout.
5. Feature components check capabilities, not raw role strings.

Example mappings:

### Personal Workspace

- shell profile: `personal_shell`
- default route: `/w/:workspaceId/chat`
- nav: chat, runs, artifacts, applications, settings
- layout: conversational default, optional inspector

### Law Firm Workspace, User Role

- shell profile: `document_workstation_shell`
- default route: `/w/:workspaceId/workstation`
- nav: workstation, chat, runs, documents
- hidden: billing, routing, member admin, workspace admin dashboard
- layout:
  - desktop: chat left, PDF/document pane right
  - phone: tab or sheet-based secondary pane

### Side-Business Workspace, Admin Role

- shell profile: `operations_admin_shell`
- default route: `/w/:workspaceId/admin`
- nav: dashboard, runs, agents, integrations, billing, routing, settings
- layout:
  - desktop: dense operations layout
  - phone: stacked navigation with admin modules as pages

## Slot-Based Responsive Layout

Every shell profile renders into the same slot vocabulary.

Frozen slots:

- `rail`
- `topbar`
- `primary`
- `secondary`
- `inspector`
- `utility`

Viewport behavior:

### Phone

- `rail` becomes drawer or bottom sheet
- `secondary` becomes pushed route, tab, or modal sheet
- `inspector` becomes slide-over or stacked section

### Tablet

- `rail` may collapse
- `secondary` may be split or tabbed
- `inspector` may overlay

### Desktop / Tauri

- persistent `rail`
- persistent `topbar`
- `primary + secondary` split
- optional persistent `inspector`

The shell profile decides what slots are populated. The viewport only decides how slots are arranged.

## Workspace Services Contract

All feature hooks must be mounted under workspace services.

Required root hooks:

- `useWorkspaceBootstrap()`
- `useWorkspaceCapabilities()`
- `useWorkspaceQueryClient()`
- `useWorkspaceRealtime()`
- `useWorkspacePersistence()`
- `useWorkspaceDisposables()`
- `useShellProfile()`
- `useRouteManifest()`

Transport rule:

- frontend talks to one workspace client interface
- transport differences such as enterprise-hosted or self-hosted workspaces are hidden behind the client adapter

Forbidden:

- direct feature-level checks for deployment mode
- direct feature-level construction of workspace URLs
- direct use of global fetch wrappers without workspace binding

## Tauri And Small-Screen Compatibility

This architecture must work unchanged in the React/Tauri shell.

Rules:

- Tauri-specific window chrome remains in app root only
- workspace boundary logic is platform-agnostic
- shell profile logic is platform-agnostic
- slot renderer takes viewport and platform hints, not business logic

If native mobile continues as a separate app, it must still adopt:

- the same bootstrap contract
- the same shell-profile derivation rules
- the same workspace-scoped persistence rules
- the same workspace switch teardown model

## Target Component Tree

```text
RootLayout
  ThemeProvider
  ToastProvider
  AccountShellProvider
    GlobalCommandProvider
      AccountShellFrame
        TenantSwitcher
        AccountTopbar
        Route: /w/[workspaceId]/*
          WorkspaceBoundary key=workspaceId:membershipVersion:shellProfileId
            WorkspaceBootstrapProvider
            WorkspaceQueryClientProvider
            WorkspaceRealtimeProvider
            WorkspacePersistenceProvider
            WorkspaceDisposableRegistryProvider
            WorkspacePolicyProvider
            ShellProfileRenderer
              ResponsiveSlotLayout
                FeatureRoutes
```

## File Migration Plan

### Global shell split

- [frontend/app/layout.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/layout.tsx)
  - keep app root concerns only
- [frontend/components/orion/PlatformShellContext.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/components/orion/PlatformShellContext.tsx)
  - split into:
    - account shell state
    - workspace policy/bootstrap state
    - optional inspect/UI state local to shell profile

### Route and shell split

- [frontend/app/(shell)/layout.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/(shell)/layout.tsx)
  - replace with account-shell layout + workspace route layouts
- [frontend/app/(shell)/page.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/(shell)/page.tsx)
  - move chat/session ownership under workspace-scoped route tree
- [frontend/components/ui/AppSidebar.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/components/ui/AppSidebar.tsx)
  - rebuild from route manifest + tenant switcher state instead of fixed navigation assumptions

### Cache and persistence split

- [frontend/app/(shell)/page.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/(shell)/page.tsx)
  - remove globally-scoped chat store assumptions
- [mobile/src/lib/mobile-data.ts](/Users/mansur/Multi_Agent_Orchestrator_Project/mobile/src/lib/mobile-data.ts)
  - move to `accountId + workspaceId + feature` cache keys

## Implementation Order

1. Build `AccountShellProvider` and workspace membership model.
2. Move the route tree to `/w/[workspaceId]/*`.
3. Introduce `WorkspaceBoundary` with hard remount keys.
4. Introduce workspace query client, realtime adapter, persistence namespace, and disposable registry.
5. Add workspace bootstrap endpoint and typed bootstrap model.
6. Build shell profile derivation and route manifest generation.
7. Rebuild sidebar/topbar around account shell + manifest.
8. Move chat/runs/artifacts/features under workspace boundary.
9. Add document workstation profile and operations admin profile.
10. Apply the same scoping rules to mobile/native caches and feature stores.

## Success Criteria

- switching from one workspace to another does not preserve any live feature state
- no workspace query result is ever reused under a different workspace id
- no admin route is visible or mountable without matching capability
- one codebase renders phone, tablet, browser, and Tauri desktop layouts from the same shell-profile contract
- law-firm-style document workstation and side-business-style admin operations can coexist without branching the platform

## Explicit Non-Goals

- no second frontend platform for enterprise
- no separate admin app
- no role-specific page tree duplication
- no global chat/files/agents stores above the workspace boundary
- no workspace switching through mutable context alone without route change and remount
