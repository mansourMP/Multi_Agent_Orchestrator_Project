import sys
import os
import yaml
import json
import hashlib
import sqlite3
import argparse
import uuid
import time
from typing import Any, List, Optional

try:
    from state_paths import default_cognitive_db_path
except ImportError:  # pragma: no cover - package import path
    from python_engine.state_paths import default_cognitive_db_path

# Import LLM Core
try:
    from llm_core import call_model, call_cheap, call_smart, call_json, init_llm_database
except ImportError:
    sys.stderr.write("[AGENCY_LOGIC] ERROR: llm_core.py not found in same directory\n")
    sys.exit(1)

# Import Memory Manager (Unified World Model)
try:
    from memory_manager import MemoryManager
    MEMORY_AVAILABLE = True
except ImportError:
    sys.stderr.write("[AGENCY_LOGIC] WARNING: memory_manager.py not found. Persistent memory disabled.\n")
    MEMORY_AVAILABLE = False

# Import Agent Identity (AC-OS Diamond Feature)
try:
    from agent_identity import AgentIdentity, SafetyGuard, GlobalKnowledge
    IDENTITY_AVAILABLE = True
except ImportError:
    sys.stderr.write("[AGENCY_LOGIC] WARNING: agent_identity.py not found. Identity features disabled.\n")
    IDENTITY_AVAILABLE = False

# Import Cognitive Loop (Observe -> Orient -> Decide -> Act)
try:
    from cognitive_loop import CognitiveLoop
    COGNITIVE_LOOP_AVAILABLE = True
except ImportError:
    sys.stderr.write("[AGENCY_LOGIC] WARNING: cognitive_loop.py not found. Cognitive loop disabled.\n")
    COGNITIVE_LOOP_AVAILABLE = False

# Import Cognitive Daemon controls (queue + start/stop/status)
try:
    from cognitive_daemon import (
        daemon_status,
        enqueue_event,
        start_daemon,
        stop_daemon,
    )
    COGNITIVE_DAEMON_AVAILABLE = True
except ImportError:
    sys.stderr.write("[AGENCY_LOGIC] WARNING: cognitive_daemon.py not found. Daemon controls disabled.\n")
    COGNITIVE_DAEMON_AVAILABLE = False

# --- HELPER: ROBUST LOGGING & OUTPUT ---
def log(msg):
    sys.stderr.write(f"[AGENCY_LOGIC] {msg}\n")
    sys.stderr.flush()

def output_result(ok, step, data, error=None):
    result = {
        "ok": ok,
        "step": step,
        "data": data
    }
    if error:
        result["error"] = error
    print(json.dumps(result)) # STDOUT IS JSON ONLY
    sys.stdout.flush()

# --- AGENCY CORE ---
class AgencyLogic:
    def __init__(self, niche_config, db_path: Optional[str] = None, execution_id=None):
        self.config = niche_config
        self.db_path = db_path or default_cognitive_db_path()
        self.execution_id = execution_id or f"exec-{uuid.uuid4().hex[:8]}"
        self._init_memory()
        
        # Initialize Memory Manager
        if MEMORY_AVAILABLE:
            self.memory = MemoryManager(sqlite_path=self.db_path)
            log(f"Unified World Model (Memory) initialized for niche: {niche_config.get('id')}")
        else:
            self.memory = None

        # Initialize AC-OS Identity System
        if IDENTITY_AVAILABLE:
            self.identity = AgentIdentity(niche_config.get('id', 'default'), self.db_path)
            self.safety_guard = SafetyGuard(self.db_path)
            self.global_knowledge = GlobalKnowledge(self.db_path)
            log(f"AC-OS Identity initialized for niche: {niche_config.get('id')}")
        else:
            self.identity = None
            self.safety_guard = None
            self.global_knowledge = None

        # Initialize Cognitive Loop
        if COGNITIVE_LOOP_AVAILABLE:
            self.cognitive_loop = CognitiveLoop(
                memory=self.memory,
                niche_id=niche_config.get('id', 'default'),
                execution_id=self.execution_id,
            )
        else:
            self.cognitive_loop = None

    def _init_memory(self):
        """Initialize database with enhanced schema"""
        init_llm_database(self.db_path)
        
        # Add global_context table for network effect tracking
        conn = sqlite3.connect(self.db_path)
        c = conn.cursor()
        c.execute('''CREATE TABLE IF NOT EXISTS global_context
                     (topic_hash TEXT, niche_id TEXT, timestamp REAL)''')
        conn.commit()
        conn.close()

    def check_network_effect(self, topic):
        """Constraint 2 implementation"""
        log(f"Checking network effect for topic: {topic}")
        topic_hash = hashlib.sha256(topic.encode()).hexdigest()
        conn = sqlite3.connect(self.db_path)
        c = conn.cursor()
        c.execute("SELECT niche_id FROM global_context WHERE topic_hash=? AND niche_id != ?", 
                  (topic_hash, self.config['id']))
        result = c.fetchone()
        conn.close()
        
        if result:
            return {"decision": "REJECT_DUPLICATE", "match": result[0]}
        
        # Determine strict uniqueness or soft check logic here
        return {"decision": "APPROVE", "topic_hash": topic_hash}

    def execute_critic_eval(self, draft, node_id=None):
        """
        Constraint 4 implementation: Single Pass Eval with Real LLM
        Uses SMART model for high-quality critique with JSON output
        """
        log(f"Evaluating draft len={len(draft)} with SMART model")
        
        # Build critique prompt based on niche values
        values_str = ", ".join(self.config.get('values', []))
        identity = self.config.get('identity_prompt', 'You are a neutral assistant focused on quality and safety.')
        
        system_prompt = f"""{identity}

Your task is to evaluate content based on these core values: {values_str}

You must respond with a valid JSON object with this exact structure:
{{
  "decision": "APPROVE" | "REVISE" | "ESCALATE_HUMAN",
  "scores": {{
    "overall": <float 0-5>,
    "clarity": <float 0-5>,
    "brand_fit": <float 0-5>,
    "accuracy": <float 0-5>
  }},
  "blocking_issues": [<list of critical problems>],
  "suggested_edits": [<list of improvement suggestions>],
  "escalation_reason": "<only if ESCALATE_HUMAN, explain why>"
}}

Decision criteria:
- APPROVE: overall >= 4.5 and no blocking issues
- REVISE: overall >= 3.0 but has fixable issues
- ESCALATE_HUMAN: overall < 3.0 OR contains sensitive/risky content OR violates core values
"""
        
        prompt = f"Evaluate this draft:\n\n{draft}"
        
        # Call SMART model with JSON mode
        ok, response, error = call_json(
            prompt=prompt,
            system_prompt=system_prompt,
            model_id="smart",
            execution_id=self.execution_id,
            niche_id=self.config.get('id'),
            role="critic",
            db_path=self.db_path
        )
        
        if not ok:
            log(f"Critic eval failed: {error}")
            return {
                "decision": "ESCALATE_HUMAN",
                "scores": {"overall": 0, "clarity": 0, "brand_fit": 0, "accuracy": 0},
                "blocking_issues": [f"LLM Error: {error}"],
                "suggested_edits": [],
                "escalation_reason": f"Critic evaluation failed: {error}"
            }
        
        # Validate response structure
        required_keys = ["decision", "scores", "blocking_issues", "suggested_edits"]
        if not all(key in response for key in required_keys):
            log(f"Invalid critic response structure: {response}")
            return {
                "decision": "ESCALATE_HUMAN",
                "scores": {"overall": 0, "clarity": 0, "brand_fit": 0, "accuracy": 0},
                "blocking_issues": ["Invalid critic response format"],
                "suggested_edits": [],
                "escalation_reason": "Critic returned malformed response"
            }
        
        # If escalation is needed, create safety ticket
        if response["decision"] == "ESCALATE_HUMAN":
            ticket_id = self.create_safety_ticket(
                type_="CRITIC_ESCALATION",
                data={
                    "draft": draft[:500],  # Preview only
                    "critique": response,
                    "niche_id": self.config.get('id'),
                    "execution_id": self.execution_id,
                    "node_id": node_id
                },
                node_id=node_id,
                reason=response.get("escalation_reason", "Critic flagged for human review")
            )
            log(f"Created safety ticket: {ticket_id}")
            response["safety_ticket_id"] = ticket_id
        
        return response
        
    def create_safety_ticket(self, type_, data, node_id=None, reason=None):
        """Create enhanced safety ticket with full metadata"""
        ticket_id = uuid.uuid4().hex
        conn = sqlite3.connect(self.db_path)
        c = conn.cursor()
        c.execute('''INSERT INTO safety_tickets 
                     (id, execution_id, niche_id, node_id, action_type, reason, 
                      payload_path, preview, status, created_at, resolved_at, resolved_by)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)''',
                  (ticket_id, self.execution_id, self.config.get('id'), node_id, 
                   type_, reason, None, json.dumps(data), 'PENDING', 
                   time.time(), None, None))
        conn.commit()
        conn.close()
        return ticket_id
    
    def researcher_brief(self, topic, node_id=None):
        """
        Generate research brief using CHEAP model for fast drafting.
        Returns structured JSON with key findings and sources.
        """
        log(f"Generating research brief for topic: {topic}")
        
        identity = self.config.get('identity_prompt', 'You are a neutral assistant focused on clear research output.')
        values_str = ", ".join(self.config.get('values', []))
        
        system_prompt = f"""{identity}

Your task is to create a research brief on the given topic.
Core values to uphold: {values_str}

Respond with valid JSON in this structure:
{{
  "topic": "<topic>",
  "key_findings": [<list of 3-5 key points>],
  "sources": [<list of credible sources or "needs verification">],
  "angle": "<unique perspective or hook>",
  "confidence": <float 0-1>
}}
"""
        
        prompt = f"Create a research brief for: {topic}"
        
        ok, response, error = call_json(
            prompt=prompt,
            system_prompt=system_prompt,
            model_id="cheap",
            execution_id=self.execution_id,
            niche_id=self.config.get('id'),
            role="researcher",
            db_path=self.db_path
        )
        
        if not ok:
            log(f"Research brief failed: {error}")
            return {
                "ok": False,
                "error": error,
                "topic": topic,
                "key_findings": [],
                "sources": [],
                "angle": "",
                "confidence": 0.0
            }
        
        response["ok"] = True
        return response
    
    # =========================================================================
    # AC-OS IDENTITY METHODS (Diamond Features)
    # =========================================================================
    
    def sign_publish_action(self, content: str, platform: str, media_path: str = None, node_id: str = None):
        """
        Sign a publish action with cryptographic identity and check safety limits.
        
        This is the core AC-OS "Know Your Agent" implementation:
        1. Cryptographically sign the content with the agent's private key
        2. Check rate limits via Safety Guard
        3. Return signed action or safety ticket if blocked
        
        Args:
            content: The content to publish
            platform: Target platform (twitter, linkedin, etc.)
            media_path: Optional path to media file
            node_id: Workflow node ID for tracking
        
        Returns:
            Dict with signed action or safety ticket
        """
        if not IDENTITY_AVAILABLE or not self.identity:
            log("Identity system not available, proceeding unsigned")
            return {
                "ok": True,
                "signed": False,
                "warning": "Identity system not available",
                "content_hash": hashlib.sha256(content.encode()).hexdigest()
            }
        
        # Sign the action
        metadata = {
            "platform": platform,
            "media_path": media_path,
            "execution_id": self.execution_id,
            "node_id": node_id,
            "content_length": len(content)
        }
        
        signed_action = self.identity.sign_action(content, "PUBLISH", metadata)
        
        # Check safety limits
        allowed, reason = self.safety_guard.check_action(
            self.config.get('id'),
            "PUBLISH",
            signed_action
        )
        
        if not allowed:
            log(f"PUBLISH action blocked: {reason}")
            return {
                "ok": False,
                "signed": True,
                "blocked": True,
                "reason": reason,
                "signed_action": signed_action,
                "requires_approval": True
            }
        
        log(f"PUBLISH action signed and approved: {signed_action['action_hash'][:16]}...")
        return {
            "ok": True,
            "signed": True,
            "blocked": False,
            "signed_action": signed_action
        }
    
    def get_cross_niche_insights(self, heuristic_type: str = None, limit: int = 5):
        """
        Get insights from other niches (Multiplayer Knowledge Graph).
        
        This enables the network effect where agents learn from each other.
        
        Args:
            heuristic_type: Optional filter ("format", "timing", "engagement", "content")
            limit: Maximum insights to return
        
        Returns:
            List of relevant insights from other niches
        """
        if not IDENTITY_AVAILABLE or not self.global_knowledge:
            return {"ok": False, "error": "Knowledge graph not available", "insights": []}
        
        insights = self.global_knowledge.get_insights_for_niche(
            self.config.get('id'),
            heuristic_type,
            limit
        )
        
        return {
            "ok": True,
            "niche_id": self.config.get('id'),
            "insights": insights,
            "count": len(insights)
        }
    
    def share_insight(self, heuristic_type: str, insight: str, confidence: float = 0.5):
        """
        Share an insight to the global knowledge graph.
        
        Called after successful actions to propagate learnings to other niches.
        
        Args:
            heuristic_type: Category ("format", "timing", "engagement", "content")
            insight: The insight text (e.g., "Code snippets boost engagement 40%")
            confidence: Initial confidence score (0-1)
        
        Returns:
            Dict with insight ID
        """
        if not IDENTITY_AVAILABLE or not self.global_knowledge:
            return {"ok": False, "error": "Knowledge graph not available"}
        
        insight_id = self.global_knowledge.add_insight(
            self.config.get('id'),
            heuristic_type,
            insight,
            confidence
        )
        
        return {
            "ok": True,
            "insight_id": insight_id,
            "source_niche": self.config.get('id'),
            "heuristic_type": heuristic_type
        }
    
    def get_agent_identity_info(self):
        """Get the agent's public identity information"""
        if not IDENTITY_AVAILABLE or not self.identity:
            return {"ok": False, "error": "Identity system not available"}
        
        info = self.identity.get_identity_info()
        info["ok"] = True
        return info
    
    def get_safety_status(self):
        """Get current safety system status"""
        if not IDENTITY_AVAILABLE or not self.safety_guard:
            return {"ok": False, "error": "Safety system not available"}
        
        status = self.safety_guard.get_safety_status()
        status["ok"] = True
        status["niche_id"] = self.config.get('id')
        return status

    # =========================================================================
    # COGNITIVE LOOP METHODS
    # =========================================================================

    def cognitive_tick(self, event: Any, k: int = 5):
        if not self.cognitive_loop:
            return {"ok": False, "error": "Cognitive loop not available"}
        return {
            "ok": True,
            "execution_id": self.execution_id,
            "niche_id": self.config.get('id'),
            "tick": self.cognitive_loop.tick(event, k=k),
        }

    def cognitive_run(self, events: List[Any], k: int = 5, max_steps: int = 50):
        if not self.cognitive_loop:
            return {"ok": False, "error": "Cognitive loop not available"}
        return {
            "ok": True,
            "execution_id": self.execution_id,
            "niche_id": self.config.get('id'),
            "run": self.cognitive_loop.run(events, k=k, max_steps=max_steps),
        }

def load_niche_config(niche_id):
    import os
    from pathlib import Path

    project_root = Path(__file__).resolve().parent.parent
    configured_path = os.getenv("EMPYRALIS_NICHES_FILE") or os.getenv("ORION_NICHES_FILE")
    possible_paths = []
    if configured_path:
        possible_paths.append(Path(configured_path).expanduser())
    possible_paths.extend(
        [
            Path.cwd() / "config" / "niches.yaml",
            project_root / "config" / "niches.yaml",
            Path.cwd().parent / "config" / "niches.yaml",
        ]
    )
    
    config_content = None
    for path in possible_paths:
        if path.exists():
            try:
                with path.open('r', encoding='utf-8') as f:
                    config_content = yaml.safe_load(f)
                break
            except Exception:
                continue
                
    if not config_content:
        return None
        
    if 'niches' in config_content:
        return config_content['niches'].get(niche_id)
    return config_content.get(niche_id)

# --- CLI ENTRYPOINT ---
if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("niche_id")
    parser.add_argument("action")
    parser.add_argument("--in", dest="input_file", help="Path to JSON input file (recommended)")
    parser.add_argument("--json-input", default=None, help="JSON string input (fragile, avoid)")
    args = parser.parse_args()

    # 1. READ INPUT (File > Flag > Stdin)
    try:
        if args.input_file:
            with open(args.input_file, 'r') as f:
                 input_data = json.load(f)
        elif args.json_input:
            input_data = json.loads(args.json_input)
        else:
            # Read from stdin
            if not sys.stdin.isatty():
                input_content = sys.stdin.read().strip()
                if input_content:
                    input_data = json.loads(input_content)
                else:
                    output_result(False, "init", {}, {"code": "NO_INPUT", "message": "No input provided via file, flag, or stdin"})
                    sys.exit(1)
            else:
                 output_result(False, "init", {}, {"code": "NO_INPUT", "message": "No input provided"})
                 sys.exit(1)
    except Exception as e:
        output_result(False, "init", {}, {"code": "INVALID_INPUT", "message": str(e)})
        sys.exit(1)

    # 2. LOAD CONFIG
    niche_config = load_niche_config(args.niche_id)
    if not niche_config:
        output_result(False, "init", {}, {"code": "NICHE_NOT_FOUND", "message": f"Niche {args.niche_id} not found. Check config/niches.yaml"})
        sys.exit(1)

    # Extract execution_id from payload (required for tracking)
    execution_id = input_data.get('execution_id', f"exec-{uuid.uuid4().hex[:8]}")
    node_id = input_data.get('node_id')
    
    agency = AgencyLogic(niche_config, execution_id=execution_id)

    # 3. ROUTE ACTION
    try:
        if args.action == "check_network":
            topic = input_data.get('topic')
            data = agency.check_network_effect(topic)
            output_result(True, "check_network", data)

        elif args.action == "critic_eval":
            draft = input_data.get('draft')
            data = agency.execute_critic_eval(draft, node_id=node_id)
            output_result(True, "critic_eval", data)
        
        elif args.action == "researcher_brief":
            topic = input_data.get('topic')
            data = agency.researcher_brief(topic, node_id=node_id)
            output_result(True, "researcher_brief", data)
            
        elif args.action == "safety_ticket":
            ticket_id = agency.create_safety_ticket(
                input_data.get('type'), 
                input_data.get('data'),
                node_id=node_id,
                reason=input_data.get('reason')
            )
            output_result(True, "safety_ticket", {"ticket_id": ticket_id, "status": "PENDING"})

        # =====================================================================
        # AC-OS IDENTITY ACTIONS (Diamond Features)
        # =====================================================================
        
        elif args.action == "sign_publish":
            # Sign a publish action with cryptographic identity
            content = input_data.get('content')
            platform = input_data.get('platform', 'unknown')
            media_path = input_data.get('media_path')
            data = agency.sign_publish_action(content, platform, media_path, node_id)
            output_result(data.get('ok', True), "sign_publish", data)
        
        elif args.action == "get_insights":
            # Get cross-niche insights from knowledge graph
            heuristic_type = input_data.get('heuristic_type')
            limit = input_data.get('limit', 5)
            data = agency.get_cross_niche_insights(heuristic_type, limit)
            output_result(data.get('ok', True), "get_insights", data)
        
        elif args.action == "share_insight":
            # Share an insight to the global knowledge graph
            heuristic_type = input_data.get('heuristic_type')
            insight = input_data.get('insight')
            confidence = input_data.get('confidence', 0.5)
            data = agency.share_insight(heuristic_type, insight, confidence)
            output_result(data.get('ok', True), "share_insight", data)
        
        elif args.action == "identity_info":
            # Get agent's public identity information
            data = agency.get_agent_identity_info()
            output_result(data.get('ok', True), "identity_info", data)
        
        elif args.action == "safety_status":
            # Get current safety system status
            data = agency.get_safety_status()
            output_result(data.get('ok', True), "safety_status", data)

        # =====================================================================
        # MEMORY ACTIONS (Unified World Model)
        # =====================================================================

        elif args.action == "upsert_memory":
            if not agency.memory:
                raise RuntimeError("Memory system not available")
            text = input_data.get('text')
            if not isinstance(text, str) or not text.strip():
                raise RuntimeError("upsert_memory requires non-empty 'text'.")
            metadata = input_data.get('metadata', {})
            if metadata is None:
                metadata = {}
            if not isinstance(metadata, dict):
                raise RuntimeError("upsert_memory 'metadata' must be an object.")
            metadata['execution_id'] = agency.execution_id
            metadata['niche_id'] = agency.config.get('id')
            mem_id = agency.memory.upsert_memory(text, metadata)
            output_result(True, "upsert_memory", {"id": mem_id})

        elif args.action == "search_memory":
            if not agency.memory:
                raise RuntimeError("Memory system not available")
            query = input_data.get('query')
            if not isinstance(query, str) or not query.strip():
                raise RuntimeError("search_memory requires non-empty 'query'.")
            k = input_data.get('k', 5)
            try:
                k = int(k)
            except Exception:
                raise RuntimeError("search_memory 'k' must be an integer.")
            if k < 1:
                raise RuntimeError("search_memory 'k' must be >= 1.")
            if k > 50:
                k = 50
            results = agency.memory.search_memory(query, k)
            output_result(True, "search_memory", {"results": results})

        elif args.action == "ingest_file":
            if not agency.memory:
                raise RuntimeError("Memory system not available")
            file_path = input_data.get('file_path')
            if not isinstance(file_path, str) or not file_path.strip():
                raise RuntimeError("ingest_file requires non-empty 'file_path'.")
            file_path = file_path.strip()
            if not os.path.exists(file_path):
                raise RuntimeError(f"File not found: {file_path}")
            
            with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                content = f.read()
            if not content.strip():
                raise RuntimeError(f"File is empty: {file_path}")
            
            # Simple chunking for proof of concept
            # In production, use more sophisticated recursive chunking
            chunks = [content[i:i+2000] for i in range(0, len(content), 2000)]
            log(f"Ingesting {file_path} in {len(chunks)} chunks")
            
            mem_ids = []
            for i, chunk in enumerate(chunks):
                mid = agency.memory.upsert_memory(chunk, {
                    "source": "file_ingest",
                    "file_path": file_path,
                    "chunk": i,
                    "total_chunks": len(chunks)
                })
                mem_ids.append(mid)
            
            output_result(True, "ingest_file", {"file_path": file_path, "memories": mem_ids})

        # =====================================================================
        # COGNITIVE LOOP ACTIONS
        # =====================================================================

        elif args.action == "cognitive_tick":
            if not agency.cognitive_loop:
                raise RuntimeError("Cognitive loop not available")

            event = input_data.get('event')
            if event is None:
                if isinstance(input_data, dict) and "text" in input_data:
                    event = input_data
                else:
                    raise RuntimeError("cognitive_tick requires 'event' or top-level 'text'.")

            k = input_data.get('k', 5)
            try:
                k = int(k)
            except Exception:
                raise RuntimeError("cognitive_tick 'k' must be an integer.")
            if k < 1:
                raise RuntimeError("cognitive_tick 'k' must be >= 1.")
            if k > 50:
                k = 50

            data = agency.cognitive_tick(event, k=k)
            output_result(data.get("ok", True), "cognitive_tick", data)

        elif args.action == "cognitive_run":
            if not agency.cognitive_loop:
                raise RuntimeError("Cognitive loop not available")

            events = input_data.get('events')
            if not isinstance(events, list) or not events:
                raise RuntimeError("cognitive_run requires non-empty 'events' list.")

            k = input_data.get('k', 5)
            max_steps = input_data.get('max_steps', 50)
            try:
                k = int(k)
                max_steps = int(max_steps)
            except Exception:
                raise RuntimeError("cognitive_run 'k' and 'max_steps' must be integers.")

            if k < 1:
                raise RuntimeError("cognitive_run 'k' must be >= 1.")
            if max_steps < 1:
                raise RuntimeError("cognitive_run 'max_steps' must be >= 1.")
            if max_steps > 200:
                max_steps = 200

            data = agency.cognitive_run(events, k=k, max_steps=max_steps)
            output_result(data.get("ok", True), "cognitive_run", data)

        elif args.action == "cognitive_enqueue":
            if not COGNITIVE_DAEMON_AVAILABLE:
                raise RuntimeError("Cognitive daemon controls not available")
            event = input_data.get("event")
            if event is None:
                text = input_data.get("text")
                if isinstance(text, str) and text.strip():
                    event = {"text": text.strip(), "source": input_data.get("source", "api")}
                else:
                    raise RuntimeError("cognitive_enqueue requires 'event' or non-empty 'text'.")
            event_id = enqueue_event(
                db_path=agency.db_path,
                niche_id=agency.config.get("id"),
                event=event,
                source=str(input_data.get("source", "api")),
                execution_id=input_data.get("execution_id"),
                priority=int(input_data.get("priority", 100)),
                max_attempts=int(input_data.get("max_attempts", 3)),
            )
            output_result(True, "cognitive_enqueue", {"event_id": event_id})

        elif args.action == "cognitive_daemon_status":
            if not COGNITIVE_DAEMON_AVAILABLE:
                raise RuntimeError("Cognitive daemon controls not available")
            data = daemon_status(
                niche_id=agency.config.get("id"),
                db_path=agency.db_path,
            )
            output_result(True, "cognitive_daemon_status", data)

        elif args.action == "cognitive_daemon_start":
            if not COGNITIVE_DAEMON_AVAILABLE:
                raise RuntimeError("Cognitive daemon controls not available")
            poll_seconds = float(input_data.get("poll_seconds", 2.0))
            stale_after = float(input_data.get("stale_after_seconds", 0.0))
            foreground = bool(input_data.get("foreground", False))
            data = start_daemon(
                niche_id=agency.config.get("id"),
                db_path=agency.db_path,
                poll_seconds=poll_seconds,
                stale_after_seconds=stale_after,
                foreground=foreground,
            )
            output_result(bool(data.get("ok")), "cognitive_daemon_start", data)

        elif args.action == "cognitive_daemon_stop":
            if not COGNITIVE_DAEMON_AVAILABLE:
                raise RuntimeError("Cognitive daemon controls not available")
            timeout_seconds = float(input_data.get("timeout_seconds", 5.0))
            data = stop_daemon(
                niche_id=agency.config.get("id"),
                db_path=agency.db_path,
                timeout_seconds=timeout_seconds,
            )
            output_result(bool(data.get("ok")), "cognitive_daemon_stop", data)

        else:
            output_result(False, args.action, {}, {"code": "UNKNOWN_ACTION", "message": f"Action {args.action} not recognized"})
            sys.exit(1)

    except Exception as e:
        log(f"CRITICAL ERROR: {e}")
        output_result(False, args.action, {}, {"code": "RUNTIME_ERROR", "message": str(e)})
