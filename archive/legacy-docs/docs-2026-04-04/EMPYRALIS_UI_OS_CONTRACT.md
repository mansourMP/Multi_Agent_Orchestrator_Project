# Empyralis UI OS Contract

This product should feel like one operating surface, not a set of unrelated dashboards.

## Core Objects

- `Workbench`: operate now
- `Automations`: reusable systems
- `Runs`: execution truth
- `Agents`: ownership and workload
- `Artifacts`: outputs
- `Integrations`: external channels and accounts
- `Settings`: advanced and system controls

## Page Grammar

Every first-class page should follow the same structure:

1. `Header`
- icon
- title
- short subtitle
- optional actions on the right

2. `Metric strip`
- 3 to 6 summary numbers
- no nested cards
- no explanatory paragraphs inside the strip

3. `Toolbar`
- filters
- search
- secondary controls

4. `Primary content`
- list
- table
- timeline
- inspector

## Button Placement

- One primary action per page, top-right only
- `Refresh` is always ghost/secondary
- Destructive actions stay in row context or dialogs
- Tabs switch one content region only; they are not generic button bars

## Button Audit Rules

- Do not duplicate the same action in multiple layers without a strong reason
- Header actions are page-level only
- Panel actions are panel-level only
- Row actions are object-level only
- If a button already exists in the right place, remove the duplicate instead of styling both
- Every screen should have one obvious primary action and a small number of clear secondary actions

## Visual Rules

- Use the shared page shell, header, panel, and stat-strip primitives
- Avoid introducing one-off page header layouts
- Avoid card-in-card stacks unless there is a strong interaction reason
- Prefer toolbars and list rows over large decorative containers
- Dark mode should be charcoal/graphite, not flat black
- Light mode should be warm/cream, not stark white
- Brand violet should be used deliberately, not as a blanket decoration

## Product Rules

- Left rail is object-based, not feature-dump based
- `Workbench` is the live operating surface
- `Runs` is the canonical execution history
- `Artifacts` is the canonical output history
- `Agents` shows ownership, not transport-layer internals
- `Integrations` manages channels and routing, not agent identity
