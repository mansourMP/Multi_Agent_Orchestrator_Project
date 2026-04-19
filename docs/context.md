# Context

Last verified: 2026-04-11
Latest verified green commit: `b3eca81`

## Product Identity

Empyralis is an AI operating system for authorized digital work.

It is one platform with shared auth, billing, and channel infrastructure across mobile, desktop, web, local, cloud, and hybrid operation.

Sage is an independent personal AI. Studio agents are independent deployable workers. They do not share memory, context, or execution. The only shared layer is auth, billing, and channel infrastructure.

The platform is not a pile of separate bots, not a workflow toy, and not a mobile app plus a different desktop brain.

Identity boundary:
- the Empyralis account is the only product identity
- direct OpenAI, Anthropic, Gemini, Vertex, and similar credentials are workspace provider connections
- Codex CLI, Claude CLI, Gemini CLI, Ollama, and similar local sessions are machine-local capabilities
- provider connections and machine-local capabilities extend execution capability only; they do not replace platform identity

## Surface Shell Model

Shell classes are explicit:
- `full_shell`
  - mobile
  - web
  - desktop
- `channel_shell`
  - Telegram
  - WhatsApp
  - Slack
  - Discord
  - email
  - phone
  - web chat

Shell truth:
- every shell shares the same auth and billing identity
- every shell shares the same infrastructure guardrails
- channel shells are lightweight conversation surfaces, not separate product brains
- channel shells may expose conversation, summaries, notifications, and lightweight approvals where supported
- channel shells must not become deep admin surfaces
- channel shells must not become separate policy engines

## The 4-Layer OS Model

### 1. Sage / Personal AI

Sage is the user's main agent and the only primary intelligence the user should feel.

Sage owns:
- the main relationship with the user
- personal memory facade
- the user's own provider selection and tools
- direct chat and personal work sessions

Sage does not get to bypass runtime, tool, secret, or policy brokers.

Sage isolation contract:
- Sage is standalone and independent
- Sage does not control Studio agents
- Sage does not inherit Studio memory or execution state
- Sage does not support external customer-live mode switching

### 2. Studio Workers

Studio agents are real deployable workers, not wrappers.

Each Studio agent has:
- install-scoped short-term and long-term memory
- an explicit operating mode:
  - `owner_edit`
  - `owner_test`
  - `customer_live`
- its own tool scope
- its own connector scope
- its own artifact history
- its own runtime policy
- its own activity stream
- its own model selection

Studio agents are powerful, but scoped. They do not inherit Sage memory, and they do not automatically inherit each other's memory.

Mode truth:
- `owner_edit` is the authoring mode and allows prompt/config edits
- `owner_test` is the owner preview mode and does not allow prompt/config edits
- `customer_live` is the external-audience mode and does not allow prompt/config edits

### Separation Contract

Sage is an independent personal AI. Studio agents are independent deployable workers. They do not share memory, context, or execution. The only shared layer is auth, billing, and channel infrastructure.

### 3. Applications

Applications are product modules, not the personal brain.

Applications may:
- run workflows
- call models
- perform structured backend actions
- call specialists or Sage through explicit bridge contracts

Applications may not, by default:
- read Sage memory
- read specialist memory
- read private user context without an explicit contract

### 4. Platform Control Plane

The control plane governs all three layers above.

It owns:
- tenant and workspace identity
- runtime profiles and runtime attachments
- entitlements and quotas
- memory routing rules
- tool and secret brokering
- activity ledgering
- approvals
- security controls
- hybrid sync and placement policy

## Hybrid Cluster Model

Sage and Studio runtimes must preserve their own isolated identities across all deployment modes:
- cloud-only
- local-only
- hybrid

### Local Companion / Mac Mini Cluster

The local cluster is not one vague process. It is:
- a local Sage runtime
- separate local specialist runtimes
- a local runtime supervisor
- local memory stores
- a local artifact bridge

Lifecycle is explicit:
- register
- start
- health
- heartbeat
- stop
- revoke
- recover

### Cloud / Hybrid Behavior

Hybrid placement is governed by explicit sync and placement policy classes:
- `local_only`
- `sync_allowed`
- `summary_bridge_only`
- `explicit_opt_in`

Placement priority is:
1. privacy and sync class
2. required capabilities and connectors
3. data dependency
4. availability and always-on need
5. user or workspace preference

The system must fail closed if a placement or sync rule cannot be satisfied.

## Strict Sandbox And Memory Boundaries

Allowed state layers are frozen as:
- Sage private memory
- Studio-agent private memory
- artifacts/history

### Memory Boundaries

Sage can read:
- its own private memory
- user-selected inputs and artifacts
- its own approved connector history

Sage does not automatically read:
- Studio-agent memory
- Studio-agent execution state
- local-private memory that policy marks as local-only

Studio agents can read:
- their own scoped memory
- explicitly shared inputs and artifacts

Studio agents cannot read by default:
- Sage private memory
- other specialists' scoped memory
- local-private memory outside their own allowed runtime boundary

Artifact/history boundary:
- cross-install exchange happens through explicit artifacts/history only
- raw private-memory embeds are not an allowed artifact exchange path
- shared-board publication is explicit and does not auto-import private memory

Sandbox and broker truth:
- sandbox runtime scope carries the same state-layer policy the broker sees
- cross-install private memory is denied by default
- specialist-to-Sage private memory access is denied by default
- app-private context not explicitly shared

Applications can read:
- user-selected inputs
- app-owned history
- scoped documents and payloads
- explicit imports granted through app bridge contracts

Applications cannot read by default:
- Sage memory
- specialist memory

### Runtime And Broker Boundaries

All execution remains brokered through policy-bound boundaries:
- tool access goes through `tool_broker`
- secrets go through `secrets_broker` and vault paths
- runtime placement goes through runtime attachment and hybrid policy services
- connector and egress actions are auditable

Connector classes are explicit:
- `api_connector`
- `browser_connector`
- `media_generation_connector`

Connector class rules:
- API-rich systems default to `api_connector`
- browser-based control is a fallback path, not the default path, for API-rich systems
- media/image/video generation runs through `media_generation_connector`
- deep connector actions must execute through either:
  - an authenticated owner/admin route
  - a brokered runtime path with tool-broker and secrets-broker enforcement

Channel shells stay separate from deep application connectors:
- Telegram, WhatsApp, Slack, Discord, email, phone, and web chat are shell surfaces
- channel shells are not connector-management or provider-management surfaces
- channel shells do not become separate policy engines

Artifact/export posture for connector classes:
- media-generation outputs default to the managed export bridge
- channel shells are not raw file-export surfaces

No UI surface is allowed to bypass these boundaries.

## Auth And Public Ingress Boundary

Protected backend routes default to backend auth.

Current auth truth:
- `ORION_AUTH_REQUIRED=1` is the normal protected mode
- missing or invalid protected-route auth fails closed
- `ORION_AUTH_REQUIRED=0` is explicit local-dev mode only
- `ENV=production` rejects auth-disabled mode
- local-dev defaults are:
  - `user_id=local-dev`
  - `email=local-dev@empyralis.local`
  - `role=member`
  - `workspace_ids=["default"]`
- explicit local-dev scope knobs are:
  - `ORION_LOCAL_DEV_AUTH_ROLE`
  - `ORION_LOCAL_DEV_WORKSPACE_IDS`
  - `ORION_LOCAL_DEV_USER_ID`
  - `ORION_LOCAL_DEV_EMAIL`
- local-dev owner/admin power requires explicit owner role configuration

Intentional public ingress is limited to verified provider webhooks:
- `/channels/slack/events`
  - Slack signing-secret verification runs before payload parse or activity append
- `/channels/github/webhook`
  - configured GitHub `webhook_secret` plus valid `X-Hub-Signature-256` runs before payload parse or activity append
- `/connectors/discord/webhook`
  - Discord signature, timestamp, and configured public key verification run before parse, dispatch, or run creation
- `/channels/whatsapp/twilio/webhook`
  - configured `ORION_WHATSAPP_AUTOPILOT_WEBHOOK_SECRET` via query or header is required before Twilio form parse or inbound handling

Operational status and admin surfaces remain protected:
- `/channels/telegram/autopilot/status`
- `/channels/whatsapp/autopilot/status`
- `/channels/autopilot/profiles`

## Surface Truth

Mobile is the daily-use default.
Desktop is the power-user and control-depth surface.

They are still the same platform.

Allowed differences:
- navigation
- information density
- control depth
- debug and admin ergonomics

Forbidden differences:
- weaker mobile execution semantics
- different memory rules by surface
- different app-agent contracts by surface
- different runtime power by surface

Mobile tabs are fixed:
- Home
- Chat
- Applications
- Notifications
- Profile

## Proven Runtime Truth Through Phase 53

Verified backend slices now proven in this workspace:
- auth-disabled mode is explicit local-dev only; production rejects auth-disabled mode
- public webhook ingress fails closed and verifies before parse, dispatch, or run creation
- the canonical backend golden path is proven: `/turn -> parent run -> delegated specialist -> artifact -> activity -> approval -> /runs`
- canonical install-backed parent and delegated child runs carry enforced placement metadata
- rendered web auth/session works through the current shell
- rendered web cloud-backed assistant answer works through the current shell
- live install-backed local completion is proven in the hybrid workspace
- local completion can emit an allowed persisted summary-bridge record for hybrid continuity
- hybrid summary-bridge publish and ingest are validated for allowed summary payloads only
- `/runs`, `/activity/timeline`, `/approvals`, and notifications expose aligned backend truth
- `app_to_sage` and `app_to_specialist` typed bridge requests can execute through canonical install-backed turns

These proofs do not yet mean:
- the current rendered first-send path is the canonical durable run path
- rendered local or hybrid UI proof exists
- live hosted Sage degraded summary consumption is proven
- full cloud-only, local-only, and hybrid rendered demo coverage exists
- fully distributed remote summary replication is complete

## Demo Reality Through Phase 53

Exact demo state right now:
- cloud rendered: partial
  - web auth/session works
  - rendered cloud-backed assistant answer works
  - serious first-send task requests now enter the durable run/artifact path
  - lightweight direct chat still exists for question-and-answer turns
- local rendered: no
  - only the contract-equivalent local proof is complete
- hybrid rendered: no
  - placement and summary policy are real, but rendered proof is not complete
- degraded safe mode: partial
  - safe fallback policy is proven
- live hosted Sage degraded consumption is not yet proven

## Implemented Core Through Phase 44

Verified backend and architecture work already landed:
- entitlements and quota service
- open-core boundary definition
- mobile-first / desktop-power product surface contract
- Sage / Studio-agent / application boundary
- application runtime and app-agent separation contract
- durable activity ledger
- local runtime cluster control APIs
- hybrid sync and placement policy enforcement
- app-agent bridge enforcement
- fail-closed auth and public webhook hardening
- canonical backend golden-path smoke proof
- contract-aligned run, activity, approval, and notification visibility
- canonical `app_to_sage` and `app_to_specialist` bridge execution
- specialist service architecture
- first parity-oriented mobile and desktop surface implementation

## Immediate Reality For The Next Session

The architecture backbone is done.
The platform is ready for execution-focused work, not more sprawling architecture notes.

The next session should assume:
- `docs/` is the only canonical handoff
- archived documents are history, not source of truth
- runtime, policy, and memory boundaries above are non-negotiable
