# OpenClaw vs Empyralis Sage — Gap Analysis

Date: 2026-05-30
OpenClaw version: 2026.5.27
Empyralis branch: feature/website-portal

## Summary

OpenClaw and Empyralis are architecturally different products solving overlapping problems. OpenClaw is a **self-hosted, single-user AI assistant gateway** — a CLI-driven daemon that connects messaging channels and runs agents locally. Empyralis is a **multi-tenant, cloud-first platform** — a web-based workspace for building, deploying, and governing AI agents.

The gap analysis below compares capability areas head-to-head and identifies what Empyralis Sage needs to reach parity.

---

## Capability Comparison Matrix

### CHAT / CONVERSATION

| Capability | OpenClaw | Empyralis Sage | Gap |
|---|---|---|---|
| Multi-turn conversation | ✅ | ✅ | — |
| Streaming responses | ✅ | ✅ | — |
| Multi-channel inbox | ✅ 20+ channels unified | ✅ Personal Telegram/WhatsApp plus Signal/iMessage/WeChat through selected Agent Computer; Slack/Discord live when configured; Email/Web Chat/WhatsApp Business are not all launch-ready | OpenClaw has more live channel breadth; Sage has stricter personal-vs-business lane separation |
| Session model | ✅ Per-peer, per-channel, per-group isolation modes | ✅ Thread-based with workspace scoping | OpenClaw's session isolation is more granular |
| Session lifecycle | ✅ Daily reset, idle reset, manual reset, retention pruning | ❌ No auto-reset or idle pruning exposed | **GAP** |
| Slash commands | ✅ 15+ built-in commands (/status, /new, /reset, /think, /verbose, /usage, etc.) | ✅ Skills-based slash command detection | OpenClaw has more built-in, Sage relies on skills |
| Identity linking | ✅ Cross-channel identity merging | ❌ Not present | **GAP** |
| Typing indicators | ✅ | ❌ Not present | **GAP** |
| Message send via CLI | ✅ `openclaw message send` | ❌ No CLI message send | **GAP** (platform is web-only) |
| Tool use in conversation | ✅ Full tool loop with streaming | ✅ Full tool loop with configurable iterations | — |
| Thinking/reasoning levels | ✅ off/minimal/low/medium/high/xhigh/adaptive/max | ✅ Supported for o1/o3/DeepSeek-R1/Gemini | OpenClaw has more granular levels |

### MEMORY

| Capability | OpenClaw | Empyralis Sage | Gap |
|---|---|---|---|
| Long-term memory file | ✅ MEMORY.md (plain Markdown) | ✅ Soul.md, Identity.md, Heartbeat.md | — |
| Daily memory notes | ✅ `memory/YYYY-MM-DD.md` | ❌ Not present | **GAP** |
| Semantic vector search | ✅ Bundled memory-core with embeddings | ✅ Knowledge RAG with LanceDB + hash fallback | — |
| Memory promotion | ✅ Weighted scoring (frequency, relevance, recency, consolidation) | ❌ Not present | **GAP** |
| Background consolidation ("dreaming") | ✅ Light → REM → Deep pipeline with cron scheduling | ❌ Not present | **GAP** |
| Memory search CLI | ✅ `openclaw memory search` | ❌ No CLI, API-only | **GAP** |
| Memory status/inspection | ✅ `openclaw memory status --deep` | ❌ Not present | **GAP** |
| Action-sensitive memories | ✅ Capture approval boundaries, time constraints | ❌ Not present | **GAP** |
| Conversation memory policy | ✅ Configurable per agent | ✅ Five profiles (direct_chat, external_channel, durable_run, specialist_private, owner_sage_view) | Sage has more structured policy profiles |

### TOOLS / ACTIONS

| Capability | OpenClaw | Empyralis Sage | Gap |
|---|---|---|---|
| Web search | ✅ 15+ providers (Brave, Tavily, Perplexity, etc.) | ✅ `web__search` tool | OpenClaw has more search provider options |
| Web fetch | ✅ URL → markdown | ✅ `web__fetch` tool | — |
| Code execution | ✅ `exec` tool with security policies | ✅ `shell__exec` via gateway | — |
| File read/write/edit | ✅ Full file tools | ✅ Local file tools via gateway | — |
| Image generation | ✅ Shared capability | ✅ `generate_image` tool | — |
| Video generation | ✅ | ❌ Not present | **GAP** |
| Music generation | ✅ | ❌ Not present | **GAP** |
| TTS / voice | ✅ Multiple TTS providers + voice transcription | ✅ Voice task API | — |
| Subagent delegation | ✅ `subagents` tool | ✅ Durable run handoff + specialist agents | Sage has more structured delegation |
| Diff/patch | ✅ `apply-patch` tool | ❌ Not present | **GAP** |
| Token usage tracking | ✅ `/usage` command | ✅ Credit ledger + metering | — |
| Task orchestration | ✅ TaskFlow (`openclaw tasks flow`) | ✅ Workflow Builder (visual, AI-powered) | Sage's workflow builder is more ambitious |
| Workflow pipeline | ✅ Lobster workflow tool | ✅ Full workflow engine with 15 node types | Sage exceeds OpenClaw here |
| ACP bridge (IDE integration) | ✅ Codex, Claude Code, Zed | ❌ Not present | **GAP** |
| Loop detection | ✅ Built-in | ✅ Duplicate tool signature detection | — |

### BROWSER / COMPUTER

| Capability | OpenClaw | Empyralis Sage | Gap |
|---|---|---|---|
| Browser automation | ✅ Full CLI (`openclaw browser`) | ✅ Gateway browser sessions | — |
| Managed Chrome profile | ✅ | ✅ cloud browser + local gateway | — |
| User Chrome (existing) | ✅ CDP attach to signed-in Chrome | ❌ Not present | **GAP** |
| Tab management | ✅ Create, select, label, close, focus | ✅ Via gateway browser sessions | — |
| UI automation | ✅ Click, type, press, hover, scroll, drag, select, fill | ✅ Click, type, press, open, launch, capture | — |
| AI-readable snapshots | ✅ | ❌ Not present | **GAP** |
| Screenshots | ✅ Full-page, element, label overlays | ✅ Screen capture via gateway | — |
| JavaScript evaluation | ✅ `evaluate` with ref-based elements | ❌ Not present (blocked by policy) | **GAP** (Sage blocks JS eval for safety) |
| File upload/download in browser | ✅ | ✅ Via gateway | — |
| Dialog handling | ✅ Accept/dismiss | ❌ Not present | **GAP** |
| State emulation | ✅ Viewport, offline, dark/light, timezone, locale, geolocation, device, headers | ❌ Not present | **GAP** |
| Cookies & storage | ✅ Get/set/clear cookies, localStorage, sessionStorage | ❌ Not present | **GAP** |
| Console log capture | ✅ Browser console log capture by level | ❌ Not present | **GAP** |
| PDF export | ✅ | ❌ Not present | **GAP** |
| Remote browser via node | ✅ Node host proxy | ✅ Gateway protocol + cloud computer | — |
| Headless mode | ✅ | ✅ Cloud browser | — |
| SSRF protection | ✅ | ✅ External content guard | — |
| CDP profiles | ✅ Custom CDP endpoints | ❌ Not present | **GAP** |

### APPROVALS

| Capability | OpenClaw | Empyralis Sage | Gap |
|---|---|---|---|
| Exec approvals | ✅ Per-host `exec-approvals.json` | ✅ Approval service with 15-min TTL tokens | — |
| Security levels | ✅ `full`, `strict`, `off` | ✅ Five autonomy modes (read_only → emergency_stop) | Sage has more granular modes |
| Allowlists | ✅ Pattern-based per agent or global | ✅ Domain allowlists, filesystem scope | — |
| Multi-host approvals | ✅ Local, gateway, node | ✅ Workspace-scoped | — |
| Presets | ✅ `yolo`, `cautious`, `deny-all` | ❌ No presets, all manual config | **GAP** |
| MCP approval relay | ✅ `permissions_list_open` / `permissions_respond` | ❌ Not via MCP | **GAP** |
| Delivery approvals | ✅ Message sending hooks | ✅ `channel_send_draft` approval flow | — |
| Policy sync | ✅ `exec-policy show/preset/set` | ❌ No policy sync CLI | **GAP** |

### SKILLS

| Capability | OpenClaw | Empyralis Sage | Gap |
|---|---|---|---|
| Skill format | ✅ AgentSkills-compatible (SKILL.md + YAML) | ✅ Skill registry with curated + installed skills | — |
| Skill distribution | ✅ ClawHub registry + Git + local | ✅ Marketplace (Discover) with install flow | Sage has a more governed distribution model |
| Skill tiers | ✅ 6 tiers (workspace → bundled) | ✅ Workspace-scoped skill registry | OpenClaw has more tier granularity |
| Skill search | ✅ `openclaw skills search` | ✅ Discover marketplace with filters | — |
| Skill eligibility check | ✅ Auto (env, binaries, config, OS) | ✅ Status reporting (ready/needs_setup/unsupported) | — |
| Per-agent skill allowlists | ✅ | ❌ Per-workspace only, not per-agent | **GAP** |
| Global skills | ✅ `--global` flag | ❌ Not present | **GAP** |
| Skill update | ✅ `openclaw skills update` | ❌ Manual reinstall only | **GAP** |
| Built-in skills | ✅ Via bundled plugins | ✅ 4 curated skills (1Password, Apple Notes, Reminders, tmux) | — |

### CRON / SCHEDULING

| Capability | OpenClaw | Empyralis Sage | Gap |
|---|---|---|---|
| Cron jobs | ✅ `openclaw cron` full CLI | ✅ Heartbeat API + bounded scheduler | — |
| Session modes | ✅ main, isolated, current, session:id | ✅ Durable runs + heartbeat tasks | — |
| Scheduling syntax | ✅ Standard cron + `--at` for one-shots + timezone | ✅ Cron schedule_kind | — |
| Delivery options | ✅ announce, no-deliver, webhook, channel routing | ✅ announce delivery mode | OpenClaw has more delivery options |
| Retry backoff | ✅ Exponential (30s → 60m) | ❌ Not present | **GAP** |
| Run inspection | ✅ list, show, runs, get | ✅ Queue overview in heartbeat snapshot | Sage uses different model |
| Edit jobs | ✅ Edit delivery, model, agent, session | ❌ Jobs are configuration, not editable live | **GAP** |
| Lightweight context | ✅ `--light-context` flag | ❌ Not present | **GAP** |
| Pre-flight checks | ✅ Provider preflight for isolated runs | ❌ Not present | **GAP** |
| Failure delivery routing | ✅ Per-job + global failure destination | ❌ Not present | **GAP** |
| Run retention | ✅ Configurable session retention + log pruning | ❌ Not configurable at this granularity | **GAP** |

### SANDBOX / ISOLATION

| Capability | OpenClaw | Empyralis Sage | Gap |
|---|---|---|---|
| Sandbox modes | ✅ off, non-main, all | ✅ Execution sandbox service | — |
| Backends | ✅ Docker, SSH, OpenShell | ❌ No container sandbox, only policy-based isolation | **GAP** |
| Per-agent sandboxing | ✅ | ❌ Per-workspace only | **GAP** |
| Sandbox inspection | ✅ `openclaw sandbox explain/list` | ❌ Not present | **GAP** |
| Auto-prune | ✅ Idle time + max age | ❌ Not present | **GAP** |
| Docker configuration | ✅ Image, prefix, options | ❌ Not present | **GAP** |

### GATEWAY / NETWORKING

| Capability | OpenClaw | Empyralis Sage | Gap |
|---|---|---|---|
| Gateway daemon | ✅ Long-lived WebSocket server | ✅ Gateway protocol service | Different architecture — OpenClaw is the daemon, Sage connects to external gateways |
| Service management | ✅ launchd/systemd/schtasks | ❌ No OS-level service management | **GAP** (by design — Empyralis is cloud-first) |
| Bind modes | ✅ loopback, lan, tailnet, auto, custom | ✅ Gateway pairing + registration | — |
| Auth modes | ✅ token, password, trusted-proxy, none | ✅ API key + cookie sessions | — |
| WebSocket RPC | ✅ Typed with JSON Schema | ✅ Gateway protocol (WebSocket) | — |
| Bonjour/mDNS discovery | ✅ | ❌ Not present | **GAP** |
| Tailscale integration | ✅ | ❌ Not present | **GAP** |
| Canvas host | ✅ Agent-editable HTML/CSS/JS | ❌ Not present | **GAP** |
| Health endpoints | ✅ /healthz, /readyz | ✅ /healthz route | — |
| Control UI | ✅ Browser dashboard | ✅ Full web platform (exceeds OpenClaw) | Sage exceeds OpenClaw |
| WebChat | ✅ Static UI via Gateway WS | ✅ Full web chat pane | Sage exceeds OpenClaw |
| Remote pairing | ✅ Device-based + CIDR auto-approve | ✅ Channel pairing codes | — |
| Diagnostics export | ✅ Support zip with manifest, config, logs | ❌ No diagnostics bundle | **GAP** |

### AGENTS / WORKSPACES

| Capability | OpenClaw | Empyralis Sage | Gap |
|---|---|---|---|
| Multi-agent | ✅ Multiple isolated agents | ✅ Full Agent Studio with roster | Sage exceeds OpenClaw (studio, templates, deploy, inbox, analytics) |
| Agent workspaces | ✅ Per-agent cwd + bootstrap files | ✅ Per-workspace scoping | — |
| Agent identity | ✅ Name, theme, emoji, avatar | ✅ Name, description, status, launch readiness | — |
| Agent runtimes | ✅ Pi (embedded), Codex, Claude CLI, ACP | ✅ Native platform agents + connected external agents | Sage's native agent model is deeper |
| Agent auth profiles | ✅ Per-agent auth store | ✅ Workspace-level credential management | OpenClaw is more granular |
| External agent support | ✅ ACP/ACpx agents | ✅ Connected external agents (OpenClaw, Hermes, NemoClaw, MCP, A2A, custom HTTP) | Sage has a broader external agent surface |
| Agent heartbeat | ✅ HEARTBEAT.md | ✅ Heartbeat API + scheduler | — |

### PROVIDER / MODEL

| Capability | OpenClaw | Empyralis Sage | Gap |
|---|---|---|---|
| Provider count | ✅ 35+ providers | ✅ 10+ (OpenAI, Anthropic, Gemini, DeepSeek, Ollama, Groq, xAI, Mistral, Qwen, OpenRouter, Vertex, Azure) | OpenClaw has more provider plugins |
| Model discovery | ✅ `openclaw models scan` (OpenRouter catalog) | ✅ Provider catalog service | — |
| Model fallbacks | ✅ Ordered retry logic | ✅ Provider fallback chain | — |
| Model aliases | ✅ `openclaw models aliases` | ✅ `resolve_requested_model()` | — |
| Auth profiles | ✅ OAuth + API key + token per provider | ✅ OAuth + API key per workspace | — |
| Self-hosted providers | ✅ vLLM, SGLang, Ollama, any OpenAI-compatible | ✅ Ollama + custom OpenAI-compatible | — |
| Usage/quota tracking | ✅ Provider quota snapshots | ✅ Credit ledger + usage metering | Sage's billing integration is deeper |
| Model ref format | ✅ `provider/model` | ✅ `provider/model` | — |

### SECURITY

| Capability | OpenClaw | Empyralis Sage | Gap |
|---|---|---|---|
| DM pairing | ✅ Pairing codes for unknown senders | ✅ Channel pairing service | — |
| Sender allowlists | ✅ Per-channel allowlists | ✅ Channel blocking policy | — |
| Bound-mode auth | ✅ Loopback-first enforcement | ✅ Workspace access enforcement (admin/viewer) | — |
| SecretRefs | ✅ Config-backed, no plaintext | ✅ Vault-backed secret_ref | — |
| Exec approvals | ✅ Per-host file | ✅ Approval tokens with TTL + SHA-256 integrity | — |
| Sandbox isolation | ✅ Docker/SSH/OpenShell | ✅ Policy-based isolation | Docker isolation is stronger |
| Kill switch | ❌ No explicit kill switch | ✅ `kill_switch_gate` per workspace + agent | Sage exceeds OpenClaw |
| Emergency stop | ❌ No explicit emergency stop | ✅ `AUTONOMY_EMERGENCY_STOP` | Sage exceeds OpenClaw |
| Security audit | ✅ `openclaw security audit` | ✅ Security audit service + transparency events | — |
| Secret redaction | ✅ At install time | ✅ Runtime redaction of model inputs + tool args | Sage's is more comprehensive |
| Response leak guard | ❌ Not present | ✅ `response_leak_guard_service` | Sage exceeds OpenClaw |
| Health safety | ❌ Not present | ✅ `healthguide_safety_service` | Sage exceeds OpenClaw |

### OBSERVABILITY

| Capability | OpenClaw | Empyralis Sage | Gap |
|---|---|---|---|
| Status command | ✅ `openclaw status` with --deep, --usage, --all | ✅ Health diagnostics | — |
| Doctor | ✅ `openclaw doctor` (inspect, fix, lint) | ✅ `doctor_gate` + health diagnostics | OpenClaw's doctor is more interactive |
| Gateway profiling | ✅ Startup/restart traces | ❌ Not present | **GAP** |
| Diagnostics timeline | ✅ JSONL startup diagnostics | ❌ Not present | **GAP** |
| Diagnostics export | ✅ Support zip | ❌ Not present | **GAP** |
| Stability recorder | ✅ Diagnostic stability events | ❌ Not present | **GAP** |
| Logs | ✅ Channel logs, CLI backend logs, raw stream | ✅ Transparency timeline + activity ledger | Sage's transparency model is more structured |
| Transparency events | ❌ Not a structured transparency system | ✅ Full AgentTransparencyEvent lifecycle (message_received → memory_loaded → tool_started → tool_completed → final_response_sent) with audience-capped views | Sage exceeds OpenClaw |
| Trace system | ✅ Session trajectory export | ✅ Rich trace model with plan items, tool steps, screenshots, reasoning summaries | Sage exceeds OpenClaw |
| Plugin diagnostics | ✅ `OPENCLAW_PLUGIN_LOAD_DEBUG=1` | ❌ Not applicable (no plugin system) | — |
| Update checks | ✅ `openclaw status` shows updates | ❌ Not present | **GAP** |

### PLUGIN SDK / EXTENSIBILITY

| Capability | OpenClaw | Empyralis Sage | Gap |
|---|---|---|---|
| Plugin system | ✅ Full plugin SDK (channels, providers, tools, hooks, memory) | ❌ No plugin system | **MAJOR GAP** |
| Plugin marketplace | ✅ ClawHub + npm + Git + local | ✅ Discover marketplace (agent templates, skills, connectors, bundles, apps) | Different model — Sage's marketplace is for platform packages, not runtime plugins |
| MCP integration | ✅ MCP server (expose channels) + MCP client (outbound servers) | ✅ MCP connector support | — |
| ACP bridge | ✅ IDE/editor integration | ❌ Not present | **GAP** |
| Hooks system | ✅ Event-driven (command:new, gateway:startup, llm_input, llm_output, agent_end, etc.) | ❌ No hook system | **GAP** |
| Plugin scaffold | ✅ `openclaw plugins init` | ❌ Not present | **GAP** |
| Plugin build/validate | ✅ | ❌ Not present | **GAP** |

---

## CRITICAL GAPS — What Empyralis Sage Must Add

### Tier 1 — Immediate Parity Targets

These are capabilities OpenClaw has that Sage completely lacks and would materially improve the product:

1. **Background Memory Consolidation ("Dreaming")**
   - OpenClaw's Light → REM → Deep pipeline automatically promotes short-term memories into durable MEMORY.md entries
   - Sage has structured memory but no automated consolidation
   - **Action:** Build a `memory_consolidation_service` that runs on a cron, scores memory entries by frequency/relevance/recency, and promotes qualified entries

2. **Sandbox Isolation (Docker/SSH)**
   - OpenClaw sandboxes non-main sessions in Docker, SSH, or OpenShell
   - Sage has policy-based isolation but no container sandbox
   - **Action:** Integrate Docker sandbox as an execution backend for untrusted agent runs

3. **Browser State Emulation**
   - OpenClaw can emulate viewport, offline mode, dark/light, timezone, locale, geolocation, device, custom headers
   - Sage's browser automation lacks these
   - **Action:** Add state emulation controls to the gateway browser runtime

4. **IDE Integration (ACP Bridge)**
   - OpenClaw bridges into Codex, Claude Code, and Zed via ACP
   - Sage has no IDE integration
   - **Action:** Implement ACP client in the gateway protocol so Sage can drive IDE-based agents

5. **Plugin/Hook System**
   - OpenClaw has a full plugin SDK with event hooks
   - Sage has no plugin system — all extensibility is through the marketplace
   - **Action:** Design a plugin architecture for channel plugins, tool plugins, and conversation hooks

### Tier 2 — Quality-of-Life Parity

6. **Session Lifecycle Management**
   - Auto-reset, idle reset, retention pruning
   - **Action:** Add configurable session lifecycle policies

7. **Exec Approval Presets**
   - `yolo`, `cautious`, `deny-all` quick presets
   - **Action:** Add approval presets to autonomy mode configuration

8. **Cron Retry with Backoff**
   - Exponential backoff on consecutive failures
   - **Action:** Add retry policy to bounded scheduler

9. **Diagnostics Export**
   - Support zip with config, logs, stability bundle
   - **Action:** Build diagnostics export endpoint

10. **CLI Companion**
    - `openclaw` has a rich CLI for all operations
    - Sage is web-only
    - **Action:** Consider a lightweight CLI for power users (or integrate via the connected external agent protocol)

### Tier 3 — Differentiators Sage Already Has

These are areas where Sage exceeds OpenClaw:

- **Multi-tenant workspace model** (OpenClaw is single-user)
- **Agent Studio** with templates, deploy, inbox, analytics, business insights
- **Discover marketplace** with governed distribution, install eligibility, review queues
- **Visual workflow builder** (OpenClaw has TaskFlow/Lobster but no visual builder)
- **Transparency timeline** with audience-capped structured events
- **Kill switch + emergency stop** (OpenClaw has exec approvals but no platform-wide emergency stop)
- **Credit ledger + billing** (OpenClaw tracks usage but has no billing system)
- **External agent observation surface** (connect and observe OpenClaw itself inside the platform)

---

## External Agent Observation — How OpenClaw Connects to Empyralis

OpenClaw can already be connected to Empyralis as a `connected_external_agent` with provider kind `openclaw`. Here's what that gives you:

### Connection Flow
1. In Agent Studio, create a "Connected External Agent" with provider kind `openclaw`
2. Provide a manifest URL pointing to OpenClaw's manifest
3. Backend validates endpoints are HTTPS, normalizes the manifest
4. Admin clicks "Refresh manifest" → state transitions to `verified`

### What Can Be Observed
| OpenClaw Capability | Observable in Empyralis |
|---|---|
| Chat messages | ✅ Private proxy chat panel |
| Events / run history | ✅ `timeline` or `logs` display via events endpoint |
| Sub-agents | ✅ `cards` grid via sub_agents endpoint |
| Nodes / devices | ✅ `cards` grid via nodes endpoint |
| Generated artifacts | ✅ `artifact_list` display |
| Tools / actions | ✅ `table` or `cards` display |
| Skills | ✅ `table` display |
| Workflows | ✅ `cards` display |
| Knowledge sources | ✅ Status dots with type badges |
| Memory entries | ✅ Key-value entry display |

### What Cannot Be Observed (currently)
- OpenClaw's cron jobs (no `cron` capability in the manifest format)
- OpenClaw's dreaming/memory consolidation (no `memory_write` surface section support)
- OpenClaw's browser sessions (no `browser` capability in the manifest format)
- OpenClaw's plugin list (no `plugins` capability in the manifest format)

### Manifest Enhancement Needed
To fully observe OpenClaw, the manifest format should add these capabilities and section types:

```json
{
  "capabilities": ["chat", "events", "sub_agents", "nodes", "artifacts", "cron", "memory", "browser", "plugins"],
  "endpoints": {
    "cron": "https://openclaw.example.com/cron",
    "memory": "https://openclaw.example.com/memory",
    "browser_sessions": "https://openclaw.example.com/browser/sessions",
    "plugins": "https://openclaw.example.com/plugins"
  },
  "surface_sections": [
    { "id": "cron_jobs", "title": "Scheduled Jobs", "data_endpoint_ref": "cron", "display_kind": "table", "capability_required": "cron" },
    { "id": "browser_sessions", "title": "Browser Sessions", "data_endpoint_ref": "browser_sessions", "display_kind": "cards", "capability_required": "browser" },
    { "id": "installed_plugins", "title": "Plugins", "data_endpoint_ref": "plugins", "display_kind": "table", "capability_required": "plugins" }
  ]
}
```

---

## Open Recommendations

1. **Build memory consolidation** — this is OpenClaw's most distinctive capability and directly addresses the "agent feels alive" quality
2. **Add Docker sandbox** — essential for safe execution of untrusted agent code
3. **Implement ACP bridge** — makes Empyralis the control plane for IDE-based coding agents
4. **Extend the external agent manifest** — add cron, browser, memory, and plugin capability types so OpenClaw can be fully observed
5. **Add CLI companion** — even a minimal CLI would make Sage feel more powerful to developers
6. **Policy presets** — `cautious`, `balanced`, `yolo` presets would dramatically improve onboarding
