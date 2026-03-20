# 🚀 Agency OS - Quick Reference Card

## 🧠 Phase 2: Real Intelligence Activated

### Setup (One-Time)
```bash
cd python_engine
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# Edit .env and add your API keys
```

### Daily Usage
```bash
# Activate environment
cd /Users/mansur/Multi_Agent_Orchestrator_Project
source python_engine/venv/bin/activate

# Run from project root
python python_engine/agency_logic.py <niche> <command> --in <payload.json>
```

---

## 📋 Available Commands

### 1. researcher_brief (Cheap Model - Fast)
```bash
echo '{
  "execution_id": "exec-001",
  "node_id": "node-001",
  "topic": "Your research topic"
}' > /tmp/payload.json

python python_engine/agency_logic.py astronomy researcher_brief --in /tmp/payload.json
```

### 2. critic_eval (Smart Model - Quality)
```bash
echo '{
  "execution_id": "exec-002",
  "node_id": "node-002",
  "draft": "Your content to evaluate"
}' > /tmp/payload.json

python python_engine/agency_logic.py astronomy critic_eval --in /tmp/payload.json
```

### 3. check_network (No LLM - Fast)
```bash
echo '{
  "execution_id": "exec-003",
  "topic": "Topic to check for duplicates"
}' > /tmp/payload.json

python python_engine/agency_logic.py astronomy check_network --in /tmp/payload.json
```

---

## 🎯 Available Niches

From `config/niches.yaml`:
- `astronomy` - Cosmos Observer (astrophysics focus)
- `coding` - The Pragmatic Coder (tech lead)
- `earth_nature` - Planetary Voice (biology/ecosystems)

---

## 📊 Monitoring

### View LLM Usage
```bash
sqlite3 python_engine/agency_memory.db "
SELECT 
  datetime(timestamp, 'unixepoch') as time,
  niche_id,
  role,
  model_id,
  total_tokens,
  ROUND(cost_usd, 6) as cost,
  duration_ms
FROM llm_calls
ORDER BY timestamp DESC
LIMIT 10;
"
```

### View Safety Tickets
```bash
sqlite3 python_engine/agency_memory.db "
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

### Cost Summary
```bash
sqlite3 python_engine/agency_memory.db "
SELECT 
  niche_id,
  role,
  COUNT(*) as calls,
  SUM(total_tokens) as tokens,
  ROUND(SUM(cost_usd), 4) as cost_usd
FROM llm_calls
GROUP BY niche_id, role
ORDER BY cost_usd DESC;
"
```

---

## 🔧 Configuration

### Model Selection (.env)
```bash
# Fast & Cheap (research, drafting)
CHEAP_MODEL=gemini/gemini-1.5-flash

# Smart & Expensive (critique, decisions)
SMART_MODEL=anthropic/claude-3-5-sonnet-20241022

# API Keys
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_API_KEY=...
```

### Supported Providers
- OpenAI: `openai/gpt-4o`, `openai/gpt-4o-mini`
- Anthropic: `anthropic/claude-3-5-sonnet-20241022`
- Google: `gemini/gemini-1.5-pro`, `gemini/gemini-1.5-flash`
- Local: `ollama/llama3`

---

## ✅ Expected Output Format

All commands return JSON to STDOUT:

### Success
```json
{
  "ok": true,
  "step": "critic_eval",
  "data": {
    "decision": "APPROVE",
    "scores": {...},
    "blocking_issues": [],
    "suggested_edits": [...]
  }
}
```

### Error
```json
{
  "ok": false,
  "step": "critic_eval",
  "data": {},
  "error": {
    "code": "RUNTIME_ERROR",
    "message": "Details here"
  }
}
```

---

## 🚨 Troubleshooting

### Import Error
```bash
# Make sure venv is activated
source python_engine/venv/bin/activate
```

### Config Not Found
```bash
# Run from project root, not python_engine/
cd /Users/mansur/Multi_Agent_Orchestrator_Project
python python_engine/agency_logic.py ...
```

### API Key Error
```bash
# Check .env file exists and has keys
cat python_engine/.env
```

### Database Locked
```bash
# Close any open SQLite connections
# Or delete and recreate: rm python_engine/agency_memory.db
```

---

## 📚 Documentation

- **Full Guide**: `python_engine/README_PHASE2.md`
- **Completion Summary**: `PHASE2_COMPLETION_SUMMARY.md`
- **Project Overview**: `PROJECT_HANDOFF_SUMMARY.md`
- **Test Suite**: `python_engine/test_brain_transplant.py`

---

## 🎯 Quick Test

```bash
cd /Users/mansur/Multi_Agent_Orchestrator_Project
source python_engine/venv/bin/activate

# Test without API calls
echo '{"execution_id": "test", "topic": "test"}' | \
  python python_engine/agency_logic.py astronomy check_network --in /dev/stdin

# Expected: {"ok": true, "step": "check_network", ...}
```

---

**🧠 Brain Status: OPERATIONAL | Cost Tracking: ACTIVE | Safety: ENABLED**
