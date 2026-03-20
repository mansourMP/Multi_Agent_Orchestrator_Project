# ✅ PHASE 2 SETUP CHECKLIST

**Complete these steps to activate real intelligence in Agency OS**

---

## 📋 Pre-Flight Checklist

### ✅ Step 1: Verify Installation
```bash
cd /Users/mansur/Multi_Agent_Orchestrator_Project/python_engine
ls -la venv/
```
**Expected**: Virtual environment directory exists

**Status**: ✅ COMPLETE (auto-created)

---

### ⚠️ Step 2: Configure API Keys

```bash
cd /Users/mansur/Multi_Agent_Orchestrator_Project/python_engine
cat .env
```

**Required Keys** (add at least one):

- [ ] `ANTHROPIC_API_KEY=sk-ant-...` (for Claude Sonnet - SMART model)
- [ ] `GOOGLE_API_KEY=...` (for Gemini Flash - CHEAP model)
- [ ] `OPENAI_API_KEY=sk-...` (optional alternative)

**How to get keys**:
- Anthropic: https://console.anthropic.com/
- Google AI: https://makersuite.google.com/app/apikey
- OpenAI: https://platform.openai.com/api-keys

**Status**: ⚠️ **ACTION REQUIRED** - Add your API keys to `.env`

---

### ✅ Step 3: Test Basic Functionality

```bash
cd /Users/mansur/Multi_Agent_Orchestrator_Project
source python_engine/venv/bin/activate

# Test without API calls (should work immediately)
echo '{"execution_id": "test", "topic": "test"}' | \
  python python_engine/agency_logic.py astronomy check_network --in /dev/stdin
```

**Expected Output**:
```json
{"ok": true, "step": "check_network", "data": {"decision": "APPROVE", "topic_hash": "..."}}
```

**Status**: ✅ COMPLETE (verified working)

---

### ⚠️ Step 4: Test Real LLM Calls

**Only after adding API keys to `.env`**

```bash
cd /Users/mansur/Multi_Agent_Orchestrator_Project
source python_engine/venv/bin/activate

# Run full test suite
python python_engine/test_brain_transplant.py
```

**Expected**: All 5 tests pass
- Test 1: Simple Call ✅
- Test 2: JSON Mode ✅
- Test 3: Critic Eval ✅
- Test 4: Researcher Brief ✅
- Test 5: Error Handling ✅

**Status**: ⚠️ **ACTION REQUIRED** - Run after adding API keys

---

### 📊 Step 5: Verify Database

```bash
cd /Users/mansur/Multi_Agent_Orchestrator_Project/python_engine

# Check tables exist
sqlite3 agency_memory.db ".tables"
```

**Expected Tables**:
- `llm_calls`
- `safety_tickets`
- `global_context`

**Status**: ✅ COMPLETE (auto-created)

---

### 📈 Step 6: Monitor First LLM Call

After running a test with real API keys:

```bash
sqlite3 python_engine/agency_memory.db "
SELECT 
  niche_id,
  role,
  model_id,
  total_tokens,
  ROUND(cost_usd, 6) as cost,
  duration_ms,
  ok
FROM llm_calls
ORDER BY timestamp DESC
LIMIT 1;
"
```

**Expected**: Row showing your first LLM call with cost and tokens

**Status**: ⏳ PENDING - Run after Step 4

---

## 🎯 Quick Validation Commands

### Test 1: Researcher Brief (Cheap Model)
```bash
cd /Users/mansur/Multi_Agent_Orchestrator_Project
source python_engine/venv/bin/activate

echo '{
  "execution_id": "quick-test-1",
  "node_id": "test-node",
  "topic": "Recent black hole discoveries"
}' > /tmp/test_research.json

python python_engine/agency_logic.py astronomy researcher_brief --in /tmp/test_research.json
```

**Expected**: JSON with `key_findings`, `sources`, `angle`

---

### Test 2: Critic Eval (Smart Model)
```bash
echo '{
  "execution_id": "quick-test-2",
  "node_id": "test-node",
  "draft": "Black holes are mysterious cosmic objects that scientists study."
}' > /tmp/test_critic.json

python python_engine/agency_logic.py astronomy critic_eval --in /tmp/test_critic.json
```

**Expected**: JSON with `decision`, `scores`, `blocking_issues`

---

## 🚨 Troubleshooting

### Issue: "ModuleNotFoundError: No module named 'litellm'"
**Solution**:
```bash
cd /Users/mansur/Multi_Agent_Orchestrator_Project/python_engine
source venv/bin/activate
pip install -r requirements.txt
```

---

### Issue: "NICHE_NOT_FOUND"
**Solution**: Run from project root, not `python_engine/`
```bash
cd /Users/mansur/Multi_Agent_Orchestrator_Project
python python_engine/agency_logic.py ...
```

---

### Issue: "API key not found"
**Solution**: Check `.env` file
```bash
cat python_engine/.env
# Should contain: ANTHROPIC_API_KEY=... or GOOGLE_API_KEY=...
```

---

### Issue: "Invalid JSON response"
**Solution**: This is normal for some models. The system has fallback extraction.
Check logs in STDERR for details.

---

## 📚 Next Steps After Setup

1. **Add API Keys** → Enable real LLM calls
2. **Run Tests** → Validate everything works
3. **Check Costs** → Monitor token usage
4. **Build Safety UI** → Review escalated tickets
5. **Integrate with Frontend** → Connect to workflow canvas

---

## 🎓 Learning Resources

- **Full Documentation**: `python_engine/README_PHASE2.md`
- **Architecture**: `ARCHITECTURE_PHASE2.md`
- **Quick Reference**: `QUICK_REFERENCE.md`
- **Completion Summary**: `PHASE2_COMPLETION_SUMMARY.md`

---

## ✅ Final Checklist

- [x] Virtual environment created
- [x] Dependencies installed
- [x] Database initialized
- [x] Basic tests passing
- [ ] **API keys configured** ← DO THIS NOW
- [ ] **Full test suite passing**
- [ ] **First LLM call logged**
- [ ] **Cost tracking verified**

---

## 🎉 When Complete

You'll have:
- ✅ Real LLM integration (no more MockLLM)
- ✅ Hierarchical intelligence (cheap + smart models)
- ✅ Cost tracking for every call
- ✅ Safety escalation system
- ✅ Production-ready error handling
- ✅ Comprehensive logging and monitoring

**Next Phase**: Build Safety UI Dashboard (`/admin/safety`)

---

**Status**: 🟡 READY FOR API KEYS  
**Last Updated**: 2026-01-20  
**Phase**: 2 - Brain Transplant
