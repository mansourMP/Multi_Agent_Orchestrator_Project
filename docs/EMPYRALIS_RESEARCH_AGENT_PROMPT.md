You are reviewing the Empyralis product design.

Project path:
`/Users/mansur/Multi_Agent_Orchestrator_Project`

Primary source documents:
- `docs/EMPYRALIS_PRODUCT_DESIGN_BRIEF.md`
- `docs/EMPYRALIS_UI_OS_CONTRACT.md`
- `docs/EMPYRALIS_UI_RESEARCH_REVIEW.md`

Use the review file as prior analysis, not as unquestionable truth.
If screenshots contradict it, say so.

## Product context

Empyralis is:
- an agent execution platform
- a desktop-first operating surface
- a system for agents, runs, approvals, artifacts, integrations, and automations

It is not:
- a developer-only tool
- a graph toy
- a dashboard full of random cards and buttons

## Brand / visual direction

Canonical colors:
- Primary `#6D28D9`
- Highlight `#8B5CF6`
- Warning `#F59E0B`

Direction:
- premium
- minimal
- calm
- precise
- OS-like
- darker charcoal tone in dark mode, not flat black
- warmer cream tone in light mode, not stark white

Avoid:
- noisy dashboards
- giant rounded boxes everywhere
- decorative pills/chips everywhere
- inconsistent button/tab systems

## Core product model

- `Workbench`: do something now
- `Automations`: reusable systems
- `Runs`: what happened
- `Approvals`: what needs permission
- `Agents`: who owns the work
- `Artifacts`: outputs
- `Integrations`: connected channels/accounts
- `Settings`: advanced/system

## Your task

Given screenshots or code surfaces, analyze:
1. what is visually inconsistent
2. which buttons do not deserve to exist
3. where hierarchy is weak
4. whether the screen feels too technical for normal users
5. whether the page follows the product model above
6. whether the tonal quality feels calm and premium or too black/too noisy

Then provide:

### 1. Diagnosis
- exact problems
- why they hurt usability
- severity

### 2. Design direction
- where each control should live
- what should be removed
- what should be renamed
- what should be primary vs secondary
- which buttons are duplicated and should be collapsed into one home

### 3. Concrete recommendations
- specific header structure
- button placement
- tab usage
- metric strip usage
- empty-state behavior
- spacing/density guidance

### 4. Guardrails
- what must not be changed
- what patterns should be reused everywhere
- whether the tonal quality should move toward charcoal/warm-neutral surfaces instead of black/white extremes

### 5. Implementation order
- highest-value fixes first
- avoid broad redesign churn

## Output constraints

- be specific
- be product-level, not vague
- do not suggest adding random new pages or concepts
- do not turn the app into a developer tool
- optimize for clarity, consistency, and operational trust

If screenshots are provided, refer to them directly and explain what looks wrong and how to fix it.
