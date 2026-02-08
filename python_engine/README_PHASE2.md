# 🧠 Agency OS - Phase 2: Brain Transplant

**Status**: ✅ COMPLETE  
**Version**: 2.0  
**Date**: 2026-01-20

---

## 🎯 Overview

Phase 2 replaces the MockLLM with **real hierarchical intelligence** using LiteLLM. The system now features:

- **Cheap Model** (Gemini Flash) for fast research and drafting
- **Smart Model** (Claude Sonnet) for complex critique and decisions
- **JSON Mode Enforcement** for structured outputs
- **Cost Tracking** with full usage logging to SQLite
- **Safety Escalation** with automatic ticket creation
- **Comprehensive Error Handling** with graceful degradation

---

## 📁 Files

| File | Purpose |
|------|---------|
| `llm_core.py` | Core LLM integration with LiteLLM |
| `agency_logic.py` | Main orchestration logic (updated) |
| `requirements.txt` | Python dependencies |
| `.env.example` | Configuration template |
| `test_brain_transplant.py` | Test suite |
| `agency_memory.db` | SQLite database (auto-created) |

---

## 🚀 Quick Start

### 1. Install Dependencies

```bash
cd python_engine
pip install -r requirements.txt
```

### 2. Configure API Keys

```bash
# Copy template
cp .env.example .env

# Edit .env and add your API keys
# Example:
# ANTHROPIC_API_KEY=sk-ant-...
# GOOGLE_API_KEY=...
```

### 3. Run Tests

```bash
python test_brain_transplant.py
```

---

## 🧪 Testing Individual Commands

### Test 1: Researcher Brief (Cheap Model)

```bash
echo '{
  "execution_id": "test-001",
  "node_id": "research-node",
  "topic": "Recent discoveries about black holes"
}' > /tmp/test_research.json

python agency_logic.py astronomy researcher_brief --in /tmp/test_research.json
```

**Expected Output**:
```json
{
  "ok": true,
  "step": "researcher_brief",
  "data": {
    "ok": true,
    "topic": "Recent discoveries about black holes",
    "key_findings": [...],
    "sources": [...],
    "angle": "...",
    "confidence": 0.85
  }
}
```

---

### Test 2: Critic Evaluation (Smart Model)

```bash
echo '{
  "execution_id": "test-002",
  "node_id": "critic-node",
  "draft": "Black holes are mysterious cosmic objects that pull everything in. They are very dark and scientists study them."
}' > /tmp/test_critic.json

python agency_logic.py astronomy critic_eval --in /tmp/test_critic.json
```

**Expected Output**:
```json
{
  "ok": true,
  "step": "critic_eval",
  "data": {
    "decision": "REVISE",
    "scores": {
      "overall": 3.2,
      "clarity": 3.5,
      "brand_fit": 3.0,
      "accuracy": 3.5
    },
    "blocking_issues": ["Lacks scientific depth", "No citations"],
    "suggested_edits": ["Add specific examples", "Include recent research"]
  }
}
```

---

### Test 3: Escalation Scenario

```bash
echo '{
  "execution_id": "test-003",
  "node_id": "critic-node",
  "draft": "Aliens built the pyramids using anti-gravity technology. This is a fact that scientists don't want you to know."
}' > /tmp/test_escalate.json

python agency_logic.py astronomy critic_eval --in /tmp/test_escalate.json
```

**Expected Output**:
```json
{
  "ok": true,
  "step": "critic_eval",
  "data": {
    "decision": "ESCALATE_HUMAN",
    "scores": {
      "overall": 1.0,
      "clarity": 2.0,
      "brand_fit": 0.0,
      "accuracy": 0.0
    },
    "blocking_issues": ["Pseudoscience", "Violates 'verify_sources' value"],
    "suggested_edits": [],
    "escalation_reason": "Content promotes pseudoscience and violates core values",
    "safety_ticket_id": "a1b2c3d4..."
  }
}
```

---

## 📊 Database Schema

### `llm_calls` Table
Tracks every LLM call with full metadata:

```sql
CREATE TABLE llm_calls (
    id INTEGER PRIMARY KEY,
    execution_id TEXT,
    niche_id TEXT,
    role TEXT,
    model_id TEXT,
    resolved_model TEXT,
    prompt_tokens INTEGER,
    completion_tokens INTEGER,
    total_tokens INTEGER,
    cost_usd REAL,
    duration_ms INTEGER,
    ok INTEGER,
    error_message TEXT,
    timestamp REAL
);
```

### `safety_tickets` Table
Enhanced with full tracking:

```sql
CREATE TABLE safety_tickets (
    id TEXT PRIMARY KEY,
    execution_id TEXT,
    niche_id TEXT,
    node_id TEXT,
    action_type TEXT,
    reason TEXT,
    payload_path TEXT,
    preview TEXT,
    status TEXT,
    created_at REAL,
    resolved_at REAL,
    resolved_by TEXT
);
```

---

## 🔧 Configuration

### Model Selection

Edit `.env` to choose your models:

```bash
# Fast & cheap for research
CHEAP_MODEL=gemini/gemini-1.5-flash
# CHEAP_MODEL=openai/gpt-4o-mini

# Smart & expensive for critique
SMART_MODEL=anthropic/claude-3-5-sonnet-20241022
# SMART_MODEL=openai/gpt-4o
```

### Supported Providers

- **OpenAI**: `openai/gpt-4o`, `openai/gpt-4o-mini`
- **Anthropic**: `anthropic/claude-3-5-sonnet-20241022`, `anthropic/claude-3-haiku-20240307`
- **Google**: `gemini/gemini-1.5-pro`, `gemini/gemini-1.5-flash`
- **Local**: `ollama/llama3`, etc.

---

## 🎯 Commands Reference

### `researcher_brief`
**Purpose**: Generate research brief using cheap model  
**Input**:
```json
{
  "execution_id": "exec-123",
  "node_id": "node-456",
  "topic": "Topic to research"
}
```

**Output**:
```json
{
  "ok": true,
  "topic": "...",
  "key_findings": [...],
  "sources": [...],
  "angle": "...",
  "confidence": 0.8
}
```

---

### `critic_eval`
**Purpose**: Evaluate content using smart model  
**Input**:
```json
{
  "execution_id": "exec-123",
  "node_id": "node-456",
  "draft": "Content to evaluate"
}
```

**Output**:
```json
{
  "decision": "APPROVE|REVISE|ESCALATE_HUMAN",
  "scores": {...},
  "blocking_issues": [...],
  "suggested_edits": [...],
  "escalation_reason": "..." // if ESCALATE_HUMAN
}
```

---

### `check_network`
**Purpose**: Check for duplicate topics across niches  
**Input**:
```json
{
  "execution_id": "exec-123",
  "topic": "Topic to check"
}
```

**Output**:
```json
{
  "decision": "APPROVE|REJECT_DUPLICATE",
  "topic_hash": "...",
  "match": "niche-id" // if duplicate
}
```

---

## 📈 Monitoring

### View LLM Usage

```bash
sqlite3 agency_memory.db "
  SELECT 
    niche_id,
    role,
    COUNT(*) as calls,
    SUM(total_tokens) as tokens,
    SUM(cost_usd) as cost
  FROM llm_calls
  GROUP BY niche_id, role
  ORDER BY cost DESC;
"
```

### View Safety Tickets

```bash
sqlite3 agency_memory.db "
  SELECT 
    id,
    niche_id,
    action_type,
    reason,
    status,
    datetime(created_at, 'unixepoch') as created
  FROM safety_tickets
  WHERE status = 'PENDING'
  ORDER BY created_at DESC;
"
```

---

## ✅ Acceptance Tests

All tests must pass:

1. ✅ `critic_eval` returns JSON with decision in `{APPROVE, REVISE, ESCALATE_HUMAN}`
2. ✅ Invalid model/provider/network error returns `ok=false` JSON (not stack trace)
3. ✅ `critic_eval` that escalates inserts `safety_tickets` row with `status=PENDING`
4. ✅ `llm_calls` row inserted for each call, including tokens and duration
5. ✅ `researcher_brief` uses cheap model and returns structured JSON
6. ✅ All commands output JSON to STDOUT, logs to STDERR

---

## 🔒 Error Handling

The system gracefully handles:

- **Network failures**: Returns `ok=false` with error message
- **Invalid JSON**: Attempts extraction from markdown/text
- **Missing API keys**: Clear error message
- **Rate limits**: Logged and returned as error
- **Malformed responses**: Validation with fallback

---

## 🚦 Next Steps

1. **Build Safety UI**: Create `/admin/safety` page to review tickets
2. **Add Streaming**: Implement streaming for real-time feedback
3. **Cost Alerts**: Add budget monitoring and alerts
4. **Agent Marketplace**: Allow custom agent configurations
5. **Multi-Agent Collaboration**: Enable agent-to-agent communication

---

## 📝 Notes

- **Database**: Auto-created on first run
- **Logs**: All logs go to STDERR (STDOUT is JSON only)
- **Execution ID**: Required for tracking, auto-generated if missing
- **Cost Tracking**: Automatic via LiteLLM (may be null for some providers)

---

**🎉 Phase 2 Complete! The brain is now fully operational.**
