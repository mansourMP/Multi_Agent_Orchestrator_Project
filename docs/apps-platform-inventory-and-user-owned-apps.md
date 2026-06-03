# Apps Platform Inventory and User-Owned Apps Brief

Date: 2026-05-31

This document describes the app-related platform surfaces currently visible in the repository and records the requirements implied by making user-owned apps a first-class product area.

The document is intentionally unopinionated. It separates observed implementation from candidate requirements and open questions. It does not assign priority, ownership, or release order.

## Scope

This document covers:

- Workspace Applications.
- Hosted mini-apps.
- Marketplace app publishing and installation.
- Extension and connected-app boundaries.
- App runtime contracts and bridge contracts.
- Mobile app registry client coverage.
- Security, permissions, AI usage, and audit considerations.
- Candidate capabilities for people to create, install, manage, and operate their own apps.

This document does not cover:

- Full Agent Studio specialist-agent design, except where Marketplace overlaps.
- General MCP/plugin/skill distribution, except where it affects app packages.
- Landing page design.
- Rust migration architecture.
- Billing implementation outside app-specific usage and marketplace package metadata.

## Source files inspected

Primary files:

- `docs/extension-manifest-contract.md`
- `docs/studio-marketplace-ux-boundary-2026-04-30.md`
- `shared/nav-manifest.js`
- `shared/mini-app-sdk.js`
- `config/application_runtime_contract_map.json`
- `frontend/lib/workspace/hosted-mini-apps-pane.tsx`
- `frontend/lib/workspace/hosted-mini-app-surface.tsx`
- `frontend/lib/workspace/application-surface-tabs.ts`
- `frontend/lib/marketplace/marketplace-pane.tsx`
- `frontend/app/(account)/w/[workspaceId]/WorkspaceSurfacePage.tsx`
- `frontend/app/(account)/w/[workspaceId]/applications/page.tsx`
- `server_modules/mini_apps_service.py`
- `server_modules/mini_app_host_service.py`
- `server_modules/routes_mini_apps.py`
- `server_modules/app_bridge_service.py`
- `server_modules/routes_marketplace.py`
- `server_modules/marketplace_distribution_service.py`
- `mobile/src/lib/appRegistryApi.ts`

Secondary evidence:

- `server_modules/tests/test_routes_mini_apps.py`
- `server_modules/tests/test_app_bridge_smoke.py`
- `server_modules/tests/test_deployed_agent_runtime_contract_service.py`
- `docs/DECISIONS.md`
- `docs/channel-foundation-strategy.md`
- `docs/frontend-map.md`

## Current terminology

The repository uses several terms that are related but not identical.

### Application

Observed meaning:

- A workspace-level product surface under the Applications destination.
- May represent a private URL app, a hosted app, a platform app, or a marketplace app package.
- Appears in workspace navigation as `Applications`.
- Appears in route definitions through the shared navigation manifest.

Current source anchors:

- `shared/nav-manifest.js`
- `frontend/lib/workspace/hosted-mini-apps-pane.tsx`
- `server_modules/mini_apps_service.py`
- `server_modules/marketplace_distribution_service.py`

### Mini-app

Observed meaning:

- A workspace-scoped app contract stored and served through `/api/workspaces/{workspace_id}/mini-apps`.
- Can be structured first-party app state, a hosted remote app, or a private app.
- Has app-specific records, summaries, events, permissions, AI policy, trust tier, delivery mode, and bridge contracts.

Current source anchors:

- `server_modules/mini_apps_service.py`
- `server_modules/routes_mini_apps.py`
- `server_modules/mini_app_host_service.py`
- `shared/mini-app-sdk.js`
- `mobile/src/lib/appRegistryApi.ts`

### Hosted mini-app

Observed meaning:

- A mini-app delivered by a remote `hosted_url`.
- Embedded by iframe or webview.
- Uses launch tokens, allowed origins, bridge nonces, and explicit bridge contracts.

Current source anchors:

- `server_modules/mini_app_host_service.py`
- `server_modules/routes_mini_apps.py`
- `shared/mini-app-sdk.js`
- `frontend/lib/workspace/hosted-mini-app-surface.tsx`

### Private app

Observed meaning:

- A user/workspace-created app, currently publishable from the Applications surface with name, app URL, and optional icon URL.
- Current UI copy indicates it goes live instantly with no review and no config, with scoped permissions to be added later.
- Runtime type defaults to `private` unless the app is first-party.

Current source anchors:

- `frontend/lib/workspace/hosted-mini-apps-pane.tsx`
- `server_modules/mini_apps_service.py`

### Link app

Observed meaning:

- A marketplace/application record that opens an external URL.
- Runtime type is `link`.
- Preview marketplace seed data includes link apps such as Telegram, Instagram, and Slack.
- The installed Applications grid currently filters `runtime_type === "link"` out of the hosted mini-app listing.

Current source anchors:

- `server_modules/marketplace_distribution_service.py`
- `frontend/lib/workspace/hosted-mini-apps-pane.tsx`

### Community app

Observed meaning:

- A marketplace-submitted or publisher-hosted app.
- Runtime type aliases such as `hosted`, `remote`, `publisher_hosted`, `local_runtime`, `agent_computer`, `user_hardware`, and `hybrid` are normalized into `community`.

Current source anchors:

- `server_modules/mini_apps_service.py`
- `server_modules/marketplace_distribution_service.py`

### Platform app

Observed meaning:

- A first-party or Empyralis-hosted app.
- First-party mini-app IDs currently include `calorie_tracking` and `flashcards`.
- Runtime type defaults to `platform` for first-party IDs.

Current source anchors:

- `server_modules/mini_apps_service.py`
- `frontend/lib/workspace/hosted-mini-apps-pane.tsx`
- `server_modules/routes_mini_apps.py`

### Connected app

Observed meaning:

- A work system an agent can read, write, or act inside.
- Connected apps are explicitly not personal messaging channels and not Agent Computer bridges.
- Examples in the extension contract include GitHub, Linear, Notion, Gmail, Calendar, Microsoft 365, and webhooks.

Current source anchors:

- `docs/extension-manifest-contract.md`
- `docs/channel-foundation-strategy.md`

### Extension

Observed meaning:

- An installable adapter package.
- It may provide messaging channels, connected apps, tool providers, runtime capabilities, or external sections.
- It is not an agent by default.
- It cannot inject arbitrary frontend code.

Current source anchors:

- `docs/extension-manifest-contract.md`

### Marketplace package

Observed meaning:

- A governed distribution record.
- Supported package kinds include `agent_template`, `app`, `connector`, `mini_app`, `provider`, and `skill`.
- Install target depends on package kind.

Current source anchors:

- `server_modules/routes_marketplace.py`
- `server_modules/marketplace_distribution_service.py`
- `frontend/lib/marketplace/marketplace-pane.tsx`

## Current product surfaces

## Workspace navigation

Observed:

- `Applications` is a first-class workspace destination.
- `Discover` is a separate workspace destination for Marketplace.
- `Agents` is separate from both Applications and Discover.
- `Agent Computer` is a separate destination.

Implication:

- The platform already has top-level IA separation between apps, marketplace discovery, agents, and runtime/hardware.
- The app-platform work should not collapse these surfaces into one generic "plugins" page without a deliberate navigation decision.

## Applications surface

Observed:

- The Applications page is rendered through the workspace surface page and `HostedMiniAppsPane`.
- It has at least two tab states: installed apps and `my_apps`.
- Installed apps load from `/api/workspaces/{workspace_id}/mini-apps`.
- Items with `install_status === "removed"` are filtered out.
- Items with `runtime_type === "link"` are filtered out of this installed mini-app listing.
- Official first-party mini-app cards are defined for Flashcards and Calorie Tracker.
- A private app publishing panel accepts:
  - App name.
  - App URL.
  - Icon URL.
- Private app URL and icon URL require HTTPS, with localhost allowed only in development.

Current limitations visible from this surface:

- Private app creation does not collect permissions.
- Private app creation does not collect bridge contracts.
- Private app creation does not collect AI policy.
- Private app creation does not collect allowed origins separately from app URL.
- Private app creation does not display a manifest preview.
- Private app creation does not show a test sandbox.
- Private app creation does not expose review state.
- Link apps are not shown in the installed mini-app grid.

## Hosted mini-app surface

Observed:

- Hosted apps are embedded through an app surface.
- Manifest details include hosted app metadata, app category, allowed origins, bridge configuration, and launch metadata.
- The hosted app bridge uses browser postMessage.
- The SDK exposes `EmpyralisApp`.

Current SDK capabilities:

- `ready()`
- `onReady(fn)`
- `getRuntime()`
- `readRecords(filters)`
- `writeRecord(record)`
- `getSummary()`
- `invokeAI(prompt, options)`
- `requestSage(payload)`
- `on(eventType, fn)`
- `off(eventType, fn)`

Current SDK message types:

- `empyralis.hosted_app.bridge.ready`
- `empyralis.hosted_app.bridge.request`
- `empyralis.hosted_app.bridge.response`

Current SDK timeout:

- Bridge requests time out after 15 seconds.

## Marketplace surface

Observed:

- Marketplace is described as a discovery and install surface for reusable packages, providers, mini-apps, and third-party templates.
- Developer publishing is intentionally behind an explicit panel.
- Marketplace package records can represent `agent_template`, `skill`, `connector`, `bundle`, `app`, `mini_app`, and `provider` in the frontend model.
- The primary visible filter list in `marketplace-pane.tsx` contains `agent_template`, `skill`, `connector`, and `bundle`.
- App publishing composer support exists separately through `COMPOSER_KINDS = ["app"]`.
- App details handling exists for `app` and `mini_app` kinds.
- Marketplace route handlers support app registration, provider registration, review, installation, runtime event recording, and review queue listing.

Marketplace app submission fields visible in the frontend model include:

- Label.
- Description.
- Category.
- Publisher label.
- Publisher website.
- Publisher domain.
- Docs URL.
- Support URL.
- Privacy URL.
- Terms URL.
- Verification status.
- Review state.
- Health state.
- Policy posture.
- Monetization kind.
- Revenue share basis points.
- Billing product ID.
- Settlement provider.
- Ledger key.
- Accounting hook kind.
- Approval required.
- App ID.
- Hosted URL.
- Icon URL.
- Version.
- Permissions.
- Allowed origins.
- Bridge contracts.

Backend package kinds:

- `agent_template`
- `app`
- `connector`
- `mini_app`
- `provider`
- `skill`

Backend review states:

- `pending`
- `approved`
- `rejected`
- `restricted`

Backend verification statuses:

- `unverified`
- `partner`
- `verified`

Backend health states:

- `healthy`
- `degraded`
- `setup_required`

Backend policy postures:

- `governed`
- `restricted`

Backend monetization kinds:

- `free`
- `metered`
- `subscription`
- `revenue_share`

## Extension boundary

Observed hard rules:

- Browser never calls third-party or local bridge endpoints directly.
- Raw secrets are stored only as `secret_ref`.
- Extensions cannot grant native Studio-agent privileges.
- Extensions cannot add raw HTML or JavaScript to product UI.
- Custom UI must use schema-rendered sections first.
- Rich UI later requires a sandboxed iframe with a strict allowlist.
- Messaging channels are audited as conversation ingress/egress.
- Connected apps are audited as work-system reads/writes/actions.
- Agent Computer runtime capabilities are selected explicitly and remain revocable.

Implication:

- User-owned apps can exist, but any rich UI or third-party execution path must keep the browser, secrets, agent privileges, and bridge endpoints behind product-controlled boundaries.

## Current backend app contracts

## Mini-app state

Observed:

- Mini-app state is workspace scoped.
- State is stored through `workspace_context.workspace_scope_dir(workspace_id) / "mini_apps.json"`.
- Default state includes a version, updated timestamp, and app map.

Default app entry fields include:

- `id`
- `label`
- `description`
- `icon_url`
- `category`
- `publisher_id`
- `publisher_name`
- `publisher_domain`
- `support_url`
- `privacy_url`
- `terms_url`
- `runtime_type`
- `runtime_mode`
- `destination_url`
- `platform_route`
- `verification_status`
- `official_claim`
- `domain_proof`
- `delivery_mode`
- `visibility`
- `install_status`
- `hosted_url`
- `embed_kind`
- `allowed_origins`
- `bridge_contracts`
- `permissions`
- `trust_tier`
- `background_ai_allowed`
- `runtime_access`
- `ai_invoke_policy`
- `context_envelope`
- `current_state`
- `recent_events`
- `daily_summary`
- `weekly_summary`
- `long_term_facts`
- `records`
- `updated_at`

## Runtime types

Observed runtime types:

- `link`
- `platform`
- `community`
- `private`

Observed aliases:

- `url`, `external`, and `external_link` map to `link`.
- `first_party`, `platform_hosted`, and `empyralis` map to `platform`.
- `remote`, `hosted`, `hosted_url`, `remote_server`, and `publisher_hosted` map to `community`.
- Legacy/local tokens such as `local`, `local_runtime`, `agent_computer`, `user_hardware`, `customer_local`, and `hybrid` map to `community`.
- `workspace_private` maps to `private`.

## Trust tiers

Observed trust tiers:

- `user_private`
- `first_party`
- `reviewed_partner`
- `public_untrusted_url`

Observed defaults:

- First-party mini-app IDs default to `first_party`.
- Other apps default to `user_private`.

## Delivery modes

Observed delivery modes:

- `structured`
- `hosted`

Observed behavior:

- If `hosted_url` exists, delivery mode defaults to `hosted`.
- Hosted delivery requires `hosted_url`.
- Non-hosted apps can use structured platform routes and state.

## Embed kinds

Observed embed kinds:

- `iframe`
- `webview`

Default:

- `iframe`

## Hosted URL and origin rules

Observed:

- Hosted URLs must be absolute HTTP(S) URLs.
- HTTPS is required except for local development hosts.
- Local development hosts can include localhost, loopback, and `.local` if local dev is enabled.
- Hosted URLs cannot target private or unsupported hosts unless they are local development hosts.
- Allowed origins are normalized from the hosted URL and explicit `allowed_origins`.

## Hosted launch token

Observed:

- Hosted apps use a server-issued launch token.
- Token payload is bound to:
  - workspace ID.
  - app ID.
  - user ID.
  - install ID.
  - origin.
  - bridge nonce.
  - issued-at timestamp.
  - expiration timestamp.
  - unique token ID.
- Default launch token TTL is 5 minutes.
- Production requires `EMPYRALIS_MINI_APP_LAUNCH_SECRET` or equivalent configured secret.
- Weak launch secrets are rejected in production.

## Hosted iframe restrictions

Observed:

- Default iframe sandbox tokens:
  - `allow-forms`
  - `allow-modals`
  - `allow-scripts`
- Default iframe allow list is empty.
- Same-origin iframe privileges are not default.
- Same-origin allowance depends on a verified bridge contract policy.

## App permissions

Observed app permission classes:

- `app.summary.read`
- `app.records.read.raw`
- `app.records.write`
- `app.profile.write`
- `app.ai.invoke`
- `app.bridge.sage.request`
- `app.bridge.specialist.request`
- `app.connector.invoke`

Observed bridge permission mapping:

- `app_to_sage` requires `app.bridge.sage.request`.
- `app_to_specialist` requires `app.bridge.specialist.request`.
- `app_to_connector_runtime` requires `app.connector.invoke`.

## Bridge contract map

Observed bridge kinds and types:

`app_to_sage`:

- `summary_request`
- `context_import_request`
- `recommendation_request`
- `delegation_request`

`app_to_specialist`:

- `task_request`
- `artifact_request`
- `status_request`

`sage_to_app`:

- `launch_app_flow`
- `handoff_to_app`
- `request_app_action`

`app_to_connector_runtime`:

- `brokered_connector_action`
- `brokered_workflow_runtime`
- `brokered_structured_backend_route`

## Context envelope

Observed default classes:

- `user_selected_inputs`
- `app_owned_history`
- `scoped_documents_and_data`
- `app_workflow_state`

Observed optional classes:

- `explicit_imports_from_sage`
- `explicit_summaries_from_specialists`
- `explicit_shared_artifacts`

Observed inheritance rules:

- Apps do not inherit Sage memory by default.
- Apps do not inherit specialist memory by default.

## Denied direct capabilities

Observed denied-by-default capabilities:

- `read_sage_memory`
- `read_specialist_memory`
- `access_user_private_context_without_explicit_contract`
- `call_unrestricted_tools_outside_app_policy`
- `silently_impersonate_sage`
- `silently_impersonate_specialist`

## Forbidden bridge fields and actions

Observed forbidden implicit metadata keys include:

- `captain_context`
- `captain_identity`
- `captain_profile`
- `sage_context`
- `sage_memory`
- `specialist_context`
- `specialist_memory`
- `specialist_mode`
- `specialist_mode_contract`
- `private_context`
- `personal_context`
- `unified_memory`
- `raw_context_imports`
- `implicit_memory_imports`

Observed forbidden bridge fields include:

- `memory_scope`
- `memory_query`
- `memory_bucket`
- `raw_memory`
- `private_context`
- `captain_memory`
- `specialist_memory`
- `screenshot`
- `computer`
- `shell`
- `mcp`
- `skill`
- `local_companion`
- `runtime_session_id`
- `runtime_target`
- `tool_call`
- `tool_calls`

Observed forbidden bridge action values include:

- `screenshot`
- `screenshot.capture`
- `computer`
- `computer.click`
- `computer_control.click`
- `shell`
- `shell.run`
- `terminal`
- `terminal.exec`
- `mcp`
- `mcp.invoke`
- `skill`
- `skill.execute`
- `codex_cli`
- `claude_code_cli`
- `local_companion`

## App-to-Sage bridge rule

Observed:

- Hosted mini-apps cannot invoke Sage turns by default.
- A verified bridge contract must explicitly enable app-to-Sage execution.
- App bridge requests are audited.

## Mini-app APIs

Routes observed in `server_modules/routes_mini_apps.py`:

### Public/share

- `GET /api/mini-apps/share/{share_token}`

### Contracts

- `GET /api/workspaces/{workspace_id}/mini-apps`
- `GET /api/workspaces/{workspace_id}/mini-apps/{app_id}`
- `PUT /api/workspaces/{workspace_id}/mini-apps/{app_id}`
- `POST /api/workspaces/{workspace_id}/mini-apps/publish`

### Sharing

- `POST /api/workspaces/{workspace_id}/mini-apps/{app_id}/share-link`
- `POST /api/workspaces/{workspace_id}/mini-apps/install-shared`

### Records

- `POST /api/workspaces/{workspace_id}/mini-apps/{app_id}/records/retrieve`

### Hosted runtime

- `GET /api/workspaces/{workspace_id}/mini-apps/{app_id}/hosted-manifest`
- `POST /api/workspaces/{workspace_id}/mini-apps/{app_id}/active-session`
- `POST /api/workspaces/{workspace_id}/mini-apps/{app_id}/bridge/messages`

### AI invoke

- `POST /api/workspaces/{workspace_id}/mini-apps/{app_id}/invoke`

### First-party mini-app routes

- `POST /api/workspaces/{workspace_id}/mini-apps/calorie_tracking/events`
- `PUT /api/workspaces/{workspace_id}/mini-apps/calorie_tracking/goals`
- `GET /api/workspaces/{workspace_id}/mini-apps/calorie_tracking/overview`
- `POST /api/workspaces/{workspace_id}/mini-apps/flashcards/cards`
- `POST /api/workspaces/{workspace_id}/mini-apps/flashcards/generate`
- `PUT /api/workspaces/{workspace_id}/mini-apps/flashcards/decks`
- `POST /api/workspaces/{workspace_id}/mini-apps/flashcards/reviews`
- `GET /api/workspaces/{workspace_id}/mini-apps/flashcards/overview`
- `POST /api/workspaces/{workspace_id}/mini-apps/flashcards/records`

## Mini-app AI usage gates

Observed:

- AI invoke requires an installed mini-app contract.
- AI invoke requires explicit permission `app.ai.invoke`.
- AI invoke requires first-run consent when consent is required.
- AI invoke requires a positive monthly credit cap.
- AI invoke requires a positive per-invocation credit cap.
- BYOK/local AI routing is not enabled for mini-app invoke yet.
- AI invoke normally requires an active open app session.
- Background invoke is separately gated by app policy.
- Usage is prepared, persisted, and debited through hosted AI usage accounting.

Observed default policy:

- `consent_required: true`
- `consent_status: not_granted`
- `payer: platform_credits`
- `monthly_credit_cap: 500`
- `per_invocation_credit_cap: 50`

Important invariant:

- Explicit zero caps must remain zero, because zero can represent disabled AI spend.

## Rate limits

Observed environment-backed defaults:

- `ORION_MINI_APP_BRIDGE_RATE_LIMIT_PER_MINUTE`: default `60`.
- `ORION_MINI_APP_INVOKE_RATE_LIMIT_PER_MINUTE`: default `90`.
- `EMPYRALIS_MINI_APP_ACTIVE_SESSION_TTL_SECONDS`: default `2 hours`.

## Marketplace APIs

Routes observed in `server_modules/routes_marketplace.py`:

### Public agent marketplace

- `GET /api/marketplace/agents`
- `POST /api/marketplace/upgrade-click`

### Workspace marketplace packages

- `GET /api/workspaces/{workspace_id}/marketplace/packages`
- `GET /api/workspaces/{workspace_id}/marketplace/app-submissions`
- `POST /api/workspaces/{workspace_id}/marketplace/providers`
- `POST /api/workspaces/{workspace_id}/marketplace/apps`
- `POST /api/workspaces/{workspace_id}/marketplace/packages/{package_id}/review`
- `POST /api/workspaces/{workspace_id}/marketplace/packages/{package_id}/install`
- `POST /api/workspaces/{workspace_id}/marketplace/packages/{package_id}/runtime-events`

### Studio templates exposed through marketplace routes

- `GET /api/workspaces/{workspace_id}/studio/templates`
- `GET /api/workspaces/{workspace_id}/studio/templates/shop-assistant/revenue-proof`

## Marketplace package distribution model

Observed package kinds:

- `agent_template`
- `app`
- `connector`
- `mini_app`
- `provider`
- `skill`

Observed install targets:

- `agent_template` installs to `template_catalog`.
- `app` installs to `app_registry`.
- `connector` installs to `connector_catalog`.
- `mini_app` installs to `mini_app_registry`.
- `provider` installs to `provider_catalog`.
- `skill` installs to `skill_catalog`.

Observed marketplace validation concepts:

- Review state.
- Verification status.
- Health state.
- Policy posture.
- Monetization kind.
- Runtime requirements.
- Artifact types.
- Excessive permission markers.
- Maximum permission count.
- Maximum domain count.

Observed excessive permission markers:

- `*`
- `admin:*`
- `shell:execute`
- `filesystem:write`
- `computer_control`
- `payment:execute`

## Mobile app coverage

Observed mobile client APIs:

- `getInstalledApps()`
- `getPlatformStoreApps()`
- `getPlatformAppManifest()`
- `getAppUpdates()`
- `getAppManifest()`
- `listMiniApps()`
- `getMiniAppContract()`
- `registerMiniAppContract()`
- mini-app share preview and install.
- mini-app invoke.
- active mini-app session.
- first-party calorie tracking and flashcard routes.

Observed mobile contract fields:

- `delivery_mode`
- `visibility`
- `install_status`
- `memory_scope`
- `trust_tier`
- `background_ai_allowed`
- `runtime_access`
- `permissions`
- `ai_invoke_policy`
- `hosted_url`
- `hosted_app`
- `public_distribution`
- `updated_at`

## Current app lifecycle paths

## Private app path

Observed path:

1. User opens Applications.
2. User opens `my_apps`.
3. User enters app name, URL, and optional icon URL.
4. Frontend validates URL scheme.
5. Frontend calls `POST /api/workspaces/{workspace_id}/mini-apps/publish`.
6. App is added to local Applications state.
7. User is returned to installed tab.

Observed missing lifecycle steps:

- Manifest review.
- Permission selection.
- AI spend policy selection.
- Origin preview.
- Hosted bridge contract selection.
- Sandbox test.
- Runtime health check.
- App versioning.
- Rollback.
- Install/uninstall management.
- App ownership transfer.
- App analytics.
- App audit log view.

## Hosted app path

Observed path:

1. App contract includes `hosted_url`.
2. Backend normalizes hosted URL and allowed origins.
3. Backend builds hosted manifest.
4. Backend issues launch token and bridge nonce.
5. Host embeds app through iframe or webview.
6. App calls `EmpyralisApp.ready()`.
7. App uses bridge request messages for runtime, records, AI, or Sage requests.
8. Backend validates token, nonce, origin, bridge kind, bridge type, permissions, and contract.
9. Backend records bridge audit.

Observed missing lifecycle steps:

- Developer-facing hosted app quickstart.
- Local development tunnel workflow.
- App manifest linting CLI or UI.
- Test harness for SDK calls.
- Bridge contract simulator.
- Public docs for each bridge kind.
- Per-app error dashboard.

## Marketplace app path

Observed path:

1. User/developer opens Discover.
2. Developer/admin opens publish panel.
3. App metadata is submitted to `POST /api/workspaces/{workspace_id}/marketplace/apps`.
4. App submission enters review state.
5. Owner can list app submissions.
6. Owner can review package.
7. Member can install eligible package.
8. Runtime events can be recorded.

Observed missing lifecycle steps:

- Public app detail page for submitted app.
- Normal user browsing of app packages in default marketplace filters.
- Publisher portal separated from normal marketplace browsing.
- App package release channels.
- Version diff.
- Review checklist.
- Security scan result display.
- Revenue-share onboarding workflow.
- Support/contact workflow.

## Observed fragmentation points

These are descriptive inconsistencies or split models observed in the current code.

### Applications vs mini-apps

The visible product label is `Applications`, while the backend and mobile API use `mini-apps` for the main workspace app contract. This can be acceptable internally, but product copy and developer docs need a single public noun.

### Marketplace apps vs Applications apps

Marketplace supports app packages and app submissions. Applications supports installed/private mini-app contracts. The exact handoff between installing a marketplace `app` package and seeing it in the Applications surface depends on the install target and registry integration.

### Link apps exist but are filtered from installed Applications

Marketplace seed packages include link apps. The installed Applications list filters out `runtime_type === "link"`. This creates a distinction between link apps and launchable installed apps.

### App and mini-app package kinds both exist

Marketplace supports both `app` and `mini_app`. Their product difference should be documented before expanding user-owned apps.

### App publishing exists in Marketplace and Applications

Applications has a private app publish form. Marketplace has an app composer/submission flow. These likely serve different audiences, but the current product model needs a clear distinction.

### Runtime type aliases collapse local/hybrid terms into community

Tokens such as `local_runtime`, `agent_computer`, `user_hardware`, and `hybrid` normalize to `community`. This may be intentional to prevent apps from directly owning local runtime authority, but developer-facing docs need to explain how a user-owned app can request brokered runtime actions without becoming Agent Computer itself.

### App bridge has strong backend boundaries but thin public docs

The bridge contract map is concrete. The public/developer experience around it appears less complete than the backend enforcement.

### AI permission model exists but private app UI does not expose it

The backend has explicit AI permission, consent, cap, session, and ledger gates. The private app publish UI does not expose those controls.

## User-owned app requirements inventory

The following requirements are derived from existing contracts and the goal of allowing people to have their own apps in the platform.

## User-facing requirements

Users should be able to:

- See installed apps.
- Open installed apps.
- Add a private app from a URL.
- Understand whether an app is first-party, private, reviewed partner, or public untrusted URL.
- See what an app can access.
- See whether an app can spend AI credits.
- See app monthly and per-invocation AI caps.
- Turn app AI access on or off.
- Revoke an app.
- Remove an app.
- Share an app privately through an unlisted link if allowed.
- Install a shared app.
- See app health.
- See app activity.
- See app bridge/audit history.
- Know whether Sage can call the app.
- Know whether the app can request Sage.
- Know whether the app can use connectors, records, or app-owned state.

## Developer-facing requirements

Developers should be able to:

- Create a draft app manifest.
- Register app identity.
- Add hosted URL.
- Add icon and screenshots.
- Add docs/support/privacy/terms links.
- Select runtime type.
- Select delivery mode.
- Configure allowed origins.
- Configure bridge contracts.
- Configure permissions.
- Configure AI policy.
- Configure context envelope.
- Validate hosted URL and origins.
- Test embedded launch.
- Test SDK ready event.
- Test records read/write.
- Test AI invoke.
- Test app-to-Sage requests.
- Test Sage-to-app handoff.
- Preview permission prompts.
- Submit for review.
- Publish privately without marketplace review.
- Submit to marketplace with review.
- Release app versions.
- Roll back app versions.
- View runtime events.
- View bridge audit logs.
- View install counts.
- View usage and billing metadata.

## Admin/reviewer requirements

Workspace owners or platform reviewers should be able to:

- List pending app submissions.
- Review manifest fields.
- Review allowed origins.
- Review permissions.
- Review bridge contracts.
- Review AI policy.
- Review monetization metadata.
- Review excessive permission markers.
- Approve, reject, or restrict an app.
- Add review reason.
- Assign verification status.
- See app health state.
- See runtime events.
- Force-disable app.
- Revoke app bridge.
- Revoke app AI.
- Roll back app version.

## Platform security requirements

The platform should preserve:

- No raw third-party JavaScript injection into product UI outside sandboxed surfaces.
- No browser direct calls to third-party/local bridge endpoints.
- No raw secret storage outside `secret_ref`.
- No implicit Sage memory access.
- No implicit specialist memory access.
- No direct shell/computer/MCP/tool bridge fields.
- HTTPS-only hosted apps except local development.
- Private/internal URL blocking for hosted apps.
- Origin allowlisting.
- Short-lived launch tokens.
- Bridge nonce verification.
- Explicit permissions for bridge directions.
- Explicit verified contract for hosted app-to-Sage execution.
- Audit log for bridge requests.
- Rate limits for app bridge and AI invoke.
- Credit caps for AI usage.
- First-run consent for AI spend when required.

## Candidate product model

This section records a possible neutral model using existing concepts. It does not prescribe naming.

### App classes

`Platform app`:

- Built and operated by Empyralis.
- Can use internal platform routes.
- May have first-party trust tier.

`Private app`:

- Created by a workspace user.
- Visible only in that workspace unless shared.
- Can be URL-only, hosted, or structured depending on manifest.

`Shared private app`:

- Created in one workspace.
- Distributed through unlisted share token.
- Installed by another workspace/user with explicit acceptance.

`Marketplace app`:

- Submitted through marketplace package flow.
- Reviewed by owner/platform.
- Installable from Discover.

`Link app`:

- Opens an external URL.
- Does not receive app bridge access by default.
- Does not need hosted iframe unless product decides to embed it.

`Connected app`:

- External work system integrated through connector/extension.
- Used by agents as a read/write/action target.
- Should not be presented as the same thing as an app UI unless product intentionally merges them.

`Runtime capability`:

- Agent Computer or local bridge capability.
- Can be requested by an app only through brokered app-to-connector/runtime contracts.

### App lifecycle states

Possible state set:

- `draft`
- `private_installed`
- `submitted`
- `review_pending`
- `approved`
- `restricted`
- `rejected`
- `installed`
- `disabled`
- `removed`

Current implementation partially covers:

- `pending`
- `approved`
- `rejected`
- `restricted`
- `installed`
- `removed`

### App visibility states

Possible state set:

- `workspace_private`
- `unlisted_link`
- `marketplace_private_review`
- `marketplace_public`
- `platform_first_party`

Current implementation partially covers:

- `workspace_private`
- `unlisted_link`

### Runtime modes

Existing runtime modes can be mapped to user language:

- `link`: opens an external URL.
- `private`: workspace-owned app.
- `community`: publisher-hosted or externally hosted app.
- `platform`: first-party app.

Additional display labels may be needed for:

- URL-only app.
- Embedded hosted app.
- Platform app.
- Marketplace app.
- Brokered local/hybrid app.

## Candidate manifest shape

This shape is assembled from fields already present across the repository.

```json
{
  "schema_version": "empyralis.app.v1",
  "app_id": "customer_portal",
  "label": "Customer Portal",
  "description": "Workspace-owned customer workflow app.",
  "category": "Operations",
  "publisher": {
    "publisher_id": "workspace_or_partner_id",
    "publisher_name": "Example Publisher",
    "publisher_domain": "example.com",
    "website": "https://example.com"
  },
  "links": {
    "icon_url": "https://example.com/icon.png",
    "docs_url": "https://example.com/docs",
    "support_url": "https://example.com/support",
    "privacy_url": "https://example.com/privacy",
    "terms_url": "https://example.com/terms"
  },
  "runtime": {
    "runtime_type": "private",
    "delivery_mode": "hosted",
    "hosted_url": "https://apps.example.com/customer-portal",
    "embed_kind": "iframe",
    "allowed_origins": ["https://apps.example.com"],
    "platform_route": null,
    "destination_url": null
  },
  "permissions": [
    "app.summary.read",
    "app.records.write"
  ],
  "bridge_contracts": {
    "sage_to_app": ["launch_app_flow"],
    "app_to_sage": []
  },
  "context_envelope": {
    "default_classes": [
      "user_selected_inputs",
      "app_owned_history",
      "scoped_documents_and_data",
      "app_workflow_state"
    ],
    "optional_classes": [
      "explicit_imports_from_sage",
      "explicit_shared_artifacts"
    ]
  },
  "ai_invoke_policy": {
    "consent_required": true,
    "consent_status": "not_granted",
    "payer": "platform_credits",
    "monthly_credit_cap": 0,
    "per_invocation_credit_cap": 0
  },
  "distribution": {
    "visibility": "workspace_private",
    "review_state": "pending",
    "verification_status": "unverified",
    "health_state": "setup_required",
    "policy_posture": "governed"
  },
  "billing": {
    "monetization_kind": "free",
    "revenue_share_bps": null,
    "billing_product_id": null,
    "settlement_provider": null,
    "ledger_key": null
  }
}
```

## Candidate pages and UI areas

This section lists possible surfaces without prescribing final UI.

## Applications

Possible tabs:

- Installed.
- My Apps.
- Shared with me.
- Drafts.
- Activity.

Possible installed app card fields:

- App icon.
- App name.
- Runtime label.
- Trust tier.
- Health state.
- Last opened.
- Permissions summary.
- AI access state.
- Open action.
- Details action.
- Remove action.

## My Apps

Possible app creation modes:

- Add link app.
- Add hosted app.
- Create structured app from template.
- Import app manifest.
- Submit marketplace app.

Possible draft editor sections:

- Identity.
- URL and embed.
- Origins.
- Permissions.
- Bridge.
- AI usage.
- Data/records.
- Review and publish.

## App details

Possible detail sections:

- Overview.
- Runtime.
- Permissions.
- AI usage and caps.
- Bridge contracts.
- Data access.
- Activity and audit.
- Versions.
- Sharing.
- Danger zone.

## Developer test harness

Possible test panels:

- URL validation.
- Origin validation.
- Iframe/webview preview.
- SDK ready event.
- Runtime read.
- Records retrieve.
- Records write.
- AI invoke.
- App-to-Sage bridge.
- Sage-to-app bridge.
- Connector/runtime bridge.
- Audit log preview.

## Marketplace

Possible marketplace app areas:

- Discover apps.
- Discover skills.
- Discover connectors.
- Discover agent templates.
- Discover providers.
- Publish/manage packages.
- Review queue.

Possible app package card fields:

- Package kind.
- Runtime type.
- Publisher.
- Verification.
- Review state.
- Health.
- Monetization.
- Required permissions.
- Allowed origins.
- Install eligibility.
- Install blockers.

## Candidate backend consolidation tasks

This section lists implementation tasks that would make the app platform easier to reason about.

### Contract consolidation

- Define one public app manifest contract.
- Map mini-app contracts, marketplace app packages, and app registry records to that contract.
- Keep internal service names if needed, but expose one public developer model.

### Runtime type consolidation

- Document the difference between `link`, `private`, `community`, and `platform`.
- Decide whether `app` and `mini_app` should both remain marketplace package kinds.
- Decide how a marketplace `app` installs into Applications.
- Decide how a marketplace `mini_app` installs into Applications.

### Applications listing consolidation

- Decide whether link apps belong in Applications.
- If link apps stay excluded, show them somewhere else intentionally.
- If link apps are included, provide a launch behavior that does not imply bridge permissions.

### Private app creation expansion

- Add permission selection.
- Add AI access selection.
- Add allowed origin preview.
- Add hosted manifest preview.
- Add SDK/bridge test flow.
- Add app details after creation.

### App bridge developer experience

- Publish bridge contract documentation.
- Add typed SDK definitions.
- Add examples for each bridge kind.
- Add local test harness.
- Add better error messages for unsupported bridge kind/type.
- Add developer-visible audit trace.

### Review and trust

- Add review checklist.
- Add security scan results.
- Add domain proof display.
- Add trust-tier explanation.
- Add app health checks.
- Add force-disable mechanism in UI.

### AI usage controls

- Expose app AI permission.
- Expose monthly cap.
- Expose per-invocation cap.
- Preserve explicit zero caps.
- Display spend source.
- Display recent usage.
- Require active session for foreground invocations.
- Display background invocation policy.

### Marketplace package management

- Add package versioning.
- Add release channels.
- Add rollback.
- Add package owner dashboard.
- Add runtime event dashboard.
- Add install analytics.
- Add support/contact workflow.
- Add revenue-share metadata display if monetization is enabled.

## Candidate acceptance checklist

This checklist describes observable outcomes for a complete user-owned app platform.

### User can install and open apps

- User sees installed apps in Applications.
- User can open platform apps.
- User can open private hosted apps.
- User can open link apps if product includes them in Applications.
- User can remove apps.
- User can see app details.

### User can create private apps

- User can add a URL app.
- User can add a hosted app.
- User can preview app embed.
- User can validate allowed origins.
- User can choose app permissions.
- User can choose AI usage policy.
- User can save as draft.
- User can publish privately.

### Developer can build against the SDK

- Developer can load `EmpyralisApp`.
- Developer can call `ready()`.
- Developer can call runtime read.
- Developer can read/write records with permissions.
- Developer can request AI with explicit policy.
- Developer can request Sage only through verified contract.
- Developer can receive Sage-to-app handoff.
- Developer can test bridge errors.

### Admin can govern apps

- Admin can see app submissions.
- Admin can review permissions.
- Admin can review origins.
- Admin can review bridge contracts.
- Admin can approve/reject/restrict.
- Admin can disable installed app.
- Admin can see bridge audit.
- Admin can see AI usage.

### Platform boundaries stay intact

- App does not inherit Sage memory by default.
- App does not inherit specialist memory by default.
- App cannot request shell/computer/MCP/tool execution through forbidden fields.
- Browser does not call third-party bridge endpoints directly.
- Hosted apps use origin-bound launch tokens.
- Hosted app bridge requests are audited.
- AI invoke requires explicit permission and caps.

## Open questions

These questions require product or architecture decisions.

1. Should the public product noun be `Apps`, `Applications`, or `Mini-apps`?
2. Should `mini_app` remain a public concept, or only an internal service name?
3. Should link apps appear in the Applications installed grid?
4. Should a private URL app be embedded or opened externally by default?
5. Should user-created private apps go live instantly, or should high-risk permissions require review?
6. Should every app have a manifest, including simple link apps?
7. Should marketplace app submissions and private app creation share one manifest editor?
8. Should app-to-Sage execution be available only to verified apps, or can workspace-private apps enable it with owner approval?
9. Should app AI spend be disabled by default with zero caps, or enabled with default caps after consent?
10. Should local/hybrid app capabilities be shown as app runtime features or as brokered Agent Computer capabilities?
11. Should mobile support hosted app iframes/webviews with the same bridge contract as desktop?
12. Should marketplace support paid apps before there is a mature review and usage-ledger surface?
13. Should app package install events create mini-app contracts, app registry entries, or both?
14. Should user-owned apps be shareable across workspaces before marketplace review?
15. Should app version upgrades require explicit user approval when permissions change?

## Neutral implementation map

The current repository already contains these building blocks:

- First-class workspace Applications navigation.
- Private app URL publish flow.
- Workspace mini-app contracts.
- First-party mini-apps.
- Hosted app manifest generation.
- Hosted iframe/webview bridge.
- App SDK.
- Bridge contract map.
- Context envelope map.
- Permission classes.
- AI usage caps and consent gates.
- Share token flow.
- Marketplace app submission.
- Marketplace review and install routes.
- Runtime event recording.
- Mobile mini-app client APIs.

The repository does not yet expose every building block as a unified app-builder experience.

The gap is primarily product/API consolidation and developer workflow, not the absence of backend primitives.

## Possible delivery slices

These slices are listed as neutral groupings, not priorities.

### Slice A: App contract documentation

Deliverables:

- Public app manifest v1 document.
- Runtime type definitions.
- Permission definitions.
- Bridge contract definitions.
- AI policy definitions.
- Example manifests.

### Slice B: Applications surface cleanup

Deliverables:

- Clear installed/private/shared/draft tabs.
- Link app handling decision implemented.
- App details panel.
- App remove/disable action.
- Trust/permission/AI badges.

### Slice C: Private app builder

Deliverables:

- Multi-step creation flow.
- Manifest preview.
- URL/origin validation.
- Permission selection.
- AI cap selection.
- Hosted app test embed.
- SDK bridge smoke tests.

### Slice D: Hosted app developer kit

Deliverables:

- Typed SDK.
- Quickstart.
- Local test app.
- Bridge simulator.
- Error reference.
- Example app-to-Sage and Sage-to-app flows.

### Slice E: Marketplace app publishing

Deliverables:

- Publisher dashboard.
- Draft app submissions.
- Review queue.
- Review checklist.
- App package detail pages.
- Versioning.
- Install analytics.

### Slice F: Governance and observability

Deliverables:

- Bridge audit UI.
- App AI usage UI.
- Runtime events UI.
- Health checks.
- Disable/revoke controls.
- Permission change approval.

## Non-goals to preserve platform clarity

- Apps should not silently become agents.
- Apps should not silently become messaging channels.
- Apps should not silently become Agent Computer runtimes.
- Apps should not get raw Sage memory by default.
- Apps should not get raw specialist memory by default.
- Apps should not get direct shell/computer/MCP/tool execution by naming those actions in payloads.
- Marketplace should not become the primary place to create private specialists.
- Applications should not become an ungoverned browser bookmark folder if apps can request Sage, AI, records, or connector actions.
