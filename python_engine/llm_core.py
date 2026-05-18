"""
LLM Core - Hierarchical Intelligence Engine for Agency OS
==========================================================
Provides production-grade LLM integration with:
- Model routing (cheap/smart)
- JSON mode enforcement
- Cost tracking and usage logging
- Comprehensive error handling
- SQLite persistence
- Direct provider adapters (OpenAI / Anthropic / Gemini / Vertex)

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
from urllib import error as urlerror
from urllib import request as urlrequest

try:
    from state_paths import default_cognitive_db_path
except ImportError:  # pragma: no cover - package import path
    from python_engine.state_paths import default_cognitive_db_path

# Load environment variables
load_dotenv()

# --- CONFIGURATION ---
DEFAULT_CHEAP_MODEL = os.getenv("CHEAP_MODEL", "gemini/gemini-1.5-flash")
DEFAULT_SMART_MODEL = os.getenv("SMART_MODEL", "anthropic/claude-3-5-sonnet-20241022")
DEFAULT_EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "openai/text-embedding-3-small")
OPENAI_EMBEDDINGS_URL = os.getenv("OPENAI_EMBEDDINGS_URL", "https://api.openai.com/v1/embeddings")
OPENAI_CHAT_COMPLETIONS_URL = os.getenv("OPENAI_CHAT_COMPLETIONS_URL", "https://api.openai.com/v1/chat/completions")
ANTHROPIC_MESSAGES_URL = os.getenv("ANTHROPIC_MESSAGES_URL", "https://api.anthropic.com/v1/messages")

PROVIDER_COST_PER_1K = {
    "openai": {"input": 0.0050, "output": 0.0150},
    "anthropic": {"input": 0.0030, "output": 0.0150},
    "gemini": {"input": 0.0010, "output": 0.0030},
    "vertex": {"input": 0.0010, "output": 0.0030},
}

# --- LOGGING ---
def log(msg: str):
    """Log to STDERR only (STDOUT reserved for JSON output)"""
    sys.stderr.write(f"[LLM_CORE] {msg}\n")
    sys.stderr.flush()

# --- EMBEDDINGS ---
def get_embedding(text: str, model_id: Optional[str] = None) -> list[float]:
    """Get vector embedding for text using the direct OpenAI embeddings API."""
    model = model_id or DEFAULT_EMBEDDING_MODEL
    provider = infer_provider(model)
    if provider != "openai":
        log(f"Embedding provider '{provider}' is not supported by llm_core.")
        return []
    api_key = str(os.getenv("OPENAI_API_KEY") or "").strip()
    if not api_key:
        log("Embedding failed: OPENAI_API_KEY is not configured.")
        return []
    try:
        payload = json.dumps({
            "model": model.split("/", 1)[1] if "/" in model else model,
            "input": [text],
        }).encode("utf-8")
        request = urlrequest.Request(
            OPENAI_EMBEDDINGS_URL,
            data=payload,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            method="POST",
        )
        with urlrequest.urlopen(request, timeout=30) as response:
            body = json.loads(response.read().decode("utf-8"))
        data = body.get("data") if isinstance(body, dict) else None
        if isinstance(data, list) and data and isinstance(data[0], dict):
            embedding = data[0].get("embedding")
            if isinstance(embedding, list):
                return [float(value) for value in embedding]
        return []
    except urlerror.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="ignore") if hasattr(exc, "read") else str(exc)
        log(f"Embedding failed: {detail}")
    except Exception as e:
        log(f"Embedding failed: {e}")
        return []


def infer_provider(model_name: Optional[str]) -> str:
    raw = str(model_name or "").strip().lower()
    if raw.startswith("anthropic/") or raw.startswith("claude"):
        return "anthropic"
    if raw.startswith("gemini/") or raw.startswith("gemini"):
        return "gemini"
    if raw.startswith("vertex_ai/") or raw.startswith("vertex"):
        return "vertex"
    return "openai"


def http_json_request(
    url: str,
    *,
    payload: Optional[Dict[str, Any]] = None,
    headers: Optional[Dict[str, str]] = None,
    timeout: int = 60,
) -> Dict[str, Any]:
    body = json.dumps(payload).encode("utf-8") if payload is not None else None
    request = urlrequest.Request(
        url,
        data=body,
        headers=headers or {},
        method="POST" if payload is not None else "GET",
    )
    try:
        with urlrequest.urlopen(request, timeout=timeout) as response:
            raw = response.read().decode("utf-8")
            parsed = json.loads(raw) if raw else {}
            return {
                "status": int(getattr(response, "status", response.getcode())),
                "json": parsed if isinstance(parsed, dict) else {},
                "text": raw,
            }
    except urlerror.HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="ignore") if hasattr(exc, "read") else ""
        try:
            parsed = json.loads(raw) if raw else {}
        except Exception:
            parsed = {}
        return {
            "status": int(getattr(exc, "code", 500)),
            "json": parsed if isinstance(parsed, dict) else {},
            "text": raw,
        }


def error_detail(response: Dict[str, Any]) -> str:
    body = response.get("json")
    if isinstance(body, dict):
        if isinstance(body.get("error"), dict):
            message = body["error"].get("message")
            if isinstance(message, str) and message.strip():
                return message.strip()
        detail = body.get("detail")
        if isinstance(detail, str) and detail.strip():
            return detail.strip()
    return str(response.get("text") or "").strip()


def direct_provider_completion(
    *,
    provider: str,
    model: str,
    system_prompt: Optional[str],
    user_prompt: str,
    temperature: float,
    max_tokens: int,
) -> Dict[str, Any]:
    if provider == "openai":
        api_key = str(os.getenv("OPENAI_API_KEY") or os.getenv("OPENAI_ACCESS_TOKEN") or "").strip()
        if not api_key:
            raise RuntimeError("OPENAI_API_KEY or OPENAI_ACCESS_TOKEN is required.")
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": user_prompt})
        response = http_json_request(
            OPENAI_CHAT_COMPLETIONS_URL,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            payload={
                "model": model.split("/", 1)[1] if "/" in model else model,
                "messages": messages,
                "temperature": temperature,
                "max_tokens": max_tokens,
            },
        )
        if int(response.get("status") or 500) >= 400:
            raise RuntimeError(error_detail(response) or f"OpenAI request failed ({response.get('status')}).")
        body = response.get("json") if isinstance(response.get("json"), dict) else {}
        choices = body.get("choices") if isinstance(body.get("choices"), list) else []
        content = ""
        if choices and isinstance(choices[0], dict):
            message = choices[0].get("message") if isinstance(choices[0].get("message"), dict) else {}
            content = str(message.get("content") or "")
        usage = body.get("usage") if isinstance(body.get("usage"), dict) else {}
        return {"content": content, "usage": usage}

    if provider == "anthropic":
        api_key = str(os.getenv("ANTHROPIC_API_KEY") or "").strip()
        if not api_key:
            raise RuntimeError("ANTHROPIC_API_KEY is required.")
        payload: Dict[str, Any] = {
            "model": model.split("/", 1)[1] if "/" in model else model,
            "messages": [{"role": "user", "content": user_prompt}],
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        if system_prompt:
            payload["system"] = system_prompt
        response = http_json_request(
            ANTHROPIC_MESSAGES_URL,
            headers={
                "x-api-key": api_key,
                "anthropic-version": "2023-06-01",
                "Content-Type": "application/json",
            },
            payload=payload,
        )
        if int(response.get("status") or 500) >= 400:
            raise RuntimeError(error_detail(response) or f"Anthropic request failed ({response.get('status')}).")
        body = response.get("json") if isinstance(response.get("json"), dict) else {}
        content_parts = []
        for item in body.get("content", []) if isinstance(body.get("content"), list) else []:
            if isinstance(item, dict) and str(item.get("type") or "").strip().lower() == "text":
                text = item.get("text")
                if isinstance(text, str) and text:
                    content_parts.append(text)
        usage = body.get("usage") if isinstance(body.get("usage"), dict) else {}
        return {"content": "".join(content_parts), "usage": usage}

    if provider == "gemini":
        api_key = str(os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY") or "").strip()
        if not api_key:
            raise RuntimeError("GEMINI_API_KEY or GOOGLE_API_KEY is required.")
        payload: Dict[str, Any] = {
            "contents": [{"role": "user", "parts": [{"text": user_prompt}]}],
            "generationConfig": {
                "temperature": temperature,
                "maxOutputTokens": max_tokens,
            },
        }
        if system_prompt:
            payload["systemInstruction"] = {"parts": [{"text": system_prompt}]}
        model_name = model.split("/", 1)[1] if "/" in model else model
        response = http_json_request(
            f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={api_key}",
            headers={"Content-Type": "application/json"},
            payload=payload,
        )
        if int(response.get("status") or 500) >= 400:
            raise RuntimeError(error_detail(response) or f"Gemini request failed ({response.get('status')}).")
        body = response.get("json") if isinstance(response.get("json"), dict) else {}
        text_parts = []
        for candidate in body.get("candidates", []) if isinstance(body.get("candidates"), list) else []:
            if not isinstance(candidate, dict):
                continue
            content = candidate.get("content") if isinstance(candidate.get("content"), dict) else {}
            for part in content.get("parts", []) if isinstance(content.get("parts"), list) else []:
                if isinstance(part, dict):
                    text = part.get("text")
                    if isinstance(text, str) and text.strip():
                        text_parts.append(text.strip())
        usage = body.get("usageMetadata") if isinstance(body.get("usageMetadata"), dict) else {}
        return {"content": "\n".join(text_parts), "usage": usage}

    if provider == "vertex":
        token = str(os.getenv("VERTEX_ACCESS_TOKEN") or "").strip()
        project = str(os.getenv("VERTEX_PROJECT_ID") or "").strip()
        location = str(os.getenv("VERTEX_LOCATION") or "us-central1").strip()
        if not token or not project:
            raise RuntimeError("VERTEX_ACCESS_TOKEN and VERTEX_PROJECT_ID are required.")
        model_name = model.split("/", 1)[1] if "/" in model else model
        payload: Dict[str, Any] = {
            "contents": [{"role": "user", "parts": [{"text": user_prompt}]}],
        }
        if system_prompt:
            payload["systemInstruction"] = {"parts": [{"text": system_prompt}]}
        response = http_json_request(
            f"https://{location}-aiplatform.googleapis.com/v1/projects/{project}/locations/{location}/publishers/google/models/{model_name}:generateContent",
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
            },
            payload=payload,
        )
        if int(response.get("status") or 500) >= 400:
            raise RuntimeError(error_detail(response) or f"Vertex request failed ({response.get('status')}).")
        body = response.get("json") if isinstance(response.get("json"), dict) else {}
        text_parts = []
        for candidate in body.get("candidates", []) if isinstance(body.get("candidates"), list) else []:
            if not isinstance(candidate, dict):
                continue
            content = candidate.get("content") if isinstance(candidate.get("content"), dict) else {}
            for part in content.get("parts", []) if isinstance(content.get("parts"), list) else []:
                if isinstance(part, dict):
                    text = part.get("text")
                    if isinstance(text, str) and text.strip():
                        text_parts.append(text.strip())
        usage = body.get("usageMetadata") if isinstance(body.get("usageMetadata"), dict) else {}
        return {"content": "\n".join(text_parts), "usage": usage}

    raise RuntimeError(f"Unsupported provider '{provider}'.")

# --- DATABASE INITIALIZATION ---
def init_llm_database(db_path: Optional[str] = None):
    """Initialize the llm_calls table in the cognitive state database."""
    resolved_db_path = db_path or default_cognitive_db_path()
    os.makedirs(os.path.dirname(resolved_db_path) or ".", exist_ok=True)
    conn = sqlite3.connect(resolved_db_path)
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
    log(f"Database initialized: {resolved_db_path}")

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


def estimate_cost_usd(provider: str, prompt_tokens: int, completion_tokens: int) -> Optional[float]:
    rates = PROVIDER_COST_PER_1K.get(provider)
    if not isinstance(rates, dict):
        return None
    input_rate = float(rates.get("input", 0.0) or 0.0)
    output_rate = float(rates.get("output", 0.0) or 0.0)
    return round(((prompt_tokens / 1000.0) * input_rate) + ((completion_tokens / 1000.0) * output_rate), 6)


def credentials_from_env(provider: str) -> Dict[str, Any]:
    return {"configured": provider in {"openai", "anthropic", "gemini", "vertex"}}

# --- CORE LLM CALL FUNCTION ---
def call_model(
    prompt: str,
    system_prompt: Optional[str] = None,
    model_id: str = "cheap",
    json_mode: bool = False,
    execution_id: Optional[str] = None,
    niche_id: Optional[str] = None,
    role: Optional[str] = None,
    db_path: Optional[str] = None
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
    resolved_db_path = db_path or default_cognitive_db_path()
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
        provider = infer_provider(resolved_model)
        credentials = credentials_from_env(provider)
        if not credentials:
            raise RuntimeError(f"No environment credential configured for provider '{provider}'.")
        response = direct_provider_completion(
            provider=provider,
            model=resolved_model,
            system_prompt=system_prompt,
            user_prompt=prompt,
            temperature=0.7,
            max_tokens=1024,
        )
        content = str(response.get("content") or "")
        
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
        
        usage = response.get("usage") if isinstance(response, dict) else {}
        if isinstance(usage, dict):
            prompt_tokens = int(usage.get("prompt_tokens") or 0)
            completion_tokens = int(usage.get("completion_tokens") or 0)
            total_tokens = int(usage.get("total_tokens") or (prompt_tokens + completion_tokens))
        cost_usd = estimate_cost_usd(provider, prompt_tokens, completion_tokens)
        
    except Exception as e:
        error_message = str(e)
        log(f"LLM call failed: {error_message}")
        ok = False
    
    # Calculate duration
    duration_ms = int((time.time() - start_time) * 1000)
    
    # Log to database
    try:
        os.makedirs(os.path.dirname(resolved_db_path) or ".", exist_ok=True)
        conn = sqlite3.connect(resolved_db_path)
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
