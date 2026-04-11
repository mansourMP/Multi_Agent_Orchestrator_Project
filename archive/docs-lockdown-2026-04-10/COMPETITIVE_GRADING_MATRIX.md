# Competitive Grading Matrix

Date: 2026-04-09  
Scope: comparative UX grading only  
Constraint: no Empyralis source code modified

## 0. Benchmark Frame

This grading uses two inputs:

1. Product knowledge of:
   - Linear
   - Notion
   - OpenAI
   - Anthropic
   - Google
2. Code-backed anatomical rules extracted from the local reference library:
   - [references/dub](/Users/mansur/Multi_Agent_Orchestrator_Project/references/dub)
   - [references/shadcn-ui](/Users/mansur/Multi_Agent_Orchestrator_Project/references/shadcn-ui)
   - [references/cal-com](/Users/mansur/Multi_Agent_Orchestrator_Project/references/cal-com)

Supporting internal audits:

- [RAW_UI_INVENTORY_AUDIT.md](/Users/mansur/Multi_Agent_Orchestrator_Project/docs/RAW_UI_INVENTORY_AUDIT.md)
- [UI_CRUFT_AUDIT.md](/Users/mansur/Multi_Agent_Orchestrator_Project/docs/UI_CRUFT_AUDIT.md)
- [UX_REFERENCE_TAXONOMY.md](/Users/mansur/Multi_Agent_Orchestrator_Project/docs/UX_REFERENCE_TAXONOMY.md)

Scoring rubric:

- `10` = Linear / Notion level
- `8` = polished launch-grade
- `6` = strong but visibly uneven
- `4` = functional, still prototype-coded in the surface
- `1` = broken prototype

## 1. Scorecard

| Category | Score | Verdict |
|---|---:|---|
| Information Density vs. Clutter | 5/10 | Functional density, weak editing discipline |
| Action Hierarchy | 4/10 | Too many surfaces still argue about the primary action |
| Surface & Layer Logic | 6/10 | Better than before, still not fully predictable or unified |
| The Template UX | 3/10 | Engine is strong, UI still exposes internal architecture |
| Word Economy | 3/10 | The product still speaks like a control plane, not a confident OS |

**Overall surface grade: 4.2/10**

Blunt summary:

Empyralis is no longer a broken prototype. It is a powerful system with a still-prototype surface. The architecture is ahead of the interface. Linear, Notion, OpenAI, Anthropic, and Google all hide system complexity behind ruthless hierarchy. Empyralis still explains too much, names too many internals, and lets too many elements compete at once.

---

## 2. Information Density vs. Clutter: **5/10**

### Brutal justification

Empyralis has a lot of information, but it does not yet have tier-1 information design.

What tier-1 platforms do:

- Linear compresses information without making the screen feel crowded.
- Notion layers information in blocks, not in explanation piles.
- OpenAI and Anthropic keep the conversational surface extremely selective.
- Google separates configuration density from marketing density cleanly.

What Empyralis does now:

- some pages are pleasantly sparse: `/store`, `/agents`
- some pages are overloaded: `/credentials`, `/health`, `/runs/[id]/inspect`
- some pages mix product positioning, system explanation, and action rails in the same visible zone
- the system often uses prose to explain what the UI itself should imply

Evidence from current surface:

- `/sign-in` contains multiple stacked explanation layers about account boundaries, providers, recovery, browser vs desktop handoff, and post-sign-in guidance
- `/store` still says things like `compile into hidden, validated execution artifacts`
- `/agents/[id]/configure` asks the user to read through placement, runtime, trust, and artifact language before acting
- `/credentials` is still a dense operator console, not a clean integration surface

This is not a whitespace problem. It is an editorial problem. The pages are carrying too many conceptual layers at once.

### Why this is not lower than 5

The platform is at least organized enough that a user can usually find the right domain:

- store
- agents
- settings
- runs
- chat

So this is not chaos. It is density without enough curation.

### Exact architectural UI solution required

To reach `8+`, Empyralis needs a strict page anatomy system based on the reference set.

Required structure:

1. Every top-level page gets only three zones:
   - hero header
   - metric/summary rail
   - one primary content band
2. Explanatory prose must move from page-level blocks into:
   - field descriptions
   - tooltips
   - empty states
3. No page hero should simultaneously do:
   - marketing
   - setup explanation
   - system architecture explanation
4. Dense pages like `/credentials`, `/health`, and `/inspect` need segmented containers modeled after:
   - Dub grouped forms
   - Cal.com wizard boxes
   - Trigger.dev-style run rails

Reference-based target:

- Dub form anatomy: short nouns, bounded groups, one main action
- shadcn project flow: structured sections, minimal CTA count
- Cal wizard anatomy: one content container per phase

---

## 3. Action Hierarchy: **4/10**

### Brutal justification

This is one of the weakest areas.

Tier-1 products make the next action obvious:

- Linear: one dominant button or one dominant list action
- Notion: one insertion point or one focused editing target
- OpenAI / Anthropic: one input box, one send path, optional small controls
- Google: strong primary button contrast, restrained secondary actions

Empyralis still has too many surfaces where:

- the entire card is clickable
- a CTA inside the card is also clickable
- a link wraps a button
- multiple adjacent buttons compete with equal emphasis

Concrete evidence:

- [frontend/components/orion/agents/InstalledAgentCard.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/components/orion/agents/InstalledAgentCard.tsx)
- [frontend/components/orion/agents/AgentStoreCard.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/components/orion/agents/AgentStoreCard.tsx)
- [frontend/components/orion/artifacts/ArtifactCard.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/components/orion/artifacts/ArtifactCard.tsx)
- [frontend/components/orion/workflows/WorkflowListRow.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/components/orion/workflows/WorkflowListRow.tsx)
- [frontend/app/credentials/page.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/credentials/page.tsx)

This is not just invalid DOM in some places. It signals a deeper hierarchy problem: the UI does not always know whether a surface is:

- a navigation tile
- a selection tile
- or an action card

That confusion is anti-Linear.

### Why this is not lower than 4

The product does still expose the main domains correctly:

- Sage
- Store
- Agents
- Runs
- Settings

But inside those domains, action priority is not strict enough.

### Exact architectural UI solution required

To reach `8+`, Empyralis needs a hard action contract across the whole frontend.

Required rules:

1. Every card chooses one mode only:
   - `navigation card`
   - `selection card`
   - `action card`
2. No `Link` may wrap `Button`
3. No clickable container may also own more than one emphasized nested CTA
4. Each page may have:
   - one primary action
   - one secondary action cluster
   - all other actions demoted to ghost or overflow
5. Buttons must map to a strict tiering model:
   - primary = only one per zone
   - secondary = supportive
   - ghost = utility
   - destructive = isolated

Reference-based target:

- Google button hierarchy
- Linear’s single-dominant CTA discipline
- shadcn semantic variant ladder: `default`, `secondary`, `ghost`, `destructive`

---

## 4. Surface & Layer Logic: **6/10**

### Brutal justification

Empyralis is materially better here than it used to be. The shell is not completely unstable anymore. But it is still not tier-1.

What tier-1 surfaces do:

- one predictable overlay plane
- stable main stage
- drawers, popovers, and dialogs all feel like one family
- panels do not surprise the user with layout politics

What Empyralis does now:

- the shell is improved
- the left sidebar behavior is more stable than before
- the cockpit and inspect rail are directionally correct
- but the product still has too many local interaction models:
  - sidebar
  - inspect panel
  - notifications
  - chat drawers
  - settings sections
  - integration detail focus panels

The system does not feel broken. It feels partially unified.

The biggest issue is not just z-index. It is that some surfaces still behave like they were designed independently.

### Why this is higher than the other weak categories

The core shell now mostly holds together:

- fixed shell
- sidebar
- main stage
- topbar

That is a real improvement and prevents this from dropping to `4`.

### Exact architectural UI solution required

To reach `8+`, Empyralis needs one canonical surface model.

Required rules:

1. One overlay plane for all floating UI by default
2. One short layer ladder only:
   - app chrome
   - overlay plane
   - embedded exceptional cases
3. All floating UI must use shared primitives:
   - dialog
   - sheet/drawer
   - popover
4. Device adaptation must change container, not information model:
   - desktop dialog
   - mobile drawer
5. No route should invent its own overlay semantics in-page unless it is the dedicated cockpit
6. Main-stage geometry must never react to modal/drawer open state

Reference-based target:

- shadcn single top overlay plane
- Dub short z-index ladder
- Cal centralized dialog atoms

---

## 5. The Template UX: **3/10**

### Brutal justification

This is currently the worst customer-facing category.

The backend pivot is correct. The engine is good. The visible UX is not there yet.

What a tier-1 platform would do:

- one clean install/configure flow
- short nouns
- progressive disclosure
- one dominant save/install action
- runtime complexity hidden behind clear choices

What Empyralis does now:

- removed the graph builder from the primary surface
- but replaced it with a screen that still speaks like an internal control plane

Current configuration language still includes:

- `Switchboard`
- `Install label`
- `Execution placement`
- `Trust Mode`
- `Autonomous Execution`
- `runtime profiles`
- `compiled execution artifact`
- `full-trust path`
- `policy gates`
- `folder grants`

That is not consumer-grade or enterprise-grade. It is architecture-grade.

This page is asking the user to think like the backend.

### Why this is not lower than 3

The structural direction is correct:

- no graph
- toggles
- placement
- trust setting

So the product strategy is right. The current labeling and form choreography are what drag the score down.

### Exact architectural UI solution required

To reach `8+`, the entire template/install UX must be rebuilt as a guided product flow, not a schema editor.

Required structure:

1. Convert the current configure page into a staged flow:
   - choose where it runs
   - choose what it can do
   - choose how much autonomy it gets
   - review and install
2. Only show configuration branches when they are relevant
3. Replace internal nouns with user nouns
4. Keep exactly one primary footer action at all times
5. Move runtime/compiler language completely out of the visible first-run path
6. Treat the install as a product setup flow, not an admin form

Reference-based target:

- Cal.com wizard anatomy
- shadcn `Create Project` dialog anatomy
- Dub grouped form sections with one dominant submit action

This category will not become good through copy edits alone. It needs structural choreography.

---

## 6. Word Economy: **3/10**

### Brutal justification

Empyralis still speaks like a system explaining itself.

Tier-1 products do not narrate their architecture to the user. They imply it through layout, hierarchy, and local help.

Empyralis still overuses:

- brand repetition on sign-in
- trust boundary explanations
- provider boundary explanations
- backend/runtime/compiler terms
- explanatory labels where direct action labels should exist

Examples from the current surface:

- sign-in repeatedly says `Empyralis account`
- store says `compile into hidden, validated execution artifacts`
- configure says `backend full-trust path`
- agents says `placement route: cloud_worker`
- settings/account repeatedly restate the provider-vs-account boundary

This creates the tone of an insecure prototype that wants to make sure the user understands the architecture, instead of a confident OS that simply works.

### Why this is not lower than 3

There is some good direction already:

- Sage as a named central relationship
- cleaner store and agents IA
- less overt workflow language than before

But the product is still far from minimalist confidence.

### Exact architectural UI solution required

To reach `8+`, Empyralis needs a formal copy architecture, not just “better copy.”

Required rules:

1. Every page gets one conceptual layer only:
   - user goal
   - not user goal plus architecture explanation
2. Every label must be:
   - noun
   - verb
   - or status
   - never implementation commentary
3. Brand name appears:
   - once in shell
   - once in metadata
   - only when necessary in account/legal identity contexts
4. Helper text moves down to field level
5. Internal nouns are banned from default UX copy:
   - artifact
   - compiled
   - runtime profile
   - policy gate
   - registry sync
   - full-trust path
6. Empty states and loading states must sound like product states, not backend operations

Reference-based target:

- Anthropic calm directness
- OpenAI minimal prompt framing
- Linear’s clipped noun/verb economy
- Notion’s almost invisible product copy

---

## 7. Final Comparative Verdict

If Linear, Notion, OpenAI, Anthropic, and Google represent the tier-1 surface standard, Empyralis is currently:

- **architecturally ambitious**
- **product-strategically correct**
- **visually and linguistically under-edited**

It is not a toy anymore.
It is not yet elite.

The biggest gap is no longer backend power. It is UI confidence.

### Current ranking summary

| Dimension | Current state |
|---|---|
| Product architecture | ahead of surface |
| Interaction discipline | behind benchmark |
| Configuration ergonomics | well behind benchmark |
| Brand/copy restraint | well behind benchmark |
| Shell foundation | improving, but not yet benchmark-grade |

### What this means in plain language

Empyralis today feels like:

- a very capable internal platform
- partially polished into a product

Tier-1 products feel like:

- one inevitable interface

That is the remaining gap.
