# Frontend Map

Last verified: 2026-04-11

## Frontend Truth

The frontend is not allowed to become another brain.

UI responsibilities are:
- render backend state
- collect user intent
- drive surface-specific ergonomics
- present motion, hierarchy, and feedback

UI responsibilities are not:
- deciding policy
- deciding memory access
- deciding runtime placement
- inventing app-agent contracts
- inventing capability differences by surface

This is a strict dumb-UI strategy.

## Surface Structure

### Web / Desktop-Power

Current code roots:
- `frontend/app`
- `frontend/components`
- `frontend/lib`

Desktop-power owns:
- specialist creation and configuration
- connector and runtime management
- hybrid placement visibility
- deeper activity timeline
- memory and privacy controls
- admin and debug depth

### Mobile Daily-Use Surface

Current code roots:
- `mobile/app`
- `mobile/src/lib`

Mobile stays the daily-use surface with the fixed tab contract:
- Home
- Chat
- Applications
- Notifications
- Profile

Mobile must still hit the same backend contracts as desktop-power.

### Channel Shells

Messaging shells are frozen as `channel_shell` surfaces:
- Telegram
- WhatsApp

They may do:
- conversation
- summaries
- notifications
- lightweight approvals where supported

They may not become:
- deep admin surfaces
- separate product brains
- separate policy engines

They still share the same captain identity and run engine truth as full shells.

## Upcoming UI Purge

The current frontend still carries too many legacy and exploratory surfaces.

The next frontend phase should be a deliberate rebuild that removes route sprawl and keeps only the product surfaces justified by the current platform truth.

Targets for purge or aggressive consolidation include:
- builder-heavy legacy flows
- exploratory or demo-oriented routes
- duplicated setup surfaces
- disconnected solution/store metaphors that do not match the captain-specialist-app model
- any page that smuggles product logic into the client

The rebuild should start from the canonical platform contracts, not from preserving every existing route.

## Dumb UI Strategy

Every surface must follow these rules:

### 1. Shared Contracts

Mobile and desktop-power must use the same backend semantics for:
- Sage context
- specialist inventory
- runtime attachments
- activity
- approvals
- app-agent contracts

### 2. Thin Client State

Client state is allowed for:
- loading
- optimistic interaction
- local presentation state
- animation state

Client state is not allowed to become durable truth for:
- capability policy
- hybrid placement policy
- memory routing
- secret access
- entitlement enforcement

### 3. No Surface Downgrade

If a specialist can do something through the authorized runtime and policy path, mobile must not be artificially weaker than desktop.

Desktop may expose more control depth. It may not expose a stronger intelligence model.

## Design System Rule

The frontend rebuild must use:
- Radix primitives for interaction, accessibility, layering, focus, and composition
- Framer Motion for motion orchestration and transitions

The direction is:
- custom visual system on top of Radix primitives
- not random component sprawl
- not ad hoc mixed interaction libraries

## Motion Rule

Motion must feel deliberate and premium.

Use spring-based motion with Apple-level feel:
- responsive spring entry and exit
- no cheap easing spam
- no generic CSS transitions everywhere
- no motion that hides state truth

Recommended baseline:
- Framer Motion spring transitions
- stiffness roughly in the `300-420` range
- damping roughly in the `28-38` range
- mass roughly in the `0.8-1.0` range

Exact numbers can vary by interaction, but the product should feel physically coherent.

## Current Code Reality

Current web surface already has parity-oriented wiring in:
- `frontend/lib/api.ts`
- `frontend/lib/productArchitecture.ts`
- `frontend/app/(shell)/page.tsx`
- `frontend/app/api/activity/timeline/route.ts`

Current mobile surface already has parity-oriented wiring in:
- `mobile/src/lib/mobile-data.ts`
- `mobile/app/status.tsx`
- `mobile/src/screens/HomeScreen.tsx`
- `mobile/app/(tabs)/_layout.tsx`

Backend and BFF contract alignment is proven for:
- `/runs`
- `/activity/timeline`
- `/approvals`
- notifications

Current rendered truth:
- web auth/session is proven through the real browser path
- the current web shell can render a real cloud-backed assistant answer
- the current web shell now routes serious first-send task requests into the durable run path
- lightweight question-and-answer chat is still allowed to stay on the direct chat path
- rendered local and hybrid proof is still not complete

This is not the final UI. It is the contract-aligned implementation layer that the rebuild must respect.

## Frozen Rebuild Boundary

The new UI must consume these backend and BFF contracts as fixed truth:
- `/api/control-plane/session`
- `/api/control-plane/auth/me`
- `/api/control-plane/providers/runtime-availability`
- `/api/chat/master-context`
- `/api/turn`
- `/api/runs`
- `/api/activity/timeline`
- `/api/approvals`
- `/api/approvals/resolve`

The rebuild is allowed to change:
- shell layout and route structure
- interaction patterns and motion system
- component inventory
- visual language, typography, spacing, and hierarchy
- how existing backend truth is grouped and presented

The rebuild is not allowed to change:
- auth and workspace semantics
- `/turn` versus `/runs` semantics
- memory, approval, notification, and placement truth
- app-agent contract meaning
- any runtime or policy decision in the client

## Rebuild Rule For The Next Session

When rebuilding UI:
- start from `docs/context.md`
- keep the platform dumb-UI
- keep mobile and desktop on the same contracts
- make desktop deeper, not smarter
- make mobile smaller, not weaker
- do not ship the new shell until the durable run path is proven across the primary rendered surfaces
