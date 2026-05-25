# Empyralis Platform — Complete Codebase Map

**Generated**: 2026-05-25
**Purpose**: External team hardening & VC due diligence
**Accuracy**: Read-only audit of current codebase state

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [System Topology](#2-system-topology)
3. [Python Backend (server_modules)](#3-python-backend-server_modules)
4. [TypeScript Gateway (empyralis-gateway)](#4-typescript-gateway-empyralis-gateway)
5. [React Frontend (frontend)](#5-react-frontend-frontend)
6. [Python Cognitive Engine (python_engine)](#6-python-cognitive-engine-python_engine)
7. [Shared TypeScript Contracts (shared)](#7-shared-typescript-contracts-shared)
8. [Agent Skills (skills)](#8-agent-skills-skills)
9. [Infrastructure & Deployment](#9-infrastructure--deployment)
10. [Security Architecture](#10-security-architecture)
11. [Data Flow Diagrams](#11-data-flow-diagrams)
12. [Complete File Index](#12-complete-file-index)

---

## 1. Architecture Overview

Empyralis is a **multi-agent orchestration platform**. It lets users build, deploy, and manage AI agents that operate across channels (Telegram, WhatsApp, web chat) with tool execution, memory, and safety controls.

### Technology Stack

| Layer | Technology |
|-------|-----------|
| **Backend API** | Python 3.11+, FastAPI 0.135.3, Uvicorn 0.42.0 |
| **Database** | PostgreSQL (asyncpg) — durable state; SQLite — local fallback; LanceDB — vector embeddings |
| **ORM** | SQLAlchemy 2.0+ |
| **Frontend** | Next.js 16 (App Router), React 19, TypeScript strict |
| **Desktop** | Tauri (Rust) via empyralis-supervisor |
| **Local Gateway** | Node.js 20+, TypeScript, WebSocket |
| **Channel Libraries** | Baileys (WhatsApp), Telegram MTProto, Discord.py |
| **AI/ML** | OpenAI, Anthropic, Gemini, Transformers, Torch, Sentence-Transformers |
| **Observability** | Sentry, OpenTelemetry |
| **Infrastructure** | Docker, GitHub Actions CI |

### Project Structure

```
Multi_Agent_Orchestrator_Project/
├── server.py                    # FastAPI composition root
├── server_modules/              # Python backend (~371 source files)
│   ├── routes_*.py              # 22 route modules
│   ├── *_service.py             # ~200+ service modules
│   ├── connectors/              # 85 connector-specific files
│   ├── tests/                   # 300+ test files
│   └── ...
├── empyralis-gateway/           # Node.js local gateway (~40 source files)
│   └── src/
│       ├── channels/            # WhatsApp & Telegram personal runtimes
│       ├── cloud/               # WebSocket client to cloud
│       ├── protocol/            # Wire protocol types & codec
│       ├── state/               # File-based persistence
│       ├── supervisor/          # HMAC-signed HTTP client
│       └── browser/             # Python browser automation worker
├── frontend/                    # Next.js 16 frontend (~213 source files)
│   ├── app/                     # App Router pages & layouts
│   └── lib/
│       ├── ui/                  # 17-file design system
│       ├── workspace/           # 59 files: kernel, chat, studio
│       └── auth/                # CSRF, session management
├── shared/                      # Shared TypeScript contracts (5 files)
│   ├── api-contract/            # 3 files: types, model tiers, API client
│   ├── design-system/tokens.ts  # Design tokens
│   └── nav-manifest.ts          # Route definitions
├── python_engine/               # Cognitive engine (13 source files)
│   ├── cognitive_loop.py        # OODA cycle
│   ├── cognitive_daemon.py      # Persistent event daemon (5563 lines)
│   ├── agency_logic.py          # Main orchestration
│   ├── agent_identity.py        # Cryptographic identity
│   ├── memory_manager.py        # Vector + SQLite memory
│   ├── llm_core.py              # Multi-provider LLM integration
│   └── operator_skills.py       # Local command execution
├── skills/                      # 8 agent skill definitions
├── scripts/                     # 128 build/deploy/utility scripts
├── requirements.txt             # Python server dependencies
├── requirements-worker.txt      # Python worker dependencies
├── Dockerfile.runtime           # Docker image
├── docker-compose.yml           # Docker Compose
└── .github/workflows/           # CI/CD pipelines
```

---

## 2. System Topology

### Process Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        User's Browser                           │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              Next.js Frontend (port 3000)                 │  │
│  │  ┌─────────────┐  ┌───────────────────────────────────┐  │  │
│  │  │ BFF Proxy   │  │  React SPA (workspace shell)       │  │  │
│  │  │ (api/[...]) │  │  - Chat pane (SSE streaming)       │  │  │
│  │  │             │  │  - Studio (agent management)       │  │  │
│  │  └──────┬──────┘  │  - Gateway operator                │  │  │
│  │         │         │  - Marketplace, Settings, etc.     │  │  │
│  │         │         └───────────────────────────────────┘  │  │
│  └─────────┼──────────────────────────────────────────────────┘  │
└────────────┼─────────────────────────────────────────────────────┘
             │ HTTP (cookie auth + CSRF)
             ▼
┌─────────────────────────────────────────────────────────────────┐
│              Empyralis Runtime API (port 8001)                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                    FastAPI Application                    │  │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────────┐  │  │
│  │  │ Auth     │ │ Gateway  │ │ Deployed │ │ Workspaces │  │  │
│  │  │ (JWT,    │ │ (ACP)    │ │ Agents   │ │ (CRUD,     │  │  │
│  │  │  OAuth,  │ │          │ │ (life-   │ │  members,  │  │  │
│  │  │  RBAC)   │ │          │ │  cycle)  │ │  routing)  │  │  │
│  │  └──────────┘ └──────────┘ └──────────┘ └────────────┘  │  │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────────┐  │  │
│  │  │ Runs     │ │ Channels │ │ Mini     │ │ Market-    │  │  │
│  │  │ (exec)   │ │ (Telegram│ │ Apps     │ │ place      │  │  │
│  │  │          │ │  WA,...) │ │          │ │            │  │  │
│  │  └──────────┘ └──────────┘ └──────────┘ └────────────┘  │  │
│  │  ┌──────────────────────────────────────────────────────┐│  │
│  │  │              Service Layer (~200 files)              ││  │
│  │  │  - Direct Chat Pipeline (35 files)                   ││  │
│  │  │  - Gateway Services (12 files)                       ││  │
│  │  │  - Policy & Safety Framework                         ││  │
│  │  │  - Model Router (OpenAI/Anthropic/Gemini)            ││  │
│  │  │  - Channel Connectors (85 files)                     ││  │
│  │  └──────────────────────────────────────────────────────┘│  │
│  │  ┌──────────────────────────────────────────────────────┐│  │
│  │  │              Data Layer                              ││  │
│  │  │  PostgreSQL (control_plane_repository.py - 11548 ln) ││  │
│  │  │  SQLite (local fallback)                             ││  │
│  │  │  LanceDB (vector embeddings)                         ││  │
│  │  └──────────────────────────────────────────────────────┘│  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────┬────────────────────────────────────────────────────┘
             │ WebSocket (gateway protocol v1alpha2)
             ▼
┌─────────────────────────────────────────────────────────────────┐
│              Empyralis Gateway (Node.js, port dynamic)          │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────────┐  │  │
│  │  │ WhatsApp     │ │ Telegram     │ │ Browser Worker   │  │  │
│  │  │ (Baileys)    │ │ (MTProto)    │ │ (Python subproc) │  │  │
│  │  └──────────────┘ └──────────────┘ └──────────────────┘  │  │
│  │  ┌──────────────────────────────────────────────────────┐│  │
│  │  │  State: JSON files, NDJSON journal, outbox queue    ││  │
│  │  │  Cloud: WS client, heartbeat, reconnect backoff     ││  │
│  │  │  Supervisor: HMAC-signed HTTP to local runtime      ││  │
│  │  └──────────────────────────────────────────────────────┘│  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### Data Flow Summary

```
User Message → Frontend (composer) → BFF Proxy → FastAPI → Turn Ingress
  → Direct Chat Pipeline (entry → policy → routing → prompt → provider → generation → response)
  → Stream back via SSE → Frontend (event projector → timeline reducer → React cells)

Channel Message → Telegram/WhatsApp → Gateway (WS) → Runtime API → Channel Ingress
  → Deployed Agent → Turn Execution → Response → Gateway → Channel Delivery

Tool Execution → Policy Eval → Tool Broker → Gateway/Supervisor → Local/Browser Execution
  → Result → Approval (if required) → Response
```

---

## 3. Python Backend (server_modules)

### 3.1 Composition Root: server.py

The `server.py` file (369 lines) is the **single FastAPI application factory**. It does not contain business logic — only wiring.

**Key Configuration:**
- `DEFAULT_MAX_REQUEST_BODY_BYTES` = 2MB
- `DEFAULT_MAX_WEBHOOK_BODY_BYTES` = 1MB
- `DEFAULT_MAX_AUDIO_BODY_BYTES` = 25MB

**Middleware (registered in order):**
1. `CORSMiddleware` — Allows configured `FRONTEND_ORIGINS` with credentials
2. `control_plane_guard` — Guard middleware for control plane access
3. `request_body_limit_guard` — Enforces per-path body size limits

**Exception Handlers:**
1. `FastAPIHTTPException` → `error_response_service.http_exception_response()`
2. `StarletteHTTPException` → `error_response_service.http_exception_response()`
3. `RequestValidationError` → `error_response_service.request_validation_error_response()`
4. `Exception` → `error_response_service.unhandled_exception_response()`

**Router Mounts (22 routers, some mounted at multiple prefixes):**

| Prefix | Router File | Purpose |
|--------|-----------|---------|
| root + `/api` | `routes_workflows.py` | Workflow CRUD, Sage AI |
| root + `/api` | `routes_agents.py` | Agent registry, workspace API |
| root + `/api` | `routes_runs.py` | Run execution, inbox, runtime mgmt |
| root + `/api` + `/api/v1` | `routes_auth.py` | Auth, OAuth, sessions, devices |
| root + `/api` | `routes_health.py` | Health, memory, skills, doctor |
| root + `/api` | `routes_connectors.py` | Provider profiles, webhooks, connectors |
| `/api/v1` | `routes_builder.py` | AI workflow generation |
| `/api` | `routes_gateway.py` | ACP gateway (tools, browser, approvals) |
| `/api` | `routes_personal_channels.py` | Personal channel management |
| `/api` | `routes_workspaces.py` | Full workspace CRUD |
| `/api` | `routes_mini_apps.py` | Mini app system |
| `/api` | `routes_billing.py` | Stripe billing, credits |
| `/api` | `routes_deployed_agents.py` | Deployed agents lifecycle |
| `/api` | `routes_agent_traces.py` | Trace querying + SSE |
| `/api` | `routes_platform_analytics.py` | Admin analytics |
| `/api` | `routes_marketplace.py` | Marketplace |
| `/api` | `routes_pilot.py` | Pilot program |
| `/api` | `routes_studio.py` | Channel management, external agents |

### 3.2 Route Modules (Detailed)

#### routes_auth.py (5720 lines)
**Purpose**: Full authentication & authorization subsystem.

**Key endpoints:**
- `POST /auth/login` — Email/password login with device tracking, rate-limited
- `POST /auth/provider-login` — OAuth provider login (Google, Apple)
- `POST /auth/register`, `POST /auth/signup` — User registration with pilot invite support
- `GET /auth/providers` — List available auth providers
- `GET /auth/me` — Current user profile
- `GET /auth/account-shell` — Full account with workspace memberships
- `GET /auth/status` — Auth status check
- `POST /auth/refresh` — Session token refresh with CSRF protection
- `POST /auth/logout` — Session revocation
- `GET /auth/devices`, `DELETE /auth/devices/{id}` — Device management
- `POST /auth/channel-pairing/intents`, `GET /auth/channel-pairing/links`, `POST .../{link_id}/revoke` — Channel pairing
- `GET /auth/enterprise/status` — Enterprise status
- `PATCH /auth/me` — Profile update
- `GET/PATCH /auth/admin/enterprise-config` — SSO, MFA, SCIM
- `POST /auth/admin/provision/users` — Admin user provisioning

**Key internal functions:**
- `_allocate_auth_session_capacity()` — Session capacity management
- `_issue_token_pair()` — JWT token pair issuance
- `_verify_external_identity()` — OAuth identity verification
- `_enforce_window_limit()` — Rate limit enforcement
- `_upsert_user()` — User creation/update
- `validate_csrf()` — CSRF validation
- `get_current_user()` — FastAPI dependency for auth
- `enforce_workspace_access()` — RBAC gate
- `workspace_role()` — Returns "viewer"|"member"|"owner"
- `allowed_workspace_ids()` — Returns scoped workspace IDs
- `workspace_tenant_id()` — Returns tenant ID for workspace

#### routes_gateway.py (~1863 lines)
**Purpose**: Agent-Computer Protocol (ACP) gateway API.

**Key endpoints:**
- `GET/POST /agent-computers/{id}/policy` — Gateway policy management
- `POST /agent-computers/{id}/policy/validate` — Policy validation
- `PUT /agent-computers/{id}/policy` — Policy update
- `POST /agent-computers/{id}/emergency-stop` / `clear-emergency-stop` — Kill switch
- `POST /gateway/pairings/intents` — Create pairing intent
- `POST /gateway/registrations` — Register gateway
- `POST /gateway/sessions` — Create gateway session
- `GET /gateway/registrations` — List registrations
- `POST .../{gateway_id}/rotate-token` — Token rotation
- `POST .../{gateway_id}/revoke` — Token revocation
- `POST .../dedicated-workstation/bind|readiness|kill|clear-kill` — Workstation management
- `POST .../tools/execute` — Execute via gateway
- `GET .../approvals`, `POST .../approvals/{id}/resolve` — Approval flow
- `GET/POST .../browser/sessions`, `POST .../browser/sessions/{id}/actions` — Browser automation
- `POST .../takeover|resume|interrupt` — Session control
- `GET /gateway/registrations/{id}/doctor` — Health check
- `WS /gateway/ws` — WebSocket endpoint

**Key internal functions:**
- `_enforce_gateway_safety_gates()` — Safety check before execution
- `_gateway_policy_from_registration()` — Policy resolution
- `_consume_gateway_approval_memory()` — Approval TTL tracking
- `_emit_gateway_risk_decision()` — Risk event emission
- `_accessible_gateway_registration()` — Access control
- `_accessible_agent_computer()` — Computer access control

#### routes_runs.py
Delegates to three sub-modules:
1. **`runtime_runs_api.py`** (1168 lines): Core run execution routes. `execute_canonical_agent_turn = turn_ingress_service.start_turn`
2. **`runtime_events_api.py`** (573 lines): Inbox/notification routes
3. **`runtime_runtime_api.py`** (1585 lines): Runtime management, worker registration, heartbeats, STT/TTS, self-hosted nodes

Additional routes: `/cognitive/approvals`, `/approvals/audit`, `/schedules` (CRUD), `/schedules/{id}/logs`, `/schedules/{id}/run-now`, `/metrics`, `/kpis`, `/runs/queue/local`, `/runs/queue/local/cleanup`

#### routes_connectors.py
**Key imports**: `provider_catalog_service`, `request_window_quota_adapter`, `channel_lane_contract_service`, `connectors_core`, `connectors_actions`

**Endpoints**: Provider profiles CRUD, tools contracts, policy evaluation, provider catalog, credential vault, connector vault, webhooks (WhatsApp Twilio, Telegram, Slack, GitHub, Discord), autopilot status, connector OAuth, credential key rotation

#### routes_workspaces.py (589 lines)
**Key imports**: `control_plane_repository`, `session_service`, `workspace_admin_service`, `transparency_settings_service`, `workspace_channel_operations_service`, `workspace_bootstrap_service`

**Endpoints**: Full workspace CRUD, bootstrap, channel operations, runtime sessions, routing, transparency settings, members, invites, policies, sage tool policy, provider credentials, provider model refresh

#### routes_deployed_agents.py
**Key imports**: `deployed_agent_service`, `deployed_agent_business_insights_service`, `deployed_agent_test_turn_service`, `conversation_memory_policy`, `deployed_agent_admin_dashboard_service`

**Endpoints**: Full deployed agent lifecycle (create, list, get, update, deploy, pause, kill, recover, archive), analytics, admin dashboard, knowledge verification/upload, business insights (approve/dismiss/archive/apply), conversations, audit export, external user deletion, shop evaluation, test turn

#### routes_studio.py (462 lines)
**Key imports**: `channel_platform_service`, `connected_external_agent_service`, `deployed_agent_service`, `runtime_attachment_service`

**Endpoints**: `/studio/agent-surfaces`, `/studio/channel-catalog`, `/studio/channel-accounts`, `/studio/agents/{id}/channel-bindings`, `/studio/external-agents`

#### routes_mini_apps.py (~1506 lines)
**Key imports**: `mini_apps_service`, `mini_app_invoke_service`, `mini_app_host_service`

**Endpoints**: Mini app CRUD, share links, hosted bridge, AI invoke with credit tracking

#### routes_workflows.py
Delegates to: `workflow_api`, `sage_chat_api`, `sage_memory_api`, `sage_profile_api`, `sage_skills_api`, `sage_services_api`, `sage_context_files_api`, `sage_heartbeat_api`, `app_registry_api`

#### routes_agents.py
Delegates to: `agent_registry_api`, `agent_workspace_api`

#### routes_health.py
Health checks, skills registry, memory, doctor diagnostics, probe, setup sessions

#### routes_builder.py
- `GET /api/v1/builder/manifests/connectors`
- `POST /api/v1/builder/generate` — Natural language to workflow

#### routes_billing.py
Stripe billing integration, credit ledger, checkout sessions

#### routes_marketplace.py
Marketplace agents, packages, upgrade tracking

#### routes_pilot.py
Pilot program invites, proof, operations, investor memo

#### routes_personal_channels.py
WhatsApp/Telegram channel management via paired gateways

#### routes_platform_analytics.py
Admin platform analytics

#### routes_agent_traces.py
Agent tracing with SSE streaming

### 3.3 Service Layer (Key Modules)

#### Authentication: auth.py (5720 lines)
**Key classes/constants**: `AUTH_DB_FILE`, `JWT_EXP_SECONDS`, `RBAC_ROLE_ORDER`, `AUTH_SESSION_STATUSES`, `DEVICE_LINK_STATUSES`

**Rate limiters**: Login, CSRF, refresh, API — all using sliding window buckets

**Key exported functions:**
- `get_current_user(request)` — FastAPI dependency, resolves JWT/cookie/bearer/api-key
- `enforce_workspace_access(current_user, workspace_id, minimum_role)` — RBAC gate
- `workspace_role(current_user, workspace_id)` → "viewer"|"member"|"owner"
- `allowed_workspace_ids(current_user)` → set[str] | None
- `workspace_tenant_id(current_user, workspace_id)` → str
- `validate_csrf(request)` — CSRF cookie+header comparison
- `create_auth_session()`, `get_auth_session()`, `revoke_auth_session()`, `touch_auth_session()`
- `issue_auth_session_refresh_token()`, `get_auth_session_recovery()`
- `verify_external_identity_token(token, provider)` — OAuth identity verification
- `set_auth_cookies()`, `clear_auth_cookies()`
- `normalize_rbac_role()`, `enforce_minimum_role()`
- `require_api_key()`, `require_admin_api_key()` — FastAPI dependencies
- `get_authenticated_user_record()`
- `grant_workspace_owner_machine_trust()`, `revoke_workspace_owner_machine_trust()`

#### Control Plane Repository: control_plane_repository.py (11548 lines)
The **largest single file**. Contains full PostgreSQL DDL and async CRUD for ~40+ tables.

**Schema tables (CREATE TABLE IF NOT EXISTS):**
`tenants`, `users`, `auth_identities`, `workspaces`, `workspace_memberships`, `workspace_member_invites`, `pilot_invites`, `workspace_billing_accounts`, `workspace_billing_subscriptions`, `agent_threads`, `agent_sessions`, `agent_turns`, `governance_holds`, `workflow_definitions`, `workflow_versions`, `runtime_profiles`, `agent_definitions`, `agent_definition_versions`, `workspace_agent_installs`, `workspace_inventory_items`, `agent_manifests`, `knowledge_sources`, `knowledge_chunks`, `knowledge_embeddings`, `knowledge_retrieval_events`, `security_control_states`, `security_control_events`, `activity_ledger_events`, `credit_ledger_events`, `agent_action_events`, `agent_scheduler_wake_requests`, `agent_channel_events`, `agent_secret_access_events`, `agent_egress_events`, `agent_channel_execution_leases`, `deployed_agents`, `deployed_agent_daily_message_usage`, `deployed_agent_monthly_cost_ledger`, `workspace_hosted_ai_monthly_cost_ledger`, `deployed_agent_activity`, `deployed_agent_business_insights`, `external_user_privacy_requests`, `external_user_privacy_delete_audits`, `agent_traces`, `agent_trace_events`, `channel_user_acquisition_touches`, `deployed_agent_conversation_memory`, `deployed_agent_conversation_summaries`

**Key async functions:**
- `ensure_control_plane_schema()` — Creates all tables if not exists
- `create_workspace_for_user()`, `list_workspaces_for_user()`, `update_workspace_profile()`
- `create_deployed_agent()`, `get_deployed_agent_by_id()`, `list_deployed_agent_analytics()`
- `record_credit_ledger_event()`, `debit_workspace_credit_balance_for_hosted_usage_atomic()`
- `ensure_workspace_billing_defaults()`, `get_workspace_billing_summary()`
- `ensure_workspace_membership()`, `get_user_by_email()`, `get_user_by_id()`
- `create_pilot_invite()`, `claim_pilot_invite()`, `create_local_password_account()`

#### Application Composition: shared.py
**Key global state** managed by this module:
- `CHANNEL_EVENTS` — In-memory channel event store
- `CHANNEL_EVENTS_LOCK` — Threading lock
- `app` — Reference to the FastAPI application instance
- `MEMORY_BUCKETS` — Memory bucket definitions
- `app_lifespan()` — Shared lifespan context manager

#### Gateway Services (12 files)

| File | Key Functions | Purpose |
|------|-------------|---------|
| `gateway_pairing_service.py` | `create_gateway_pairing_intent()`, `register_gateway()` | Pairing/registration |
| `gateway_registry_service.py` | `create_gateway_session()`, `list_workspace_gateways()`, `rotate_gateway_registration_token()`, `revoke_gateway_registration()` | Session lifecycle |
| `gateway_execution_service.py` | `execute_tool_via_gateway()`, `interrupt_tool_via_gateway()` | Tool dispatch |
| `gateway_approval_service.py` | `get_gateway_tool_approval()`, `list_gateway_tool_approvals()`, `request_gateway_tool_approval()`, `resolve_gateway_tool_approval()`, `capability_requires_owner_approval()` | Approval flow |
| `gateway_browser_service.py` | `build_gateway_browser_metadata()`, `build_cloud_browser_fallback()`, `execute_browser_capability_via_gateway()` | Browser automation |
| `gateway_health_service.py` | Health checking | Health |
| `gateway_protocol_service.py` | Protocol message handling | ACP protocol |
| `gateway_state_repository.py` | State persistence | State |
| `gateway_transparency_service.py` | Transparency events | Transparency |
| `gateway_browser_runtime.py` | Browser runtime | Browser |
| `gateway_activity_service.py` | Activity logging | Activity |
| `gateway_quota_enforcement.py` | Usage quotas | Quotas |

#### Direct Chat Pipeline (~35 files)
The direct chat subsystem is a multi-stage processing chain:

| Stage | File | Key Function |
|-------|------|-------------|
| Entry | `direct_chat_entry_service.py` | Entry point |
| Policy | `direct_chat_entry_policy_service.py` | Policy enforcement |
| Routing | `direct_chat_routing_service.py` | Routing logic |
| Prompt | `direct_chat_prompt_service.py` | Prompt building |
| Provider | `direct_chat_provider_service.py` | Provider interaction |
| Facade | `direct_chat_provider_facade_service.py` | Provider abstraction |
| Generation | `direct_chat_generation_service.py` | Generation orchestration |
| Response | `direct_chat_response_service.py` | Response formatting |
| Stream State | `direct_chat_stream_state_service.py` | Stream state |
| Stream Transport | `direct_chat_stream_transport_service.py` | Stream transport |
| Stream Response | `direct_chat_stream_response_service.py` | Stream response |
| Memory | `direct_chat_memory_facade_service.py` | Memory integration |
| Context | `direct_chat_context_service.py` | Context building |
| Composition | `direct_chat_composition_service.py` | Chat composition |
| Handoff | `direct_chat_handoff_service.py` | Specialist handoff |
| Handoff Policy | `direct_chat_handoff_policy_service.py` | Handoff policy |
| Metadata | `direct_chat_metadata_service.py` | Metadata tracking |
| Runtime Facade | `direct_chat_runtime_facade_service.py` | Runtime facade |
| Tool Catalog | `direct_chat_tool_catalog_service.py` | Tool catalog |
| Callback | `direct_chat_callback_facade_service.py` | Callback handling |
| Transport | `direct_chat_transport_service.py` | Transport layer |
| Availability | `direct_chat_availability_service.py` | Availability checking |
| Operator | `direct_chat_operator_support_service.py` | Operator support |
| Hosted Usage | `direct_chat_hosted_usage_service.py` | Usage tracking |
| Support Binding | `direct_chat_support_binding_service.py` | Support binding |
| Intervention | `direct_chat_intervention_service.py` | Intervention handling |

#### Channel Platform Service: channel_platform_service.py
- `ChannelPlatformError` class
- `list_channel_catalog()` — Available channels
- `list_workspace_channel_accounts()` — Workspace channel accounts
- `create_workspace_channel_account()` — Create channel account
- `list_agent_channel_bindings()` — Agent-channel bindings
- `upsert_agent_channel_binding()` — Create/update binding
- `set_agent_channel_binding_state()` — Pause/resume/revoke binding
- `test_agent_channel_binding()` — Test message via binding

#### Connected External Agents: connected_external_agent_service.py
- `list_connected_external_agents()`, `get_connected_external_agent()`
- `create_connected_external_agent()`, `update_connected_external_agent()`
- `refresh_connected_external_agent_manifest()` — Refresh agent capabilities
- `chat_with_connected_external_agent()` — Private chat
- `get_connected_external_agent_section_data()`, `disconnect_connected_external_agent()`
- `build_agent_surfaces_payload()` — All agent types for Studio UI
- `http_error_from_exception()` — Error formatting

#### Workspace Admin Service: workspace_admin_service.py
- `build_workspace_routing_payload()`, `update_workspace_routing_payload()`
- `build_workspace_members_payload()`, `invite_workspace_member()`, `update_workspace_member_role()`, `remove_workspace_member()`, `revoke_workspace_invite()`
- `build_workspace_policies_payload()`, `update_workspace_policies_payload()`
- `build_workspace_sage_tool_policy_payload()`, `update_workspace_sage_tool_policy_payload()`
- `upsert_workspace_provider_credential()`, `delete_workspace_provider_credential()`
- `refresh_workspace_provider_models()`
- `build_platform_analytics_payload()`

#### Deployed Agent Service: deployed_agent_service.py (5000+ lines)
- `create_draft_deployed_agent()`, `list_deployed_agents()`, `get_deployed_agent_detail()`
- `update_deployed_agent()`, `deploy_deployed_agent()`, `pause_deployed_agent()`, `kill_deployed_agent()`, `recover_deployed_agent()`, `archive_deployed_agent()`
- `validate_state_transition()`, `validate_can_deploy()`
- `export_deployed_agent_audit_logs()`, `list_deployed_agent_conversations()`
- `list_deployed_agent_memory_entries()`, `list_deployed_agent_activity()`
- `get_deployed_agent_conversation_detail()`, `delete_deployed_agent_external_user_data()`
- `emergency_stop_workspace_deployed_agents()`
- `apply_deployed_agent_recovery_action()`
- `kill_deployed_agent_runtime_session()`
- `get_deployed_agent_telegram_readiness()`
- `verify_deployed_agent_knowledge_retrieval()`

#### Run Execution: run_service.py
**Key classes:**
- `RunRecord` — Run state
- `RunTransition` — State transition
- `RunExecutionServices` — Service dependencies
- `DurableTurnExecutionRequest` — Durable execution request
- `RunRoutingPreviewServices`, `RunCreationServices`, `RunPreparedResultServices`, `RunPreparationServices`, `PreparedRunCreationServices`

**Key functions:**
- `register_live_run()`, `build_live_run_record()`, `build_run_routing_preview()`
- `prepare_run_start_request()`, `prepare_legacy_run_start_request()`
- `create_run_result_from_request()`, `create_run_from_prepared_request()`
- `execute_durable_turn_request()`
- `build_delegated_child_run_request()`, `schedule_auto_retry_for_failed_children()`
- `resolve_turn_runtime_attachment_selection()`, `build_turn_seed_from_request()`
- `refresh_parent_delegation_state()`
- `timeout_stale_delegated_child_runs()`

#### Turn Ingress: turn_ingress_service.py + turn_runtime.py
- `TurnIngressResult`, `RunStartIngressResult` dataclasses
- `start_turn()` — Main turn entry point
- `start_run_start()` — Run start entry
- `start_system_turn()`, `start_system_run_start()` — System-initiated turns
- `TurnExecutionServices` dataclass
- `build_turn_execution_services()` — Service assembly
- `execute_agent_turn_request()` — Core execution
- `execute_run_start_request_via_turn_runtime()` — Run start execution

#### Model Router: model_router.py
- `call_model(messages, ...)` — Async, supports streaming
- `call_model_sync(messages, ...)` — Sync version
- `infer_provider(model_name, provider, profile_id)` — Provider detection
- `resolve_model(...)` — Model resolution with aliases
- `list_model_aliases()` — Available aliases
- `resolve_call_credentials(...)` — Credential resolution
- `normalize_messages(...)` — Message normalization
- Provider adapters: OpenAI, Anthropic, Gemini via `_sync_provider_completion()`
- Usage normalization via `_normalize_usage()`, `_normalize_usage_from_dict()`

#### Policy Framework: runtime_policy.py
**Trust modes**: `TRUST_MODE_AUTO/GUARDED/STRICT/COST_GUARD/SENSITIVE_GUARD`
**Execution targets**: `EXECUTION_TARGET_AUTO/CLOUD/LOCAL_COMPANION`

**Key functions:**
- `normalize_action_id()` — Action ID normalization
- `infer_actions_from_text()` — NLP action inference
- `evaluate_action_policy()` — Policy evaluation
- `validate_tool_contract()` — Contract validation
- `normalize_trust_mode()` — Trust mode normalization
- `normalize_execution_target()` — Target normalization
- `decide_execution_target()` — Target decision
- `evaluate_tool_policy_decision()` — Decision evaluation
- `enforce_tool_policy()` — Policy enforcement
- `build_browser_execution_binding()` — Browser binding
- `browser_automation_plan_hash()` — Plan hashing
- `local_operator_execution_binding()` — Local execution binding

#### Billing: billing_service.py
- `workspace_billing_summary_for_workspace_id()`
- `resolve_workspace_billing_plan_id()`
- `debit_workspace_credit_balance_for_hosted_usage()`
- Stripe integration: `_stripe_secret_key`, `_stripe_webhook_secret`, `_stripe_price_map`
- `_plan_catalog_summary()`, `_workspace_runtime_usage_summary()`, `billing_proxy_from_summary()`

#### Channel Connectors (85 files in connectors/)
- **Telegram** (24 files): `telegram_ingress_service`, `telegram_webhook_service`, `telegram_poll_*`, `telegram_autopilot_*`, `telegram_transport_service`, `telegram_media_service`, `telegram_menu_service`
- **WhatsApp** (6 files): `whatsapp_ingress_service`, `whatsapp_webhook_service`, `whatsapp_transport_service`, `whatsapp_autopilot_*`, `whatsapp_run_dispatch_service`
- **Discord**: `discord_connector.py`, `discord_bot_runtime_service.py`
- **Slack**: `slack_connector.py`
- **GitHub**: `github_connector.py`
- **Dropbox**: `dropbox_connector.py`
- **S3**: `s3_connector.py`
- **SMTP**: `smtp_connector.py`
- **Linear**: `linear_connector.py`
- **Notion**: `notion_connector.py`
- **Shared**: `channel_delivery_outbox_service.py`, `channel_workspace_scope_service.py`, `runtime_status_service.py`

#### Infrastructure Services

| File | Key Exports |
|------|-----------|
| `runtime_config.py` (~1014 lines) | All `ORION_*`/`EMPYRALIS_*` env vars, `CONNECTOR_CATALOG` (18+ connectors), `RUNTIME_STATE_AUTHORITIES`, `RUNTIME_BUILTIN_SKILLS`, agent machine mode config |
| `db.py` | `DurableRuntimeConfigurationError`, `durable_runtime_required()`, `configured_database_url()`, `get_pool()`, `require_durable_pool()` |
| `config_loader.py` | Configuration loading utilities |
| `error_response_service.py` | Platform error formatting, HTTP exception responses |
| `error_contracts.py` | Error contract definitions |
| `logging_config.py` | `configure_logging()` |
| `jwt_secret.py` | `resolve_jwt_secret()` |
| `sqlite_helpers.py` | `connect_sqlite_rw()` |
| `state_paths.py` | `runtime_state_db_path()` |
| `cloud_cutover_config.py` | `assert_cloud_cutover_config()` |
| `telemetry.py` | OpenTelemetry instrumentation setup |
| `billing_credit_config.py` | Credit configuration |
| `credit_ledger_contract.py` | Credit ledger contract |
| `entitlements_service.py` | `workspace_entitlement_payload_for_workspace_id()` |
| `quota_policy_service.py` | Quota policy definitions |
| `quota_response_service.py` | Quota response formatting |
| `downstream_resilience_service.py` | `CircuitBreakerPolicy`, `RetryPolicy`, `call_with_retries()` |

#### Safety & Security Services

| File | Key Exports |
|------|-----------|
| `kill_switch_gate.py` | `KillSwitchDecision`, `set_kill_switch()`, `clear_kill_switch()`, `is_kill_active()`, `evaluate_kill_switch()`, `assert_not_killed()`, `KillSwitchBlockedError` |
| `tool_broker.py` | `ToolBrokerError`, `ToolExecutionDeniedError`, `issue_capability_token()` |
| `secrets_broker.py` | `SecretBrokerError`, `SecretAccessDeniedError`, `SecretAccessGrant`, `HostedProviderSecretResolution` |
| `acp_manager.py` | `AcpSessionManager`, `_PersistentDict/List/Store`, `DEFAULT_ACP_MANAGER` |
| `activity_ledger_service.py` | `append_activity_event()`, `list_notification_feed_items()`, `list_activity_timeline_payload()` |
| `agent_action_metering_service.py` | `append_agent_action_event()`, `record_started/completed/failed/blocked()` |
| `agent_approval_memory_service.py` | Scoped approval memory with TTL |
| `computer_control.py` | `capture_screenshot()`, `computer_control_click/type()`, `mouse_click()`, `keyboard_type()`, `launch_app()`, `run_applescript()`, `screen_ocr()` |
| `execution_router.py` | `BrowserExecutionAdapter`, `browser_execution_binding_argv()`, `enforce_browser_execution_gate()` |

#### Session Manager (session_manager/ directory)
| File | Key Contents |
|------|-------------|
| `manager.py` | `EmpyralisSessionManager` — Manages runtime sessions, idle TTL, browser lifecycle, turn execution, actor queue, runtime cache |
| `types.py` | `SessionRuntimeHandle`, `CachedRuntimeSnapshot` dataclasses |
| `actor_queue.py` | `SessionActorQueue` |
| `runtime_cache.py` | `RuntimeHandleCache` |
| `observability.py` | `build_session_manager_snapshot()` |

#### Hardware Runtime Adapters (hardware_runtime_adapters/ directory)
| File | Purpose |
|------|---------|
| `cloud_computer_adapter.py` | Cloud-hosted computer runtime |
| `gateway_adapter.py` | Gateway-paired runtime |
| `self_hosted_node_adapter.py` | Self-hosted node runtime |
| `common.py` | Shared adapter utilities |

### 3.4 Data/Model Layer

#### SQLAlchemy ORM: agent_registry_models.py
All models inherit from a base with tenant_id/workspace_id scoping:
- `RuntimeProfileModel`, `AgentDefinitionModel`, `AgentDefinitionVersionModel`, `WorkspaceAgentInstallModel`, `WorkspaceInventoryItemModel`
- `PersonalContextEventModel`, `AgentSchedulerWakeRequestModel`, `AgentChannelEventModel`, `AgentSecretAccessEventModel`, `AgentEgressEventModel`, `AgentChannelExecutionLeaseModel`
- `SecurityControlStateModel`, `SecurityControlEventModel`
- `ActivityLedgerEventModel`, `CreditLedgerEventModel`, `AgentActionEventModel`
- `KnowledgeSourceModel`, `KnowledgeChunkModel`, `KnowledgeEmbeddingModel`, `KnowledgeRetrievalEventModel`

#### Pydantic Schemas: schemas.py
Request/response models for workflows, apps, sage, agents, runs, connectors, auth, deployed agents, marketplace.

### 3.5 Test Suite
300+ test files in `server_modules/tests/` covering virtually every module. Key test categories:
- Auth: `test_auth.py`, `test_auth_hardening.py`, `test_auth_role_boundaries.py`, `test_auth_account_shell.py`, `test_auth_cookie_sessions.py`, `test_auth_invite_acceptance.py`
- Gateway: `test_gateway_routes.py`, ~20 gateway test files
- Runtime: `test_runtime_runs_api_*` (5 files)
- Workspace: `test_workspace_*` (8 files)
- Deployed Agents: `test_deployed_agent_*` (10 files)
- Sage: `test_sage_*` (20 files)
- Channels: `test_channel_*` (10 files), `test_telegram_*` (25 files)
- Connectors: `test_connectors_*` (10 files)
- Billing: `test_billing_service.py`, `test_billing_webhooks.py`
- E2E: `test_closed_pilot_e2e.py`, `test_golden_path.py`, `test_product_e2e.py`
- Chaos: `test_chaos/` directory

---

## 4. TypeScript Gateway (empyralis-gateway)

**Package**: `empyralis-gateway` v0.1.0
**Runtime**: Node.js 20+, TypeScript → CommonJS (ES2022 target)
**Description**: Persistent local gateway for Empyralis personal channels and local runtime control-plane connectivity.

### 4.1 Source File Map (40 files)

#### Entry Point: src/index.ts
- `GATEWAY_VERSION = "0.1.0"`
- `async function acquireGatewayProcessLock(stateDir): Promise<() => Promise<void>>` — PID lock with stale detection
- `async function readExistingLock(lockPath): Promise<{ pid?: number } | null>`
- `function processAlive(pid): boolean` — Checks via `process.kill(pid, 0)`
- `async function main(): Promise<void>` — Orchestrator: loads config, acquires lock, creates all subsystems, wires them, registers/pairs, runs WS client loop with SIGINT/SIGTERM handling

#### Config: src/config.ts
- `interface GatewayConfig` — `apiBaseUrl`, `stateDir`, `heartbeatIntervalMs`, `reconnectMinDelayMs`, `reconnectMaxDelayMs`, `supervisorUrl`, `supervisorSecret?`, `supervisorTimeoutMs`, `pairingToken?`, `gatewayId?`, `deviceId?`, `gatewayToken?`, `displayName?`, `browserPythonExecutable`, `browserProjectRoot`
- `function assertWebSocketUrl(value, env?): string` — Validates wss:// in prod
- `function loadGatewayConfig(env?): GatewayConfig` — Reads env vars

#### Protocol: src/protocol/

**types.ts** — Wire protocol types:
- `PROTOCOL_VERSION = "v1alpha2"`
- `GatewayRequestType` — `"gateway.connect" | "gateway.heartbeat" | "gateway.state.update" | "gateway.disconnect" | "tool.invoke" | "tool.interrupt" | "channel.outbound"`
- `GatewayEventType` — `"gateway.hello" | "gateway.presence" | "channel.inbound"`
- `GatewayFrameKind` — `"request" | "response" | "event"`
- `GatewayScope` — `{ tenant_id, workspace_id, user_id, device_id, gateway_id }`
- `GatewayRequestEnvelope<TPayload>`, `GatewayResponseEnvelope<TPayload>`, `GatewayEventEnvelope<TPayload>`
- `GatewayFrame` — Union of all three envelope types
- `GatewaySessionPayload`, `GatewayRegistrationPayload`, `GatewayToolInvokePayload`, `GatewayToolInterruptPayload`, `GatewayChannelInboundPayload`, `GatewayChannelOutboundPayload`

**codec.ts** — Frame validation:
- `MAX_FRAME_BYTES = 262144` (256KB)
- `MAX_FRAME_DEPTH = 32`
- `SUPPORTED_PROTOCOL_VERSIONS = ["v1alpha2"]`
- `SAFE_FRAME_TYPES` — ReadonlySet of valid type strings
- `FrameValidationResult` type
- `function encodeFrame(frame): FrameValidationResult | string` — Validates, serializes, checks size
- `function decodeFrame(raw): FrameValidationResult` — Parses, validates depth/kind/structure

#### Cloud Connectivity: src/cloud/

**ws-client.ts** — Main WebSocket client:
- `class GatewayWsClient`:
  - `constructor(config, db, journal, outbox, checkpoints, tokenStore, capabilityRouter, personalChannelRuntimes?)`
  - `async registerFromPairing(pairingToken, identity, runtimeMetadata): Promise<GatewayRegistrationPayload>`
  - `async createSession(gatewayId): Promise<GatewaySessionPayload>`
  - `async connect(identity, runtimeMetadata): Promise<GatewaySessionPayload>`
  - `async run(identity, runtimeMetadata, options?): Promise<void>` — Infinite reconnect loop
  - `async sendHeartbeat(scope, runtimeMetadata): Promise<void>`
  - `async sendStateUpdate(scope, payload): Promise<void>`
  - `async publishStateUpdate(payload): Promise<void>`
  - `async publishEvent(type, payload): Promise<void>`
  - `async disconnect(scope, reason?): Promise<void>`

**heartbeat.ts**:
- `interface HeartbeatLoopOptions` — `intervalMs`, `timeoutMs`, `maxConsecutiveFailures?`, `sendHeartbeat`, `onHeartbeatFailure?`, `onHeartbeatRecovered?`
- `class HeartbeatLoop`: `start(options)`, `stop()`, `isRunning()`

**reconnect.ts**:
- `interface ReconnectBackoffOptions` — `minDelayMs`, `maxDelayMs`, `factor?`, `jitterRatio?`
- `interface ReconnectDecision` — `retryable: boolean`, `reason: string`
- `class ReconnectBackoff`: `constructor(options)`, `reset()`, `nextDelayMs()`
- `function classifyReconnectError(error): ReconnectDecision` — 401/403/revoked → non-retryable
- `interface CloseCodeContext` — `connectionAgeMs?`, `heartbeatAgeMs?`
- `interface CloseCodeClassification` — `reason`, `probableCause`, `retryable`
- `function classifyCloseCode(code, context?): CloseCodeClassification` — WebSocket close code classification
- `function sleep(ms): Promise<void>`

#### State Layer: src/state/

**db.ts** — Core file-based JSON persistence:
- `interface GatewayStateSnapshot` — Health state fields
- `class GatewayStateDb`:
  - `constructor(rootDir)`
  - `async ensureReady(): Promise<void>`
  - `filePath(name): string`
  - `rootDirPath(): string`
  - `async readJson<T>(name, fallback): Promise<T>` — Reads JSON, handles ENOENT/corrupt
  - `async writeJson<T>(name, value): Promise<T>` — Atomic write via tmp + rename with per-file mutex
  - `async appendNdjson(name, value): Promise<void>`

**checkpoints.ts**:
- `type GatewayHealthState` — `"online" | "offline" | "reconnecting" | "degraded"`
- `class GatewayCheckpoints`: `constructor(db)`, `async load()`, `async save(snapshot)` (debounced 100ms), `async saveHealthState()`, `async markRecovered()`, `async flush()`

**journal.ts**:
- `interface GatewayJournalEntry` — `cursor`, `direction`, `messageType`, `createdAt`, `payload`
- `class GatewayJournal`: `constructor(db)`, `journalFilePath()`, `async append(direction, messageType, payload)`, `async lastCursor()` — Auto-rotates at 100MB

**outbox.ts**:
- `interface GatewayOutboxItem` — Full lifecycle tracking
- `interface GatewayOutboxSummary` — `total`, `pending`, `failed`, `acknowledged`, `uncertain`
- `MAX_OUTBOX_ITEMS = 10000`, `MAX_RETRIES = 5`
- `class GatewayOutbox`: `constructor(db)`, `async list()`, `async get(requestId)`, `async enqueue()`, `async markAttemptStarted()`, `async acknowledge()`, `async markAttemptFailed()`, `async markUncertain()`, `async markForReplay()`, `async listReplayablePending()`, `async prune()`, `async summarize()`

#### Pairing: src/pairing/

**device-identity.ts**:
- `interface GatewayDeviceIdentity` — `gatewayId`, `deviceId`, `tenantId?`, `workspaceId?`, `userId?`, `createdAt`, `updatedAt`
- `async function resolveDeviceIdentity(db, hints?): Promise<GatewayDeviceIdentity>` — Reads/writes `identity.json`
- `async function persistDeviceIdentityScope(db, scope): Promise<GatewayDeviceIdentity>`

**token-store.ts**:
- `interface GatewayTokenState` — `pairingToken?`, `gatewayToken?`, `sessionToken?`, `sessionId?`, `updatedAt?`
- `function sanitizeTokenForLogging(token): string`
- `class GatewayTokenStore`: `constructor(db)`, `async load()`, `async save(next)`, `async clearSession()`

#### Supervisor: src/supervisor/

**client.ts** — HTTP client to local supervisor:
- `interface GatewaySupervisorExecuteInput` — `requestId`, `capabilityId`, `runId`, `traceId`, `workspaceId`, `arguments`, `runtimeAccessMode?`, `empyralisApproved?`
- `interface GatewaySupervisorInterruptInput` — `requestId`, `runId`, `targetRequestId?`, `traceId`, `workspaceId`, `reason?`
- `class GatewaySupervisorClient`: `constructor(config)`, `supportedCapabilities()` (16 capabilities), `async execute(input)`, `async interrupt(input)`

**signing.ts** — HMAC-SHA256 signing:
- `function signSupervisorExecuteRequest(secret, input): string`
- `function signSupervisorInterruptRequest(secret, input): string`

**capability-router.ts**:
- `class GatewayCapabilityRouter`: `constructor(supervisorClient, browserRuntime?, personalChannelRuntimes?)`, `supportedCapabilities()`, `async handleToolInvoke(frame)`, `async handleToolInterrupt(frame)`

#### Browser: src/browser/

**runtime.ts**:
- `class GatewayBrowserRuntime`: `constructor(db, worker)`, `requestedCapabilities()`, `supportsCapability()`, `async handleCapabilityInvoke(frame)`, `handleStart()`, `handleAction()`, `handleTakeover()`, `handleResume()`, `handleInterrupt()`

**session-store.ts**:
- `interface GatewayBrowserSession` — Full session state tracking
- `class GatewayBrowserSessionStore`: `constructor(db)`, `async list()`, `async get(browserSessionId)`, `async upsert(session)`

**worker.ts** — Python subprocess manager:
- `class GatewayBrowserWorker`: `constructor(config)`, `async send(action, payload)`, `ensureReady()`, `handleLine()`

#### Personal Channels: src/channels/

**personal-runtime.ts** — Core interface definitions:
- `interface PersonalChannelGatewayPublisher` — `publishEvent()`, `publishStateUpdate()`
- `type PersonalChannelStage` — `"live" | "next" | "later" | "reserved"`
- `type PersonalChannelStatus` — `"live" | "not_configured" | "connecting" | "connected" | "disconnected" | "unavailable" | "reserved"`
- `interface PersonalChannelCapabilityManifest` — Declarative channel metadata
- `interface PersonalChannelHealthSnapshot` — Health state
- `interface PersonalChannelRuntime` — Required contract for all channel implementations
- `class PersonalChannelRuntimeRegistry`: `constructor(runtimes?)`, `all()`, `requestedCapabilities()`, `runtimeForCapability()`, `runtimeForChannel()`, `channelManifests()`, `healthSnapshots()`, `setPublisher()`, `startAll()`, `stopAll()`, `handleGatewayConnected()`, `handleGatewayDisconnected()`

**reserved-runtime.ts** — Future channel stubs:
- `function buildReservedPersonalChannelManifest(input): PersonalChannelCapabilityManifest`
- `RESERVED_PERSONAL_CHANNEL_MANIFESTS` — Signal (next), iMessage (later), WeChat (reserved)
- `class ReservedPersonalChannelRuntime` — Placeholder implementation

**personal-config-store.ts** — Configuration persistence:
- `interface TelegramPersonalConfigSnapshot`, `interface WhatsAppPersonalConfigSnapshot`
- `class PersonalChannelConfigStore`: `loadTelegramConfig()`, `loadWhatsAppConfig()`, `patchTelegramConfig()`, `clearTelegramSecrets()`, `patchWhatsAppConfig()`

#### Telegram Channel: src/channels/telegram/ (6 files)

**runtime.ts** (675 lines):
- `class TelegramPersonalRuntime` — MTProto-based Telegram client
  - `requestedCapabilities()`, `supportsCapability()`, `handleCapabilityInvoke()`, `supportsChannel()`, `getManifest()`, `getHealthSnapshot()`, `setPublisher()`, `start()`, `stop()`, `handleGatewayConnected()`, `handleGatewayDisconnected()`, `handleChannelOutbound()`, `handleDraftOutbound()`, `sendFinalOutbound()`, `connectClient()`, `connectClientInternal()`, `handleInboundMessage()`, `publishInbound()`, `flushState()`, `scheduleReconnect()`, `getAdapter()`, `handleConfigure()`

**login.ts**:
- `interface TelegramLoginConfig`, `interface TelegramLinkedAccount`
- `function loadTelegramLoginConfig(env?): TelegramLoginConfig`
- `function buildTelegramPreflightState(config): Partial<TelegramSessionSnapshot> | null`
- `function buildTelegramConnectedState(account): Partial<TelegramSessionSnapshot>`

**message-mapper.ts**:
- `function mapTelegramInboundMessage(rawMessage): TelegramInboundEventPayload | null`
- `function mapTelegramOutboundResult(outbound, response): Record<string, unknown>`

**outbound.ts**:
- `type TelegramChatAction = "typing"`
- `class TelegramTypingKeepalive` — Wraps `TypingKeepalive` with "typing" action
- `class TelegramOutboundStore extends OutboundStore` — File: `telegram-outbound.json`

**reconnect.ts**:
- `DEFAULT_TELEGRAM_RECONNECT_POLICY`
- `function computeTelegramReconnectDelay(attempt, policy?): number`
- `function resolveTelegramReconnectState(error): TelegramReconnectState`

**session-store.ts**:
- `TELEGRAM_PERSONAL_CHANNEL_KEY = "telegram_personal"`
- `TELEGRAM_PERSONAL_PROVIDER = "telegram_gramjs"`
- `interface TelegramSessionSnapshot` — 8 status states
- `class TelegramSessionStore`: `load()`, `save()`, `loadSessionString()`, `saveSessionString()`, `clearSessionString()`, `toGatewayStatePayload()`

#### WhatsApp Channel: src/channels/whatsapp/ (7 files)

**runtime.ts** (652 lines):
- `class WhatsAppPersonalRuntime` — Baileys-based WhatsApp client
  - Same interface as Telegram: `requestedCapabilities()`, `supportsCapability()`, `handleCapabilityInvoke()`, `supportsChannel()`, `getManifest()`, `getHealthSnapshot()`, `setPublisher()`, `start()`, `stop()`, `handleGatewayConnected()`, `handleGatewayDisconnected()`, `handleChannelOutbound()`, `handleDraftOutbound()`, `sendFinalOutbound()`, `connectSocket()`, `connectSocketInternal()`, `handleConnectionUpdate()`, `handleMessagesUpsert()`, `publishInbound()`, `scheduleReconnect()`, `flushState()`, `maybeRequestPairingCode()`, `getAdapter()`, `handleConfigure()`, `reconnectForConfigUpdate()`

**login.ts**:
- `interface WhatsAppLoginConfig`
- `function loadWhatsAppLoginConfig(env?): WhatsAppLoginConfig`
- `function buildWhatsAppPreflightState(config): Partial<WhatsAppSessionSnapshot> | null`
- `function buildWhatsAppPairingCodeState(config, pairingCode): Partial<WhatsAppSessionSnapshot>`

**message-mapper.ts**:
- `function buildWhatsAppClientMessageId(idempotencyKey): string` — SHA-256 truncated to 22 chars
- `function mapWhatsAppInboundMessage(rawMessage): WhatsAppInboundEventPayload | null`
- `function mapWhatsAppOutboundResult(outbound, response): Record<string, unknown>`

**outbound.ts**:
- `type WhatsAppPresenceAction = "composing" | "paused"`
- `class WhatsAppTypingKeepalive` — Wraps `TypingKeepalive` with presence actions
- `class WhatsAppOutboundStore extends OutboundStore` — File: `whatsapp-outbound.json`, adds `clientMessageId` passthrough

**qr-login.ts**:
- `interface WhatsAppQrPayload`
- `function buildWhatsAppQrPayload(qrCode): WhatsAppQrPayload`

**reconnect.ts**:
- `DEFAULT_WHATSAPP_RECONNECT_POLICY`
- `function computeWhatsAppReconnectDelay(attempt, policy?): number`
- `function resolveWhatsAppReconnectState(lastDisconnect, disconnectReason): WhatsAppDisconnectState`

**session-store.ts**:
- `WHATSAPP_PERSONAL_CHANNEL_KEY = "whatsapp_personal"`
- `WHATSAPP_PERSONAL_PROVIDER = "whatsapp_baileys"`
- `interface WhatsAppSessionSnapshot` — 8 status states
- `class WhatsAppSessionStore`: `load()`, `save()`, `authStateDir()`, `ensureAuthStateDir()`, `clearAuthStateDir()`, `toGatewayStatePayload()`

#### Channel Foundation: src/channels/foundation/ (5 shared files)

**credential-redactor.ts**:
- `function redactCredentials(state, stringKeys, objectKeys): Record<string, unknown>`

**draft-manager.ts**:
- `type ChannelOutboundOperation` — `"draft_start" | "draft_delta" | "draft_final" | "send_final"`
- `function normalizeChannelOutboundOperation(operation): ChannelOutboundOperation`
- `interface DraftState`, `type SendFinalFn`
- `class DraftManager`: `async handleDraftOutbound(params, sendFinalFn): Promise<Record<string, unknown>>`

**outbound-store.ts**:
- `interface OutboundRecord` — `idempotencyKey`, `remoteJid`, `text`, `replyToExternalMessageId?`, `status`, `externalMessageId?`, `attemptCount`, timestamps
- `class OutboundStore<TPayload>`: `constructor(db, fileName)`, `list()`, `get()`, `beginSend()`, `markAttemptStarted()`, `markDelivered()`

**reconnect-utils.ts**:
- `interface ReconnectPolicy`, `DEFAULT_RECONNECT_POLICY`
- `function normalizeStatusCode(value): number | undefined`
- `function computeReconnectDelay(attempt, policy?): number`

**typing-keepalive.ts**:
- `interface TypingKeepaliveOptions`, `class TypingKeepalive`: `constructor(sender?, options)`, `start()`, `stop()`

### 4.2 Gateway Dependencies
- **npm**: `@whiskeysockets/baileys` (WhatsApp), `telegram` (MTProto), `pino` (logging)
- **TypeScript**: ES2022 target, CommonJS modules, strict mode

---

## 5. React Frontend (frontend)

**Framework**: Next.js 16 (App Router), React 19, TypeScript strict
**Styling**: Plain CSS with 20,367-line `chrome.css` design system
**Icons**: `lucide-react` + 12 custom SVGs
**Animation**: `motion/react` (framer-motion)
**Desktop**: Tauri bridge via `window.empyralisDesktop`

### 5.1 Design System (lib/ui/ — 17 files)

| File | Purpose | Key Exports |
|------|---------|-----------|
| `tokens.ts` | Design tokens | `APP_THEME_TOKENS`, `APP_SPACING`, `APP_TYPE_SCALE`, `APP_RADIUS`, `APP_SHADOW`, `APP_MOTION`, `APP_LAYOUT` |
| `app-theme.tsx` | Theme provider | `AppThemeProvider` — System/light/dark via `data-theme` attribute, CSS variable injection |
| `primitives.tsx` | Core components | `AppButton` (4 tones), `AppInput`, `AppSelect`, `AppTextarea`, `AppSurfaceRoot/Card/List/ListItem`, `AppSurfaceStatGrid/Stat`, `AppNotice` (4 tones), `AppShinyText`, `AppGetStartedButton`, `AppEmptyState`, `AppModal`, `AppDrawer` |
| `motion.tsx` | Animated components | `MotionPressButton`, `MotionSurfaceRow`, `MotionInlineBanner`, `MotionSlidePanel`, `MotionTabPanel`, `MotionSheetSurface` |
| `modal.tsx` | Modal | `Modal` with AnimatePresence, 3 sizes, backdrop blur, Escape+backdrop dismiss |
| `command-sheet.tsx` | Command sheet | `CommandSheet` — Modal wrapper with size="large" |
| `confirm-dialog.tsx` | Confirm dialog | `ConfirmDialog` — Modal with confirm/cancel, configurable tone |
| `data-table.tsx` | Data table | `DataTable`, `DataTableHeader`, `DataTableRow`, `DataTableCell`, `DataBadge` (5 tones) |
| `form-controls.tsx` | Form controls | `FormSection`, `FormGrid` (4 variants), `FormField`, `FormTokenListEditor`, `FormReadout` |
| `icons.tsx` | Custom icons | 12 SVGs: Spark, Activity, Inbox, Settings, Studio, Workspace, Profile, Panels, Compose, Paperclip, Memory, Send |
| `list-detail.tsx` | List-detail shell | `ListDetailShell`, `ListDetailColumns`, `ListDetailPanel` |
| `state-banner.tsx` | State banners | `StateBanner` (4 tones) with MotionInlineBanner |
| `platform-notification.tsx` | Notifications | Portal-based notification (5 tones, icon, title, detail, action, dismiss) |
| `skeleton-block.tsx` | Loading | Configurable loading placeholder |
| `scroll-region.tsx` | Scroll | Scroll container with `overscroll-behavior: contain` |
| `empty-panel.tsx` | Empty state | Empty state with title/body/actions |

### 5.2 Account Shell (app/(account)/)

**`load-account-shell-session.ts`** (server): 30s TTL, 5min stale tolerance, retry logic, in-flight dedup
**`AccountShellProvider`**: React context + reducer + localStorage persistence. Manages workspace membership, profile, auth state.
**Auth flow**: Google OAuth via `app/api/auth/google/route.ts` → callback → code → id_token → provider-login → session cookies
**CSRF**: Double-submit cookie pattern — `empyralis_csrf_token` cookie + `x-csrf-token` header

### 5.3 Workspace Shell (lib/workspace/ — 59 files)

#### Dependency Injection Container: workspace-services.tsx

`createWorkstationKernel()` assembles these services:

| Service | Class | Role |
|---------|-------|------|
| `transport` | `WorkspaceTransportAdapter` | Fetch wrapper — retries, timeout, 401 auto-refresh, CSRF headers |
| `queryClient` | `WorkspaceQueryClient` | In-memory cache with key-scoped storage, in-flight dedup |
| `persistence` | `WorkspacePersistenceNamespace` | localStorage with prefixed namespacing |
| `realtime` | `WorkspaceRealtimeAdapter` | Polling registration, WebSocket/EventSource tracking |
| `stores` | `WorkspaceStoreFactory` | Custom store factory (getState/setState/subscribe) |
| `disposables` | `WorkspaceDisposableRegistry` | Tracks all timers, intervals, AbortControllers for clean teardown |
| `client` | `WorkstationClient` | API client with ~75 methods |
| `streams` | `WorkstationStreamManager` | SSE stream management |

#### WorkstationClient (API Client — ~75 methods)

| Category | Methods |
|----------|---------|
| **Session** | `ensureSession`, `getSession`, `refreshSession` |
| **Provider** | `listProviderCatalog`, `upsertWorkspaceProviderCredential`, `refreshWorkspaceProviderModels`, `getWorkspaceProviderProfiles` |
| **Chat** | `createThread`, `listThreads`, `getThread`, `deleteThread`, `sendTurn`, `sendTurnStreamed`, `cancelTurn` |
| **Sage** | `getSageProfile`, `upsertSageProfile`, `listSageMemory`, `deleteSageMemory`, `runSageDoctor`, `sendSageChat`, `sendSageChatStreamed` |
| **Deployed Agents** | `listDeployedAgents`, `getDeployedAgent`, `createDeployedAgent`, `updateDeployedAgent`, `deleteDeployedAgent`, `deployDeployedAgent`, `pauseDeployedAgent`, `uploadDeployedAgentKnowledgeFile`, `listDeployedAgentAnalytics`, `getDeployedAgentAnalytics`, `listDeployedAgentConversations`, `getDeployedAgentConversationDetail`, `listDeployedAgentMemory`, `deleteDeployedAgentExternalUserData`, `getDeployedAgentTelegramReadiness` |
| **Connected Agents** | `listStudioAgentSurfaces`, `listConnectedExternalAgents`, `getConnectedExternalAgent`, `getConnectedExternalAgentManifest`, `refreshConnectedExternalAgentManifest`, `disconnectConnectedExternalAgent`, `sendConnectedExternalAgentChat`, `sendConnectedExternalAgentChatStreamed` |
| **Channels** | `listChannelCatalog`, `listChannelAccounts`, `listAgentChannelBindings`, `createAgentChannelBinding`, `updateAgentChannelBinding`, `deleteAgentChannelBinding`, `testAgentChannelBinding` |
| **Approvals** | `listApprovals`, `resolveApproval` |
| **Runs** | `listRuns`, `getRun`, `deleteRun` |
| **Activity** | `listActivity` |
| **Usage** | `listCreditUsage`, `getWorkspaceUsageSummary` |
| **Streams** | `openNotificationsStream`, `openChannelEventsStream` |
| **Desktop** | `createDesktopSession`, `getDesktopSession`, `deleteDesktopSession` |

#### SSE Stream Manager: workstation-stream-manager.ts

Manages two SSE streams:
1. **Notifications stream**: Tracks notification items with dedup, cursor tracking, unread count
2. **Activity/inbox stream**: Tracks channel inbox events

Features: exponential backoff reconnect (1.5s base, 3 attempts), backlog loading, dedup, mark-read

#### WorkspaceSurfacePage (Route Dispatcher)

20 route IDs mapped to pane components:

| Route ID | Pane Component |
|----------|---------------|
| `chat` | `WorkstationChatPane` |
| `studio` | `WorkstationDeployedAgentsPane` |
| `activity` | `WorkstationActivityPane` |
| `approvals` | `WorkstationApprovalsPane` |
| `artifacts` | `WorkstationArtifactsPane` |
| `billing` | `WorkstationBillingPane` |
| `gateway` | `WorkstationGatewayOperatorPane` |
| `integrations` | `WorkstationSageConnectorsPane` |
| `marketplace` | `MarketplacePane` |
| `memory` | `WorkstationSageHeartbeatPane` |
| `notifications` | `WorkstationNotificationsPane` |
| `settings` | `WorkstationSettingsPane` |
| `tasks` | `WorkstationSageToolsPane` |
| `applications` | `HostedMiniAppsPane` |

#### Chat System: The Codex Chat Engine

**Event Pipeline**: `Raw SSE events → TimelineProjectionEvent → CodexChatEvent → CodexTranscriptCell → React component`

Key files:
- **`codex-chat/cells.ts`**: 12 cell types — `CodexUserCell`, `CodexAssistantCell`, `CodexReasoningSummaryCell`, `CodexExecCell`, `CodexToolCell`, `CodexWebSearchCell`, `CodexFileChangeCell`, `CodexScreenshotCell`, `CodexArtifactCell`, `CodexApprovalRequestCell`, `CodexStatusCell`, `CodexErrorCell`
- **`codex-chat/event-projector.ts`** (761 lines): Converts raw events → `CodexChatEvent[]`. Handles 30+ trace event types. Three-tier status normalization. Tool input extraction from nested fields. Channel event detection for Telegram/WhatsApp.
- **`codex-chat/timeline-reducer.ts`** (665 lines): `applyCodexEvent()` reducer, `projectCodexTimeline()`, `dimSystemCells()`, `compactActivityPreview()`, `mergeThinkingText()`
- **`codex-chat/message-adapter.ts`** (164 lines): Backward compat adapter

#### Studio Agent Management (deployed-agents/ — 14 files)

| File | Lines | Purpose |
|------|-------|---------|
| `types.ts` | 272 | All Studio types — `WizardState` (95 fields), `WizardMode`, `WizardStepId`, `StudioTemplate`, `StudioSubview`, etc. |
| `constants.ts` | 657 | 10 `StudioTemplates`, safety defaults, AI options, tool options, connector cards, cost cap defaults |
| `utils.ts` | 1752 | `buildWizardState()`, `buildDeploymentConfig()`, `buildChannelPayload()`, `normalizeProviderCatalog()`, formatters |
| `wizard.tsx` | 1302 | `AgentWizard` — create (1 step) or edit (8 steps) |
| `detail-view.tsx` | 1201 | `AgentDetailView` — 8 tabs, readiness checklist, knowledge upload, AI settings |
| `roster-sidebar.tsx` | 432 | `AgentRosterSidebar` — search + 5 status filters |
| `components.tsx` | 465 | Shared components: context presets, runtime selectors, templates, launch checklist |
| `ai-settings.tsx` | 357 | Provider/model selectors, API keys, reasoning levels |
| `action-settings.tsx` | 122 | Tool toggles, skill readiness |
| `integration-settings.tsx` | 454 | Channel bindings, runtime options, connector cards |
| `inbox-view.tsx` | 263 | Conversation inbox with DataTable |
| `external-agent-detail.tsx` | 727 | External agent detail with capability-based tabs |
| `agent-computer-detail.tsx` | 119 | Simple detail for runtime attachments |
| `playground-panel.tsx` | 39 | Agent test playground wrapper |

#### Security Features (Frontend)

1. **CSRF**: Double-submit cookie. Token cookie + header required for non-GET requests.
2. **Transcript Sanitization** (`transcript-event-contract.ts`): 111 blocked keys stripped, depth-2 sanitization, 26 internal text tokens flagged
3. **Agent Safety Defaults**: Restricts invented prices/policies, legal/medical/financial advice. Monthly cost cap default: $25
4. **Transport Security**: Request timeout, retry limits, abort controller management, disposable registry for clean teardown

### 5.4 Navigation (shared/nav-manifest.ts)

- 6 nav destinations: `sage`, `studio`, `marketplace`, `applications`, `gateway`, `settings`
- 20 route IDs mapped to definitions with labels, hrefs, required capabilities, profile filters
- 3 shell profiles: `personal_shell`, `document_workstation_shell`, `operations_admin_shell`
- Mobile: 13 route definitions with screen metadata, 5 bottom tab entries

---

## 6. Python Cognitive Engine (python_engine)

The cognitive engine is a **self-contained Python subsystem** designed to be called via CLI/subprocess. It implements an OODA-loop cognitive architecture with persistent daemon processing.

### 6.1 Module Map (13 source files)

#### state_paths.py — Path Resolution
- `empyralis_state_home() -> Path` — From `EMPYRALIS_STATE_HOME` env, defaults to `~/.empyralis/state`
- `default_cognitive_db_path() -> str` — SQLite path
- `default_lancedb_uri() -> str` — LanceDB path

#### llm_core.py — Multi-Provider LLM Integration
- `log(msg)` — STDERR logging
- `get_embedding(text, model_id=None) -> list[float]` — OpenAI embeddings API
- `infer_provider(model_name) -> str` — Maps prefix to provider (openai/anthropic/gemini/vertex)
- `http_json_request(url, *, payload, headers, timeout) -> Dict[str, Any]` — HTTP helper
- `error_detail(response) -> str` — Error extraction
- `direct_provider_completion(*, provider, model, system_prompt, user_prompt, temperature, max_tokens) -> Dict[str, Any]` — Routes to OpenAI, Anthropic, Gemini, Vertex APIs directly (no SDKs)
- `init_llm_database(db_path=None)` — Creates `llm_calls` and `safety_tickets` tables
- `extract_json_from_text(text) -> Optional[Dict[str, Any]]` — Fallback JSON extraction
- `resolve_model(model_id) -> str` — Maps "cheap"/"smart" to actual models
- `estimate_cost_usd(provider, prompt_tokens, completion_tokens) -> Optional[float]`
- `credentials_from_env(provider) -> Dict[str, Any]`
- `call_model(prompt, system_prompt, model_id, json_mode, execution_id, niche_id, role, db_path) -> Tuple` — Central LLM call function with full lifecycle tracking
- `call_cheap(prompt, system_prompt, **kwargs) -> Tuple`
- `call_smart(prompt, system_prompt, **kwargs) -> Tuple`
- `call_json(prompt, system_prompt, model_id, **kwargs) -> Tuple`

#### agency_logic.py — Main Orchestration
- `log(msg)` — STDERR logging
- `output_result(ok, step, data, error=None)` — Prints JSON to STDOUT
- `load_niche_config(niche_id)` — Loads YAML niche configs
- `class AgencyLogic`:
  - `__init__(self, niche_config, db_path, execution_id)` — Initializes all subsystems
  - `check_network_effect(self, topic)` — Cross-niche duplicate detection
  - `execute_critic_eval(self, draft, node_id)` — Single-pass critic using SMART model
  - `create_safety_ticket(self, type_, data, node_id, reason)`
  - `researcher_brief(self, topic, node_id)` — Research brief using CHEAP model
  - `sign_publish_action(self, content, platform, media_path, node_id)` — AC-OS Diamond signing
  - `get_cross_niche_insights(self, heuristic_type, limit)` — Cross-niche knowledge
  - `share_insight(self, heuristic_type, insight, confidence)` — Knowledge graph sharing
  - `get_agent_identity_info(self)` — Public identity
  - `get_safety_status(self)` — Safety system status
  - `cognitive_tick(self, event, k)` — Single cognitive tick
  - `cognitive_run(self, events, k, max_steps)` — Multi-tick run

**CLI Actions**: `check_network`, `critic_eval`, `researcher_brief`, `safety_ticket`, `sign_publish`, `get_insights`, `share_insight`, `identity_info`, `safety_status`, `upsert_memory`, `search_memory`, `ingest_file`, `cognitive_tick`, `cognitive_run`, `cognitive_enqueue`, `cognitive_daemon_status`, `cognitive_daemon_start`, `cognitive_daemon_stop`

#### agent_identity.py — Cryptographic Identity (AC-OS Diamond)
- `class AgentIdentity`:
  - `__init__(self, niche_id, db_path)` — Load/generate Ed25519 keypair
  - `sign_action(self, content, action_type, metadata) -> Dict`
  - `verify_signature(self, signed_action) -> bool`
  - `get_identity_info(self) -> Dict`
- `class SafetyGuard`:
  - `__init__(self, db_path, custom_limits)` — Rate limits per action type
  - `check_action(self, niche_id, action_type, signed_action) -> Tuple[bool, str]` — Checks emergency stop, rate limits
  - `activate_emergency_stop(self, reason)` — Kill switch
  - `deactivate_emergency_stop(self)`
  - `get_safety_status(self) -> Dict`
- `class GlobalKnowledge`:
  - `__init__(self, db_path)`
  - `add_insight(self, source_niche, heuristic_type, insight, confidence) -> str`
  - `get_insights_for_niche(self, niche_id, heuristic_type, limit) -> List[Dict]`
  - `record_insight_usage(self, insight_id, niche_id, success)`

#### cognitive_loop.py — OODA Cycle
- `class CognitiveLoop`:
  - `observe(self, event) -> Dict` — Phase 1: capture event
  - `orient(self, observation, k) -> Dict` — Phase 2: contextualize with memory
  - `decide(self, oriented) -> Dict` — Phase 3: choose action
  - `plan(self, oriented, decision) -> Dict` — Create execution plan
  - `execute(self, decision, plan) -> Dict` — Execute decision
  - `act(self, decision) -> Dict` — Dispatch to `run_goal` (runtime API), `status_summary`, `help`, `operator_exec` (local subprocess), `operator_policy`, `clarify`
  - `verify(self, oriented, decision, execution) -> Dict` — Verify consistency
  - `reflect(self, oriented, decision, execution, verification) -> Dict` — Generate lesson
  - `tick(self, event, k) -> Dict` — Single OODA cycle
  - `run(self, events, k, max_steps) -> Dict` — Multi-tick run
- `default_decider(oriented) -> Dict` — Routes commands
- `_build_operator_exec_payload(command, trust_mode, ...) -> Dict`
- `_is_status_like_goal(goal) -> bool`

**External connections**: Imports from `scripts.platform_execution` for capability resolution. Communicates with Empyralis Runtime API via HTTP to `/turn` and `/runs/{run_id}`.

#### cognitive_daemon.py — Persistent Event Daemon (5563 lines, 80+ functions)
**Queue Operations:**
- `init_queue_db(db_path)` — Creates 5 tables + 2 supplemental tables
- `enqueue_event(db_path, niche_id, event, source, execution_id, ...) -> str`
- `claim_next_event(db_path, niche_id) -> Optional[Dict]`
- `complete_event(db_path, event_id, result) -> Dict`
- `fail_event(db_path, event_id, error, retryable) -> Dict`
- `requeue_stale_processing(db_path, niche_id, stale_after_seconds) -> int`
- `get_event(db_path, event_id) -> Optional[Dict]`
- `queue_counts(db_path, niche_id) -> Dict[str, int]`
- `resolve_event_approval(db_path, event_id, approved, note) -> Dict`
- `wait_for_event(db_path, event_id, timeout_seconds, poll_seconds) -> Dict`

**Digest/Audit:**
- `get_event_digest(db_path, event_id) -> Optional[Dict]`
- `list_event_digests(db_path, niche_id, limit) -> List[Dict]`
- `list_pending_approvals(db_path, niche_id, limit, objective_id) -> List[Dict]`

**Daemon Lifecycle:**
- `start_daemon(niche_id, db_path, poll_seconds, stale_after_seconds, foreground) -> Dict`
- `stop_daemon(niche_id, db_path, timeout_seconds) -> Dict`
- `daemon_status(niche_id, db_path) -> Dict`
- `run_daemon_loop(niche_id, db_path, poll_seconds, stale_after_seconds) -> int`

**Objectives System:**
- `create_objective(*, db_path, niche_id, title, goal_text, priority, cadence_seconds, ...) -> Dict`
- `get_objective(*, db_path, objective_id) -> Optional[Dict]`
- `update_objective(*, db_path, objective_id, status, next_run_at, ...) -> Dict`
- `list_objectives(*, db_path, niche_id, status, limit) -> List[Dict]`
- `ingest_due_objectives(db_path, niche_id, max_dispatch) -> Dict`
- `dispatch_objective_now(db_path, niche_id, objective_id, resume_if_paused) -> Dict`
- `tail_objective(*, db_path, objective_id, limit) -> Dict`
- `simulate_objective_policy(...)` — Non-mutating policy simulation
- `autotune_objective(...)` — Analyzes reflections, proposes adjustments

**Skill Learning System:**
- `list_skill_candidates(...) -> List[Dict]`
- `maybe_apply_skill_replay(...) -> Dict`
- `decay_skill_candidates(...) -> Dict`
- `_derive_skill_candidate(...)`
- `_should_promote_skill_candidate(...)` — Requires 3+ runs, 67%+ success, 0.6+ confidence
- `_match_replay_score(...)`

#### memory_manager.py — Persistent World Model
- `class MemoryBackend(ABC)`: `upsert(id, text, vector, metadata)`, `search(vector, k)`
- `class LanceDBBackend(MemoryBackend)`: Connects to LanceDB, handles `merge_insert`
- `class SQLiteBackend(MemoryBackend)`: Creates `fallback_memory` table, in-process cosine similarity
- `class MemoryManager`: `__init__(self, lancedb_uri, sqlite_path)`, `upsert_memory(self, text, metadata) -> str`, `search_memory(self, query, k) -> List[Dict]`

#### operator_skills.py — Local Command Execution
- `class OperatorSkillRegistry`:
  - `execute(self, command, root, timeout_seconds, max_output_chars) -> Dict`
  - `_pwd(self, command, root) -> Dict` — `pwd` skill
  - `_ls(self, command, tokens, root, max_output_chars) -> Dict` — `ls` with path traversal protection
  - `_run_subprocess_skill(self, skill, command, tokens, cwd, ...) -> Dict` — `git.status`, `git.diff`, `git.log`, `test.unittest`

**Supported skills**: `fs.pwd`, `fs.ls`, `git.status`, `git.diff`, `git.log`, `test.unittest`

### 6.2 Cognitive Engine Test Files
- `test_brain_transplant.py` — Tests `call_cheap()`, `call_json()`, `critic_eval`, `researcher_brief`, error handling
- `test_cognitive_daemon.py` — 30+ tests: enqueue/claim/complete, stale requeue, daemon state, wait-for-event, priority policy, dependency blocking, failure classification, skill learning, objectives lifecycle, SLA/deadline, fail-streak escalation, auto-remediation, policy simulation, autotune
- `test_cognitive_loop.py` — OODA tick tests: run_goal, status, operator exec, policy, custom decider/actor
- `test_memory_manager.py` — Upsert/search, fallback logic, cosine similarity ranking, validation
- `test_operator_skills.py` — pwd, ls, path escape blocked, unknown command, git.status

### 6.3 Cognitive Engine Dependencies
```
pydantic>=2.0.0, python-dotenv>=1.0.0, PyYAML>=6.0, cryptography>=42.0.0, lancedb>=0.6.0, pandas>=2.0.0
```

---

## 7. Shared TypeScript Contracts (shared/)

### 7.1 api-contract/index.ts (491 lines)
**Purpose**: Canonical API type definitions used by both frontend and any TypeScript consumer.

**Key types** (36 exported types):
- `ApiTurnActor` — `{ type, id, display_name }`
- `ApiTurnAttachment` — `{ kind, uri, name?, metadata? }`
- `AgentTurnRequest` — Full turn request including `tenant_id`, `workspace_id`, `thread_id`, `session_id`, `actor`, `message`, `attachments`, `policy_context`
- `AgentTurnResponse` — Full turn response including `status`, `reply`, `run_id`, `artifacts`, `approvals`, `interventions`
- `SessionCreateRequest`, `SessionResponse`
- `ThreadRecord`, `ThreadTurnRecord`, `ThreadListResponse`
- `RunListItem`, `RunListResponse`, `RunDetailResponse`, `RunReplayResponse`
- `ArtifactItem`, `ArtifactListResponse`
- `ApprovalItem`, `ApprovalListResponse`, `ApprovalResolveRequest`, `ApprovalResolveResponse`
- `NotificationItem`, `NotificationListResponse`, `NotificationReadRequest`, `NotificationReadResponse`, `NotificationDeviceRegistrationRequest`, `NotificationDeviceRegistrationResponse`
- `MachineListResponse`, `ConnectorListResponse`
- `HealthResponse`
- `DeployedAgentRuntimePlacement`, `DeployedAgentRuntimeSupplierKind`, `DeployedAgentComputerAutomationConfig`, `DeployedAgentWorkspaceContract`, `DeployedAgentRuntimeSupplyContract`
- `AgentTurnPolicyContext` — Policy context with trust_mode, session_mode, approval_ui, runtime_lane, permission_mode, elevated mode settings
- `AgentTurnApprovalRequest` — Approval request shape
- `AgentTurnIntervention` — Intervention with kind, severity, status
- `ComputerActionEventPayload` — Computer action event

### 7.2 api-contract/model-tier-contract.ts (44 lines)
- `EmpyralisModelTier` — `'light' | 'pro' | 'max' | 'local_ai' | 'my_api_key' | 'my_ai_account'`
- `EmpyralisModelBillingSource` — `'empyralis_credits' | 'local_runtime' | 'user_api_key' | 'user_ai_account'`
- `EmpyralisModelTierContract` — Full tier contract with `public_tier`, `public_label`, `internal_provider`, `internal_model`, `reasoning_effort`, `thinking_mode`, `max_output_tier`, `agent_budget_tier`, `billing_source`, `credit_multiplier`, `fallback_tier`, `user_owned`, `expose_provider_model_to_ordinary_ui`
- `EMPYRALIS_HOSTED_MODEL_TIERS` — `['light', 'pro', 'max']`
- `USER_OWNED_MODEL_TIERS` — `['local_ai', 'my_api_key', 'my_ai_account']`
- `exposesProviderModelToOrdinaryUi(tier)` — Checks if tier is user-owned

### 7.3 api-contract/client.ts (329 lines)
**`createApiClient(init)`** — Generic API client factory with 18 methods:
- `createSession()`, `getSession()`
- `listThreads()`, `getThread()`
- `turn()` (POST), `openTurnStreamResponse()` (SSE)
- `listRuns()`, `getRunDetail()`, `getRunReplay()`
- `listApprovals()`, `resolveApproval()`
- `listArtifacts()`, `fetchArtifactContent()` (Blob)
- `listMachines()`, `listConnectors()`
- `listNotifications()`, `openNotificationsStream()`, `markNotificationsRead()`, `registerNotificationDevice()`
- `getHealth()`

**`ApiClientError`** class — `extends Error` with `status: number` and `details?: unknown`

### 7.4 design-system/tokens.ts (493 lines)
Canonical design token definitions as the single source of truth for theming across frontend and mobile.

### 7.5 nav-manifest.ts (151 lines)
Route type definitions and re-exports:
- `WorkspaceShellProfileId` — 3 profiles
- `WorkspaceNavDestinationId` — 6 destinations
- `WorkspaceRouteId` — 20 routes
- `WorkspaceNavDestinationDefinition`, `WorkspaceNavRouteDefinition`, `WorkspaceMobileRouteDefinition`, `WorkspaceMobileBottomTab`
- `getWorkspaceNavRouteDefinition()`, `getWorkspaceNavDestinationDefinition()`, `getWorkspaceDestinationRouteDefinitions()`, `buildWorkspaceRouteHref()`, `resolveWorkspaceRouteIdFromSegment()`

Routes are imported from a compiled `nav-manifest.js` file (built at deploy time from server-side route registry).

---

## 8. Agent Skills (skills/)

8 skill definitions, each in a `SKILL.md` file:

| Skill | Purpose |
|-------|---------|
| `browser/` | Browser automation (Playwright) |
| `business-skill-template/` | Template for creating business skills |
| `code-runner/` | Code execution capability |
| `file-manager/` | Filesystem operations |
| `inventory-tool/` | Data inventory management |
| `memory-manager/` | Persistent memory operations |
| `telegram-bot/` | Telegram bot management |
| `vision-monitor/` | Computer vision with 7 Python source files (`analyze.py`, `common.py`, `config.yaml`, `model_router.py`, `query_handler.py`, `snapshot.py`, `state_writer.py`, `worker.py`) — loads screenshots and uses visual LLMs to describe state |
| `web-search/` | Web search capability |

---

## 9. Infrastructure & Deployment

### 9.1 Docker
**Dockerfile.runtime**: Python 3.11-slim, exposes port 8001, installs system deps (ffmpeg, tesseract, GL libs), copies requirements and source, runs via uvicorn.

**docker-compose.yml**: Multi-service deployment configuration.

### 9.2 CI/CD (GitHub Actions)

| Workflow | Trigger | Jobs |
|----------|---------|------|
| `ci.yml` | `workflow_dispatch` | `server-tests` (Python 3.14, 20 test files), `shell-typecheck` (Node 22, tsc frontend + mobile), `supervisor-build` (Rust, cargo build) |
| `build.yml` | Build pipeline | Build steps |
| `security-baseline.yml` | `workflow_dispatch` | `dependency-review`, `secret-scan` (gitleaks), `python-dependency-audit` (pip-audit), `node-dependency-audit` (npm audit) |
| `supply-chain.yml` | Supply chain | Supply chain verification |

### 9.3 Environment Configuration (.env.example)

Key environment variables:
- `ORION_JWT_SECRET` — JWT signing secret (32+ chars in production)
- `ORION_API_KEY` — Runtime API key
- `ORION_ENV` — Environment (development/production)
- `DATABASE_URL` — PostgreSQL connection string
- `EMPYRALIS_TOOL_BROKER_SECRET`, `EMPYRALIS_SECRETS_BROKER_SECRET` — Required broker secrets
- `CREDENTIAL_VAULT_KEY` — Encryption key for provider API keys
- `CONTROL_PLANE_ORIGINS`, `FRONTEND_ORIGINS` — CORS origins
- `EMPYRALIS_PUBLIC_URL` — Public URL
- `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY` — LLM provider keys
- `AGENT_MACHINE_MODE` — "personal" or "agent"
- `AGENT_MACHINE_OWNER` — Machine owner user ID
- `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN` — Sentry error tracking

### 9.4 Server Dependencies (requirements.txt — 42 packages)

**Core**: `fastapi==0.135.3`, `uvicorn[standard]==0.42.0`, `starlette==1.0.1`, `SQLAlchemy>=2.0.0`, `pydantic>=2.0.0`, `PyYAML>=6.0`

**AI/ML**: `openai`, `transformers>=4.48.0`, `torch>=2.2.0`, `sentence-transformers>=3.0.0`, `lancedb>=0.6.0`

**Integrations**: `dropbox>=11.36.0`, `boto3>=1.34.0`, `discord.py>=2.4.0`, `playwright>=1.40.0`, `mcp[cli]==1.26.0`

**Security**: `cryptography>=42.0.0`, `PyNaCl>=1.5.0`, `sentry-sdk[fastapi]>=2.57.0`

**Observability**: `opentelemetry-api`, `opentelemetry-sdk`, `opentelemetry-exporter-otlp`

**Database**: `asyncpg>=0.30.0`

**Desktop automation**: `pyautogui>=0.9.54`, `pytesseract>=0.3.10`, `pyperclip>=1.9.0`, `psutil>=6.0.0`

**Media**: `Pillow>=10.0.0`, `opencv-python>=4.8.0`, `av>=12.0.0`, `SpeechRecognition>=3.10.0`

---

## 10. Security Architecture

### 10.1 Authentication & Authorization
- **JWT-based sessions**: Cookie + refresh token pattern, device tracking
- **OAuth**: Google, Apple identity token verification
- **RBAC**: Three-tier (viewer/member/owner) with workspace-level capability gating
- **API Keys**: For machine-to-machine access
- **CSRF Protection**: Double-submit cookie pattern on all non-GET requests

### 10.2 Safety Systems
- **Kill Switch**: `kill_switch_gate.py` — Emergency stop at workspace, agent computer, and deployed agent levels
- **Policy Framework**: 5 trust modes (auto/guarded/strict/cost_guard/sensitive_guard)
- **Tool Broker**: `tool_broker.py` — Authorization tokens required for tool execution
- **Secrets Broker**: `secrets_broker.py` — Vault-encrypted credential access
- **Approval Memory**: Scoped approval caching with TTL to prevent approval fatigue
- **Agent Safety Defaults**: Restricts sensitive domains (legal, medical, financial), enforces cost caps

### 10.3 Rate Limiting
Multi-level sliding window buckets for:
- Login attempts
- API calls
- CSRF token generation
- Session refresh
- Model invocations

### 10.4 Supply Chain
- **pip-audit**: Python dependency vulnerability scanning
- **npm audit**: Node dependency vulnerability scanning (high+ severity)
- **Gitleaks**: Secret scanning with `.gitleaks.toml` config
- **Dependency review**: PR-based dependency change review

### 10.5 Audit & Transparency
- **Activity Ledger**: All significant events recorded
- **Credit Ledger**: All billing events tracked
- **Agent Action Metering**: All tool executions metered for billing/transparency
- **Event Sourcing**: Immutable event journal with NDJSON append-only format
- **Secrets Redaction**: Credentials redacted from all state publications

---

## 11. Data Flow Diagrams

### 11.1 User Chat Turn (Full Path)

```
1. User types message in Chat Composer (React)
2. ChatComposer calls client.sendTurnStreamed()
3. WorkstationClient sends POST /api/chat/turn (via BFF proxy)
4. BFF proxy forwards to FastAPI /turn endpoint
5. turn_ingress_service.start_turn()
6. direct_chat_entry_service → entry validation
7. direct_chat_entry_policy_service → policy checks
8. direct_chat_routing_service → route to model/provider
9. direct_chat_prompt_service → build prompt with context
10. direct_chat_provider_service → call model
11. model_router.call_model() → dispatch to OpenAI/Anthropic/Gemini
12. direct_chat_generation_service → process generation
13. direct_chat_stream_response_service → SSE stream back
14. Frontend SSE → event-projector.ts → CodexChatEvent[]
15. timeline-reducer.ts → projectCodexTimeline() → React cells
16. Chat transcript renders progressively
```

### 11.2 Deployed Agent Channel Message (Telegram)

```
1. User sends message to Telegram bot
2. Telegram → webhook to FastAPI /webhooks/telegram
3. telegram_ingress_service → validate, deduplicate
4. Session lookup → find agent session
5. Deployed agent turn execution
6. direct_chat_pipeline → model response
7. Channel egress → telegram_transport_service
8. Send response via Telegram API
9. Record in channel_delivery_outbox
```

### 11.3 Gateway Tool Execution

```
1. Runtime decides to execute tool (e.g., browser action, shell command)
2. tool_broker.issue_capability_token() → authorization
3. Gateway request (tool.invoke) via WebSocket
4. empyralis-gateway receives frame
5. capability-router.ts → route to executor
6a. Browser: GatewayBrowserRuntime → Python worker subprocess → Playwright
6b. Shell: GatewaySupervisorClient → HMAC-signed HTTP POST → local runtime
7. Result flows back through WS as tool response
8. Approval check if required
9. Result incorporated into turn response
```

### 11.4 Cognitive Engine Processing

```
1. External system enqueues event via CLI:
   python agency_logic.py cognitive_enqueue --in '{"niche_id":"..."}'
2. cognitive_daemon.py: enqueue_event() → SQLite queue
3. Daemon loop: claim_next_event() → AgencyLogic.cognitive_tick()
4. CognitiveLoop.tick():
   a. observe(event) → capture observation
   b. orient(observation, k) → contextualize with memory search
   c. decide(oriented) → choose action
   d. plan(oriented, decision) → create plan
   e. execute(decision, plan) → act()
      - May call Empyralis Runtime API (/turn) for cloud execution
      - May execute local subprocess via OperatorSkillRegistry
   f. verify(oriented, decision, execution) → verify
   g. reflect(...) → generate lesson
5. complete_event() → write result, extract digest, evaluate objectives
6. Skill learning: maybe_apply_skill_replay() for future events
```

---

## 12. Complete File Index

### Key Files by Size/Complexity

| File | Lines | Role |
|------|-------|------|
| `server_modules/control_plane_repository.py` | 11,548 | PostgreSQL DDL + CRUD for 40+ tables |
| `server_modules/auth.py` | 5,720 | Authentication & authorization |
| `python_engine/cognitive_daemon.py` | 5,563 | Persistent event daemon |
| `server_modules/deployed_agent_service.py` | 5,000+ | Deployed agent lifecycle |
| `frontend/lib/workspace/deployed-agents-pane.tsx` | 1,961 | Studio orchestrator |
| `server_modules/routes_gateway.py` | 1,863 | ACP gateway routes |
| `frontend/lib/workspace/deployed-agents/utils.ts` | 1,752 | Studio utilities |
| `server_modules/runtime_runtime_api.py` | 1,585 | Runtime management routes |
| `server_modules/routes_mini_apps.py` | 1,506 | Mini app routes |
| `frontend/lib/workspace/deployed-agents/wizard.tsx` | 1,302 | Agent wizard |
| `frontend/lib/workspace/deployed-agents/detail-view.tsx` | 1,201 | Agent detail |
| `server_modules/runtime_runs_api.py` | 1,168 | Run execution routes |
| `server_modules/runtime_config.py` | 1,014 | Central configuration |
| `server_modules/mini_apps_service.py` | 900 | Mini app service |
| `frontend/lib/workspace/codex-chat/event-projector.ts` | 761 | Event projection engine |
| `frontend/lib/workspace/codex-chat/timeline-reducer.ts` | 665 | Timeline reducer |
| `empyralis-gateway/src/channels/telegram/runtime.ts` | 675 | Telegram runtime |
| `empyralis-gateway/src/channels/whatsapp/runtime.ts` | 652 | WhatsApp runtime |
| `frontend/lib/workspace/deployed-agents/constants.ts` | 657 | Studio constants |

### All Route Files

| File | Prefix |
|------|--------|
| `routes_workflows.py` | root + `/api` |
| `routes_agents.py` | root + `/api` |
| `routes_runs.py` | root + `/api` |
| `routes_auth.py` | root + `/api` + `/api/v1` |
| `routes_health.py` | root + `/api` |
| `routes_connectors.py` | root + `/api` |
| `routes_builder.py` | `/api/v1` |
| `routes_gateway.py` | `/api` |
| `routes_personal_channels.py` | `/api` |
| `routes_workspaces.py` | `/api` |
| `routes_mini_apps.py` | `/api` |
| `routes_billing.py` | `/api` |
| `routes_deployed_agents.py` | `/api` |
| `routes_agent_traces.py` | `/api` |
| `routes_platform_analytics.py` | `/api` |
| `routes_marketplace.py` | `/api` |
| `routes_pilot.py` | `/api` |
| `routes_studio.py` | `/api` |

### Sage API Subsystem

| File | Router Function |
|------|----------------|
| `sage_chat_api.py` | `register_sage_chat_routes` |
| `sage_memory_api.py` | `register_sage_memory_routes` |
| `sage_profile_api.py` | `register_sage_profile_routes` |
| `sage_skills_api.py` | `register_sage_skills_routes` |
| `sage_services_api.py` | `register_sage_services_routes` |
| `sage_context_files_api.py` | `register_sage_context_file_routes` |
| `sage_heartbeat_api.py` | `register_sage_heartbeat_routes` |

---

*End of Codebase Map. All information verified against source files as of 2026-05-25.*
