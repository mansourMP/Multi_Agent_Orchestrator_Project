# Empyralis Mobile V1 Plan

## Purpose
This file is the single source of truth for the Empyralis phone app.

Empyralis Mobile is **not** a copy of the desktop platform.
It is the **personal agent application** that ordinary people use every day.

The engine, orchestration, local execution, integrations, and heavy operator flows stay in the desktop/web platform.
The phone app is the small, direct surface for:
- talking to your agents
- checking what they are doing
- getting results
- approving actions
- handling personal daily use cases

## Product Position
Empyralis should feel like one system across desktop and phone, but each surface has a different job.

- Desktop / web platform: engine, runs, artifacts, automations, integrations, local execution, heavy inspection
- Mobile app: personal conversation, lightweight control, approvals, progress, results

The phone app is for normal people first.
It must feel closer to ChatGPT, Messages, or a daily assistant app than a developer console.

## Core Product Thesis
The phone app should become the daily surface for:
- study help
- reminders
- meal / calorie tracking
- life planning
- personal follow-up
- quick business questions
- approvals when away from desktop
- checking what agents are doing in the background

The phone app should **not** try to become the full control plane.
It should feel simple, direct, and calm.

## Mobile V1 Scope
### Must have
1. Session / pairing
2. Home chat
3. Agent directory + direct agent chat
4. Runs feed
5. Approvals inbox
6. Basic result/artifact preview
7. You / profile

### Nice to have in V1.1
1. Voice notes
2. Photo upload
3. Saved quick actions
4. Personal routines
5. Notifications and deep links
6. Study mode
7. Meal tracking shortcuts

### Explicitly out of scope for V1
1. Full automation builder
2. Full local execution builder
3. Integrations admin console
4. Desktop-equivalent system health tooling
5. Workflow graph editor
6. Full artifact management console
7. Full computer control from the phone itself
8. Full enterprise admin from the phone

## Target Users
### Primary
1. General users who want one assistant app
2. People using agents for studies, reminders, planning, and daily work
3. Operators/founders who want approvals and quick updates on the go

### Secondary
1. Teams monitoring work remotely
2. Power users checking runs and outputs away from desktop

### Not the initial target
1. Developer-heavy workflow editing on mobile
2. Infra/runtime debugging on mobile
3. Desktop-style admin workflows on mobile

## Mobile Product Model
Use a bottom-tab structure.

### Tab 1: Home
Purpose: the simplest place to ask for something and get help.

Contents:
- one main chat entry point
- recent conversations
- quick actions
- active work summary
- urgent approvals
- recent results

Primary action:
- send a message

Examples:
- help me study this topic
- track my meal
- remind me to do this later
- ask my research agent to summarize something

### Tab 2: Agents
Purpose: speak to a specific agent directly.

Contents:
- horizontal list of available agents
- direct chat thread per agent
- what the selected agent is doing now
- last run / last result
- small role summary

Primary action:
- message selected agent

Important:
This is not a fleet control page. It is a human-to-agent communication page.

### Tab 3: Runs
Purpose: check what is happening and what already happened.

Contents:
- active work first
- recent runs
- simple status filters
- run detail summary
- timeline

Primary action:
- open a run

Important:
Keep it readable. Do not lead with IDs and engine internals.

### Tab 4: Approvals
Purpose: approve or hold important actions quickly.

Contents:
- pending approvals first
- fast approve / hold
- short context about what is being approved
- link to the related run
- recent approval history

Primary action:
- approve or hold

### Tab 5: You
Purpose: personal profile and preferences.

Contents:
- account
- preferences
- notifications
- study profile / personal context later
- sign out

Primary action:
- manage your profile

## Agent Model on Mobile
Mobile should expose agents as direct helpers, not system roles first.

Show agents like:
- Private Assistant
- Research
- Builder
- Support
- Finance
- Custom specialist agents

Do not expose these as the primary mental model:
- Telegram bot
- WhatsApp bot
- connectors
- worker IDs
- runtime internals

Channels should appear only as attached capabilities or delivery paths when needed.

## Mobile UX Principles
1. One obvious action per screen
2. Chat-first behavior
3. No runtime/debug details in default views
4. Agents should feel like helpers, not infrastructure
5. Approvals must be fast and safe
6. Runs must be readable without technical noise
7. The app must feel calm, premium, and useful to ordinary people

## Visual Direction
Mobile should keep the Empyralis tone, but as a calmer personal app.

### Tone
- dark mode: charcoal / graphite, not pure black
- light mode: warm neutral / cream, not stark white
- restrained violet as the brand accent

### Brand colors
- primary: `#6D28D9`
- highlight: `#8B5CF6`
- warning: `#F59E0B`

### Mobile design rules
- large enough tap targets
- minimal chrome
- no duplicated buttons
- chat should feel natural and central
- primary action should always be obvious
- no desktop-style crowded control panels

## Recommended Tech Stack
Use **React Native with Expo**.

Reason:
- fastest path to iOS + Android
- fast iteration
- strong support for camera, uploads, notifications, deep links
- works well for a chat-first mobile product

### Recommended package direction
- Expo Router
- React Query / TanStack Query
- Expo SecureStore
- Expo Notifications
- light local UI state only if needed

## Architecture
### Product split
- Mobile app = personal control surface
- Runtime/platform = engine and orchestration layer
- Desktop/local companion = execution layer for computer-level work

### What mobile can do directly
- chat
- approve
- read runs
- read results/artifacts
- upload photos/files/voice notes later
- trigger tasks
- monitor agent progress

### What mobile should not pretend to do directly
- execute shell on the desktop by itself
- inspect arbitrary desktop files by itself
- run full computer automation by itself
- behave like the full platform admin console

## API / Backend Requirements
Mobile V1 should depend on existing APIs where possible.

### Needed capabilities
1. Session / pairing
2. Agent list + agent detail + agent thread
3. Run list + run detail
4. Approval list + approve/hold/reject
5. Artifact list + preview
6. Personal conversation endpoint or agent chat endpoint

### Backend gaps likely needed
1. mobile-safe agent thread endpoint
2. simplified home summary payload
3. compact run list payload
4. simplified artifact preview payloads
5. mobile-friendly auth / pairing flow

## Implementation Order
1. Make Home a real chat-first screen
2. Make Agents direct and personal, not operational
3. Keep Runs readable and lightweight
4. Keep Approvals fast and safe
5. Keep You minimal
6. Add artifact/result previews
7. Add voice/photo/quick actions later

## What Good Looks Like
The phone app is correct only if:
1. a normal person can use it without understanding the platform
2. chat is the main behavior
3. agents feel direct and useful
4. the engine stays on the platform side
5. mobile does not become a tiny copy of the desktop UI
