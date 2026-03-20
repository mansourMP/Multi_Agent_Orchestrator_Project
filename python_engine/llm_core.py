"""
LLM Core - Hierarchical Intelligence Engine for Agency OS
==========================================================
Provides production-grade LLM integration with:
- Model routing (cheap/smart)
- JSON mode enforcement
- Cost tracking and usage logging
- Comprehensive error handling
- SQLite persistence

Author: Agency OS Team
Phase: 2 - Brain Transplant
"""

import os
import sys
import json
import time
import sqlite3
import re
from typing import Optional, Dict, Any, Tuple
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Import LiteLLM
try:
    import litellm
    from litellm import completion
except ImportError:
    sys.stderr.write("[LLM_CORE] ERROR: litellm not installed. Run: pip install litellm\n")
    sys.exit(1)

# --- CONFIGURATION ---
DEFAULT_CHEAP_MODEL = os.getenv("CHEAP_MODEL", "gemini/gemini-1.5-flash")
DEFAULT_SMART_MODEL = os.getenv("SMART_MODEL", "anthropic/claude-3-5-sonnet-20241022")
DEFAULT_EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "openai/text-embedding-3-small")

# LiteLLM settings
litellm.drop_params = True  # Drop unsupported params instead of erroring
litellm.set_verbose = False  # Disable verbose logging to stdout

# --- LOGGING ---
def log(msg: str):
    """Log to STDERR only (STDOUT reserved for JSON output)"""
    sys.stderr.write(f"[LLM_CORE] {msg}\n")
    sys.stderr.flush()

# --- EMBEDDINGS ---
def get_embedding(text: str, model_id: Optional[str] = None) -> list[float]:
    """Get vector embedding for text using LiteLLM"""
    model = model_id or DEFAULT_EMBEDDING_MODEL
    try:
        response = litellm.embedding(model=model, input=[text])
        return response.data[0]['embedding']
    except Exception as e:
        log(f"Embedding failed: {e}")
        # Return dummy vector if failed (should be handled by caller)
        return []

# --- DATABASE INITIALIZATION ---
def init_llm_database(db_path: str = "agency_memory.db"):
    """Initialize the llm_calls table in agency_memory.db"""
    conn = sqlite3.connect(db_path)
    c = conn.cursor()
    
    # LLM calls tracking table
    c.execute('''CREATE TABLE IF NOT EXISTS llm_calls (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
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
    )''')
    
    # Safety tickets table (enhanced)
    c.execute('''CREATE TABLE IF NOT EXISTS safety_tickets (
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
    )''')
    
    conn.commit()
    conn.close()
    log(f"Database initialized: {db_path}")

# --- JSON EXTRACTION FALLBACK ---
def extract_json_from_text(text: str) -> Optional[Dict[str, Any]]:
    """
    Extract JSON from text that may contain markdown code blocks or extra text.
    Tries multiple strategies to find valid JSON.
    """
    # Strategy 1: Try parsing the entire text
    try:
        return json.loads(text.strip())
    except json.JSONDecodeError:
        pass
    
    # Strategy 2: Extract from markdown code blocks
    json_block_pattern = r'```(?:json)?\s*(\{.*?\})\s*```'
    matches = re.findall(json_block_pattern, text, re.DOTALL)
    if matches:
        try:
            return json.loads(matches[0])
        except json.JSONDecodeError:
            pass
    
    # Strategy 3: Find first { to last }
    start = text.find('{')
    end = text.rfind('}')
    if start != -1 and end != -1 and end > start:
        try:
            return json.loads(text[start:end+1])
        except json.JSONDecodeError:
            pass
    
    return None

# --- MODEL RESOLUTION ---
def resolve_model(model_id: str) -> str:
    """
    Resolve model_id to actual model name.
    - "cheap" → CHEAP_MODEL env var
    - "smart" → SMART_MODEL env var
    - anything else → use as-is
    """
    if model_id == "cheap":
        return DEFAULT_CHEAP_MODEL
    elif model_id == "smart":
        return DEFAULT_SMART_MODEL
    else:
        return model_id

# --- CORE LLM CALL FUNCTION ---
def call_model(
    prompt: str,
    system_prompt: Optional[str] = None,
    model_id: str = "cheap",
    json_mode: bool = False,
    execution_id: Optional[str] = None,
    niche_id: Optional[str] = None,
    role: Optional[str] = None,
    db_path: str = "agency_memory.db"
) -> Tuple[bool, Optional[Dict[str, Any]], Optional[str]]:
    """
    Call LLM with comprehensive error handling and logging.
    
    Args:
        prompt: User/task prompt
        system_prompt: System instruction (optional)
        model_id: "cheap", "smart", or explicit model name
        json_mode: Enforce JSON output
        execution_id: Workflow execution ID for tracking
        niche_id: Agent niche identifier
        role: Role of this call (e.g., "researcher", "critic")
        db_path: Path to SQLite database
    
    Returns:
        Tuple of (success: bool, response: dict|None, error: str|None)
    """
    start_time = time.time()
    resolved_model = resolve_model(model_id)
    
    # Build messages
    messages = []
    if system_prompt:
        if json_mode:
            # Enforce JSON in system prompt
            system_prompt += "\n\nYou MUST respond with valid JSON only. Do not include any text outside the JSON object."
        messages.append({"role": "system", "content": system_prompt})
    
    messages.append({"role": "user", "content": prompt})
    
    # Prepare completion kwargs
    kwargs = {
        "model": resolved_model,
        "messages": messages,
        "temperature": 0.7,
    }
    
    # Add JSON mode if supported
    if json_mode:
        # Check if model supports response_format
        if "gpt-" in resolved_model or "o1-" in resolved_model or "gemini-1.5-pro" in resolved_model:
            kwargs["response_format"] = {"type": "json_object"}
    
    # Execute LLM call
    ok = False
    response_data = None
    error_message = None
    prompt_tokens = 0
    completion_tokens = 0
    total_tokens = 0
    cost_usd = None
    
    try:
        log(f"Calling {resolved_model} (json_mode={json_mode})...")
        response = completion(**kwargs)
        
        # Extract content
        content = response.choices[0].message.content
        
        # Parse JSON if required
        if json_mode:
            response_data = extract_json_from_text(content)
            if response_data is None:
                error_message = f"Failed to extract valid JSON from response: {content[:200]}"
                log(f"ERROR: {error_message}")
            else:
                ok = True
        else:
            response_data = {"content": content}
            ok = True
        
        # Extract usage stats
        if hasattr(response, 'usage') and response.usage:
            prompt_tokens = getattr(response.usage, 'prompt_tokens', 0)
            completion_tokens = getattr(response.usage, 'completion_tokens', 0)
            total_tokens = getattr(response.usage, 'total_tokens', 0)
        
        # Calculate cost (LiteLLM provides this)
        if hasattr(response, '_hidden_params') and 'response_cost' in response._hidden_params:
            cost_usd = response._hidden_params['response_cost']
        
    except Exception as e:
        error_message = str(e)
        log(f"LLM call failed: {error_message}")
        ok = False
    
    # Calculate duration
    duration_ms = int((time.time() - start_time) * 1000)
    
    # Log to database
    try:
        conn = sqlite3.connect(db_path)
        c = conn.cursor()
        c.execute('''INSERT INTO llm_calls 
                     (execution_id, niche_id, role, model_id, resolved_model, 
                      prompt_tokens, completion_tokens, total_tokens, cost_usd, 
                      duration_ms, ok, error_message, timestamp)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)''',
                  (execution_id, niche_id, role, model_id, resolved_model,
                   prompt_tokens, completion_tokens, total_tokens, cost_usd,
                   duration_ms, 1 if ok else 0, error_message, time.time()))
        conn.commit()
        conn.close()
        log(f"Logged LLM call: {total_tokens} tokens, {duration_ms}ms, cost=${cost_usd or 0:.6f}")
    except Exception as db_error:
        log(f"WARNING: Failed to log to database: {db_error}")
    
    return (ok, response_data, error_message)

# --- CONVENIENCE FUNCTIONS ---
def call_cheap(prompt: str, system_prompt: Optional[str] = None, **kwargs) -> Tuple[bool, Optional[Dict], Optional[str]]:
    """Call cheap model for fast tasks"""
    return call_model(prompt, system_prompt, model_id="cheap", **kwargs)

def call_smart(prompt: str, system_prompt: Optional[str] = None, **kwargs) -> Tuple[bool, Optional[Dict], Optional[str]]:
    """Call smart model for complex reasoning"""
    return call_model(prompt, system_prompt, model_id="smart", **kwargs)

def call_json(prompt: str, system_prompt: Optional[str] = None, model_id: str = "smart", **kwargs) -> Tuple[bool, Optional[Dict], Optional[str]]:
    """Call model with JSON mode enforced"""
    return call_model(prompt, system_prompt, model_id=model_id, json_mode=True, **kwargs)

# --- INITIALIZATION ---
# Auto-initialize database on import
try:
    init_llm_database()
except Exception as e:
    log(f"WARNING: Could not initialize database: {e}")

if __name__ == "__main__":
    # Test the LLM core
    print("Testing LLM Core...")
    
    # Test 1: Simple call
    ok, response, error = call_cheap("Say hello in one sentence.", execution_id="test-001", role="test")
    print(f"\nTest 1 - Simple Call:")
    print(f"  OK: {ok}")
    print(f"  Response: {response}")
    print(f"  Error: {error}")
    
    # Test 2: JSON mode
    ok, response, error = call_json(
        "Generate a JSON object with keys 'name' and 'age' for a fictional character.",
        system_prompt="You are a helpful assistant.",
        execution_id="test-002",
        role="test"
    )
    print(f"\nTest 2 - JSON Mode:")
    print(f"  OK: {ok}")
    print(f"  Response: {response}")
    print(f"  Error: {error}")
