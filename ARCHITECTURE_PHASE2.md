# 🧠 PHASE 2: BRAIN TRANSPLANT - ARCHITECTURE DIAGRAM

```
┌─────────────────────────────────────────────────────────────────────┐
│                        AGENCY OS - PHASE 2                          │
│                   Hierarchical Intelligence System                  │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│  NODE.JS BACKEND (NestJS)                                           │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  Workflow Orchestrator                                       │   │
│  │  • Creates execution_id                                      │   │
│  │  • Writes payload JSON to /tmp/agency_os/{exec_id}/         │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                              │                                       │
│                              ▼                                       │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  Bridge Script (Shell/Node)                                  │   │
│  │  • Calls: python agency_logic.py <niche> <cmd> --in <json>  │   │
│  └──────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│  PYTHON ENGINE (The Brain)                                          │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  agency_logic.py                                             │   │
│  │  ┌────────────────────────────────────────────────────────┐  │   │
│  │  │  AgencyLogic Class                                     │  │   │
│  │  │  • researcher_brief() → CHEAP MODEL                    │  │   │
│  │  │  • critic_eval() → SMART MODEL                         │  │   │
│  │  │  • check_network() → No LLM                            │  │   │
│  │  │  • create_safety_ticket() → DB Insert                  │  │   │
│  │  └────────────────────────────────────────────────────────┘  │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                              │                                       │
│                              ▼                                       │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  llm_core.py (LiteLLM Integration)                           │   │
│  │  ┌────────────────────────────────────────────────────────┐  │   │
│  │  │  Model Router                                          │  │   │
│  │  │  • "cheap" → gemini/gemini-1.5-flash                   │  │   │
│  │  │  • "smart" → anthropic/claude-3-5-sonnet               │  │   │
│  │  └────────────────────────────────────────────────────────┘  │   │
│  │  ┌────────────────────────────────────────────────────────┐  │   │
│  │  │  JSON Mode Enforcer                                    │  │   │
│  │  │  • response_format (if supported)                      │  │   │
│  │  │  • Fallback extraction from markdown/text              │  │   │
│  │  └────────────────────────────────────────────────────────┘  │   │
│  │  ┌────────────────────────────────────────────────────────┐  │   │
│  │  │  Cost Tracker                                          │  │   │
│  │  │  • Logs every call to agency_memory.db                 │  │   │
│  │  │  • Tracks: tokens, cost, duration, model               │  │   │
│  │  └────────────────────────────────────────────────────────┘  │   │
│  └──────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│  LLM PROVIDERS (External APIs)                                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │
│  │   Google     │  │  Anthropic   │  │   OpenAI     │              │
│  │   Gemini     │  │   Claude     │  │    GPT       │              │
│  │   (Cheap)    │  │   (Smart)    │  │  (Optional)  │              │
│  └──────────────┘  └──────────────┘  └──────────────┘              │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│  DATABASE (SQLite - agency_memory.db)                               │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  llm_calls                                                   │   │
│  │  • execution_id, niche_id, role                             │   │
│  │  • model_id, resolved_model                                 │   │
│  │  • prompt_tokens, completion_tokens, total_tokens           │   │
│  │  • cost_usd, duration_ms                                    │   │
│  │  • ok, error_message, timestamp                             │   │
│  └──────────────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  safety_tickets                                              │   │
│  │  • id, execution_id, niche_id, node_id                      │   │
│  │  • action_type, reason, preview                             │   │
│  │  • status (PENDING/APPROVED/REJECTED)                       │   │
│  │  • created_at, resolved_at, resolved_by                     │   │
│  └──────────────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  global_context                                              │   │
│  │  • topic_hash, niche_id, timestamp                          │   │
│  │  (For duplicate detection)                                  │   │
│  └──────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│  RETURN TO NODE.JS                                                  │
│  • JSON output to STDOUT                                            │
│  • Logs to STDERR                                                   │
│  • Node reads result, updates dev.db, triggers next step            │
└─────────────────────────────────────────────────────────────────────┘


═══════════════════════════════════════════════════════════════════════
                         DATA FLOW EXAMPLE
═══════════════════════════════════════════════════════════════════════

1. USER TRIGGERS WORKFLOW
   ↓
2. NODE CREATES PAYLOAD
   {
     "execution_id": "exec-abc123",
     "node_id": "critic-node-001",
     "draft": "Black holes are mysterious..."
   }
   ↓
3. BRIDGE CALLS PYTHON
   python agency_logic.py astronomy critic_eval --in /tmp/payload.json
   ↓
4. AGENCY_LOGIC ROUTES TO critic_eval()
   ↓
5. LLM_CORE CALLS SMART MODEL
   • Model: anthropic/claude-3-5-sonnet-20241022
   • JSON mode: ENFORCED
   • Prompt: "Evaluate this draft based on astronomy values..."
   ↓
6. CLAUDE RESPONDS
   {
     "decision": "REVISE",
     "scores": {"overall": 3.5, ...},
     "blocking_issues": ["Lacks scientific depth"],
     "suggested_edits": ["Add citations"]
   }
   ↓
7. LLM_CORE LOGS TO DATABASE
   INSERT INTO llm_calls (execution_id, tokens, cost, ...)
   ↓
8. AGENCY_LOGIC RETURNS JSON
   {
     "ok": true,
     "step": "critic_eval",
     "data": { ... }
   }
   ↓
9. NODE READS RESULT
   • Updates workflow state
   • Triggers next step or waits for revision


═══════════════════════════════════════════════════════════════════════
                      ESCALATION FLOW
═══════════════════════════════════════════════════════════════════════

CRITIC DETECTS RISKY CONTENT
   ↓
DECISION: "ESCALATE_HUMAN"
   ↓
create_safety_ticket() CALLED
   ↓
INSERT INTO safety_tickets
   • status = "PENDING"
   • reason = "Violates core values"
   • preview = First 500 chars
   ↓
RETURN ticket_id IN RESPONSE
   ↓
WORKFLOW PAUSES
   ↓
ADMIN REVIEWS IN SAFETY UI (Phase 3)
   ↓
APPROVE/REJECT
   ↓
UPDATE safety_tickets SET status = "APPROVED"/"REJECTED"
   ↓
WORKFLOW RESUMES OR TERMINATES


═══════════════════════════════════════════════════════════════════════
                      COST TRACKING FLOW
═══════════════════════════════════════════════════════════════════════

EVERY LLM CALL
   ↓
LiteLLM returns usage stats
   • prompt_tokens
   • completion_tokens
   • cost (calculated by LiteLLM)
   ↓
llm_core.py LOGS TO DATABASE
   INSERT INTO llm_calls (
     execution_id, niche_id, role,
     total_tokens, cost_usd, duration_ms
   )
   ↓
ADMIN QUERIES FOR REPORTS
   SELECT SUM(cost_usd) FROM llm_calls WHERE date = today
   ↓
BUDGET ALERTS (Future: Phase 3)


═══════════════════════════════════════════════════════════════════════
                         KEY FEATURES
═══════════════════════════════════════════════════════════════════════

✅ HIERARCHICAL INTELLIGENCE
   • Cheap model (Gemini Flash) for speed
   • Smart model (Claude Sonnet) for quality
   • Automatic routing based on task complexity

✅ JSON MODE ENFORCEMENT
   • Native support where available (GPT, Gemini)
   • Fallback extraction for other models
   • Schema validation

✅ COMPREHENSIVE ERROR HANDLING
   • Network failures → JSON error response
   • Invalid JSON → Extraction attempts
   • API errors → Logged and returned gracefully
   • No crashes, always valid JSON output

✅ COST TRANSPARENCY
   • Every call logged with tokens and cost
   • Per-niche, per-role breakdowns
   • Duration tracking for performance optimization

✅ SAFETY FIRST
   • Automatic escalation for risky content
   • Full audit trail (who, when, why)
   • Human-in-the-loop for critical decisions

✅ PRODUCTION READY
   • Virtual environment isolation
   • Environment-based configuration
   • Comprehensive logging (STDERR)
   • Structured output (STDOUT JSON)
   • Database persistence
   • Test suite included
