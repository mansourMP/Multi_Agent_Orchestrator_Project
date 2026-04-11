# Competitive UI Analysis

Date: 2026-04-09  
Scope: comparative design benchmarking only  
Constraint: no Empyralis source code modified

## 0. Sources Used

Internal Empyralis audits:

- [RAW_UI_INVENTORY.md](/Users/mansur/Multi_Agent_Orchestrator_Project/docs/RAW_UI_INVENTORY.md)
- [UI_CRUFT_AUDIT.md](/Users/mansur/Multi_Agent_Orchestrator_Project/docs/UI_CRUFT_AUDIT.md)
- [CUSTOMER_JOURNEY_AUDIT.md](/Users/mansur/Multi_Agent_Orchestrator_Project/docs/CUSTOMER_JOURNEY_AUDIT.md)
- [UX_REFERENCE_TAXONOMY.md](/Users/mansur/Multi_Agent_Orchestrator_Project/docs/UX_REFERENCE_TAXONOMY.md)
- [COMPETITIVE_GRADING_MATRIX.md](/Users/mansur/Multi_Agent_Orchestrator_Project/docs/COMPETITIVE_GRADING_MATRIX.md)

Reference codebases:

- [references/dub](/Users/mansur/Multi_Agent_Orchestrator_Project/references/dub)
- [references/shadcn-ui](/Users/mansur/Multi_Agent_Orchestrator_Project/references/shadcn-ui)
- [references/cal-com](/Users/mansur/Multi_Agent_Orchestrator_Project/references/cal-com)

External benchmark references:

- [Linear Dashboards](https://linear.app/docs/dashboards)
- [Linear Mobile](https://linear.app/mobile)
- [OpenAI Prompt Management](https://help.openai.com/en/articles/9824968)
- [OpenAI Prompt Generation Guide](https://platform.openai.com/docs/guides/prompt-generation)
- [Anthropic Docs Home](https://docs.anthropic.com/en/home)
- [Meet Claude](https://www.anthropic.com/claude)
- [Google Material 3 Buttons](https://m3.material.io/components/buttons/overview)
- [ElevenLabs UI](https://ui.elevenlabs.io/)
- [ElevenLabs UI Docs](https://ui.elevenlabs.io/docs)

## 1. Executive Summary

Empyralis is now structurally closer to a platform than to a prototype, but its surface still lacks the editing discipline of tier-1 products.

The most important benchmark lesson is this:

- top-tier products do **not** necessarily show less information
- they show **better-ranked** information

Linear, OpenAI Platform, Anthropic, Google Material, and ElevenLabs all share three visible traits:

1. one dominant action per zone
2. one stable surface hierarchy
3. dense information inside sharply bounded containers

Empyralis currently fails those standards in three places:

1. button hierarchy is not strict enough
2. the Chat and Integrations surfaces still mix too many levels of meaning at once
3. layers, transitions, and side-surfaces still feel locally invented instead of globally governed

The rest of this document maps the gap exactly.

---

## 2. Button & Style Mapping

This section compares Empyralis against Linear/Vercel-grade standards for button hierarchy, spacing, and visual semantics.

### 2.1 Benchmark pattern

Across Linear, Google Material 3, Dub/Vercel-style apps, OpenAI Platform, and Anthropic:

- the page usually has **one obvious primary button**
- secondary buttons are quieter and structurally grouped
- ghost buttons are true utilities, not co-equal actions
- destructive buttons are spatially isolated
- button padding is tight, not bloated
- icon buttons are rare and predictable

What makes them feel premium:

- button variants are few
- primary color is used sparingly
- there is no “button soup”
- adjacent CTAs rarely compete with equal weight

### 2.2 Empyralis current state

From the raw inventory and cruft audit:

- multiple routes wrap `Link` around `Button`
- several cards are both clickable containers and also contain buttons
- some hero areas show two or three actions with insufficient prioritization
- card CTAs often look equally important even when one is clearly the main action

Observed problem surfaces:

- [frontend/app/store/page.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/store/page.tsx)
- [frontend/app/agents/page.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/agents/page.tsx)
- [frontend/components/orion/agents/InstalledAgentCard.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/components/orion/agents/InstalledAgentCard.tsx)
- [frontend/components/orion/agents/AgentStoreCard.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/components/orion/agents/AgentStoreCard.tsx)
- [frontend/components/orion/artifacts/ArtifactCard.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/components/orion/artifacts/ArtifactCard.tsx)
- [frontend/app/credentials/page.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/credentials/page.tsx)

### 2.3 Mapping table

| Design topic | Tier-1 standard | Empyralis current behavior | What to adopt |
|---|---|---|---|
| Primary CTA count | 1 per zone | Sometimes 2-3 visually competing CTAs | Enforce one primary action per hero, panel, card footer |
| Link/button semantics | Use a link styled as a button or a real button, never both | Link wrapping Button appears repeatedly | Adopt a single semantic button-link primitive |
| Card action mode | Card is either navigational or action-oriented | Many cards are both clickable and contain CTAs | Give each card one interaction contract only |
| Secondary action placement | Cluster secondary actions tightly and quietly | Actions sometimes sit on equal footing with the primary | Group secondaries in a right-aligned utility cluster |
| Destructive action treatment | Visually and spatially isolated | Some destructive actions sit alongside normal actions too casually | Reserve danger actions for dedicated edge slots or overflow menus |
| Padding density | Tight but readable, often 32-40px height for dense UIs | Some controls are consistent, some still too roomy or too chrome-heavy | Normalize compact heights for dense operational UIs |

### 2.4 Exact adoption rules

These are the button rules Empyralis should adopt from the benchmark set.

#### Rule 1: One primary button per container

Apply this to:

- page heroes
- card footers
- modal footers
- toolbar groups

Meaning:

- if a zone has `Run`, `Configure`, and `Chat`, only one gets primary styling
- the rest become secondary or ghost

#### Rule 2: Separate navigation from action

Adopt the Linear/Vercel discipline:

- navigational surfaces use link semantics
- action surfaces use button semantics
- never both layered together

#### Rule 3: Demote utility actions hard

Utility controls like:

- refresh
- copy
- back
- open details
- secondary browse links

should visually drop behind the main forward action.

#### Rule 4: Use icon-only buttons sparingly

Google Material and Linear only use icon-only buttons where meaning is already extremely standard:

- close
- more
- notifications
- sidebar collapse

Empyralis should keep that same threshold.

### 2.5 Bottom line

Empyralis does not need more button styles.
It needs fewer visible priorities at once.

---

## 3. Information Density: Chat and Integrations

This is the most important comparison, because Empyralis wants the confidence of an IDE or Bloomberg-like operating surface without becoming visually exhausting.

### 3.1 What top-tier dense products actually do

Dense premium interfaces are not “busy.”
They are:

- compartmentalized
- row-aligned
- predictable
- visually quiet

Linear:

- packs status, metadata, and action into one row
- uses restrained borders and subtle color
- keeps copy clipped and short

OpenAI Platform:

- contains complexity inside bounded cards and panels
- uses clear headers and stable action rails
- keeps explanatory text localized to the thing being configured

Anthropic:

- uses low-drama visual treatment
- leans on typography and spacing more than chrome

Google Material:

- separates surfaces by elevation and role
- makes dense surfaces readable through consistent spacing and emphasis hierarchy

ElevenLabs:

- shows complex multimodal interaction without crowding the user
- uses clear stateful components with smooth animation and focused affordances

### 3.2 Empyralis Chat panel analysis

Current strength:

- the Sage-first direction is correct
- chat is the right primary relationship
- approvals and interventions are now structured
- specialist context exists

Current density problem:

- the chat surface still carries too many conceptual layers in one glance:
  - Sage identity
  - workspace facts
  - specialist availability
  - placement
  - trust mode
  - reasoning
  - model/provider
  - inspect side state

This creates density, but not yet “terminal-grade confidence.”

What makes it feel prototype-like:

- too many badges/chips before the user has oriented
- several adjacent metadata items carry equal visual weight
- composer controls are richer than necessary at the first glance
- some surface facts are technically accurate but not ranked strongly enough

### 3.3 Empyralis Integrations panel analysis

Current file anchor:

- [frontend/app/credentials/page.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/credentials/page.tsx)

Current strength:

- the page has real capability depth
- connector detail exists
- rows, cards, and modals are already present

Current density problem:

- it behaves like a product console and a marketplace and a configuration center at the same time
- cards are selectable containers plus CTA surfaces
- status, roadmap tier, focus state, provider-specific helper flows, and creation actions all compete
- the user is often looking at:
  - card taxonomy
  - connection state
  - provider caveats
  - detail side state
  - modal entry points

This is high density without enough visual compression strategy.

### 3.4 How to achieve dense-but-clean

Empyralis should adopt the following density rules from Linear, OpenAI Platform, Anthropic, Google, and ElevenLabs.

#### Rule A: One row = one story

For lists and cards:

- title
- one-line description
- status/meta strip
- one dominant action

No extra explanatory paragraphs inside repeated items.

#### Rule B: Metadata belongs in strips, not prose

Chat and Integrations should move supporting facts into:

- inline meta rows
- chips only when they signal state
- short tertiary text

not explanatory sentences

#### Rule C: Dense panels must have fixed structural zones

Each dense operational panel should have:

1. header
2. filter/action rail
3. main list or feed
4. optional detail pane

This is the IDE/Bloomberg principle.
The visual calm comes from repeatable zones, not from reducing data.

#### Rule D: Default density should be compact, not verbose

Adopt:

- shorter titles
- one-line subtitles
- smaller but consistent vertical rhythm
- lower-contrast chrome

#### Rule E: Keep technical explanation out of repeated units

Repeated cards/rows should never explain the system at full sentence length.
That belongs in:

- one help tooltip
- one empty state
- one detail view

### 3.5 Exact adoption targets for Chat

Adopt:

- Linear’s clipped meta strip behavior
- Anthropic’s low-drama typography hierarchy
- OpenAI’s bounded configuration rails

What this means concretely:

- chat identity header should prioritize only:
  - Sage
  - current mode
  - one short context summary
- provider/model/reasoning should be grouped into one compact control cluster
- specialist availability should live in a subordinate right rail or compact drawer, not compete with the message stream
- inspect state should remain visible but clearly secondary to the conversation

### 3.6 Exact adoption targets for Integrations

Adopt:

- Linear-style row hierarchy
- Google Material surface/elevation separation
- Dub-style grouped configuration panels

What this means concretely:

- connector catalog items become either:
  - browse cards
  - or detail rows
  - not both
- the focused connector detail should be a clearly separate detail surface
- roadmap tier and connection status need a stable taxonomy with lower visual noise
- provider-specific advanced actions should stay hidden until the detail surface is opened

### 3.7 Bottom line

Empyralis can absolutely become dense and premium.
But it must stop mixing:

- explanation
- status
- navigation
- and action

inside the same repeated units.

---

## 4. Soft Animations & Layers

This section compares motion, elevation, notifications, and overlay behavior.

### 4.1 How top-tier platforms behave

Across Linear, Anthropic, OpenAI, Google Material, and ElevenLabs:

- motion is short and low-amplitude
- layout rarely shifts as a side effect of an interaction
- overlays fade/scale or slide predictably
- elevation is semantic, not decorative
- notifications are present but not noisy

They do **not** use animation to feel flashy.
They use it to preserve mental continuity.

### 4.2 Notifications

Benchmark pattern:

- notifications appear in one anchored place
- enter and exit softly
- do not shove the main stage
- maintain consistent elevation

Empyralis current risk:

- some notification/feed behavior is structurally correct
- but the broader shell historically had layout reactivity issues, which makes notifications feel less grounded in a stable layer system

Adoption rule:

- notifications should always live on the same overlay plane
- they should never cause stage geometry changes
- movement should be opacity + small translate only

### 4.3 Layer elevation

Benchmark pattern from shadcn, Dub, and Cal:

- one main overlay plane
- sometimes one lower app-chrome plane
- local sticky affordances inside overlays
- almost no arbitrary z-index politics

Empyralis current state:

- improved shell
- but multiple local panel styles still feel independently defined:
  - sidebar
  - inspect panel
  - notifications
  - connector focus panel
  - dialogs
  - drawers

Adoption rule:

- every floating surface must resolve into one of:
  - popover
  - dialog
  - sheet/drawer
  - toast/notification
- each has fixed elevation and motion tokens

### 4.4 Transitions

Benchmark pattern:

- Linear: subtle opacity and position shifts
- ElevenLabs: smooth state transitions for voice/audio interaction
- Google Material: role-based motion, not arbitrary motion
- Anthropic/OpenAI: very restrained motion, often almost invisible

Empyralis current problem:

- when layout shifts happen, they read as bugs, not motion
- side-surfaces can feel like they were added by local implementation rather than a unified motion system

Adoption rule:

- no animation should alter perceived document anchoring
- shell changes should animate only their own boundary, never the entire page stage
- modal and drawer transitions should all come from one shared motion spec

### 4.5 Exact motion/layer patterns to adopt

#### Pattern 1: Stable stage, moving chrome

Adopt from Linear and well-behaved app shells:

- sidebar may move
- drawer may slide
- modal may fade/scale
- main content should remain anchored

#### Pattern 2: Low-amplitude overlay transitions

Adopt from Anthropic/OpenAI:

- opacity fade
- 4-12px translate
- very short easing
- no bounce, no theatrical scaling

#### Pattern 3: Device-adaptive containers

Adopt from shadcn and Dub:

- desktop: dialog/popover
- mobile: sheet/drawer
- same information model, different shell

#### Pattern 4: Soft but clear elevation taxonomy

Adopt from Google Material and reference primitives:

- base stage
- raised card
- top overlay
- urgent/destructive confirmation

No ad hoc local shadows or overlay semantics.

### 4.6 Bottom line

Empyralis does not need more animation.
It needs more trustworthy animation.

---

## 5. Priority Adoption List

This is the prioritized benchmark import list.

### Priority 1: Linear-grade action hierarchy

Adopt immediately:

- one primary CTA per zone
- strict separation of navigation and action semantics
- quiet secondary buttons
- compact row-level meta presentation

Why first:

- this fixes visual noise without changing product logic

### Priority 2: Google/Material surface roles

Adopt immediately:

- stable elevation roles
- semantic surface naming
- predictable card vs dialog vs drawer behavior

Why first:

- this fixes the perception of “random UI fragments”

### Priority 3: OpenAI/Anthropic textual restraint

Adopt immediately:

- fewer explanatory layers on page heroes
- tighter helper text
- no internal runtime/compiler language in customer surfaces

Why first:

- this is the fastest path to a more premium feel

### Priority 4: Dub-style dense configuration anatomy

Adopt next:

- bounded grouped sections
- one dominant save/install action
- short field titles
- helper text near fields, not in large prose blocks

Why:

- this is the right pattern for Store, Agents, and Integrations

### Priority 5: ElevenLabs-level soft multimodal motion

Adopt selectively:

- smooth state transitions for voice, listening, active, loading, and conversational status
- cleaner interactive motion for audio/voice surfaces

Why:

- important, but secondary to fixing hierarchy and language first

---

## 6. Final Verdict

Empyralis does not need a novel design language.
It needs to copy the discipline of the best existing ones.

The correct benchmark blend is:

- **Linear** for hierarchy and density
- **Google Material** for surface roles and elevation
- **OpenAI Platform** for bounded configuration complexity
- **Anthropic** for calm minimal copy and restrained motion
- **ElevenLabs** for multimodal state treatment
- **Dub/shadcn/Cal** for implementation-grade UI anatomy

The platform already has enough capability.
What it needs now is benchmark-grade editing of:

- button priority
- panel density
- surface semantics
- motion restraint
- and copy compression

That is the design gap.
