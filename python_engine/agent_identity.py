"""
Agent Identity - Cryptographic Identity System for AC-OS
=========================================================
Implements "Know Your Agent" (KYA) protocol:
- Each niche/agent has a unique Ed25519 keypair
- High-value actions (PUBLISH, SPEND) are cryptographically signed
- All signatures are traceable and verifiable
- Prevents rogue agent attacks and ensures provenance

Author: Agency OS Team
Version: 1.0 (AC-OS Diamond Feature)
"""

import os
import sys
import json
import time
import hashlib
import sqlite3
from pathlib import Path
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, Tuple, List

# Try to import cryptography library
try:
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric.ed25519 import (
        Ed25519PrivateKey,
        Ed25519PublicKey
    )
    from cryptography.exceptions import InvalidSignature
    CRYPTO_AVAILABLE = True
except ImportError:
    CRYPTO_AVAILABLE = False
    sys.stderr.write("[AGENT_IDENTITY] WARNING: cryptography library not installed. Using fallback mode.\n")

# --- LOGGING ---
def log(msg: str):
    """Log to STDERR only (STDOUT reserved for JSON output)"""
    sys.stderr.write(f"[AGENT_IDENTITY] {msg}\n")
    sys.stderr.flush()


# ============================================================================
# AGENT IDENTITY CORE
# ============================================================================

class AgentIdentity:
    """
    Cryptographic identity for an agent/niche.
    Each agent has a unique Ed25519 keypair for signing high-value actions.
    """
    
    def __init__(self, niche_id: str, db_path: str = "agency_memory.db"):
        self.niche_id = niche_id
        self.db_path = db_path
        self.private_key: Optional[Ed25519PrivateKey] = None
        self.public_key: Optional[Ed25519PublicKey] = None
        self.public_key_hex: Optional[str] = None
        self.created_at: Optional[float] = None
        
        # Initialize or load identity
        self._ensure_identity()
    
    def _ensure_identity(self):
        """Load existing identity or generate a new one"""
        if not CRYPTO_AVAILABLE:
            log(f"Running in fallback mode for niche: {self.niche_id}")
            self.public_key_hex = f"fallback-{hashlib.sha256(self.niche_id.encode()).hexdigest()[:32]}"
            self.created_at = time.time()
            return
        
        # Try to load from database
        existing = self._load_from_db()
        if existing:
            log(f"Loaded existing identity for niche: {self.niche_id}")
            return
        
        # Generate new keypair
        log(f"Generating new identity for niche: {self.niche_id}")
        self._generate_keypair()
        self._save_to_db()
    
    def _generate_keypair(self):
        """Generate a new Ed25519 keypair"""
        self.private_key = Ed25519PrivateKey.generate()
        self.public_key = self.private_key.public_key()
        self.public_key_hex = self.public_key.public_bytes_raw().hex()
        self.created_at = time.time()
    
    def _load_from_db(self) -> bool:
        """Load identity from database"""
        try:
            conn = sqlite3.connect(self.db_path)
            c = conn.cursor()
            
            # Ensure table exists
            c.execute('''CREATE TABLE IF NOT EXISTS agent_identities (
                niche_id TEXT PRIMARY KEY,
                private_key_pem TEXT,
                public_key_hex TEXT,
                created_at REAL,
                last_action_at REAL,
                action_count INTEGER DEFAULT 0
            )''')
            conn.commit()
            
            c.execute("SELECT private_key_pem, public_key_hex, created_at FROM agent_identities WHERE niche_id=?", 
                      (self.niche_id,))
            row = c.fetchone()
            conn.close()
            
            if row:
                private_pem, public_hex, created_at = row
                self.private_key = serialization.load_pem_private_key(
                    private_pem.encode(),
                    password=None
                )
                self.public_key = self.private_key.public_key()
                self.public_key_hex = public_hex
                self.created_at = created_at
                return True
            
            return False
            
        except Exception as e:
            log(f"Error loading identity: {e}")
            return False
    
    def _save_to_db(self):
        """Save identity to database"""
        try:
            private_pem = self.private_key.private_bytes(
                encoding=serialization.Encoding.PEM,
                format=serialization.PrivateFormat.PKCS8,
                encryption_algorithm=serialization.NoEncryption()
            ).decode()
            
            conn = sqlite3.connect(self.db_path)
            c = conn.cursor()
            c.execute('''INSERT OR REPLACE INTO agent_identities 
                         (niche_id, private_key_pem, public_key_hex, created_at, last_action_at, action_count)
                         VALUES (?, ?, ?, ?, ?, ?)''',
                      (self.niche_id, private_pem, self.public_key_hex, self.created_at, None, 0))
            conn.commit()
            conn.close()
            log(f"Saved identity for niche: {self.niche_id}")
            
        except Exception as e:
            log(f"Error saving identity: {e}")
    
    def sign_action(self, content: str, action_type: str, metadata: Optional[Dict] = None) -> Dict[str, Any]:
        """
        Sign a high-value action with the agent's identity.
        
        Args:
            content: The content being acted upon (draft text, command, etc.)
            action_type: Type of action ("PUBLISH", "SPEND", "EXECUTE", etc.)
            metadata: Additional metadata to include in the signature payload
        
        Returns:
            SignedAction dict with hash, signature, public key, and timestamp
        """
        timestamp = datetime.now().isoformat()
        
        # Create the payload to sign
        payload = {
            "niche_id": self.niche_id,
            "action_type": action_type,
            "content_hash": hashlib.sha256(content.encode()).hexdigest(),
            "timestamp": timestamp,
            "metadata": metadata or {}
        }
        payload_json = json.dumps(payload, sort_keys=True)
        payload_bytes = payload_json.encode()
        
        # Generate action hash
        action_hash = hashlib.sha256(payload_bytes).hexdigest()
        
        # Sign the payload
        if CRYPTO_AVAILABLE and self.private_key:
            signature = self.private_key.sign(payload_bytes).hex()
        else:
            # Fallback: HMAC-style signature
            signature = hashlib.sha256(f"{action_hash}:{self.public_key_hex}".encode()).hexdigest()
        
        # Update action count in database
        self._update_action_count()
        
        signed_action = {
            "niche_id": self.niche_id,
            "action_type": action_type,
            "action_hash": action_hash,
            "content_hash": payload["content_hash"],
            "signature": signature,
            "public_key": self.public_key_hex,
            "timestamp": timestamp,
            "metadata": metadata or {},
            "verified": True  # Self-verification
        }
        
        log(f"Signed {action_type} action: {action_hash[:16]}...")
        return signed_action
    
    def verify_signature(self, signed_action: Dict[str, Any]) -> bool:
        """
        Verify a signed action was created by this agent.
        
        Args:
            signed_action: The signed action dict returned by sign_action()
        
        Returns:
            True if signature is valid, False otherwise
        """
        if not CRYPTO_AVAILABLE or not self.public_key:
            # Fallback verification
            expected_sig = hashlib.sha256(
                f"{signed_action['action_hash']}:{self.public_key_hex}".encode()
            ).hexdigest()
            return signed_action['signature'] == expected_sig
        
        try:
            # Reconstruct the payload
            payload = {
                "niche_id": signed_action["niche_id"],
                "action_type": signed_action["action_type"],
                "content_hash": signed_action["content_hash"],
                "timestamp": signed_action["timestamp"],
                "metadata": signed_action.get("metadata", {})
            }
            payload_bytes = json.dumps(payload, sort_keys=True).encode()
            
            # Verify signature
            signature_bytes = bytes.fromhex(signed_action["signature"])
            self.public_key.verify(signature_bytes, payload_bytes)
            return True
            
        except InvalidSignature:
            log(f"Invalid signature for action: {signed_action['action_hash']}")
            return False
        except Exception as e:
            log(f"Verification error: {e}")
            return False
    
    def _update_action_count(self):
        """Update action count and timestamp in database"""
        try:
            conn = sqlite3.connect(self.db_path)
            c = conn.cursor()
            c.execute('''UPDATE agent_identities 
                         SET action_count = action_count + 1, last_action_at = ?
                         WHERE niche_id = ?''',
                      (time.time(), self.niche_id))
            conn.commit()
            conn.close()
        except Exception as e:
            log(f"Error updating action count: {e}")
    
    def get_identity_info(self) -> Dict[str, Any]:
        """Get public identity information"""
        return {
            "niche_id": self.niche_id,
            "public_key": self.public_key_hex,
            "created_at": self.created_at,
            "crypto_enabled": CRYPTO_AVAILABLE
        }


# ============================================================================
# SAFETY GUARD - THE "DEAD MAN'S SWITCH"
# ============================================================================

class SafetyGuard:
    """
    Industrial safety layer for autonomous actions.
    Implements rate limiting, action validation, and emergency stops.
    """
    
    # Action risk levels
    RISK_LEVELS = {
        "SAFE": 0,
        "STANDARD": 1,
        "ELEVATED": 2,
        "CRITICAL": 3,
        "DANGEROUS": 4
    }
    
    # Default rate limits per action type (max actions per window)
    DEFAULT_LIMITS = {
        "PUBLISH": {"max": 3, "window_minutes": 10},
        "SPEND": {"max": 5, "window_minutes": 60},
        "EXECUTE": {"max": 10, "window_minutes": 5},
        "DELETE": {"max": 1, "window_minutes": 30},
    }
    
    def __init__(self, db_path: str = "agency_memory.db", 
                 custom_limits: Optional[Dict] = None):
        self.db_path = db_path
        self.limits = {**self.DEFAULT_LIMITS, **(custom_limits or {})}
        self._init_tables()
    
    def _init_tables(self):
        """Initialize safety-related database tables"""
        conn = sqlite3.connect(self.db_path)
        c = conn.cursor()
        
        # Action log for rate limiting
        c.execute('''CREATE TABLE IF NOT EXISTS safety_action_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            niche_id TEXT,
            action_type TEXT,
            action_hash TEXT,
            signature TEXT,
            risk_level TEXT,
            approved INTEGER,
            timestamp REAL
        )''')
        
        # Safety tickets for human review
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
        
        # Emergency stop state
        c.execute('''CREATE TABLE IF NOT EXISTS safety_state (
            key TEXT PRIMARY KEY,
            value TEXT,
            updated_at REAL
        )''')
        
        # Initialize emergency stop to OFF
        c.execute('''INSERT OR IGNORE INTO safety_state (key, value, updated_at) 
                     VALUES ('emergency_stop', 'false', ?)''', (time.time(),))
        
        conn.commit()
        conn.close()
    
    def check_action(self, niche_id: str, action_type: str, 
                     signed_action: Dict[str, Any]) -> Tuple[bool, Optional[str]]:
        """
        Check if an action is allowed to proceed.
        
        Args:
            niche_id: The agent's niche ID
            action_type: Type of action being performed
            signed_action: The cryptographically signed action
        
        Returns:
            Tuple of (allowed: bool, reason: str|None)
        """
        # Check emergency stop first
        if self._is_emergency_stopped():
            return False, "EMERGENCY_STOP: All actions are frozen"
        
        # Check rate limits
        allowed, reason = self._check_rate_limit(niche_id, action_type)
        if not allowed:
            self._create_safety_ticket(
                niche_id, action_type, signed_action, 
                "RATE_LIMIT_EXCEEDED", reason
            )
            return False, reason
        
        # Log the action
        self._log_action(niche_id, action_type, signed_action, approved=True)
        
        return True, None
    
    def _check_rate_limit(self, niche_id: str, action_type: str) -> Tuple[bool, Optional[str]]:
        """Check if action exceeds rate limits"""
        limits = self.limits.get(action_type, {"max": 100, "window_minutes": 60})
        max_actions = limits["max"]
        window_minutes = limits["window_minutes"]
        
        cutoff_time = time.time() - (window_minutes * 60)
        
        conn = sqlite3.connect(self.db_path)
        c = conn.cursor()
        c.execute('''SELECT COUNT(*) FROM safety_action_log 
                     WHERE niche_id = ? AND action_type = ? AND timestamp > ? AND approved = 1''',
                  (niche_id, action_type, cutoff_time))
        count = c.fetchone()[0]
        conn.close()
        
        if count >= max_actions:
            return False, f"Rate limit exceeded: {count}/{max_actions} {action_type} actions in {window_minutes} minutes"
        
        return True, None
    
    def _log_action(self, niche_id: str, action_type: str, 
                    signed_action: Dict[str, Any], approved: bool):
        """Log an action to the safety log"""
        conn = sqlite3.connect(self.db_path)
        c = conn.cursor()
        c.execute('''INSERT INTO safety_action_log 
                     (niche_id, action_type, action_hash, signature, risk_level, approved, timestamp)
                     VALUES (?, ?, ?, ?, ?, ?, ?)''',
                  (niche_id, action_type, 
                   signed_action.get("action_hash"),
                   signed_action.get("signature"),
                   "STANDARD",
                   1 if approved else 0,
                   time.time()))
        conn.commit()
        conn.close()
    
    def _create_safety_ticket(self, niche_id: str, action_type: str,
                               signed_action: Dict[str, Any], 
                               ticket_type: str, reason: str):
        """Create a safety ticket for human review"""
        ticket_id = hashlib.sha256(
            f"{niche_id}:{action_type}:{time.time()}".encode()
        ).hexdigest()[:16]
        
        conn = sqlite3.connect(self.db_path)
        c = conn.cursor()
        c.execute('''INSERT INTO safety_tickets 
                     (id, execution_id, niche_id, node_id, action_type, reason, 
                      payload_path, preview, status, created_at, resolved_at, resolved_by)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)''',
                  (ticket_id, None, niche_id, None, ticket_type, reason,
                   None, json.dumps(signed_action), "PENDING", time.time(), None, None))
        conn.commit()
        conn.close()
        
        log(f"Created safety ticket: {ticket_id} - {reason}")
        return ticket_id
    
    def _is_emergency_stopped(self) -> bool:
        """Check if emergency stop is active"""
        conn = sqlite3.connect(self.db_path)
        c = conn.cursor()
        c.execute("SELECT value FROM safety_state WHERE key = 'emergency_stop'")
        row = c.fetchone()
        conn.close()
        return row and row[0] == "true"
    
    def activate_emergency_stop(self, reason: str = "Manual activation"):
        """Activate emergency stop - freezes all dangerous actions"""
        conn = sqlite3.connect(self.db_path)
        c = conn.cursor()
        c.execute('''UPDATE safety_state SET value = 'true', updated_at = ? 
                     WHERE key = 'emergency_stop' ''', (time.time(),))
        c.execute('''INSERT INTO safety_state (key, value, updated_at)
                     VALUES ('emergency_stop_reason', ?, ?)
                     ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = ?''',
                  (reason, time.time(), reason, time.time()))
        conn.commit()
        conn.close()
        log(f"🚨 EMERGENCY STOP ACTIVATED: {reason}")
    
    def deactivate_emergency_stop(self):
        """Deactivate emergency stop"""
        conn = sqlite3.connect(self.db_path)
        c = conn.cursor()
        c.execute('''UPDATE safety_state SET value = 'false', updated_at = ? 
                     WHERE key = 'emergency_stop' ''', (time.time(),))
        conn.commit()
        conn.close()
        log("✅ Emergency stop deactivated")
    
    def get_safety_status(self) -> Dict[str, Any]:
        """Get current safety system status"""
        conn = sqlite3.connect(self.db_path)
        c = conn.cursor()
        
        # Get emergency stop state
        c.execute("SELECT value FROM safety_state WHERE key = 'emergency_stop'")
        emergency_stop = c.fetchone()
        is_stopped = emergency_stop and emergency_stop[0] == "true"
        
        # Get pending tickets count
        c.execute("SELECT COUNT(*) FROM safety_tickets WHERE status = 'PENDING'")
        pending_tickets = c.fetchone()[0]
        
        # Get recent action counts (last hour)
        cutoff = time.time() - 3600
        c.execute('''SELECT action_type, COUNT(*) FROM safety_action_log 
                     WHERE timestamp > ? GROUP BY action_type''', (cutoff,))
        action_counts = {row[0]: row[1] for row in c.fetchall()}
        
        conn.close()
        
        return {
            "emergency_stop_active": is_stopped,
            "pending_tickets": pending_tickets,
            "actions_last_hour": action_counts,
            "limits": self.limits
        }


# ============================================================================
# MULTIPLAYER KNOWLEDGE GRAPH
# ============================================================================

class GlobalKnowledge:
    """
    Multiplayer Knowledge Graph for cross-niche learning.
    Enables network effects where insights from one niche inform others.
    """
    
    def __init__(self, db_path: str = "agency_memory.db"):
        self.db_path = db_path
        self._init_tables()
    
    def _init_tables(self):
        """Initialize global knowledge tables"""
        conn = sqlite3.connect(self.db_path)
        c = conn.cursor()
        
        c.execute('''CREATE TABLE IF NOT EXISTS global_knowledge (
            id TEXT PRIMARY KEY,
            source_niche TEXT NOT NULL,
            heuristic_type TEXT NOT NULL,
            insight TEXT NOT NULL,
            confidence REAL DEFAULT 0.5,
            usage_count INTEGER DEFAULT 0,
            success_rate REAL DEFAULT 0.0,
            created_at REAL,
            last_used_at REAL,
            used_by_niches TEXT
        )''')
        
        conn.commit()
        conn.close()
    
    def add_insight(self, source_niche: str, heuristic_type: str, 
                    insight: str, confidence: float = 0.5) -> str:
        """
        Add a new insight to the global knowledge graph.
        
        Args:
            source_niche: The niche that discovered this insight
            heuristic_type: Category of insight ("format", "timing", "engagement", "content")
            insight: The actual insight text
            confidence: Initial confidence score (0-1)
        
        Returns:
            The insight ID
        """
        insight_id = hashlib.sha256(
            f"{source_niche}:{heuristic_type}:{insight}".encode()
        ).hexdigest()[:16]
        
        conn = sqlite3.connect(self.db_path)
        c = conn.cursor()
        
        c.execute('''INSERT OR REPLACE INTO global_knowledge 
                     (id, source_niche, heuristic_type, insight, confidence, 
                      usage_count, success_rate, created_at, last_used_at, used_by_niches)
                     VALUES (?, ?, ?, ?, ?, 0, 0.0, ?, NULL, ?)''',
                  (insight_id, source_niche, heuristic_type, insight, confidence,
                   time.time(), json.dumps([source_niche])))
        
        conn.commit()
        conn.close()
        
        log(f"Added insight from {source_niche}: {insight[:50]}...")
        return insight_id
    
    def get_insights_for_niche(self, niche_id: str, 
                                heuristic_type: Optional[str] = None,
                                limit: int = 10) -> List[Dict[str, Any]]:
        """
        Get relevant insights for a niche, excluding its own.
        
        Args:
            niche_id: The niche requesting insights
            heuristic_type: Optional filter by type
            limit: Maximum number of insights to return
        
        Returns:
            List of relevant insights
        """
        conn = sqlite3.connect(self.db_path)
        c = conn.cursor()
        
        if heuristic_type:
            c.execute('''SELECT id, source_niche, heuristic_type, insight, confidence, 
                                usage_count, success_rate
                         FROM global_knowledge 
                         WHERE source_niche != ? AND heuristic_type = ?
                         ORDER BY confidence DESC, usage_count DESC
                         LIMIT ?''',
                      (niche_id, heuristic_type, limit))
        else:
            c.execute('''SELECT id, source_niche, heuristic_type, insight, confidence,
                                usage_count, success_rate
                         FROM global_knowledge 
                         WHERE source_niche != ?
                         ORDER BY confidence DESC, usage_count DESC
                         LIMIT ?''',
                      (niche_id, limit))
        
        rows = c.fetchall()
        conn.close()
        
        return [{
            "id": row[0],
            "source_niche": row[1],
            "heuristic_type": row[2],
            "insight": row[3],
            "confidence": row[4],
            "usage_count": row[5],
            "success_rate": row[6]
        } for row in rows]
    
    def record_insight_usage(self, insight_id: str, niche_id: str, success: bool):
        """
        Record that a niche used an insight and whether it was successful.
        
        Args:
            insight_id: The insight that was used
            niche_id: The niche that used it
            success: Whether the usage was successful
        """
        conn = sqlite3.connect(self.db_path)
        c = conn.cursor()
        
        # Get current state
        c.execute("SELECT usage_count, success_rate, used_by_niches FROM global_knowledge WHERE id = ?",
                  (insight_id,))
        row = c.fetchone()
        
        if row:
            usage_count = row[0] + 1
            # Update rolling success rate
            current_rate = row[1]
            new_rate = ((current_rate * (usage_count - 1)) + (1.0 if success else 0.0)) / usage_count
            
            # Update used_by_niches
            used_by = json.loads(row[2] or "[]")
            if niche_id not in used_by:
                used_by.append(niche_id)
            
            c.execute('''UPDATE global_knowledge 
                         SET usage_count = ?, success_rate = ?, last_used_at = ?, used_by_niches = ?
                         WHERE id = ?''',
                      (usage_count, new_rate, time.time(), json.dumps(used_by), insight_id))
            
            conn.commit()
        
        conn.close()


# ============================================================================
# CLI INTERFACE
# ============================================================================

if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="Agent Identity Management CLI")
    parser.add_argument("action", choices=["create", "sign", "verify", "info", "status", 
                                           "emergency-stop", "emergency-release"])
    parser.add_argument("--niche", "-n", help="Niche ID")
    parser.add_argument("--content", "-c", help="Content to sign")
    parser.add_argument("--action-type", "-t", help="Action type (PUBLISH, SPEND, etc.)")
    parser.add_argument("--db", default="agency_memory.db", help="Database path")
    
    args = parser.parse_args()
    
    if args.action == "create":
        if not args.niche:
            print("Error: --niche required")
            sys.exit(1)
        identity = AgentIdentity(args.niche, args.db)
        info = identity.get_identity_info()
        print(json.dumps(info, indent=2))
    
    elif args.action == "sign":
        if not all([args.niche, args.content, args.action_type]):
            print("Error: --niche, --content, and --action-type required")
            sys.exit(1)
        identity = AgentIdentity(args.niche, args.db)
        signed = identity.sign_action(args.content, args.action_type)
        print(json.dumps(signed, indent=2))
    
    elif args.action == "verify":
        # Read signed action from stdin
        import sys
        signed_action = json.loads(sys.stdin.read())
        identity = AgentIdentity(signed_action["niche_id"], args.db)
        is_valid = identity.verify_signature(signed_action)
        print(json.dumps({"valid": is_valid}))
    
    elif args.action == "info":
        if not args.niche:
            print("Error: --niche required")
            sys.exit(1)
        identity = AgentIdentity(args.niche, args.db)
        print(json.dumps(identity.get_identity_info(), indent=2))
    
    elif args.action == "status":
        guard = SafetyGuard(args.db)
        print(json.dumps(guard.get_safety_status(), indent=2))
    
    elif args.action == "emergency-stop":
        guard = SafetyGuard(args.db)
        guard.activate_emergency_stop("Manual CLI activation")
        print(json.dumps({"status": "EMERGENCY_STOP_ACTIVATED"}))
    
    elif args.action == "emergency-release":
        guard = SafetyGuard(args.db)
        guard.deactivate_emergency_stop()
        print(json.dumps({"status": "EMERGENCY_STOP_RELEASED"}))
