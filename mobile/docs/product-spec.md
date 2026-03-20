# Empyralis Mobile V1 Product Spec

## Product Intent
This is a private personal operating system with domain hubs. It is not a “ChatGPT with tools.”

Core loop:
`Intent → AI execution → visible result → stored memory/state`

The product must feel like:
`private AGI OS → running on your home Mac → cloud models for reasoning → personal data stays local → clean mobile control surface`

## Information Architecture
Primary surfaces:
1. Dashboard (state)
2. Command Center (intent)
3. Workspace (output and evidence)

Secondary surfaces:
1. Hubs (domain spaces, not permanent tabs)

## Module Types (Strict)
Only four module types are allowed:
1. Hubs: persistent domain state
2. Tools: single actions
3. Agents: named workers with identity and role
4. Automations: triggered or scheduled routines

## Object Model (Strict)
Every AI interaction must result in at least one of these objects:
1. File
2. Run
3. Memory
4. Task
5. Insight
6. Automation
7. Log Entry

## Global Interaction Rules
Every AI action must show:
1. What it understood
2. What it plans to do
3. What it changed
4. Confidence
5. Source
6. Undo

If an action changes local state, it must pass through an Approval flow.

## Design Language (Strict)
Visual rules:
1. Background: soft light gray
2. Surfaces: white cards
3. Ink: near-black
4. Primary accent: single AGI purple
5. Domain accents: minimal, only for hub identity
6. Serif: only for page titles or hero numbers
7. Sans-serif: everything else
8. Large rounded cards
9. No random gradients
10. No colorful chaos

Component rules:
1. Command bar
2. Status card
3. Agent row
4. Hub card
5. Metric ring
6. Action chip
7. Timeline row
8. Audit badge

These components must be reused across all surfaces.

## Navigation Rules
1. Hubs are never permanent tabs.
2. Hubs are accessed from Dashboard, Search, or Command results.
3. Command bar is universal and accessible from all surfaces.
4. System state is always visible on Dashboard, not buried in a menu.

## Screen-by-Screen Spec

### 1) Dashboard (State)
Purpose: “What is happening in my life and what is the system doing right now?”

Sections:
1. Daily Brief (Status Card)
   - Title: “Daily Brief”
   - Content: top 3 priorities, schedule highlights, system alerts
   - Action: “Open Brief”
2. Active Agents (Agent Rows)
   - Name, role, current task, status badge
   - Action: tap → agent detail
3. Important Signals (Timeline Rows)
   - Signals across hubs, ordered by severity/time
4. Hub Summaries (Hub Cards)
   - Nutrition, Market Pulse, Health, Study
   - Each shows a single key metric and trend
5. What Changed Today (Timeline Rows)
   - Top 5 changes made by the system
6. Needs Approval (Audit Badges)
   - Pending approvals with clear consequences

Primary actions:
1. Open Command Center (persistent)
2. Open Hub (from Hub Card)
3. Review Approvals

### 2) Command Center (Intent)
Purpose: “What do I want done?”

Core layout:
1. Universal Command Bar (persistent)
   - Text input
   - Voice
   - Image
   - File upload
2. Intent Feed (Timeline Rows)
   - User requests and system responses
3. Action Result Card (Strict Output Format)
   - Understood
   - Plan
   - Changed
   - Confidence
   - Source
   - Undo
4. Tool Suggestions (Action Chips)
   - System-recommended next actions

Primary actions:
1. Send intent
2. Approve action
3. Open relevant Hub
4. View Run details

### 3) Workspace (Output and Evidence)
Purpose: “What did the AI create, change, learn, or save?”

Core layout:
1. Object Filters (Action Chips)
   - File, Run, Memory, Task, Insight, Automation, Log Entry
2. Object Grid or List
   - Title, type badge, timestamp, preview
3. Object Detail
   - Full payload, related run, related hub, audit trail

Primary actions:
1. Search
2. Open object
3. Pin
4. Export / share

### 4) Hub Shell (All Hubs)
Every hub must follow this structure:
1. Status header
   - Today’s state or score
2. Quick actions
   - 2–4 highest-value actions
3. Feed / timeline
   - Recent entries and changes
4. AI insight card
   - System suggestions and fixes
5. Source / confidence / history
   - Trust layer

#### Nutrition Hub
1. Status: calories + macro balance
2. Quick actions: photo log, quick add, ask coach
3. Feed: meals logged
4. Insight: deficit/surplus detection
5. Source: photo model + user edits

#### Market Pulse Hub
1. Status: portfolio delta + risk metric
2. Quick actions: sync accounts, ask analysis, set alert
3. Feed: market changes and watchlist events
4. Insight: risk shift or opportunity detected
5. Source: market data + timestamp

#### Health Hub
1. Status: sleep + activity index
2. Quick actions: log symptom, add measurement, ask coach
3. Feed: measurements and events
4. Insight: trend detection
5. Source: device + user input

#### Study Hub
1. Status: current goal + progress ring
2. Quick actions: start session, review, add note
3. Feed: study sessions + notes
4. Insight: next best review
5. Source: learning plan + history

## Approval Flow (High Trust Rule)
Any write action must show:
1. Proposed change
2. Affected hubs/objects
3. Confidence and source
4. Approve / Reject buttons

When approved, the system must:
1. Execute
2. Log to Workspace
3. Update relevant Hub
4. Emit Undo

## Example User Flows

### Flow A: Meal Photo
1. User opens Command Center and uploads meal photo.
2. System returns Action Result Card.
3. User approves nutrition log.
4. Nutrition Hub updates status and feed.
5. Workspace logs File, Run, Insight, Log Entry.

### Flow B: Market Update
1. User types “What changed in my portfolio today?”
2. System fetches data and summarizes.
3. Action Result Card shows insights + sources.
4. User opens Market Pulse Hub from card.

### Flow C: Automated Daily Brief
1. Automation runs in background.
2. Dashboard Daily Brief updates.
3. Workspace logs Automation + Run + Insight.

## V1 Scope (Strict)
Include:
1. Mobile app shell
2. Home-server connection
3. Auth and encryption
4. Dashboard, Command Center, Workspace
5. Hubs: Nutrition, Market Pulse, Health, Study
6. Universal input: text, voice, image, file
7. Audit log
8. Approval system for write actions
9. Daily brief
10. Basic automations

Exclude:
1. Marketplace
2. Social features
3. Dozens of hubs
4. Autonomous financial transactions
5. Plugin ecosystem sprawl

## Next Implementation Step
Translate this spec into screen designs and component-level UI definitions per surface.
