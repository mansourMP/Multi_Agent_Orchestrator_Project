# Empyralis -> Agentic Platform: Reality-Adjusted Transformation Analysis

> Updated for current platform state (2026-03-03): reliability first, then capability expansion.

---

## Where You Are Now (Reality Check)

Empyralis today is a **working agent platform foundation**, not yet AGI. Verified baseline:

| ✅ Working | What It Does |
|-----------|-------------|
| Runtime gateway | Single control plane for runs, policy, channels, memory, and approvals |
| Channel I/O | Telegram autopilot active and responding; WhatsApp path exists but not fully configured |
| Policy gates | Trust modes (`guarded`/`strict`/`auto`), action allowlists, approval workflows |
| Memory | Profile + session + domain memory with vector search (LanceDB) |
| Skills | Runtime skill injection across channels, Telegram skill menus |
| Local worker | Claims runs and executes through configured providers (`codex_cli` path verified) |
| Ops daemon | Localhost ops control with launchd support |
| Web surface | Control center, setup wizard, skills surface, local ops actions |

Current operational posture:
- Stack and connectors are usable for daily Telegram + web operation.
- Readiness is high but not complete (WhatsApp pending).
- Main reliability issue is operational consistency (startup/churn/runbook discipline), not core architecture absence.

**Still missing for AGI-like capability:**

| ❌ Missing | Why It Matters for AGI |
|-----------|----------------------|
| Multi-step autonomous planning | Agent can't decompose "plan my Q2 launch" into 15 subtasks and execute them |
| Tool ecosystem breadth | Limited to chat + basic connectors; no code execution, web browsing, file manipulation |
| Self-correction loops | Agent can't detect its own failures and retry with different strategies |
| Long-running task management | Everything is single-shot request→response; no multi-day workflows |
| Multi-agent coordination | Single worker, single brain; no specialist delegation |
| Knowledge graph / RAG | Memory is flat profile+session; no structured organizational knowledge |
| Enterprise multi-tenancy | No full org/workspace/team/RBAC enforcement model yet |
| Observability at scale | No robust cost/perf telemetry stack yet (only operational health/readiness tooling) |

---

## The AGI Capability Stack (What Needs to Exist)

Think of AGI capabilities as layers. Each layer builds on the one below:

```
┌─────────────────────────────────────────────────┐
│  L7: AUTONOMOUS OPERATIONS                       │
│  Self-healing, proactive suggestions, learning   │
├─────────────────────────────────────────────────┤
│  L6: MULTI-AGENT ORCHESTRATION                   │
│  Specialist agents, delegation, consensus        │
├─────────────────────────────────────────────────┤
│  L5: LONG-HORIZON TASK MANAGEMENT                │
│  Multi-day projects, checkpoints, resumption     │
├─────────────────────────────────────────────────┤
│  L4: DEEP TOOL ECOSYSTEM                         │
│  Code exec, web browse, file ops, APIs, DBs      │
├─────────────────────────────────────────────────┤
│  L3: PLANNING & REASONING ENGINE                 │
│  Multi-step decomposition, self-correction       │
├─────────────────────────────────────────────────┤
│  L2: KNOWLEDGE & MEMORY (Enterprise)             │
│  RAG, org knowledge, structured context          │
├─────────────────────────────────────────────────┤
│  L1: RUNTIME FOUNDATION (You have this)          │
│  Gateway, channels, policy, auth, worker         │
└─────────────────────────────────────────────────┘
```

**Empyralis today = strong L1.** The mission is to build L2–L7.

---

## Detailed Gap Analysis & Recommendations

### 1. 🧠 Planning & Reasoning Engine (L3) — **Critical**

**Current:** Single-shot prompt → single LLM call → single response.

**AGI Target:** User says "prepare a competitive analysis deck on 3 rivals" → agent decomposes into: research each rival, synthesize findings, draft deck outline, generate slides, review, deliver.

**What to Build:**

| Component | Description | Effort |
|-----------|-------------|--------|
| **Task Decomposer** | Takes user intent → produces a DAG of subtasks with dependencies | Medium |
| **Plan Executor** | Walks the DAG, executing each step, passing outputs forward | Medium |
| **Self-Correction Loop** | On failure, re-plans the failed subtask (max N retries with different strategy) | Medium |
| **Plan Persistence** | Store plans in runtime so they survive restarts, can be paused/resumed | Low |
| **Human-in-the-Loop Checkpoints** | At configurable points, pause and ask for approval before continuing | Low (you already have approval gates) |

**Architecture Suggestion:**
```
User Intent → Planner Agent (system prompt: decompose only)
                  ↓
            Task DAG (stored in runtime DB)
                  ↓
         Executor Loop (claims subtask → executes → stores result)
                  ↓
            On failure → Re-planner (adjusts remaining DAG)
                  ↓
            Final Assembly → Deliver to channel
```

**Key Insight:** Your existing `build_pack_result` in `orion_local_worker.py` already has pack-based execution. Extend this with a `plan` pack type that returns a DAG instead of a single result.

---

### 2. 🔧 Deep Tool Ecosystem (L4) — **Critical**

**Current:** Telegram I/O, Gmail, very limited tooling.

**AGI Target:** Agent can browse the web, execute code, read/write files, query databases, call any API, manipulate spreadsheets, generate images, etc.

**What to Build:**

| Tool Category | Examples | Priority |
|---------------|----------|----------|
| **Code Execution** | Sandboxed Python/JS/shell execution (Docker or E2B) | P0 |
| **Web Browsing** | Headless browser for research, form filling, data extraction | P0 |
| **File Operations** | Read/write/transform documents (PDF, DOCX, XLSX, CSV) | P0 |
| **Database** | Query PostgreSQL, SQLite, MongoDB with natural language | P1 |
| **API Gateway** | Universal REST/GraphQL caller with auth management | P1 |
| **Image/Media** | Generate images, process screenshots, OCR | P1 |
| **Calendar/Scheduling** | Full Google Calendar CRUD (needs OAuth scope fix) | P1 |
| **CRM/ERP** | Salesforce, HubSpot, SAP connectors | P2 |
| **Communication** | Slack, Teams, Discord, Email (full CRUD) | P1 |

**Architecture Suggestion:**

```python
# Tool Registry Pattern (add to runtime)
TOOL_REGISTRY = {
    "code_execute": {
        "handler": "tools.code_sandbox.execute",
        "risk_level": "high",
        "requires_approval": True,  # in guarded mode
        "sandbox": "docker",
        "timeout_seconds": 30,
    },
    "web_browse": {
        "handler": "tools.browser.browse",
        "risk_level": "medium",
        "requires_approval": False,
        "allowed_domains": ["*"],  # configurable
    },
    # ...
}
```

**Key Insight:** Your `runtime_policy.py` already has action risk levels and approval logic. Each tool just needs to register with the policy engine. The hard part is building reliable tool implementations, not the framework.

---

### 3. 📚 Knowledge & Memory System (L2) — **High Priority**

**Current:** LanceDB vector memory with profile/session/domain scoping. Basic.

**AGI Target:** Agent has deep organizational knowledge — knows your company's products, processes, competitors, team members, past decisions, and can retrieve relevant context for any task.

**What to Build:**

| Component | Description |
|-----------|-------------|
| **Document Ingestion Pipeline** | Upload PDFs, docs, spreadsheets → chunk → embed → index |
| **Multi-Source RAG** | Query across documents, conversations, web results simultaneously |
| **Knowledge Graph** | Entity-relationship graph (people, projects, decisions, products) |
| **Memory Hierarchy** | Working memory (current task) → Short-term (session) → Long-term (persistent) → Organizational (shared) |
| **Forgetting Policy** | Auto-archive stale memories, keep important ones weighted higher |
| **Memory API** | `POST /memory/ingest`, `POST /memory/query`, `GET /memory/graph` |

**Key Insight:** Your existing `ORION_MEMORY_ENABLED` and LanceDB setup is a good start. The main upgrades are: (a) document ingestion beyond chat, (b) structured entity extraction, and (c) cross-source retrieval.

---

### 4. ⏳ Long-Horizon Task Management (L5) — **High Priority**

**Current:** Each run is fire-and-forget. No concept of a "project" spanning multiple runs.

**AGI Target:** "Monitor competitor pricing daily for 2 weeks and alert me on changes" or "Draft, iterate, and publish our Q2 blog series (4 posts over 4 weeks)."

**What to Build:**

| Component | Description |
|-----------|-------------|
| **Project Model** | Groups related runs under a project with status tracking |
| **Scheduled Runs** | Cron-triggered runs (you have `.orion_weekly_schedules.json` — expand it) |
| **Checkpoint & Resume** | Save execution state at each step; resume from checkpoint after failure or pause |
| **Progress Reporting** | Auto-update channel with progress ("3/7 tasks complete, ETA: 2 hours") |
| **Deadline Awareness** | Agent understands time constraints and priority ordering |

---

### 5. 🤝 Multi-Agent Orchestration (L6) — **Medium Priority**

**Current:** Single worker, single "brain."

**AGI Target:** Specialist agents that are good at specific things — one for research, one for writing, one for code, one for data analysis — coordinated by an orchestrator.

**What to Build:**

| Pattern | Description |
|---------|-------------|
| **Agent Registry** | Define specialist agents with specific system prompts and tool access |
| **Orchestrator Agent** | Routes subtasks to the right specialist based on task type |
| **Agent Communication** | Agents can pass context and results to each other |
| **Parallel Execution** | Run independent subtasks simultaneously across multiple workers |
| **Consensus/Review** | One agent reviews another's output before delivery |

**Architecture:**
```
User → Orchestrator Agent
            ├── Research Agent (web browse + RAG tools)
            ├── Writer Agent (document generation tools)
            ├── Analyst Agent (code execution + data tools)
            └── Operations Agent (email + calendar + CRM tools)
```

**Key Insight:** Your current worker already has the claim/execute/complete loop. Multi-agent is essentially: multiple workers with different system prompts and tool permissions, managed by an orchestrator that is itself an agent.

---

### 6. 🏢 Enterprise Foundation — **P0 for Business**

**Current:** Local-first with basic auth modes (Codex/API-key), single-workspace default, and no full tenant/RBAC model.

**AGI Target:** SaaS-ready platform where teams deploy and manage AI agents with governance.

| Component | Description | Priority |
|-----------|-------------|----------|
| **Multi-Tenancy** | Org → Workspace → Members hierarchy with data isolation | P0 |
| **RBAC** | Owner / Admin / Member / Viewer roles with permission matrices | P0 |
| **SSO/OAuth** | Google, Okta, Azure AD sign-in | P0 |
| **Audit Trail** | Every action logged with who/what/when/why, exportable | P0 |
| **Usage Metering** | Track token usage, execution count, cost per workspace | P0 |
| **Billing** | Stripe integration, subscription tiers, usage-based pricing | P1 |
| **Rate Limiting** | Per-user, per-workspace, per-org limits | P0 |
| **Data Retention** | Configurable auto-delete policies, GDPR compliance | P1 |
| **API Keys** | Per-workspace API key management with scoping | P0 |
| **Secrets Vault** | Encrypted credential storage per workspace (upgrade from JSON file) | P0 |

> [!IMPORTANT]
> Your current `.orion_credentials_vault.json` is a JSON file on disk. For enterprise, this needs to be encrypted at rest, scoped per workspace, and audited on access.

---

### 7. 🔄 Autonomous Operations (L7) — **Future Differentiator**

This is what makes it feel like AGI:

| Capability | Description |
|-----------|-------------|
| **Proactive Suggestions** | "I noticed you haven't followed up with Client X in 5 days. Want me to draft an email?" |
| **Self-Healing** | Agent detects its own degraded state and fixes it (restart services, refresh tokens, etc.) |
| **Learning from Feedback** | When user corrects output, agent adjusts behavior for future similar tasks |
| **Pattern Recognition** | "You always ask for a status report on Mondays. Want me to auto-generate it?" |
| **Anomaly Detection** | "Your API costs jumped 3x today. Here's why: [analysis]" |

---

## Prioritized Roadmap (Reality-Adjusted)

The old week-by-week estimates were too optimistic and created false expectations.
Use **gates** instead of calendar promises.

### Gate A: Operational Stability (must pass before feature expansion)
1. Deterministic startup/stop behavior with no stale PID confusion.
2. Single-command operator flow (`orion go --watch`) stable across repeated runs.
3. Clear error reporting for auth/connectors (no silent fallback confusion).
4. Telegram + web daily flow works without terminal debugging.

Exit criteria:
- 7 consecutive days of stable local operation.
- No blocker incident requiring ad-hoc shell surgery.

### Gate B: Capability Core (planning + tools)
1. Introduce DAG-based planner and step executor for multi-step tasks.
2. Add tool registry with policy-scoped tools:
   - sandboxed code execution
   - web fetch/browse
   - file operations
   - universal API caller
3. Add retry/self-correction loop per failed step.
4. Add plan checkpoints and resumability.

Exit criteria:
- 5 representative multi-step scenarios complete end-to-end with traceability.

### Gate C: Knowledge Depth
1. Document ingestion pipeline (PDF/DOCX/CSV) into memory index.
2. Cross-source retrieval (chat + docs + connector context).
3. Entity extraction and structured memory primitives.
4. Memory quality controls (importance/recency/decay).

Exit criteria:
- Retrieval accuracy acceptable on real workspace data.

### Gate D: Long-Horizon Execution
1. Project model for grouped multi-run outcomes.
2. Scheduled/recurring execution with checkpoint resume.
3. Progress/status updates pushed to Telegram and web timeline.

Exit criteria:
- Multi-day workflows survive restarts and provide operator-visible progress.

### Gate E: Enterprise Foundations
1. Multi-tenant data model (org/workspace/member).
2. RBAC enforcement across runtime actions and connector access.
3. Encrypted secrets vault with access audit.
4. SSO/OAuth and workspace API key scoping.
5. Usage metering and billing hooks.

Exit criteria:
- Safe multi-org operation with clear tenant isolation boundaries.

### Gate F: Multi-Agent + Autonomous Layer
1. Specialist agent registry + orchestrator delegation.
2. Parallel specialist execution and result synthesis.
3. Proactive recommendations and constrained self-healing routines.

Exit criteria:
- Agent can run delegated, long-horizon goals with operator trust.

---

## What to Change in Existing Code

| Area | Current State | Change Needed |
|------|--------------|---------------|
| `server.py` (large monolith) | Runtime center of gravity | Continue modular extraction into `server_modules/`; add task/project/org models |
| `.orion_credentials_vault.json` | Plaintext JSON | Move to encrypted vault (SQLite + Fernet or HashiCorp Vault) |
| `orion_local_worker.py` | Single worker, single-shot | Add plan-step execution mode, tool registry integration |
| `runtime_policy.py` | Action-level policy | Extend to tool-level policy with per-workspace scoping |
| `autopilot_connectors.py` (very large) | Giant connector module | Split into per-channel modules, add progress reporting |
| `provider_profiles.py` | Provider adapters | Add tool-calling / function-calling mode per provider |
| Frontend | Control center + setup + ops | Add workspace management, team UI, approvals timeline, billing dashboard |
| Memory (LanceDB) | Chat-only memory | Add document ingestion, entity extraction, org-level memory |

---

## The "AGI Feel" Checklist

When is Empyralis an "AGI platform"? When a user can say any of these and get a great result:

- [ ] "Research the top 5 competitors and draft a comparison table"
- [ ] "Read this PDF and summarize the key financial metrics"
- [ ] "Write a Python script that analyzes our sales data and email me the chart"
- [ ] "Monitor Hacker News for mentions of our product and alert me on Telegram"
- [ ] "Prepare next week's team meeting agenda based on our project tracker"
- [ ] "Draft a blog post, get my review, then publish it to WordPress"
- [ ] "Check if our API is responding slowly and investigate why"
- [ ] "Create a Jira ticket for the bug I just described, assign it to Sarah"
- [ ] "What did we decide about pricing in last month's meeting?" (knowledge retrieval)
- [ ] "Do your Monday routine" (proactive, learned behavior)

**Each of these requires multiple layers from the capability stack working together.** That's the real AGI test.

---

## Summary

| Dimension | Now | Target | Gap Size |
|-----------|-----|--------|----------|
| Runtime Foundation | 🟢 Strong | 🟢 Keep | Small (modularize) |
| Enterprise Auth/Multi-tenancy | 🟡 Basic auth, single-workspace default | 🟢 Full | **Large** |
| Tool Ecosystem | 🟡 Basic (chat/email) | 🟢 20+ tools | **Large** |
| Planning/Reasoning | 🔴 Single-shot | 🟢 Multi-step DAG | **Large** |
| Knowledge/Memory | 🟡 Basic vectors | 🟢 RAG + Graph | Medium |
| Long-Horizon Tasks | 🔴 Fire-and-forget | 🟢 Projects + schedules | Medium |
| Multi-Agent | 🔴 Single worker | 🟢 Specialist delegation | Medium |
| Autonomous Ops | 🔴 None | 🟢 Proactive + self-heal | Large (future) |

The foundation is strong enough to build on. The fastest path is not "enterprise everything first"; it is:
1) operational stability,
2) planning + tools,
3) knowledge depth,
4) long-horizon execution,
5) enterprise hardening,
6) autonomous differentiation.
