# Customer Journey Audit

Date: 2026-04-09  
Scope: end-user UX audit only  
Constraint: no Empyralis source code modified

## 0. Frame

This audit intentionally ignores engineering elegance and evaluates the product as a non-technical small-business owner would experience it.

Reference user:

- runs a business, not a platform team
- wants one assistant that can help with work
- understands “apps”, “tools”, “folders”, and “automation”
- does **not** naturally think in:
  - runtime API keys
  - control planes
  - execution artifacts
  - profiles
  - policy gates
  - workflows as infrastructure

Audited surfaces:

- sign-in and account access
- onboarding and setup
- home and Sage chat
- Store
- Installed Agents
- agent configure/switchboard
- residual workflow/library surfaces

Primary sources:

- [frontend/components/orion/auth/BrowserSignInPage.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/components/orion/auth/BrowserSignInPage.tsx)
- [frontend/app/onboarding/page.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/onboarding/page.tsx)
- [frontend/app/setup/page.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/setup/page.tsx)
- [frontend/app/page.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/page.tsx)
- [frontend/app/store/page.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/store/page.tsx)
- [frontend/app/agents/page.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/agents/page.tsx)
- [frontend/app/agents/[id]/configure/ConfigureAgentPageClient.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/agents/[id]/configure/ConfigureAgentPageClient.tsx)
- [frontend/components/orion/agents/AgentSwitchboardForm.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/components/orion/agents/AgentSwitchboardForm.tsx)
- [frontend/app/workflows/page.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/workflows/page.tsx)
- [frontend/app/library/page.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/library/page.tsx)

---

## 1. Executive Summary

The product now has the right strategic shape:

- one central relationship: Sage
- a store of specialist agents
- install/configure surfaces
- background runs and approvals

But from a customer perspective, the product still has three major journey failures:

1. **There is no clean customer-facing path to create a custom template.**
2. **The path from sign-in to first successful task is still too technical and too branched.**
3. **The UI only partially separates Sage the OS from Specialists the Store.**

The current experience feels less like:

- “Here is your assistant and its apps.”

and more like:

- “Here is a powerful runtime product with several surfaces you must mentally assemble.”

That is the current customer journey problem.

---

## 2. The Missing Template Creator

This is the largest structural UX gap in the current product.

### 2.1 What a non-technical user expects

A small-business owner expects some version of:

- “Create my own assistant”
- “Save this as a reusable setup”
- “Make a version for sales / finance / support”
- “Name it”
- “Choose what it can access”
- “Choose where it runs”
- “Reuse it later”

They do **not** expect to:

- install only pre-made templates forever
- think in workflow terms
- know whether customization belongs in chat, store, settings, or a legacy workflow page

### 2.2 What the product currently offers instead

Current visible path:

1. go to `/store`
2. pick a published agent definition
3. go to `/agents/[id]/configure`
4. create an install

What this supports well:

- installing pre-existing specialist templates
- choosing toggles
- choosing placement
- choosing approval/autonomy mode

What it does **not** support:

- creating a brand-new template from scratch
- naming a reusable customer-defined template object
- saving a custom configuration as a reusable blueprint for later installs
- duplicating an existing installed agent into a new named template
- creating a template directly from a successful Sage conversation or run

### 2.3 Exact UX gaps

#### Gap A: No “Create Template” entry point

There is no obvious customer-facing place that says:

- `Create template`
- `New agent`
- `Save as reusable`
- `Build your own`

Observed surfaces:

- [frontend/app/store/page.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/store/page.tsx) is a catalog only
- [frontend/app/agents/page.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/agents/page.tsx) is an install dashboard only
- [frontend/app/page.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/page.tsx) is a Sage command surface, not a creation surface

Customer consequence:

- the user can install what exists
- the user cannot clearly author what does not exist

#### Gap B: “Configure” is not the same as “Create”

The current configure surface is install-oriented, not creation-oriented.

Evidence:

- [frontend/app/agents/[id]/configure/ConfigureAgentPageClient.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/agents/[id]/configure/ConfigureAgentPageClient.tsx)
- [frontend/components/orion/agents/AgentSwitchboardForm.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/components/orion/agents/AgentSwitchboardForm.tsx)

The page lets the user:

- set install label
- choose execution placement
- toggle capabilities
- choose trust mode
- set folder scope

But it does **not** let the user define:

- what the agent is for
- what problem it solves
- what its main instruction or behavior should be
- whether it should behave differently from the original template
- whether the current configuration should become a reusable named asset

Customer consequence:

- the user feels they are “configuring a deployment”
- not “creating my own assistant”

#### Gap C: No “Save from Sage” path

There is currently no obvious customer journey from:

- “Sage just did something useful”

to:

- “Save this as a reusable agent/template”

That is a major missing bridge because a non-technical user will naturally discover reusable automations through success in conversation, not through browsing a store first.

Customer consequence:

- the product captures installs
- but not customer intent becoming reusable product objects

#### Gap D: Residual workflow surfaces create a false alternative

The product still exposes [frontend/app/workflows/page.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/workflows/page.tsx), which implies reusable process creation still lives somewhere else.

That page says things like:

- `Workflows`
- `Capture repeatable operator work and run it with confidence.`
- `Saved workflows`
- `Start with a task. Save it as a workflow when it becomes repeatable.`

Customer consequence:

- the user is left to guess:
  - Is a reusable thing a workflow?
  - Is it an agent?
  - Is it a store template?
  - Is it an install?

This is not just wording drift. It is a missing product object boundary.

### 2.4 Resulting customer feeling

The customer can browse, install, and run.
The customer cannot clearly **author**.

That means the product currently feels like:

- a platform with templates

not yet like:

- a platform where *my* assistants and repeatable setups are first-class.

---

## 3. Onboarding Flow Audit

This section maps the friction between logging in and successfully initiating work with Sage.

### 3.1 Current actual path

Observed path from source:

1. sign in at [frontend/components/orion/auth/BrowserSignInPage.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/components/orion/auth/BrowserSignInPage.tsx)
2. after sign-in, hand off to onboarding/setup readiness
3. if runtime is not configured, redirect to [frontend/app/onboarding/page.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/onboarding/page.tsx)
4. if desktop setup is incomplete, redirect to [frontend/app/setup/page.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/setup/page.tsx)
5. if runtime is healthy, land on `/home`
6. eventually navigate into `/` for Sage chat

### 3.2 Friction map

#### Friction A: Sign-in is not just sign-in

The sign-in page currently asks the user to absorb several concepts at once:

- account boundary
- provider boundary
- recovery
- browser vs desktop handoff
- provider sign-in availability
- post-sign-in next steps

This is all before the user has achieved the first basic success.

Customer consequence:

- the first page already feels like policy documentation
- the user is learning system architecture instead of simply getting access

#### Friction B: Runtime API key requirement is unintuitive

The onboarding page asks for:

- `Paste your Empyralis runtime API key`

Source:

- [frontend/app/onboarding/page.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/onboarding/page.tsx)

For a non-technical business owner, this is a major comprehension break.

What the user expects:

- sign in
- start using the product

What the product asks:

- provide a runtime API key
- understand that this key connects a local runtime

Customer consequence:

- the user may not know where the key comes from
- the user may not know why sign-in did not already connect the product
- the difference between “my account” and “my runtime” is not customer-natural

#### Friction C: Setup can branch into another technical layer

If desktop/local execution is relevant, the user may be redirected into setup and permission validation.

This introduces another conceptual layer:

- account access
- runtime health
- desktop permissions
- provider capability

These are all valid system layers, but the current journey exposes them as separate operational checkpoints.

Customer consequence:

- the user can feel like the product is never quite “ready”
- progress is segmented across hidden system prerequisites rather than one simple guided path

#### Friction D: The first landing surface is not consistently Sage

After successful connection/setup, the product may land on `/home` rather than immediately centering Sage as the first action surface.

This matters because the product thesis is:

- one primary relationship: Sage

But the practical journey can feel like:

- sign in
- connect runtime
- complete setup
- arrive at overview/dashboard
- then go find Sage

Customer consequence:

- the most important relationship is not always the first stable destination
- the journey feels platform-first before it feels assistant-first

#### Friction E: “Ready to ask Sage” is not the same as “ready for real execution”

Even after access/setup, the user may still need:

- provider connection
- runtime profile availability
- permissions for local execution
- maybe a specialist install

The sequence between these is not fully obvious from the UI.

Customer consequence:

- the user may successfully reach Sage but still fail at their first real request
- this creates a feeling that the product was “open” before it was actually usable

### 3.3 Current onboarding summary from customer perspective

Current implicit funnel:

1. get access
2. prove runtime
3. maybe prove desktop
4. maybe connect providers
5. maybe install specialists
6. finally do work

Expected customer funnel:

1. sign in
2. tell Sage what I want
3. connect only what is required when it becomes required

That gap is the main onboarding burden.

---

## 4. Mental Model Audit: Sage vs Specialists

The strategic intent is clear:

- Sage = the operating system / master agent
- Specialists = installable focused agents from the Store

The UI only partially makes this distinction legible.

### 4.1 What is working

The following elements are directionally correct:

- main chat centered around Sage
- Store as a separate place for specialist templates
- Installed Agents as a separate management page
- specialist context visible from the main Sage surface

That means the product is no longer collapsing everything into one graph-builder mindset.

### 4.2 Where the mental model breaks

#### Break A: Sage is the product thesis, but not every route reflects that

Residual routes still present alternate mental models:

- `/home`
- `/workflows`
- `/library`
- `/setup`

These are not inherently wrong, but they compete with “Sage is the center.”

Customer consequence:

- the product sometimes feels like:
  - assistant
  - app store
  - workflow system
  - operator console

instead of one coherent operating system

#### Break B: The Store still assumes the user understands hidden architecture

Current Store language includes:

- `without touching a graph`
- `switchboard`
- `trust mode`
- `execution placement`
- `compile into hidden, validated execution artifacts`

Source:

- [frontend/app/store/page.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/store/page.tsx)

Customer consequence:

- the Store does not feel like “apps”
- it feels like “configurable automation modules”

That weakens the Sage vs Specialists distinction because the user is still being asked to understand how specialists are built.

#### Break C: Installed Agents page leaks system language instead of role language

Current language:

- `specialist agents`
- `switchboard`
- `placement profile`
- `trust mode`
- `local companion placement`
- `Placement route: cloud_worker`

Sources:

- [frontend/app/agents/page.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/agents/page.tsx)
- [frontend/components/orion/agents/InstalledAgentCard.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/components/orion/agents/InstalledAgentCard.tsx)

Customer consequence:

- the Specialists page behaves like an infrastructure dashboard
- not like a stable list of installed assistants/tools

#### Break D: Configure page assumes backend literacy

Current configure language assumes the user can parse:

- install
- definition
- runtime profile
- placement
- trust mode
- full-trust path
- policy gates
- execution artifact

Sources:

- [frontend/app/agents/[id]/configure/ConfigureAgentPageClient.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/agents/[id]/configure/ConfigureAgentPageClient.tsx)
- [frontend/components/orion/agents/AgentSwitchboardForm.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/components/orion/agents/AgentSwitchboardForm.tsx)

Customer consequence:

- the user is configuring backend semantics
- not simply choosing behavior, permissions, and location

That directly blurs the Sage/Store separation because the Specialists surface is still speaking like the engine.

#### Break E: Account and provider surfaces still over-explain boundaries

Settings and Account pages repeatedly explain:

- Empyralis account vs AI providers
- account ownership
- provider capability
- recovery-safe identity

Those distinctions are valid, but the repeated exposition teaches the user to think in product plumbing.

Customer consequence:

- the user starts to see the system as multiple layers of ownership and connection logic
- instead of one coherent product with optional linked services

### 4.3 Net mental-model result

The current UI teaches three overlapping models:

1. Sage is your central assistant
2. Specialists are installable helpers
3. Underneath, you are still operating a runtime/configuration system

The third model is still too visible.

That is the main mental-model leak.

---

## 5. Detailed UX Gaps

This section condenses the most important customer-facing gaps.

### Critical gaps

#### 1. No customer-facing custom template creation path

The user can install and configure existing agents, but cannot clearly create their own reusable template without inheriting engineering concepts or finding a leftover workflow page.

#### 2. Onboarding exposes too many internal prerequisites before first success

The current path asks the user to understand account, runtime, setup, and provider layers before they have actually experienced Sage doing useful work.

#### 3. Configuration screens still use backend language

The switchboard/configure flow still assumes the user understands hidden system architecture.

### High gaps

#### 4. Residual workflow surfaces dilute the product story

The presence of `/workflows` means the system still suggests there are two competing ways to define reusable behavior.

#### 5. Sage is the thesis, but not always the first obvious destination

Landing and setup sequences still distribute attention across home, setup, onboarding, and account surfaces before the user reaches the central assistant relationship.

#### 6. Specialists do not yet feel like friendly “apps”

They still feel like installed runtime objects because their configuration and status language is infrastructure-heavy.

### Medium gaps

#### 7. Naming does not consistently honor customer mental models

Terms like:

- switchboard
- trust mode
- execution placement
- placement profile
- execution artifact
- runtime profile

are still visible to the user in places where simpler mental models should dominate.

#### 8. The product does not yet show a clear progression from “task” to “reusable”

There is no obvious customer bridge from:

- asking Sage for something useful

to:

- saving that success as a reusable capability

That is a core platform moment and it is currently missing from the visible journey.

---

## 6. Final Customer Verdict

From an engineering perspective, the product is far ahead of where the UI used to be.

From a non-technical customer perspective, the product is **close to coherent but not yet truly natural**.

Current customer impression:

- Sage is promising
- the Store is promising
- the Specialists concept is promising
- the install/configure path is still too technical
- custom creation is missing
- onboarding still feels like multiple systems being prepared, not one assistant becoming available

The product is not blocked by lack of capability.
It is blocked by missing customer choreography.

That is the current customer journey state.
