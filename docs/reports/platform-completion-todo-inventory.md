# Platform Completion TODO / Stub Inventory

Generated from the clean `origin/main` Phase A branch. This inventory records explicit `TODO`, `FIXME`, `coming soon`, `placeholder`, `not ready yet`, and `out_of_scope` markers found in code/docs. It is a planning artifact, not proof that every listed item is user-facing.

## Phase A dead route audit

- `frontend/app/(account)/settings/devices/page.tsx`: already absent on clean `main`.
- `frontend/app/(account)/w/[workspaceId]/applications/store/page.tsx`: already absent on clean `main`.
- `frontend/app/mini-apps/official/[appId]/page.tsx`: already absent on clean `main`.
- `frontend/app/mini-apps/official/official-mini-apps.css`: already absent on clean `main`.
- `frontend/lib/workspace/app-store-pane.tsx`: already absent on clean `main`.
- `server_modules/operator_chat.py`: retained because runtime-export and connector tests still load it directly; deleting it would not be safe in Phase A.

## Summary

- Total markers: `344`
- `TODO`: `12`
- `FIXME`: `0`
- `coming soon`: `3`
- `placeholder`: `317`
- `not ready yet`: `6`
- `out_of_scope`: `6`

## Markers by top-level area

- `bin`: `11`
- `docs`: `24`
- `frontend`: `181`
- `mobile`: `57`
- `output`: `2`
- `python_engine`: `2`
- `scripts`: `6`
- `server_modules`: `61`

## Inventory

### `bin/orion`

- line `229`: `placeholder` - is_placeholder_value() {
- line `237`: `placeholder` - validate_id_placeholders() {
- line `245`: `placeholder` - if is_placeholder_value "${arg}"; then
- line `246`: `placeholder` - echo "Replace placeholder ${arg} with a real ID before running: ${CLI_NAME} cognitive ${sub}"
- line `280`: `placeholder` - validate_id_placeholders "${sub}" "$@"
- line `367`: `placeholder` - if [[ -n "${event_id}" ]] && is_placeholder_value "${event_id}"; then
- line `368`: `placeholder` - echo "Replace placeholder ${event_id} with a real event ID."
- line `371`: `placeholder` - if [[ -n "${objective_filter}" ]] && is_placeholder_value "${objective_filter}"; then
- line `372`: `placeholder` - echo "Replace placeholder ${objective_filter} with a real objective ID."
- line `785`: `placeholder` - if is_placeholder_value "${objective_id}"; then
- line `786`: `placeholder` - echo "Replace placeholder ${objective_id} with a real objective ID."
### `docs/architecture/virtual-computer-phase3-provider-abstraction.md`

- line `32`: `placeholder` - - AWS virtual desktop placeholder ('aws_workspaces', later)
- line `33`: `placeholder` - - Azure virtual desktop placeholder ('azure_virtual_desktop', later)
- line `34`: `placeholder` - - Self-hosted Docker/Kubernetes placeholder ('docker_kubernetes', later)
### `docs/archive/2026-05-15-outdated-docs/Agent Workstation Mode as a first-class policy layer.md`

- line `240`: `placeholder` - | 2 | Broker/JWT secrets in plaintext on disk | Real | .orion-stack/stack.env:30-33 | Rotate broker and JWT secrets if exposed. Keep local dev secrets out of commits and add startup warnings for placeholder/unsafe secrets outside local/test. |
- line `249`: `placeholder` - | A | Secrets handling and startup validation | runtime_config.py, auth/jwt secret config, docs/runbook if needed | config tests | No placeholder/broker/JWT secret is accepted outside local/test; secret values are never printed. |
- line `260`: `placeholder` - - Any production/staging startup accepts placeholder JWT/broker secrets.
- line `297`: `placeholder` - | A | Secret handling and startup validation | runtime_config.py, jwt/auth config, docs/runbook if needed | config/security tests | Unsafe placeholder/broker/JWT secrets are rejected outside local/test. No secret values are printed or committed. |
### `docs/archive/2026-05-15-outdated-docs/Biblev1.md`

- line `523`: `coming soon` - - future runtime providers must say “Coming soon” or “Dev-only”
### `docs/archive/2026-05-15-outdated-docs/MASTER_PLAN.md`

- line `385`: `placeholder` - - Title placeholder, content placeholder, action placeholder
### `docs/archive/2026-05-15-outdated-docs/Platform audit end to end! (hopefully!hahahaha).md`

- line `79`: `placeholder` - | Secret scan | No committed live secret proven; examples/tests contain expected placeholders and source
### `docs/archive/2026-05-15-outdated-docs/launch-implementation-status-2026-05-01.md`

- line `96`: `placeholder` - - After the fix, '/w/ws_f5616c7efafa/chat' rendered the workstation shell with 'data-workstation-surface="chat"', composer placeholder 'Message Sage...', 'Gateway offline', and 'Tools'.
- line `112`: `placeholder` - - '/w/ws_47a03801088c/chat' returned HTTP 200 and rendered the workstation shell with 'data-workstation-surface="chat"', composer placeholder 'Message Sage...', 'Gateway offline', and 'Tools'.
### `docs/archive/2026-05-15-outdated-docs/packets/packet-01-platform-cartography.md`

- line `50`: `placeholder` - - 'Mobile app root': current tab shell placeholder at [mobile/app/(tabs)/_layout.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/mobile/app/(tabs)/_layout.tsx):1; runtime foundation starts at [mobile-foundation.js](/Users/mansur/Multi_Agent_Orchestrator_Project/mobile/src/lib/mobile-foundation.js):10.
- line `68`: `placeholder` - - 'Mobile execution honesty': the active mobile architecture is foundation/controllers, not rebuilt UI; [mobile/app/(tabs)/_layout.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/mobile/app/(tabs)/_layout.tsx):1 confirms the visual shell is placeholder-only.
### `docs/archive/2026-05-15-outdated-docs/packets/packet-03-bloat-spaghetti-hunt.md`

- line `16`: `placeholder` - - 'P3' The mobile v2 controller layer is not production-mounted yet. The only active app file is a null placeholder at [mobile/app/(tabs)/_layout.tsx#L1](/Users/mansur/Multi_Agent_Orchestrator_Project/mobile/app/(tabs)/_layout.tsx#L1). The controller bundle is exported at [mobile-workspace-surfaces.js#L8](/Users/mansur/Multi_Agent_Orchestrator_Project/mobile/src/lib/mobile-workspace-surfaces.js#L8), and the proven imports are tests at [phase96MobileWorkspaceSurfaces.test.mjs#L9](/Users/mansur/Multi_Agent_Orchestrator_Project/mobile/phase96MobileWorkspaceSurfaces.test.mjs#L9) and the internal switcher surface loader. That means this layer is scaffolded, not dead. Classification: 'suspicious but not yet proven dead'.
### `docs/archive/2026-05-15-outdated-docs/packets/packet-08-frontend-mobile-shell-audit.md`

- line `52`: `placeholder` - - The eventual Expo Router integration could introduce new state above the boundary when the placeholder tab shell is replaced. Today that risk is architectural, not proven.
- line `66`: `placeholder` - The web shell passes the structural test with minor scoping debt. The mobile foundation passes as architecture, but the live mobile shell is still a placeholder. So the system is not “cosmetically refactored,” but it is also not yet fully enterprise-safe across both web and mobile until the mobile shell is actually mounted and the web account-shell persistence keying is tightened.
### `docs/archive/2026-05-15-outdated-docs/packets/packet-10-interim-benchmark.md`

- line `10`: `placeholder` - - 'P2' This platform is ahead on web multi-tenant shell discipline, but it cannot claim full cross-surface superiority because mobile is still not mounted. The web boundary/service model is real in [workspace-boundary.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/lib/workspace/workspace-boundary.tsx#L53) and [workspace-services.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/lib/workspace/workspace-services.tsx#L487). OpenClaw has no equivalent workspace boundary and keeps global UI state in [app.ts](/Users/mansur/Multi_Agent_Orchestrator_Project/reference/openclaw/openclaw-src/ui/src/ui/app.ts#L139) through [app.ts](/Users/mansur/Multi_Agent_Orchestrator_Project/reference/openclaw/openclaw-src/ui/src/ui/app.ts#L245). But this repo’s mobile shell is still a placeholder in [mobile/app/(tabs)/_layout.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/mobile/app/(tabs)/_layout.tsx#L1).
### `docs/archive/2026-05-15-outdated-docs/packets/packet-11-data-governance-retention.md`

- line `11`: `placeholder` - - 'P2' Retention is mostly weak, partial, or fake. Artifact retention is explicitly 'placeholder' metadata in [artifact_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/artifact_service.py#L33) and [artifact_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/artifact_service.py#L162); memory expiry is read-time filtering in [memory_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/memory_service.py#L965) and [memory_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/memory_service.py#L1046); activity retention is history-window filtering in [activity_ledger_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/activity_ledger_service.py#L131) and [activity_ledger_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/activity_ledger_service.py#L415); archived runs have no TTL field in [run_state_schema.sql](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/run_state_schema.sql#L95).
- line `34`: `placeholder` - - 'Implicit but weak': artifact retention placeholder metadata in [artifact_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/artifact_service.py#L33); memory expiry filter in [memory_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/memory_service.py#L1046); activity history read-window filtering in [activity_ledger_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/activity_ledger_service.py#L415); capped JSON approval audit rewrite in [runs_history.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runs_history.py#L152) and [runs_history.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runs_history.py#L244).
- line `58`: `placeholder` - - Retention is often presentation-layer filtering or placeholder metadata, not proven deletion.
- line `66`: `placeholder` - - Artifact retention is placeholder metadata only.
### `docs/archive/2026-05-15-outdated-docs/packets/packet-16-live-environment-drift-restore.md`

- line `30`: `placeholder` - - The local wrapper DB files in [.orion-stack](/Users/mansur/Multi_Agent_Orchestrator_Project/.orion-stack) are stale placeholders, not the live state source.
### `docs/deepseek-platform-audit-brief-2026-05-17.md`

- line `247`: `placeholder` - - Are Results and Activity backed by real events, not placeholder data?
### `frontend/app/login/page.tsx`

- line `221`: `placeholder` - placeholder="Enter your email"
- line `237`: `placeholder` - placeholder="Enter your password"
### `frontend/app/signup/page.tsx`

- line `240`: `coming soon` - <span className="app-auth-social__meta">Coming soon on web</span>
- line `262`: `placeholder` - placeholder="Enter your name"
- line `278`: `placeholder` - placeholder="Enter your email"
- line `295`: `placeholder` - placeholder="Enter your password"
### `frontend/lib/ui/chrome.css`

- line `1232`: `placeholder` - .artifact-library-search input::placeholder {
- line `1642`: `placeholder` - .app-field::placeholder,
- line `1643`: `placeholder` - .app-textarea::placeholder {
- line `5964`: `placeholder` - .app-chat-composer__textarea::placeholder {
- line `10872`: `placeholder` - .workstation-shell-panel__build-roster .studio-agents-nav__placeholder {
- line `10909`: `placeholder` - .workstation-shell-panel__build-roster .studio-agents-nav__placeholder strong {
- line `11018`: `placeholder` - .workstation-shell-panel__placeholder {
- line `11029`: `placeholder` - .workstation-shell-panel__placeholder svg {
- line `11549`: `placeholder` - .studio-agents-nav__search input::placeholder {
- line `11645`: `placeholder` - .studio-agents-nav__placeholder {
- line `11716`: `placeholder` - .studio-agents-nav__placeholder {
- line `11733`: `placeholder` - .studio-agents-nav__placeholder strong {
- line `11771`: `placeholder` - .studio-agents-nav__placeholder span {
- line `11781`: `placeholder` - .studio-agents-nav__placeholder {
- line `11841`: `placeholder` - .studio-agents-nav__placeholder {
- line `12621`: `placeholder` - .studio-agent-overview__avatar-placeholder {
- line `12627`: `placeholder` - .studio-agent-overview__avatar-placeholder {
- line `12708`: `TODO` - .studio-agent-overview__step--todo .studio-agent-overview__step-mark {
- line `16304`: `placeholder` - .app-studio-shell--agents .studio-agent-knowledge__source-form input::placeholder {
- line `18294`: `placeholder` - .settings-provider-card--placeholder {
- line `21306`: `placeholder` - .sage-integrations-nav__placeholder,
- line `21313`: `placeholder` - .sage-integrations-nav__placeholder {
- line `23700`: `placeholder` - .deployed-agent-chat__input::placeholder {
- line `26291`: `placeholder` - .workstation-hardware-qr-placeholder {
### `frontend/lib/ui/form-controls.tsx`

- line `88`: `placeholder` - placeholder = 'Add item',
- line `94`: `placeholder` - placeholder?: string;
- line `145`: `placeholder` - placeholder={placeholder}
### `frontend/lib/workspace/chat-composer.tsx`

- line `19`: `TODO` - ListTodo,
- line `174`: `TODO` - return ListTodo;
- line `235`: `placeholder` - placeholder = '',
- line `258`: `placeholder` - placeholder?: string;
- line `649`: `placeholder` - placeholder={placeholder}
### `frontend/lib/workspace/codex-chat/timeline-reducer.ts`

- line `93`: `placeholder` - const placeholders = new Set(['thinking...']);
- line `96`: `placeholder` - if (placeholders.has(incomingLower)) {
- line `99`: `placeholder` - if (placeholders.has(existingLower)) {
### `frontend/lib/workspace/deployed-agents/ai-settings.tsx`

- line `286`: `placeholder` - placeholder={selectedProvider ? 'Paste ${selectedProvider.label} API key' : 'Choose provider first'}
### `frontend/lib/workspace/deployed-agents/constants.ts`

- line `477`: `placeholder` - knowledgePlaceholder: 'Paste product catalog links, spreadsheet references, pricing notes, or availability rules here.',
- line `495`: `placeholder` - knowledgePlaceholder: 'Paste menu notes, Google Sheet references, or daily specials source here.',
- line `513`: `placeholder` - knowledgePlaceholder: 'Paste clinic hours, services, insurance notes, booking rules, and emergency routing instructions here.',
- line `531`: `placeholder` - knowledgePlaceholder: 'Paste listing sheet, neighborhood notes, or qualification rules here.',
- line `549`: `placeholder` - knowledgePlaceholder: 'Paste help center links, policy docs, or faq:// references here.',
- line `567`: `placeholder` - knowledgePlaceholder: 'Add service list, booking rules, and availability source here.',
- line `585`: `placeholder` - knowledgePlaceholder: 'Add sheet://catalog or paste the spreadsheet reference here.',
- line `603`: `placeholder` - knowledgePlaceholder: 'Paste product pages, pricing notes, or sales sheet references here.',
- line `621`: `placeholder` - knowledgePlaceholder: 'Paste repository, issue board, or release-note source references here.',
- line `649`: `placeholder` - knowledgePlaceholder: 'Add the trusted sources this Business Agent should use.',
### `frontend/lib/workspace/deployed-agents/detail-view.tsx`

- line `561`: `placeholder` - placeholder="Describe what this Business Agent should do, what it should answer, and when it should hand off to a human."
- line `570`: `placeholder` - placeholder="Describe the voice and style this Business Agent should use."
- line `633`: `placeholder` - placeholder="Add a website, Google Sheet, file URI, or source reference..."
- line `894`: `not ready yet` - <EmptyPanel title="Agent is not ready yet" body="Save the agent first, then chat with it here." />
### `frontend/lib/workspace/deployed-agents/external-agent-detail.tsx`

- line `1298`: `placeholder` - placeholder="Message this connected agent inside Studio..."
### `frontend/lib/workspace/deployed-agents/roster-sidebar.tsx`

- line `223`: `placeholder` - placeholder="Search agents"
### `frontend/lib/workspace/deployed-agents/types.ts`

- line `37`: `placeholder` - knowledgePlaceholder: string;
### `frontend/lib/workspace/deployed-agents/utils.ts`

- line `119`: `placeholder` - const looksPlaceholder = !rawName
- line `130`: `placeholder` - if (looksPlaceholder && state !== 'live') {
- line `562`: `placeholder` - knowledgePlaceholder: dataSources.length
- line `1553`: `placeholder` - export function buildMetricsPlaceholder(): AgentOperationalMetrics {
### `frontend/lib/workspace/deployed-agents/wizard.tsx`

- line `932`: `placeholder` - placeholder="OpenClaw assistant"
- line `985`: `placeholder` - placeholder="https://agent.example.com"
- line `992`: `placeholder` - placeholder="https://agent.example.com/.well-known/agent-manifest.json"
- line `1005`: `placeholder` - placeholder={externalAgentForm.providerKind === 'openclaw' ? 'Use default OpenClaw adapter' : 'Local adapter address'}
- line `1014`: `placeholder` - placeholder="https://agent.example.com/chat"
- line `1021`: `placeholder` - placeholder="https://agent.example.com/events"
- line `1028`: `placeholder` - placeholder="https://agent.example.com/artifacts"
- line `1036`: `placeholder` - placeholder="vault://external-agents/openclaw-prod"
- line `1044`: `placeholder` - placeholder={'{\n  "capabilities": ["chat", "artifacts"],\n  "surface_sections": []\n}'}
- line `1056`: `placeholder` - placeholder="New agent"
- line `1064`: `placeholder` - placeholder={selectedStudioTemplate.systemPrompt}
- line `1078`: `placeholder` - placeholder="Bluebird Cafe"
- line `1085`: `placeholder` - placeholder="https://example.com/avatar.png"
- line `1093`: `placeholder` - placeholder="Friendly, concise, formal, warm, luxury, clinic front desk..."
- line `1116`: `placeholder` - placeholder="Answer menu questions, check specials and availability, confirm orders clearly, and escalate edge cases to a human."
- line `1124`: `placeholder` - placeholder={'kb://menu\nsheet://daily-menu'}
- line `1141`: `placeholder` - placeholder={selectedStudioTemplate.knowledgePlaceholder}
- line `1150`: `placeholder` - placeholder={selectedStudioTemplate.systemPrompt}
- line `1159`: `placeholder` - placeholder="Quickly ask questions, check availability, and get help."
- line `1167`: `placeholder` - placeholder={selectedStudioTemplate.outcome}
- line `1372`: `placeholder` - placeholder="owner@example.com"
- line `1379`: `placeholder` - placeholder="A human will follow up shortly."
- line `1397`: `placeholder` - placeholder="Safety reviewer"
- line `1631`: `placeholder` - placeholder="supplier.example.com, portal.example.com"
- line `1742`: `placeholder` - placeholder="250"
- line `1750`: `placeholder` - placeholder="25"
- line `1759`: `placeholder` - placeholder="Continue on Empyralis"
- line `1766`: `placeholder` - placeholder="https://app.empyralis.com/help"
### `frontend/lib/workspace/hosted-mini-apps-pane.tsx`

- line `611`: `placeholder` - placeholder="Budget Tracker"
- line `625`: `placeholder` - placeholder="Optional website URL"
- line `640`: `placeholder` - placeholder="Track daily expenses and monthly spending patterns."
### `frontend/lib/workspace/sage-chat/composer.tsx`

- line `47`: `placeholder` - placeholder="Message Sage..."
### `frontend/lib/workspace/workspace-setup-form.tsx`

- line `165`: `placeholder` - placeholder="Acme Deal Room"
### `frontend/lib/workspace/workstation-activity-pane.tsx`

- line `1322`: `placeholder` - placeholder={displayNameHint}
- line `1331`: `placeholder` - placeholder="Example: Keep my inbox triaged."
- line `1343`: `placeholder` - placeholder="Example: I run product and engineering for Empyralis."
- line `1353`: `placeholder` - placeholder="Example: Be direct, concise, and lead with the answer."
- line `1363`: `placeholder` - placeholder="Example: Never send external messages without approval."
- line `1418`: `placeholder` - placeholder="SHOP_PLAYBOOK"
- line `1499`: `placeholder` - placeholder="Example: Preferred working style"
- line `1509`: `placeholder` - placeholder="Example: Prefers concise updates with clear next actions."
### `frontend/lib/workspace/workstation-artifacts-pane.tsx`

- line `245`: `placeholder` - placeholder="Search"
### `frontend/lib/workspace/workstation-billing-pane.tsx`

- line `521`: `placeholder` - placeholder="Enter amount in USD"
### `frontend/lib/workspace/workstation-chat-pane-hooks.ts`

- line `91`: `placeholder` - placeholder: string;
### `frontend/lib/workspace/workstation-chat-pane-model.ts`

- line `2530`: `placeholder` - placeholder: readString(currentQuestionRecord.placeholder),
### `frontend/lib/workspace/workstation-chat-pane.tsx`

- line `383`: `placeholder` - const curatedPlaceholder = candidate.curated === true && source === 'curated_pack' && !activeNow;
- line `385`: `placeholder` - if (curatedPlaceholder || bundledPlatformSkill) {
- line `3616`: `placeholder` - placeholder={bootstrapQuestion?.placeholder || 'Add the next answer for Sage'}
- line `3764`: `placeholder` - placeholder="Message Sage..."
- line `3955`: `placeholder` - placeholder="Example: Preferred working style"
- line `3969`: `placeholder` - placeholder="Example: Prefers concise status updates and direct next steps."
### `frontend/lib/workspace/workstation-client.ts`

- line `209`: `placeholder` - placeholder?: string | null;
### `frontend/lib/workspace/workstation-deployed-agent-test-turn-pane.tsx`

- line `207`: `placeholder` - placeholder="Message this agent privately..."
### `frontend/lib/workspace/workstation-deployed-agents-pane.tsx`

- line `106`: `placeholder` - buildMetricsPlaceholder,
- line `773`: `placeholder` - .map((agentId) => [agentId, current[agentId] ?? buildMetricsPlaceholder()]),
### `frontend/lib/workspace/workstation-gateway-operator-pane.tsx`

- line `2056`: `placeholder` - placeholder="My MacBook"
- line `2137`: `placeholder` - placeholder="/Users/mansur/Work"
- line `2146`: `placeholder` - placeholder="/Users/mansur/Work/secrets"
- line `2155`: `placeholder` - placeholder="example.com"
- line `2733`: `placeholder` - placeholder="8618657105303"
- line `2740`: `placeholder` - placeholder="8618657105303"
- line `2786`: `placeholder` - placeholder="123456"
- line `2794`: `placeholder` - placeholder="Telegram app secret"
- line `2801`: `placeholder` - placeholder="+8618657105303"
- line `2821`: `placeholder` - placeholder="123456789"
### `frontend/lib/workspace/workstation-hardware-pane.tsx`

- line `1159`: `placeholder` - <input className="app-field" type="text" value={sshHost} onChange={(event) => setSshHost(event.target.value)} placeholder="server.example.com" />
- line `1167`: `placeholder` - <input className="app-field" type="text" value={sshUsername} onChange={(event) => setSshUsername(event.target.value)} placeholder="ubuntu" />
- line `1216`: `placeholder` - <div className="workstation-hardware-qr-placeholder">
### `frontend/lib/workspace/workstation-kernel-shell.tsx`

- line `8`: `TODO` - import { ArrowLeft, BookOpen, Bot, Brain, ChevronRight, Compass, Cpu, FolderOpen, LayoutGrid, Link2, ListTodo, Menu, MessageSquare, Monitor, Package, Plus, Wrench } from 'lucide-react';
- line `116`: `TODO` - { routeId: 'tasks', label: 'Tasks', icon: ListTodo },
- line `126`: `TODO` - { routeId: 'tasks', label: 'Tasks', icon: ListTodo },
- line `556`: `placeholder` - function isPlaceholderTitle(title: string): boolean {
- line `571`: `placeholder` - if (explicitTitle && !isPlaceholderTitle(explicitTitle)) {
- line `1541`: `TODO` - icon: ListTodo,
- line `1891`: `placeholder` - <div className="workstation-shell-panel__placeholder">
### `frontend/lib/workspace/workstation-runs-pane.tsx`

- line `252`: `placeholder` - function isPlaceholderTitle(title: string): boolean {
- line `270`: `placeholder` - if (title && !isPlaceholderTitle(title)) {
- line `955`: `placeholder` - placeholder="Search by trace ID"
### `frontend/lib/workspace/workstation-sage-connectors-pane.tsx`

- line `922`: `placeholder` - function providerCredentialPlaceholder(provider: ProviderSnapshot): string {
- line `938`: `placeholder` - function providerBaseUrlPlaceholder(provider: ProviderSnapshot): string {
- line `1380`: `not ready yet` - detail: readString(browserAttachRecord.summary, 'Your browser is not ready yet.'),
- line `3135`: `placeholder` - placeholder={providerCredentialPlaceholder(record.provider)}
- line `3163`: `placeholder` - placeholder={providerBaseUrlPlaceholder(record.provider)}
- line `3239`: `placeholder` - placeholder="8618657105303"
- line `3246`: `placeholder` - placeholder="8618657105303"
- line `3256`: `placeholder` - placeholder="123456"
- line `3263`: `placeholder` - placeholder="Telegram app secret"
- line `3270`: `placeholder` - placeholder="+8618657105303"
- line `3290`: `placeholder` - placeholder="123456789"
- line `3712`: `placeholder` - placeholder={providerCredentialPlaceholder(record.provider)}
- line `3733`: `placeholder` - placeholder={providerBaseUrlPlaceholder(record.provider)}
- line `4129`: `placeholder` - placeholder="inventory-feed"
- line `4142`: `placeholder` - placeholder="Inventory Feed"
- line `4153`: `placeholder` - placeholder="https://example.com/mcp"
- line `4275`: `placeholder` - <div className="sage-integrations-nav__placeholder">Loading apps and accounts…</div>
### `frontend/lib/workspace/workstation-sage-profile-pane.tsx`

- line `73`: `placeholder` - const BOOTSTRAP_FIELD_PLACEHOLDERS: Record<BootstrapField, string> = {
- line `329`: `placeholder` - const activePlaceholder = activeFieldIsCurrent && bootstrapQuestion?.placeholder
- line `330`: `placeholder` - ? readString(bootstrapQuestion.placeholder)
- line `331`: `placeholder` - : BOOTSTRAP_FIELD_PLACEHOLDERS[activeField];
- line `413`: `placeholder` - placeholder={activeField === 'user_name' ? displayNameHint : activePlaceholder}
- line `423`: `placeholder` - placeholder={activePlaceholder}
- line `484`: `placeholder` - placeholder={displayNameHint}
- line `493`: `placeholder` - placeholder="Example: Keep my inbox triaged."
- line `505`: `placeholder` - placeholder="Example: I run product and engineering for Empyralis."
- line `515`: `placeholder` - placeholder="Example: Be direct, concise, and lead with the answer."
- line `525`: `placeholder` - placeholder="Example: Never send external messages without approval."
### `frontend/lib/workspace/workstation-settings-pane.tsx`

- line `795`: `coming soon` - subtitle={authProviders.apple?.enabled === true ? 'Available for this workspace' : 'Coming soon on web'}
### `frontend/tests/e2e/account-shell-bootstrap-resilience.spec.ts`

- line `11`: `placeholder` - placeholder: 'Example: Mansur',
- line `17`: `placeholder` - placeholder: 'Example: I run product and engineering for a mobile-first agent platform.',
- line `23`: `placeholder` - placeholder: 'Example: Be direct, concise, and lead with the answer.',
- line `29`: `placeholder` - placeholder: 'Example: Keep my inbox triaged and surface urgent replies.',
- line `35`: `placeholder` - placeholder: 'Example: Never send external messages without approval.',
- line `304`: `placeholder` - await expect(page.locator('[data-workstation-chat-composer="root"] textarea')).toHaveAttribute('placeholder', 'Sage setup is temporarily unavailable.');
- line `369`: `placeholder` - await expect(page.locator('[data-workstation-chat-composer="root"] textarea')).toHaveAttribute('placeholder', 'Message Sage...');
### `frontend/tests/e2e/deployed-agents.spec.ts`

- line `1375`: `placeholder` - await page.getByPlaceholder(/message this connected agent privately/i).fill('Hello external agent');
- line `1407`: `placeholder` - await expect(chatPanel.getByPlaceholder(/message this agent privately/i)).toBeVisible();
- line `1411`: `placeholder` - await page.getByPlaceholder(/message this agent privately/i).fill('Can you explain the return policy?');
- line `1549`: `placeholder` - await expect(mobileChatPanel.getByPlaceholder(/message this agent privately/i)).toBeVisible();
### `mobile/app/apps/[id]/home.tsx`

- line `301`: `placeholder` - <LabeledInput label="Set name" value={setName} onChangeText={setSetName} placeholder="Biology set" />
- line `306`: `placeholder` - placeholder="Paste the notes you want turned into flashcards."
- line `966`: `placeholder` - placeholder,
- line `973`: `placeholder` - placeholder: string;
- line `985`: `placeholder` - placeholder={placeholder}
- line `986`: `placeholder` - placeholderTextColor={theme.colors.textSecondary}
### `mobile/app/apps/register.tsx`

- line `95`: `placeholder` - <Field label="App name" value={name} onChangeText={setName} placeholder="Inventory Helper" />
- line `96`: `placeholder` - <Field label="App id" value={slug} onChangeText={setSlug} placeholder={slugify(name) || "inventory_helper"} />
- line `97`: `placeholder` - <Field label="App source URL" value={hostedUrl} onChangeText={setHostedUrl} placeholder="https://example.com/app" />
- line `102`: `placeholder` - placeholder="What this app helps with."
- line `160`: `placeholder` - placeholder,
- line `166`: `placeholder` - placeholder: string;
- line `176`: `placeholder` - placeholder={placeholder}
- line `177`: `placeholder` - placeholderTextColor={theme.colors.textSecondary}
### `mobile/app/gateway.tsx`

- line `497`: `placeholder` - placeholder="My MacBook"
- line `498`: `placeholder` - placeholderTextColor={theme.colors.textSecondary}
### `mobile/app/memory.tsx`

- line `216`: `not ready yet` - setStatus({ kind: "error", message: "Sage is not ready yet." });
- line `351`: `placeholder` - placeholder={'Write ${layer.title.toLowerCase()} here'}
- line `352`: `placeholder` - placeholderTextColor={theme.colors.textSecondary}
### `mobile/app/session.tsx`

- line `217`: `placeholder` - placeholder="EMP2..."
- line `229`: `placeholder` - <Field label="Runtime URL" value={runtimeUrl} onChangeText={setRuntimeUrl} placeholder="http://192.168.1.10:8000" />
- line `230`: `placeholder` - <Field label="Runtime key" value={runtimeKey} onChangeText={setRuntimeKey} placeholder="Paste runtime key" secureTextEntry />
- line `231`: `placeholder` - <Field label="Workspace ID" value={workspaceId} onChangeText={setWorkspaceId} placeholder="workspace id" />
- line `232`: `placeholder` - <Field label="Platform URL" value={platformUrl} onChangeText={setPlatformUrl} placeholder="Optional" />
- line `261`: `placeholder` - placeholder,
- line `268`: `placeholder` - placeholder: string;
- line `282`: `placeholder` - placeholder={placeholder}
- line `283`: `placeholder` - placeholderTextColor={theme.colors.textMuted}
### `mobile/app/spaces/new.tsx`

- line `80`: `placeholder` - placeholder="Space name"
- line `81`: `placeholder` - placeholderTextColor={theme.colors.textMuted}
- line `96`: `placeholder` - placeholder="What this space is for"
- line `97`: `placeholder` - placeholderTextColor={theme.colors.textMuted}
### `mobile/docs/kin-research-paper.md`

- line `128`: `TODO` - Legacy indirect competitors remain powerful precisely because they solve narrow jobs well. YNAB and Mint-like finance products do budgeting. Headspace and Calm do wellness routines. TripIt does travel organization. Notion and Evernote do notes and knowledge capture. Todoist and Any.do do tasks. The weakness of this field is not lack of utility. It is lack of coordination. Each app optimizes its own slice of the user’s life. None functions as a cross-domain agent layer.
### `mobile/ios/Empyralis/SplashScreen.storyboard`

- line `28`: `placeholder` - <placeholder placeholderIdentifier="IBFirstResponder" id="EXPO-PLACEHOLDER-1" userLabel="First Responder" sceneMemberID="firstResponder"/>
### `mobile/src/components/InputBar.tsx`

- line `28`: `placeholder` - placeholder?: string;
- line `43`: `placeholder` - placeholder,
- line `169`: `placeholder` - placeholder={placeholder || "Message"}
- line `170`: `placeholder` - placeholderTextColor={theme.colors.textMuted}
### `mobile/src/lib/api.ts`

- line `601`: `not ready yet` - throw new Error('Could not ${purpose} because your Sage workspace is not ready yet.');
### `mobile/src/screens/ChatScreen.tsx`

- line `148`: `placeholder` - function isPlaceholderThreadTitle(title: string): boolean {
- line `155`: `placeholder` - if (title && !isPlaceholderThreadTitle(title)) {
- line `912`: `placeholder` - const placeholderIndex = nextUserMessageIndex + 1;
- line `935`: `placeholder` - removeMessage(currentSessionId, placeholderIndex);
- line `944`: `placeholder` - let nextStreamCardIndex = placeholderIndex + 1;
- line `981`: `placeholder` - updateMessage(currentSessionId, placeholderIndex, {
- line `996`: `placeholder` - updateMessage(currentSessionId, placeholderIndex, {
- line `1044`: `placeholder` - removeMessage(currentSessionId, placeholderIndex);
- line `1052`: `placeholder` - removeMessage(currentSessionId, placeholderIndex);
- line `1080`: `placeholder` - const placeholderIndex = messages.length;
- line `1088`: `placeholder` - let nextStreamCardIndex = placeholderIndex + 1;
- line `1126`: `placeholder` - updateMessage(activeSession.id, placeholderIndex, {
- line `1133`: `placeholder` - updateMessage(activeSession.id, placeholderIndex, {
- line `1779`: `placeholder` - placeholder={requestedAgentId ? 'Message ${activeAgent.label}' : "Ask Sage anything"}
### `mobile/src/screens/LoginScreen.tsx`

- line `305`: `placeholder` - placeholder="Email"
- line `306`: `placeholder` - placeholderTextColor={theme.colors.textMuted}
- line `327`: `placeholder` - placeholder="Password"
- line `328`: `placeholder` - placeholderTextColor={theme.colors.textMuted}
### `output/empyralis-codebase-map.md`

- line `796`: `placeholder` - - 'class ReservedPersonalChannelRuntime' — Placeholder implementation
- line `925`: `placeholder` - | 'skeleton-block.tsx' | Loading | Configurable loading placeholder |
### `python_engine/cognitive_daemon.py`

- line `2233`: `placeholder` - placeholders = ",".join("?" for _ in dep_ids)
- line `2238`: `placeholder` - WHERE niche_id=? AND id IN ({placeholders}) AND status != 'done'
### `scripts/orion_local_worker_workspace.py`

- line `139`: `out_of_scope` - "kind": "path_out_of_scope",
### `scripts/orion_terminal/prompt_contracts.py`

- line `29`: `placeholder` - placeholder: Optional[str] = None
### `scripts/phase104_dynamic_stage_pane_test.py`

- line `63`: `placeholder` - assert_not_contains(shell_text, "Stage reconstruction and live detail panels land in W5.7", "old placeholder copy")
### `scripts/phase13_secret_scan.py`

- line `23`: `placeholder` - ALLOWED_PLACEHOLDERS = (
- line `73`: `placeholder` - return any(token in normalized for token in ALLOWED_PLACEHOLDERS)
### `scripts/telegram_rebind_and_watch.sh`

- line `38`: `placeholder` - echo "You pasted the placeholder token. Replace it with your real BotFather token."
### `server_modules/artifact_service.py`

- line `39`: `placeholder` - "policy_status": "placeholder",
- line `168`: `placeholder` - def retention_placeholder(retention_days: Optional[int] = None, expires_at: Optional[str] = None) -> Dict[str, Any]:
- line `529`: `placeholder` - retention=retention_placeholder(retention_days, retention_expires_at),
### `server_modules/auth.py`

- line `1820`: `placeholder` - placeholders = ",".join("?" for _ in clean_session_ids)
- line `1827`: `placeholder` - WHERE session_id IN ({placeholders}) AND revoked_at IS NULL
### `server_modules/browser_engine.py`

- line `622`: `placeholder` - placeholder: (el.getAttribute('placeholder') || '').trim(),
### `server_modules/channel_lane_contract_service.py`

- line `147`: `out_of_scope` - "stage": "out_of_scope",
- line `148`: `out_of_scope` - "status": "out_of_scope",
### `server_modules/connectors/telegram_menu_service.py`

- line `119`: `placeholder` - "input_field_placeholder": "Message Empyralis...",
### `server_modules/demo_workflows.py`

- line `179`: `not ready yet` - return "Empyralis started the demo, but the screenshot artifact is not ready yet."
### `server_modules/deployed_agent_service.py`

- line `109`: `out_of_scope` - "status": "out_of_scope",
### `server_modules/direct_chat_handoff_service.py`

- line `299`: `not ready yet` - return f"waiting_for_runtime:{run_id}", {"type": "step", "id": f"run-handoff:waiting-runtime:{run_id}", "label": "Waiting for your laptop", "detail": _detail(preferred_runtime_label, estimated_wait_band, "Local machine not ready yet"), "status": "active", "kind": "thinking"}
### `server_modules/direct_chat_prompt_service.py`

- line `35`: `TODO` - "Before answering about prior work, decisions, dates, people, preferences, or todos, run memory_search and then memory_get for only the needed lines. If memory results are weak, say you checked."
- line `38`: `TODO` - lines.append("Use memory_search before answering about prior work, decisions, dates, people, preferences, or todos.")
### `server_modules/doctor_report.py`

- line `290`: `placeholder` - "Runtime API key is using the default placeholder value.",
### `server_modules/jwt_secret.py`

- line `21`: `placeholder` - _PLACEHOLDER_SECRET_TOKENS = {
- line `49`: `placeholder` - if explicit.strip().lower() in _PLACEHOLDER_SECRET_TOKENS:
- line `57`: `placeholder` - "ORION_JWT_SECRET or JWT_SECRET must be explicitly set to a non-placeholder "
### `server_modules/memory_service.py`

- line `103`: `TODO` - if not re.search(r"[.!?;:]|\\b(preference|decide|decision|plan|fact|goal|todo|note|update|constraint|policy|bug|project|customer|context|issue|insight|next|because|when|if|should|must|mustn't|avoid|prefer|priority)\b", normalized):
- line `800`: `placeholder` - raise ValueError("Consolidation proposal must include durable context, not a short placeholder.")
### `server_modules/notification_service.py`

- line `446`: `placeholder` - placeholders = ", ".join("?" for _ in normalized_allowed)
- line `447`: `placeholder` - clauses.append(f"workspace_id IN ({placeholders})")
- line `570`: `placeholder` - placeholders = ", ".join("?" for _ in normalized_allowed)
- line `571`: `placeholder` - clauses.append(f"workspace_id IN ({placeholders})")
### `server_modules/office_ooxml.py`

- line `253`: `placeholder` - <p:nvSpPr><p:cNvPr id="3" name="Content Placeholder 2"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>
### `server_modules/routes_builder.py`

- line `75`: `placeholder` - If details are unknown, leave explicit placeholders inside config rather than inventing fake IDs.
### `server_modules/runtime_config.py`

- line `424`: `placeholder` - placeholders = {
- line `434`: `placeholder` - if len(value) < 32 or value.lower() in placeholders:
- line `435`: `placeholder` - raise RuntimeError(f"{name} must be explicitly set to a non-placeholder 32+ character secret in staging/production.")
- line `437`: `placeholder` - if len(mini_app_share_secret) < 32 or mini_app_share_secret.lower() in placeholders:
### `server_modules/runtime_events.py`

- line `320`: `placeholder` - placeholders = ", ".join("?" for _ in normalized_allowed)
- line `321`: `placeholder` - clauses.append(f"workspace_id IN ({placeholders})")
- line `418`: `placeholder` - placeholders = ", ".join("?" for _ in normalized_allowed)
- line `419`: `placeholder` - clauses.append(f"workspace_id IN ({placeholders})")
### `server_modules/runtime_state_store.py`

- line `664`: `placeholder` - placeholders = ", ".join("?" for _ in normalized_statuses)
- line `665`: `placeholder` - query += f"\nWHERE status IN ({placeholders})"
- line `787`: `placeholder` - placeholders = ", ".join("?" for _ in normalized_statuses)
- line `788`: `placeholder` - clauses.append(f"status IN ({placeholders})")
- line `921`: `placeholder` - placeholders = ", ".join("?" for _ in normalized_statuses)
- line `922`: `placeholder` - query += f"\nWHERE status IN ({placeholders})"
- line `1726`: `placeholder` - placeholders = ", ".join("?" for _ in normalized)
- line `1736`: `placeholder` - WHERE n.id IN ({placeholders})
### `server_modules/sage_profile_service.py`

- line `18`: `placeholder` - "placeholder": "Example: Mansur",
- line `24`: `placeholder` - "placeholder": "Example: I run product and engineering for a mobile-first agent platform.",
- line `30`: `placeholder` - "placeholder": "Example: Be direct, concise, and lead with the answer.",
- line `36`: `placeholder` - "placeholder": "Example: Keep my inbox triaged and surface urgent replies.",
- line `42`: `placeholder` - "placeholder": "Example: Never send external messages without approval.",
### `server_modules/sage_transparency_service.py`

- line `73`: `placeholder` - Only stages with real data are emitted — no fake / placeholder events.
### `server_modules/skills_service.py`

- line `656`: `TODO` - "preferences, or todos. Search MEMORY.md and memory/*.md and return matching snippets "
### `server_modules/tests/test_artifact_service.py`

- line `73`: `placeholder` - def test_store_artifact_bytes_records_retention_placeholder(self) -> None:
- line `94`: `placeholder` - self.assertEqual(metadata["retention"]["policy_status"], "placeholder")
### `server_modules/tests/test_browser_engine.py`

- line `47`: `placeholder` - {"index": 0, "tag": "a", "text": "More information", "type": "", "href": "https://www.iana.org/domains/example", "name": "", "placeholder": "", "id": ""},
- line `48`: `placeholder` - {"index": 1, "tag": "h1", "text": "Example Domain", "type": "", "href": "", "name": "", "placeholder": "", "id": "heading"},
### `server_modules/tests/test_channel_lane_contract_service.py`

- line `81`: `out_of_scope` - self.assertEqual(by_key["whatsapp_twilio"]["status"], "out_of_scope")
### `server_modules/tests/test_deployed_agent_routes.py`

- line `244`: `out_of_scope` - "whatsapp": {"available": False, "status": "out_of_scope"},
### `server_modules/tests/test_jwt_secret_resolution.py`

- line `37`: `placeholder` - def test_production_requires_explicit_non_placeholder_secret(self):
- line `43`: `placeholder` - def test_production_rejects_short_or_placeholder_secret(self):
### `server_modules/tests/test_operator_chat.py`

- line `671`: `placeholder` - @patch("operator_chat_under_test.generate_chat_reply_with_provider_fallback", return_value=("placeholder", {"provider": "codex_cli", "model": "gpt-5.4"}, "codex_cli", ""))
- line `683`: `placeholder` - self.assertEqual(payload["reply"], "placeholder")
### `server_modules/tests/test_sage_agent_runtime_service.py`

- line `60`: `placeholder` - def test_load_context_files_skips_default_placeholders(self):
### `server_modules/tests/test_workspace_context_memory_adapter.py`

- line `84`: `placeholder` - def test_load_workspace_context_payload_skips_default_placeholder_files(self):

