# Microsoft Agent Platform Gap Brief

Date: 2026-06-01

Purpose: handoff brief for the agent currently working in this repo. This document explains what Microsoft appears to have that Empyralis does not yet have as a productized surface, and what Empyralis should build next. This is not a Gateway rewrite plan. The Gateway, Agent Computer, supervisor, and hardware-control foundations already exist.

## Executive Decision

Empyralis is not mainly behind on raw computer control. The repo already has local computer capabilities, Agent Computer concepts, runtime attachment policy, transparency events, agent registry models, and approval/audit primitives.

The gap against Microsoft is the surrounding management layer:

1. Agent Control Center
2. Computer-use run viewer
3. Agent evaluation and certification
4. Agent identity and lifecycle
5. Cloud Computer provisioning with spend, audit, and tenant-isolation controls
6. Admin-governed connector and tool permissions

Do not spend the next pass adding random raw Gateway capabilities unless a missing capability blocks one of those six product surfaces.

## What Microsoft Is Actually Doing

Microsoft is packaging agentic work as an enterprise operating layer:

- Copilot Studio agents can use "computer use" to operate websites and desktop apps.
- Computer use includes hosted browser, registered machines, credentials, and allow-lists.
- Agent 365 is presented as a control plane for monitoring, securing, governing, and managing agents.
- Entra Agent ID turns agents into governable identities with Conditional Access, lifecycle management, registry visibility, and audit trails.
- Microsoft is pushing evaluation infrastructure, repeatable workflows, human handoffs, and quality standards as the operational model for serious agent deployment.

The lesson for Empyralis: the product should not only prove "the agent can use the computer." It should prove "the owner/admin can see, govern, test, certify, revoke, and audit every agent and every computer-use action."

## External Source Register

These sources were checked on 2026-06-01. Use these as the outside reference points for product direction.

| Source | Link | Relevant signal | Empyralis implication |
| --- | --- | --- | --- |
| Microsoft Copilot Studio computer use public preview | https://www.microsoft.com/en-us/microsoft-copilot/blog/copilot-studio/computer-use-is-now-in-public-preview-in-microsoft-copilot-studio/ | Copilot Studio agents can work across websites and desktop applications. Microsoft highlights hosted browser, credentials, allow-list, templates, and side-by-side computer/reasoning testing. | Empyralis needs a packaged "Computer Use" product flow, not just low-level Gateway tools. |
| Configure where computer use runs | https://learn.microsoft.com/en-us/microsoft-copilot-studio/configure-where-computer-use-runs | Microsoft exposes hosted browser, Cloud PC pool, and registered machine options for running computer-use tasks. | Empyralis should productize Cloud, This Device, Dedicated Computer, Cloud Computer, and Server/VPS as one coherent Agent Computer setup path. |
| Monitor computer use | https://learn.microsoft.com/en-us/microsoft-copilot-studio/monitor-computer-use | Microsoft exposes run activity, transcript views, screenshots, enhanced reporting, audit, and troubleshooting. | Empyralis needs a computer-use run viewer with screenshots, actions, blocks, approvals, and replay/export. |
| Human supervision for computer use | https://learn.microsoft.com/en-us/microsoft-copilot-studio/human-supervision-computer-use | Microsoft supports reviewer escalation and warns about prompt-injection risk from screenshots/web pages. | Empyralis should add owner/admin supervision queues and explicit prompt-injection safety around screen/browser tasks. |
| Computer use standalone tools | https://learn.microsoft.com/en-us/microsoft-copilot-studio/computer-use-standalone | Computer use can be a shared standalone tool with allowed websites/apps and human-in-the-loop supervision. | Empyralis should model computer-use permissions as reusable, policy-bound tools, not ad hoc per-agent switches. |
| Microsoft Agent 365 | https://www.microsoft.com/microsoft-agent-365 | Microsoft positions Agent 365 as a control plane with registry, agent map, analytics, role-specific governance, integration management, lifecycle rules, audit/logging, access control, data security, and threat protection. | Empyralis needs an Agent Control Center, effectively Agent 365-lite. |
| Microsoft Entra Agent ID migration docs | https://learn.microsoft.com/en-us/entra/agent-id/migrate-copilot-studio-agents-to-agent-id | Agent ID gives agents Conditional Access, lifecycle management, multi-cloud visibility, agent-specific audit trails, and registry visibility. | Empyralis needs a stable agent identity plane with owner, lifecycle, allowed users/tools/runtimes/apps, risk label, and revoke/rotate controls. |
| Add tools to custom agents | https://learn.microsoft.com/en-us/microsoft-copilot-studio/add-tools-custom-agent | Copilot Studio tools include connectors, flows, prompts, REST APIs, MCP, and computer use. It supports generative orchestration and end-user confirmation before tools run. | Empyralis should make tool configuration readable, enable/disable-able, permissioned, and testable per agent. |
| Microsoft 365 Copilot connectors overview | https://learn.microsoft.com/en-us/microsoft-365/copilot/connectors/overview | Microsoft states admins control which connectors and actions each agent can use. | Empyralis needs admin-governed connector/tool permissions and clean per-agent grants. |
| Microsoft 2026 Work Trend Index, agents and human agency | https://www.microsoft.com/en-us/worklab/work-trend-index/agents-human-agency-and-the-opportunity-for-every-organization | Microsoft emphasizes repeatable workflows, documented handoffs, quality standards, and evaluation infrastructure. | Empyralis Discovery and Studio templates should show certification/eval status before clone, deploy, or publish. |

## Repo Source Map

These are the internal repo sources that show Empyralis already has the foundation.

| Repo source | Relevant lines | What it proves |
| --- | --- | --- |
| `docs/domains/agent-computer/gateway-architecture.md` | 46-50, 69-78, 96-103, 121-149 | Cloud owns identity/policy/approvals, Gateway owns personal local sessions, supervisor stays narrow, personal and Studio channels stay separate. |
| `docs/domains/agent-computer/runtime.md` | 6-21, 23-43, 88-121 | Agent Computer is the user-facing runtime for local files, browser, terminal, desktop apps, personal channels, and machine execution. |
| `docs/agent-runtime-simplification.md` | 7-17, 19-34, 36-48 | Public runtime vocabulary is already clear: Cloud, Agent Computer, This Device, Dedicated Computer, Cloud Computer, Server/VPS; access modes are Default, Full Access, Custom. |
| `empyralis-supervisor/src/main.rs` | 243-274 | Rust supervisor already supports shell, filesystem, screenshot, OCR, mouse, click, type, keypress, clipboard, window listing, launch, notifications, AppleScript, and speech. |
| `server_modules/agent_registry_models.py` | 41-115 | Agent definitions, versions, manifests, installs, owners, status, enablement, and runtime profile references already exist. |
| `server_modules/agent_transparency_events.py` | 1-15, 29-50, 102-125 | Transparency events already model owner/admin/auditor views, policy blocks, tool actions, approvals, gateway actions, channel messages, and redacted metadata. |
| `server_modules/runtime_attachment_service.py` | 1260-1340, 1895-1907 | Runtime attachments already carry ownership, allowed agent IDs, health, lifecycle, root policy, owner approval, and privileged runtime approval gates. |
| `docs/platform/context.md` | 257-265, 352-405 | Execution is already brokered through policy-bound boundaries; durable run/activity/approval/notification truth exists, but rendered local/hybrid demos are not complete. |
| `docs/pending-tasks.md` | 383-387 | Cloud Computer is explicitly pending provisioning, spend limits, audit timeline, and tenant-isolation tests. |
| `docs/domains/apps/platform-inventory-and-user-owned-apps.md` | 208-220, 1604-1613 | Applications, Discover, Agents, and Agent Computer are separate surfaces; apps must not silently become agents, channels, or runtimes. |
| `docs/domains/channels/personal-vs-studio-channel-model.md` | 15-27, 30-50, 69-85, 102-123 | Personal channel sessions belong behind Gateway; business/API channels belong in the cloud connector stack. |
| `docs/domains/channels/foundation-strategy.md` | 11-17, 56-66, 101-118, 217-238 | Personal/private channels belong to Sage through Agent Computer; business/customer channels belong to Studio Agents through official cloud connectors. |
| `docs/references/openclaw-sage-gap-analysis.md` | 67-89, 144-172, 187-218 | Sage has strong platform structure, but gaps remain around user Chrome attach, browser state, diagnostics export, gateway profiling, status/doctor depth, and ACP-style integration. |

## What Empyralis Already Has

Empyralis already has enough foundation for serious computer-use work:

- Local hardware execution through `empyralis-supervisor`.
- Agent Computer as the public runtime concept.
- Gateway as the persistent local edge.
- Runtime attachment inventory and owner-approved runtime selection.
- Agent definitions, versions, installs, and manifests.
- Approval, policy, quota, kill switch, and transparency primitives.
- Separate lanes for personal local channels and Studio/business cloud connectors.
- App/Agent/Discovery/Agent Computer information architecture boundaries.

The current platform is not missing the basic idea. It is missing the polished management surface around the idea.

## What Microsoft Has That Empyralis Should Copy

### 1. Agent Control Center

Build a single control surface that shows every active agent-like entity:

- Sage
- Studio agents
- connected external agents
- app agents/templates
- agent templates cloned from Discovery
- Agent Computers
- Cloud Computers
- connected MCP servers/tools
- personal-channel bridges

Each row should expose:

- owner
- status
- runtime binding
- allowed tools
- allowed apps
- allowed connectors
- last activity
- current risk
- monthly cost/usage
- last eval result
- disable/revoke controls

This is the most important Microsoft-style gap.

### 2. Computer-Use Run Viewer

Build a run viewer for local/hardware/computer-use tasks:

- timeline of screenshots
- OCR or screen summary
- mouse/click/type/key actions
- app/window targeted
- tool calls
- blocked actions
- approval cards
- human takeover
- final result
- replay/export

Normal users can see a simplified version in Chat. Owners/admins can open the full audit view.

### 3. Agent Evaluation And Certification

Studio and Discovery need eval status before a template or agent feels real:

- last certified time
- passed/failed workflow tests
- knowledge retrieval test result
- unsafe-send test result
- computer-use test result
- connector permission test result
- customer-facing response quality score
- owner approval required for risky failures

Discovery should show this on cloneable templates:

- "Certified for local computer use"
- "Needs Agent Computer permission"
- "Passes 8/10 workflow checks"
- "External send requires owner approval"

### 4. Agent Identity And Lifecycle

Create a stable agent identity model above the current install/definition records:

- `agent_identity_id`
- display name
- owner
- workspace/tenant
- created by
- lifecycle state: draft, active, suspended, stale, revoked
- allowed users/groups
- allowed tools
- allowed runtimes
- allowed apps
- allowed connectors
- credential references
- risk label
- last audit event
- expiry or review date

This should not replace the existing registry immediately. It should project a clean management identity from the current registry/install/runtime records.

### 5. Cloud Computer Productization

Do not sell Cloud Computer until these exist:

- provisioning flow
- spend limits
- idle shutdown
- tenant-isolation tests
- audit timeline
- screenshot retention controls
- hosted runtime health
- owner/admin stop button
- billing estimate before launch

This maps directly to the repo's pending task in `docs/pending-tasks.md`.

### 6. Admin-Governed Tool And Connector Permissions

Empyralis needs a clearer admin surface for:

- per-agent MCP tools
- per-agent connector actions
- per-agent browser/computer-use grants
- per-agent app grants
- maker-provided vs end-user credentials
- end-user confirmation before tool execution
- owner/admin approval before risky actions
- one-click disable/revoke

This is where Microsoft is strong because Power Platform/M365 connectors are already admin-governed.

## What Not To Do

- Do not collapse Apps, Discovery, Agents, and Agent Computer into one generic "plugins" page.
- Do not expose personal WhatsApp, Telegram personal, WeChat personal, Signal, or iMessage as public Studio/business channels.
- Do not treat personal app/session control as invisible or undetectable automation.
- Do not make Discovery a runtime. Discovery should clone templates or apps and request explicit runtime permissions when needed.
- Do not build Cloud Computer without cost controls and tenant-isolation tests.
- Do not add Claude Code/Codex as ordinary Studio agents yet. Treat them as developer/runtime integrations or future ACP-style bridges, not customer-facing agent templates.

## Recommended Implementation Sequence

### Phase 1: Agent Control Center Inventory

Goal: one owner/admin page that lists agents, connected agents, tools, runtimes, and risk status.

Implementation shape:

- Use existing agent registry/install records.
- Use runtime attachment inventory.
- Use connected external agent records.
- Use MCP/tool registry records.
- Use transparency/action events for last activity.
- Add a normalized projection service if needed, but do not rewrite the underlying models first.

Acceptance:

- Owner can answer: "What agents exist, who owns them, what can they access, what did they do last, and how do I stop them?"

### Phase 2: Computer-Use Run Viewer

Goal: make every hardware/browser/desktop run inspectable.

Implementation shape:

- Extend or reuse transparency events.
- Correlate screenshot/OCR/action events to a run/session.
- Render simplified chat proof plus full owner/admin audit.
- Add exportable run proof for support/debugging.

Acceptance:

- Owner can inspect a computer-use task step by step and see approvals, blocks, screenshots, and final output.

### Phase 3: Eval And Certification

Goal: make Studio and Discovery trustworthy.

Implementation shape:

- Add eval suites for agent templates and deployed agents.
- Track certification result on template/agent card.
- Show pass/fail before clone/deploy.
- Add computer-use specific evals for app/window/control tasks.

Acceptance:

- Discovery templates are not just attractive cards. They have proof of behavior.

### Phase 4: Agent Identity Projection

Goal: clean management identity for every agent-like actor.

Implementation shape:

- Introduce a projection layer first.
- Map native agents, external agents, app agents, and templates to `agent_identity_id`.
- Add lifecycle and risk labels.
- Add revoke/disable/rotate actions.

Acceptance:

- Every agent-like actor has an owner, state, allowed resources, and audit trail.

### Phase 5: Cloud Computer

Goal: hosted runtime only after governance exists.

Implementation shape:

- Provisioning
- spend controls
- idle shutdown
- tenant-isolation tests
- audit timeline
- health/readiness
- owner/admin stop

Acceptance:

- Cloud Computer is sellable without creating billing or security risk.

## UI Placement

Keep the current information architecture:

- Agent Control Center belongs under `Control` or an owner/admin section of `Build`.
- Computer-use run viewer belongs under `Work` and can be linked from Chat.
- Agent eval/certification belongs inside Studio and Discovery cards.
- Agent Computer remains the runtime/hardware surface.
- Applications remains app inventory/creation.
- Discovery remains clone/install/template discovery.

The left navigation should not become a dumping ground. The feature should feel like one workspace operating system:

- Chat: ordinary interaction and simplified proof
- Work: runs, approvals, artifacts, activity
- Build: agents, applications, integrations, templates
- Control: policy, admin, runtime governance, agent fleet

## Product Language

Use public product names:

- Agent Computer
- This Device
- Dedicated Computer
- Cloud Computer
- Server/VPS
- Default
- Full Access
- Custom

Avoid exposing internal names in normal UI:

- `empyralis-gateway`
- `empyralis-supervisor`
- `local_companion`
- `self_host_runtime`
- raw provider/runtime IDs

## Final Recommendation

The next strategic pass should not be "more Gateway." It should be:

1. Agent Control Center
2. Computer-use run viewer
3. Eval/certification layer
4. Agent identity/lifecycle projection
5. Cloud Computer only after governance

That is the Microsoft gap that matters. Empyralis already has the technical substrate. The missing layer is productized governance, proof, and trust.
