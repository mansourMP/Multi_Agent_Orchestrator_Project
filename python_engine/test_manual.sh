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

# Cleanup
rm -f test_agency.db /tmp/test_payload.json

echo ""
echo "=========================================="
echo "✅ Basic tests complete!"
echo ""
echo "To run full tests with real LLM calls:"
echo "  1. Add API keys to .env"
echo "  2. Run: python test_brain_transplant.py"
