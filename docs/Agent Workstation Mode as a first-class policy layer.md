• Executive Summary
  Best architecture: build Agent Workstation Mode as a first-class policy layer on top of Gateway, not as a separate
  fake runtime. Sage should route every local/dedicated-computer action through one policy gate:

  Sage turn -> tool intent -> AgentComputerPolicy -> AgentComputerProfile -> CapabilityRiskClassifier -> approval/
  autopilot decision -> Gateway execution -> trace/audit/transparency

  What Empyralis already has: Sage runtime, Gateway, approvals, kill switch, no silent cloud fallback, trace IDs,
  transparency events, personal Telegram/WhatsApp through Gateway, and runtime mode separation.

  Biggest remaining gap: one product-level approval decision orchestrator and connected-computer routing contract. The
  core policy/profile/risk/memory primitives now exist, but Sage, Gateway, Studio, Apps, and future computer actions
  still need one shared allow/ask/block decision path that produces natural approval cards and auditable decisions.

  Copy:

  - OpenAI Agents SDK: trace/span model, tool guardrails, handoffs, sensitive trace controls.
  - Anthropic Computer Use: dedicated VM/container, domain allowlist, human confirmation for real-world consequences,
    prompt-injection risk model.
  - Copilot Studio: activity map, transcript + action inputs/outputs, test vs production separation.
  - Google Agent Platform: runtime identity, sessions, memory, traces/spans, governed runtime model.
  - LangSmith/LangGraph: trace metadata/tags, redaction/anonymization, production debugging.
  - CrewAI: flows, guardrails, human-in-loop, enterprise RBAC/observability direction.
  - OpenClaw: persistent local Gateway, capability manifests, local channel runtimes, pairing/revocation, mobile/
    control-panel visibility.

  Avoid:

  - Broad “full local computer access” by default.
  - Asking approval for every low-risk action.
  - “Trust forever” approvals.
  - Silent fallback to cloud/in-memory.
  - Exposing raw chain-of-thought, screenshots, secrets, or internal runtime jargon.
  - Caching or fast-pathing risk decisions without rechecking target path, URL, channel, actor, action hash, and policy
    version.
  - Screenshot/session recording retention without explicit opt-in and retention limits.
  - Treating extension installs, software installs, system settings, permission changes, or account linking as normal
    file/app actions.
  - Letting cloud storage access slip between file, connector, and browser policy categories.
  - Letting Sage Cloud Computer actions bypass the same policy/risk/approval decision model used for local Gateway
    actions.

  Platform Comparison
  | Platform | Runtime model | Permission model | Observability | What to copy | What to avoid |
  |---|---|---|---|---|---|
  | OpenClaw | Local Gateway owns local tools/channels | Local capability scopes + approvals | Gateway logs/status/
  control panel | Persistent local companion, capability manifests, pairing/revoke | Too-broad local power if not
  bounded |
  | OpenAI Agents SDK | Agent runner, tools, handoffs, sessions | Input/output/tool guardrails; tripwires | Traces/
  spans for LLM, tools, guardrails, handoffs | Span taxonomy, tool guardrails, and agent-as-tool nesting through the same tool interface | Hosted/built-in tools need separate
  safety wrapper |
  | Anthropic Computer Use | App executes screenshots/mouse/keyboard/bash/text editor | Isolated VM/container, domain
  allowlist, human confirmation | App-owned logs/screenshots | Dedicated workstation isolation and approval for
  consequences; prompt-injection risk model for tool-calling agents | Giving model sensitive accounts/secrets |
  | Copilot Studio | Maker/test/prod agent surface | Admin/maker/user separation | Activity map + transcript + inputs/
  outputs | Operator activity map for Empyralis | Raw reasoning exposure to customers |
  | Google Vertex/ADK | Managed runtime, sessions, memory, code execution | IAM, agent identity, gateway/governance |
  Cloud Trace spans | Runtime identity, agent-to-agent authorization, and trace/span discipline | Heavy cloud dependency for local-first wedge |
  | LangSmith/LangGraph | Run tree / graph execution | App-controlled masking/tracing | Trace metadata/tags/
  anonymization | Redaction before trace persistence and checkpoint/snapshot model for resumable workstation sessions | Logging sensitive payloads by default |
  | CrewAI | Agents/crews/flows | Guardrails + HITL + RBAC direction | Enterprise console/integrations | Flows for
  deterministic business work | Multi-agent complexity before wedge is stable |

  Empyralis Current-State Matrix
  | Area | Status | Evidence | Recommendation |
  |---|---|---|---|
  | Sage | Implemented, still needs workstation policy | server_modules/sage_agent_runtime_service.py,
  sage_turn_adapter.py | Add workstation-aware tool routing |
  | Gateway | Implemented and hardened | routes_gateway.py, gateway_execution_service.py, gateway_approval_service.py,
  kill_switch_gate.py | Keep as only local execution path |
  | My Computer Agent | Implemented with safe direction | deployed_agent_virtual_runtime_service.py, Gateway health/
  binding checks | Add explicit computer profile |
  | Cloud Computer Agent | Safer after fail-closed runtime work | virtual_computer_runtime.py,
  deployed_agent_runtime_contract_service.py | Keep separate from local workstation |
  | Studio Agents | Implemented/partial | deployed_agent_test_turn_service.py, routes_deployed_agents.py | Do not mix
  Sage private memory |
  | Personal channels | Implemented/partial | personal_channel_sage_bridge_service.py, Gateway Telegram/WhatsApp
  runtimes | Treat as Sage-only by default |
  | Activity/transparency | Implemented/partial | agent_transparency_events.py, sage_transparency_service.py,
  gateway_transparency_service.py | Add workstation action spans |
  | Approval/kill switch | Implemented | sage_approval_service.py, gateway_approval_service.py, kill_switch_gate.py |
  Add approval memory with expiry/scope |
  | Memory | Implemented/partial | sage_memory_service.py, deployed_agent_memory_service.py | Enforce Sage vs Studio
  boundary in workstation prompts |

  Agent Workstation Architecture
  Add these concepts:

  - AgentComputerPolicy: what Sage may do automatically, ask for, or block. This owns autonomy_mode. Fields: policy_id,
    policy_version, autonomy_mode,
    allowed_capabilities, domain_allowlist, filesystem_scope, terminal_policy, external_message_policy,
    credential_policy, spend_policy, approval_ttl, remembered_approval_rules.
  - AgentComputerProfile: persisted identity for the computer Sage can use. This describes the machine, not the
    autonomy mode. Fields: profile_id, workspace_id,
    owner_user_id, policy_id, gateway_id, machine_label, environment_kind, dedicated_to_agent, health_state, last_seen_at,
    recording_policy, filesystem_roots, browser_profiles, channel_access.
  - CapabilityRiskClassifier: deterministic server-side classifier before Gateway execution. Inputs: capability, target
    URL/path/channel, action class, payload, workspace, computer profile, current kill state.
    Output contract: decision_id, policy_version, risk_level, risk_class, action_class, capability, target_summary,
    decision (allow, approval_required, block), approval_scopes_required, blocked_reason, audit_visibility,
    recording_required, retention_class, cacheable=false by default.
  - ApprovalMemory: remembers narrow approvals, not blanket trust. Example: “Allow reading files under /Invoices/2026
    for 24h”, not “Allow all files forever.”
  - AgentWorkstationRuntime: adapter that binds Sage to Gateway with profile + policy + trace.
  - Tool/Handover router: routes read/search/browser/file/terminal/communication intents to safe tools, Gateway, or
    approval.
  - Voice/notification policy: voice is input/notification only at first; no voice-triggered destructive action without
    confirmation.
  - Activity/trace/audit integration: every decision logs intent_detected, risk_classified, approval_requested,
    action_executed, action_blocked, kill_switch_blocked.

  Permission / Autonomy Model
  | Mode | Auto-runs | Asks approval | Blocked | Best target |
  |---|---|---|---|---|
  | Read Only | Screenshots, safe browser read, memory read, file metadata | File content from sensitive roots |
  Writes, sends, terminal | Personal computer default |
  | Ask Every Time | Nothing beyond read-only | Browser clicks, file reads, app actions | Secrets, payments, deletes
  unless explicitly enabled | New user / first setup |
  | Safe Autopilot | Low-risk browser navigation, read-only files, drafts, summaries | External sends, form submits,
  file writes, terminal | Payments/secrets/deletes by default | Dedicated workstation default |
  | Trusted Workstation | Routine sends to approved contacts, scoped file writes, approved scripts | Money, secrets,
  production deploys, permission changes | Outside scopes | Dedicated Mac mini / VM |
  | Emergency Stop | Nothing | Nothing | Everything | Kill state |

  Default:

  - Personal Computer Mode: Ask Every Time or Read Only.
  - Dedicated Agent Workstation Mode: Safe Autopilot.
  - Sage Cloud Computer: Safe Autopilot inside cloud sandbox, but still uses AgentComputerPolicy and
    CapabilityRiskClassifier. Only the execution adapter changes from Gateway to cloud runtime.
  - Cloud Computer Agent: Safe Autopilot inside cloud sandbox, with deployed-agent policy and runtime admission gate.
  - Self-Hosted Agent: Read Only until node policy is proven.

  Tool / Hands Matrix
  | Hand | Empyralis support | Mature equivalent | Risk | Approval rule | First step |
  |---|---|---|---|---|---|
  | Browser | Gateway browser runtime | Anthropic computer/browser, OpenAI computer tool | Medium/high | Auto read,
  approve submits/logins/purchases | Bind to policy classifier |
  | File | Gateway/local capability path | Anthropic text editor/bash | High | Scoped read; approve write/delete | Add
  filesystem scopes to profile |
  | App | Partial via computer control | Computer Use GUI actions | High | Approve app mutation | Add app capability
  taxonomy |
  | Terminal | Gateway/shell-like capability direction | Anthropic bash, OpenAI shell/local shell | Critical | Block or
  explicit approved scripts only | Add terminal command policy |
  | Communication | Personal channels exist | CrewAI triggers, Copilot actions | High | Draft auto, send approval | Add
  outbound send risk class |
  | Memory | Sage memory exists | Google Memory Bank, CrewAI memory | Medium | Read scoped; write through memory gate |
  Include source + visibility in trace |
  | Scheduler | Partial/future | CrewAI flows/triggers | Medium | Safe reminders auto; external jobs approve | Defer
  until workstation policy exists |
  | Notification | Partial | Mobile push/voice assistants | Low/medium | Notify auto; call only urgent/approved | Add
  notification policy |
  | Vision/screen | Gateway/browser screenshots | Anthropic screenshot tool | Medium | Auto in dedicated, ask on
  personal sensitive apps | Add screenshot retention policy |
  | Credential | Should be blocked | Secret managers / delegated auth | Critical | Never expose raw secret to model |
  Build credential broker later |

  Voice / Call / Multimodal
  Minimum viable voice architecture:

  - Voice message arrives from mobile/Telegram/WhatsApp.
  - STT converts to text.
  - Sage treats it as normal message with surface=voice_message.
  - Sage can reply as text first; optional TTS later.
  - Call/urgent notification is only for approval, failure, or emergency.

  Defer:

  - Always-listening wake word.
  - Real-time phone calls with autonomous tool use.
  - Voice-driven terminal/file actions.

  Safety policy:

  - Voice can request a risky action, but cannot approve it silently.
  - Approval must show action summary, target, risk, expiry, and trace ID.
  - No raw audio stored unless user enables retention.

  Sage vs Studio Boundary
  Rules:

  - Sage can use personal computer, dedicated workstation, personal memory, personal Telegram/WhatsApp.
  - Studio Agents use customer/business channels and isolated agent memory.
  - Studio Agents may use My Computer only for internal/private agents with explicit admin policy.
  - Customer-facing agents must not access Sage private memory, owner local files, owner personal channels, or owner
    browser profile.
  - Dedicated Agent Workstation can be assigned to Sage or a Studio agent, but not both without explicit partitioning.

  Runtime/channel defaults:
  | Runtime | Sage | Studio internal | Studio customer-facing |
  |---|---|---|---|
  | Text Agent | Yes | Yes | Yes |
  | Cloud Computer | Optional | Yes | Yes with quota |
  | My Computer | Yes | Internal only | No by default |
  | Dedicated Workstation | Yes | Possible with binding | Only if isolated tenant workstation |
  | Self-Hosted | Later | Yes | Yes with node policy |

  Boundary enforcement mechanism:
  - Add a server-side AgentRuntimePolicyStore keyed by workspace_id, agent_id, runtime_mode, channel_lane, and audience
    (owner_internal, internal_private, customer_facing).
  - Sage policies are owner-scoped and may reference Sage memory, owner personal channels, and owner/dedicated
    workstation profiles.
  - Studio policies are agent-scoped and may reference only agent memory, customer/business channels, and explicitly
    granted runtime bindings.
  - Customer-facing Studio Agents cannot bind to owner personal channels, owner browser profiles, owner local files, or
    Sage private memory.
  - Raw request payload, context_hints, and frontend state cannot override runtime_mode, channel_lane, runtime_node_id,
    policy_id, or memory visibility.
  - Tests must include crafted payloads that attempt to use Sage memory, owner files, or owner personal channels from a
    Studio customer-facing agent.

  Risk Assessment
  | Severity | Risk | Current concern | Fix |
  |---|---|---|---|
  | P0 | Runtime identity lies | Previously fixed areas must stay covered by tests | Keep no fallback tests mandatory |
  | P0 | Local computer too broad | No single policy/profile object yet | Add AgentComputerPolicy/Profile |
  | P0 | Risky sends without approval | Gateway/Sage have gates, but workstation-level taxonomy missing |
  CapabilityRiskClassifier |
  | P1 | Asks too often | No approval memory | Scoped ApprovalMemory |
  | P1 | Trace gaps | Gateway/Sage transparency exists but not all workstation decisions modeled | Add workstation
  trace events |
  | P1 | Secret leakage | Redaction exists, but computer screenshots/files are high-risk | Screenshot/file retention
  policy |
  | P1 | Sage/Studio boundary drift | Multiple memory/channel surfaces | Hard policy tests |
  | P1 | Sage Cloud Computer bypass | Sage could route to cloud runtime without workstation policy | Require AgentComputerPolicy + CapabilityRiskClassifier for Sage local and cloud computer actions |
  | P1 | Risk-classifier fast-path drift | Cached decision for one path/URL/channel could be reused for a different target | Make classifier decisions non-cacheable unless target, actor, policy_version, and action hash all match |
  | P1 | Extension/system config changes | Installs and permission changes are more dangerous than generic file writes | Add capability classes for install_software, install_extension, change_system_setting, change_permission |
  | P1 | Cloud storage ambiguity | Dropbox/Drive/iCloud can look like file, browser, or connector work | Add cloud_storage_access as a distinct risk class |
  | P2 | Voice UX | Not core yet | Voice message first, calls later |
  | P3 | Enterprise RBAC | Needed later | Defer until pilot proves workstation mode |

  Enterprise Security & Reliability Gate
  This gate must be completed before UI polish or broad Agent Workstation rollout. The workstation policy layer depends
  on reliable auth, reliable Gateway startup, reliable downstream calls, and observable failures.

  Verified P0 findings:
  | # | Issue | Status | Evidence | Required fix |
  |---|---|---|---|---|
  | 1 | Live Google OAuth credentials on disk | Real | backend/.env:3-4 | Rotate the Google OAuth client secret if exposed, then move local secrets to documented local-only env handling. Do not print values in logs or reports. |
  | 2 | Broker/JWT secrets in plaintext on disk | Real | .orion-stack/stack.env:30-33 | Rotate broker and JWT secrets if exposed. Keep local dev secrets out of commits and add startup warnings for placeholder/unsafe secrets outside local/test. |
  | 3 | Downstream circuit breakers missing | Partial | tool_broker_guard_service.py exists for broker calls, but JWKS/Expo/audio/provider calls lack shared breaker/retry | Add a small shared retry/circuit-breaker helper for outbound dependencies. Do not weaken existing tool broker guards. |
  | 4 | JWKS fetch has no retry/stale fallback | Real | server_modules/auth.py:_fetch_provider_jwks uses one requests.get call | Add retry with bounded backoff, timeout, stale-cache fallback, and auth tests. Fail closed only after retry/stale paths are exhausted. |
  | 5 | Gateway starts channels before cloud WebSocket/control-plane loop | Real | empyralis-gateway/src/index.ts starts personalChannelRuntimes before client.run | Start the cloud/control-plane connection first, then start channel runtimes only after readiness. Block first outbound publish until ready. |
  | 6 | Silent exception swallowing in critical paths | Real | Many except Exception: pass sites across auth, gateway, vault, DB, run recovery, memory/export paths | Target critical paths only. Replace silent pass with explicit best-effort comments, structured logging, audit events, or raised safe errors. |

  Security/reliability commit plan:
  | Commit | Scope | Files likely touched | Tests | Acceptance |
  |---|---|---|---|---|
  | A | Secrets handling and startup validation | runtime_config.py, auth/jwt secret config, docs/runbook if needed | config tests | No placeholder/broker/JWT secret is accepted outside local/test; secret values are never printed. |
  | B | Shared downstream resilience helper | new server_modules/downstream_resilience_service.py or similar | new unit tests | Retry/backoff/breaker behavior is deterministic and reusable. |
  | C | JWKS resilience | server_modules/auth.py, auth tests | test_auth*.py focused | Transient JWKS failure retries; stale valid JWKS can be used; complete outage returns safe 503. |
  | D | Gateway startup sequencing | empyralis-gateway/src/index.ts, Gateway TS tests | tsc + node --test | Personal channels cannot publish before cloud/control-plane readiness. |
  | E1 | Targeted silent-exception cleanup: small critical files | routes_gateway.py, vault_store.py, db.py, memory/export paths | focused tests per touched path | Critical failures are visible in logs/audit or safely propagated; no broad refactor. |
  | E2 | Targeted silent-exception cleanup: large-file triage | auth.py and run_service.py only where failures affect auth, run recovery, billing evidence, memory export, DB init, or vault permissions | focused tests for each changed path | Scope is acknowledged as larger; do not attempt whole-file cleanup. |
  | E3 | Secret-free event assertions | audit/transparency/activity emission points and tests | redaction/secret-free tests | Add source-level _secrets_free() assertions before persistence, not only grep after the fact. |
  | F | Full verification | no feature code | backend focused sweep, Gateway TS, frontend typecheck if touched | Platform is safe enough to resume UI polish/workstation rollout. |

  Enterprise stop conditions:
  - Any secret value appears in a report, test output, activity event, audit event, or committed file.
  - Any production/staging startup accepts placeholder JWT/broker secrets.
  - Any auth provider key fetch outage fails all users without retry or valid stale-cache path.
  - Any personal channel can publish before Gateway cloud/control-plane readiness.
  - Any critical run recovery, billing evidence, memory export, DB init, or vault permission failure is silently ignored.

  Relationship to Agent Workstation:
  - AgentComputerProfile and AgentComputerPolicy should not ship to users until these P0 reliability gates are closed.
  - Gateway startup sequencing is directly required for Personal Computer Mode and Dedicated Workstation Mode.
  - Downstream resilience is required before Sage can depend on providers, JWKS, notifications, STT/TTS, or channel sends.
  - Silent exception cleanup is required before approval, audit, retention, and recovery can be trusted.

  Correct Build Order And Current Status
  The architecture direction is still correct, but the source of truth must now reflect implementation progress. Phases
  0-11 are complete. The next gap is end-to-end certification: a real closed-pilot trace must prove the complete
  connected-computer lifecycle after the voice/notification policy boundary.

  Build order:
  | Phase | Work | Status | Evidence | Gate |
  |---|---|---|---|---|
  | 0 | Enterprise Security & Reliability Gate | Done | dffcb7137 | Secrets, auth-provider resilience, downstream circuit breakers, Gateway startup sequencing, and critical silent failures are fixed. |
  | 1 | AgentComputerPolicy | Done | 027e96bfd | The policy defines autonomy mode, auto/ask/block rules, filesystem scope, domain allowlist, terminal policy, external-send policy, screenshot retention, and cloud-storage policy. |
  | 2 | AgentComputerProfile | Done | b1d8d9da | The computer Sage can use is persisted, scoped, health-checked, and references policy_id. It describes the machine; it does not own autonomy mode. |
  | 3 | CapabilityRiskClassifier | Done | d14a48103 | Every tool/computer/channel action gets a deterministic risk decision before Gateway execution. |
  | 4 | Enforce policy before Gateway execution | Done | b906b2366 | Gateway actions hit policy, risk classification, approval, kill switch, quota, and audit checks. |
  | 5 | Approval memory | Done | 6431281bc | Sage/Gateway can remember narrow, expiring approvals without granting blanket trust. |
  | 6 | Approval Decision Orchestrator | Done | 6626a8acf | One shared service returns allow/approval_required/block plus approval-card payload, trace metadata, audit visibility, and remembered-rule status. |
  | 7 | Sage Connected Computer Routing | Done | 1d79a5e51 | Sage write/execute intents route through the orchestrator before approvals are issued; approval cards include risk, capability, target scope, and secret-free decision metadata. |
  | 8 | Studio + Apps Boundary | Done | 35da6e3f0 | Studio Agents, mini-app URL/app surfaces, marketplace/app installs, and raw test-turn payloads cannot request Sage private memory, personal channels, owner files, or connected computers by raw payload. |
  | 9 | Connected Computers UI | Done | 66c4cac80 | Users see connected computers, dedicated computers, and cloud computers; normal UI does not expose Gateway/runtime internals. |
  | 10 | Dedicated Computer Setup | Done | f88966884 | Mac mini/VM/self-hosted machine enrollment, profile binding, health checks, session readiness, and kill/revoke behavior. |
  | 11 | Voice/Notification Policy | Done | 4cf48a6ac | Voice messages become normal Sage tasks; voice/notification surfaces cannot silently approve risky actions or carry approval tokens. |
  | 12 | End-to-End Certification | Next | needed after all above | Real trace proves policy classification, approval, Gateway/cloud execution, audit, transparency, and kill switch. |

  Phase 0 Implementation Plan
  | Commit | Scope | Files likely touched | Tests | Acceptance |
  |---|---|---|---|---|
  | A | Secret handling and startup validation | runtime_config.py, jwt/auth config, docs/runbook if needed | config/security tests | Unsafe placeholder/broker/JWT secrets are rejected outside local/test. No secret values are printed or committed. |
  | B | Shared downstream resilience helper | new server_modules/downstream_resilience_service.py or similar | helper unit tests | Retry/backoff/circuit-breaker behavior is deterministic, bounded, and reusable. |
  | C | JWKS retry + stale fallback | server_modules/auth.py, auth tests | test_auth*.py focused | Transient JWKS failure retries; valid stale JWKS can be used; complete outage returns safe 503. |
  | D | Gateway startup sequencing | empyralis-gateway/src/index.ts, Gateway tests | tsc + node --test | Personal channel runtimes do not start/publish until cloud/control-plane readiness is established. |
  | E1 | Targeted silent-exception cleanup: small critical files | routes_gateway.py, vault_store.py, db.py, memory/export paths | focused tests per touched path | Critical failures are logged/audited/propagated; best-effort failures are explicitly marked and observable. |
  | E2 | Targeted silent-exception cleanup: large-file triage | auth.py and run_service.py only for auth/run recovery/billing evidence/memory export/DB init/vault permission failures | focused tests per changed path | The large-file asymmetry is handled intentionally; no whole-file refactor. |
  | E3 | Secret-free event assertions | audit/transparency/activity emission points | redaction/secret-free tests | Secret leaks are blocked at persistence source, not only caught by grep after the fact. |
  | F | Verification | no feature code | backend focused sweep, Gateway TS, frontend typecheck if touched | Security/reliability gate is clean enough to start workstation autonomy work. |

  Phase 0 coding-agent prompt:
  Implement Enterprise Security & Reliability Gate before Agent Workstation.
  Do not build AgentComputerProfile yet.
  Do not build UI.
  Do not build voice.
  Do not add channels.
  Fix only:
  1. Secret handling/startup validation.
  2. Shared downstream resilience helper.
  3. JWKS retry + stale fallback.
  4. Gateway startup sequencing.
  5. Targeted silent-exception cleanup in critical paths.
  Run focused tests after each commit.
  Do not weaken existing Gateway/Sage safety.
  Do not print secrets.
  Do not commit .env values.

  Agent Workstation Implementation Plan
  Resume at Phase 12.
  | Phase | Work | Files to inspect/add | Tests | Acceptance |
  |---|---|---|---|---|
  | 6 | Approval Decision Orchestrator | done in agent_computer_approval_decision_service.py | allow/ask/block, remembered-scope, kill override, secret-free payloads | One canonical product-level decision exists for connected-computer actions. |
  | 7 | Sage Connected Computer Routing | done in sage_agent_runtime_service.py | Sage risky-intent tests cover decision cards, communication send, terminal command, and redaction | Sage cannot create risky connected-computer approvals without the orchestrator. |
  | 8 | Studio + Apps Boundary | done in studio_app_boundary_service.py, app_bridge_service.py, mini_app_host_service.py, deployed_agent_test_turn_service.py, marketplace_distribution_service.py | crafted bypass tests for Sage memory/files/channels/computers | Studio/customer agents and mini-apps cannot touch owner-private resources by raw payload. |
  | 9 | Connected Computers UI | done in nav, Settings, Computers, Sage connectors, Studio runtime cards, Chat notices, Activity labels | frontend typecheck + user-facing string checks | UI explains connected/dedicated/cloud computers without exposing Gateway/runtime jargon in normal flows. |
  | 10 | Dedicated setup backend | done in dedicated_workstation_setup_service.py, routes_gateway.py, agent_computer_profile_service.py | Gateway route tests cover bind, ready/offline readiness, kill, clear-kill, revoke propagation | Mac mini/VM can be bound, health-checked, killed, revoked, and audited. |
  | 11 | Voice message -> Sage task + notification policy | done in voice_notification_policy_service.py, sage_chat_api.py | voice text path and approval notification tests | Voice becomes a normal Sage turn; risky actions still need explicit approval. |
  | 12 | E2E certification | closed-pilot smoke harness | full trace with connected computer action | Trace shows risk, approval, remembered rule if used, execution, audit, transparency, and kill. |

  Stop conditions:

  - Any action path can bypass CapabilityRiskClassifier.
  - Any raw request can override computer profile/policy.
  - Any Studio customer agent can access Sage private memory/files.
  - Any production path falls back to in-memory/cloud/local silently.

  Exact Next Implementation Recommendation
  Build Phase 12 now:

  End-to-End Certification

  The voice/notification boundary is now in place. The next step is to run and capture a complete real trace proving
  policy classification, approval, Gateway/cloud execution, audit, transparency, and kill switch after all workstation
  phases.

  Final verdict: RESUME AT PHASE 12. Do not claim workstation launch readiness until a real certification trace is
  captured after Phase 11.

  Sources used: OpenAI Agents SDK tracing/guardrails docs, Anthropic Computer Use docs, Microsoft Copilot Studio
  activity docs, Google Gemini/Vertex Agent Platform docs, LangSmith observability/masking docs, CrewAI docs, and local
  Empyralis/OpenClaw artifacts.
