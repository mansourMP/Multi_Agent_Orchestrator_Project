#!/bin/bash
# Quick manual test for Phase 2 Brain Transplant
# This script tests the basic functionality without requiring API keys

echo "🧪 Phase 2 Brain Transplant - Manual Test"
echo "=========================================="
echo ""

# Check if .env exists
if [ ! -f .env ]; then
    echo "⚠️  Creating .env from template..."
    cp .env.example .env
    echo "✅ .env created. Please add your API keys before running real tests."
    echo ""
fi

# Check if .venv exists and activate it
if [ -d ".venv" ]; then
    echo "🔄 Activating virtual environment..."
    source .venv/bin/activate
fi

# Test 1: Check imports
echo "Test 1: Checking Python imports..."
python3 -c "from llm_core import call_model; from agency_logic import AgencyLogic; print('✅ Imports successful')" 2>&1

# Test 2: Database initialization
echo ""
echo "Test 2: Database initialization..."
python3 -c "from llm_core import init_llm_database; init_llm_database('test_agency.db'); print('✅ Database created')" 2>&1

# Test 3: Check database schema
echo ""
echo "Test 3: Verifying database schema..."
sqlite3 test_agency.db "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;" | while read table; do
    echo "  ✓ Table: $table"
done

# Test 4: Verify agency_logic.py CLI
echo ""
echo "Test 4: Testing CLI interface..."
echo '{"execution_id": "test-cli", "topic": "test"}' > /tmp/test_payload.json
python3 agency_logic.py astronomy check_network --in /tmp/test_payload.json 2>&1 | head -n 5

# Test 5: Memory Manager (Fallback mode)
echo ""
echo "Test 5: Testing Memory Manager (SQLite fallback)..."
python3 -c "from memory_manager import MemoryManager; mgr = MemoryManager(sqlite_path='test_agency.db'); mgr.upsert_memory('Hello from manual test'); print('✅ Memory upserted')" 2>&1

# Test 6: File Ingestion Proof
echo ""
echo "Test 6: Testing File Ingestion (Proof of Concept)..."
echo '{"file_path": "README_PHASE2.md"}' > /tmp/test_ingest.json
python3 agency_logic.py astronomy ingest_file --in /tmp/test_ingest.json 2>&1 | head -n 5

# Test 7: Cognitive daemon queue controls
echo ""
echo "Test 7: Testing Cognitive Daemon queue controls..."
python3 cognitive_daemon.py enqueue --niche-id astronomy --db-path test_agency.db --text "/orion status" 2>&1
python3 cognitive_daemon.py status --niche-id astronomy --db-path test_agency.db 2>&1

# Cleanup
rm -f test_agency.db /tmp/test_payload.json /tmp/test_ingest.json

echo ""
echo "=========================================="
echo "✅ Basic tests complete!"
echo ""
echo "To run full tests with real LLM calls:"
echo "  1. Add API keys to .env"
echo "  2. Run: python test_brain_transplant.py"
