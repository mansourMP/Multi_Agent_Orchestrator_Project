# EMPYRALIS BIBLE V2.1

## The Final Product Thesis

Empyralis is not a chatbot, a workflow toy, or a thin SaaS wrapper around language models.

Empyralis is an **AI Operating System**:

- one visible intelligence
- one control plane
- one audit path
- one approval system
- one durable execution substrate
- many shells
- many specialist agents
- many installed capabilities

The user should feel like they have **one relationship** with the platform, even when dozens of invisible agents are working underneath it.

That visible relationship is called **Sage**.

## The Three-Layer Model

Empyralis must be understood and built as three layers.

### 1. Sage

Sage is the front-stage product.

Sage is:

- the one Master Agent
- the one chat thread the user talks to
- the one memory facade the user trusts
- the one command surface across web, desktop, mobile, and channels
- the one product identity the market remembers

Sage is not one model call. Sage is the orchestration personality and contract that sits above all specialist agents.

### 2. Harness

The Harness is the back-stage execution system.

The Harness includes:

- `agent_turn.py`
- `run_service.py`
- durable runs
- local machine control
- the Rust supervisor
- approvals
- hard kill
- policy
- memory
- workflows
- audit
- scheduling
- worker fleets

The Harness is where the real power lives. It is not the primary user-facing story.

### 3. Store

The Store is the distribution and monetization layer.

The Store allows:

- first-party specialist agents
- third-party specialist agents
- private enterprise agents
- versioned workflow-backed agent objects
- permission disclosure
- entitlements
- billing
- upgrade paths

The Store multiplies the platform. It is not the soul of the platform.

## The Core Identity

Empyralis is a **unified AI operating system for authorized digital work**.

It must be able to:

- talk to the user in one master thread
- remember user context over time
- spawn specialist sub-agents
- run durable background jobs
- control authorized computers
- observe screens and machine state
- execute tools locally and remotely
- work from web, desktop, and mobile
- ask for approval when needed
- run autonomously when explicitly trusted
- keep a durable audit trail of what happened

Empyralis is not:

- a collection of disconnected bots
- a pure drag-and-drop workflow builder
- a chat wrapper with no execution
- an unsafe computer-use toy
- a dashboard full of unrelated tabs

## The Product Shape Users Must Feel

The product must feel like this:

1. I talk to Sage.
2. Sage understands my history, apps, files, and environment.
3. Sage can act directly or delegate to specialist agents.
4. I can see what Sage is doing in real time.
5. I can approve, deny, pause, or hard-kill anything.
6. I can install new specialist agents without breaking the core experience.

The product must not feel like this:

1. Choose from ten different agents before starting.
2. Open a separate builder before anything useful can happen.
3. Lose track of where actions are running.
4. Wonder whether the desktop shell, web app, or mobile app is the “real” product.

## The Master Agent Doctrine

There is only one visible intelligence: **Sage**.

Everything else is subordinate.

### Why this matters

If users see a marketplace before they trust Sage, the platform feels fragmented.

If users see a workflow canvas before they feel the magic, the platform feels like enterprise plumbing.

If users see many agents instead of one coherent operator, the platform feels like noise.

### The rule

The user always talks to one Master Agent.

Sage may:

- plan
- delegate
- summon tools
- launch durable runs
- spawn sub-agents
- gather artifacts
- escalate to approvals
- ask for trust
- summarize outcomes

But the user remains in one master thread.

## The Sub-Agent Model

Sub-agents are real, but they are infrastructure.

Every sub-agent must be:

- spawned by Sage or an approved system trigger
- represented as a child durable run
- scoped to explicit capabilities
- scoped to explicit memory boundaries
- visible in the cockpit
- killable
- auditable
- disposable

Sub-agents are not separate consumer-facing personalities by default.

### Allowed sub-agent examples

- Research Analyst
- Desktop Operator
- Inbox Operator
- Scheduling Agent
- Finance / Payroll Agent
- Growth Agent
- Support Triage Agent
- Personal Health Coordinator

### Execution rules

Every child agent needs:

- `agent_definition_id`
- `parent_run_id`
- `budget_limit`
- `time_limit`
- `capability_scope`
- `memory_scope`
- `approval_mode`
- `kill_path`
- `audit trail`

## The Workflow Doctrine

The workflow engine stays.

The workflow builder does **not** remain the center of the product.

### Final position

Workflows are the substrate for:

- automation blueprints
- durable business logic
- scheduled enterprise jobs
- creator tooling
- store-packaged agent behavior

Workflows are not the first thing most users should see.

### Product treatment

The current n8n-like surface should be repositioned as:

- Studio
- Composer
- Blueprint Builder
- Creator Mode

It should not be the default home of the product.

### Why

Workflow builders are useful but commoditized.

What is differentiated is:

- one Master Agent
- real computer control
- mobile remote control
- hard kill
- approvals
- multi-agent orchestration
- auditability
- installable specialists

That combination is the product.

## The Store Doctrine

The Store is how Empyralis scales beyond first-party labor.

### What the Store sells

The Store sells **Agent Objects**.

An Agent Object is not just a prompt.

It is a versioned package containing:

- identity
- prompt strategy
- workflow definition or execution plan
- capability manifest
- policy manifest
- memory manifest
- approval defaults
- install-time settings
- pricing metadata
- developer identity

### The rule

Every sellable agent must declare:

- what it can do
- what data it can see
- what approvals it requires
- whether it can touch the local machine
- which plan tier is required
- what telemetry and audit events it emits

### Store hierarchy

The Store should evolve in three layers:

1. First-party catalog
2. Private enterprise catalog
3. Public third-party marketplace

Do not open the public marketplace first.

## The Mobile Doctrine

Mobile is not a reduced web app.

Mobile is the **remote command and safety interface**.

Mobile should be optimized for:

- seeing what Sage is doing right now
- approving or denying sensitive actions
- receiving live notifications
- hard-killing runs or machines
- checking scheduled agents
- reading condensed artifacts and summaries

Mobile should not try to be the full creator workstation.

## The Desktop Doctrine

Desktop is where local power becomes real.

Desktop exists to:

- connect the Rust supervisor
- allow secure local machine execution
- provide deep operator flows
- keep local trust boundaries explicit
- surface local approval and kill state

Desktop is not a separate product line.

It is the high-trust local body of Sage.

## The Web Doctrine

Web is the command center.

Web should own:

- the master chat
- the cockpit
- the store
- workspace administration
- audit and policy
- creator tooling
- enterprise scheduling

Web is where the system is understood.

## The Market Position

Empyralis should not be pitched as:

- “AI workflow builder”
- “AI employee marketplace”
- “multi-agent SaaS”
- “computer use tool”

Those are all partial truths.

Empyralis should be pitched as:

**The AI Operating System for authorized digital work.**

### The wedge

The platform underneath can be broad.

The first market-facing wedge should be narrow:

- one Master Agent
- real actions
- real control
- real memory
- real oversight

That is the wedge.

### Why broad underneath is still correct

A true AI OS must eventually support:

- chat
- tasks
- automation
- workflows
- app installs
- background jobs
- enterprise control
- billing
- audit
- device operation

The substrate must be broad even if the initial story is not.

## The Business Model

Empyralis has three business layers.

### Phase 1: Prosumer Subscription

Sell Sage as a premium personal operator.

Core value:

- remembers me
- helps me
- acts for me
- stays under my control

### Phase 2: Enterprise / B2B

Sell fleets, scheduling, approvals, audit, and policy.

Core value:

- durable background agents
- workflow-backed specialized workers
- RBAC
- machine fleet oversight
- cryptographically defensible audit trails

### Phase 3: Marketplace

Sell distribution and trust.

Core value:

- creators publish specialized agents
- enterprises install verified agents
- Empyralis earns platform fees

## The Zero-Trust Product Doctrine

The stronger the platform becomes, the more visible control must become.

### Non-negotiables

- no fake AI prose
- approvals must be structured UI
- every sensitive action must have a policy path
- full trust is a request, not authority
- hard kill must exist everywhere
- all durable actions must be traceable
- all local machine actions must be authorized, scoped, and interruptible

### Full-Trust Owner Mode

Full trust is allowed only when:

- the user is authorized
- the workspace policy allows it
- the machine is authorized
- the session explicitly requests it
- the runtime records it

The client never grants itself power.

## The Memory Doctrine

“It knows everything about me” must not mean “one giant unsafe blob.”

Memory must be layered.

### Memory layers

- Personal memory
- Workspace memory
- Installed-agent memory
- Machine state memory
- Connector state memory
- Artifact history

### Rules

- memory scopes must be queryable and explicit
- agent installs must not gain universal memory by default
- user identity and workspace identity are first-class boundaries
- memory access must be auditable

Sage should feel omniscient, but the architecture must remain scoped.

## The Design Doctrine

Do not ask AI to “invent a cool UI.”

Use AI as a refactoring engine against proven references.

### Design references

- LobeChat for master shell density and chat composition
- Trigger.dev for run cockpit and observability hierarchy
- n8n for creator-side workflow authoring and inspector structure

### Product rule

The user should experience:

- one premium shell
- one visual language
- one hierarchy of control

Not a collection of dashboard templates.

## The Internal AI Doctrine

We may have effectively unlimited AI labor internally.

That is a strategic advantage, not a product excuse.

### Internal rule

Unlimited AI means:

- faster iteration
- stronger research
- better refactors
- faster QA
- more simulation

It does not mean:

- shipping incoherent surfaces
- allowing AI-generated sprawl
- replacing product judgment with model output

### Builder principle

Use AI as:

- an architecting assistant
- a code refactoring worker
- a research engine
- a verification layer

Do not use AI as the final taste-maker without references and constraints.

## The Agent Templates Doctrine

The fastest way to make the platform feel real is to ship a first-party catalog of specialist agents.

### Required first-party templates

- Executive Assistant
- Desktop Operator
- Research Analyst
- Inbox and Communications Agent
- Scheduler and Ops Agent
- Growth Agent

Each template should be installable and adjustable, but all route back through Sage.

## The Anti-Goals

Do not let Empyralis become:

- another Zapier clone
- another n8n clone
- another agent marketplace with no real operating system
- a feature soup of chat, workflows, and dashboards
- a security liability disguised as autonomy

## The Product Story

When someone asks, “What is Empyralis?”, the answer should be:

> Empyralis is the AI operating system where one Master Agent can understand your world, coordinate specialist agents, operate your authorized devices, and stay under your control from anywhere.

That is the story.

Not:

> We have workflows, agents, store pages, mobile, local runtime, and some automations.

## The Final Build Priorities

### Priority 1: Product Coherence

Build the premium shell around:

- master chat
- live cockpit
- approvals and interventions
- installed agents
- mobile remote oversight

### Priority 2: Control Plane

Finish:

- Postgres control plane
- workspaces
- agent threads
- agent sessions
- agent turns
- workflow versions

### Priority 3: Agent Objects

Turn first-party capabilities into installable Agent Objects with:

- manifests
- permissions
- billing hooks
- memory scopes
- workflow-backed behavior

### Priority 4: Creator Layer

Keep improving Studio / Composer, but keep it behind the primary product story.

### Priority 5: Marketplace

Launch only after:

- permissions are real
- audit is real
- billing is real
- entitlements are real
- sandboxing is real

## The Final Strategic Answer

You are not building:

- an app
- a workflow tool
- a marketplace first

You are building a platform.

More specifically:

You are building an **AI Operating System** whose visible face is **Sage**, whose hidden power is the **Harness**, and whose distribution engine is the **Store**.

That is the correct final vision.

The workflow engine stays.

The workflow builder is demoted from center stage.

The Store matters, but only after Sage becomes undeniable.

The shells matter, but only as glass around one brain.

The winner is not the company with the most tabs.

The winner is the company that makes a powerful system feel singular.

## Appendix: Prompt Doctrine For Internal AI Builders

Use prompts like these when directing internal coding agents.

### Prompt: Master Shell

```text
You are not designing from scratch. You are refactoring Empyralis to match a proven premium reference pattern while preserving backend contracts.

Reference:
- LobeChat for master chat shell density and hierarchy

Rules:
- Do not change backend APIs.
- Do not introduce fake AI prose.
- Preserve approvals, interventions, trust mode, and cockpit links.
- Do not fragment the product into multiple competing entry points.
- The result must feel like one AI operating system centered on Sage.

Primary files:
- /Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/page.tsx
- /Users/mansur/Multi_Agent_Orchestrator_Project/frontend/components/orion/chat/ChatSurface.tsx
- /Users/mansur/Multi_Agent_Orchestrator_Project/frontend/components/orion/PlatformTopBar.tsx
```

### Prompt: Cockpit

```text
Refactor Empyralis run observability to feel like an elite operator cockpit.

Reference:
- Trigger.dev for live run detail, event hierarchy, and operational clarity

Rules:
- No backend changes.
- Use existing SSE streams and hard-kill endpoints.
- Keep approvals, interventions, and destructive controls visible and disciplined.
- Emphasize live timeline, current action, target machine, failure recovery, and child agent visibility.

Primary files:
- /Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/runs/[id]/inspect/page.tsx
- /Users/mansur/Multi_Agent_Orchestrator_Project/frontend/components/orion/runs/RunLiveCockpitPanel.tsx
- /Users/mansur/Multi_Agent_Orchestrator_Project/frontend/components/orion/runs/RunLiveEventFeed.tsx
```

### Prompt: Studio

```text
Refactor the Empyralis workflow builder into a creator-grade Studio without changing runtime semantics.

Reference:
- n8n for canvas ergonomics, inspector structure, and creator tooling information architecture
 e
Rules:
- Keep React Flow.
- Do not change workflow execution semantics.
- Do not treat Studio as the main consumer product.
- Improve discoverability, inspector clarity, validation, and version/publish affordances.

Primary files:
- /Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/workflows/[id]/WorkflowEditorInnerPro.tsx
```
