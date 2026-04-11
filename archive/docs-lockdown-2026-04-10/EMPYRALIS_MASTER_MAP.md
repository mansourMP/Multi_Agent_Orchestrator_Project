# EMPYRALIS MASTER MAP

Status: canonical internal architecture doctrine  
Date: 2026-04-09  
Audience: founder, product, design, backend, frontend, security, GTM  
Purpose: define the final product, UI, backend, and security architecture for Empyralis as one AI Operating System

---

## 1. Core Truth

Empyralis is an **AI Operating System for authorized digital work**.

The visible product is not:
- a workflow builder
- a marketplace with chat attached
- a dashboard collection
- a loose group of agents

The visible product is:
- **one Master Agent: Sage**
- one premium shell
- one execution ledger
- one trust model
- many specialized workers behind the curtain

Users should feel:
- I talk to Sage
- Sage understands my world
- Sage can delegate to specialists
- Sage can act through my tools, devices, and channels
- I can approve, supervise, interrupt, and kill anything

Everything else exists to make that relationship real.

---

## 2. The Ecosystem At A Glance

Empyralis has four architectural layers:

1. **Sage Layer**
- the user-facing AI operating system
- the default home on web, desktop, and mobile
- the orchestrator of every other capability

2. **Specialist Layer**
- domain agents with clear business roles
- installable, configurable, testable, sellable
- visible through Sage, but not equal to Sage

3. **Harness Layer**
- the execution substrate
- runs, approvals, interventions, retries, audits, memory hydration, scheduling, and delegation

4. **Security Layer**
- tenant isolation
- scoped tools
- approval enforcement
- sandboxed execution
- auditability

The product should always present this to the user as one operating system, not four systems.

---

## 3. Product Surfaces

### 3.1 The canonical visible shell

Primary navigation:
- `Sage`
- `Runs`
- `Agents`
- `Store`
- `Integrations`

Utility navigation:
- `Usage`
- `Account`
- `Settings`

### 3.2 What each surface means

#### Sage
- default home
- master thread
- proactive system assistant
- cross-agent overview
- approvals and live work surfaced inline

#### Runs
- the system of record for work in motion and work completed
- cockpit, interventions, lineage, outputs, kill control

#### Agents
- installed and available specialists
- their chat channels
- their owner controls

#### Store
- installable first-party and third-party agents/templates
- future commercial catalog

#### Integrations
- connected systems, credentials, machines, channel endpoints, runtime health

### 3.3 What is hidden or demoted

These are not top-level product nouns:
- workflows
- raw builder/composer
- blueprints as a consumer-facing section
- control center
- raw health admin
- raw machine management
- approval inbox as a peer product
- artifacts as a peer product

If they exist, they live:
- inside `Runs`
- inside `Agents`
- inside `Integrations`
- or inside advanced `Studio` mode

---

## 4. The Mobile Ecosystem

## 4.1 Product thesis

Mobile is not a shrunk dashboard.

Mobile is **Telegram for AI operations**:
- chat-first
- channel-based
- fast supervision
- immediate intervention
- ambient intelligence

The user should be able to run a company from their phone by talking to Sage and checking the channels that matter.

## 4.2 Mobile information architecture

Bottom navigation:
- `Sage`
- `Runs`
- `Agents`
- `More`

`More` contains:
- Store
- Integrations
- Usage
- Settings
- Account

The mobile home is always Sage.

## 4.3 Sage on mobile

Sage is pinned at the top of the channel stack.

Sage has:
- global system context
- awareness of active runs, escalations, approvals, and outputs
- cross-app summaries
- proactive notifications
- the ability to route into a specialist channel or execute directly

Sage is the only surface that should feel omniscient.

Example Sage behaviors:
- “Customer Support has 3 unresolved escalations.”
- “Inventory agent paused on supplier confirmation.”
- “I drafted tomorrow’s dispatch summary. Approve?”

## 4.4 Agent channels

Every specialist agent gets its own persistent thread.

Examples:
- `Customer Support`
- `Inventory`
- `Operations`
- `Recruiting`
- `Compliance`

These channels behave like business-function inboxes:
- history is persistent
- outputs are contextual
- approvals appear inline
- owner can jump into test mode or owner mode

Sage may delegate into a channel, but the channel itself remains legible and self-contained.

## 4.5 Multi-modal endpoints

Each deployable business agent can own one or more external addresses:
- phone number
- email inbox
- WhatsApp handle
- Telegram handle
- Slack identity
- web chat widget identity

These endpoints are not independent “products.” They are ingress channels mapped onto one agent identity.

Model:
- one agent
- many channels
- one execution ledger
- one owner-visible thread

This means:
- a WhatsApp customer conversation
- an email thread
- a web chat session

can all map into the same agent channel and owner oversight model.

## 4.6 Mobile supervision doctrine

Mobile must be strongest at:
- reading what is happening
- approving or denying sensitive actions
- killing work
- reviewing outputs
- answering as Sage or through a specialist

Mobile does not need to expose every admin setting.
It must expose maximum control with minimum friction.

---

## 5. The Agent Lifecycle

## 5.1 Canonical model

An agent moves through these stages:

1. `Template`
- reusable definition
- first-party, private, or commercial

2. `Installed agent`
- bound to a workspace
- configured with tools, channels, policies, and memory scopes

3. `Live channel`
- operational conversation thread
- owner-visible and customer-testable

4. `Commercial asset`
- optionally published to Store
- versioned and monetizable

## 5.2 Sage versus specialists

Sage is not an installable card in the same way as specialists.

Sage is:
- always present
- global
- workspace-wide
- system-aware

Specialists are:
- scoped
- task-oriented
- configurable
- optionally commercialized

Sage uses specialists.  
Specialists do not replace Sage.

---

## 6. Creator Studio And Testing

## 6.1 Product thesis

Every serious business owner needs two ways to interact with an agent:
- as the **owner/operator**
- as the **customer/end user**

That duality must be explicit inside the agent experience.

## 6.2 Owner Mode vs Customer Mode

Inside a specific agent’s chat, there is a top-level mode switch:
- `Customer Mode`
- `Owner Mode`

### Customer Mode

Purpose:
- simulate the exact experience an outside user would have

Rules:
- same persona
- same tool access
- same channel formatting
- same approval behavior
- same fallback behaviors
- no privileged owner hints

Use cases:
- test support agent replies
- simulate a customer asking for a refund
- test a WhatsApp assistant exactly as a real customer would experience it

### Owner Mode

Purpose:
- transform the channel into an operator command center

Contains:
- Bible editor
- tool bindings
- channel bindings
- memory sources
- escalation policy
- metrics
- failed conversations
- safety posture
- version history
- test harness

Owner Mode is where the business configures the agent.
Customer Mode is where the business experiences the agent.

## 6.3 The Agent Bible

Every agent has a “Bible,” which is its canonical business operating doctrine.

The Bible includes:
- role and purpose
- tone and behavioral rules
- task boundaries
- escalation rules
- refund/approval/business rules
- compliance language
- knowledge references
- output format expectations

The Bible is not a giant prompt blob exposed raw forever.
It is a structured, versioned source document.

## 6.4 Creator Studio doctrine

Studio exists, but it is not the face of the product.

Studio is:
- advanced
- owner-facing
- nested under the agent lifecycle
- used to create, refine, version, and commercialize templates

Studio should be reachable from:
- `Agents`
- `Store`
- a specific agent’s Owner Mode

Studio should not dominate the default shell.

---

## 7. The Efficiency And Cost Engine

## 7.1 Problem statement

A 50-page business manual cannot be injected into every turn.

That would:
- explode token cost
- increase latency
- reduce reasoning quality
- make agents brittle

So the Bible must be stored as a structured corpus, not pushed whole into the prompt.

## 7.2 Architecture principle

The Bible is **compressed into retrievable context units**.

At runtime, the agent receives only the minimum relevant pieces needed for the current turn.

## 7.3 Canonical context architecture

Each agent’s knowledge layer is split into:

1. **Core identity context**
- small permanent system prompt
- role
- tone
- non-negotiable rules
- escalation doctrine

2. **Operational policy blocks**
- refunds
- pricing
- eligibility rules
- SLAs
- approval thresholds

3. **Knowledge/reference blocks**
- FAQ fragments
- SOP fragments
- documents
- websites
- product manuals
- compliance docs

4. **Memory layers**
- thread memory
- agent memory
- workspace memory
- customer/entity memory

## 7.4 Retrieval pipeline

Per turn, the runtime should assemble context in this order:

1. user input arrives
2. intent classifier determines task type
3. retrieval planner picks relevant policy and knowledge domains
4. vector search returns top candidate fragments
5. rule engine injects mandatory policy fragments
6. memory layer injects thread/entity context
7. final context pack is assembled
8. model executes on the reduced, relevant working set

The model should never receive the full Bible unless the task explicitly requires a broad planning pass.

## 7.5 Data structures

Each Bible should be stored as:
- versioned source document
- chunked semantic fragments
- embeddings
- metadata tags
- policy severity tags
- scope tags
- freshness/version tags

Each fragment needs metadata like:
- `agent_id`
- `workspace_id`
- `tenant_id`
- `source_type`
- `section_type`
- `priority`
- `requires_injection`
- `channel_scope`
- `audience_scope`

## 7.6 Context classes

There are four context classes:

### Hard context
- always injected
- identity, safety, and legal boundaries

### Triggered policy context
- injected when the request hits a matching business rule

### Retrieved knowledge context
- semantically fetched
- ranked by relevance + recency + trust

### Episodic memory
- pulled from thread/customer/workspace history

## 7.7 Cost doctrine

To keep cost under control:
- keep the permanent system prompt small
- push knowledge into retrieval
- use structured policy references instead of prompt duplication
- summarize long threads progressively
- compact stale memory into higher-level abstractions
- cache embeddings and chunk indexes
- support model tiering:
  - small model for routing/classification
  - larger model for critical reasoning

The goal is:
- cheap when routine
- rich when necessary
- never bloated by default

---

## 8. The Secure Foundation

## 8.1 Security doctrine

Empyralis must behave like a building with locked rooms, not a shared open floor.

If Business A buys an agent, that agent must be physically and logically prevented from:
- reading Business B’s data
- using unlicensed tools
- reaching unauthorized machines
- escaping its execution boundary

## 8.2 What is implemented now

### Strict tenant and workspace identity

The backend now enforces explicit scope instead of a shared fallback:
- the ghost shared `default` fallback was removed from auth behavior
- missing tenant/workspace mappings fail closed
- routes and services are expected to carry explicit scope

### Postgres Row-Level Security

Tenant-scoped control-plane tables now have database-enforced isolation via RLS.

This means:
- rows are protected by Postgres policy, not just app code
- requests operate under session scope variables
- a query cannot legally return or mutate rows outside the active tenant/workspace boundary

Key session scope pattern:
- `app.current_tenant_id`
- `app.current_workspace_id`
- `app.rls_bypass` only for tightly controlled internal/bootstrap flows

This is the correct foundation for external multi-tenant scale.

### Fail-closed persistence

Critical run-state persistence no longer logs and continues in the dangerous paths.

This reduces split-brain failure where:
- runtime thought it succeeded
- database state silently diverged

### CAS run claims and scoped execution state

Run claims were hardened so workers cannot overwrite one another’s ownership casually.

This matters because authorization and durability become meaningless if execution ownership is racy.

### Atomic file writes and resource locking

Local file mutation paths now use:
- per-target locks
- bounded retry/fail behavior
- atomic replace for writes

This reduces same-file corruption under concurrency.

## 8.3 What still must happen

### Compute sandboxing

This is the next major security wall.

Policy alone is not enough.  
Agent execution must be isolated by compute boundary.

Required future path:
- per-run or per-tenant containerized execution
- hardened seccomp/apparmor or equivalent sandbox policy
- microVM path for high-trust or enterprise execution tiers
- explicit distinction between:
  - cloud-safe tools
  - privileged local edge tools

### Edge runtime doctrine

The local companion is a privileged edge runtime.

It should be treated as:
- explicit
- auditable
- revocable
- highly scoped

Not as generic “safe local execution.”

### Tool keycards

Long term, tool access must be enforced at the install/entitlement layer:
- what was sold
- what was installed
- what was approved
- what machine or channel it may touch

Every execution should carry a product keycard, not just a broad workspace permission.

### Cryptographic approvals

Approval cards are real, but future approval tokens should be:
- signed
- step-bound
- expiry-bound
- execution-envelope-bound

So sensitive execution cannot be replayed or spoofed by payload tricks.

---

## 9. Backend Domain Map

## 9.1 Core entities

The core entities of Empyralis are:
- `tenant`
- `workspace`
- `user`
- `agent_definition`
- `agent_definition_version`
- `workspace_agent_install`
- `agent_thread`
- `agent_session`
- `agent_turn`
- `run`
- `artifact/output`
- `runtime_profile`
- `channel_binding`
- `memory fragment`

## 9.2 Canonical runtime flow

1. user message enters Sage or an agent channel
2. request resolves tenant/workspace/user/agent scope
3. memory and retrieval pipeline assemble micro-context
4. Sage or specialist decides:
   - answer directly
   - delegate
   - execute a tool
   - request approval
5. run is created in Harness
6. cockpit and channel stream reflect live activity
7. outputs and approvals are persisted to the ledger
8. memory is compacted and indexed

## 9.3 Channel model

Every inbound/outbound channel resolves into:
- tenant
- workspace
- agent install
- conversation identity
- execution ledger

That ensures:
- WhatsApp and email are not random message pipes
- they are first-class, secure agent channels

---

## 10. Canonical UX Doctrine

## 10.1 What users should feel

The product should feel like:
- one OS
- one operator relationship
- one trust model
- many hidden workers

## 10.2 What users should not feel

The product must not feel like:
- a maze of dashboards
- a workflow IDE
- a bag of tools
- a graph compiler
- a developer control panel

## 10.3 Surface priority

Primary:
- Sage
- Runs
- Agents

Supporting:
- Store
- Integrations

Advanced:
- Studio
- diagnostics
- policy internals

---

## 11. Template And Commerce Strategy

## 11.1 What gets sold

The commercial object is not raw prompt text.

What gets sold is:
- a versioned agent template
- with a Bible structure
- tool bindings
- channel bindings
- safety policy
- recommended integrations
- optional starter memory or assets

## 11.2 What the buyer experiences

Buyer flow:
- discover in Store
- install into workspace
- bind channels/tools
- test in Customer Mode
- tune in Owner Mode
- go live

## 11.3 Fast shipping doctrine

To ship quickly without AI inventing the entire frontend every time:
- build one reusable shell
- build one chat/channel layout
- build one owner panel scaffold
- build one run cockpit scaffold
- build one template card system
- build one filter bar system

Everything new should be composed from those primitives.

That is how Empyralis becomes premium and coherent fast.

---

## 12. Final Product Doctrine

Empyralis is:
- one Master Agent OS
- one secure execution engine
- one installable specialist ecosystem
- one mobile-first supervision model

Sage is the face.
Harness is the engine.
Store is the expansion layer.
Studio is the advanced creator plane.
Security is the non-negotiable boundary.

If any future feature makes the product feel more fragmented, more dashboard-like, or more builder-first, it is the wrong direction.

If it makes Sage more powerful, specialists more useful, mobile more controlling, and execution more secure, it is the right direction.

