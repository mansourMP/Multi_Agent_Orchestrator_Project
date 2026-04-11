# EMPYRALIS UNIVERSAL AGENT PLAN

Status: canonical execution plan  
Date: 2026-04-10  
Audience: founder, product, design, frontend, backend, security  
Purpose: lock the operating model for Sage, specialists, mobile channels, runtime isolation, and universal agent creation

---

## 1. Core Decision

Empyralis should not ship as a hardcoded set of agent types.

It should ship as:

- one visible master OS: `Sage`
- one universal creation system: the `Forge`
- one universal runtime: the `Harness`
- many user-created specialists

An agent is not:

- “a dentist agent”
- “a research agent”
- “an ad agent”

An agent is:

- identity
- role
- behavior
- knowledge
- skills
- connectors
- channels
- policy
- runtime profile

That means every specialist is created from the same contract, not from a different product path.

---

## 2. Product Truth

### 2.1 Visible product

The visible product has two layers:

1. `Sage`
- pinned
- always present
- master OS
- orchestrator
- global context holder

2. `Specialists`
- created by the owner
- each owns a job
- each has its own channel/thread
- each can be tested in customer-facing form

### 2.2 Hidden layer

Behind the visible layer:

- planner
- critic
- retrieval worker
- tool runner
- background delegator

These are runtime internals, not first-class UI products.

---

## 3. Platform vs Mobile

### 3.1 Platform surface

The current platform surface is the engine room and control surface.

It must be strongest at:

- creating agents
- configuring policy
- binding skills
- binding connectors
- selecting runtime profile
- uploading knowledge
- testing in owner/customer views
- inspecting runs and failures

This is the professional workstation.

### 3.2 Mobile surface

Mobile is the main daily-use product.

It should feel like:

- chat-first
- channel-first
- fast
- legible
- supervisory

Mobile should be strongest at:

- talking to Sage
- reading specialist channels
- switching between `Owner` and `Customer View`
- approving/rejecting actions
- reviewing outputs
- checking active work

It should not begin as a tiny copy of the desktop control panel.

---

## 4. Canonical UX Model

### 4.1 Channel stack

For desktop and mobile:

- `Sage` pinned at the top
- specialists below Sage

Sage must be visually distinct.

### 4.2 Specialist views

Each specialist gets two views:

- `Owner`
- `Customer View`

Use exactly those names.

Meaning:

- `Owner`: configure and supervise the agent
- `Customer View`: simulate exactly what an external customer experiences

### 4.3 Owner mode sections

Default visible sections:

- Role
- Knowledge
- Skills
- Channels
- Test

Advanced sections:

- Connectors
- Runtime
- Policies
- Approvals
- Logs
- Metrics

This preserves power without overwhelming the user.

---

## 5. The Forge

### 5.1 Forge doctrine

The Forge is the only birth path.

No separate marketplace wall should be the primary creation model.

The owner should begin with:

1. agent name
2. what the agent should do
3. how it should answer
4. what it should know
5. what it can use
6. where it should work

Then Sage drafts:

- identity
- first Bible
- suggested skills
- suggested connectors
- suggested channels
- initial policy
- initial runtime profile

### 5.2 Optional blueprints

Blueprints may exist, but only as optional accelerators inside the Forge.

They are not the main product.

Rule:

- primary path: create from plain language
- optional path: import blueprint

---

## 6. Universal Agent Manifest

Every specialist should compile into one manifest JSON.

```json
{
  "id": "agent_parts_pro",
  "version": "1.0.0",
  "identity": {
    "name": "Parts Pro",
    "icon": "package",
    "description": "Handles parts and fitment questions."
  },
  "role": {
    "mission": "Help customers identify compatible parts and answer availability questions.",
    "success_definition": [
      "Accurate inventory guidance",
      "Clear fitment clarification",
      "Safe escalation when uncertain"
    ]
  },
  "voice": {
    "tone": "clear_professional",
    "style": "concise_helpful",
    "language": "en"
  },
  "bible": {
    "hard_context": [
      "Use only verified inventory data.",
      "Never invent stock or pricing."
    ],
    "operational_policy": [
      "Ask for year, make, and model when fitment is unclear.",
      "Escalate if confidence is below threshold."
    ]
  },
  "knowledge": {
    "sources": [
      "rag://workspace/catalog",
      "rag://workspace/fitment-rules"
    ]
  },
  "skills": [
    "inventory.lookup",
    "web.search"
  ],
  "connectors": [
    "telegram_bot",
    "gmail",
    "inventory_db"
  ],
  "channels": {
    "owner_thread": true,
    "customer_preview": true,
    "telegram": false,
    "email": false,
    "whatsapp": false
  },
  "runtime": {
    "profile": "hosted_secure"
  },
  "approval_policy": {
    "external_write_requires_human": true,
    "high_risk_requires_human": true
  },
  "concurrency": {
    "max_active_threads": 25
  }
}
```

This is the universal contract.

All specialists must run from this shape.

---

## 7. Runtime Profiles

### 7.1 Required runtime profiles

Every specialist must have a runtime profile.

Allowed values:

- `hosted_secure`
- `local_secure`
- `privileged_device`

### 7.2 Meaning

#### hosted_secure
- default
- isolated container or microVM
- no direct host access
- restricted filesystem
- restricted network egress
- strongest default for commercial deployments

#### local_secure
- uses local companion
- still sandboxed
- limited folders/apps/tools
- suitable when local files or local software matter

#### privileged_device
- advanced only
- direct device/platform access
- explicit warning
- per-action approval where required
- full audit logging

### 7.3 Policy

Rule:

- default = `hosted_secure`
- local is opt-in
- privileged is exceptional

No specialist should get direct device access automatically.

---

## 8. Channel Ownership

### 8.1 Hard rule

Every inbound channel must have exactly one active owner.

Examples:

- one Telegram bot
- one WhatsApp number
- one email inbox
- one phone number

Each of those may have:

- zero owners
- one owner

Never more than one active owner.

### 8.2 Why

If two agents own the same inbound channel, they can both answer.

That creates:

- duplicate replies
- conflicting replies
- loss of trust
- impossible auditability

### 8.3 Enforced behavior

If someone tries to bind an already-owned inbound channel:

`This channel already has an inbound owner.`

Reject the configuration.

No automatic sharing.

### 8.4 Allowed sharing

Shared connectors are allowed.

Examples:

- one Google account supporting many agents
- one CRM supporting many agents
- one inventory database supporting many agents

But inbound responder ownership is exclusive.

---

## 9. Sage Routing Model

If the business wants one public front door:

- Sage owns the shared public channel
- Sage routes internally to specialists
- only one final response is sent externally

If the business wants direct specialist channels:

- each specialist gets its own endpoint

Examples:

- `@company_main_bot` -> Sage
- `@partspro_bot` -> Parts Pro
- `support@company.com` -> Support specialist

This is the cleanest architecture.

---

## 10. Capability Model

The platform should not be less capable.

But capability must be layered cleanly.

Separate these concepts:

### 10.1 Skills

What the agent can do logically:

- web search
- inventory lookup
- email send
- CRM update
- calendar scheduling

### 10.2 Connectors

What systems the platform can authenticate to:

- Google
- Microsoft
- Telegram
- WhatsApp
- Slack
- CRM
- inventory DB

### 10.3 Channels

Where conversations happen:

- owner thread
- customer preview
- Telegram
- WhatsApp
- email
- web chat

### 10.4 Runtime

Where execution happens:

- hosted secure
- local secure
- privileged device

These must remain separate in both data model and UI.

---

## 11. Concurrency and Scale

### 11.1 50 customers at once

The system must not serially queue all customers behind one another.

Correct model:

- one conversation thread = serialized
- many different customer threads = parallel

That means:

- customer A’s thread stays ordered
- customer B’s thread stays ordered
- A and B are processed concurrently

### 11.2 Concurrency control

Per agent:

- `max_active_threads`
- `max_parallel_tool_calls`

Per workspace:

- total concurrent threads
- total concurrent runs
- total hosted compute budget

Per plan:

- channel count
- concurrency ceiling
- run minute budget
- storage and retrieval budget

### 11.3 Subscription doctrine

Do not make the product dumb by plan.

Limit:

- throughput
- concurrency
- number of deployed channels
- premium runtimes
- advanced connector volume

Do not limit:

- the universal model
- the creation flow
- the concept of what an agent can become

---

## 12. Data Model Requirements

We need first-class models for:

- `agent_manifests`
- `agent_bible_versions`
- `agent_skill_bindings`
- `agent_connector_bindings`
- `agent_channel_bindings`
- `agent_runtime_profiles`
- `channel_ownership_locks`
- `agent_concurrency_policies`

### 12.1 Critical DB rule

Channel ownership must be enforced by data, not just UI.

We need a uniqueness rule on active inbound ownership such that:

- one active endpoint
- one active owner

Examples:

- unique on `(workspace_id, channel_type, channel_identity)` where `direction = 'inbound'` and `active = true`

### 12.2 Security requirement

All of this must remain inside the RLS tenant wall.

No channel binding, manifest, or connector row may escape its workspace/tenant scope.

---

## 13. Reflection and Safety

Before a customer-visible response is published:

1. the harness checks the manifest
2. checks hard context
3. checks operational policy
4. checks live evidence from tools

If the answer violates policy:

- rewrite it safely
- or escalate to owner

This remains mandatory for external/customer channels.

---

## 14. Canonical Build Order

### Phase 1
- finalize manifest schema
- finalize runtime profile enum
- finalize channel binding schema

### Phase 2
- enforce exclusive inbound ownership in DB and backend
- reject conflicting Telegram/WhatsApp/email bindings

### Phase 3
- finish Forge so every new specialist emits a complete manifest
- remove remaining hardcoded agent assumptions

### Phase 4
- move specialist persistence fully server-side
- local drafts remain convenience only

### Phase 5
- build mobile channel stack:
  - Sage pinned
  - specialists below
  - Owner / Customer View toggle

### Phase 6
- implement runtime profile selection in Owner mode
- hosted secure default
- local secure optional
- privileged device advanced only

### Phase 7
- add plan-based concurrency controls
- keep multi-thread handling parallel

---

## 15. Strategic Judgment

This is the right direction.

Why:

- it is broader than a single-purpose agent app
- it is cleaner than a builder-first platform
- it is more secure than direct-device-everything by default
- it can support both owner simplicity and expert depth
- it scales through one universal manifest-driven engine

This does not guarantee a giant company.

But it is a credible architecture for building a very large company because it avoids the two fatal traps:

1. becoming a toy builder
2. becoming a rigid hardcoded vertical app

The winning version of Empyralis is:

- universal in capability
- layered in UI
- strict in security
- simple in the visible story

That story is:

`Sage runs the system. Specialists do the jobs. The owner creates, tests, and deploys them safely.`

---

## 16. Non-Negotiable Rules

1. No hardcoded primary agent categories.
2. The Forge is the only primary birth path.
3. Sage is always pinned and visually distinct.
4. `Owner` and `Customer View` are the official two specialist modes.
5. Inbound channel ownership is exclusive.
6. Specialists are sandboxed by default.
7. Direct device access is advanced and explicit.
8. Concurrency is parallel across threads, serialized within a thread.
9. Capability is not removed; it is layered.
10. Mobile is the primary daily-use surface, desktop is the primary control surface.
