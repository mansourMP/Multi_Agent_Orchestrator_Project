# Platform Simplification Proposal

Status: proposed architectural correction  
Date: 2026-04-09  
Audience: founder, product, design, backend, frontend, security  
Purpose: collapse Empyralis into one universal operator engine, kill surface bloat, and make the Creation Forge the only birth path for agents

---

## 1. Executive Decision

Empyralis should stop behaving like a collection of semi-independent products.

The correct architecture is:

- one **visible operating system**: Sage
- one **universal operator engine**: the Harness runtime
- one **birth path**: the Creation Forge
- one **agent contract**: `Bible + Skill Manifest + Channel Bindings`

That means:

- an agent is **not** a custom code path
- an agent is **not** a separate orchestration framework
- an agent is **not** a unique frontend product surface

An agent is:

1. a manifest
2. a scoped memory envelope
3. a set of allowed skills
4. a set of policies and channel bindings
5. a persistent thread identity

The runtime engine should be identical for all agents.

---

## 2. Universal Harness

## 2.1 Core doctrine

Every agent should run through the same operator loop:

1. load manifest
2. load minimal context
3. classify the user request
4. plan
5. execute allowed skills
6. reflect / critic-check
7. return response or escalate

The engine changes behavior by loading different manifests, not by branching into different agent-specific codebases.

This is the path to operating **5,000 agents** without maintaining 5,000 implementations.

---

## 2.2 Why this is the right pattern

Current agentic best-practice sources all point in the same direction:

- OpenAI’s practical guide frames agents as the combination of **model + tools + instructions**, with orchestration built around a run loop and clear exit conditions.
- Anthropic’s architecture guidance emphasizes **modularity**, **tools as discrete reusable modules**, and evaluator/optimizer loops where a generator is checked against explicit criteria.
- Reflexion shows that agents improve by storing **linguistic feedback** and using it in later decisions instead of requiring model retraining.
- Anthropic’s MCP toolset model and OpenAI’s connector registry direction both reinforce the same operational idea: tools should be **centrally governed, selectively enabled, and dynamically loaded**, not hard-wired into every agent.

Inference from those sources:

- the winning architecture is **one operator engine with dynamic manifests**
- not many bespoke agents with bespoke orchestration trees

---

## 2.3 Universal operator loop

### Stage A: Manifest load

Input:

- `agent_id`
- `workspace_id`
- `tenant_id`
- `channel_id`
- `request`

The engine loads:

- agent manifest
- active Bible version
- bound skills
- channel policy
- memory retrieval policy
- risk class

### Stage B: Context assembly

The engine compiles a minimal turn context:

- mission
- hard context
- operational policy
- channel identity
- allowed skills
- latest relevant memory slices
- tenant/workspace scope

This context must be assembled dynamically. No 50-page Bible should be pasted raw into every turn.

### Stage C: Plan

The operator decides:

- answer directly
- ask a clarifying question
- invoke one skill
- invoke multiple skills
- delegate to Sage
- trigger human approval

The planner is universal. It reads the manifest and the current request and decides the next step.

### Stage D: Execute

The executor can only use skills that satisfy all three:

1. present in the manifest
2. enabled for the workspace
3. authorized by tenant scope / policy

Examples:

- `inventory.lookup`
- `email.read`
- `calendar.read_write`
- `web.search`
- `crm.write_note`

### Stage E: Critic / reflection

Before the customer sees the response, the engine runs a self-check against the Bible and the tool results.

### Stage F: Publish

The final response is written to:

- the channel thread
- the run ledger
- the artifact ledger if applicable
- the reflection buffer if the turn revealed a mistake or gap

---

## 2.4 Agent manifest

The Forge should generate one manifest JSON per agent.

Example shape:

```json
{
  "id": "agent_parts_pro",
  "version": "1.0.0",
  "identity": {
    "name": "Parts Pro",
    "role": "Inventory Specialist",
    "owner_mode_enabled": true,
    "customer_mode_enabled": true
  },
  "bible": {
    "mission": "Help customers identify compatible parts and answer inventory questions.",
    "hard_context_refs": ["rag://workspace/parts-catalog", "rag://workspace/fitment-rules"],
    "operational_policy": [
      "Never invent stock.",
      "If fitment is unclear, ask for year/make/model/VIN.",
      "Do not quote unavailable parts as in stock."
    ]
  },
  "skills": [
    { "id": "inventory.lookup", "required": true },
    { "id": "web.search", "required": false }
  ],
  "channels": {
    "web_chat": true,
    "email": false,
    "whatsapp": false
  },
  "approval_policy": {
    "customer_quotes_above_usd": 500,
    "external_actions_require_human": true
  },
  "memory_policy": {
    "turn_window": 12,
    "retrieval_limit": 6,
    "reflection_enabled": true
  }
}
```

This manifest should become the canonical runtime contract.

---

## 2.5 Skill registry

Empyralis should use a single **skill registry** for all agents.

Each skill should have:

- `skill_id`
- description
- required scopes
- tool adapter
- risk class
- input schema
- output schema
- human-approval requirement
- timeout / retry policy

Example:

- `inventory.lookup`
  - scope: workspace inventory
  - adapter: SQL query against `workspace_inventory_items`
  - risk: low read-only
  - approval: none

- `email.send`
  - scope: delegated outbound channel
  - adapter: email connector
  - risk: medium/high
  - approval: required unless auto-approved by policy

This mirrors the direction of modern tool governance:

- central connector/registry governance
- per-tool allowlists/denylists
- lazy loading / selective exposure for large toolsets

Empyralis should adopt that pattern internally even if we later support MCP adapters.

---

## 2.6 Scaling to 5,000 agents

The scaling model is:

- 1 engine
- N manifests
- M skills
- RLS-protected tenant data
- cached retrieval slices

This scales because:

### Identity is data, not code

Adding a new agent means adding a new manifest, not creating a new service.

### Skills are reused

The same `inventory.lookup` skill can power:

- Parts Pro
- Tire Desk
- Brake Counter
- Warehouse Reorder Assistant

### Retrieval is scoped

Each agent loads only:

- the current request
- a few Bible sections
- a few memories
- only the relevant tool descriptions

### Reflection is selective

Only turns with real risk or uncertainty pay the full critic cost.

### Runs remain universal

The same run ledger, approval system, and artifact system serve every agent.

---

## 3. Kill List

These surfaces are bloat. They either duplicate the same concept or drag old builder-era architecture back into the main product.

## 3.1 Kill as top-level product surfaces

### Kill 1: `Store`

Decision:

- remove `Store` from primary navigation
- fold “import blueprint / import skill pack / install template” into the Forge

Why:

- the current nav still treats `Store` as a peer product surface in [frontend/lib/navigation.ts](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/lib/navigation.ts)
- the product thesis is not “shop for agents”
- the product thesis is “birth and operate agents through Sage”

Replacement:

- `Import Blueprint` inside the Forge
- optional future marketplace hidden behind advanced import/publish flows

### Kill 2: separate `Skills`, `Workflows`, `Builder`, `Solutions`

Decision:

- remove them from customer-facing IA
- keep only an internal/advanced `Studio` surface later if truly needed

Why:

- the current codebase still carries builder-era sprawl across:
  - [`frontend/app/skills/page.tsx`](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/skills/page.tsx)
  - [`frontend/app/workflows/page.tsx`](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/workflows/page.tsx)
  - builder references in [frontend/app/globals.css](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/globals.css)
  - store/library logic still centered on skills in [`frontend/app/(shell)/store/page.tsx`](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/(shell)/store/page.tsx)

Why it must die:

- it forces users to understand internal asset taxonomy
- it fractures one operating system into many tools

Replacement:

- one Forge
- one manifest
- one skill-binding panel in Owner Mode

### Kill 3: separate `Executions`, `History`, `Approvals`, `Artifacts`

Decision:

- make `Runs` the only execution ledger noun
- move approvals and outputs inside Runs and Sage

Why:

- current route ownership still aliases multiple surfaces into the same mental model:
  - `/runs`
  - `/executions`
  - `/history`
  - `/approvals`
  - `/artifacts`

Evidence:

- [frontend/lib/navigation.ts](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/lib/navigation.ts) maps all of those under the `runs` section already
- that means the UI itself is signaling they are duplicates

Replacement:

- `Runs`
  - tabs/filters: `Active`, `Needs Review`, `Completed`, `Outputs`
- Sage inline cards for approval and output review

### Kill 4: raw machine/health/admin surfaces as emotional destinations

Decision:

- keep them available, but hide them under `Integrations` or `Settings`

Why:

- raw infrastructure is not the product
- the owner should care about “Can my agent use Inventory?” not “Machine runtime health surface”

### Kill 5: public-facing hardcoded template storefront behavior

Decision:

- the empty Agents state should stay a Forge, not a catalog

Why:

- hardcoded storefront cards move the product back toward a marketplace before the OS is mature

Replacement:

- creation workspace
- archetype assist
- import blueprint

---

## 4. Creation Forge

## 4.1 The Forge becomes the only birth path

Every new agent should be created only through the Forge.

Flow:

1. name the agent
2. describe what it should do
3. choose channels
4. choose allowed skills
5. Sage drafts the Bible
6. Forge emits manifest JSON
7. Owner lands directly in Owner Mode

No alternative birth paths should exist in the main product.

That means:

- no separate builder-first route
- no separate workflow-first creation route
- no separate skill-first installation route

---

## 4.2 What the Forge should generate

The Forge should produce:

1. manifest JSON
2. initial Bible draft
3. skill bindings
4. channel bindings
5. default approval policy
6. retrieval references

Everything else is an edit of those assets.

---

## 4.3 What “import” becomes

Template import is still useful, but it must become a subordinate action.

Correct behavior:

- inside Forge:
  - `Create from scratch`
  - `Import blueprint`

Wrong behavior:

- a separate “Store” as a peer operating surface

---

## 5. Hallucination Shield

## 5.1 Core principle

The agent must check its own answer against:

1. Bible constraints
2. skill outputs
3. approval policy
4. channel policy

before the customer sees it.

This is where the reflection pattern belongs.

---

## 5.2 Reflection architecture

Use a two-tier reflection model.

### Tier 1: synchronous policy critic

Run on every medium/high-risk turn before user-visible output.

Inputs:

- draft answer
- current plan
- tool results
- extracted Bible constraints
- channel rules

Checks:

- did the answer rely on facts not present in the tool result?
- did it violate hard context?
- did it skip a required tool?
- did it make a promise that requires approval?
- should it ask a clarifying question instead?

Outputs:

- `pass`
- `rewrite`
- `escalate`

### Tier 2: asynchronous reflective memory

Run after the turn when:

- the answer was corrected
- a human overrode it
- a tool failed
- a customer disputed the answer

Store a reflection entry such as:

- “When the customer asks for inventory fitment and year is missing, ask for VIN or exact trim before claiming compatibility.”

This is the Empyralis version of Reflexion:

- not model fine-tuning
- not hidden chain-of-thought retention
- explicit operational memory derived from failure and correction

---

## 5.3 Planning-Exec-Critic pattern

The correct internal pattern is:

1. **Planner**
   - decomposes request
   - chooses skill path
   - determines if approval might be needed

2. **Executor**
   - runs skills under scope and policy
   - records artifacts and structured evidence

3. **Critic**
   - validates the answer against Bible + evidence
   - rewrites once or escalates

This should be the default universal loop.

Do not create bespoke orchestration for each agent unless the job is truly exceptional.

---

## 6. Final Product Simplification

## 6.1 Final visible product

Primary visible layers:

- Sage
- Agents
- Runs
- Integrations

Optional utility:

- Settings
- Usage
- Account

Everything else is subordinate or hidden.

---

## 6.2 Final mental model

For the owner:

- I talk to Sage
- I create agents in the Forge
- each agent is just a named role with channels and skills
- I can test it in Customer Mode
- I can refine it in Owner Mode
- I can inspect real work in Runs

That is the whole product.

---

## 6.3 Immediate architecture directives

1. Make the manifest the canonical runtime contract.
2. Route all agents through one operator engine.
3. Keep skill definitions centralized and scoped.
4. Remove top-level Store/Builder/Skills/Workflows sprawl from the main user journey.
5. Collapse execution nouns into Runs.
6. Add synchronous critic checks before customer-visible output on high-risk turns.
7. Add asynchronous reflective memory for recurring mistakes.

---

## 7. Sources

Primary sources used:

- OpenAI, *A practical guide to building agents*  
  [https://openai.com/business/guides-and-resources/a-practical-guide-to-building-ai-agents/](https://openai.com/business/guides-and-resources/a-practical-guide-to-building-ai-agents/)
- OpenAI, *Introducing AgentKit*  
  [https://openai.com/index/introducing-agentkit/](https://openai.com/index/introducing-agentkit/)
- Anthropic, *Building Effective AI Agents: Architecture Patterns and Implementation Frameworks*  
  [https://resources.anthropic.com/hubfs/Building%20Effective%20AI%20Agents-%20Architecture%20Patterns%20and%20Implementation%20Frameworks.pdf](https://resources.anthropic.com/hubfs/Building%20Effective%20AI%20Agents-%20Architecture%20Patterns%20and%20Implementation%20Frameworks.pdf)
- Anthropic, *MCP connector*  
  [https://platform.claude.com/docs/en/agents-and-tools/mcp-connector](https://platform.claude.com/docs/en/agents-and-tools/mcp-connector)
- Shinn et al., *Reflexion: Language Agents with Verbal Reinforcement Learning*  
  [https://arxiv.org/abs/2303.11366](https://arxiv.org/abs/2303.11366)

Inference note:

The “Universal Harness” recommendation is an architectural synthesis from those sources plus the current Empyralis codebase. It is not copied from any single external system.
