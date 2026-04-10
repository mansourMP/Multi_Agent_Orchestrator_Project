# Competitive Analysis: Anthropic Managed Agents vs. Empyralis

Date: April 9, 2026

## Executive Decision

Empyralis should **not** pivot into being a thin UX shell on top of Anthropic Managed Agents.

Empyralis should:

- keep its own control plane
- keep its own tenant wall, approvals, channel model, and owner/customer lifecycle
- continue the RLS + isolated compute roadmap
- optionally add Anthropic Managed Agents as a **selective hosted execution adapter** for specific cloud-only jobs

That is the correct strategic posture.

Anthropic has shipped a strong hosted agent runtime. They have **not** shipped the product we are building.

## What Anthropic Actually Launched

Based on Anthropic’s official documentation and engineering notes published and live on April 9, 2026:

- [Managed Agents overview](https://platform.claude.com/docs/en/managed-agents/overview)
- [Managed Agents skills](https://platform.claude.com/docs/en/managed-agents/skills)
- [Managed Agents MCP connector](https://platform.claude.com/docs/en/managed-agents/mcp-connector)
- [Managed Agents engineering architecture](https://www.anthropic.com/engineering/managed-agents)
- [Anthropic pricing](https://docs.anthropic.com/en/docs/about-claude/pricing)

Anthropic’s offer is fundamentally:

- hosted long-running agent sessions
- a managed sandbox / code execution layer
- modular “skills”
- MCP-based tool access
- session event streams and resumable orchestration

This is a serious backend competitor.

## 1. Agent Skills

Anthropic’s skills model is strong.

From the official docs, skills are reusable capability packages attached to managed agents. They are:

- modular
- loaded on demand rather than always stuffed into context
- designed to reduce prompt size and improve reuse
- limited to a bounded count per session

The important product lesson is not just “skills exist.” It is that Anthropic is turning capabilities into explicit installable units.

That validates the Empyralis direction.

But Anthropic’s skills are still presented in a developer/runtime mental model:

- define skills
- attach them to an agent
- let the managed runtime load them when needed

Empyralis can commercialize this more effectively by making skills:

- owner-visible
- auditable
- priced
- approval-aware
- tied to business meaning instead of platform internals

Anthropic proves the backend pattern. Empyralis can win the commercial packaging.

## 2. Managed Sessions and MCP Tool Access

Anthropic’s session model is well designed.

From the official overview and engineering article:

- sessions are durable event logs
- the harness can recover from failures by replaying session state
- tool calls and code execution run through managed infrastructure
- the system separates “brain,” “session,” and “hands”

This is real platform engineering, not surface polish.

The MCP connector is also strategically important:

- remote MCP servers are supported
- credentials can be referenced through vault-backed session context
- permission policy is explicit
- tool access can default to asking for confirmation

This is a strong developer-facing tool abstraction.

But it is still not a full operator-grade business product:

- MCP is a systems interface, not a business-owner UX
- permission policy is runtime-centric, not owner lifecycle-centric
- it does not replace product concepts like Sage, channels, approvals, or customer simulation

Anthropic solves **tool connectivity** well.
Empyralis must solve **operator trust and product legibility**.

## 3. Execution Environment, Limits, and Pricing

Anthropic’s hosted runtime is attractive in the near term.

From official docs and pricing pages:

- Managed Agents use Anthropic model pricing rather than introducing a separate obvious platform surcharge
- code execution is priced as managed compute
- the pricing docs list a free monthly allowance for code execution container hours, then usage-based hourly billing beyond that
- model pricing remains tied to the underlying Claude model

Operationally, the official documentation also describes concrete constraints around:

- session and request limits
- token ceilings
- concurrent session ceilings
- managed code execution costs

This is good enough for:

- hosted research agents
- asynchronous cloud jobs
- tool-connected analysis work

It is not enough to justify handing them the whole Empyralis engine room.

The key limitation is structural:

- Anthropic owns the runtime boundary
- Anthropic owns the session abstraction
- Anthropic owns the hosted execution policy

That is acceptable for an adapter.
It is dangerous as a core dependency for the full platform moat.

## Why Empyralis Is Still the Better Product for Non-Technical Business Owners

Anthropic’s product is powerful, but it is still shaped for developers and technical teams.

Empyralis can be better for non-technical operators because our product thesis is different.

### 1. Sage creates one visible relationship

Anthropic exposes managed agents.
Empyralis exposes **Sage**.

That matters.

Business owners do not want to think in terms of:

- sessions
- sandboxes
- MCP connectors
- capability packs

They want:

- one intelligent operating relationship
- clear approvals
- clear channels
- clear ownership

Sage is the front door that turns a systems platform into a product.

### 2. Creation Forge is a better entry point than developer setup

Anthropic starts from runtime objects.
Empyralis starts from naming and intent:

- name the agent
- describe what it should do
- let Sage draft the Bible

That is a far better commercial creation loop for small businesses.

### 3. Owner Mode / Customer Mode is a real commercial advantage

This is where Empyralis is structurally better.

Anthropic gives you a managed runtime.
Empyralis can give you a full business lifecycle:

- Customer Mode: test the agent exactly as a customer experiences it
- Owner Mode: edit Bible, bind skills, inspect metrics, control channels

That is a much stronger product for agencies, SMBs, and operators.

### 4. Empyralis can turn agent creation into a sellable product

Anthropic’s platform is a backend capability layer.
Empyralis can be the monetizable wrapper:

- creation
- packaging
- channel deployment
- supervision
- approvals
- analytics
- ongoing agent operations

That is a business product, not just an API product.

## Strategic Recommendation

### Do not pivot the core platform onto Anthropic Managed Agents

Reasons:

- it weakens infrastructure independence
- it puts a direct competitor underneath the whole product
- it gives away long-term execution leverage
- it limits how far we can push our own tenancy, policy, and compute isolation model

### Do use Anthropic Managed Agents as an optional execution adapter

This is the right compromise.

Empyralis should define an internal execution-provider interface such as:

- `local_runtime`
- `empyralis_cloud`
- `anthropic_managed`

Then we selectively route workloads.

Good candidate use cases for Anthropic Managed Agents:

- hosted research jobs
- document-heavy asynchronous analysis
- rapid prototyping of cloud-first agents
- temporary managed sandboxes while our own cloud executor matures

Bad candidate use cases:

- tenant-critical proprietary workflow execution
- long-term compliance-sensitive automation
- any workload where we need first-party audit guarantees across storage, compute, and policy
- any workload that should eventually run inside our own isolated compute boundary

## Why the RLS + MicroVM Roadmap Still Wins Long Term

The RLS work we just completed matters more, not less, in light of Anthropic’s launch.

Empyralis now has the start of the correct foundation:

- explicit tenant/workspace scope
- no shared default tenant domain
- Postgres Row-Level Security
- fail-closed auth and data access

That is the right direction for a multi-tenant operating system.

The next moat layer is compute isolation:

- containerized workloads in the near term
- stronger per-tenant or per-run isolation later
- eventual microVM or equivalent hardened boundary for sensitive execution

Anthropic’s hosted runtime is good.
But the combination of:

- our own tenant wall
- our own operator UX
- our own approval system
- our own future compute isolation

is still the more defensible long-term architecture.

## Product Implication: Skill Binding Must Become First-Class in Owner Mode

Anthropic’s launch confirms that modular skills are the correct primitive.

But in Empyralis, the UX should be different.

Skill Binding in Owner Mode should mean:

- one-click install
- explicit scope label
- visible permission posture
- obvious pricing / packaging potential
- traceable relationship to the agent Bible

The owner should never have to understand MCP internals.

They should see:

- `Email Access`
- `Web Search`
- `Calendar Access`
- `Inventory Tool`
- `CRM Notes`

Each one should read as a business capability, not a developer integration artifact.

## Final Decision

Anthropic Managed Agents is a credible backend competitor and a useful reference architecture.

Empyralis should respond by doing two things at once:

1. Copy the right backend ideas:
- modular skills
- durable sessions
- explicit tool permissions
- clean harness/session/sandbox separation

2. Double down on the product layer Anthropic does not own:
- Sage as the visible OS
- Creation Forge
- Owner Mode / Customer Mode
- channel-native agent operations
- first-party tenant wall and future isolated compute

That is the winning posture.

## Sources

- [Anthropic Managed Agents Overview](https://platform.claude.com/docs/en/managed-agents/overview)
- [Anthropic Managed Agents Skills](https://platform.claude.com/docs/en/managed-agents/skills)
- [Anthropic Managed Agents MCP Connector](https://platform.claude.com/docs/en/managed-agents/mcp-connector)
- [Anthropic Engineering: Scaling Managed Agents](https://www.anthropic.com/engineering/managed-agents)
- [Anthropic Pricing](https://docs.anthropic.com/en/docs/about-claude/pricing)
