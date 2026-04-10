# FRONTEND ARCHITECTURE MAP

Scope: current `frontend/` codebase as it exists today, including active page routes, BFF/API routes, component groupings, state wiring, and styling/theming locations.

Snapshot:
- `32` page routes under `frontend/app/**/page.tsx`
- `135` API routes under `frontend/app/api/**/route.ts(x)`
- `86` component files under `frontend/components/**`
- `43` library/helper files under `frontend/lib/**`
- App architecture: Next.js App Router + internal BFF routes + client-heavy React surfaces + shared design token layer + shadcn/Tailwind primitives

## 1. Complete Directory Tree

### 1.1 `frontend/app`

```text
frontend/app
├── account
│   └── page.tsx
├── admin
├── aesk
├── agents
│   ├── [id]
│   │   └── configure
│   │       ├── ConfigureAgentPageClient.tsx
│   │       └── page.tsx
│   ├── page.module.css
│   └── page.tsx
├── api
│   ├── agents
│   │   ├── [id]
│   │   │   ├── run
│   │   │   │   └── route.ts
│   │   │   └── route.ts
│   │   ├── [install_id]
│   │   │   └── run
│   │   └── route.ts
│   ├── approvals
│   │   ├── audit
│   │   │   └── route.ts
│   │   ├── overview
│   │   │   └── route.ts
│   │   ├── resolve
│   │   │   └── route.ts
│   │   └── route.ts
│   ├── artifacts
│   │   ├── content
│   │   │   └── route.ts
│   │   ├── file
│   │   │   └── route.ts
│   │   ├── workspace
│   │   │   └── route.ts
│   │   └── route.ts
│   ├── builder
│   │   ├── generate
│   │   │   └── route.ts
│   │   └── manifests
│   │       └── connectors
│   │           └── route.ts
│   ├── chat
│   │   ├── master-context
│   │   │   └── route.ts
│   │   └── respond
│   │       └── route.ts
│   ├── connectors
│   │   ├── [id]
│   │   │   └── microsoft-drive
│   │   │       └── route.ts
│   │   └── route.ts
│   ├── control-plane
│   │   ├── auth
│   │   │   ├── access
│   │   │   │   ├── methods
│   │   │   │   │   └── [method]
│   │   │   │   │       └── disconnect
│   │   │   │   │           └── route.ts
│   │   │   │   ├── password
│   │   │   │   │   └── route.ts
│   │   │   │   └── route.ts
│   │   │   ├── apple
│   │   │   │   ├── callback
│   │   │   │   │   └── route.ts
│   │   │   │   └── start
│   │   │   │       └── route.ts
│   │   │   ├── desktop
│   │   │   │   └── consume
│   │   │   │       └── route.ts
│   │   │   ├── google
│   │   │   │   ├── callback
│   │   │   │   │   └── route.ts
│   │   │   │   └── start
│   │   │   │       └── route.ts
│   │   │   ├── login
│   │   │   │   └── route.ts
│   │   │   ├── me
│   │   │   │   └── route.ts
│   │   │   ├── providers
│   │   │   │   └── route.ts
│   │   │   └── signup
│   │   │       └── route.ts
│   │   ├── connectors
│   │   │   ├── [connectorId]
│   │   │   │   ├── google-doc
│   │   │   │   │   └── route.ts
│   │   │   │   ├── google-drive
│   │   │   │   │   └── route.ts
│   │   │   │   ├── google-sheet
│   │   │   │   │   └── route.ts
│   │   │   │   ├── test
│   │   │   │   │   └── route.ts
│   │   │   │   └── route.ts
│   │   │   ├── github
│   │   │   │   └── start
│   │   │   │       └── route.ts
│   │   │   ├── slack
│   │   │   │   ├── callback
│   │   │   │   │   └── route.ts
│   │   │   │   └── start
│   │   │   │       └── route.ts
│   │   │   └── route.ts
│   │   ├── contract
│   │   │   └── route.ts
│   │   ├── credentials
│   │   │   ├── [credentialId]
│   │   │   │   ├── test
│   │   │   │   │   └── route.ts
│   │   │   │   └── route.ts
│   │   │   ├── export
│   │   │   │   └── route.ts
│   │   │   ├── import
│   │   │   │   └── route.ts
│   │   │   ├── rotate-key
│   │   │   │   └── route.ts
│   │   │   └── route.ts
│   │   ├── providers
│   │   │   ├── [providerId]
│   │   │   │   ├── models
│   │   │   │   │   └── route.ts
│   │   │   │   └── probe
│   │   │   │       └── route.ts
│   │   │   ├── anthropic
│   │   │   │   ├── local-auth
│   │   │   │   │   └── import
│   │   │   │   │       └── route.ts
│   │   │   │   └── local-cli
│   │   │   │       ├── login
│   │   │   │       │   └── route.ts
│   │   │   │       └── status
│   │   │   │           └── route.ts
│   │   │   ├── gemini
│   │   │   │   ├── local-auth
│   │   │   │   │   └── import
│   │   │   │   │       └── route.ts
│   │   │   │   └── local-cli
│   │   │   │       └── status
│   │   │   │           └── route.ts
│   │   │   ├── health-check
│   │   │   │   └── route.ts
│   │   │   ├── model-aliases
│   │   │   │   └── route.ts
│   │   │   ├── openai
│   │   │   │   └── local-auth
│   │   │   │       ├── import
│   │   │   │       │   └── route.ts
│   │   │   │       ├── status
│   │   │   │       │   └── route.ts
│   │   │   │       └── _shared.ts
│   │   │   ├── profiles
│   │   │   │   ├── [profileId]
│   │   │   │   │   ├── disable
│   │   │   │   │   │   └── route.ts
│   │   │   │   │   └── route.ts
│   │   │   │   ├── health
│   │   │   │   │   └── route.ts
│   │   │   │   └── route.ts
│   │   │   ├── runtime-availability
│   │   │   │   └── route.ts
│   │   │   └── route.ts
│   │   ├── schedules
│   │   │   ├── [scheduleId]
│   │   │   │   └── route.ts
│   │   │   ├── weekly
│   │   │   │   ├── [scheduleId]
│   │   │   │   │   └── route.ts
│   │   │   │   └── route.ts
│   │   │   └── route.ts
│   │   ├── session
│   │   │   └── route.ts
│   │   └── setup
│   │       └── sessions
│   │           ├── [sessionId]
│   │           │   ├── actions
│   │           │   │   └── route.ts
│   │           │   ├── cancel
│   │           │   │   └── route.ts
│   │           │   ├── resume
│   │           │   │   └── route.ts
│   │           │   └── route.ts
│   │           └── route.ts
│   ├── demo
│   │   ├── [runId]
│   │   │   └── route.ts
│   │   └── route.ts
│   ├── doctor
│   │   └── preflight
│   │       └── route.ts
│   ├── executions
│   │   ├── [id]
│   │   │   ├── resume
│   │   │   │   └── route.ts
│   │   │   └── route.ts
│   │   ├── history
│   │   │   └── route.ts
│   │   └── list
│   │       └── route.ts
│   ├── health
│   │   ├── overview
│   │   │   └── route.ts
│   │   └── route.ts
│   ├── local-ops
│   │   └── route.ts
│   ├── machines
│   │   ├── [id]
│   │   │   ├── hard-kill
│   │   │   │   └── route.ts
│   │   │   ├── resume
│   │   │   │   └── route.ts
│   │   │   ├── suspend
│   │   │   │   └── route.ts
│   │   │   └── route.ts
│   │   ├── enrollment-intents
│   │   │   └── route.ts
│   │   └── route.ts
│   ├── notifications
│   │   └── route.ts
│   ├── onboarding
│   │   └── runtime-connection
│   │       └── route.ts
│   ├── platform
│   │   └── shell-status
│   │       └── route.ts
│   ├── runs
│   │   ├── [id]
│   │   │   ├── decision
│   │   │   │   └── route.ts
│   │   │   ├── delegate
│   │   │   │   ├── auto
│   │   │   │   │   └── route.ts
│   │   │   │   ├── retry-failed
│   │   │   │   │   └── route.ts
│   │   │   │   └── route.ts
│   │   │   ├── hard-kill
│   │   │   │   └── route.ts
│   │   │   ├── pause
│   │   │   │   └── route.ts
│   │   │   ├── replay
│   │   │   │   └── route.ts
│   │   │   ├── resume
│   │   │   │   └── route.ts
│   │   │   ├── stream
│   │   │   │   └── route.ts
│   │   │   └── route.ts
│   │   ├── precheck
│   │   │   └── route.ts
│   │   ├── start
│   │   │   └── route.ts
│   │   └── route.ts
│   ├── runtime
│   │   └── machines
│   │       └── route.ts
│   ├── runtime-profiles
│   │   └── route.ts
│   ├── sessions
│   │   ├── [id]
│   │   │   └── route.ts
│   │   └── route.ts
│   ├── setup
│   │   └── desktop
│   │       └── route.ts
│   ├── skills
│   │   ├── [name]
│   │   │   └── route.ts
│   │   ├── install
│   │   │   └── route.ts
│   │   ├── publish
│   │   │   └── route.ts
│   │   ├── registry
│   │   │   └── route.ts
│   │   ├── state
│   │   │   └── route.ts
│   │   └── route.ts
│   ├── solutions
│   │   └── state
│   │       └── route.ts
│   ├── store
│   │   └── agents
│   │       ├── [id]
│   │       │   └── route.ts
│   │       └── route.ts
│   ├── stt
│   │   └── route.ts
│   ├── threads
│   │   ├── [id]
│   │   │   └── route.ts
│   │   └── route.ts
│   ├── tools
│   │   ├── contracts
│   │   │   ├── [toolId]
│   │   │   │   └── route.ts
│   │   │   └── route.ts
│   │   └── policy
│   │       └── evaluate
│   │           └── route.ts
│   ├── tts
│   │   └── route.ts
│   ├── turn
│   │   └── route.ts
│   ├── usage
│   │   ├── runs
│   │   │   └── route.ts
│   │   └── summary
│   │       └── route.ts
│   ├── work-log-summary
│   │   └── route.ts
│   ├── workbench
│   │   ├── agents
│   │   │   └── [agentRole]
│   │   │       └── channels
│   │   │           └── route.ts
│   │   └── control-center
│   │       └── route.ts
│   └── workflows
│       ├── [id]
│       │   ├── publish
│       │   │   └── route.ts
│       │   ├── run
│       │   │   └── route.ts
│       │   └── route.ts
│       └── route.ts
├── approvals
│   └── page.tsx
├── apps
├── artifacts
│   └── page.tsx
├── builder
│   ├── [id]
│   ├── new
│   └── page.tsx
├── connect-ai
│   └── page.tsx
├── connectors
│   └── page.tsx
├── control-center
│   └── page.tsx
├── credentials
│   └── page.tsx
├── demo
│   └── page.tsx
├── executions
│   └── page.tsx
├── feedback
├── health
│   └── page.tsx
├── history
├── home
│   └── page.tsx
├── integrations
├── library
│   └── page.tsx
├── machines
│   └── page.tsx
├── onboarding
│   └── page.tsx
├── preview
│   └── onboarding
├── pwa-icon-192
│   └── route.tsx
├── pwa-icon-512
│   └── route.tsx
├── quickstart
│   └── page.tsx
├── runs
│   └── [id]
│       ├── inspect
│       │   └── page.tsx
│       └── page.tsx
├── schedules
│   └── page.tsx
├── settings
│   └── page.tsx
├── setup
│   └── page.tsx
├── sign-in
│   ├── complete
│   │   └── page.tsx
│   └── page.tsx
├── skills
│   └── page.tsx
├── solutions
│   └── page.tsx
├── store
│   └── page.tsx
├── team
│   └── page.tsx
├── usage
│   └── page.tsx
├── variables
├── workflows
│   ├── [id]
│   ├── new
│   └── page.tsx
├── workspace
├── apple-icon.tsx
├── favicon.ico
├── globals.css
├── icon.tsx
├── layout.tsx
├── manifest.ts
├── page.actions.ts
├── page.api.ts
├── page.catalog.ts
├── page.module.css
├── page.state.ts
└── page.tsx
```

Notes:
- Several directories exist without a current page or route file: `admin`, `aesk`, `apps`, `feedback`, `history`, `integrations`, `variables`, `workspace`, plus empty legacy route directories under `builder/[id]`, `builder/new`, `workflows/[id]`, and `workflows/new`.
- `next.config.ts` currently redirects the amputated builder routes:
  - `/builder/:path*` -> `/agents`
  - `/workflows/new` -> `/`
  - `/workflows/:id` -> `/agents`

### 1.2 `frontend/components`

```text
frontend/components
├── builder
├── demo
│   ├── DemoArtifactCard.tsx
│   └── DemoSuccessPanel.tsx
├── nodes
├── orion
│   ├── agents
│   │   ├── AgentStoreCard.tsx
│   │   ├── AgentSwitchboardForm.tsx
│   │   └── InstalledAgentCard.tsx
│   ├── artifacts
│   │   ├── ArtifactCard.tsx
│   │   ├── ArtifactCodeView.tsx
│   │   ├── ArtifactDetailPane.tsx
│   │   ├── ArtifactHtmlPreview.tsx
│   │   ├── ArtifactMarkdownPreview.tsx
│   │   ├── ArtifactMetaView.tsx
│   │   └── ArtifactPreviewView.tsx
│   ├── auth
│   │   ├── AccountAccessPanel.tsx
│   │   ├── BrowserSignInPage.tsx
│   │   └── DesktopSignInComplete.tsx
│   ├── chat
│   │   ├── ApprovalRequestCard.tsx
│   │   ├── chatSchema.ts
│   │   ├── ChatSurface.tsx
│   │   ├── ChatSurface.voice.test.tsx
│   │   ├── displayText.ts
│   │   └── InterventionCards.tsx
│   ├── connections
│   │   ├── AiAccountsPanel.tsx
│   │   └── ConnectionMarks.tsx
│   ├── list
│   │   ├── ResourceActionGroup.tsx
│   │   ├── ResourceListRow.tsx
│   │   └── ResourceMetaLine.tsx
│   ├── page
│   │   ├── PageCollection.tsx
│   │   ├── PageDialog.tsx
│   │   ├── PageFilterBar.tsx
│   │   ├── PageHero.tsx
│   │   ├── PageHeroCard.tsx
│   │   ├── PageSection.tsx
│   │   ├── PageStatePanel.tsx
│   │   └── SectionOwnershipPanel.tsx
│   ├── runs
│   │   ├── LocalCompanionRunPanel.tsx
│   │   ├── runLiveCockpitModel.ts
│   │   ├── RunLiveCockpitPanel.tsx
│   │   ├── RunLiveEventFeed.tsx
│   │   └── RunRemediationGuide.tsx
│   ├── setup
│   │   ├── DesktopSetupWizard.tsx
│   │   └── LegacySetupWizard.tsx
│   ├── state
│   │   ├── EmptyState.tsx
│   │   ├── ErrorState.tsx
│   │   ├── LoadingState.tsx
│   │   └── RetryActions.tsx
│   ├── workbench
│   │   ├── WorkbenchActivityRail.tsx
│   │   ├── WorkbenchCenterPanel.tsx
│   │   ├── WorkbenchControlDeck.tsx
│   │   └── WorkbenchShell.tsx
│   ├── workflows
│   │   └── WorkflowListRow.tsx
│   ├── workspace
│   ├── AdvancedControls.tsx
│   ├── ControlPlaneSessionBootstrap.tsx
│   ├── DoctorPreflightNotice.tsx
│   ├── GlobalCommandPalette.tsx
│   ├── LocalRuntimeRecoveryCard.tsx
│   ├── LocalWorkerStatus.tsx
│   ├── LogViewer.tsx
│   ├── OutcomeContract.tsx
│   ├── PackResult.tsx
│   ├── PlatformInspectPanel.tsx
│   ├── PlatformShellContext.tsx
│   ├── PlatformTopBar.tsx
│   ├── PwaInstallControl.tsx
│   ├── RunReceipt.tsx
│   └── SetupWizard.tsx
├── solutions
│   └── CoreControlCenter.tsx
├── ui
│   ├── AppSidebar.tsx
│   ├── badge.tsx
│   ├── button.tsx
│   ├── card.tsx
│   ├── CommandPalette.tsx
│   ├── dialog.tsx
│   ├── input.tsx
│   ├── MetricStrip.tsx
│   ├── OsPageHeader.tsx
│   ├── separator.tsx
│   ├── sheet.tsx
│   ├── sidebar.tsx
│   ├── Skeleton.tsx
│   └── tooltip.tsx
├── workflows
├── reactflow-override.css
├── Sidebar.module.css
├── Sidebar.tsx
├── ThemeProvider.tsx
├── Toast.tsx
└── Topbar.module.css
```

Notes:
- `builder`, `nodes`, and `workflows` directories still exist as empty/legacy shells after the canvas amputation.
- `reactflow-override.css` remains in the tree even though the React Flow UI surface was removed from active routes.

### 1.3 `frontend/lib`

```text
frontend/lib
├── server
│   ├── backendControlPlane.ts
│   ├── bffRouteGuard.ts
│   ├── controlPlaneAuthRouting.js
│   ├── controlPlaneAuthRouting.test.mjs
│   ├── controlPlaneSession.ts
│   ├── runOwnership.ts
│   └── runtimeControlPlane.ts
├── shell
│   ├── forwardWheelToMainScroll.ts
│   └── useShellChromeVisibility.ts
├── accountProfile.ts
├── agent.types.ts
├── api-client.ts
├── api.ts
├── appFlags.ts
├── artifactsPresentation.ts
├── authenticatedEventStream.ts
├── automationIntents.ts
├── brand.ts
├── commandRegistry.ts
├── config.ts
├── controlPlaneSession.ts
├── desktopBridge.ts
├── desktopFirstRun.ts
├── doctorChecks.ts
├── doctorPreflight.ts
├── executionTargets.ts
├── localExecutionCapabilities.ts
├── productArchitecture.ts
├── runStartCopy.ts
├── runtimeArtifacts.ts
├── runtimeConnection.ts
├── runtimeKey.ts
├── safeNavigate.ts
├── setupFlow.ts
├── setupReadiness.ts
├── shellRoutes.ts
├── skills.ts
├── solutions.ts
├── StreamAssembler.ts
├── uiError.ts
├── useSidebarCollapsed.ts
├── useStreamProcessor.ts
└── utils.ts
```

## 2. Next.js Routing Map

### 2.1 Page routes

| Route | File | What it renders / owns |
| --- | --- | --- |
| `/` | `frontend/app/page.tsx` | Main Sage workspace. Composes `WorkbenchShell`, `ChatSurface`, `WorkbenchCenterPanel`, and `WorkbenchControlDeck`. Uses `usePageState()` + `usePlatformApi()` to drive chat, model/provider state, run streaming, artifacts, approvals, and workbench rails. |
| `/account` | `frontend/app/account/page.tsx` | Account/profile page. Uses `PageHero` to surface profile metadata and account ownership information. |
| `/agents` | `frontend/app/agents/page.tsx` | Installed agents dashboard. Loads `workspace_agent_installs`, renders hero/metrics, and maps installs into `InstalledAgentCard`. Can invoke `/api/agents/[id]/run`. |
| `/agents/[id]/configure` | `frontend/app/agents/[id]/configure/page.tsx` + `ConfigureAgentPageClient.tsx` | Agent switchboard/configurator. Loads the agent definition, runtime profiles, and optional existing install, then renders `AgentSwitchboardForm`. |
| `/approvals` | `frontend/app/approvals/page.tsx` | Approval queue / blocked-steps inbox. Uses `PageHero`, `PageFilterBar`, `PageSection`, `PageStatePanel`, and `MetricStrip`. |
| `/artifacts` | `frontend/app/artifacts/page.tsx` | Artifact browser. Uses `PageCollection`, filters, loading/error/empty states, `ArtifactCard` grid, and `ArtifactDetailPane` detail view. |
| `/builder` | `frontend/app/builder/page.tsx` | Immediate redirect page. Calls `redirect('/agents')`. No builder UI remains here. |
| `/connect-ai` | `frontend/app/connect-ai/page.tsx` | AI account/provider connection page. Renders `AiAccountsPanel` under `OsPageHeader`. |
| `/connectors` | `frontend/app/connectors/page.tsx` | Alias page. Re-exports `../credentials/page`, so `/connectors` and `/credentials` currently show the same surface. |
| `/control-center` | `frontend/app/control-center/page.tsx` | Immediate redirect page. Calls `redirect('/workflows')`. |
| `/credentials` | `frontend/app/credentials/page.tsx` | Integrations / tool access page. Uses `AiAccountsPanel`, `ConnectionMarks`, hero/filters/sections, and ownership panels. |
| `/demo` | `frontend/app/demo/page.tsx` | Demo flow / sample runtime page. Uses `DemoSuccessPanel` and `PageStatePanel`. |
| `/executions` | `frontend/app/executions/page.tsx` | Executions/runs list page. Uses `OsPageHeader`, `MetricStrip`, filters, inputs, and run list actions. |
| `/health` | `frontend/app/health/page.tsx` | Diagnostics / system health surface. Uses `PageHero`, `PageSection`, `PageHeroCard`, and status panels. |
| `/home` | `frontend/app/home/page.tsx` | Workspace overview page. Hero + summary cards + sections for recent activity and continuation points. |
| `/library` | `frontend/app/library/page.tsx` | Library/skill inventory page. Uses `PageHero`, `SectionOwnershipPanel`, and `MetricStrip`. |
| `/machines` | `frontend/app/machines/page.tsx` | Machine/runtime management. Uses `DoctorPreflightNotice`, `PageDialog`, `PageHero`, `PageSection`, and machine action buttons. |
| `/onboarding` | `frontend/app/onboarding/page.tsx` | Runtime API key onboarding. Client page that checks runtime connection health and lets the user connect a runtime key. |
| `/quickstart` | `frontend/app/quickstart/page.tsx` | Quickstart checklist with demo/setup/artifact links. Static narrow onboarding page. |
| `/runs/[id]` | `frontend/app/runs/[id]/page.tsx` | Standard run detail page. Uses `OsPageHeader`, `LocalCompanionRunPanel`, and `RunRemediationGuide`. |
| `/runs/[id]/inspect` | `frontend/app/runs/[id]/inspect/page.tsx` | Trigger.dev-style live cockpit. Uses `RunLiveCockpitPanel`, `RunLiveEventFeed`, `LocalCompanionRunPanel`, `RunRemediationGuide`, and `ApprovalRequestCard`. |
| `/schedules` | `frontend/app/schedules/page.tsx` | Scheduled runs page. Uses `PageHero`, `PageSection`, and `PageStatePanel`. |
| `/settings` | `frontend/app/settings/page.tsx` | Workspace/account settings. Uses `AccountAccessPanel` plus hero cards and settings sections. |
| `/setup` | `frontend/app/setup/page.tsx` | Setup flow wrapper. Chooses between `DesktopSetupWizard` and `LegacySetupWizard`. |
| `/sign-in` | `frontend/app/sign-in/page.tsx` | Browser sign-in page. Renders `BrowserSignInPage`. |
| `/sign-in/complete` | `frontend/app/sign-in/complete/page.tsx` | Desktop/browser auth handoff completion page. Renders `DesktopSignInComplete`. |
| `/skills` | `frontend/app/skills/page.tsx` | Skill catalog/registry page. Hero + sections + state panels. |
| `/solutions` | `frontend/app/solutions/page.tsx` | Solutions/packages page. Uses `OsPageHeader`, `MetricStrip`, and `Skeleton` placeholders for solution cards. |
| `/store` | `frontend/app/store/page.tsx` | Agent Store. Loads published `agent_definitions` for the active workspace and renders them via `AgentStoreCard`. |
| `/team` | `frontend/app/team/page.tsx` | Team management placeholder page. Uses `OsPageHeader`; functionality is minimal/not available yet. |
| `/usage` | `frontend/app/usage/page.tsx` | Usage/consumption page. Uses hero, filters, sections, and state panels to display usage summaries. |
| `/workflows` | `frontend/app/workflows/page.tsx` | Remaining blueprint/workflow inventory page. Uses `PageCollection`, `PageDialog`, filters, metrics, and empty/error/loading states. |

### 2.2 Redirects, aliases, and route quirks

- `next.config.ts` redirects:
  - `/builder/:path*` -> `/agents`
  - `/workflows/new` -> `/`
  - `/workflows/:id` -> `/agents`
- `/connectors` is a re-export alias of `/credentials`.
- `/control-center` is not a standalone screen; it redirects to `/workflows`.
- Empty directories under `frontend/app` are not active routes until they get a `page.tsx` or `route.ts(x)`.

### 2.3 API routes

The API surface is a large internal BFF layer that fronts the Python runtime/control plane. Below is the exact route inventory grouped by domain.

#### Agent registry / installs
- `/api/agents` -> list/create `workspace_agent_installs`
- `/api/agents/[id]` -> fetch/update one install
- `/api/agents/[id]/run` -> start an install-backed run via compiled workflow/version

#### Approvals
- `/api/approvals` -> generic approvals collection
- `/api/approvals/audit` -> approval audit trail payload
- `/api/approvals/overview` -> approval summary/overview
- `/api/approvals/resolve` -> approve/deny a pending approval

#### Artifacts
- `/api/artifacts` -> artifact list
- `/api/artifacts/content` -> artifact content retrieval
- `/api/artifacts/file` -> file artifact download/open
- `/api/artifacts/workspace` -> workspace-scoped artifact inventory

#### Legacy builder
- `/api/builder/generate` -> legacy builder/template generation endpoint
- `/api/builder/manifests/connectors` -> legacy connector manifest feed

#### Chat
- `/api/chat/master-context` -> hydrate master-thread/Sage identity context and active specialist installs
- `/api/chat/respond` -> chat response helper / bridge route

#### Connectors bridge
- `/api/connectors` -> general connector listing/actions
- `/api/connectors/[id]/microsoft-drive` -> Microsoft Drive connector-specific handler

#### Control-plane auth
- `/api/control-plane/auth/access` -> access/sign-in-method summary
- `/api/control-plane/auth/access/password` -> add/manage password access
- `/api/control-plane/auth/access/methods/[method]/disconnect` -> disconnect an auth method
- `/api/control-plane/auth/apple/start` -> start Apple auth
- `/api/control-plane/auth/apple/callback` -> Apple auth callback
- `/api/control-plane/auth/desktop/consume` -> desktop browser-auth handoff consumption
- `/api/control-plane/auth/google/start` -> start Google auth
- `/api/control-plane/auth/google/callback` -> Google auth callback
- `/api/control-plane/auth/login` -> credential login
- `/api/control-plane/auth/me` -> current auth/session info
- `/api/control-plane/auth/providers` -> available auth providers
- `/api/control-plane/auth/signup` -> sign-up

#### Control-plane connectors
- `/api/control-plane/connectors` -> connector collection
- `/api/control-plane/connectors/[connectorId]` -> connector detail/update
- `/api/control-plane/connectors/[connectorId]/test` -> test connector binding
- `/api/control-plane/connectors/[connectorId]/google-doc` -> Google Doc connector action
- `/api/control-plane/connectors/[connectorId]/google-drive` -> Google Drive connector action
- `/api/control-plane/connectors/[connectorId]/google-sheet` -> Google Sheet connector action
- `/api/control-plane/connectors/github/start` -> GitHub connector auth start
- `/api/control-plane/connectors/slack/start` -> Slack connector auth start
- `/api/control-plane/connectors/slack/callback` -> Slack connector auth callback

#### Control-plane contract / schema
- `/api/control-plane/contract` -> frontend contract/bootstrap payload

#### Control-plane credentials
- `/api/control-plane/credentials` -> credential collection
- `/api/control-plane/credentials/[credentialId]` -> single credential detail/update/delete
- `/api/control-plane/credentials/[credentialId]/test` -> credential validation/test
- `/api/control-plane/credentials/export` -> export credentials
- `/api/control-plane/credentials/import` -> import credentials
- `/api/control-plane/credentials/rotate-key` -> rotate local key material

#### Control-plane providers
- `/api/control-plane/providers` -> provider catalog / profile list
- `/api/control-plane/providers/model-aliases` -> provider/model alias registry
- `/api/control-plane/providers/runtime-availability` -> provider runtime availability
- `/api/control-plane/providers/health-check` -> provider health summary
- `/api/control-plane/providers/[providerId]/models` -> live models for a provider/profile
- `/api/control-plane/providers/[providerId]/probe` -> provider connectivity probe
- `/api/control-plane/providers/anthropic/local-auth/import` -> import Anthropic local auth
- `/api/control-plane/providers/anthropic/local-cli/login` -> Anthropic local CLI login
- `/api/control-plane/providers/anthropic/local-cli/status` -> Anthropic local CLI status
- `/api/control-plane/providers/gemini/local-auth/import` -> import Gemini local auth
- `/api/control-plane/providers/gemini/local-cli/status` -> Gemini local CLI status
- `/api/control-plane/providers/openai/local-auth/import` -> import OpenAI local auth
- `/api/control-plane/providers/openai/local-auth/status` -> OpenAI local auth status
- `/api/control-plane/providers/profiles` -> provider profile collection
- `/api/control-plane/providers/profiles/health` -> provider profile health
- `/api/control-plane/providers/profiles/[profileId]` -> provider profile detail/update
- `/api/control-plane/providers/profiles/[profileId]/disable` -> disable a provider profile

#### Control-plane schedules
- `/api/control-plane/schedules` -> schedule collection
- `/api/control-plane/schedules/[scheduleId]` -> single schedule detail/update/delete
- `/api/control-plane/schedules/weekly` -> weekly schedule collection
- `/api/control-plane/schedules/weekly/[scheduleId]` -> weekly schedule detail/update/delete

#### Control-plane session / setup
- `/api/control-plane/session` -> bootstrap browser control-plane session
- `/api/control-plane/setup/sessions` -> setup session collection/create
- `/api/control-plane/setup/sessions/[sessionId]` -> setup session detail
- `/api/control-plane/setup/sessions/[sessionId]/actions` -> next-allowed actions
- `/api/control-plane/setup/sessions/[sessionId]/cancel` -> cancel setup session
- `/api/control-plane/setup/sessions/[sessionId]/resume` -> resume setup session

#### Demo
- `/api/demo` -> demo launch/status
- `/api/demo/[runId]` -> demo run detail

#### Diagnostics / health
- `/api/doctor/preflight` -> preflight checks before setup/use
- `/api/health` -> general health status
- `/api/health/overview` -> health overview summary

#### Executions
- `/api/executions/list` -> execution list
- `/api/executions/history` -> execution history
- `/api/executions/[id]` -> execution detail
- `/api/executions/[id]/resume` -> resume a paused/failed execution

#### Local ops / machines / runtime placement
- `/api/local-ops` -> local operation bridge
- `/api/machines` -> machine list / management
- `/api/machines/enrollment-intents` -> machine enrollment flow
- `/api/machines/[id]` -> single machine detail
- `/api/machines/[id]/hard-kill` -> hard-kill machine-bound work
- `/api/machines/[id]/resume` -> resume machine
- `/api/machines/[id]/suspend` -> suspend machine
- `/api/runtime/machines` -> runtime/machine availability view for cockpit/diagnosis
- `/api/runtime-profiles` -> execution placement profiles

#### Notifications / shell
- `/api/notifications` -> shell notifications feed
- `/api/onboarding/runtime-connection` -> onboarding runtime connection status
- `/api/platform/shell-status` -> top-level platform shell status

#### Runs
- `/api/runs` -> run collection
- `/api/runs/start` -> start run
- `/api/runs/precheck` -> run preflight evaluation
- `/api/runs/[id]` -> run detail
- `/api/runs/[id]/stream` -> SSE stream for live cockpit
- `/api/runs/[id]/decision` -> resolve run decision step
- `/api/runs/[id]/delegate` -> delegate from run
- `/api/runs/[id]/delegate/auto` -> auto-delegate route
- `/api/runs/[id]/delegate/retry-failed` -> retry failed delegation
- `/api/runs/[id]/hard-kill` -> hard kill run
- `/api/runs/[id]/pause` -> pause run
- `/api/runs/[id]/replay` -> replay event log
- `/api/runs/[id]/resume` -> resume run

#### Sessions
- `/api/sessions` -> create/list runtime sessions
- `/api/sessions/[id]` -> session detail/update

#### Setup
- `/api/setup/desktop` -> desktop setup data/actions

#### Skills / solutions / store
- `/api/skills` -> skills collection
- `/api/skills/[name]` -> single skill detail
- `/api/skills/install` -> install a skill
- `/api/skills/publish` -> publish a skill
- `/api/skills/registry` -> registry feed
- `/api/skills/state` -> installed skill state
- `/api/solutions/state` -> solution/package state payload
- `/api/store/agents` -> published agent catalog
- `/api/store/agents/[id]` -> published agent definition detail

#### Media / speech
- `/api/stt` -> speech-to-text
- `/api/tts` -> text-to-speech

#### Threads / turns / tools / usage
- `/api/threads` -> master thread list/create
- `/api/threads/[id]` -> single thread detail/history
- `/api/turn` -> canonical agent turn entrypoint from web chat
- `/api/tools/contracts` -> tool contract collection
- `/api/tools/contracts/[toolId]` -> single tool contract detail
- `/api/tools/policy/evaluate` -> tool policy evaluation
- `/api/usage/summary` -> usage summary
- `/api/usage/runs` -> usage by run
- `/api/work-log-summary` -> summary of work log

#### Workbench / workflows
- `/api/workbench/control-center` -> workbench control-center payload
- `/api/workbench/agents/[agentRole]/channels` -> workbench agent-role channels
- `/api/workflows` -> workflow collection
- `/api/workflows/[id]` -> workflow detail/update/delete
- `/api/workflows/[id]/publish` -> publish workflow
- `/api/workflows/[id]/run` -> run workflow

## 3. Component Registry

This section groups `frontend/components/` by domain and calls out the major components that shape the live product.

### 3.1 Shell, navigation, and global chrome

Core files:
- `frontend/components/ThemeProvider.tsx`
- `frontend/components/Toast.tsx`
- `frontend/components/Sidebar.tsx`
- `frontend/components/orion/PlatformShellContext.tsx`
- `frontend/components/orion/PlatformTopBar.tsx`
- `frontend/components/orion/PlatformInspectPanel.tsx`
- `frontend/components/orion/GlobalCommandPalette.tsx`
- `frontend/components/ui/AppSidebar.tsx`
- `frontend/components/ui/CommandPalette.tsx`
- `frontend/components/ui/OsPageHeader.tsx`

Major components:

- `PlatformShellProvider` in `PlatformShellContext.tsx`
  - Props: `{ children: React.ReactNode }`
  - Owns: shell-global access mode, setup/runtime/auth status, active workspace/tenant, inspect panel state, and chat top-control state.
  - Context value:
    - `accessMode`, `setAccessMode`
    - `status`
    - `activeWorkspaceId`, `activeTenantId`
    - `workspaceAccess`, `workspaceLoading`
    - `inspectPanelOpen`, `setInspectPanelOpen`
    - `inspectState`, `setInspectState`
    - `chatTopControls`, `setChatTopControls`

- `PlatformTopBar`
  - Props: none
  - Owns: global top shell row. This is the cross-platform bar, not the chat-local action strip.

- `PlatformInspectPanel`
  - Props: none
  - Owns: right-side global inspect drawer. Reads `usePlatformShell()` and shows current run, provider/model used, tools called, evidence items, auth-required state, and system status.

- `AppSidebar`
  - Props: none
  - Owns: left navigation rail, collapse/expand behavior, section icons, bottom utility actions.
  - Depends on `useSidebarCollapsed()`, pathname, and shell visibility helpers.

- `CommandPaletteProvider` in `ui/CommandPalette.tsx`
  - Props: `{ children: React.ReactNode }`
  - Owns: command palette context, global keyboard shortcuts, command registry integration, and the `empyralis:new-chat` global event hook.

- `ThemeProvider`
  - Props: `{ children: React.ReactNode }`
  - Owns: `light` / `dark` / `system` theme mode, writes `data-theme` and `color-scheme` onto `<html>`.

### 3.2 Sage chat and workbench

Core files:
- `frontend/components/orion/chat/ChatSurface.tsx`
- `frontend/components/orion/chat/ApprovalRequestCard.tsx`
- `frontend/components/orion/chat/InterventionCards.tsx`
- `frontend/components/orion/chat/chatSchema.ts`
- `frontend/components/orion/chat/displayText.ts`
- `frontend/components/orion/workbench/WorkbenchShell.tsx`
- `frontend/components/orion/workbench/WorkbenchCenterPanel.tsx`
- `frontend/components/orion/workbench/WorkbenchControlDeck.tsx`
- `frontend/components/orion/workbench/WorkbenchActivityRail.tsx`

Major components:

- `ChatSurface`
  - Major props:
    - session/history: `sessions`, `selectedSessionId`, `onSelectSession`, `onNewChat`, `historyEnabled`
    - composer: `goal`, `setGoal`, `primaryGoalRef`, `onSend`
    - interventions: `onMessageAction`, `onRunApprovalDecision`, `onApprovalDecision`
    - model/provider/trust: `selectedModel`, `modelOptions`, `modelsLoading`, `trustLabel`, `depthOptions`, `selectedDepth`
    - shell context: `providerBanner`, `shellNotice`, `targetLabel`
    - identity drawer: `identitySections`, `identityOpen`, `onIdentityOpenChange`
  - Owns: the main Sage chat UI, empty state, history drawer, composer, message rendering, approval cards, intervention cards, model selector, voice entry, and the chat-local `History` / `New chat` controls.

- `ApprovalRequestCard`
  - Props are derived from approval/intervention records passed from chat and run pages.
  - Owns: the structured approval/deny card used instead of freeform “AI text” for sensitive actions.

- `InterventionCards`
  - Owns: render path for intervention requests and inline runtime gates inside chat.

- `chatSchema.ts`
  - Not a visual component; defines the frontend chat DTOs:
    - message shape
    - approval request shape
    - run-card shape
    - intervention records
    - action records

- `WorkbenchShell`
  - Props: `topError`, `statusNotice`, `children`
  - Owns: outer layout wrapper for the main workspace page and applies `body.orion-chat-home`.

- `WorkbenchCenterPanel`
  - Owns: center-column page composition around chat and pack/result content.

- `WorkbenchControlDeck`
  - Owns: the side deck for provider selection, presets, status, setup, and control-plane related panels used on the main page.

- `WorkbenchActivityRail`
  - Owns: status/activity rail for recent actions/logs/receipts on the main workspace.

### 3.3 Agents, Store, and Switchboard

Core files:
- `frontend/components/orion/agents/AgentStoreCard.tsx`
- `frontend/components/orion/agents/InstalledAgentCard.tsx`
- `frontend/components/orion/agents/AgentSwitchboardForm.tsx`

Major components:

- `AgentStoreCard`
  - Props: `definition: AgentDefinitionRecord`, `href: string`
  - Owns: one store card for a published agent definition, including capability chips and install CTA.

- `InstalledAgentCard`
  - Props:
    - `install: WorkspaceAgentInstallRecord`
    - `configureHref: string`
    - `onRun: () => void`
    - `running: boolean`
  - Owns: one installed-agent card with status chips, placement, trust mode, run/configure/chat actions.

- `AgentSwitchboardForm`
  - Props:
    - `definition: AgentDefinitionRecord`
    - `runtimeProfiles: RuntimeProfileRecord[]`
    - `workspaceId: string`
    - `existingInstall?: WorkspaceAgentInstallRecord | null`
  - Owns: install/edit surface for:
    - install label
    - execution placement
    - skill toggles
    - trust mode
    - folder scope
  - Saves through `createAgentInstall()` / `updateAgentInstall()` and returns to `/agents`.

### 3.4 Runs, cockpit, and runtime diagnosis

Core files:
- `frontend/components/orion/runs/RunLiveCockpitPanel.tsx`
- `frontend/components/orion/runs/RunLiveEventFeed.tsx`
- `frontend/components/orion/runs/runLiveCockpitModel.ts`
- `frontend/components/orion/runs/LocalCompanionRunPanel.tsx`
- `frontend/components/orion/runs/RunRemediationGuide.tsx`
- `frontend/components/orion/LocalRuntimeRecoveryCard.tsx`
- `frontend/components/orion/LocalWorkerStatus.tsx`
- `frontend/components/orion/RunReceipt.tsx`
- `frontend/components/orion/LogViewer.tsx`

Major components:

- `RunLiveCockpitPanel`
  - Key props:
    - `runId`
    - `loading?`, `runStatus?`
    - `replayEvents?`
    - `sectionRef?`
    - `focusedStyle?`
    - `active?`
    - `headerAccessory?`
    - `onLiveEventsChange?`
    - `onStreamMetaChange?`
    - `onRefreshRunState?`
  - Owns: live SSE cockpit connection, stream/replay hydration, and top-level cockpit composition.

- `RunLiveEventFeed`
  - Props:
    - `mode: RunLiveFeedMode`
    - `onModeChange(nextMode)`
    - `timelineEvents: RunLiveTimelineEvent[]`
  - Owns: timeline/log switching UI and dense live event table.

- `runLiveCockpitModel.ts`
  - Not a component. Transforms raw replay + stream events into cockpit timeline rows, log rows, summary chips, approvals, agent lineage, and machine/runtime details.

- `LocalCompanionRunPanel`
  - Props:
    - `runId`
    - `diagnostics`
    - `requiredCapabilities`
    - `missingCapabilities`
    - `busyRuntimeLabels`
  - Owns: machine capability diagnostics, queue state, missing-capability messaging, and local worker visibility for machine-bound runs.

- `RunRemediationGuide`
  - Owns: “what to do next” guidance when runs fail or need intervention.

- `LocalRuntimeRecoveryCard`
  - Owns: recovery guidance when the local runtime disconnects or stalls.

### 3.5 Auth, account access, and setup

Core files:
- `frontend/components/orion/auth/BrowserSignInPage.tsx`
- `frontend/components/orion/auth/DesktopSignInComplete.tsx`
- `frontend/components/orion/auth/AccountAccessPanel.tsx`
- `frontend/components/orion/ControlPlaneSessionBootstrap.tsx`
- `frontend/components/orion/SetupWizard.tsx`
- `frontend/components/orion/setup/DesktopSetupWizard.tsx`
- `frontend/components/orion/setup/LegacySetupWizard.tsx`
- `frontend/components/orion/DoctorPreflightNotice.tsx`
- `frontend/components/orion/PwaInstallControl.tsx`

Major components:

- `BrowserSignInPage`
  - Props:
    - `returnTo: string`
    - `errorCode?: string`
    - `desktopMode?: boolean`
  - Owns: the browser sign-in experience and provider/password sign-in CTAs.

- `DesktopSignInComplete`
  - Owns: the desktop/browser auth handoff completion surface.

- `AccountAccessPanel`
  - Props:
    - `access: AccountAccess | null`
    - `authProviders: AuthProviders`
    - `providerConnections: ProviderConnection[]`
    - `loading?`, `error?`, `actionBusy?`, `passwordBusy?`
    - `onDisconnectMethod(method)`
    - `onAddPassword(password)`
  - Owns: account sign-in method management and provider connection status.

- `DesktopSetupWizard`
  - Owns: desktop-first setup flow, permissions, runtime checks, and first-run guidance.

- `LegacySetupWizard`
  - Owns: older setup path still kept as compatibility fallback.

- `DoctorPreflightNotice`
  - Owns: preflight health notices shown on setup/machines related surfaces.

### 3.6 Artifacts

Core files:
- `frontend/components/orion/artifacts/ArtifactCard.tsx`
- `frontend/components/orion/artifacts/ArtifactDetailPane.tsx`
- `frontend/components/orion/artifacts/ArtifactPreviewView.tsx`
- `frontend/components/orion/artifacts/ArtifactCodeView.tsx`
- `frontend/components/orion/artifacts/ArtifactHtmlPreview.tsx`
- `frontend/components/orion/artifacts/ArtifactMarkdownPreview.tsx`
- `frontend/components/orion/artifacts/ArtifactMetaView.tsx`

Major components:

- `ArtifactDetailPane`
  - Props:
    - `item`, `previewTarget`
    - `contentHref`, `downloadHref`
    - `showReveal`, `revealLabel`
    - `showBackButton?`, `onBack?`
    - `hasPreviousArtifact?`, `hasNextArtifact?`
    - `onPreviousArtifact?`, `onNextArtifact?`
    - `onOpenExternal`, `onReveal`
  - Owns: right-side/detail presentation for an artifact and its previews/actions.

- `ArtifactCard`
  - Owns: artifact list/grid card presentation.

- Preview components
  - Own: code/html/markdown/meta subviews inside artifact detail.

### 3.7 Page primitives and generic state surfaces

Core files:
- `frontend/components/orion/page/PageHero.tsx`
- `frontend/components/orion/page/PageHeroCard.tsx`
- `frontend/components/orion/page/PageSection.tsx`
- `frontend/components/orion/page/PageCollection.tsx`
- `frontend/components/orion/page/PageDialog.tsx`
- `frontend/components/orion/page/PageFilterBar.tsx`
- `frontend/components/orion/page/PageStatePanel.tsx`
- `frontend/components/orion/page/SectionOwnershipPanel.tsx`
- `frontend/components/orion/state/EmptyState.tsx`
- `frontend/components/orion/state/ErrorState.tsx`
- `frontend/components/orion/state/LoadingState.tsx`
- `frontend/components/orion/state/RetryActions.tsx`

Major primitives:

- `PageHero`
  - Props: `kicker?`, `title`, `copy?`, `actions?`, `aside?`, `className?`
  - Owns: top hero block used on most non-chat pages.

- `PageSection`
  - Props: `title?`, `description?`, `actions?`, `children`, `className?`, `bodyClassName?`, `muted?`
  - Owns: standard panel/section wrapper.

- `PageCollection`
  - Props: `title?`, `description?`, `actions?`, `children`, `className?`, `bodyClassName?`
  - Owns: collection/list wrapper for inventories.

- `PageStatePanel`
  - Props: `variant`, `icon?`, `title`, `copy?`, `actions?`, `className?`
  - Owns: consistent loading/error/empty panel frame.

- `PageDialog`
  - Owns: page-scoped dialog/modal wrapper.

- `PageFilterBar`
  - Owns: filter/search bar layout used on list pages.

### 3.8 Connections, list utilities, demos, and solution shells

Files:
- `frontend/components/orion/connections/AiAccountsPanel.tsx`
- `frontend/components/orion/connections/ConnectionMarks.tsx`
- `frontend/components/orion/list/ResourceActionGroup.tsx`
- `frontend/components/orion/list/ResourceListRow.tsx`
- `frontend/components/orion/list/ResourceMetaLine.tsx`
- `frontend/components/demo/DemoArtifactCard.tsx`
- `frontend/components/demo/DemoSuccessPanel.tsx`
- `frontend/components/solutions/CoreControlCenter.tsx`
- `frontend/components/orion/workflows/WorkflowListRow.tsx`

Major notes:
- `AiAccountsPanel`
  - Props: `workspaceId`, `mode?: 'manage' | 'connect'`, `returnTo?`
  - Owns: provider account connection surface.
- `WorkflowListRow`
  - Still exists because `/workflows` remains as a list/inventory surface, even though the visual editor was removed.
- `CoreControlCenter`
  - Solution-layer component, not the main shell.

### 3.9 UI core / shadcn primitives

Files:
- `button.tsx`, `card.tsx`, `dialog.tsx`, `input.tsx`, `sheet.tsx`, `sidebar.tsx`, `tooltip.tsx`, `badge.tsx`, `separator.tsx`, `Skeleton.tsx`, `MetricStrip.tsx`, `OsPageHeader.tsx`

Purpose:
- shared low-level primitives and wrappers that the domain components compose
- the project uses these alongside custom CSS variables and inline styles rather than a pure utility-class-only style system

## 4. State & API Wiring

### 4.1 Root application shell and providers

`frontend/app/layout.tsx` is the global composition root. It wires:
- `ThemeProvider`
- `TooltipProvider`
- `CommandPaletteProvider`
- `PlatformShellProvider`
- `SidebarProvider`
- `ToastProvider`
- left shell chrome (`Sidebar` / `AppSidebar`)
- top shell chrome (`PlatformTopBar`)
- right shell chrome (`PlatformInspectPanel`)

It also:
- imports `frontend/app/globals.css`
- injects CSS variables for shell geometry
- uses `SHELL_CHROME` from `frontend/design-constraints.ts`
- applies the root shell/stage layout

### 4.2 Main page state model (`/`)

The main workspace route is unusually stateful.

Key files:
- `frontend/app/page.tsx`
- `frontend/app/page.state.ts`
- `frontend/app/page.api.ts`
- `frontend/app/page.actions.ts`
- `frontend/app/page.catalog.ts`

Current wiring:
- `page.tsx` calls:
  - `usePageState()` from `page.state.ts`
  - `usePlatformApi(pageState, streamRef, …)` from `page.api.ts`
- `page.state.ts`
  - holds the mutable UI state for the main chat/workbench page
  - current key domains:
    - goal/composer text
    - provider/model/auth selection
    - connector/credential choices
    - trust mode and execution target
    - run status / run id / pending approvals
    - setup wizard state
    - logs / metrics / worker status
    - drawer visibility and view toggles
  - current notable behavior:
    - `model` initializes to empty string
    - `modelOptions` initializes to empty array
    - visible model choices now come from the provider, not from hardcoded fallback menu items
- `page.api.ts`
  - exports `usePlatformApi` and aliases it as `useOrionApi`
  - owns the runtime orchestration layer for `/`
  - responsibilities:
    - ensure control-plane session
    - create runtime sessions
    - refresh provider catalogs and provider-specific models
    - submit turns and runs
    - attach SSE/authenticated stream handlers
    - build streaming assistant messages
    - manage credentials/connectors loading
    - refresh schedules and runtime status

### 4.3 Global shell state

`frontend/components/orion/PlatformShellContext.tsx`
- The main cross-route UI state container.
- Stores:
  - active workspace and tenant ids
  - auth/setup/runtime shell status
  - inspect panel state
  - chat-top controls/notices
  - workspace access list
- Calls:
  - `ensureControlPlaneSession()` from `frontend/lib/controlPlaneSession.ts`
  - `fetchSetupReadiness()` from `frontend/lib/setupReadiness.ts`

### 4.4 Shell-specific hooks and helpers

- `frontend/lib/useSidebarCollapsed.ts`
  - stores sidebar state in localStorage (`empyralist:sidebar-collapsed`)
  - syncs `data-sidebar-collapsed` on `<html>`
  - updates `--shell-sidebar-width` using `SHELL_CHROME.sidebarExpanded` / `sidebarCollapsed`

- `frontend/lib/shell/useShellChromeVisibility.ts`
  - controls whether shell chrome is visible on a given route/context

- `frontend/lib/shell/forwardWheelToMainScroll.ts`
  - shell-level scrolling helper

- `frontend/lib/safeNavigate.ts`
  - safer navigation helper around router/browser transitions

### 4.5 Session and auth bootstrap

- `frontend/lib/controlPlaneSession.ts`
  - browser-side control-plane session bootstrapper
  - important exports:
    - `ensureControlPlaneSession()`
    - `promptControlPlaneSignIn()`
    - `waitForDesktopControlPlaneSignIn()`
    - `consumeDesktopControlPlaneAuthHandoff()`
  - handles:
    - sign-in redirects
    - desktop auth handoff
    - retry cooldowns
    - auth-required error shaping

- `frontend/components/orion/ControlPlaneSessionBootstrap.tsx`
  - UI/bootstrap wrapper for control-plane session startup

### 4.6 Fetch and BFF wiring

Primary client fetch layer:
- `frontend/lib/api.ts`

Important responsibilities in `api.ts`:
- wraps internal `fetch` through `internalApiFetch()`
- always calls `ensureControlPlaneSession()` first
- normalizes BFF payloads for:
  - workflows
  - agents
  - store definitions
  - runtime profiles
  - master-thread context
  - installed-agent run starts
  - run hard-kill/machine hard-kill

Important exported functions:
- `fetchWorkflows(workspaceId?)`
- `runWorkflow(id, credentials?, variables?)`
- `publishWorkflow(id)`
- `fetchAgentStore(workspaceId)`
- `fetchAgentDefinition(id, workspaceId)`
- `fetchRuntimeProfiles(workspaceId)`
- `fetchAgents(workspaceId)`
- `fetchAgentInstall(id, workspaceId)`
- `fetchChatMasterContext(workspaceId)`
- `createAgentInstall(payload)`
- `updateAgentInstall(id, payload)`
- `runInstalledAgent(installId, payload?)`

Lower-level client:
- `frontend/lib/api-client.ts`
  - used for session creation and some typed runtime-control-plane calls

Server-side BFF helpers:
- `frontend/lib/server/backendControlPlane.ts`
- `frontend/lib/server/runtimeControlPlane.ts`
- `frontend/lib/server/controlPlaneSession.ts`
- `frontend/lib/server/bffRouteGuard.ts`
- `frontend/lib/server/runOwnership.ts`

These server-side helpers power the Next API routes and mediate:
- auth/session forwarding
- backend base URL routing
- run ownership checks
- consistent BFF error shaping

### 4.7 Streaming and live event wiring

- `frontend/lib/authenticatedEventStream.ts`
  - manual `fetch()`-based SSE client
  - parses `event:`, `data:`, `id:` frames
  - used where authenticated event streams are needed without raw `EventSource`

- `frontend/lib/StreamAssembler.ts`
  - assembles streamed message chunks / turn updates into displayable chat state

- `frontend/lib/useStreamProcessor.ts`
  - utility for determining whether an assistant message/run-card is still loading, active, or terminal

Primary live routes using this infrastructure:
- `/api/runs/[id]/stream`
- main chat turn/run streaming on `/`
- cockpit event feed on `/runs/[id]/inspect`

### 4.8 Domain-specific helper libraries

- `brand.ts` -> brand constants
- `productArchitecture.ts` -> section definitions and shell IA metadata
- `shellRoutes.ts` -> route-to-shell metadata
- `commandRegistry.ts` -> command palette action registry
- `executionTargets.ts` -> cloud/local placement labels and helpers
- `localExecutionCapabilities.ts` -> map shell/browser/local execution capabilities
- `runtimeConnection.ts` -> onboarding/runtime health helpers
- `runtimeArtifacts.ts` -> artifact URL helpers
- `runStartCopy.ts` -> user-facing copy for run starts and wait states
- `skills.ts` -> skill loading/resolution
- `setupReadiness.ts` / `setupFlow.ts` -> setup progress and gating
- `doctorChecks.ts` / `doctorPreflight.ts` -> diagnostic helper layer

## 5. Styling & Theming

### 5.1 Global CSS entrypoint

- `frontend/app/globals.css`

This is the main global stylesheet. It currently contains:
- Tailwind/shadcn imports:
  - `@import "tailwindcss";`
  - `@import "tw-animate-css";`
  - `@import "shadcn/tailwind.css";`
- root CSS variables for:
  - spacing
  - radii
  - typography sizes
  - button heights
  - shell colors
  - semantic colors
  - shadows
  - motion timing
  - sidebar/topbar sizes
- shell layout CSS
- page shell classes
- chat layout classes
- panel/button utility classes
- dark theme overrides under `[data-theme='dark']`

### 5.2 Design tokens and style helpers

- `frontend/design-constraints.ts`

This is the explicit design-token source for the app.

Important exports:
- `DESIGN_LANGUAGE`
  - current posture: `restrained`, `precise`, `dense`, `high-trust`
- `DESIGN_TOKENS`
  - colors
  - radii
  - spacing scale
  - typography
  - control heights
  - interaction states
  - shadows
  - motion
- `SHELL_CHROME`
  - `sidebarExpanded`
  - `sidebarCollapsed`
  - `topbarHeight`
  - `desktopTitlebarHeight`
  - `pageInsetX`
  - `pageInsetBottom`
- helper style factories:
  - `pageShellStyle()`
  - `panelStyle()`
  - `sectionTitleStyle()`
  - `eyebrowStyle()`
  - `bodyTextStyle()`
  - `metaTextStyle()`
  - `buttonStyle()`
  - badge helpers and other mergeable inline style utilities

This is the real token layer the app is using in addition to CSS variables.

### 5.3 CSS modules and page-local styles

Current CSS-module files:
- `frontend/app/page.module.css`
- `frontend/app/agents/page.module.css`
- `frontend/components/Sidebar.module.css`
- `frontend/components/Topbar.module.css`

Use:
- legacy or page-specific styling
- shell/sidebar/topbar behavior
- some remaining page-level local overrides

### 5.4 UI primitive layer

`frontend/components/ui/*`
- shadcn-style component primitives
- used across page and domain components
- current styling model is hybrid:
  - global CSS variables
  - token-driven inline styles
  - shadcn/Tailwind utility classes
  - a smaller amount of CSS modules

### 5.5 Tailwind / PostCSS / config

- `frontend/postcss.config.mjs`
  - uses `@tailwindcss/postcss`
- There is no dedicated `frontend/tailwind.config.*` file currently present.
- Tailwind is imported through `globals.css`, but the project leans heavily on:
  - CSS custom properties
  - inline token helpers in `design-constraints.ts`
  - shadcn primitive components

### 5.6 Next configuration

- `frontend/next.config.ts`

Current responsibilities:
- disables dev indicators
- enables `experimental.externalDir`
- defines the redirect rules for removed builder routes
- sets `/sw.js` no-cache headers
- wraps with Sentry when `NEXT_PUBLIC_SENTRY_DSN` is present

## 6. Current Architectural Reading

The frontend is currently organized around five major planes:

1. Shell chrome
- `layout.tsx`
- `PlatformShellContext`
- sidebar/topbar/inspect/command palette

2. Sage workbench
- `/`
- `page.state.ts`
- `page.api.ts`
- `ChatSurface`
- workbench center/control/activity components

3. Catalog + install flow
- `/store`
- `/agents`
- `/agents/[id]/configure`
- `AgentStoreCard`
- `InstalledAgentCard`
- `AgentSwitchboardForm`

4. Runtime observability
- `/runs/[id]`
- `/runs/[id]/inspect`
- live cockpit components and stream model

5. Control-plane admin/product surfaces
- credentials/providers/machines/skills/schedules/usage/workflows/settings/home/etc.

The overall shape is:
- shell-heavy
- BFF-heavy
- client-state-heavy on the main workspace route
- tokenized but not purely Tailwind-driven
- partially cleaned of workflow-builder UI, but still carrying some blueprint/workflow inventory surfaces and route vocabulary

## 7. Immediate Handoff Notes For A New Frontend System

If another frontend system is taking over, the critical files to understand first are:

1. `frontend/app/layout.tsx`
2. `frontend/components/orion/PlatformShellContext.tsx`
3. `frontend/components/ui/AppSidebar.tsx`
4. `frontend/components/orion/PlatformTopBar.tsx`
5. `frontend/app/page.tsx`
6. `frontend/app/page.state.ts`
7. `frontend/app/page.api.ts`
8. `frontend/components/orion/chat/ChatSurface.tsx`
9. `frontend/lib/api.ts`
10. `frontend/design-constraints.ts`
11. `frontend/app/globals.css`
12. `frontend/app/runs/[id]/inspect/page.tsx`
13. `frontend/app/agents/page.tsx`
14. `frontend/app/store/page.tsx`
15. `frontend/app/agents/[id]/configure/ConfigureAgentPageClient.tsx`

Those files define:
- the shell
- the global state contract
- the main Sage experience
- the Store/Installed/Configure agent flow
- the live cockpit
- the fetch/BFF contract
- the design token system
