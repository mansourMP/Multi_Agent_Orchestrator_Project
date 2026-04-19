# Design Reference

Prepared: 2026-04-18

Scope: information architecture, density, and product-surface reference for Empyralis, grounded in:

- current Empyralis code in `frontend/` and `shared/`
- official Linear documentation
- official Telegram documentation and blog posts
- official OpenClaw documentation

This document is meant to be executable. It is not a brand manifesto. It is a working IA and density reference for the next UI passes.

## 1. Information Architecture Analysis

### Linear

#### Structural pattern

Linear is layered, but the layers are shallow:

1. Persistent sidebar
2. Team or workspace view
3. Issue / project detail
4. Overflow or display options for advanced controls

The important thing is that the first two layers carry almost all daily work.

#### Navigation levels

| Level | What lives there | Notes |
| --- | --- | --- |
| Level 0 | Sidebar: Inbox, My Issues, Pulse, Favorites, Teams | Linear keeps the sidebar as the permanent home for work entry points, not just destinations. |
| Level 1 | Team pages: Triage, Issues, Cycles, Projects, Views | Teams expose their default pages directly in the sidebar. |
| Level 2 | View controls: filters, display options, board/list layout, custom views | These are close to the surface, usually top-right in the current view, not hidden in settings. |
| Level 3 | Archives, edge-case admin, less-used detail actions | Archives are intentionally available, but behind overflow or keyboard shortcuts rather than always visible. |

#### What is always visible

- Sidebar identity and primary work queues
- Current view title
- The list or board itself
- A dense but restrained row/card presentation
- Top-right display controls on supported views

Official docs show that teams expose `Triage`, `Issues`, `Cycles`, `Projects`, and `Views` directly in the sidebar, while archives are behind team overflow or shortcuts. Linear also keeps `Inbox`, `My issues`, `Pulse`, and `Favorites` as sidebar-first destinations, not buried settings pages. Sources: [Team pages](https://linear.app/docs/default-team-pages), [Inbox](https://linear.app/docs/inbox), [My issues](https://linear.app/docs/my-issues), [Favorites](https://linear.app/docs/favorites), [Pulse](https://linear.app/docs/pulse).

#### What is one tap away

- Switching from inbox to personal work to team work
- Switching between team pages
- Opening custom views
- Changing grouping, ordering, and display properties
- Opening an issue detail from any list

Linear’s `Display options` are explicitly surfaced at the top-right of supported views and control grouping, ordering, layout, and which properties are shown on rows/cards. That is a critical IA pattern: shape the current screen in place instead of forcing the user into settings. Source: [Display options](https://linear.app/docs/display-options).

#### What is buried

- Archives
- Rare workspace administration
- Edge-case view variants
- Some per-item actions through menus or command search

This is deliberate. Buried in Linear usually means “rare but recoverable,” not “core configuration.”

#### Empty vs active states

Linear minimizes blankness by keeping structure visible even when content is empty:

- the sidebar still gives context
- the view title still tells you where you are
- the display controls still tell you what kind of list this is
- the list remains the primary canvas

Even when there is no selected issue, the list view is still meaningful. Linear explicitly notes that by default no issue is selected when you open a list or board; the canvas is still useful because the list itself is the product surface. Source: [Select issues](https://linear.app/docs/select-issues).

#### IA takeaway

Linear feels fast because:

- primary work queues are visible at all times
- reshaping the current view is easier than navigating elsewhere
- archives and advanced administration stay out of the main lane
- the list itself is dense enough to feel alive before you open details

---

### OpenClaw

#### Structural pattern

OpenClaw is not a single SaaS-style web app. Its official docs describe a control-plane product split across:

1. Gateway / Control UI
2. chat surfaces (`WebChat`, messaging channels, TUI)
3. config and operational tooling
4. agents / nodes / sub-agents as deeper system layers

The important IA lesson is not “copy the whole app.” The lesson is how OpenClaw keeps operational state close to the active surface.

#### Navigation levels

| Level | What lives there | Notes |
| --- | --- | --- |
| Level 0 | Control UI at `/`, chat channels, WebChat, TUI | The product has multiple front doors, but all attach to the same gateway. |
| Level 1 | Config tab, Logs tab, usage/status surfaces, session lists | Operational state is near the surface rather than hidden behind a separate admin product. |
| Level 2 | Raw JSON config, channel-specific configuration, multi-agent routing, sandboxing, node topology | Power-user surfaces exist, but they are documented as configuration, not treated as daily chat UX. |
| Level 3 | Deep reference docs, schema-level editing, network and remote-gateway mechanics | Advanced but still explicit. |

#### What is always visible

Confirmed from official docs:

- the Gateway is the central control plane
- channels, routing, and sessions belong to the Gateway
- UI clients must read session lists and token counts from the Gateway
- the browser Control UI is served at `/`

Sources:

- [Dashboard (Control UI)](https://openclawlab.com/docs/web/dashboard/)
- [Session Management](https://openclawlab.com/en/docs/concepts/session/)
- [FAQ](https://openclawlab.com/en/docs/help/faq/)

#### What is one tap away

From docs, OpenClaw keeps these close:

- Config editing in the Control UI
- Raw JSON editor as an escape hatch
- Logs tailing in the Control UI
- per-session usage and cost readouts
- channel and provider usage windows

Confirmed examples:

- the Control UI has a `Config` tab that renders a form from the config schema, plus a raw JSON editor
- the Control UI has a `Logs` tab that tails file logs via the gateway
- `/status` shows current session model, context usage, last-response tokens, and estimated cost when API-key auth is used
- `/usage full` appends a usage footer to every reply

Sources:

- [Configuration](https://openclawlab.com/en/docs/gateway/configuration/)
- [Logging](https://openclawlab.com/en/docs/gateway/logging/)
- [API Usage and Costs](https://openclawlab.com/en/docs/reference/api-usage-costs/)

#### What is buried

- multi-agent topology
- node pairing and remote device tooling
- sandboxing and browser-control internals
- channel policy edge cases

These are powerful features, but OpenClaw keeps them in config/reference layers rather than pretending they are casual top-level UI actions.

#### Empty vs active states

OpenClaw’s docs imply a strong “alive even when quiet” pattern:

- sessions have durable keys and token counts
- usage and cost can be surfaced inline in chat and CLI
- the gateway owns channel/session state even when the current chat is idle
- logs and config are first-class surfaces, so the system rarely feels like an empty canvas

The product stays alive because operational state is visible:

- session store
- channel state
- cost state
- logs
- config

It is not relying on decorative empty-state copy to communicate readiness.

#### IA takeaway

OpenClaw’s best transferable ideas are:

- treat operational state as product state
- keep config, logs, usage, and sessions near the active workspace
- make advanced power surfaces explicit, not magical
- let the main chat be simple while nearby surfaces expose truth about the system

---

### Telegram

#### Structural pattern

Telegram’s architecture is deceptively simple:

1. Chat list
2. Folder or archive layer
3. Conversation view
4. Chat info / settings

It is a messaging product, so the list is the platform.

#### Navigation levels

| Level | What lives there | Notes |
| --- | --- | --- |
| Level 0 | Chat list, folder tabs when enabled, archive entry, pinned chats | This is the permanent navigation backbone. |
| Level 1 | Individual chat thread | One tap from the list. |
| Level 2 | Search, profile/info sheets, media, pinned content, settings inside a chat | Useful, but secondary to the thread itself. |
| Level 3 | Deep chat management and service settings | Not part of the daily message loop. |

#### What is always visible

- the list of chats
- message previews
- timestamps
- unread state
- pins
- folder tabs when the list becomes cluttered

Telegram’s own blog states that folders appear once the chat list gets cluttered, and that users can swipe between tabs to reach different chat groups quickly. Each folder can have unlimited pinned chats. Sources: [Chat Folders, Archive, Channel Stats and More](https://telegram.org/blog/folders?setln=en), [Folders API](https://core.telegram.org/api/folders).

#### What is one tap away

- opening the thread
- moving between folders
- archive access
- pinned chats inside a folder

Telegram’s archive behavior is especially important as a density reference:

- archived chats pop back out when notified
- muted chats stay archived
- archive can be hidden from the main list and revealed by pull-down

Sources:

- [Archived Chats, a New Design and More](https://telegram.org/blog/archive-and-new-design)
- [Chat Folders, Archive, Channel Stats and More](https://telegram.org/blog/folders?setln=en)

#### What is buried

- deeper info panels
- less-used chat management tools
- advanced settings

Telegram does not waste top-level attention on configuration. The list and thread stay dominant.

#### Empty vs active states

Telegram handles active state better than most productivity apps because the list is intrinsically alive:

- every row shows a preview
- every row shows recency
- unread counts make the surface dynamic
- archived and pinned rows change importance without changing layout

Even with minimal chrome, the product feels alive because every row carries enough state to answer:

- who
- what happened
- when
- whether it needs attention

#### IA takeaway

Telegram’s most relevant lessons for Empyralis are:

- previews matter more than decorative panels
- timestamps and unread state make a list feel alive
- folders and archive reduce clutter without deleting access
- configuration belongs below the main messaging surface, not inside it

---

### Cross-platform summary

| Platform | Primary surface | Always visible | One tap away | Buried |
| --- | --- | --- | --- | --- |
| Linear | Sidebar + list/board | work queues, current view, dense rows, display controls | view switching, filters, detail open | archives, rare admin |
| OpenClaw | chat + control plane | session truth, channel truth, config/log/usage surfaces | config tab, logs, cost/usage, session switching | topology, sandboxing, deep config |
| Telegram | chat list + thread | previews, time, unread, pins, folders/archive | thread open, folder switching, archive | deep chat management |

## 2. Current Empyralis IA Audit

This section maps the workspace as it actually exists in the current codebase, not as a future plan.

### Level map

#### Level 0: always visible

Current source: `frontend/app/(account)/AccountTenantSwitcher.tsx`

- Sage rail icon
- Studio rail icon
- conditional monthly usage pill
- theme toggle
- Settings rail icon

This is a narrow rail. It is structurally clean, but it carries almost no semantic state besides active destination and optional spend.

#### Level 1: one click from the current surface

Current source: `frontend/lib/workspace/workstation-kernel-shell.tsx`

When Sage is active:

- Chat
- History
- Memory
- Files, only when artifacts capability is present

When Studio is active:

- studio
- inbox
- deploy

When Settings is active:

- settings only

This means Settings currently collapses all configuration into a single titlebar entry, while Sage and Studio each expose richer context navigation.

#### Level 2: two clicks deep

Current source: `frontend/lib/workspace/workstation-settings-pane.tsx`

Inside Settings, the left-side section navigation exposes:

- Account
- Devices
- Channels
- Sage
- Usage
- Billing
- Privacy & Safety

This is the first place where configuration starts to become structured.

#### Level 3: three or more clicks deep

Current sources:

- `frontend/lib/workspace/workstation-sage-settings-pane.tsx`
- `frontend/lib/workspace/workstation-deployed-agents-pane.tsx`

Level 3 items include:

- Sage sub-tabs:
  - Providers
  - Tools
  - Connectors
- specialist selection in Studio
- specialist detail editing
- specialist wizard flow
- connector management inside the Telegram pairing surface

This is where core product configuration begins to feel buried.

### Current click-depth by user need

| User need | Current path | Click depth from Sage | Notes |
| --- | --- | ---: | --- |
| Run history | Titlebar -> History | 1 | Good placement; this belongs near chat. |
| Explicit memory management | Titlebar -> Memory | 1 | Good placement; still missing richer memory policy controls. |
| Files/artifacts | Titlebar -> Files | 1 when capability exists | Good when present, but invisible for workspaces without artifacts capability. |
| Workspace settings | Rail -> Settings | 1 | Reasonable entry point. |
| Sage provider connection | Rail -> Settings -> Sage -> Providers | 3 | Too deep for first-run setup. |
| Sage tool toggles | Rail -> Settings -> Sage -> Tools | 3 | Too deep for a core assistant capability surface. |
| Sage connectors | Rail -> Settings -> Sage -> Connectors | 3 | Too deep; also mixed with channel pairing specifics. |
| Specialist list | Rail -> Studio | 1 | Good. |
| Specialist inbox | Rail -> Studio -> Inbox titlebar link | 2 | Acceptable. |
| Specialist deploy view | Rail -> Studio -> Deploy titlebar link | 2 | Acceptable. |
| Specialist tool / memory config | Rail -> Studio -> select specialist -> detail editor | 3 | Buried for a daily operator task. |
| Specialist Telegram binding | Rail -> Studio -> select specialist -> detail or wizard | 3 | Buried, but acceptable if deploy flows are infrequent. |
| Channel operations console | Rail -> Settings -> Channels | 2 | Operational, not product-level. |
| Billing / usage | Rail -> Settings -> Billing or Usage | 2 | Acceptable for administrative info. |

### Current IA strengths

- Sage and Studio are clearly separated at the rail level.
- Sage keeps run history and memory close to chat.
- Studio exposes its major sub-modes at titlebar level, not buried inside settings.
- Settings has a clearer structure than earlier versions because Sage now has its own section.

### Current IA weaknesses

#### 1. Core Sage configuration is too deep

Providers, tools, and connectors are all three clicks from the main product surface.

For a chat-first product, provider readiness and tool readiness are first-run-critical. They should feel “adjacent to chat,” not “deep inside settings.”

#### 2. Settings is stateful but not deep-linkable

The Settings section and Sage sub-tabs are currently local `useState` UI state, not URL-routed state.

That means:

- the UI cannot deep-link to `Settings > Sage > Providers`
- the user cannot bookmark exact setup locations
- CTA links cannot reliably drop the user into the exact configuration sub-surface

That is an IA cost, not just an implementation detail.

#### 3. There is no true workspace landing page

The current live manifest does not expose a `home` route. The active route set is:

- `chat`
- `runs`
- `approvals`
- `artifacts`
- `notifications`
- `activity`
- `studio`
- `channels`
- `inbox`
- `deploy`
- `settings`

So the workspace opens into an operational surface rather than a briefing surface.

#### 4. Studio configuration splits between list, detail, and wizard

Studio works, but specialist configuration is fragmented:

- some status is in the list
- some detail is in the selected panel
- some critical setup only appears in the wizard

This makes specialist operations feel heavier than they need to.

### Current IA by level

| Level | Empyralis content |
| --- | --- |
| Level 0 | Sage, Studio, cost pill, theme toggle, Settings |
| Level 1 | Sage titlebar links; Studio titlebar links; Settings has no subsection titlebar |
| Level 2 | Settings section nav |
| Level 3 | Sage sub-tabs, Studio detail/wizard, Telegram pairing detail |

### Bottom-line IA diagnosis

Empyralis currently has a clean shell, but the information hierarchy is inverted in one important way:

- activity is shallow
- configuration is deep

That is the opposite of what first-run AI products need. The user needs provider state, tool state, and connector state earlier and closer to Sage.

## 3. Information Density Principles

This section focuses on the transferable patterns from Linear and OpenClaw.

### What is always shown in the sidebar

#### Linear

Always-shown sidebar items are not random destinations. They are work queues:

- Inbox
- My Issues
- Pulse
- Favorites
- Teams

Each item answers a concrete question:

- what needs attention
- what belongs to me
- what changed
- what I return to often
- where team work lives

#### OpenClaw

OpenClaw’s docs imply a different but equally useful rule:

- keep the control plane and operational truth near the top
- don’t hide cost, config, logs, or sessions in obscure admin views

The sidebar lesson from OpenClaw is not “show more icons.” It is “put truth near the surface.”

### How they show status without clutter

#### Linear

Linear compresses status into:

- badges
- row properties
- grouping
- ordering
- unread or queue counts
- right-sized preview metadata

It does not force large dashboard cards above every list.

#### OpenClaw

OpenClaw surfaces status as operational facts:

- current model
- token usage
- cost
- provider quotas
- logs
- channel state

The UI stays honest because state is shown where it matters, not summarized into generic marketing tiles.

### How they make the workspace feel alive with minimal data

#### Linear

Linear feels alive because:

- the list is dense
- every row has enough metadata to matter
- there is always a queue to return to
- Pulse and Inbox provide motion even when the current project is quiet

#### OpenClaw

OpenClaw feels alive because:

- chat is not isolated from system truth
- session state, usage, and logs remain close
- even quiet periods still have operational context

#### Combined principle

A workspace feels alive when at least one of these is visible:

- recent activity
- current state
- next action

It feels dead when the user sees only decorative chrome plus blank whitespace.

### Dense but readable vs cluttered

#### Dense but readable

- one strong heading per zone
- secondary labels at 12–13px
- main body copy at 14–15px
- one-line previews before multi-line explanations
- spacing increments that repeat predictably
- rows separated by rhythm, not heavy cards
- tertiary text used for metadata, not core actions

#### Cluttered

- multiple stacked cards before primary content
- repeated borders and containers
- actions repeated in several zones
- large blocks of explanatory copy above the thing the user came to do
- equal visual weight for primary and secondary state

### Practical density rules for Empyralis

1. The chat thread list, run history, and specialist roster should be row-first, not card-first.
2. Status should be encoded in one line of metadata before it becomes a whole panel.
3. Use compact counts, badges, and previews before using dashboard tiles.
4. Empty surfaces should still show the structure of the product, not just a centered sentence.
5. If a setting affects whether Sage can operate, it belongs near chat or in a compact context strip, not only in Settings.

## 4. Specific Recommendations for Empyralis

Constraint: these changes do not restructure the left rail or top panel. They improve information density and surface truth inside the existing shell.

| # | What to change | Why | File to change | Effort |
| --- | --- | --- | --- | --- |
| 1 | Add a compact Sage context strip above the transcript showing provider/model, runtime target, and pending approvals count. | OpenClaw keeps operational truth near chat; users should not hunt for whether Sage is actually configured and runnable. | `frontend/lib/workspace/workstation-chat-pane.tsx` | Medium |
| 2 | On an empty Sage transcript, replace pure emptiness with a three-item action block: resume recent thread, connect provider, create specialist. | Linear and Telegram both avoid dead starts by presenting immediate next actions inside the main surface. | `frontend/lib/workspace/workstation-chat-pane.tsx` | Medium |
| 3 | Add a compact summary row at the top of `Settings > Sage`: connected providers count, enabled tools count, connected connectors count. | Linear keeps high-value state visible before deeper drill-down; this makes Sage settings scannable in one glance. | `frontend/lib/workspace/workstation-sage-settings-pane.tsx` | Low |
| 4 | Make Settings sections and Sage sub-tabs URL-addressable with search params. | Core configuration is already deep; at minimum it must be linkable and bookmarkable. | `frontend/lib/workspace/workstation-settings-pane.tsx`, `frontend/lib/workspace/workstation-sage-settings-pane.tsx` | Medium |
| 5 | Add small counts or state badges to Sage titlebar links where relevant, especially History and Memory. | Linear’s sidebar and queue surfaces feel alive because counts and recency are attached to destinations, not hidden inside them. | `frontend/lib/workspace/workstation-kernel-shell.tsx` | Medium |
| 6 | Convert the top of the Runs surface into a true recent-thread list with date grouping and no dashboard stat tiles. | Telegram-style preview rows communicate more with less space than cards; this makes run history feel like continuity, not task admin. | `frontend/lib/workspace/workstation-runs-pane.tsx`, `frontend/lib/ui/chrome.css` | Medium |
| 7 | Add specialist health and last-activity preview directly into Studio roster rows: channel, deploy state, last message time. | Linear’s lists feel alive because rows answer the next decision without opening details. Studio rows should do the same. | `frontend/lib/workspace/workstation-deployed-agents-pane.tsx` | Medium |
| 8 | Keep tools rows flat, but add direct inline actions when a tool is blocked by a missing connector, for example “Connect Gmail.” | OpenClaw makes config and action adjacent. A blocked tool row should take the user directly to the missing dependency. | `frontend/lib/workspace/workstation-sage-tools-pane.tsx`, `frontend/lib/workspace/workstation-sage-connectors-pane.tsx` | Low |
| 9 | Add a compact “recent activity” module to the top of Settings home state or Sage empty state rather than relying on standalone usage/billing pages for aliveness. | Linear uses Inbox and Pulse to keep quiet spaces alive; Empyralis needs one lightweight feed near the main workspace, not only in buried surfaces. | `frontend/lib/workspace/workstation-chat-pane.tsx` or `frontend/lib/workspace/workstation-settings-pane.tsx` | Medium |
| 10 | Reduce explanatory copy above primary actions in Studio and Settings, replacing paragraphs with one-line descriptions and moving detail into secondary text or tooltips. | Dense but readable requires shorter intros and faster action acquisition. Current copy often explains before it lets the user act. | `frontend/lib/workspace/workstation-settings-pane.tsx`, `frontend/lib/workspace/workstation-deployed-agents-pane.tsx`, `frontend/lib/ui/chrome.css` | Low |

### Recommendation priority

If these are sequenced by product impact rather than code difficulty, the order should be:

1. Sage context strip
2. Empty-Sage action block
3. Settings deep-linking
4. Runs surface densification
5. Studio roster densification
6. Sage settings summary strip
7. Blocked-tool inline actions
8. Titlebar state badges
9. Recent-activity module
10. Copy compression pass

## 5. The Sage Surface Specifically

Sage is the product. The chat surface should not behave like a blank shell that points elsewhere for truth.

### What should always be visible when Sage is open

#### Always visible

1. Current provider and model
2. Current execution target
   - cloud
   - local companion
   - offline / unavailable if relevant
3. Whether Sage is blocked
   - missing provider
   - approval required
   - tool unavailable
4. The active conversation transcript
5. Composer controls

These are not “advanced diagnostics.” They are core product-state indicators.

### What the user should never have to hunt for

1. Can Sage actually answer right now?
2. Which model/provider is answering?
3. Is Sage using cloud or local execution?
4. What memory will be carried forward into the next turn?
5. Is there a pending approval blocking progress?
6. Where is the last piece of work I was doing?

If any of those answers require a trip to Settings, the chat surface is under-informing the user.

### Exact information to surface inline, without clutter

#### A. Top context strip

One horizontal strip above the transcript, single-line on desktop.

Suggested content:

- `Anthropic / Claude Sonnet`
- `Cloud runtime`
- `3 memory items active`
- `1 approval waiting` only when relevant

This should be tertiary in tone, not a hero banner.

#### B. Memory capsule

A compact collapsible capsule near the top of the chat view:

- label: `Carrying forward`
- first 2–3 memory bullets only
- `Manage memory` action

Do not show the full memory editor by default. Show the summary that affects the next response.

#### C. Inline recent-thread block when transcript is empty

If there are recent runs, show the last 3 as Telegram-style preview rows:

- time
- first message preview
- status

This keeps the chat surface alive and reduces the need to jump to History for simple resumption.

#### D. Inline approval state

Approval state should remain inline between relevant turns, not hidden in a separate page unless the user wants detail.

The current inline approval card direction is correct. The missing piece is making approval presence visible before the user scrolls into a blocked turn.

#### E. Inline tool/provider blockers

If Sage cannot use a requested capability because of missing configuration, the chat surface should say so once, compactly, with a real action:

- `Connect provider`
- `Enable web search`
- `Connect Gmail`

No passive warning copy. The banner must resolve the problem or not exist.

### What should stay out of the main Sage view

- full provider management tables
- full connectors grid
- specialist configuration internals
- billing and analytics detail
- generic dashboard cards above the transcript

Those belong one level away. Sage should surface truth, not become a control panel.

### Recommended Sage hierarchy

1. Titlebar and route context
2. Compact context strip
3. Transcript
4. Inline trace and approvals as they happen
5. Composer
6. Empty-state recent-thread / first-run setup assistance only when needed

### Design rule for Sage

If a piece of information changes whether the user trusts the next answer, it belongs in Sage.

That includes:

- model
- runtime
- memory carry-forward
- approval blockers
- recent continuity

It does not include:

- billing detail
- large settings panels
- specialist admin

## Working conclusion

The most useful reference blend for Empyralis is:

- Linear for dense navigation and work-queue clarity
- Telegram for preview rows, recency, and low-clutter messaging hierarchy
- OpenClaw for surfacing operational truth close to the assistant

Empyralis already has a cleaner shell than before. The remaining gap is not shell structure. The gap is where product truth lives.

Today:

- activity is easy to reach
- configuration is too deep
- operational readiness is not visible enough inside Sage

The next UI pass should therefore optimize for:

1. visible readiness
2. visible continuity
3. denser rows
4. linkable configuration
5. less explanatory chrome above primary work

## Sources

### External references

- Linear:
  - [Team pages](https://linear.app/docs/default-team-pages)
  - [Inbox](https://linear.app/docs/inbox)
  - [My issues](https://linear.app/docs/my-issues)
  - [Favorites](https://linear.app/docs/favorites)
  - [Pulse](https://linear.app/docs/pulse)
  - [Custom views](https://linear.app/docs/custom-views)
  - [Display options](https://linear.app/docs/display-options)
  - [Select issues](https://linear.app/docs/select-issues)
- Telegram:
  - [Chat Folders, Archive, Channel Stats and More](https://telegram.org/blog/folders?setln=en)
  - [Archived Chats, a New Design and More](https://telegram.org/blog/archive-and-new-design)
  - [Folders API](https://core.telegram.org/api/folders)
- OpenClaw:
  - [Dashboard (Control UI)](https://openclawlab.com/docs/web/dashboard/)
  - [FAQ](https://openclawlab.com/en/docs/help/faq/)
  - [Session Management](https://openclawlab.com/en/docs/concepts/session/)
  - [Configuration](https://openclawlab.com/en/docs/gateway/configuration/)
  - [Logging](https://openclawlab.com/en/docs/gateway/logging/)
  - [API Usage and Costs](https://openclawlab.com/en/docs/reference/api-usage-costs/)

### Empyralis code references

- `shared/nav-manifest.ts`
- `frontend/app/(account)/AccountTenantSwitcher.tsx`
- `frontend/app/(account)/w/[workspaceId]/WorkspaceSurfacePage.tsx`
- `frontend/lib/workspace/workstation-kernel-shell.tsx`
- `frontend/lib/workspace/workstation-settings-pane.tsx`
- `frontend/lib/workspace/workstation-sage-settings-pane.tsx`
- `frontend/lib/workspace/workstation-sage-providers-pane.tsx`
- `frontend/lib/workspace/workstation-sage-tools-pane.tsx`
- `frontend/lib/workspace/workstation-sage-connectors-pane.tsx`
- `frontend/lib/workspace/workstation-deployed-agents-pane.tsx`
