# Super App Foundation

## 1. SUPER APP DEFINITION

The super app is a native shell plus a small number of first-party AI-native apps that share a trusted operating layer: identity, workspace, approvals, notifications, assets, integrations, and execution visibility.

It is not:

- one giant chatbot with everything stuffed into a prompt
- a tab bar full of unrelated mini-products
- a marketplace container designed before the first app is coherent
- a shell that silently mixes context from every app

The product boundary is strict:

- the shell owns the user’s operating environment
- each app owns its domain UX, domain state, and domain execution behavior
- shared primitives exist only when they are truly cross-app

Why it exists:

- one trust layer instead of repeated onboarding and repeated approvals
- one execution layer instead of duplicated run systems
- one premium operating surface instead of disconnected AI toys

Core user value:

- “I have one system that understands what app I am in, what work is active, what approvals are waiting, and what changed.”

## 2. SHELL VS APP BOUNDARY

- Navigation: shell-owned
- Windowing / tabs / sessions: shared with hard contract
- Profiles: shell-owned
- Settings: shell-owned
- Global search: shell-owned
- Notifications: shell-owned
- Assets: shared with hard contract
- Integrations: shared with hard contract
- Memory / context: shared with hard contract
- Chat: both, with strict split
- Execution: shared with hard contract
- Approvals: shell-owned UI, app-owned copy and semantics

Exact ownership:

- Navigation
  Shell-owned. The shell decides top-level app switching, inbox access, profile access, and global search entry.
- Windowing / tabs / sessions
  Shared with hard contract. The shell owns app sessions and restores them. Each app owns its internal panes, tabs, or subflows.
- Profiles
  Shell-owned. Profile, workspace, auth, notification preferences, trust settings, and connected devices cannot be app-specific.
- Settings
  Shell-owned. App-specific settings can exist, but only under the shell settings structure.
- Global search
  Shell-owned. Search can query across apps, but apps must expose indexed objects through a contract.
- Notifications
  Shell-owned. Delivery, inbox, quiet hours, and preference controls are global. Apps only declare notification types and payloads.
- Assets
  Shared with hard contract. Shell owns registry and storage metadata. Apps own how assets are rendered and used.
- Integrations
  Shared with hard contract. Shell owns connection lifecycle, auth, consent, and scopes. Apps request approved capabilities through a contract.
- Memory / context
  Shared with hard contract. Shell owns memory registry and permission model. Apps own app-local memory interpretation.
- Chat
  Both. The shell owns global KIN chat. Apps may own app-local conversational surfaces. They are not the same thread.
- Execution
  Shared with hard contract. Shell owns run registry, approval lifecycle, observability, and evidence model. Apps own execution intent, domain policy, and UI.
- Approvals
  Shell-owned UI. App-owned meaning. Every approval is rendered through one trust layer, but the app defines what the user is authorizing.

## 3. SHARED PRIMITIVES

- Workspace
  Definition: top-level personal operating environment.
  Why: hard trust boundary for data, runs, memory, and integrations.
  Scope: global.
  Required fields: `workspace_id`, `label`, `owner_profile_id`, `policy_set`, `created_at`.
  Lifecycle: created once, persists, can be switched, archived, exported.

- Profile
  Definition: human identity and preferences layer inside a workspace.
  Why: personalization, permissions, notification policy, trust settings.
  Scope: global.
  Required fields: `profile_id`, `workspace_id`, `display_name`, `preferences`, `privacy_settings`.
  Lifecycle: created, updated, optionally multiple per workspace.

- Conversation
  Definition: chat thread bound to either shell or one app.
  Why: preserve legible context boundaries.
  Scope: shell-level or app-scoped, never both at once.
  Required fields: `conversation_id`, `scope_type`, `scope_id`, `title`, `participants`, `context_policy`.
  Lifecycle: opened, resumed, archived, exported.

- Session
  Definition: active UI state for an opened app or shell surface.
  Why: restore continuity without mixing app internals.
  Scope: shell-managed, app-bound.
  Required fields: `session_id`, `app_id`, `route`, `panel_state`, `last_active_at`.
  Lifecycle: created on open, backgrounded, restored, discarded.

- App
  Definition: first-party or trusted packaged product inside the shell.
  Why: preserve clear product boundaries.
  Scope: global registry entry.
  Required fields: `app_id`, `label`, `version`, `capabilities`, `nav_entry`, `contracts`.
  Lifecycle: installed, updated, disabled, removed.

- Panel
  Definition: app-owned sub-surface such as detail, inspector, composer, or results view.
  Why: complex apps need structure without shell pollution.
  Scope: app-scoped.
  Required fields: `panel_id`, `app_id`, `kind`, `entity_ref`, `state`.
  Lifecycle: transient within a session.

- Run
  Definition: one explicit execution instance.
  Why: trust, observability, approvals, evidence.
  Scope: global registry, app-attributed.
  Required fields: `run_id`, `workspace_id`, `origin_scope`, `app_id`, `status`, `intent`, `result_summary`, `evidence_refs`.
  Lifecycle: created, queued, running, waiting approval, completed/failed, archived.

- Task
  Definition: user-visible unit of work that may spawn runs.
  Why: users track outcomes, not runtime fragments.
  Scope: app-scoped with global references.
  Required fields: `task_id`, `app_id`, `title`, `status`, `owner_profile_id`, `linked_run_ids`.
  Lifecycle: created, active, completed, dismissed, archived.

- Workflow
  Definition: repeatable multi-step automation or structured sequence.
  Why: encode repeatable work without hiding execution.
  Scope: app-scoped, registered globally.
  Required fields: `workflow_id`, `app_id`, `trigger`, `steps`, `policy`, `enabled`.
  Lifecycle: drafted, approved, active, paused, retired.

- Asset
  Definition: stored output object such as file, image, report, audio, or structured artifact.
  Why: outputs must survive beyond chat.
  Scope: global registry, app-attributed.
  Required fields: `asset_id`, `workspace_id`, `app_id`, `kind`, `uri`, `source_run_id`, `visibility`.
  Lifecycle: created, referenced, versioned, archived, deleted.

- Integration
  Definition: connected external system or provider.
  Why: centralize auth and consent.
  Scope: global with app-scoped permission grants.
  Required fields: `integration_id`, `provider`, `workspace_id`, `scopes`, `status`, `grants`.
  Lifecycle: connected, reauthorized, revoked, removed.

- Approval
  Definition: explicit user authorization gate for a proposed action.
  Why: trust and reversibility.
  Scope: global registry, app-attributed.
  Required fields: `approval_id`, `run_id`, `app_id`, `action_type`, `impact_summary`, `status`.
  Lifecycle: requested, approved/rejected/held, resolved, auditable forever.

- Memory Object
  Definition: durable context item such as preference, note, fact, summary, or relationship.
  Why: avoid stuffing memory into chat transcripts.
  Scope: global registry with scope tags.
  Required fields: `memory_id`, `workspace_id`, `scope_type`, `scope_id`, `kind`, `content`, `source_refs`, `confidence`.
  Lifecycle: created, updated, invalidated, archived.

- Command
  Definition: typed or spoken intent submitted through shell or app.
  Why: unify intent capture without making all execution global.
  Scope: both.
  Required fields: `command_id`, `origin_scope`, `text`, `attachments`, `routing_policy`.
  Lifecycle: captured, routed, executed, logged.

- Notification
  Definition: delivered user-facing alert or update.
  Why: proactive behavior must remain controlled and auditable.
  Scope: global inbox entry, app-attributed.
  Required fields: `notification_id`, `app_id`, `type`, `title`, `body`, `target_ref`, `policy_tag`.
  Lifecycle: created, delivered, opened/dismissed, archived.

## 4. CROSS-APP CHAT MODEL

Chat should be both global and app-local, with a hard boundary.

- Global chat
  One primary visible KIN conversation owned by the shell. It is neutral. It can route work into apps, but it does not silently inherit app-local working state.

- App-local chat
  Optional and only when the app genuinely benefits from local conversational control. App chat inherits app context because the user is already inside that app.

Rules:

- Global chat inherits only shell-safe context: active workspace, selected profile, broad memory permissions, and explicit attachments.
- App-local chat inherits app context: current entity, app-local memory, app-local assets, app-specific tools.
- Global chat can hand off into app execution by creating an app-bound command or run with explicit origin metadata.
- App chat must never read another app’s local state unless the user explicitly attaches or references it.
- No silent context bleed. If a finance object is used in Empyralis or vice versa, the system must show the app source and why it is being pulled in.
- No giant universal transcript. Global KIN chat is not the same as every app chat concatenated together.

Prevention of contamination:

- every conversation has `scope_type` and `scope_id`
- every memory object has explicit scope tags
- every run records origin scope and app id
- shell search may surface cross-app objects, but opening them resolves into the owning app, not into a vague global chat blob

## 5. CROSS-APP EXECUTION MODEL

Runs live in a single global run registry, but every run must have an owning app or shell origin.

- Shell-level execution
  Used for global KIN tasks, routing, search, notifications, and shell-owned operations.
- App-level execution
  Used when work is meaningfully inside an app boundary. The run still lands in the global registry, but with an explicit `app_id`, `origin_scope`, and app policy.

Approvals:

- one approval center
- one approval UI pattern
- app-specific copy and impact explanation
- approval payload always includes app origin, affected assets, proposed change, and evidence

Tools and integrations:

- shell exposes integrations as capability grants
- apps request capabilities, not raw credentials
- app execution can only see tools granted to that app and approved for the workspace/profile

Evidence and outputs:

- outputs are stored as assets in the global registry
- every asset carries `app_id`, `source_run_id`, and scope metadata
- app-local rendering stays app-owned

Model/runtime identity:

- visible to the user on every run detail
- includes runtime target, provider/model when relevant, and whether work happened locally or in cloud

What must always be visible:

- what the system understood
- what app owns the run
- what it is doing
- what changed
- what evidence was produced
- what requires approval

## 6. INFORMATION ARCHITECTURE

Top-level shell navigation should be:

- Home
- Apps
- Inbox
- Profile

That is enough.

Structure:

- Home
  Global KIN surface. Daily brief, primary chat entry, active work, recent outputs, and quick approvals.
- Apps
  App switcher and app launcher. Empyralis is first. Future apps appear here when they are real products.
- Inbox
  Global notifications, approvals, activity, and follow-ups. This is the shell-owned proactive layer.
- Profile
  Workspace switcher, identity, settings, trust controls, integrations, devices.

Additional IA decisions:

- App switching model: shell-owned app switcher, not permanent per-app tabs unless the app itself needs them.
- Profile/workspace access: always reachable from top-right shell entry or Profile tab.
- Notifications live in Inbox, not inside random app screens.
- Global assets live in a shell-owned asset registry and open into the owning app.
- App-local assets live inside the app UX but must register globally.
- Universal command palette: yes, shell-owned.
- Global inbox/activity layer: yes, shell-owned, mandatory.
- Spaces: not a permanent shell tab in foundation. Spaces should be a memory construct surfaced from Home, Search, or inside apps, unless usage later proves it deserves top-level placement.

## 7. V1 VS LATER

Must exist now:

- shell navigation
- workspace/profile/session model
- one global KIN chat
- one global inbox/activity layer
- one approval center
- one run registry
- one asset registry
- one integration registry with app-scoped grants
- one app contract interface
- Empyralis as the first real app

Defer:

- multiple visible specialist agents
- cross-user agent-to-agent communication
- marketplace
- third-party app SDK
- shared social graph
- cross-app automation builder UI
- complex windowing or desktop-like multiwindow

Explicitly do not build yet:

- global memory that every app can read by default
- one giant chat transcript across the whole shell
- plugin abstractions for hypothetical future partners
- app-level notification systems that bypass shell inbox
- bespoke approval UX per app

## 8. HARD RISKS

- Super app becomes a messy container
  Danger: users lose mental model and trust.
  Prevention: shell owns only operating concerns; apps own product behavior.

- Chat context bleed across apps
  Danger: app-specific trust collapses.
  Prevention: scoped conversations, scoped memory, explicit handoff objects.

- Global memory corrupts app trust
  Danger: users cannot predict why the system “knows” something.
  Prevention: memory registry with scope tags, provenance, and visible source references.

- Shell owns too much logic
  Danger: every app becomes thin and incoherent.
  Prevention: shell only owns navigation, identity, approvals, inbox, search, run registry, asset registry.

- App fragmentation
  Danger: each app reinvents execution, assets, and trust UI.
  Prevention: shared primitives and shared contracts, not shared product behavior.

- Duplicated execution systems
  Danger: impossible debugging and inconsistent approval behavior.
  Prevention: one run system, one approval system, app-attributed policies.

- Inconsistent approval behavior
  Danger: trust erosion.
  Prevention: approval center stays shell-owned with a fixed contract and one visual language.

## 9. IMPLEMENTATION RECOMMENDATION

Folder and module boundary:

- `src/shell/`
  Navigation, inbox, approvals, profile, global search, session restoration, shell KIN chat.
- `src/platform/`
  Shared primitives, contracts, registries, shared services, event bus, run/asset/integration interfaces.
- `src/apps/empyralis/`
  Empyralis routes, screens, state, queries, execution adapters, app-local assets, app-local chat if needed.
- `src/apps/<future-app>/`
  Same contract, no shell leakage.
- `src/ui/`
  Truly generic design primitives only.

State ownership model:

- shell state for session, workspace, profile, inbox, approval queue, app session registry
- app-local state for app screens, entities, filters, drafts, app-local conversations
- platform registries for runs, assets, integrations, memory objects

Routing and session model:

- Expo Router shell routes for `home`, `apps`, `inbox`, `profile`
- app host route pattern like `/app/[appId]/*`
- shell restores last session per app, but never restores app state into another app

Data model separation:

- `shell` entities: workspace, profile, session, notification, approval, search index
- `platform` entities: run, asset, integration, memory object, command
- `app` entities: domain records, app views, app-local tasks, app-local conversations

Shared services layer:

- session service
- run service
- asset service
- integration service
- approval service
- notification service
- search/index service

App contract interface:

- app metadata
- navigation entry
- searchable entities exporter
- execution adapter
- asset renderer registrations
- notification type declarations
- approval copy/impact formatter

Event model:

- centralized event bus for `run.created`, `run.updated`, `approval.requested`, `approval.resolved`, `asset.created`, `notification.created`
- apps subscribe to platform events through typed adapters, not direct store coupling

Centralize:

- routing
- session/profile/workspace
- inbox
- approvals
- run registry
- asset registry
- integration registry
- search

Keep app-local:

- domain UX
- domain state
- domain memory interpretation
- domain workflows
- app-local chat
- app-local entities and rendering

Concrete refactor suggestion for current codebase:

- move `src/lib/session*.ts` into `src/shell/session/`
- move `src/lib/notifications.ts` into `src/shell/notifications/`
- move `src/lib/mobile-data.ts` into `src/apps/empyralis/data/`
- move `src/stores/chatStore.ts` into `src/apps/empyralis/state/`
- replace `src/lib/spaces.ts` with either `src/platform/memory/` or app-local spaces depending on final product ownership
- stop using `src/screens/*` as a mixed global bucket; split into shell screens and app screens

## 10. FINAL DECISION

The right shape is:

- one calm shell
- one primary visible KIN agent
- one real app, Empyralis
- hard contracts for runs, approvals, assets, integrations, and notifications
- app-local behavior kept inside the app

What should be shared:

- workspace
- profile
- session
- inbox
- approvals
- run registry
- asset registry
- integration registry
- global search

What should stay separate:

- app chat
- app memory interpretation
- app workflows
- app entities
- app UI structure
- app execution semantics

What should be killed early:

- visible multi-agent sprawl in the shell
- generic marketplace abstractions
- one giant cross-app chat
- shell-owned business logic for every app
- speculative social/agent-to-agent systems

Bluntly: build a shell with trust primitives and one strong app, not a bloated “platform for everything.” If Empyralis stays coherent and the shell stays disciplined, the super app can grow. If the shell swallows app logic now, the whole product will become vague and untrustworthy.
