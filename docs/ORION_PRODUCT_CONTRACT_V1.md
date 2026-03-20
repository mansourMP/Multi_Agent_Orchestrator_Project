# Empyralis Product Contract V1 (Outcome Worker)

## Product Position (non-negotiable for V1)

Empyralis is an **Outcome Worker** for small businesses.
Users ask for a business result. Empyralis executes safely and reports clearly.

Empyralis is **not**:
- a role-play org chart
- a CEO/department simulator
- a developer-first terminal clone

## V1 Interface Rules

1. Default UX = one worker flow
- Input goal
- Choose outcome pack
- Start run
- Review result
- Approve only when required

2. Advanced UX is optional
- Workflow builder and technical pages are secondary.
- They must not be required for first value.

3. Language rules
- Use: `result`, `action`, `next step`, `account`, `run`.
- Avoid in default mode: `CEO`, `department`, `worker hierarchy`, `agent theater`.

4. Safety model
- Trust modes remain: `auto`, `guarded`, `strict` (or equivalent).
- Risky actions require explicit approval unless user chose auto.

5. Output contract for packs
- Every pack must return:
  - `result_schema_version`
  - `summary`
  - `inputs`
  - `outputs`
  - `next_steps`
  - `execution_summary`:
    - `trust_mode_applied`
    - `approval_required`
    - `risk_level`
    - `next_action`
    - `estimated_time_saved_minutes`
  - optional connector diagnostics

## V1 Outcome Packs (scope locked)

1. Customer Ops Autopilot
- Inbox triage
- Lead follow-up
- Booking coordination

2. Weekly Content Studio
- Weekly content plan
- Channel formatting
- CTA suggestions

3. Competitor Brief Digest
- Competitor scan
- Threat scoring
- Response plays

## PMF Success Metrics

1. Time-to-first-value < 15 minutes
2. Task completion rate > 70%
3. Week-2 retention > 35%

## Build Discipline

Before adding new features:
1. Improve reliability
2. Improve clarity
3. Improve completion rate

Only then add breadth.
