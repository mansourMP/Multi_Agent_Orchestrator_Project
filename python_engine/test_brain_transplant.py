#!/usr/bin/env python3
"""
Test Suite for Agency OS Phase 2 - Brain Transplant
Tests real LLM integration with hierarchical intelligence
"""

import json
import sys
import os

# Add current directory to path
sys.path.insert(0, os.path.dirname(__file__))

from llm_core import call_cheap, call_smart, call_json
from state_paths import default_cognitive_db_path

def test_1_simple_call():
    """Test basic LLM call"""
    print("\n" + "="*60)
    print("TEST 1: Simple LLM Call (Cheap Model)")
    print("="*60)
    
    ok, response, error = call_cheap(
        "Say hello in one sentence.",
        execution_id="test-001",
        role="test"
    )
    
    print(f"✓ OK: {ok}")
    print(f"✓ Response: {response}")
    if error:
        print(f"✗ Error: {error}")
    
    assert ok, "Simple call should succeed"
    assert response is not None, "Should have response"
    print("✅ PASSED")

def test_2_json_mode():
    """Test JSON mode enforcement"""
    print("\n" + "="*60)
    print("TEST 2: JSON Mode (Smart Model)")
    print("="*60)
    
    ok, response, error = call_json(
        "Generate a JSON object with keys 'name' and 'age' for a fictional character.",
        system_prompt="You are a helpful assistant.",
        model_id="smart",
        execution_id="test-002",
        role="test"
    )
    
    print(f"✓ OK: {ok}")
    print(f"✓ Response: {json.dumps(response, indent=2)}")
    if error:
        print(f"✗ Error: {error}")
    
    assert ok, "JSON call should succeed"
    assert isinstance(response, dict), "Response should be dict"
    assert "name" in response or "age" in response, "Should contain requested keys"
    print("✅ PASSED")

def test_3_critic_eval():
    """Test critic evaluation with real LLM"""
    print("\n" + "="*60)
    print("TEST 3: Critic Evaluation (Full Pipeline)")
    print("="*60)
    
    # Create test payload
    test_payload = {
        "execution_id": "test-003",
        "node_id": "critic-node-001",
        "draft": "Black holes are mysterious cosmic objects. They are very dark and pull things in. Scientists study them with telescopes."
    }
    
    # Write payload to temp file
    payload_path = "/tmp/test_critic_payload.json"
    with open(payload_path, 'w') as f:
        json.dump(test_payload, f)
    
    # Call agency_logic.py
    import subprocess
    result = subprocess.run(
        ["python", "agency_logic.py", "astronomy", "critic_eval", "--in", payload_path],
        capture_output=True,
        text=True,
        cwd=os.path.dirname(__file__)
    )
    
    print(f"✓ STDOUT:\n{result.stdout}")
    print(f"✓ STDERR:\n{result.stderr}")
    
    # Parse result
    try:
        output = json.loads(result.stdout)
        print(f"✓ Parsed Output: {json.dumps(output, indent=2)}")
        
        assert output["ok"], f"Critic eval should succeed: {output.get('error')}"
        assert "data" in output, "Should have data field"
        assert "decision" in output["data"], "Should have decision"
        assert output["data"]["decision"] in ["APPROVE", "REVISE", "ESCALATE_HUMAN"], "Valid decision"
        
        print("✅ PASSED")
    except json.JSONDecodeError as e:
        print(f"✗ Failed to parse JSON: {e}")
        print(f"Raw output: {result.stdout}")
        raise

def test_4_researcher_brief():
    """Test researcher brief generation"""
    print("\n" + "="*60)
    print("TEST 4: Researcher Brief (Cheap Model)")
    print("="*60)
    
    test_payload = {
        "execution_id": "test-004",
        "node_id": "research-node-001",
        "topic": "Recent discoveries about exoplanets"
    }
    
    payload_path = "/tmp/test_research_payload.json"
    with open(payload_path, 'w') as f:
        json.dump(test_payload, f)
    
    import subprocess
    result = subprocess.run(
        ["python", "agency_logic.py", "astronomy", "researcher_brief", "--in", payload_path],
        capture_output=True,
        text=True,
        cwd=os.path.dirname(__file__)
    )
    
    print(f"✓ STDOUT:\n{result.stdout}")
    print(f"✓ STDERR:\n{result.stderr}")
    
    try:
        output = json.loads(result.stdout)
        print(f"✓ Parsed Output: {json.dumps(output, indent=2)}")
        
        assert output["ok"], f"Research brief should succeed: {output.get('error')}"
        assert "data" in output, "Should have data field"
        assert "key_findings" in output["data"], "Should have key_findings"
        
        print("✅ PASSED")
    except json.JSONDecodeError as e:
        print(f"✗ Failed to parse JSON: {e}")
        raise

def test_5_error_handling():
    """Test error handling with invalid input"""
    print("\n" + "="*60)
    print("TEST 5: Error Handling")
    print("="*60)
    
    # Test with missing required field
    test_payload = {
        "execution_id": "test-005",
        "node_id": "test-node"
        # Missing 'draft' field
    }
    
    payload_path = "/tmp/test_error_payload.json"
    with open(payload_path, 'w') as f:
        json.dump(test_payload, f)
    
    import subprocess
    result = subprocess.run(
        ["python", "agency_logic.py", "astronomy", "critic_eval", "--in", payload_path],
        capture_output=True,
        text=True,
        cwd=os.path.dirname(__file__)
    )
    
    print(f"✓ STDOUT:\n{result.stdout}")
    print(f"✓ STDERR:\n{result.stderr}")
    
    # Should still return valid JSON (not crash)
    try:
        output = json.loads(result.stdout)
        print(f"✓ Graceful error handling: {json.dumps(output, indent=2)}")
        print("✅ PASSED")
    except json.JSONDecodeError:
        print("✗ Should return valid JSON even on error")
        raise

if __name__ == "__main__":
    print("\n" + "🧠 PHASE 2 BRAIN TRANSPLANT - TEST SUITE")
    print("="*60)
    
    # Check if .env exists
    if not os.path.exists(".env"):
        print("\n⚠️  WARNING: No .env file found!")
        print("Copy .env.example to .env and configure your API keys")
        print("Example: cp .env.example .env")
        sys.exit(1)
    
    try:
        test_1_simple_call()
        test_2_json_mode()
        test_3_critic_eval()
        test_4_researcher_brief()
        test_5_error_handling()
        
        print("\n" + "="*60)
        print("🎉 ALL TESTS PASSED!")
        print("="*60)
        
        # Show database stats
        import sqlite3
        conn = sqlite3.connect(default_cognitive_db_path())
        c = conn.cursor()
        c.execute("SELECT COUNT(*) FROM llm_calls")
        call_count = c.fetchone()[0]
        c.execute("SELECT SUM(total_tokens), SUM(cost_usd) FROM llm_calls")
        stats = c.fetchone()
        conn.close()
        
        print(f"\n📊 Database Stats:")
        print(f"   Total LLM Calls: {call_count}")
        print(f"   Total Tokens: {stats[0] or 0}")
        print(f"   Total Cost: ${stats[1] or 0:.6f}")
        
    except Exception as e:
        print(f"\n❌ TEST FAILED: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
