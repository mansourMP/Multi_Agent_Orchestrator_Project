"""
Persistent cognitive daemon for Empyralis python_engine.

Phase 2.1 scope:
- start / stop / status commands
- persistent SQLite-backed event queue
- resume support for stale "processing" events after restart
"""

from __future__ import annotations

import argparse
import json
import os
import re
import signal
import sqlite3
import subprocess
import sys
import time
import uuid
from typing import Any, Dict, List, Optional

try:
    from state_paths import default_cognitive_db_path
except ImportError:  # pragma: no cover - package import path
    from python_engine.state_paths import default_cognitive_db_path


def _normalize_brand_command_alias(text: str) -> str:
    return re.sub(r"^/empyralis\b", "/orion", str(text or "").strip(), flags=re.IGNORECASE)


QUEUE_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS cognitive_event_queue (
    id TEXT PRIMARY KEY,
    niche_id TEXT NOT NULL,
    execution_id TEXT,
    source TEXT NOT NULL,
    event_text TEXT NOT NULL,
    event_json TEXT NOT NULL,
    parent_event_id TEXT,
    dependency_ids_json TEXT NOT NULL DEFAULT '[]',
    status TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 3,
    priority INTEGER NOT NULL DEFAULT 100,
    available_at REAL NOT NULL,
    created_at REAL NOT NULL,
    updated_at REAL NOT NULL,
    started_at REAL,
    finished_at REAL,
    failure_class TEXT,
    last_error TEXT,
    result_json TEXT
)
"""

QUEUE_INDEX_SQL = """
CREATE INDEX IF NOT EXISTS idx_cognitive_event_queue_pick
ON cognitive_event_queue (niche_id, status, available_at, priority, created_at)
"""

STATE_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS cognitive_daemon_state (
    niche_id TEXT PRIMARY KEY,
    status TEXT NOT NULL,
    pid INTEGER,
    poll_seconds REAL NOT NULL DEFAULT 2.0,
    started_at REAL,
    stopped_at REAL,
    last_heartbeat REAL,
    processed_count INTEGER NOT NULL DEFAULT 0,
    failed_count INTEGER NOT NULL DEFAULT 0,
    last_event_id TEXT,
    last_error TEXT
)
"""

DIGEST_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS cognitive_event_digest (
    event_id TEXT PRIMARY KEY,
    niche_id TEXT NOT NULL,
    run_id TEXT,
    action TEXT,
    final_status TEXT NOT NULL,
    one_line_summary TEXT,
    next_action TEXT,
    risk_flags_json TEXT NOT NULL DEFAULT '[]',
    execution_id TEXT,
    created_at REAL NOT NULL,
    updated_at REAL NOT NULL
)
"""

DIGEST_INDEX_SQL = """
CREATE INDEX IF NOT EXISTS idx_cognitive_event_digest_recent
ON cognitive_event_digest (niche_id, updated_at DESC)
"""

OBJECTIVE_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS cognitive_objectives (
    id TEXT PRIMARY KEY,
    niche_id TEXT NOT NULL,
    title TEXT NOT NULL,
    goal_text TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    priority INTEGER NOT NULL DEFAULT 70,
    cadence_seconds REAL NOT NULL DEFAULT 0.0,
    next_run_at REAL NOT NULL,
    last_run_at REAL,
    last_event_id TEXT,
    constraints_json TEXT NOT NULL DEFAULT '{}',
    metadata_json TEXT NOT NULL DEFAULT '{}',
    created_at REAL NOT NULL,
    updated_at REAL NOT NULL,
    completed_at REAL
)
"""

OBJECTIVE_INDEX_SQL = """
CREATE INDEX IF NOT EXISTS idx_cognitive_objectives_pick
ON cognitive_objectives (niche_id, status, next_run_at, priority, created_at)
"""

OBJECTIVE_REFLECTION_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS cognitive_objective_reflections (
    id TEXT PRIMARY KEY,
    objective_id TEXT NOT NULL,
    event_id TEXT NOT NULL UNIQUE,
    niche_id TEXT NOT NULL,
    passed INTEGER NOT NULL DEFAULT 0,
    lesson TEXT,
    confidence REAL NOT NULL DEFAULT 0.0,
    status TEXT,
    verification_json TEXT NOT NULL DEFAULT '{}',
    metadata_json TEXT NOT NULL DEFAULT '{}',
    created_at REAL NOT NULL
)
"""

OBJECTIVE_REFLECTION_INDEX_SQL = """
CREATE INDEX IF NOT EXISTS idx_cognitive_objective_reflections_recent
ON cognitive_objective_reflections (objective_id, created_at DESC)
"""

SKILL_CANDIDATE_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS cognitive_skill_candidates (
    id TEXT PRIMARY KEY,
    niche_id TEXT NOT NULL,
    signature TEXT NOT NULL,
    action TEXT NOT NULL,
    trigger_text TEXT NOT NULL DEFAULT '',
    command_text TEXT NOT NULL DEFAULT '',
    objective_id TEXT,
    success_count INTEGER NOT NULL DEFAULT 0,
    fail_count INTEGER NOT NULL DEFAULT 0,
    total_count INTEGER NOT NULL DEFAULT 0,
    avg_confidence REAL NOT NULL DEFAULT 0.0,
    last_status TEXT,
    last_event_id TEXT,
    last_run_id TEXT,
    last_lesson TEXT,
    tags_json TEXT NOT NULL DEFAULT '[]',
    metadata_json TEXT NOT NULL DEFAULT '{}',
    promoted INTEGER NOT NULL DEFAULT 0,
    created_at REAL NOT NULL,
    updated_at REAL NOT NULL,
    UNIQUE(niche_id, signature)
)
"""

SKILL_CANDIDATE_INDEX_SQL = """
CREATE INDEX IF NOT EXISTS idx_cognitive_skill_candidates_recent
ON cognitive_skill_candidates (niche_id, promoted DESC, updated_at DESC)
"""

FALLBACK_MEMORY_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS fallback_memory (
    id TEXT PRIMARY KEY,
    text TEXT,
    vector_json TEXT,
    metadata_json TEXT,
    timestamp REAL
)
"""


def log(message: str) -> None:
    sys.stderr.write(f"[COGNITIVE_DAEMON] {message}\n")
    sys.stderr.flush()


def _connect(db_path: str) -> sqlite3.Connection:
    os.makedirs(os.path.dirname(db_path) or ".", exist_ok=True)
    conn = sqlite3.connect(db_path, timeout=30)
    conn.row_factory = sqlite3.Row
    return conn


def init_queue_db(db_path: str) -> None:
    conn = _connect(db_path)
    try:
        cur = conn.cursor()
        cur.execute(QUEUE_TABLE_SQL)
        cur.execute(QUEUE_INDEX_SQL)
        cur.execute(STATE_TABLE_SQL)
        cur.execute(DIGEST_TABLE_SQL)
        cur.execute(DIGEST_INDEX_SQL)
        cur.execute(OBJECTIVE_TABLE_SQL)
        cur.execute(OBJECTIVE_INDEX_SQL)
        cur.execute(OBJECTIVE_REFLECTION_TABLE_SQL)
        cur.execute(OBJECTIVE_REFLECTION_INDEX_SQL)
        cur.execute(SKILL_CANDIDATE_TABLE_SQL)
        cur.execute(SKILL_CANDIDATE_INDEX_SQL)
        cur.execute(FALLBACK_MEMORY_TABLE_SQL)
        cur.execute("PRAGMA table_info(cognitive_event_queue)")
        columns = {str(row[1]) for row in cur.fetchall()}
        if "parent_event_id" not in columns:
            cur.execute("ALTER TABLE cognitive_event_queue ADD COLUMN parent_event_id TEXT")
        if "dependency_ids_json" not in columns:
            cur.execute("ALTER TABLE cognitive_event_queue ADD COLUMN dependency_ids_json TEXT NOT NULL DEFAULT '[]'")
        if "failure_class" not in columns:
            cur.execute("ALTER TABLE cognitive_event_queue ADD COLUMN failure_class TEXT")
        cur.execute("PRAGMA table_info(cognitive_skill_candidates)")
        skill_columns = {str(row[1]) for row in cur.fetchall()}
        if "promoted" not in skill_columns:
            cur.execute("ALTER TABLE cognitive_skill_candidates ADD COLUMN promoted INTEGER NOT NULL DEFAULT 0")
        conn.commit()
    finally:
        conn.close()


def _first_line(text: Any, fallback: str = "") -> str:
    raw = str(text or "").strip()
    if not raw:
        return fallback
    for line in raw.splitlines():
        line = line.strip()
        if line:
            return line[:240]
    return fallback


def _default_next_action(final_status: str) -> str:
    status = str(final_status or "").strip().lower()
    if status == "completed":
        return "review_output"
    if status in {"failed", "timeout"}:
        return "inspect_run"
    if status == "waiting_for_input":
        return "resolve_approval"
    if status == "planned":
        return "start_runtime_run"
    if status == "needs_input":
        return "provide_clarification"
    return "monitor"


def _extract_digest_from_result(event_id: str, niche_id: str, result: Dict[str, Any]) -> Dict[str, Any]:
    now = time.time()
    tick = result.get("tick") if isinstance(result.get("tick"), dict) else {}
    tick_result = tick.get("result") if isinstance(tick.get("result"), dict) else {}
    decision = tick.get("decision") if isinstance(tick.get("decision"), dict) else {}
    reflection = tick.get("reflection") if isinstance(tick.get("reflection"), dict) else {}

    action = str(tick_result.get("action") or decision.get("action") or "").strip()
    run_id = str(tick_result.get("run_id") or "").strip() or None
    final_status = str(
        tick_result.get("final_status")
        or tick_result.get("runtime_status")
        or tick_result.get("status")
        or ("done" if bool(result.get("ok")) else "unknown")
    ).strip().lower()
    if not final_status:
        final_status = "unknown"

    one_line_summary = _first_line(
        tick_result.get("one_line_summary")
        or tick_result.get("result_summary")
        or tick_result.get("message")
        or reflection.get("lesson"),
        fallback=f"Event finished with status '{final_status}'.",
    )

    next_action = str(tick_result.get("next_action") or "").strip() or _default_next_action(final_status)
    raw_flags = tick_result.get("risk_flags")
    if isinstance(raw_flags, list):
        risk_flags = [str(x).strip() for x in raw_flags if str(x).strip()]
    else:
        risk_flags = []

    return {
        "event_id": event_id,
        "niche_id": niche_id,
        "run_id": run_id,
        "action": action or None,
        "final_status": final_status,
        "one_line_summary": one_line_summary,
        "next_action": next_action,
        "risk_flags_json": json.dumps(risk_flags),
        "execution_id": str(result.get("execution_id") or "").strip() or None,
        "created_at": now,
        "updated_at": now,
    }


def _upsert_digest_cursor(cur: sqlite3.Cursor, digest: Dict[str, Any]) -> None:
    cur.execute(
        """
        INSERT INTO cognitive_event_digest
        (event_id, niche_id, run_id, action, final_status, one_line_summary, next_action, risk_flags_json, execution_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(event_id) DO UPDATE SET
          niche_id=excluded.niche_id,
          run_id=excluded.run_id,
          action=excluded.action,
          final_status=excluded.final_status,
          one_line_summary=excluded.one_line_summary,
          next_action=excluded.next_action,
          risk_flags_json=excluded.risk_flags_json,
          execution_id=excluded.execution_id,
          updated_at=excluded.updated_at
        """,
        (
            digest.get("event_id"),
            digest.get("niche_id"),
            digest.get("run_id"),
            digest.get("action"),
            digest.get("final_status"),
            digest.get("one_line_summary"),
            digest.get("next_action"),
            digest.get("risk_flags_json"),
            digest.get("execution_id"),
            digest.get("created_at"),
            digest.get("updated_at"),
        ),
    )


def _safe_json_object(raw: Any) -> Dict[str, Any]:
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, str) and raw.strip():
        try:
            parsed = json.loads(raw)
            return parsed if isinstance(parsed, dict) else {}
        except Exception:
            return {}
    return {}


def _token_list(raw: Any) -> List[str]:
    if isinstance(raw, list):
        return [str(x).strip().lower() for x in raw if str(x).strip()]
    if isinstance(raw, str):
        value = raw.strip()
        if not value:
            return []
        if "," in value:
            return [part.strip().lower() for part in value.split(",") if part.strip()]
        return [value.lower()]
    return []


def _extract_objective_context(event_row: sqlite3.Row) -> Optional[Dict[str, Any]]:
    parent_event_id = str(event_row["parent_event_id"] or "").strip()
    payload = _safe_json_object(event_row["event_json"])
    metadata = payload.get("metadata") if isinstance(payload.get("metadata"), dict) else {}
    objective_id = str(metadata.get("objective_id") or parent_event_id).strip()
    if not objective_id:
        return None
    constraints = metadata.get("objective_constraints")
    return {
        "objective_id": objective_id,
        "title": str(metadata.get("objective_title") or "").strip(),
        "constraints": constraints if isinstance(constraints, dict) else {},
        "metadata": metadata if isinstance(metadata, dict) else {},
    }


def _resolve_objective_constraints(
    cur: sqlite3.Cursor, objective_id: str, fallback: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    base = dict(fallback or {})
    try:
        cur.execute("SELECT constraints_json FROM cognitive_objectives WHERE id=?", (objective_id,))
        row = cur.fetchone()
        if not row:
            return base
        from_objective = _safe_json_object(row["constraints_json"])
        if not from_objective:
            return base
        merged = dict(from_objective)
        merged.update(base)
        return merged
    except Exception:
        return base


def _evaluate_objective_contract(
    *,
    constraints: Dict[str, Any],
    digest: Dict[str, Any],
    result: Dict[str, Any],
) -> Dict[str, Any]:
    tick = result.get("tick") if isinstance(result.get("tick"), dict) else {}
    tick_result = tick.get("result") if isinstance(tick.get("result"), dict) else {}
    tick_exec = tick.get("execution") if isinstance(tick.get("execution"), dict) else {}
    tick_reflection = tick.get("reflection") if isinstance(tick.get("reflection"), dict) else {}
    checks: List[Dict[str, Any]] = []

    final_status = str(
        digest.get("final_status")
        or tick_result.get("final_status")
        or tick_result.get("status")
        or ""
    ).strip().lower()
    action = str(digest.get("action") or tick_result.get("action") or "").strip().lower()
    run_id = str(digest.get("run_id") or tick_result.get("run_id") or "").strip()
    risk_flags = [str(x).strip().lower() for x in (digest.get("risk_flags") or []) if str(x).strip()]
    duration_ms = int(tick_exec.get("duration_ms") or 0)
    confidence = float(tick_reflection.get("confidence") or 0.0)

    allowed_statuses = _token_list(
        constraints.get("allowed_statuses")
        or constraints.get("expected_statuses")
        or ["ok", "planned", "done", "completed"]
    )
    status_passed = final_status in allowed_statuses if allowed_statuses else bool(final_status)
    checks.append(
        {
            "key": "status_allowed",
            "passed": status_passed,
            "expected": allowed_statuses,
            "actual": final_status,
        }
    )

    required_action = str(constraints.get("require_action") or "").strip().lower()
    if required_action:
        action_passed = action == required_action
        checks.append(
            {
                "key": "action_match",
                "passed": action_passed,
                "expected": required_action,
                "actual": action,
            }
        )

    if bool(constraints.get("require_run_id")):
        run_id_passed = bool(run_id)
        checks.append(
            {
                "key": "run_id_present",
                "passed": run_id_passed,
                "expected": True,
                "actual": bool(run_id),
            }
        )

    banned_flags = _token_list(constraints.get("forbid_risk_flags"))
    if banned_flags:
        violating_flags = [flag for flag in risk_flags if flag in banned_flags]
        checks.append(
            {
                "key": "risk_flags_forbidden",
                "passed": len(violating_flags) == 0,
                "expected": banned_flags,
                "actual": violating_flags,
            }
        )

    max_duration_ms = constraints.get("max_duration_ms")
    if max_duration_ms is not None:
        try:
            cap = int(max_duration_ms)
        except Exception:
            cap = -1
        if cap >= 0:
            checks.append(
                {
                    "key": "duration_cap",
                    "passed": duration_ms <= cap,
                    "expected": cap,
                    "actual": duration_ms,
                }
            )

    min_confidence = constraints.get("min_confidence")
    if min_confidence is not None:
        try:
            floor = float(min_confidence)
        except Exception:
            floor = -1.0
        if floor >= 0.0:
            checks.append(
                {
                    "key": "reflection_confidence_floor",
                    "passed": confidence >= floor,
                    "expected": floor,
                    "actual": confidence,
                }
            )

    passed = all(bool(item.get("passed")) for item in checks) if checks else True
    return {
        "passed": passed,
        "checks": checks,
        "constraint_count": len(checks),
        "evaluated_at": time.time(),
    }


def _upsert_objective_reflection_cursor(
    cur: sqlite3.Cursor,
    *,
    objective_id: str,
    event_id: str,
    niche_id: str,
    lesson: str,
    confidence: float,
    status: str,
    verification: Dict[str, Any],
    metadata: Dict[str, Any],
) -> str:
    created_at = time.time()
    reflection_id = str(uuid.uuid4())
    cur.execute(
        """
        INSERT INTO cognitive_objective_reflections
        (id, objective_id, event_id, niche_id, passed, lesson, confidence, status, verification_json, metadata_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(event_id) DO UPDATE SET
          objective_id=excluded.objective_id,
          niche_id=excluded.niche_id,
          passed=excluded.passed,
          lesson=excluded.lesson,
          confidence=excluded.confidence,
          status=excluded.status,
          verification_json=excluded.verification_json,
          metadata_json=excluded.metadata_json
        """,
        (
            reflection_id,
            objective_id,
            event_id,
            niche_id,
            1 if bool(verification.get("passed")) else 0,
            lesson,
            float(confidence),
            status,
            json.dumps(verification),
            json.dumps(metadata),
            created_at,
        ),
    )
    return reflection_id


def _persist_reflection_memory_cursor(
    cur: sqlite3.Cursor,
    *,
    objective_id: str,
    event_id: str,
    niche_id: str,
    lesson: str,
    confidence: float,
    status: str,
    verification: Dict[str, Any],
    metadata: Dict[str, Any],
) -> str:
    # Stored in fallback_memory so this path never depends on remote embedding APIs.
    memory_id = f"objective-reflection:{event_id}"
    line = (
        f"[objective:{objective_id}] status={status} confidence={round(float(confidence), 3)} "
        f"passed={bool(verification.get('passed'))} lesson={lesson}"
    )
    payload = {
        "source": "cognitive.objective_reflection",
        "niche_id": niche_id,
        "objective_id": objective_id,
        "event_id": event_id,
        "status": status,
        "confidence": float(confidence),
        "verification": verification,
        "metadata": metadata,
        "timestamp": time.time(),
    }
    cur.execute(
        """
        INSERT OR REPLACE INTO fallback_memory
        (id, text, vector_json, metadata_json, timestamp)
        VALUES (?, ?, ?, ?, ?)
        """,
        (
            memory_id,
            line,
            "[]",
            json.dumps(payload),
            time.time(),
        ),
    )
    return memory_id


def _status_counts_as_success(final_status: str) -> bool:
    token = str(final_status or "").strip().lower()
    return token in {"ok", "planned", "done", "completed", "pending"}


def _normalize_skill_signature(action: str, trigger_text: str, command_text: str) -> str:
    a = str(action or "").strip().lower()
    trigger = re.sub(r"\s+", " ", str(trigger_text or "").strip().lower())
    command = re.sub(r"\s+", " ", str(command_text or "").strip().lower())
    base = command if a == "operator_exec" and command else trigger
    return f"{a}:{base[:220]}"


def _should_promote_skill_candidate(*, total_count: int, success_count: int, fail_count: int, avg_confidence: float) -> bool:
    if total_count < 3:
        return False
    success_rate = float(success_count) / float(total_count) if total_count > 0 else 0.0
    if success_rate < 0.67:
        return False
    if float(avg_confidence) < 0.6:
        return False
    if fail_count > max(1, total_count // 3):
        return False
    return True


def _derive_skill_candidate(
    *,
    event_payload: Dict[str, Any],
    result: Dict[str, Any],
    digest: Dict[str, Any],
    objective_id: str = "",
    objective_verification: Optional[Dict[str, Any]] = None,
) -> Optional[Dict[str, Any]]:
    tick = result.get("tick") if isinstance(result.get("tick"), dict) else {}
    tick_result = tick.get("result") if isinstance(tick.get("result"), dict) else {}
    tick_reflection = tick.get("reflection") if isinstance(tick.get("reflection"), dict) else {}
    event_metadata = event_payload.get("metadata") if isinstance(event_payload.get("metadata"), dict) else {}

    action = str(digest.get("action") or tick_result.get("action") or "").strip().lower()
    if not action:
        return None
    if action not in {"run_goal", "operator_exec", "status_summary"}:
        return None

    event_text = _normalize_brand_command_alias(str(event_payload.get("text") or "").strip())
    command_text = str(tick_result.get("command") or "").strip()
    goal_text = str(tick_result.get("goal") or "").strip()
    trigger_text = ""
    tags: List[str] = [action]

    if action == "operator_exec":
        if not command_text and event_text.lower().startswith("/orion exec "):
            command_text = event_text[len("/orion exec ") :].strip()
        trigger_text = command_text
        tags.extend(["operator", "local_exec"])
    elif action == "run_goal":
        if not goal_text and event_text.lower().startswith("/orion run "):
            goal_text = event_text[len("/orion run ") :].strip()
        trigger_text = goal_text or event_text
        tags.append("goal")
    else:
        trigger_text = event_text or "status"
        tags.extend(["status", "summary"])

    trigger_text = re.sub(r"\s+", " ", trigger_text).strip()
    command_text = re.sub(r"\s+", " ", command_text).strip()
    if not trigger_text:
        return None

    final_status = str(digest.get("final_status") or "").strip().lower()
    if isinstance(objective_verification, dict) and "passed" in objective_verification:
        passed = bool(objective_verification.get("passed"))
    else:
        passed = _status_counts_as_success(final_status)

    confidence = _float_or_default(
        tick_reflection.get("confidence"),
        (0.85 if passed else 0.35),
        minimum=0.0,
        maximum=1.0,
    )

    run_id = str(digest.get("run_id") or tick_result.get("run_id") or "").strip()
    route = tick_result.get("route") if isinstance(tick_result.get("route"), dict) else {}
    objective_dispatch = (
        event_metadata.get("objective_dispatch")
        if isinstance(event_metadata.get("objective_dispatch"), dict)
        else {}
    )
    execution_target = str(
        event_metadata.get("execution_target")
        or route.get("selected")
        or objective_dispatch.get("execution_target")
        or ""
    ).strip().lower()
    trust_mode = str(
        event_metadata.get("trust_mode")
        or objective_dispatch.get("trust_mode")
        or tick_result.get("trust_mode")
        or ""
    ).strip().lower()
    risk_flags = [str(x).strip().lower() for x in (digest.get("risk_flags") or []) if str(x).strip()]
    if objective_id:
        tags.append("objective")
    if run_id:
        tags.append("run_linked")
    if execution_target:
        tags.append(f"target:{execution_target}")
    if trust_mode:
        tags.append(f"trust:{trust_mode}")

    signature = _normalize_skill_signature(action, trigger_text, command_text)
    if not signature or signature.endswith(":"):
        return None

    lesson = _first_line(
        tick_reflection.get("lesson"),
        fallback=str(digest.get("one_line_summary") or ""),
    )
    candidate_metadata = {
        "event_text": event_text,
        "goal_text": goal_text,
        "execution_target": execution_target,
        "trust_mode": trust_mode,
        "risk_flags": risk_flags,
        "objective_id": objective_id,
        "has_run_id": bool(run_id),
    }

    return {
        "signature": signature,
        "action": action,
        "trigger_text": trigger_text,
        "command_text": command_text,
        "objective_id": objective_id or "",
        "passed": bool(passed),
        "confidence": float(confidence),
        "final_status": final_status,
        "event_id": str(digest.get("event_id") or ""),
        "run_id": run_id,
        "lesson": lesson,
        "tags": sorted(set(tags)),
        "metadata": candidate_metadata,
    }


def _upsert_skill_candidate_cursor(
    cur: sqlite3.Cursor,
    *,
    niche_id: str,
    candidate: Dict[str, Any],
) -> Dict[str, Any]:
    now = time.time()
    signature = str(candidate.get("signature") or "").strip()
    action = str(candidate.get("action") or "").strip().lower()
    if not signature or not action:
        return {}

    cur.execute(
        """
        SELECT id, success_count, fail_count, total_count, avg_confidence, promoted, tags_json, metadata_json
        FROM cognitive_skill_candidates
        WHERE niche_id=? AND signature=?
        """,
        (niche_id, signature),
    )
    row = cur.fetchone()

    confidence = _float_or_default(candidate.get("confidence"), 0.0, minimum=0.0, maximum=1.0)
    passed = bool(candidate.get("passed"))
    trigger_text = str(candidate.get("trigger_text") or "").strip()
    command_text = str(candidate.get("command_text") or "").strip()
    objective_id = str(candidate.get("objective_id") or "").strip() or None
    final_status = str(candidate.get("final_status") or "").strip().lower()
    event_id = str(candidate.get("event_id") or "").strip()
    run_id = str(candidate.get("run_id") or "").strip() or None
    lesson = _first_line(candidate.get("lesson"), fallback="")
    new_tags = [str(x).strip().lower() for x in (candidate.get("tags") or []) if str(x).strip()]
    metadata = candidate.get("metadata") if isinstance(candidate.get("metadata"), dict) else {}

    if row is None:
        total_count = 1
        success_count = 1 if passed else 0
        fail_count = 0 if passed else 1
        avg_confidence = confidence
        promoted = _should_promote_skill_candidate(
            total_count=total_count,
            success_count=success_count,
            fail_count=fail_count,
            avg_confidence=avg_confidence,
        )
        skill_id = str(uuid.uuid4())
        cur.execute(
            """
            INSERT INTO cognitive_skill_candidates
            (id, niche_id, signature, action, trigger_text, command_text, objective_id, success_count, fail_count,
             total_count, avg_confidence, last_status, last_event_id, last_run_id, last_lesson, tags_json, metadata_json,
             promoted, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                skill_id,
                niche_id,
                signature,
                action,
                trigger_text,
                command_text,
                objective_id,
                success_count,
                fail_count,
                total_count,
                avg_confidence,
                final_status,
                event_id or None,
                run_id,
                lesson,
                json.dumps(sorted(set(new_tags))),
                json.dumps(metadata),
                1 if promoted else 0,
                now,
                now,
            ),
        )
    else:
        skill_id = str(row["id"] or "")
        total_before = _int_or_default(row["total_count"], 0, minimum=0)
        success_before = _int_or_default(row["success_count"], 0, minimum=0)
        fail_before = _int_or_default(row["fail_count"], 0, minimum=0)
        avg_before = _float_or_default(row["avg_confidence"], 0.0, minimum=0.0, maximum=1.0)
        total_count = total_before + 1
        success_count = success_before + (1 if passed else 0)
        fail_count = fail_before + (0 if passed else 1)
        avg_confidence = ((avg_before * float(total_before)) + confidence) / float(max(1, total_count))
        existing_tags = _token_list(row["tags_json"])
        merged_tags = sorted(set(existing_tags + new_tags))
        merged_metadata = _safe_json_object(row["metadata_json"])
        merged_metadata.update(metadata)
        promoted_existing = bool(row["promoted"])
        promote_candidate = _should_promote_skill_candidate(
            total_count=total_count,
            success_count=success_count,
            fail_count=fail_count,
            avg_confidence=avg_confidence,
        )
        success_rate = (float(success_count) / float(total_count)) if total_count > 0 else 0.0
        demote_candidate = (
            promoted_existing
            and total_count >= 6
            and (success_rate < 0.45 or avg_confidence < 0.40)
        )
        promoted = bool(promoted_existing or promote_candidate)
        if demote_candidate:
            promoted = False
            decay_meta = (
                merged_metadata.get("decay")
                if isinstance(merged_metadata.get("decay"), dict)
                else {}
            )
            decay_meta["last_demoted_at"] = now
            decay_meta["reason"] = "performance_regression"
            decay_meta["success_rate"] = round(success_rate, 6)
            decay_meta["avg_confidence"] = round(avg_confidence, 6)
            decay_meta["total_count"] = total_count
            merged_metadata["decay"] = decay_meta
        cur.execute(
            """
            UPDATE cognitive_skill_candidates
            SET trigger_text=?, command_text=?, objective_id=?, success_count=?, fail_count=?, total_count=?,
                avg_confidence=?, last_status=?, last_event_id=?, last_run_id=?, last_lesson=?, tags_json=?,
                metadata_json=?, promoted=?, updated_at=?
            WHERE id=?
            """,
            (
                trigger_text,
                command_text,
                objective_id,
                success_count,
                fail_count,
                total_count,
                avg_confidence,
                final_status,
                event_id or None,
                run_id,
                lesson,
                json.dumps(merged_tags),
                json.dumps(merged_metadata),
                1 if promoted else 0,
                now,
                skill_id,
            ),
        )

    success_rate = float(success_count) / float(total_count) if total_count > 0 else 0.0
    return {
        "id": skill_id,
        "signature": signature,
        "action": action,
        "trigger_text": trigger_text,
        "command_text": command_text,
        "objective_id": objective_id,
        "total_count": total_count,
        "success_count": success_count,
        "fail_count": fail_count,
        "success_rate": success_rate,
        "avg_confidence": avg_confidence,
        "promoted": bool(promoted),
        "last_status": final_status,
        "last_event_id": event_id or None,
        "last_run_id": run_id,
        "last_lesson": lesson,
        "updated_at": now,
    }


def _persist_skill_candidate_memory_cursor(cur: sqlite3.Cursor, *, niche_id: str, snapshot: Dict[str, Any]) -> str:
    skill_id = str(snapshot.get("id") or "").strip()
    if not skill_id:
        return ""
    signature = str(snapshot.get("signature") or "").strip()
    line = (
        f"[skill:{signature}] runs={int(snapshot.get('total_count') or 0)} "
        f"success_rate={round(float(snapshot.get('success_rate') or 0.0), 3)} "
        f"confidence={round(float(snapshot.get('avg_confidence') or 0.0), 3)} "
        f"promoted={bool(snapshot.get('promoted'))}"
    )
    payload = {
        "source": "cognitive.skill_candidate",
        "niche_id": niche_id,
        "skill_id": skill_id,
        "signature": signature,
        "action": str(snapshot.get("action") or ""),
        "promoted": bool(snapshot.get("promoted")),
        "success_count": int(snapshot.get("success_count") or 0),
        "fail_count": int(snapshot.get("fail_count") or 0),
        "total_count": int(snapshot.get("total_count") or 0),
        "success_rate": float(snapshot.get("success_rate") or 0.0),
        "avg_confidence": float(snapshot.get("avg_confidence") or 0.0),
        "last_event_id": str(snapshot.get("last_event_id") or ""),
        "updated_at": float(snapshot.get("updated_at") or time.time()),
    }
    memory_id = f"skill-candidate:{skill_id}"
    cur.execute(
        """
        INSERT OR REPLACE INTO fallback_memory
        (id, text, vector_json, metadata_json, timestamp)
        VALUES (?, ?, ?, ?, ?)
        """,
        (
            memory_id,
            line,
            "[]",
            json.dumps(payload),
            time.time(),
        ),
    )
    return memory_id


def list_skill_candidates(
    *,
    db_path: str,
    niche_id: str,
    limit: int = 20,
    action: str = "",
    objective_id: str = "",
    promoted_only: bool = False,
) -> List[Dict[str, Any]]:
    init_queue_db(db_path)
    safe_limit = max(1, min(int(limit), 200))
    action_filter = str(action or "").strip().lower()
    objective_filter = str(objective_id or "").strip()
    conn = _connect(db_path)
    try:
        cur = conn.cursor()
        query = """
            SELECT id, niche_id, signature, action, trigger_text, command_text, objective_id, success_count, fail_count,
                   total_count, avg_confidence, last_status, last_event_id, last_run_id, last_lesson, tags_json,
                   metadata_json, promoted, created_at, updated_at
            FROM cognitive_skill_candidates
            WHERE niche_id=?
        """
        params: List[Any] = [niche_id]
        if action_filter:
            query += " AND action=?"
            params.append(action_filter)
        if objective_filter:
            query += " AND objective_id=?"
            params.append(objective_filter)
        if bool(promoted_only):
            query += " AND promoted=1"
        query += " ORDER BY promoted DESC, updated_at DESC LIMIT ?"
        params.append(safe_limit)
        cur.execute(query, params)
        rows = cur.fetchall()
        out: List[Dict[str, Any]] = []
        for row in rows:
            item = dict(row)
            total_count = _int_or_default(item.get("total_count"), 0, minimum=0)
            success_count = _int_or_default(item.get("success_count"), 0, minimum=0)
            item["success_rate"] = (float(success_count) / float(total_count)) if total_count > 0 else 0.0
            item["avg_confidence"] = _float_or_default(item.get("avg_confidence"), 0.0, minimum=0.0, maximum=1.0)
            item["promoted"] = bool(item.get("promoted"))
            item["tags"] = _token_list(item.get("tags_json"))
            item["metadata"] = _safe_json_object(item.get("metadata_json"))
            item.pop("tags_json", None)
            item.pop("metadata_json", None)
            out.append(item)
        return out
    finally:
        conn.close()


def _canonical_text(raw: Any) -> str:
    return re.sub(r"\s+", " ", str(raw or "").strip().lower())


def _match_replay_score(event_text: str, action: str, trigger_text: str, command_text: str) -> float:
    event_norm = _canonical_text(event_text)
    action_norm = _canonical_text(action)
    trigger_norm = _canonical_text(trigger_text)
    command_norm = _canonical_text(command_text)
    if not event_norm or not action_norm:
        return 0.0

    if action_norm == "operator_exec":
        if event_norm.startswith("/orion exec "):
            cmd = _canonical_text(event_norm[len("/orion exec ") :])
            return 1.0 if cmd and cmd == (command_norm or trigger_norm) else 0.0
        if event_norm == (command_norm or trigger_norm):
            return 0.92
        return 0.0

    if action_norm == "run_goal":
        if event_norm.startswith("/orion run "):
            goal = _canonical_text(event_norm[len("/orion run ") :])
            return 1.0 if goal and goal == trigger_norm else 0.0
        if event_norm == trigger_norm:
            return 0.9
        if trigger_norm and (event_norm in trigger_norm or trigger_norm in event_norm):
            return 0.7
        return 0.0

    if action_norm == "status_summary":
        if event_norm in {"/orion status", "status", "/status", "health", "health check"}:
            return 0.96
        if trigger_norm and event_norm == trigger_norm:
            return 0.86
        return 0.0

    return 0.0


def _skill_replay_confidence_threshold() -> float:
    raw = os.getenv("ORION_COGNITIVE_SKILL_REPLAY_MIN_CONFIDENCE")
    return _float_or_default(raw, 0.70, minimum=0.30, maximum=0.99)


def _skill_replay_enabled() -> bool:
    raw = str(os.getenv("ORION_COGNITIVE_SKILL_REPLAY_ENABLED") or "1").strip().lower()
    return raw in {"1", "true", "yes", "on"}


def maybe_apply_skill_replay(
    *,
    db_path: str,
    niche_id: str,
    payload: Dict[str, Any],
    limit: int = 40,
) -> Dict[str, Any]:
    event_text = str(payload.get("text") or "").strip()
    metadata = payload.get("metadata") if isinstance(payload.get("metadata"), dict) else {}
    replay_meta: Dict[str, Any] = {
        "enabled": _skill_replay_enabled(),
        "applied": False,
        "threshold": _skill_replay_confidence_threshold(),
        "reason": "",
        "candidate_id": "",
        "candidate_signature": "",
        "candidate_action": "",
        "confidence": 0.0,
        "match_score": 0.0,
        "model_score": 0.0,
        "text_before": event_text,
        "text_after": event_text,
    }
    if not replay_meta["enabled"]:
        replay_meta["reason"] = "disabled"
        metadata["skill_replay"] = replay_meta
        payload["metadata"] = metadata
        return replay_meta
    if not event_text:
        replay_meta["reason"] = "empty_text"
        metadata["skill_replay"] = replay_meta
        payload["metadata"] = metadata
        return replay_meta

    candidates = list_skill_candidates(
        db_path=db_path,
        niche_id=niche_id,
        limit=max(1, min(int(limit), 200)),
        promoted_only=True,
    )
    if not candidates:
        replay_meta["reason"] = "no_promoted_candidates"
        metadata["skill_replay"] = replay_meta
        payload["metadata"] = metadata
        return replay_meta

    best: Optional[Dict[str, Any]] = None
    best_conf = 0.0
    for item in candidates:
        action = str(item.get("action") or "")
        trigger_text = str(item.get("trigger_text") or "")
        command_text = str(item.get("command_text") or "")
        match_score = _match_replay_score(event_text, action, trigger_text, command_text)
        if match_score <= 0:
            continue
        success_rate = _float_or_default(item.get("success_rate"), 0.0, minimum=0.0, maximum=1.0)
        avg_conf = _float_or_default(item.get("avg_confidence"), 0.0, minimum=0.0, maximum=1.0)
        model_score = (0.6 * success_rate) + (0.4 * avg_conf)
        confidence = match_score * model_score
        if confidence > best_conf:
            best_conf = confidence
            best = {
                "id": str(item.get("id") or ""),
                "signature": str(item.get("signature") or ""),
                "action": action,
                "trigger_text": trigger_text,
                "command_text": command_text,
                "metadata": item.get("metadata") if isinstance(item.get("metadata"), dict) else {},
                "match_score": match_score,
                "model_score": model_score,
                "confidence": confidence,
            }

    if best is None:
        replay_meta["reason"] = "no_match"
        metadata["skill_replay"] = replay_meta
        payload["metadata"] = metadata
        return replay_meta

    replay_meta["candidate_id"] = best["id"]
    replay_meta["candidate_signature"] = best["signature"]
    replay_meta["candidate_action"] = best["action"]
    replay_meta["confidence"] = round(float(best["confidence"]), 6)
    replay_meta["match_score"] = round(float(best["match_score"]), 6)
    replay_meta["model_score"] = round(float(best["model_score"]), 6)

    threshold = float(replay_meta["threshold"])
    if float(best["confidence"]) < threshold:
        replay_meta["reason"] = "below_threshold"
        metadata["skill_replay"] = replay_meta
        payload["metadata"] = metadata
        return replay_meta

    action = str(best["action"] or "").strip().lower()
    text_after = event_text
    if action == "operator_exec":
        command = str(best["command_text"] or best["trigger_text"] or "").strip()
        if command:
            text_after = f"/orion exec {command}"
    elif action == "run_goal":
        goal = str(best["trigger_text"] or "").strip()
        if goal:
            text_after = f"/orion run {goal}"
    elif action == "status_summary":
        text_after = "/orion status"

    if text_after != event_text:
        payload["text"] = text_after
    replay_meta["text_after"] = str(payload.get("text") or event_text)
    replay_meta["applied"] = True
    replay_meta["reason"] = "replay_applied"

    learned_meta = best.get("metadata") if isinstance(best.get("metadata"), dict) else {}
    learned_target = str(learned_meta.get("execution_target") or "").strip().lower()
    learned_trust = str(learned_meta.get("trust_mode") or "").strip().lower()
    if learned_target and not str(metadata.get("execution_target") or "").strip():
        metadata["execution_target"] = learned_target
    if learned_trust and not str(metadata.get("trust_mode") or "").strip():
        metadata["trust_mode"] = learned_trust

    metadata["skill_replay"] = replay_meta
    payload["metadata"] = metadata
    return replay_meta


def _record_objective_skill_replay_policy(
    *,
    db_path: str,
    objective_id: str,
    replay: Dict[str, Any],
    now: Optional[float] = None,
) -> Dict[str, Any]:
    target_id = str(objective_id or "").strip()
    if not target_id:
        return {"ok": False, "error": "objective_id_required"}
    replay_obj = replay if isinstance(replay, dict) else {}
    enabled = bool(replay_obj.get("enabled"))
    if not enabled:
        return {"ok": True, "objective_id": target_id, "updated": False, "reason": "replay_disabled"}

    ts = float(now) if now is not None else time.time()
    conn = _connect(db_path)
    try:
        cur = conn.cursor()
        cur.execute("SELECT metadata_json FROM cognitive_objectives WHERE id=?", (target_id,))
        row = cur.fetchone()
        if not row:
            return {"ok": False, "error": "objective_not_found", "objective_id": target_id}

        metadata = _safe_json_object(row["metadata_json"])
        policy = metadata.get("policy") if isinstance(metadata.get("policy"), dict) else {}

        attempts = _int_or_default(policy.get("skill_replay_attempts"), 0, minimum=0, maximum=100000000) + 1
        applied_before = _int_or_default(policy.get("skill_replay_applied"), 0, minimum=0, maximum=100000000)
        fallback_before = _int_or_default(policy.get("skill_replay_fallbacks"), 0, minimum=0, maximum=100000000)
        applied_now = bool(replay_obj.get("applied"))
        applied = applied_before + (1 if applied_now else 0)
        fallbacks = fallback_before + (0 if applied_now else 1)

        policy["skill_replay_attempts"] = attempts
        policy["skill_replay_applied"] = applied
        policy["skill_replay_fallbacks"] = fallbacks
        policy["skill_replay_last_at"] = ts
        policy["skill_replay_last_reason"] = str(replay_obj.get("reason") or "")
        policy["skill_replay_last_confidence"] = _float_or_default(
            replay_obj.get("confidence"),
            0.0,
            minimum=0.0,
            maximum=1.0,
        )
        signature = str(replay_obj.get("candidate_signature") or "").strip()
        if signature:
            policy["skill_replay_last_signature"] = signature
        action = str(replay_obj.get("candidate_action") or "").strip().lower()
        if action:
            policy["skill_replay_last_action"] = action
        policy["skill_replay_last_match_score"] = _float_or_default(
            replay_obj.get("match_score"),
            0.0,
            minimum=0.0,
            maximum=1.0,
        )
        policy["skill_replay_last_model_score"] = _float_or_default(
            replay_obj.get("model_score"),
            0.0,
            minimum=0.0,
            maximum=1.0,
        )
        policy["skill_replay_last_text_before"] = str(replay_obj.get("text_before") or "")
        policy["skill_replay_last_text_after"] = str(replay_obj.get("text_after") or "")

        metadata["policy"] = policy
        cur.execute(
            """
            UPDATE cognitive_objectives
            SET metadata_json=?, updated_at=?
            WHERE id=?
            """,
            (json.dumps(metadata), ts, target_id),
        )
        conn.commit()

        return {
            "ok": True,
            "objective_id": target_id,
            "updated": True,
            "attempts": attempts,
            "applied": applied,
            "fallbacks": fallbacks,
        }
    finally:
        conn.close()


def decay_skill_candidates(
    *,
    db_path: str,
    niche_id: str,
    max_age_seconds: float = 86400.0 * 7.0,
    min_samples: int = 5,
    min_success_rate: float = 0.55,
    promoted_only: bool = True,
) -> Dict[str, Any]:
    init_queue_db(db_path)
    now = time.time()
    age_threshold = max(60.0, float(max_age_seconds))
    sample_threshold = _int_or_default(min_samples, 5, minimum=1, maximum=100000)
    success_floor = _float_or_default(min_success_rate, 0.55, minimum=0.0, maximum=1.0)

    conn = _connect(db_path)
    try:
        cur = conn.cursor()
        query = """
            SELECT id, signature, promoted, success_count, fail_count, total_count, avg_confidence, metadata_json, updated_at
            FROM cognitive_skill_candidates
            WHERE niche_id=?
        """
        params: List[Any] = [niche_id]
        if promoted_only:
            query += " AND promoted=1"
        query += " ORDER BY updated_at ASC LIMIT 500"
        cur.execute(query, params)
        rows = cur.fetchall()

        demoted: List[Dict[str, Any]] = []
        for row in rows:
            skill_id = str(row["id"] or "")
            signature = str(row["signature"] or "")
            promoted = bool(row["promoted"])
            total_count = _int_or_default(row["total_count"], 0, minimum=0)
            success_count = _int_or_default(row["success_count"], 0, minimum=0)
            avg_conf = _float_or_default(row["avg_confidence"], 0.0, minimum=0.0, maximum=1.0)
            updated_at = _float_or_default(row["updated_at"], 0.0, minimum=0.0)
            success_rate = (float(success_count) / float(total_count)) if total_count > 0 else 0.0

            stale = (now - updated_at) >= age_threshold
            weak_performance = (
                total_count >= sample_threshold
                and (success_rate < success_floor or avg_conf < 0.45)
            )
            should_demote = bool(promoted) and (stale or weak_performance)
            if not should_demote:
                continue

            reason_parts: List[str] = []
            if stale:
                reason_parts.append("stale")
            if weak_performance:
                reason_parts.append("weak_performance")
            reason = ",".join(reason_parts) or "decay"

            metadata = _safe_json_object(row["metadata_json"])
            decay_meta = metadata.get("decay") if isinstance(metadata.get("decay"), dict) else {}
            decay_meta["last_demoted_at"] = now
            decay_meta["reason"] = reason
            decay_meta["success_rate"] = round(success_rate, 6)
            decay_meta["avg_confidence"] = round(avg_conf, 6)
            decay_meta["total_count"] = total_count
            metadata["decay"] = decay_meta

            cur.execute(
                """
                UPDATE cognitive_skill_candidates
                SET promoted=0, metadata_json=?, updated_at=?
                WHERE id=?
                """,
                (json.dumps(metadata), now, skill_id),
            )
            demoted.append(
                {
                    "id": skill_id,
                    "signature": signature,
                    "reason": reason,
                    "success_rate": round(success_rate, 6),
                    "avg_confidence": round(avg_conf, 6),
                    "total_count": total_count,
                }
            )
        conn.commit()
        return {
            "ok": True,
            "niche_id": niche_id,
            "demoted_count": len(demoted),
            "demoted": demoted,
            "checked_count": len(rows),
            "max_age_seconds": age_threshold,
            "min_samples": sample_threshold,
            "min_success_rate": success_floor,
            "promoted_only": bool(promoted_only),
            "ran_at": now,
        }
    finally:
        conn.close()


def list_objective_reflections(
    *,
    db_path: str,
    objective_id: str,
    limit: int = 20,
) -> List[Dict[str, Any]]:
    init_queue_db(db_path)
    safe_limit = max(1, min(int(limit), 200))
    conn = _connect(db_path)
    try:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT id, objective_id, event_id, niche_id, passed, lesson, confidence, status, verification_json, metadata_json, created_at
            FROM cognitive_objective_reflections
            WHERE objective_id=?
            ORDER BY created_at DESC
            LIMIT ?
            """,
            (objective_id, safe_limit),
        )
        rows = cur.fetchall()
        out: List[Dict[str, Any]] = []
        for row in rows:
            item = dict(row)
            item["passed"] = bool(item.get("passed"))
            item["verification"] = _safe_json_object(item.get("verification_json"))
            item["metadata"] = _safe_json_object(item.get("metadata_json"))
            item.pop("verification_json", None)
            item.pop("metadata_json", None)
            out.append(item)
        return out
    finally:
        conn.close()


def list_recent_objective_reflections(
    *,
    db_path: str,
    niche_id: str,
    objective_id: str = "",
    limit: int = 20,
) -> List[Dict[str, Any]]:
    init_queue_db(db_path)
    safe_limit = max(1, min(int(limit), 200))
    objective_filter = str(objective_id or "").strip()
    conn = _connect(db_path)
    try:
        cur = conn.cursor()
        if objective_filter:
            cur.execute(
                """
                SELECT id, objective_id, event_id, niche_id, passed, lesson, confidence, status, verification_json, metadata_json, created_at
                FROM cognitive_objective_reflections
                WHERE niche_id=? AND objective_id=?
                ORDER BY created_at DESC
                LIMIT ?
                """,
                (niche_id, objective_filter, safe_limit),
            )
        else:
            cur.execute(
                """
                SELECT id, objective_id, event_id, niche_id, passed, lesson, confidence, status, verification_json, metadata_json, created_at
                FROM cognitive_objective_reflections
                WHERE niche_id=?
                ORDER BY created_at DESC
                LIMIT ?
                """,
                (niche_id, safe_limit),
            )
        rows = cur.fetchall()
        out: List[Dict[str, Any]] = []
        for row in rows:
            item = dict(row)
            item["passed"] = bool(item.get("passed"))
            item["verification"] = _safe_json_object(item.get("verification_json"))
            item["metadata"] = _safe_json_object(item.get("metadata_json"))
            item.pop("verification_json", None)
            item.pop("metadata_json", None)
            out.append(item)
        return out
    finally:
        conn.close()


def tail_objective(
    *,
    db_path: str,
    objective_id: str,
    limit: int = 20,
) -> Dict[str, Any]:
    init_queue_db(db_path)
    objective = get_objective(db_path=db_path, objective_id=objective_id)
    if objective is None:
        return {"ok": False, "error": "objective_not_found", "objective_id": objective_id}

    safe_limit = max(1, min(int(limit), 200))
    conn = _connect(db_path)
    try:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT id, niche_id, status, attempts, priority, event_text, source, created_at, started_at, finished_at, updated_at, last_error, result_json
            FROM cognitive_event_queue
            WHERE parent_event_id=?
            ORDER BY created_at DESC
            LIMIT ?
            """,
            (objective_id, safe_limit),
        )
        rows = cur.fetchall()
    finally:
        conn.close()

    events: List[Dict[str, Any]] = []
    for row in rows:
        item = dict(row)
        item["result"] = _safe_json_object(item.get("result_json"))
        item.pop("result_json", None)
        digest = get_event_digest(db_path, str(item.get("id") or ""))
        if digest is not None:
            item["digest"] = digest
        events.append(item)

    reflections = list_objective_reflections(db_path=db_path, objective_id=objective_id, limit=safe_limit)
    return {
        "ok": True,
        "objective": objective,
        "events": events,
        "reflections": reflections,
        "count_events": len(events),
        "count_reflections": len(reflections),
    }


def simulate_objective_policy(
    *,
    db_path: str,
    niche_id: str,
    objective_id: str,
    action: str = "run_goal",
    final_status: str = "done",
    status: str = "",
    run_id: str = "",
    risk_flags: Optional[List[str]] = None,
    summary: str = "",
    duration_ms: int = 0,
    confidence: float = 0.8,
    now: Optional[float] = None,
) -> Dict[str, Any]:
    init_queue_db(db_path)
    objective = get_objective(db_path=db_path, objective_id=objective_id)
    if objective is None:
        return {"ok": False, "error": "objective_not_found", "objective_id": objective_id}

    objective_niche = str(objective.get("niche_id") or niche_id or "").strip() or str(niche_id or "unknown")
    event_id = f"sim-{uuid.uuid4()}"
    execution_id = f"exec-sim-{str(uuid.uuid4())[:8]}"

    normalized_action = str(action or "run_goal").strip() or "run_goal"
    normalized_final_status = str(final_status or "").strip().lower() or "done"
    normalized_status = str(status or normalized_final_status).strip().lower() or normalized_final_status
    normalized_run_id = str(run_id or "").strip()
    normalized_summary = _first_line(summary, fallback="")
    normalized_duration_ms = max(0, int(duration_ms))
    normalized_confidence = max(0.0, min(1.0, float(confidence)))
    normalized_risk_flags: List[str] = []
    for flag in (risk_flags or []):
        token = str(flag or "").strip()
        if token:
            normalized_risk_flags.append(token)

    tick_result: Dict[str, Any] = {
        "status": normalized_status,
        "final_status": normalized_final_status,
        "action": normalized_action,
        "risk_flags": normalized_risk_flags,
    }
    if normalized_run_id:
        tick_result["run_id"] = normalized_run_id
    if normalized_summary:
        tick_result["one_line_summary"] = normalized_summary

    result_to_store: Dict[str, Any] = {
        "ok": True,
        "execution_id": execution_id,
        "tick": {
            "decision": {"action": normalized_action},
            "execution": {"duration_ms": normalized_duration_ms},
            "reflection": {
                "lesson": "Simulated policy evaluation.",
                "confidence": normalized_confidence,
            },
            "result": tick_result,
        },
    }
    digest = _extract_digest_from_result(
        event_id=event_id,
        niche_id=objective_niche,
        result=result_to_store,
    )
    if normalized_summary:
        digest["one_line_summary"] = normalized_summary

    simulated_now = time.time() if now is None else float(now)
    conn = _connect(db_path)
    try:
        cur = conn.cursor()
        constraints = _resolve_objective_constraints(cur, objective_id=objective_id, fallback={})
        objective_verification = _evaluate_objective_contract(
            constraints=constraints,
            digest=digest,
            result=result_to_store,
        )
        objective_before = get_objective(db_path=db_path, objective_id=objective_id) or objective
        cur.execute("SAVEPOINT objective_policy_simulation")
        policy_state = _apply_objective_verification_policy(
            cur,
            objective_id=objective_id,
            event_id=event_id,
            verification=objective_verification,
            final_status=str(digest.get("final_status") or ""),
            now=simulated_now,
        )
        cur.execute("ROLLBACK TO objective_policy_simulation")
        cur.execute("RELEASE objective_policy_simulation")
        objective_after = get_objective(db_path=db_path, objective_id=objective_id) or objective_before
    finally:
        conn.close()

    return {
        "ok": True,
        "objective": objective_before,
        "objective_after_rollback": objective_after,
        "digest": {
            "event_id": digest.get("event_id"),
            "niche_id": digest.get("niche_id"),
            "run_id": digest.get("run_id"),
            "action": digest.get("action"),
            "final_status": digest.get("final_status"),
            "one_line_summary": digest.get("one_line_summary"),
            "next_action": digest.get("next_action"),
            "risk_flags": (
                json.loads(digest.get("risk_flags_json"))
                if isinstance(digest.get("risk_flags_json"), str) and str(digest.get("risk_flags_json")).strip()
                else []
            ),
            "execution_id": digest.get("execution_id"),
        },
        "objective_verification": objective_verification,
        "policy_state": policy_state,
        "rolled_back": True,
        "simulated_at": simulated_now,
        "constraints": constraints,
    }


def autotune_objective(
    *,
    db_path: str,
    niche_id: str,
    objective_id: str,
    sample_size: int = 20,
    min_samples: int = 4,
    apply: bool = False,
) -> Dict[str, Any]:
    init_queue_db(db_path)
    objective = get_objective(db_path=db_path, objective_id=objective_id)
    if objective is None:
        return {"ok": False, "error": "objective_not_found", "objective_id": objective_id}

    objective_niche = str(objective.get("niche_id") or niche_id or "").strip() or str(niche_id or "unknown")
    constraints_current = (
        objective.get("constraints")
        if isinstance(objective.get("constraints"), dict)
        else {}
    )
    constraints_proposed: Dict[str, Any] = dict(constraints_current)
    metadata_current = (
        objective.get("metadata")
        if isinstance(objective.get("metadata"), dict)
        else {}
    )
    policy = metadata_current.get("policy") if isinstance(metadata_current.get("policy"), dict) else {}

    safe_sample_size = max(1, min(int(sample_size), 200))
    safe_min_samples = max(1, min(int(min_samples), 50))
    reflections = list_recent_objective_reflections(
        db_path=db_path,
        niche_id=objective_niche,
        objective_id=objective_id,
        limit=safe_sample_size,
    )

    reflection_count = len(reflections)
    pass_count = 0
    waiting_count = 0
    confidence_values: List[float] = []
    for item in reflections:
        if bool(item.get("passed")):
            pass_count += 1
        status_token = str(item.get("status") or "").strip().lower()
        verification_obj = item.get("verification") if isinstance(item.get("verification"), dict) else {}
        checks = verification_obj.get("checks") if isinstance(verification_obj.get("checks"), list) else []
        waiting_from_checks = False
        for check in checks:
            if not isinstance(check, dict):
                continue
            if str(check.get("key") or "").strip() != "status_allowed":
                continue
            actual = str(check.get("actual") or "").strip().lower()
            if actual in {"waiting_for_input", "needs_input"}:
                waiting_from_checks = True
                break
        if status_token in {"waiting_for_input", "needs_input"} or waiting_from_checks:
            waiting_count += 1
        confidence_values.append(_float_or_default(item.get("confidence"), 0.0, minimum=0.0, maximum=1.0))

    pass_rate = (float(pass_count) / float(reflection_count)) if reflection_count > 0 else None
    waiting_rate = (float(waiting_count) / float(reflection_count)) if reflection_count > 0 else None
    avg_confidence = (
        float(sum(confidence_values) / float(len(confidence_values)))
        if confidence_values
        else None
    )
    confidence_delta = (
        float(confidence_values[0] - confidence_values[-1])
        if len(confidence_values) >= 2
        else 0.0
    )

    signals: Dict[str, Any] = {
        "sample_size": reflection_count,
        "min_samples": safe_min_samples,
        "pass_rate": pass_rate,
        "waiting_rate": waiting_rate,
        "avg_confidence": avg_confidence,
        "confidence_delta": confidence_delta,
        "verification_fail_streak": _int_or_default(policy.get("verification_fail_streak"), 0, minimum=0, maximum=1000000),
    }

    changes: List[Dict[str, Any]] = []

    def _change(key: str, to_value: Any, reason: str) -> None:
        from_value = constraints_proposed.get(key)
        if from_value == to_value:
            return
        constraints_proposed[key] = to_value
        changes.append(
            {
                "key": key,
                "from": from_value,
                "to": to_value,
                "reason": reason,
            }
        )

    if reflection_count < safe_min_samples:
        advice = [
            f"Not enough reflections for autotune (have {reflection_count}, need {safe_min_samples}).",
            "Continue collecting objective runs, then rerun autotune.",
        ]
        return {
            "ok": True,
            "objective": objective,
            "signals": signals,
            "changes": [],
            "changed_keys": [],
            "apply_requested": bool(apply),
            "applied": False,
            "constraints_current": constraints_current,
            "constraints_proposed": constraints_current,
            "advice": advice,
        }

    # Baseline safety defaults.
    _change("auto_remediation_enabled", True, "Enable automatic remediation on repeated quality regressions.")
    _change("auto_remediation_recovery_passes", max(2, _int_or_default(constraints_proposed.get("auto_remediation_recovery_passes"), 2, minimum=1, maximum=10)), "Require sustained recovery before remediation rollback.")
    _change("pause_on_escalation", True, "Pause objective when escalation opens for explicit operator control.")
    _change("escalate_on_waiting_for_input", True, "Escalate waiting-for-input states to approval queue.")

    low_quality = (pass_rate is not None) and pass_rate < 0.6
    frequent_waiting = (waiting_rate is not None) and waiting_rate > 0.25
    confidence_down = confidence_delta <= -0.08
    strong_quality = (
        pass_rate is not None
        and pass_rate >= 0.9
        and (avg_confidence is not None and avg_confidence >= 0.85)
        and waiting_count == 0
        and reflection_count >= max(6, safe_min_samples)
    )

    if low_quality:
        _change(
            "max_fail_streak",
            min(2, _int_or_default(constraints_proposed.get("max_fail_streak"), 2, minimum=1, maximum=20)),
            "Lower fail streak threshold for faster escalation under low pass-rate.",
        )
        _change(
            "auto_remediation_min_fail_streak",
            2,
            "Trigger remediation earlier under low pass-rate.",
        )
        _change(
            "auto_remediation_min_reflections",
            max(3, _int_or_default(constraints_proposed.get("auto_remediation_min_reflections"), 3, minimum=1, maximum=50)),
            "Use enough reflections to avoid one-off noise.",
        )
        _change(
            "auto_remediation_slowdown_factor",
            max(2.0, _float_or_default(constraints_proposed.get("auto_remediation_slowdown_factor"), 2.0, minimum=1.0, maximum=8.0)),
            "Slow cadence during remediation when quality is low.",
        )
        _change(
            "auto_remediation_retry_window_seconds",
            max(900.0, _float_or_default(constraints_proposed.get("auto_remediation_retry_window_seconds"), 900.0, minimum=60.0, maximum=86400.0)),
            "Give remediation window enough time to stabilize behavior.",
        )
        _change(
            "auto_remediation_pass_rate_max",
            min(0.75, _float_or_default(constraints_proposed.get("auto_remediation_pass_rate_max"), 0.75, minimum=0.0, maximum=1.0)),
            "Allow remediation when pass-rate drops below acceptable threshold.",
        )

    if frequent_waiting:
        _change(
            "approval_retry_cooldown_seconds",
            max(300.0, _float_or_default(constraints_proposed.get("approval_retry_cooldown_seconds"), 300.0, minimum=5.0, maximum=86400.0)),
            "Increase cooldown when waiting-for-input churn is high.",
        )
        _change(
            "auto_remediation_retry_window_seconds",
            max(1200.0, _float_or_default(constraints_proposed.get("auto_remediation_retry_window_seconds"), 1200.0, minimum=60.0, maximum=86400.0)),
            "Extend remediation window for frequent approval/waiting cycles.",
        )

    if confidence_down:
        _change(
            "auto_remediation_conf_drop_threshold",
            min(0.06, _float_or_default(constraints_proposed.get("auto_remediation_conf_drop_threshold"), 0.06, minimum=0.0, maximum=1.0)),
            "React earlier to confidence downtrend.",
        )

    if strong_quality:
        _change(
            "max_fail_streak",
            max(3, _int_or_default(constraints_proposed.get("max_fail_streak"), 3, minimum=1, maximum=20)),
            "Relax fail streak threshold for stable high-quality objective.",
        )
        _change(
            "auto_remediation_slowdown_factor",
            min(1.5, _float_or_default(constraints_proposed.get("auto_remediation_slowdown_factor"), 1.5, minimum=1.0, maximum=8.0)),
            "Reduce slowdown for consistently strong objective performance.",
        )
        _change(
            "auto_remediation_retry_window_seconds",
            min(600.0, _float_or_default(constraints_proposed.get("auto_remediation_retry_window_seconds"), 600.0, minimum=60.0, maximum=86400.0)),
            "Shorten remediation window for stable objective.",
        )

    applied = False
    objective_after = objective
    metadata_after = dict(metadata_current)
    if bool(apply) and len(changes) > 0:
        autotune_meta = (
            metadata_after.get("autotune")
            if isinstance(metadata_after.get("autotune"), dict)
            else {}
        )
        now_ts = time.time()
        autotune_meta["last_run_at"] = now_ts
        autotune_meta["last_applied"] = True
        autotune_meta["last_sample_size"] = reflection_count
        autotune_meta["last_change_count"] = len(changes)
        autotune_meta["last_signals"] = {
            "pass_rate": pass_rate,
            "waiting_rate": waiting_rate,
            "avg_confidence": avg_confidence,
            "confidence_delta": confidence_delta,
        }
        metadata_after["autotune"] = autotune_meta
        objective_after = update_objective(
            db_path=db_path,
            objective_id=objective_id,
            constraints_json=json.dumps(constraints_proposed),
            metadata_json=json.dumps(metadata_after),
        )
        applied = True

    advice: List[str] = []
    if len(changes) == 0:
        advice.append("No constraint changes recommended from current objective signals.")
    elif not apply:
        advice.append("Review proposed changes, then rerun with --apply to persist.")
    else:
        advice.append("Autotune changes applied successfully.")

    return {
        "ok": True,
        "objective": objective_after if applied else objective,
        "signals": signals,
        "changes": changes,
        "changed_keys": [str(item.get("key") or "") for item in changes],
        "apply_requested": bool(apply),
        "applied": applied,
        "constraints_current": constraints_current,
        "constraints_proposed": constraints_proposed,
        "advice": advice,
    }


def _pid_file(niche_id: str) -> str:
    safe = "".join(ch if ch.isalnum() or ch in "-_" else "_" for ch in niche_id)
    return os.path.join("/tmp", f"orion_cognitive_daemon_{safe}.pid")


def _is_pid_alive(pid: int) -> bool:
    if pid <= 0:
        return False
    try:
        os.kill(pid, 0)
        return True
    except ProcessLookupError:
        return False
    except PermissionError:
        return True


def write_daemon_state(
    db_path: str,
    niche_id: str,
    status: str,
    pid: Optional[int] = None,
    poll_seconds: float = 2.0,
    last_error: Optional[str] = None,
    last_event_id: Optional[str] = None,
    increment_processed: int = 0,
    increment_failed: int = 0,
) -> None:
    now = time.time()
    conn = _connect(db_path)
    try:
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO cognitive_daemon_state
            (niche_id, status, pid, poll_seconds, started_at, stopped_at, last_heartbeat,
             processed_count, failed_count, last_event_id, last_error)
            VALUES (?, ?, ?, ?, ?, NULL, ?, 0, 0, ?, ?)
            ON CONFLICT(niche_id) DO UPDATE SET
              status = excluded.status,
              pid = COALESCE(excluded.pid, cognitive_daemon_state.pid),
              poll_seconds = excluded.poll_seconds,
              started_at = CASE
                  WHEN excluded.status IN ('starting', 'running') THEN excluded.started_at
                  WHEN cognitive_daemon_state.started_at IS NULL THEN excluded.started_at
                  ELSE cognitive_daemon_state.started_at
              END,
              stopped_at = CASE
                  WHEN excluded.status IN ('starting', 'running') THEN NULL
                  WHEN excluded.status IN ('stopped', 'failed') THEN excluded.started_at
                  ELSE cognitive_daemon_state.stopped_at
              END,
              last_heartbeat = excluded.last_heartbeat,
              processed_count = cognitive_daemon_state.processed_count + ?,
              failed_count = cognitive_daemon_state.failed_count + ?,
              last_event_id = COALESCE(excluded.last_event_id, cognitive_daemon_state.last_event_id),
              last_error = COALESCE(excluded.last_error, cognitive_daemon_state.last_error)
            """,
            (
                niche_id,
                status,
                pid,
                float(poll_seconds),
                now,
                now,
                last_event_id,
                last_error,
                int(increment_processed),
                int(increment_failed),
            ),
        )
        conn.commit()
    finally:
        conn.close()


def read_daemon_state(db_path: str, niche_id: str) -> Dict[str, Any]:
    init_queue_db(db_path)
    conn = _connect(db_path)
    try:
        cur = conn.cursor()
        cur.execute("SELECT * FROM cognitive_daemon_state WHERE niche_id=?", (niche_id,))
        row = cur.fetchone()
        if not row:
            return {
                "niche_id": niche_id,
                "status": "not_started",
                "pid": None,
                "poll_seconds": None,
                "started_at": None,
                "stopped_at": None,
                "last_heartbeat": None,
                "processed_count": 0,
                "failed_count": 0,
                "last_event_id": None,
                "last_error": None,
                "pid_alive": False,
            }
        data = dict(row)
        data["pid_alive"] = _is_pid_alive(int(data["pid"])) if data.get("pid") else False
        return data
    finally:
        conn.close()


def derive_event_priority(event: Any) -> int:
    """
    Lower number = higher priority.
    Priority policy is based on intent, risk, and expected cost.
    """
    text = ""
    if isinstance(event, str):
        text = event
    elif isinstance(event, dict):
        text = str(event.get("text") or "")
    lowered = _normalize_brand_command_alias(text).lower().strip()

    # Intent base
    if lowered.startswith("/orion status") or lowered == "status":
        base = 35
        intent = "status"
    elif lowered.startswith("/orion help") or lowered == "help":
        base = 45
        intent = "help"
    elif lowered.startswith("/orion run"):
        base = 70
        intent = "run"
    else:
        base = 80
        intent = "general"

    urgency = any(
        token in lowered
        for token in ("urgent", "asap", "immediately", "critical", "p0", "sev1")
    )
    risk = any(
        token in lowered
        for token in (
            "delete",
            "rm -rf",
            "drop table",
            "password",
            "token",
            "secret",
            "production",
            "deploy",
            "spend",
            "payment",
            "publish",
        )
    )
    high_cost = any(
        token in lowered
        for token in ("analyze", "research", "generate", "build", "refactor", "full scan")
    )

    priority = base
    if urgency:
        priority -= 20
    if risk:
        priority -= 10
    if high_cost:
        priority += 15

    # keep range stable for queue ordering
    priority = max(1, min(1000, int(priority)))
    log(
        f"priority policy: intent={intent} urgency={urgency} risk={risk} cost_high={high_cost} -> {priority}"
    )
    return priority


def enqueue_event(
    db_path: str,
    niche_id: str,
    event: Any,
    source: str = "api",
    execution_id: Optional[str] = None,
    parent_event_id: Optional[str] = None,
    dependency_ids: Optional[List[str]] = None,
    priority: Optional[int] = None,
    max_attempts: int = 3,
) -> str:
    if not isinstance(niche_id, str) or not niche_id.strip():
        raise ValueError("niche_id is required")
    if not isinstance(source, str) or not source.strip():
        raise ValueError("source is required")
    if priority is None:
        normalized_priority = None
    else:
        try:
            normalized_priority = int(priority)
        except Exception as exc:
            raise ValueError("priority must be an integer") from exc
    try:
        max_attempts = int(max_attempts)
    except Exception as exc:
        raise ValueError("max_attempts must be an integer") from exc
    if max_attempts < 1:
        max_attempts = 1
    if max_attempts > 10:
        max_attempts = 10

    if isinstance(event, str):
        event_obj = {"text": event}
        event_text = event.strip()
    elif isinstance(event, dict):
        event_obj = event
        event_text = str(event.get("text") or "").strip()
    else:
        raise ValueError("event must be a string or object")
    if not event_text:
        raise ValueError("event text is required")

    deps: List[str] = []
    if dependency_ids:
        for dep in dependency_ids:
            dep_id = str(dep or "").strip()
            if dep_id:
                deps.append(dep_id)

    if normalized_priority is None or normalized_priority <= 0:
        normalized_priority = derive_event_priority(event_obj)
    if normalized_priority > 1000:
        normalized_priority = 1000

    init_queue_db(db_path)
    now = time.time()
    event_id = str(uuid.uuid4())
    payload = json.dumps(event_obj)
    conn = _connect(db_path)
    try:
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO cognitive_event_queue
            (id, niche_id, execution_id, source, event_text, event_json, parent_event_id, dependency_ids_json,
             status, attempts, max_attempts, priority, available_at, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', 0, ?, ?, ?, ?, ?)
            """,
            (
                event_id,
                niche_id.strip(),
                execution_id,
                source.strip(),
                event_text,
                payload,
                parent_event_id,
                json.dumps(deps),
                max_attempts,
                normalized_priority,
                now,
                now,
                now,
            ),
        )
        conn.commit()
    finally:
        conn.close()
    return event_id


def requeue_stale_processing(
    db_path: str, niche_id: str, stale_after_seconds: float = 0.0
) -> int:
    init_queue_db(db_path)
    now = time.time()
    conn = _connect(db_path)
    try:
        cur = conn.cursor()
        if float(stale_after_seconds) <= 0:
            cur.execute(
                """
                UPDATE cognitive_event_queue
                SET status='pending', updated_at=?, started_at=NULL, last_error=COALESCE(last_error, 'requeued_after_restart')
                WHERE niche_id=? AND status='processing'
                """,
                (now, niche_id),
            )
        else:
            cutoff = now - float(stale_after_seconds)
            cur.execute(
                """
                UPDATE cognitive_event_queue
                SET status='pending', updated_at=?, started_at=NULL, last_error=COALESCE(last_error, 'requeued_after_stale_processing')
                WHERE niche_id=? AND status='processing' AND started_at IS NOT NULL AND started_at < ?
                """,
                (now, niche_id, cutoff),
            )
        changed = cur.rowcount
        conn.commit()
        return changed
    finally:
        conn.close()


def claim_next_event(db_path: str, niche_id: str) -> Optional[Dict[str, Any]]:
    init_queue_db(db_path)
    now = time.time()
    conn = _connect(db_path)
    try:
        cur = conn.cursor()
        cur.execute("BEGIN IMMEDIATE")
        cur.execute(
            """
            SELECT *
            FROM cognitive_event_queue
            WHERE niche_id=? AND status='pending' AND available_at <= ?
            ORDER BY priority ASC, created_at ASC
            LIMIT 50
            """,
            (niche_id, now),
        )
        rows = cur.fetchall()
        if not rows:
            conn.commit()
            return None

        row = None
        for candidate in rows:
            dep_raw = candidate["dependency_ids_json"]
            dep_ids: List[str]
            if isinstance(dep_raw, str) and dep_raw:
                try:
                    parsed = json.loads(dep_raw)
                    dep_ids = [str(x).strip() for x in parsed if str(x).strip()] if isinstance(parsed, list) else []
                except Exception:
                    dep_ids = []
            else:
                dep_ids = []

            if not dep_ids:
                row = candidate
                break

            placeholders = ",".join("?" for _ in dep_ids)
            cur.execute(
                f"""
                SELECT COUNT(*) as unresolved
                FROM cognitive_event_queue
                WHERE niche_id=? AND id IN ({placeholders}) AND status != 'done'
                """,
                [niche_id, *dep_ids],
            )
            unresolved = int(cur.fetchone()["unresolved"])
            if unresolved == 0:
                row = candidate
                break

        if row is None:
            conn.commit()
            return None

        event_id = str(row["id"])
        cur.execute(
            """
            UPDATE cognitive_event_queue
            SET status='processing',
                attempts=attempts+1,
                started_at=?,
                updated_at=?
            WHERE id=? AND status='pending'
            """,
            (now, now, event_id),
        )
        if cur.rowcount != 1:
            conn.commit()
            return None
        conn.commit()
        claimed = dict(row)
        claimed["attempts"] = int(claimed.get("attempts") or 0) + 1
        claimed["status"] = "processing"
        claimed["started_at"] = now
        return claimed
    finally:
        conn.close()


def complete_event(db_path: str, event_id: str, result: Dict[str, Any]) -> None:
    now = time.time()
    conn = _connect(db_path)
    try:
        cur = conn.cursor()
        cur.execute("SELECT niche_id, event_json, parent_event_id FROM cognitive_event_queue WHERE id=?", (event_id,))
        row = cur.fetchone()
        niche_id = str(row["niche_id"]) if row and row["niche_id"] else "unknown"
        event_payload = _safe_json_object(row["event_json"]) if row is not None else {}
        event_metadata = event_payload.get("metadata") if isinstance(event_payload.get("metadata"), dict) else {}
        result_to_store = dict(result) if isinstance(result, dict) else {"ok": bool(result)}
        digest = _extract_digest_from_result(event_id=event_id, niche_id=niche_id, result=result_to_store)
        auto_approved = False
        auto_approval_note = ""
        objective_verification_for_skill: Optional[Dict[str, Any]] = None
        objective_id_for_skill = ""

        objective_context = _extract_objective_context(row) if row is not None else None
        if objective_context is not None:
            objective_id = str(objective_context.get("objective_id") or "").strip()
            objective_id_for_skill = objective_id
            constraints = _resolve_objective_constraints(
                cur,
                objective_id=objective_id,
                fallback=objective_context.get("constraints") if isinstance(objective_context.get("constraints"), dict) else {},
            )
            objective_verification = _evaluate_objective_contract(
                constraints=constraints,
                digest=digest,
                result=result_to_store,
            )
            policy_state = _apply_objective_verification_policy(
                cur,
                objective_id=objective_id,
                event_id=event_id,
                verification=objective_verification,
                final_status=str(digest.get("final_status") or ""),
                now=now,
            )
            remediation_state = str(policy_state.get("remediation_state") or "").strip().lower()
            if remediation_state:
                objective_verification["remediation_state"] = remediation_state
                objective_verification["remediation_pass_streak"] = int(
                    policy_state.get("remediation_pass_streak") or 0
                )
                objective_verification["remediation_recovery_passes_required"] = int(
                    policy_state.get("remediation_recovery_passes_required") or 0
                )
                if bool(policy_state.get("remediation_resolved")):
                    objective_verification["remediation_resolved"] = True
            if bool(policy_state.get("remediation_applied")):
                objective_verification["remediation_applied"] = True
                objective_verification["remediation_reason"] = str(policy_state.get("remediation_reason") or "")
                objective_verification["remediation_state"] = str(policy_state.get("remediation_state") or "active")
                objective_verification["remediation_until"] = policy_state.get("remediation_until")
                objective_verification["remediation_cadence_after"] = policy_state.get("cadence_after")
                _append_risk_flag_to_digest(digest, "auto_remediation")
                if str(digest.get("next_action") or "").strip().lower() != "resolve_approval":
                    digest["next_action"] = "monitor"
            if bool(policy_state.get("escalated")):
                escalation_reason = str(policy_state.get("escalation_reason") or "verification_fail_streak")
                objective_verification["escalated"] = True
                objective_verification["escalation_reason"] = escalation_reason
                objective_verification["fail_streak"] = int(policy_state.get("fail_streak") or 0)
                objective_verification["max_fail_streak"] = int(policy_state.get("max_fail_streak") or 0)
                _append_risk_flag_to_digest(digest, "objective_escalated")
                _append_risk_flag_to_digest(digest, "approval_required")
                digest["final_status"] = "waiting_for_input"
                digest["next_action"] = "resolve_approval"
                digest["one_line_summary"] = _first_line(
                    digest.get("one_line_summary"),
                    fallback="Objective escalated. Operator approval required before next attempt.",
                )

                tick_obj = result_to_store.get("tick")
                if not isinstance(tick_obj, dict):
                    tick_obj = {}
                    result_to_store["tick"] = tick_obj
                tick_result_obj = tick_obj.get("result")
                if not isinstance(tick_result_obj, dict):
                    tick_result_obj = {}
                    tick_obj["result"] = tick_result_obj

                tick_result_obj["status"] = "waiting_for_input"
                tick_result_obj["final_status"] = "waiting_for_input"
                tick_result_obj["next_action"] = "resolve_approval"
                tick_result_obj["objective_id"] = objective_id
                tick_result_obj["approval_reason"] = escalation_reason
                tick_result_obj["one_line_summary"] = str(
                    tick_result_obj.get("one_line_summary")
                    or "Objective escalated. Approval required."
                )
                raw_flags = tick_result_obj.get("risk_flags")
                flags = [str(x).strip().lower() for x in raw_flags] if isinstance(raw_flags, list) else []
                for required_flag in ("objective_escalated", "approval_required"):
                    if required_flag not in flags:
                        flags.append(required_flag)
                tick_result_obj["risk_flags"] = flags

                auto_approval_meta = (
                    event_metadata.get("approval")
                    if isinstance(event_metadata.get("approval"), dict)
                    else {}
                )
                auto_approval_count = _int_or_default(
                    auto_approval_meta.get("auto_count"),
                    0,
                    minimum=0,
                    maximum=1000,
                )
                max_auto_approvals = _int_or_default(
                    constraints.get("auto_approve_max_per_event"),
                    1,
                    minimum=0,
                    maximum=20,
                )
                if (
                    max_auto_approvals > 0
                    and auto_approval_count < max_auto_approvals
                    and _is_auto_approvable_status_waiting(
                        constraints=constraints,
                        event_payload=event_payload,
                        digest=digest,
                    )
                ):
                    auto_approved = True
                    auto_approval_note = "Auto-approved low-risk status objective; retrying automatically."
                    auto_approval_count += 1

                    event_metadata["approval_granted"] = True
                    event_metadata["approval"] = {
                        "approved": True,
                        "auto": True,
                        "auto_count": auto_approval_count,
                        "note": auto_approval_note,
                        "resolved_at": now,
                        "event_id": event_id,
                        "actor": "system_auto",
                    }
                    event_payload["metadata"] = event_metadata

                    _remove_risk_flag_from_digest(digest, "approval_required")
                    _append_risk_flag_to_digest(digest, "auto_approved")
                    digest["final_status"] = "pending"
                    digest["next_action"] = "monitor"
                    digest["one_line_summary"] = auto_approval_note

                    tick_result_obj["status"] = "pending"
                    tick_result_obj["final_status"] = "pending"
                    tick_result_obj["next_action"] = "monitor"
                    tick_result_obj["approval_auto"] = True
                    tick_result_obj["approval_note"] = auto_approval_note
                    tick_result_obj["one_line_summary"] = auto_approval_note
                    raw_flags = tick_result_obj.get("risk_flags")
                    flags = [str(x).strip().lower() for x in raw_flags] if isinstance(raw_flags, list) else []
                    flags = [f for f in flags if f != "approval_required"]
                    if "auto_approved" not in flags:
                        flags.append("auto_approved")
                    tick_result_obj["risk_flags"] = flags

                    cur.execute("SELECT status, metadata_json FROM cognitive_objectives WHERE id=?", (objective_id,))
                    objective_row = cur.fetchone()
                    if objective_row:
                        objective_meta = _safe_json_object(objective_row["metadata_json"])
                        objective_policy = (
                            objective_meta.get("policy")
                            if isinstance(objective_meta.get("policy"), dict)
                            else {}
                        )
                        objective_policy["escalation_state"] = "resolved"
                        objective_policy["escalation_resolved_at"] = now
                        objective_policy["escalation_resolution"] = "auto_approved_low_risk"
                        objective_policy["auto_approval_count"] = _int_or_default(
                            objective_policy.get("auto_approval_count"),
                            0,
                            minimum=0,
                            maximum=1000000,
                        ) + 1
                        objective_policy["auto_approval_last_at"] = now
                        objective_policy["auto_approval_last_event_id"] = event_id
                        objective_policy["approval_hold_until"] = None
                        objective_policy["approval_hold_reason"] = None
                        objective_meta["policy"] = objective_policy
                        cur.execute(
                            """
                            UPDATE cognitive_objectives
                            SET status='active', metadata_json=?, updated_at=?
                            WHERE id=?
                            """,
                            (json.dumps(objective_meta), now, objective_id),
                        )
                    objective_verification["auto_approved"] = True
                    objective_verification["auto_approval_note"] = auto_approval_note
                    objective_verification["auto_approval_count"] = auto_approval_count
            if bool(policy_state.get("objective_found")):
                objective_verification["objective_status_after"] = str(policy_state.get("status_after") or "")
                if auto_approved:
                    objective_verification["objective_status_after"] = "active"

            tick = result_to_store.get("tick") if isinstance(result_to_store.get("tick"), dict) else {}
            tick_reflection = tick.get("reflection") if isinstance(tick.get("reflection"), dict) else {}
            lesson = _first_line(
                tick_reflection.get("lesson"),
                fallback=(
                    f"Objective verification {'passed' if bool(objective_verification.get('passed')) else 'failed'} "
                    f"for event {event_id}."
                ),
            )
            confidence = float(tick_reflection.get("confidence") or (0.9 if bool(objective_verification.get("passed")) else 0.3))
            metadata = {
                "objective_title": str(objective_context.get("title") or ""),
                "action": str(digest.get("action") or ""),
                "final_status": str(digest.get("final_status") or ""),
                "run_id": str(digest.get("run_id") or ""),
            }
            _upsert_objective_reflection_cursor(
                cur,
                objective_id=objective_id,
                event_id=event_id,
                niche_id=niche_id,
                lesson=lesson,
                confidence=confidence,
                status=str(digest.get("final_status") or "unknown"),
                verification=objective_verification,
                metadata=metadata,
            )
            _persist_reflection_memory_cursor(
                cur,
                objective_id=objective_id,
                event_id=event_id,
                niche_id=niche_id,
                lesson=lesson,
                confidence=confidence,
                status=str(digest.get("final_status") or "unknown"),
                verification=objective_verification,
                metadata=metadata,
            )
            if isinstance(result_to_store.get("tick"), dict):
                result_to_store["tick"]["objective_verification"] = objective_verification
                result_to_store["tick"]["objective_id"] = objective_id
            else:
                result_to_store["objective_verification"] = objective_verification
                result_to_store["objective_id"] = objective_id
            objective_verification_for_skill = objective_verification

        skill_candidate = _derive_skill_candidate(
            event_payload=event_payload,
            result=result_to_store,
            digest=digest,
            objective_id=objective_id_for_skill,
            objective_verification=objective_verification_for_skill,
        )
        if skill_candidate is not None:
            skill_snapshot = _upsert_skill_candidate_cursor(
                cur,
                niche_id=niche_id,
                candidate=skill_candidate,
            )
            if skill_snapshot:
                _persist_skill_candidate_memory_cursor(
                    cur,
                    niche_id=niche_id,
                    snapshot=skill_snapshot,
                )
                tick_obj = result_to_store.get("tick") if isinstance(result_to_store.get("tick"), dict) else None
                if isinstance(tick_obj, dict):
                    tick_obj["skill_candidate"] = skill_snapshot
                else:
                    result_to_store["skill_candidate"] = skill_snapshot

        queue_status = "waiting_for_input" if str(digest.get("final_status") or "") == "waiting_for_input" else "done"
        if auto_approved:
            queue_status = "pending"
            cur.execute(
                """
                UPDATE cognitive_event_queue
                SET status='pending',
                    available_at=?,
                    started_at=NULL,
                    finished_at=NULL,
                    updated_at=?,
                    failure_class=NULL,
                    last_error=NULL,
                    result_json=NULL,
                    event_json=?
                WHERE id=?
                """,
                (now, now, json.dumps(event_payload), event_id),
            )
        else:
            cur.execute(
                """
                UPDATE cognitive_event_queue
                SET status=?,
                    finished_at=?,
                    updated_at=?,
                    result_json=?,
                    event_json=?
                WHERE id=?
                """,
                (queue_status, now, now, json.dumps(result_to_store), json.dumps(event_payload), event_id),
            )
        _upsert_digest_cursor(cur, digest)
        conn.commit()
    finally:
        conn.close()


def get_event(db_path: str, event_id: str) -> Optional[Dict[str, Any]]:
    conn = _connect(db_path)
    try:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT id, niche_id, priority, parent_event_id, dependency_ids_json, status, attempts, max_attempts,
                   event_text, event_json, created_at, started_at, finished_at, updated_at, failure_class,
                   last_error, result_json
            FROM cognitive_event_queue
            WHERE id=?
            """,
            (event_id,),
        )
        row = cur.fetchone()
        if not row:
            return None
        data = dict(row)
        for key in ("event_json", "result_json", "dependency_ids_json"):
            raw = data.get(key)
            if isinstance(raw, str) and raw:
                try:
                    data[key] = json.loads(raw)
                except Exception:
                    pass
        digest = get_event_digest(db_path, event_id)
        if digest is not None:
            data["digest"] = digest
        return data
    finally:
        conn.close()


def get_event_digest(db_path: str, event_id: str) -> Optional[Dict[str, Any]]:
    conn = _connect(db_path)
    try:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT event_id, niche_id, run_id, action, final_status, one_line_summary, next_action, risk_flags_json,
                   execution_id, created_at, updated_at
            FROM cognitive_event_digest
            WHERE event_id=?
            """,
            (event_id,),
        )
        row = cur.fetchone()
        if not row:
            return None
        data = dict(row)
        raw_flags = data.get("risk_flags_json")
        if isinstance(raw_flags, str) and raw_flags:
            try:
                parsed = json.loads(raw_flags)
                data["risk_flags"] = parsed if isinstance(parsed, list) else []
            except Exception:
                data["risk_flags"] = []
        else:
            data["risk_flags"] = []
        data.pop("risk_flags_json", None)
        return data
    finally:
        conn.close()


def list_event_digests(db_path: str, niche_id: str, limit: int = 20) -> List[Dict[str, Any]]:
    safe_limit = max(1, min(int(limit), 200))
    conn = _connect(db_path)
    try:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT event_id, niche_id, run_id, action, final_status, one_line_summary, next_action, risk_flags_json,
                   execution_id, created_at, updated_at
            FROM cognitive_event_digest
            WHERE niche_id=?
            ORDER BY updated_at DESC
            LIMIT ?
            """,
            (niche_id, safe_limit),
        )
        rows = cur.fetchall()
        out: List[Dict[str, Any]] = []
        for row in rows:
            item = dict(row)
            raw_flags = item.get("risk_flags_json")
            if isinstance(raw_flags, str) and raw_flags:
                try:
                    parsed = json.loads(raw_flags)
                    item["risk_flags"] = parsed if isinstance(parsed, list) else []
                except Exception:
                    item["risk_flags"] = []
            else:
                item["risk_flags"] = []
            item.pop("risk_flags_json", None)
            out.append(item)
        return out
    finally:
        conn.close()


def list_pending_approvals(
    db_path: str,
    niche_id: str,
    limit: int = 20,
    objective_id: Optional[str] = None,
) -> List[Dict[str, Any]]:
    safe_limit = max(1, min(int(limit), 200))
    objective_filter = str(objective_id or "").strip()
    query_limit = min(2000, safe_limit * 10) if objective_filter else safe_limit
    conn = _connect(db_path)
    try:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT id, niche_id, event_text, event_json, result_json, updated_at
            FROM cognitive_event_queue
            WHERE niche_id=? AND status='waiting_for_input'
            ORDER BY updated_at DESC
            LIMIT ?
            """,
            (niche_id, query_limit),
        )
        rows = cur.fetchall()
        out: List[Dict[str, Any]] = []
        for row in rows:
            item = dict(row)
            event_id = str(item.get("id") or "")
            event_payload = _safe_json_object(item.get("event_json"))
            event_meta = event_payload.get("metadata") if isinstance(event_payload.get("metadata"), dict) else {}
            if objective_filter and str(event_meta.get("objective_id") or "").strip() != objective_filter:
                continue
            result_json = item.get("result_json")
            tick_result: Dict[str, Any] = {}
            if isinstance(result_json, str) and result_json:
                try:
                    result_obj = json.loads(result_json)
                    tick = result_obj.get("tick") if isinstance(result_obj, dict) else {}
                    tick_result = tick.get("result") if isinstance(tick, dict) and isinstance(tick.get("result"), dict) else {}
                except Exception:
                    tick_result = {}
            digest = get_event_digest(db_path, event_id)
            out.append(
                {
                    "event_id": event_id,
                    "niche_id": str(item.get("niche_id") or niche_id),
                    "event_text": str(item.get("event_text") or ""),
                    "updated_at": item.get("updated_at"),
                    "action": str(tick_result.get("action") or ""),
                    "command": str(tick_result.get("command") or ""),
                    "capability": str(tick_result.get("capability") or ""),
                    "risk_level": str(tick_result.get("risk_level") or ""),
                    "trust_mode": str(tick_result.get("trust_mode") or ""),
                    "summary": str(tick_result.get("one_line_summary") or ""),
                    "source": str(event_payload.get("source") or ""),
                    "objective_id": str(event_meta.get("objective_id") or ""),
                    "objective_title": str(event_meta.get("objective_title") or ""),
                    "digest": digest,
                }
            )
            if len(out) >= safe_limit:
                break
        return out
    finally:
        conn.close()


def _normalize_objective_status(status: str) -> str:
    token = str(status or "").strip().lower()
    if token in {"active", "paused", "completed", "archived"}:
        return token
    raise ValueError("status must be one of: active, paused, completed, archived")


def _normalize_objective_priority(priority: Any) -> int:
    try:
        value = int(priority)
    except Exception as exc:
        raise ValueError("priority must be an integer") from exc
    return max(1, min(value, 1000))


def _normalize_cadence_seconds(value: Any) -> float:
    try:
        cadence = float(value)
    except Exception as exc:
        raise ValueError("cadence_seconds must be numeric") from exc
    if cadence < 0:
        raise ValueError("cadence_seconds must be >= 0")
    return cadence


def _as_json_dict(raw: Optional[str], field_name: str) -> str:
    if raw is None or str(raw).strip() == "":
        return "{}"
    try:
        parsed = json.loads(str(raw))
    except Exception as exc:
        raise ValueError(f"{field_name} must be valid JSON") from exc
    if not isinstance(parsed, dict):
        raise ValueError(f"{field_name} must be a JSON object")
    return json.dumps(parsed)


def _merge_constraints_json(base_raw: Optional[str], overrides: Dict[str, Any]) -> str:
    base_obj = _safe_json_object(base_raw) if base_raw is not None else {}
    merged = dict(base_obj)
    for key, value in overrides.items():
        if value is None:
            continue
        merged[str(key)] = value
    return json.dumps(merged)


def _objective_row_to_dict(row: sqlite3.Row) -> Dict[str, Any]:
    item = dict(row)
    for key in ("constraints_json", "metadata_json"):
        raw = item.get(key)
        if isinstance(raw, str) and raw:
            try:
                item[key.replace("_json", "")] = json.loads(raw)
            except Exception:
                item[key.replace("_json", "")] = {}
        else:
            item[key.replace("_json", "")] = {}
        item.pop(key, None)
    return item


def _int_or_default(raw: Any, default: int, minimum: Optional[int] = None, maximum: Optional[int] = None) -> int:
    try:
        value = int(raw)
    except Exception:
        value = int(default)
    if minimum is not None and value < minimum:
        value = minimum
    if maximum is not None and value > maximum:
        value = maximum
    return value


def _float_or_default(
    raw: Any, default: float, minimum: Optional[float] = None, maximum: Optional[float] = None
) -> float:
    try:
        value = float(raw)
    except Exception:
        value = float(default)
    if minimum is not None and value < minimum:
        value = minimum
    if maximum is not None and value > maximum:
        value = maximum
    return value


def _objective_effective_deadline(row: sqlite3.Row, constraints: Dict[str, Any]) -> Optional[float]:
    deadline_at = constraints.get("deadline_at")
    if deadline_at is not None:
        deadline = _float_or_default(deadline_at, 0.0, minimum=0.0)
        if deadline > 0:
            return deadline

    sla_seconds = constraints.get("sla_seconds")
    if sla_seconds is not None:
        sla = _float_or_default(sla_seconds, -1.0)
        if sla >= 0:
            created_at = _float_or_default(row["created_at"], time.time())
            return created_at + sla
    return None


def _objective_effective_priority(
    row: sqlite3.Row,
    constraints: Dict[str, Any],
    now: float,
) -> Dict[str, Any]:
    base_priority = _int_or_default(row["priority"], 70, minimum=1, maximum=1000)
    next_run_at = _float_or_default(row["next_run_at"], now)
    overdue_seconds = max(0.0, now - next_run_at)

    aging_window = _float_or_default(constraints.get("aging_window_seconds"), 300.0, minimum=1.0)
    aging_max_boost = _int_or_default(constraints.get("aging_max_boost"), 30, minimum=0, maximum=300)
    aging_boost = 0
    if overdue_seconds > 0 and aging_max_boost > 0 and aging_window > 0:
        aging_boost = min(aging_max_boost, int(overdue_seconds // aging_window))

    effective_priority = max(1, base_priority - aging_boost)
    flags: List[str] = []
    if aging_boost > 0:
        flags.append("priority_aging")

    deadline_at = _objective_effective_deadline(row, constraints)
    if deadline_at is not None:
        if now >= deadline_at:
            effective_priority = 1
            flags.append("deadline_missed")
        else:
            warn_window = _float_or_default(constraints.get("deadline_warning_seconds"), 600.0, minimum=0.0)
            if warn_window > 0 and (deadline_at - now) <= warn_window:
                effective_priority = max(1, effective_priority - 15)
                flags.append("deadline_near")

    return {
        "effective_priority": effective_priority,
        "base_priority": base_priority,
        "aging_boost": aging_boost,
        "overdue_seconds": overdue_seconds,
        "deadline_at": deadline_at,
        "flags": flags,
    }


def _normalize_execution_target(raw: Any) -> str:
    token = str(raw or "").strip().lower()
    if token in {"auto", "cloud", "local_companion"}:
        return token
    return ""


def _normalize_trust_mode(raw: Any) -> str:
    token = str(raw or "").strip().lower()
    if token in {"auto", "guarded", "strict"}:
        return token
    return ""


def _normalize_operator_approval_levels(raw: Any) -> List[str]:
    allowed = {"low", "medium", "high"}
    tokens = _token_list(raw)
    seen = set()
    out: List[str] = []
    for token in tokens:
        if token not in allowed or token in seen:
            continue
        out.append(token)
        seen.add(token)
    return out


def _normalize_operator_safety_profile(raw: Any) -> str:
    token = str(raw or "").strip().lower()
    if token in {"default", "high_only", "medium_high", "all", "none"}:
        return token
    return ""


def _operator_approval_levels_for_profile(profile: str, trust_mode: str) -> List[str]:
    normalized_profile = _normalize_operator_safety_profile(profile)
    normalized_trust = _normalize_trust_mode(trust_mode) or "guarded"
    if normalized_profile == "high_only":
        return ["high"]
    if normalized_profile == "medium_high":
        return ["medium", "high"]
    if normalized_profile == "all":
        return ["low", "medium", "high"]
    if normalized_profile == "none":
        return []

    # "default" profile follows trust mode defaults.
    if normalized_trust == "auto":
        return _normalize_operator_approval_levels(
            os.getenv("ORION_COGNITIVE_OPERATOR_APPROVAL_LEVELS_AUTO") or []
        )
    if normalized_trust == "strict":
        strict_all = str(os.getenv("ORION_COGNITIVE_OPERATOR_STRICT_APPROVAL_ALL") or "").strip().lower() in {
            "1",
            "true",
            "yes",
            "on",
        }
        strict_default: Any = ["low", "medium", "high"] if strict_all else ["medium", "high"]
        raw = os.getenv("ORION_COGNITIVE_OPERATOR_APPROVAL_LEVELS_STRICT")
        return _normalize_operator_approval_levels(raw if raw is not None else strict_default)
    raw = os.getenv("ORION_COGNITIVE_OPERATOR_APPROVAL_LEVELS_GUARDED")
    return _normalize_operator_approval_levels(raw if raw is not None else ["high"])


def _objective_operator_approval_levels(
    *,
    constraints: Dict[str, Any],
    objective_metadata: Dict[str, Any],
    trust_mode: str,
) -> List[str]:
    explicit_levels = _normalize_operator_approval_levels(constraints.get("operator_approval_levels"))
    if explicit_levels or "operator_approval_levels" in constraints:
        return explicit_levels

    metadata_levels = _normalize_operator_approval_levels(objective_metadata.get("operator_approval_levels"))
    if metadata_levels or "operator_approval_levels" in objective_metadata:
        return metadata_levels

    profile = _normalize_operator_safety_profile(
        constraints.get("operator_safety_profile") or objective_metadata.get("operator_safety_profile")
    )
    if not profile:
        profile = "default"
    return _operator_approval_levels_for_profile(profile, trust_mode)


def _is_status_health_goal(goal_text: str) -> bool:
    text = _normalize_brand_command_alias(str(goal_text or "")).lower()
    if not text:
        return False
    if text.startswith("/orion run "):
        text = text[len("/orion run ") :].strip()
    if text.startswith("/orion "):
        text = text[len("/orion ") :].strip()
    return text in {
        "status",
        "/status",
        "runtime status",
        "status check",
        "quick status check",
        "health",
        "health check",
        "system status",
    } or text.startswith("status ") or text.startswith("health ")


def _objective_dispatch_preferences(constraints: Dict[str, Any], goal_text: str = "") -> Dict[str, Any]:
    explicit_target = _normalize_execution_target(
        constraints.get("execution_target")
        or constraints.get("preferred_execution_target")
        or constraints.get("route")
    )
    explicit_trust_mode = _normalize_trust_mode(constraints.get("trust_mode"))
    target = explicit_target
    trust_mode = explicit_trust_mode
    reason = ""
    flags: List[str] = []
    status_like_goal = _is_status_health_goal(goal_text)

    if status_like_goal and not explicit_target:
        target = "local_companion"
        flags.append("status_route_local_companion")
        reason = "status_low_risk"
    if status_like_goal and not explicit_trust_mode:
        trust_mode = "guarded"
        flags.append("status_trust_guarded")
        if not reason:
            reason = "status_low_risk"

    if not target:
        raw_sla = constraints.get("sla_seconds")
        if raw_sla is not None:
            sla_seconds = _float_or_default(raw_sla, -1.0)
            local_threshold = _float_or_default(
                constraints.get("sla_local_threshold_seconds"),
                1800.0,
                minimum=60.0,
                maximum=86400.0,
            )
            cloud_threshold = _float_or_default(
                constraints.get("sla_cloud_threshold_seconds"),
                21600.0,
                minimum=600.0,
                maximum=604800.0,
            )
            if 0 < sla_seconds <= local_threshold:
                target = "local_companion"
                reason = "sla_tight"
                flags.append("sla_route_local_companion")
            elif sla_seconds >= cloud_threshold:
                target = "cloud"
                reason = "sla_relaxed"
                flags.append("sla_route_cloud")

    if not trust_mode:
        if bool(constraints.get("strict_approval")):
            trust_mode = "strict"
            flags.append("trust_strict")
        elif bool(constraints.get("no_approval")):
            trust_mode = "auto"
            flags.append("trust_auto")

    if target and not reason:
        reason = "constraint"
    return {
        "execution_target": target,
        "trust_mode": trust_mode,
        "reason": reason,
        "flags": flags,
    }


def _is_auto_approvable_status_waiting(
    *,
    constraints: Dict[str, Any],
    event_payload: Dict[str, Any],
    digest: Dict[str, Any],
) -> bool:
    if not bool(constraints.get("auto_approve_status_waiting", True)):
        return False

    final_status = str(digest.get("final_status") or "").strip().lower()
    if final_status not in {"waiting_for_input", "needs_input"}:
        return False

    metadata = event_payload.get("metadata") if isinstance(event_payload.get("metadata"), dict) else {}
    dispatch = metadata.get("objective_dispatch") if isinstance(metadata.get("objective_dispatch"), dict) else {}
    dispatch_flags = _token_list(dispatch.get("flags"))
    dispatch_reason = str(dispatch.get("reason") or "").strip().lower()
    event_text = str(event_payload.get("text") or "").strip()

    status_low_risk = (
        _is_status_health_goal(event_text)
        or dispatch_reason == "status_low_risk"
        or "status_route_local_companion" in dispatch_flags
    )
    if not status_low_risk:
        return False

    execution_target = str(
        metadata.get("execution_target")
        or dispatch.get("execution_target")
        or ""
    ).strip().lower()
    trust_mode = str(metadata.get("trust_mode") or dispatch.get("trust_mode") or "").strip().lower()

    if execution_target and execution_target != "local_companion":
        return False
    if trust_mode and trust_mode not in {"guarded", "auto"}:
        return False
    return True


def _append_risk_flag_to_digest(digest: Dict[str, Any], flag: str) -> None:
    token = str(flag or "").strip().lower()
    if not token:
        return
    current: List[str] = []
    raw = digest.get("risk_flags_json")
    if isinstance(raw, str) and raw:
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, list):
                current = [str(x).strip().lower() for x in parsed if str(x).strip()]
        except Exception:
            current = []
    if token not in current:
        current.append(token)
    digest["risk_flags_json"] = json.dumps(current)


def _remove_risk_flag_from_digest(digest: Dict[str, Any], flag: str) -> None:
    token = str(flag or "").strip().lower()
    if not token:
        return
    current: List[str] = []
    raw = digest.get("risk_flags_json")
    if isinstance(raw, str) and raw:
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, list):
                current = [str(x).strip().lower() for x in parsed if str(x).strip()]
        except Exception:
            current = []
    if token not in current:
        return
    current = [x for x in current if x != token]
    digest["risk_flags_json"] = json.dumps(current)


def _objective_reflection_trend(
    cur: sqlite3.Cursor,
    *,
    objective_id: str,
    limit: int = 5,
) -> Dict[str, Any]:
    safe_limit = max(1, min(int(limit), 50))
    cur.execute(
        """
        SELECT passed, confidence, created_at
        FROM cognitive_objective_reflections
        WHERE objective_id=?
        ORDER BY created_at DESC
        LIMIT ?
        """,
        (objective_id, safe_limit),
    )
    rows = cur.fetchall()
    if not rows:
        return {
            "count": 0,
            "pass_rate": None,
            "avg_confidence": None,
            "trend_delta": 0.0,
            "trend": "flat",
        }
    pass_count = 0
    confidence_values: List[float] = []
    for row in rows:
        if bool(row["passed"]):
            pass_count += 1
        try:
            confidence_values.append(float(row["confidence"] or 0.0))
        except Exception:
            confidence_values.append(0.0)
    count = len(rows)
    pass_rate = float(pass_count) / float(count) if count > 0 else None
    avg_confidence = (
        float(sum(confidence_values) / float(len(confidence_values)))
        if confidence_values
        else None
    )
    trend_delta = (
        float(confidence_values[0] - confidence_values[-1])
        if len(confidence_values) >= 2
        else 0.0
    )
    trend = "flat"
    if trend_delta > 0.08:
        trend = "up"
    elif trend_delta < -0.08:
        trend = "down"
    return {
        "count": count,
        "pass_rate": pass_rate,
        "avg_confidence": avg_confidence,
        "trend_delta": trend_delta,
        "trend": trend,
    }


def _apply_objective_verification_policy(
    cur: sqlite3.Cursor,
    *,
    objective_id: str,
    event_id: str,
    verification: Dict[str, Any],
    final_status: str,
    now: float,
) -> Dict[str, Any]:
    cur.execute(
        """
        SELECT status, cadence_seconds, next_run_at, constraints_json, metadata_json
        FROM cognitive_objectives
        WHERE id=?
        """,
        (objective_id,),
    )
    row = cur.fetchone()
    if not row:
        return {"ok": False, "objective_found": False}

    objective_status = str(row["status"] or "active")
    constraints = _safe_json_object(row["constraints_json"])
    metadata = _safe_json_object(row["metadata_json"])
    policy = metadata.get("policy") if isinstance(metadata.get("policy"), dict) else {}

    passed = bool(verification.get("passed"))
    previous_streak = _int_or_default(policy.get("verification_fail_streak"), 0, minimum=0)
    fail_streak = 0 if passed else previous_streak + 1

    policy["verification_fail_streak"] = fail_streak
    policy["verification_last_passed"] = passed
    policy["verification_last_at"] = now
    policy["verification_last_event_id"] = event_id

    max_fail_streak = _int_or_default(constraints.get("max_fail_streak"), 3, minimum=1, maximum=20)
    escalate_on_fail_streak = bool(constraints.get("escalate_on_fail_streak", True))
    pause_on_escalation = bool(constraints.get("pause_on_escalation", True))
    final_status_token = str(final_status or "").strip().lower()
    waiting_for_input = final_status_token in {"waiting_for_input", "needs_input"}
    escalate_on_waiting = bool(constraints.get("escalate_on_waiting_for_input", True))
    current_cadence = _float_or_default(row["cadence_seconds"], 0.0, minimum=0.0, maximum=86400.0)
    current_next_run = _float_or_default(row["next_run_at"], now, minimum=0.0)

    trend_limit = _int_or_default(
        constraints.get("auto_remediation_reflection_window"),
        5,
        minimum=2,
        maximum=20,
    )
    trend_stats = _objective_reflection_trend(
        cur,
        objective_id=objective_id,
        limit=trend_limit,
    )
    policy["trend_reflection_count"] = int(trend_stats.get("count") or 0)
    policy["trend_pass_rate"] = (
        round(float(trend_stats.get("pass_rate") or 0.0), 4)
        if trend_stats.get("pass_rate") is not None
        else None
    )
    policy["trend_avg_confidence"] = (
        round(float(trend_stats.get("avg_confidence") or 0.0), 4)
        if trend_stats.get("avg_confidence") is not None
        else None
    )
    policy["trend_delta"] = round(float(trend_stats.get("trend_delta") or 0.0), 4)
    policy["trend_direction"] = str(trend_stats.get("trend") or "flat")

    remediation_enabled = bool(constraints.get("auto_remediation_enabled", True))
    remediation_min_fail_streak = _int_or_default(
        constraints.get("auto_remediation_min_fail_streak"),
        2,
        minimum=1,
        maximum=20,
    )
    remediation_min_reflections = _int_or_default(
        constraints.get("auto_remediation_min_reflections"),
        3,
        minimum=1,
        maximum=50,
    )
    remediation_pass_rate_max = _float_or_default(
        constraints.get("auto_remediation_pass_rate_max"),
        0.7,
        minimum=0.0,
        maximum=1.0,
    )
    remediation_conf_drop_threshold = _float_or_default(
        constraints.get("auto_remediation_conf_drop_threshold"),
        0.08,
        minimum=0.0,
        maximum=1.0,
    )
    remediation_window_seconds = _float_or_default(
        constraints.get("auto_remediation_retry_window_seconds"),
        600.0,
        minimum=60.0,
        maximum=86400.0,
    )
    remediation_slowdown_factor = _float_or_default(
        constraints.get("auto_remediation_slowdown_factor"),
        1.5,
        minimum=1.0,
        maximum=8.0,
    )
    remediation_min_cadence = _float_or_default(
        constraints.get("auto_remediation_min_cadence_seconds"),
        60.0,
        minimum=1.0,
        maximum=86400.0,
    )
    remediation_base_cadence = _float_or_default(
        constraints.get("auto_remediation_base_cadence_seconds"),
        300.0,
        minimum=1.0,
        maximum=86400.0,
    )
    remediation_recovery_passes = _int_or_default(
        constraints.get("auto_remediation_recovery_passes"),
        2,
        minimum=1,
        maximum=10,
    )
    remediation_until = _float_or_default(
        policy.get("escalation_deferred_until"),
        0.0,
        minimum=0.0,
        maximum=(now + 86400.0 * 365.0),
    )
    remediation_window_active = (
        str(policy.get("escalation_state") or "").strip().lower() == "deferred"
        and remediation_until > now
    )
    remediation_state_token = str(policy.get("remediation_state") or "").strip().lower()
    remediation_pass_streak = _int_or_default(
        policy.get("remediation_pass_streak"),
        0,
        minimum=0,
        maximum=1000000,
    )
    if remediation_state_token in {"active", "deferred", "recovering"}:
        if passed:
            remediation_pass_streak += 1
        else:
            remediation_pass_streak = 0
        policy["remediation_pass_streak"] = remediation_pass_streak
        policy["remediation_recovery_passes_required"] = remediation_recovery_passes
    remediation_applied = False
    remediation_reason = ""
    remediation_resolved = False
    cadence_after = current_cadence
    pass_rate = trend_stats.get("pass_rate")
    trend_down = str(trend_stats.get("trend") or "flat") == "down"
    fail_streak_rising = (not passed) and fail_streak > previous_streak and fail_streak >= remediation_min_fail_streak
    trend_enough = int(trend_stats.get("count") or 0) >= remediation_min_reflections
    pass_rate_low = pass_rate is not None and float(pass_rate) <= remediation_pass_rate_max
    conf_drop = float(trend_stats.get("trend_delta") or 0.0) <= -remediation_conf_drop_threshold
    should_apply_remediation = (
        remediation_enabled
        and fail_streak_rising
        and trend_enough
        and trend_down
        and pass_rate_low
        and conf_drop
    )
    if should_apply_remediation:
        remediation_applied = True
        remediation_reason = "trend_down_fail_rise"
        remediation_until = now + remediation_window_seconds
        remediation_window_active = True
        policy["auto_remediation_count"] = _int_or_default(
            policy.get("auto_remediation_count"),
            0,
            minimum=0,
            maximum=1000000,
        ) + 1
        policy["remediation_state"] = "active"
        policy["remediation_reason"] = remediation_reason
        policy["remediation_started_at"] = now
        policy["remediation_last_at"] = now
        policy["remediation_event_id"] = event_id
        policy["remediation_pass_streak"] = 0
        policy["remediation_recovery_passes_required"] = remediation_recovery_passes
        policy["escalation_state"] = "deferred"
        policy["escalation_reason"] = "auto_remediation_window"
        policy["escalation_deferred_until"] = remediation_until
        policy["approval_hold_until"] = remediation_until
        policy["approval_hold_reason"] = "auto_remediation_window"
        policy["dispatch_override_target"] = "local_companion"
        policy["dispatch_override_trust"] = "guarded"
        policy["dispatch_override_until"] = remediation_until
        base_cadence = current_cadence if current_cadence > 0 else remediation_base_cadence
        cadence_after = max(remediation_min_cadence, float(base_cadence) * remediation_slowdown_factor)
        policy["remediation_cadence_before"] = current_cadence
        policy["remediation_cadence_after"] = cadence_after

    escalated = False
    escalation_reason = ""
    status_after = objective_status
    if waiting_for_input and escalate_on_waiting and not remediation_window_active:
        escalated = True
        escalation_reason = "waiting_for_input"
        policy["escalation_state"] = "open"
        policy["escalation_reason"] = escalation_reason
        policy["escalation_opened_at"] = now
        policy["escalation_event_id"] = event_id
        if pause_on_escalation and objective_status == "active":
            status_after = "paused"
    elif not passed and escalate_on_fail_streak and fail_streak >= max_fail_streak and not remediation_window_active:
        escalated = True
        escalation_reason = "verification_fail_streak"
        policy["escalation_state"] = "open"
        policy["escalation_reason"] = escalation_reason
        policy["escalation_opened_at"] = now
        policy["escalation_event_id"] = event_id
        if pause_on_escalation and objective_status == "active":
            status_after = "paused"
    elif passed:
        remediation_state_after = str(policy.get("remediation_state") or "").strip().lower()
        if remediation_state_after in {"active", "deferred", "recovering"}:
            current_remediation_pass_streak = _int_or_default(
                policy.get("remediation_pass_streak"),
                0,
                minimum=0,
                maximum=1000000,
            )
            policy["remediation_last_at"] = now
            policy["remediation_event_id"] = event_id
            if current_remediation_pass_streak >= remediation_recovery_passes:
                remediation_resolved = True
                policy["remediation_state"] = "resolved"
                policy["remediation_reason"] = "recovered"
                policy["remediation_resolved_at"] = now
                policy["dispatch_override_until"] = now
                policy["escalation_state"] = "resolved"
                policy["escalation_resolution"] = "auto_remediation_recovered"
                if str(policy.get("approval_hold_reason") or "").strip().lower() == "auto_remediation_window":
                    policy["approval_hold_until"] = None
                    policy["approval_hold_reason"] = None
                baseline_cadence = _float_or_default(
                    policy.get("remediation_cadence_before"),
                    current_cadence,
                    minimum=0.0,
                    maximum=86400.0,
                )
                cadence_after = baseline_cadence
                policy["remediation_cadence_restored"] = cadence_after
            else:
                policy["remediation_state"] = "recovering"
                policy["remediation_reason"] = "recovery_in_progress"
                if str(policy.get("approval_hold_reason") or "").strip().lower() == "auto_remediation_window":
                    policy["approval_hold_until"] = None
                    policy["approval_hold_reason"] = None
                if str(policy.get("escalation_state") or "").strip().lower() == "deferred":
                    policy["escalation_state"] = "resolved"
                    policy["escalation_resolution"] = "remediation_recovery_in_progress"
        if str(policy.get("escalation_state") or "").strip().lower() == "open" and bool(
            constraints.get("auto_close_escalation_on_pass", True)
        ):
            policy["escalation_state"] = "resolved"
            policy["escalation_resolved_at"] = now

    remediation_until = _float_or_default(
        policy.get("escalation_deferred_until"),
        0.0,
        minimum=0.0,
        maximum=(now + 86400.0 * 365.0),
    )
    remediation_window_active = (
        str(policy.get("escalation_state") or "").strip().lower() == "deferred"
        and remediation_until > now
    )
    next_run_after = current_next_run
    if remediation_window_active:
        next_run_after = max(current_next_run, remediation_until)
    if remediation_resolved and cadence_after > 0:
        resolved_due = now + cadence_after
        next_run_after = min(next_run_after, resolved_due)

    metadata["policy"] = policy
    cur.execute(
        """
        UPDATE cognitive_objectives
        SET status=?, cadence_seconds=?, next_run_at=?, metadata_json=?, updated_at=?
        WHERE id=?
        """,
        (status_after, cadence_after, next_run_after, json.dumps(metadata), now, objective_id),
    )

    return {
        "ok": True,
        "objective_found": True,
        "escalated": escalated,
        "status_before": objective_status,
        "status_after": status_after,
        "fail_streak": fail_streak,
        "max_fail_streak": max_fail_streak,
        "escalation_reason": escalation_reason,
        "remediation_applied": remediation_applied,
        "remediation_reason": remediation_reason,
        "remediation_until": remediation_until if remediation_window_active else None,
        "remediation_state": str(policy.get("remediation_state") or ""),
        "remediation_resolved": remediation_resolved,
        "remediation_pass_streak": _int_or_default(
            policy.get("remediation_pass_streak"),
            0,
            minimum=0,
            maximum=1000000,
        ),
        "remediation_recovery_passes_required": remediation_recovery_passes,
        "next_run_at_after": next_run_after,
        "cadence_after": cadence_after,
    }


def create_objective(
    *,
    db_path: str,
    niche_id: str,
    title: str,
    goal_text: str,
    priority: int = 70,
    cadence_seconds: float = 0.0,
    next_run_at: Optional[float] = None,
    constraints_json: Optional[str] = None,
    metadata_json: Optional[str] = None,
) -> Dict[str, Any]:
    if not str(niche_id or "").strip():
        raise ValueError("niche_id is required")
    title_clean = str(title or "").strip()
    goal_clean = str(goal_text or "").strip()
    if not title_clean:
        raise ValueError("title is required")
    if not goal_clean:
        raise ValueError("goal_text is required")

    init_queue_db(db_path)
    now = time.time()
    objective_id = str(uuid.uuid4())
    objective_priority = _normalize_objective_priority(priority)
    cadence = _normalize_cadence_seconds(cadence_seconds)
    next_due = float(next_run_at) if next_run_at is not None else now
    constraints_payload = _as_json_dict(constraints_json, "constraints_json")
    metadata_payload = _as_json_dict(metadata_json, "metadata_json")

    conn = _connect(db_path)
    try:
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO cognitive_objectives
            (id, niche_id, title, goal_text, status, priority, cadence_seconds, next_run_at, last_run_at, last_event_id,
             constraints_json, metadata_json, created_at, updated_at, completed_at)
            VALUES (?, ?, ?, ?, 'active', ?, ?, ?, NULL, NULL, ?, ?, ?, ?, NULL)
            """,
            (
                objective_id,
                str(niche_id).strip(),
                title_clean,
                goal_clean,
                objective_priority,
                cadence,
                next_due,
                constraints_payload,
                metadata_payload,
                now,
                now,
            ),
        )
        conn.commit()
        cur.execute("SELECT * FROM cognitive_objectives WHERE id=?", (objective_id,))
        row = cur.fetchone()
        if not row:
            raise RuntimeError("objective_create_failed")
        return _objective_row_to_dict(row)
    finally:
        conn.close()


def list_objectives(
    *,
    db_path: str,
    niche_id: str,
    status: Optional[str] = None,
    limit: int = 50,
) -> List[Dict[str, Any]]:
    init_queue_db(db_path)
    safe_limit = max(1, min(int(limit), 500))
    conn = _connect(db_path)
    try:
        cur = conn.cursor()
        if status:
            norm = _normalize_objective_status(status)
            cur.execute(
                """
                SELECT *
                FROM cognitive_objectives
                WHERE niche_id=? AND status=?
                ORDER BY priority ASC, created_at ASC
                LIMIT ?
                """,
                (niche_id, norm, safe_limit),
            )
        else:
            cur.execute(
                """
                SELECT *
                FROM cognitive_objectives
                WHERE niche_id=?
                ORDER BY
                  CASE status
                    WHEN 'active' THEN 1
                    WHEN 'paused' THEN 2
                    WHEN 'completed' THEN 3
                    ELSE 4
                  END ASC,
                  priority ASC,
                  created_at ASC
                LIMIT ?
                """,
                (niche_id, safe_limit),
            )
        return [_objective_row_to_dict(row) for row in cur.fetchall()]
    finally:
        conn.close()


def get_objective(
    *,
    db_path: str,
    objective_id: str,
) -> Optional[Dict[str, Any]]:
    init_queue_db(db_path)
    conn = _connect(db_path)
    try:
        cur = conn.cursor()
        cur.execute("SELECT * FROM cognitive_objectives WHERE id=?", (objective_id,))
        row = cur.fetchone()
        if not row:
            return None
        return _objective_row_to_dict(row)
    finally:
        conn.close()


def update_objective(
    *,
    db_path: str,
    objective_id: str,
    status: Optional[str] = None,
    title: Optional[str] = None,
    goal_text: Optional[str] = None,
    priority: Optional[int] = None,
    cadence_seconds: Optional[float] = None,
    next_run_at: Optional[float] = None,
    constraints_json: Optional[str] = None,
    metadata_json: Optional[str] = None,
) -> Dict[str, Any]:
    init_queue_db(db_path)
    current = get_objective(db_path=db_path, objective_id=objective_id)
    if current is None:
        raise ValueError("objective_not_found")
    updates: Dict[str, Any] = {}
    normalized_status: Optional[str] = None
    if status is not None:
        normalized_status = _normalize_objective_status(status)
        updates["status"] = normalized_status
    if title is not None:
        clean_title = str(title).strip()
        if not clean_title:
            raise ValueError("title cannot be empty")
        updates["title"] = clean_title
    if goal_text is not None:
        clean_goal = str(goal_text).strip()
        if not clean_goal:
            raise ValueError("goal_text cannot be empty")
        updates["goal_text"] = clean_goal
    if priority is not None:
        updates["priority"] = _normalize_objective_priority(priority)
    if cadence_seconds is not None:
        updates["cadence_seconds"] = _normalize_cadence_seconds(cadence_seconds)
    if next_run_at is not None:
        updates["next_run_at"] = float(next_run_at)
    if constraints_json is not None:
        updates["constraints_json"] = _as_json_dict(constraints_json, "constraints_json")
    if metadata_json is not None:
        updates["metadata_json"] = _as_json_dict(metadata_json, "metadata_json")
    if not updates:
        return current

    now = time.time()

    if metadata_json is not None:
        metadata_payload: Dict[str, Any] = _safe_json_object(_as_json_dict(metadata_json, "metadata_json"))
    else:
        metadata_payload = dict(current.get("metadata") if isinstance(current.get("metadata"), dict) else {})
    provided_policy = metadata_payload.get("policy") if isinstance(metadata_payload.get("policy"), dict) else {}
    provided_escalation_state = str(provided_policy.get("escalation_state") or "").strip().lower()

    if normalized_status is not None:
        policy = metadata_payload.get("policy") if isinstance(metadata_payload.get("policy"), dict) else {}
        if normalized_status == "active":
            preserve_open = metadata_json is not None and provided_escalation_state == "open"
            if (not preserve_open) and str(policy.get("escalation_state") or "").strip().lower() == "open":
                policy["escalation_state"] = "resolved"
                policy["escalation_resolved_at"] = now
                policy["escalation_resolution"] = "manual_resume"
            policy["approval_hold_until"] = None
            policy["approval_hold_reason"] = None
            policy["last_manual_resume_at"] = now
        elif normalized_status == "paused":
            policy["last_manual_pause_at"] = now
            if not str(policy.get("escalation_state") or "").strip():
                policy["escalation_state"] = "paused"
        elif normalized_status == "completed":
            policy["last_manual_complete_at"] = now
        metadata_payload["policy"] = policy
        updates["metadata_json"] = json.dumps(metadata_payload)

    updates["updated_at"] = now
    if updates.get("status") == "completed":
        updates["completed_at"] = now
    elif status is not None and updates.get("status") != "completed":
        updates["completed_at"] = None
    if updates.get("status") == "active" and next_run_at is None:
        updates["next_run_at"] = now

    set_clause = ", ".join([f"{key}=?" for key in updates.keys()])
    values = list(updates.values()) + [objective_id]
    conn = _connect(db_path)
    try:
        cur = conn.cursor()
        cur.execute(f"UPDATE cognitive_objectives SET {set_clause} WHERE id=?", values)
        if cur.rowcount < 1:
            raise ValueError("objective_not_found")
        conn.commit()
        cur.execute("SELECT * FROM cognitive_objectives WHERE id=?", (objective_id,))
        row = cur.fetchone()
        if not row:
            raise ValueError("objective_not_found")
        return _objective_row_to_dict(row)
    finally:
        conn.close()


def _build_objective_event_payload(
    objective_row: sqlite3.Row,
    policy_eval: Optional[Dict[str, Any]] = None,
    constraints: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    goal_text = str(objective_row["goal_text"] or "").strip()
    text = _normalize_objective_goal_command(goal_text)
    constraints_obj = constraints if isinstance(constraints, dict) else _safe_json_object(objective_row["constraints_json"])
    dispatch = _objective_dispatch_preferences(constraints_obj, goal_text=goal_text)
    objective_metadata = _safe_json_object(objective_row["metadata_json"])
    policy_meta = (
        objective_metadata.get("policy")
        if isinstance(objective_metadata.get("policy"), dict)
        else {}
    )
    now = time.time()
    override_until = _float_or_default(
        policy_meta.get("dispatch_override_until"),
        0.0,
        minimum=0.0,
        maximum=(now + 86400.0 * 365.0),
    )
    override_target = str(policy_meta.get("dispatch_override_target") or "").strip().lower()
    override_trust = str(policy_meta.get("dispatch_override_trust") or "").strip().lower()
    if override_until > now:
        if override_target in {"auto", "cloud", "local_companion"}:
            dispatch["execution_target"] = override_target
        if override_trust in {"auto", "guarded", "strict"}:
            dispatch["trust_mode"] = override_trust
        flags = list(dispatch.get("flags") or [])
        if "auto_remediation_route" not in flags:
            flags.append("auto_remediation_route")
        dispatch["flags"] = flags
        dispatch["reason"] = "auto_remediation"

    metadata: Dict[str, Any] = {
        "objective_id": str(objective_row["id"] or ""),
        "objective_title": str(objective_row["title"] or ""),
        "objective_priority": int(objective_row["priority"] or 70),
        "objective_mode": "continuous" if float(objective_row["cadence_seconds"] or 0.0) > 0 else "one_shot",
    }
    if isinstance(policy_eval, dict):
        metadata["objective_policy"] = {
            "effective_priority": int(policy_eval.get("effective_priority") or int(objective_row["priority"] or 70)),
            "base_priority": int(policy_eval.get("base_priority") or int(objective_row["priority"] or 70)),
            "aging_boost": int(policy_eval.get("aging_boost") or 0),
            "overdue_seconds": float(policy_eval.get("overdue_seconds") or 0.0),
            "deadline_at": policy_eval.get("deadline_at"),
            "flags": list(policy_eval.get("flags") or []),
        }
    objective_dispatch: Dict[str, Any] = {}
    execution_target = str(dispatch.get("execution_target") or "").strip().lower()
    trust_mode = str(dispatch.get("trust_mode") or "").strip().lower()
    operator_approval_levels = _objective_operator_approval_levels(
        constraints=constraints_obj,
        objective_metadata=objective_metadata,
        trust_mode=trust_mode,
    )
    operator_safety_profile = _normalize_operator_safety_profile(
        constraints_obj.get("operator_safety_profile") or objective_metadata.get("operator_safety_profile")
    )
    if not operator_safety_profile:
        operator_safety_profile = "default"
    if execution_target:
        metadata["execution_target"] = execution_target
        objective_dispatch["execution_target"] = execution_target
    if trust_mode:
        metadata["trust_mode"] = trust_mode
        objective_dispatch["trust_mode"] = trust_mode
    metadata["operator_safety_profile"] = operator_safety_profile
    metadata["operator_approval_levels"] = list(operator_approval_levels)
    objective_dispatch["operator_safety_profile"] = operator_safety_profile
    objective_dispatch["operator_approval_levels"] = list(operator_approval_levels)
    if str(dispatch.get("reason") or "").strip():
        objective_dispatch["reason"] = str(dispatch.get("reason") or "").strip()
    if dispatch.get("flags"):
        objective_dispatch["flags"] = list(dispatch.get("flags") or [])
    if objective_dispatch:
        metadata["objective_dispatch"] = objective_dispatch

    if objective_metadata:
        metadata["objective_metadata"] = objective_metadata
    raw_constraints = objective_row["constraints_json"]
    if isinstance(raw_constraints, str) and raw_constraints:
        try:
            parsed = json.loads(raw_constraints)
            if isinstance(parsed, dict):
                metadata["objective_constraints"] = parsed
        except Exception:
            pass
    return {"text": text, "source": "objective", "metadata": metadata}


def _normalize_objective_goal_command(raw_goal: str) -> str:
    text = _normalize_brand_command_alias(str(raw_goal or "").strip())
    if not text:
        return "/orion status"
    lowered = text.lower()
    if lowered.startswith("/orion run "):
        run_goal = text[len("/orion run ") :].strip()
        run_lower = run_goal.lower()
        if run_lower in {
            "",
            "status",
            "/status",
            "runtime status",
            "status check",
            "quick status check",
            "health",
            "health check",
            "system status",
        }:
            return "/orion status"
        if run_lower.startswith("/orion status"):
            return "/orion status"
        if run_lower.startswith("/orion help") or run_lower in {"help", "/help"}:
            return "/orion help"
        return f"/orion run {run_goal}"
    if lowered.startswith("/orion "):
        return text
    if lowered in {
        "status",
        "/status",
        "runtime status",
        "health",
        "health check",
        "system status",
    }:
        return "/orion status"
    if lowered in {"help", "/help"}:
        return "/orion help"
    if lowered.startswith("run "):
        run_goal = text[4:].strip()
        return f"/orion run {run_goal}" if run_goal else "/orion status"
    return f"/orion run {text}"


def dispatch_objective_now(
    *,
    db_path: str,
    niche_id: str,
    objective_id: str,
    resume_if_paused: bool = True,
) -> Dict[str, Any]:
    init_queue_db(db_path)
    target_id = str(objective_id or "").strip()
    if not target_id:
        return {"ok": False, "error": "objective_id_required"}

    if resume_if_paused:
        obj = get_objective(db_path=db_path, objective_id=target_id)
        if not obj:
            return {"ok": False, "error": "objective_not_found", "objective_id": target_id}
        if str(obj.get("status") or "").strip().lower() == "paused":
            update_objective(db_path=db_path, objective_id=target_id, status="active")

    conn = _connect(db_path)
    try:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT *
            FROM cognitive_objectives
            WHERE id=? AND niche_id=?
            LIMIT 1
            """,
            (target_id, niche_id),
        )
        row = cur.fetchone()
        if not row:
            return {"ok": False, "error": "objective_not_found", "objective_id": target_id}
        status = str(row["status"] or "").strip().lower()
        if status == "completed":
            return {"ok": False, "error": "objective_completed", "objective_id": target_id}
        if status != "active":
            return {"ok": False, "error": "objective_not_active", "objective_id": target_id, "status": status}

        now = time.time()
        constraints = _safe_json_object(row["constraints_json"])
        policy_eval = _objective_effective_priority(row, constraints, now)
        payload = _build_objective_event_payload(row, policy_eval=policy_eval, constraints=constraints)
        event_id = enqueue_event(
            db_path=db_path,
            niche_id=niche_id,
            event=payload,
            source="objective",
            parent_event_id=target_id,
            priority=int(policy_eval.get("effective_priority") or int(row["priority"] or 70)),
            max_attempts=3,
        )
        cadence = float(row["cadence_seconds"] or 0.0)
        next_due = now + cadence if cadence > 0 else now

        metadata_obj = _safe_json_object(row["metadata_json"])
        policy_obj = metadata_obj.get("policy") if isinstance(metadata_obj.get("policy"), dict) else {}
        dispatch_flags = []
        dispatch_meta = payload.get("metadata") if isinstance(payload.get("metadata"), dict) else {}
        dispatch_detail = dispatch_meta.get("objective_dispatch") if isinstance(dispatch_meta.get("objective_dispatch"), dict) else {}
        dispatch_operator_safety = str(
            dispatch_detail.get("operator_safety_profile")
            or dispatch_meta.get("operator_safety_profile")
            or ""
        ).strip().lower()
        dispatch_operator_levels_raw: Any = dispatch_detail.get("operator_approval_levels")
        if not isinstance(dispatch_operator_levels_raw, list):
            dispatch_operator_levels_raw = dispatch_meta.get("operator_approval_levels")
        dispatch_operator_levels = _normalize_operator_approval_levels(dispatch_operator_levels_raw)
        raw_flags = dispatch_detail.get("flags")
        if isinstance(raw_flags, list):
            dispatch_flags = [str(x).strip().lower() for x in raw_flags if str(x).strip()]
        policy_obj["last_dispatch_at"] = now
        policy_obj["last_dispatch_event_id"] = event_id
        policy_obj["last_dispatch_priority"] = int(policy_eval.get("effective_priority") or int(row["priority"] or 70))
        policy_obj["last_dispatch_flags"] = dispatch_flags
        policy_obj["last_dispatch_operator_safety_profile"] = dispatch_operator_safety or "default"
        policy_obj["last_dispatch_operator_approval_levels"] = list(dispatch_operator_levels)
        policy_obj["approval_hold_until"] = None
        policy_obj["approval_hold_reason"] = None
        metadata_obj["policy"] = policy_obj

        cur.execute(
            """
            UPDATE cognitive_objectives
            SET last_run_at=?, last_event_id=?, next_run_at=?, metadata_json=?, updated_at=?
            WHERE id=?
            """,
            (now, event_id, next_due, json.dumps(metadata_obj), now, target_id),
        )
        conn.commit()

        return {
            "ok": True,
            "objective_id": target_id,
            "event_id": event_id,
            "status": "dispatched",
            "priority": int(policy_eval.get("effective_priority") or int(row["priority"] or 70)),
            "next_run_at": next_due,
            "event_text": str(payload.get("text") or ""),
        }
    finally:
        conn.close()


def ingest_due_objectives(
    *,
    db_path: str,
    niche_id: str,
    max_dispatch: int = 3,
) -> Dict[str, Any]:
    init_queue_db(db_path)
    now = time.time()
    dispatch_limit = max(1, min(int(max_dispatch), 20))
    dispatched_ids: List[str] = []
    completed_ids: List[str] = []
    skipped_inflight = 0
    skipped_deadline_paused = 0
    skipped_approval_hold = 0
    autotuned_count = 0
    autotune_applied_count = 0
    autotune_changed_total = 0
    autotune_errors: List[str] = []

    conn = _connect(db_path)
    try:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT *
            FROM cognitive_objectives
            WHERE niche_id=? AND status='active' AND next_run_at <= ?
            ORDER BY priority ASC, next_run_at ASC, created_at ASC
            LIMIT 64
            """,
            (niche_id, now),
        )
        due_rows = cur.fetchall()
    finally:
        conn.close()

    ranked_rows: List[Dict[str, Any]] = []
    for row in due_rows:
        constraints = _safe_json_object(row["constraints_json"])
        policy_eval = _objective_effective_priority(row, constraints, now)
        ranked_rows.append({"row": row, "constraints": constraints, "policy_eval": policy_eval})

    ranked_rows.sort(
        key=lambda item: (
            int(item["policy_eval"].get("effective_priority") or 1000),
            float(item["row"]["next_run_at"] or now),
            float(item["row"]["created_at"] or now),
        )
    )

    for item in ranked_rows:
        if len(dispatched_ids) >= dispatch_limit:
            break
        row = item["row"]
        constraints = item["constraints"]
        policy_eval = item["policy_eval"]
        objective_id = str(row["id"] or "")
        cadence = float(row["cadence_seconds"] or 0.0)
        last_event_id = str(row["last_event_id"] or "").strip()
        in_flight = False
        last_event_status = ""
        if last_event_id:
            event = get_event(db_path=db_path, event_id=last_event_id)
            if event:
                last_event_status = str(event.get("status") or "")
                if last_event_status in {"pending", "processing", "waiting_for_input"}:
                    in_flight = True
        if in_flight:
            skipped_inflight += 1
            continue

        autotune_enabled = bool(constraints.get("autotune_enabled", False))
        if autotune_enabled:
            metadata_for_autotune = _safe_json_object(row["metadata_json"])
            autotune_meta = (
                metadata_for_autotune.get("autotune")
                if isinstance(metadata_for_autotune.get("autotune"), dict)
                else {}
            )
            autotune_interval = _float_or_default(
                constraints.get("autotune_interval_seconds"),
                3600.0,
                minimum=0.0,
                maximum=86400.0 * 30.0,
            )
            autotune_last_run = _float_or_default(
                autotune_meta.get("last_run_at"),
                0.0,
                minimum=0.0,
                maximum=(now + 86400.0 * 365.0),
            )
            should_autotune = autotune_interval <= 0 or (now - autotune_last_run) >= autotune_interval
            if should_autotune:
                autotune_min_reflections = _int_or_default(
                    constraints.get("autotune_min_reflections"),
                    6,
                    minimum=1,
                    maximum=200,
                )
                autotune_sample_size = _int_or_default(
                    constraints.get("autotune_sample_size"),
                    20,
                    minimum=1,
                    maximum=200,
                )
                autotune_apply = bool(constraints.get("autotune_apply", False))
                try:
                    autotune_result = autotune_objective(
                        db_path=db_path,
                        niche_id=niche_id,
                        objective_id=objective_id,
                        sample_size=autotune_sample_size,
                        min_samples=autotune_min_reflections,
                        apply=autotune_apply,
                    )
                    autotuned_count += 1
                    changed_count = len(autotune_result.get("changes") or [])
                    autotune_changed_total += changed_count
                    if bool(autotune_result.get("applied")):
                        autotune_applied_count += 1

                    latest_objective = get_objective(db_path=db_path, objective_id=objective_id)
                    latest_metadata = (
                        dict(latest_objective.get("metadata"))
                        if latest_objective and isinstance(latest_objective.get("metadata"), dict)
                        else dict(metadata_for_autotune)
                    )
                    latest_autotune = (
                        latest_metadata.get("autotune")
                        if isinstance(latest_metadata.get("autotune"), dict)
                        else {}
                    )
                    latest_autotune["last_run_at"] = now
                    latest_autotune["last_sample_size"] = int(autotune_result.get("signals", {}).get("sample_size") or 0)
                    latest_autotune["last_change_count"] = changed_count
                    latest_autotune["last_applied"] = bool(autotune_result.get("applied"))
                    latest_autotune["last_apply_requested"] = bool(autotune_result.get("apply_requested"))
                    latest_autotune["last_pass_rate"] = autotune_result.get("signals", {}).get("pass_rate")
                    latest_autotune["last_waiting_rate"] = autotune_result.get("signals", {}).get("waiting_rate")
                    latest_autotune["last_confidence_delta"] = autotune_result.get("signals", {}).get("confidence_delta")
                    advice = autotune_result.get("advice")
                    latest_autotune["last_advice"] = list(advice) if isinstance(advice, list) else []
                    latest_metadata["autotune"] = latest_autotune
                    updated_autotune_obj = update_objective(
                        db_path=db_path,
                        objective_id=objective_id,
                        metadata_json=json.dumps(latest_metadata),
                    )

                    if isinstance(updated_autotune_obj, dict):
                        updated_constraints = (
                            updated_autotune_obj.get("constraints")
                            if isinstance(updated_autotune_obj.get("constraints"), dict)
                            else constraints
                        )
                        updated_metadata = (
                            updated_autotune_obj.get("metadata")
                            if isinstance(updated_autotune_obj.get("metadata"), dict)
                            else latest_metadata
                        )
                        row_dict = dict(row)
                        row_dict["priority"] = int(updated_autotune_obj.get("priority") or row_dict.get("priority") or 70)
                        row_dict["cadence_seconds"] = float(
                            updated_autotune_obj.get("cadence_seconds")
                            if updated_autotune_obj.get("cadence_seconds") is not None
                            else row_dict.get("cadence_seconds")
                            or 0.0
                        )
                        row_dict["next_run_at"] = float(
                            updated_autotune_obj.get("next_run_at")
                            if updated_autotune_obj.get("next_run_at") is not None
                            else row_dict.get("next_run_at")
                            or now
                        )
                        row_dict["constraints_json"] = json.dumps(updated_constraints)
                        row_dict["metadata_json"] = json.dumps(updated_metadata)
                        row = row_dict
                        constraints = dict(updated_constraints)
                        cadence = float(row_dict["cadence_seconds"] or 0.0)
                        policy_eval = _objective_effective_priority(row, constraints, now)
                except Exception as exc:
                    autotune_errors.append(f"{objective_id}:{str(exc)}")
                    if len(autotune_errors) > 20:
                        autotune_errors = autotune_errors[:20]

        metadata_obj = _safe_json_object(row["metadata_json"])
        policy_obj = metadata_obj.get("policy") if isinstance(metadata_obj.get("policy"), dict) else {}
        escalation_state = str(policy_obj.get("escalation_state") or "").strip().lower()
        if escalation_state == "deferred":
            configured_hold_until = _float_or_default(
                policy_obj.get("approval_hold_until"),
                0.0,
                minimum=0.0,
                maximum=(now + 86400.0 * 365.0),
            )
            if configured_hold_until > now:
                current_next_run = _float_or_default(row["next_run_at"], now)
                next_due = max(current_next_run, configured_hold_until)
                policy_obj["approval_hold_until"] = next_due
                policy_obj["approval_hold_reason"] = str(policy_obj.get("approval_hold_reason") or "auto_remediation_window")
                metadata_obj["policy"] = policy_obj
                conn_hold = _connect(db_path)
                try:
                    cur_hold = conn_hold.cursor()
                    cur_hold.execute(
                        """
                        UPDATE cognitive_objectives
                        SET next_run_at=?, metadata_json=?, updated_at=?
                        WHERE id=?
                        """,
                        (next_due, json.dumps(metadata_obj), now, objective_id),
                    )
                    conn_hold.commit()
                finally:
                    conn_hold.close()
                skipped_approval_hold += 1
                continue
            # Deferred hold window elapsed; clear hold/deferred and continue normal dispatch.
            policy_obj["escalation_state"] = "resolved"
            policy_obj["escalation_resolution"] = "remediation_window_elapsed"
            policy_obj["approval_hold_until"] = None
            policy_obj["approval_hold_reason"] = None
            policy_obj["dispatch_override_until"] = now
            metadata_obj["policy"] = policy_obj
            conn_resume = _connect(db_path)
            try:
                cur_resume = conn_resume.cursor()
                cur_resume.execute(
                    """
                    UPDATE cognitive_objectives
                    SET metadata_json=?, updated_at=?
                    WHERE id=?
                    """,
                    (json.dumps(metadata_obj), now, objective_id),
                )
                conn_resume.commit()
            finally:
                conn_resume.close()

        if escalation_state == "open":
            cooldown = _float_or_default(
                constraints.get("approval_retry_cooldown_seconds"),
                180.0,
                minimum=5.0,
                maximum=86400.0,
            )
            hold_until = now + cooldown
            current_next_run = _float_or_default(row["next_run_at"], now)
            next_due = max(current_next_run, hold_until)
            policy_obj["approval_hold_until"] = next_due
            policy_obj["approval_hold_reason"] = "escalation_open"
            metadata_obj["policy"] = policy_obj
            conn_hold = _connect(db_path)
            try:
                cur_hold = conn_hold.cursor()
                cur_hold.execute(
                    """
                    UPDATE cognitive_objectives
                    SET next_run_at=?, metadata_json=?, updated_at=?
                    WHERE id=?
                    """,
                    (next_due, json.dumps(metadata_obj), now, objective_id),
                )
                conn_hold.commit()
            finally:
                conn_hold.close()
            skipped_approval_hold += 1
            continue

        if cadence <= 0 and last_event_status in {"done", "failed"}:
            updated = update_objective(
                db_path=db_path,
                objective_id=objective_id,
                status="completed",
                )
            completed_ids.append(str(updated.get("id") or objective_id))
            continue

        policy_flags = [str(x).strip().lower() for x in (policy_eval.get("flags") or []) if str(x).strip()]
        if "deadline_missed" in policy_flags and bool(constraints.get("pause_on_deadline_miss", False)):
            metadata_obj = _safe_json_object(row["metadata_json"])
            policy_obj = metadata_obj.get("policy") if isinstance(metadata_obj.get("policy"), dict) else {}
            policy_obj["deadline_missed_count"] = _int_or_default(policy_obj.get("deadline_missed_count"), 0, minimum=0) + 1
            policy_obj["deadline_last_missed_at"] = now
            policy_obj["deadline_pause_reason"] = "deadline_missed"
            metadata_obj["policy"] = policy_obj
            conn_deadline = _connect(db_path)
            try:
                cur_deadline = conn_deadline.cursor()
                cur_deadline.execute(
                    """
                    UPDATE cognitive_objectives
                    SET status='paused', metadata_json=?, updated_at=?
                    WHERE id=?
                    """,
                    (json.dumps(metadata_obj), now, objective_id),
                )
                conn_deadline.commit()
            finally:
                conn_deadline.close()
            skipped_deadline_paused += 1
            continue

        payload = _build_objective_event_payload(row, policy_eval=policy_eval, constraints=constraints)
        payload_meta = payload.get("metadata") if isinstance(payload.get("metadata"), dict) else {}
        dispatch_flags = (
            payload_meta.get("objective_dispatch", {}).get("flags")
            if isinstance(payload_meta.get("objective_dispatch"), dict)
            else []
        )
        dispatch_detail = (
            payload_meta.get("objective_dispatch")
            if isinstance(payload_meta.get("objective_dispatch"), dict)
            else {}
        )
        dispatch_operator_safety = str(
            dispatch_detail.get("operator_safety_profile")
            or payload_meta.get("operator_safety_profile")
            or ""
        ).strip().lower()
        dispatch_operator_levels_raw: Any = dispatch_detail.get("operator_approval_levels")
        if not isinstance(dispatch_operator_levels_raw, list):
            dispatch_operator_levels_raw = payload_meta.get("operator_approval_levels")
        dispatch_operator_levels = _normalize_operator_approval_levels(dispatch_operator_levels_raw)
        if isinstance(dispatch_flags, list):
            for flag in dispatch_flags:
                token = str(flag or "").strip().lower()
                if token and token not in policy_flags:
                    policy_flags.append(token)
        event_id = enqueue_event(
            db_path=db_path,
            niche_id=niche_id,
            event=payload,
            source="objective",
            parent_event_id=objective_id,
            priority=int(policy_eval.get("effective_priority") or int(row["priority"] or 70)),
            max_attempts=3,
        )
        next_due = now + cadence if cadence > 0 else now
        metadata_obj = _safe_json_object(row["metadata_json"])
        policy_obj = metadata_obj.get("policy") if isinstance(metadata_obj.get("policy"), dict) else {}
        policy_obj["last_dispatch_at"] = now
        policy_obj["last_dispatch_event_id"] = event_id
        policy_obj["last_dispatch_priority"] = int(policy_eval.get("effective_priority") or int(row["priority"] or 70))
        policy_obj["last_dispatch_flags"] = policy_flags
        policy_obj["last_dispatch_operator_safety_profile"] = dispatch_operator_safety or "default"
        policy_obj["last_dispatch_operator_approval_levels"] = list(dispatch_operator_levels)
        policy_obj["approval_hold_until"] = None
        policy_obj["approval_hold_reason"] = None
        if "deadline_missed" in policy_flags:
            policy_obj["deadline_missed_count"] = _int_or_default(policy_obj.get("deadline_missed_count"), 0, minimum=0) + 1
            policy_obj["deadline_last_missed_at"] = now
        metadata_obj["policy"] = policy_obj
        conn2 = _connect(db_path)
        try:
            cur2 = conn2.cursor()
            cur2.execute(
                """
                UPDATE cognitive_objectives
                SET last_run_at=?, last_event_id=?, next_run_at=?, metadata_json=?, updated_at=?
                WHERE id=?
                """,
                (now, event_id, next_due, json.dumps(metadata_obj), now, objective_id),
            )
            conn2.commit()
        finally:
            conn2.close()
        dispatched_ids.append(event_id)

    return {
        "ok": True,
        "niche_id": niche_id,
        "dispatched_count": len(dispatched_ids),
        "dispatched_event_ids": dispatched_ids,
        "completed_objective_ids": completed_ids,
        "skipped_inflight": skipped_inflight,
        "skipped_deadline_paused": skipped_deadline_paused,
        "skipped_approval_hold": skipped_approval_hold,
        "autotuned_count": autotuned_count,
        "autotune_applied_count": autotune_applied_count,
        "autotune_changed_total": autotune_changed_total,
        "autotune_errors": autotune_errors,
    }


def resolve_event_approval(
    db_path: str,
    event_id: str,
    approved: bool,
    note: str = "",
) -> Dict[str, Any]:
    now = time.time()
    conn = _connect(db_path)
    try:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT id, niche_id, status, event_text, event_json, result_json
            FROM cognitive_event_queue
            WHERE id=?
            """,
            (event_id,),
        )
        row = cur.fetchone()
        if not row:
            return {"ok": False, "error": "event_not_found", "event_id": event_id}
        current_status = str(row["status"] or "")
        if current_status != "waiting_for_input":
            return {
                "ok": False,
                "error": "event_not_waiting_for_input",
                "event_id": event_id,
                "status": current_status,
            }

        niche_id = str(row["niche_id"] or "unknown")
        event_text = str(row["event_text"] or "")
        event_obj: Dict[str, Any]
        try:
            parsed = json.loads(str(row["event_json"] or "{}"))
            event_obj = parsed if isinstance(parsed, dict) else {"text": event_text}
        except Exception:
            event_obj = {"text": event_text}
        metadata = event_obj.get("metadata")
        metadata_dict = dict(metadata) if isinstance(metadata, dict) else {}
        objective_id = str(metadata_dict.get("objective_id") or "").strip()
        metadata_dict["approval_granted"] = bool(approved)
        metadata_dict["approval"] = {
            "approved": bool(approved),
            "note": str(note or "").strip(),
            "resolved_at": now,
            "event_id": event_id,
        }
        event_obj["metadata"] = metadata_dict

        if approved:
            cur.execute(
                """
                UPDATE cognitive_event_queue
                SET status='pending',
                    available_at=?,
                    started_at=NULL,
                    finished_at=NULL,
                    updated_at=?,
                    failure_class=NULL,
                    last_error=NULL,
                    result_json=NULL,
                    event_json=?
                WHERE id=?
                """,
                (now, now, json.dumps(event_obj), event_id),
            )
            if objective_id:
                cur.execute("SELECT metadata_json FROM cognitive_objectives WHERE id=?", (objective_id,))
                objective_row = cur.fetchone()
                if objective_row:
                    objective_meta = _safe_json_object(objective_row["metadata_json"])
                    objective_policy = objective_meta.get("policy") if isinstance(objective_meta.get("policy"), dict) else {}
                    objective_policy["escalation_state"] = "resolved"
                    objective_policy["escalation_resolved_at"] = now
                    objective_policy["escalation_resolution"] = "approved"
                    objective_meta["policy"] = objective_policy
                    cur.execute(
                        """
                        UPDATE cognitive_objectives
                        SET status='active', metadata_json=?, updated_at=?
                        WHERE id=?
                        """,
                        (json.dumps(objective_meta), now, objective_id),
                    )
            conn.commit()
            return {
                "ok": True,
                "event_id": event_id,
                "status": "pending",
                "approved": True,
                "note": str(note or "").strip(),
                "objective_id": objective_id or None,
            }

        rejection_reason = str(note or "").strip() or "Approval rejected by operator."
        action_name = "objective_escalation" if objective_id else "operator_exec"
        risk_flags = ["approval_rejected"]
        if objective_id:
            risk_flags.append("objective_escalated")
        rejected_result = {
            "ok": False,
            "tick": {
                "result": {
                    "status": "failed",
                    "final_status": "failed",
                    "action": action_name,
                    "command": event_text,
                    "objective_id": objective_id or None,
                    "one_line_summary": rejection_reason,
                    "next_action": "revise_command",
                    "risk_flags": risk_flags,
                }
            },
        }
        cur.execute(
            """
            UPDATE cognitive_event_queue
            SET status='failed',
                finished_at=?,
                updated_at=?,
                failure_class='approval',
                last_error=?,
                result_json=?,
                event_json=?
            WHERE id=?
            """,
            (now, now, rejection_reason, json.dumps(rejected_result), json.dumps(event_obj), event_id),
        )
        if objective_id:
            cur.execute("SELECT metadata_json FROM cognitive_objectives WHERE id=?", (objective_id,))
            objective_row = cur.fetchone()
            if objective_row:
                objective_meta = _safe_json_object(objective_row["metadata_json"])
                objective_policy = objective_meta.get("policy") if isinstance(objective_meta.get("policy"), dict) else {}
                objective_policy["escalation_state"] = "open"
                objective_policy["escalation_last_rejected_at"] = now
                objective_policy["escalation_resolution"] = "rejected"
                objective_meta["policy"] = objective_policy
                cur.execute(
                    """
                    UPDATE cognitive_objectives
                    SET status='paused', metadata_json=?, updated_at=?
                    WHERE id=?
                    """,
                    (json.dumps(objective_meta), now, objective_id),
                )
        digest = _extract_digest_from_result(event_id=event_id, niche_id=niche_id, result=rejected_result)
        _upsert_digest_cursor(cur, digest)
        conn.commit()
        return {
            "ok": True,
            "event_id": event_id,
            "status": "failed",
            "approved": False,
            "note": rejection_reason,
            "objective_id": objective_id or None,
        }
    finally:
        conn.close()


def wait_for_event(
    db_path: str,
    event_id: str,
    timeout_seconds: float = 30.0,
    poll_seconds: float = 0.5,
) -> Dict[str, Any]:
    deadline = time.time() + max(0.1, float(timeout_seconds))
    interval = max(0.1, float(poll_seconds))
    last: Optional[Dict[str, Any]] = None
    while time.time() < deadline:
        current = get_event(db_path, event_id)
        if current is None:
            return {"ok": False, "event_id": event_id, "error": "event_not_found"}
        last = current
        status = str(current.get("status") or "")
        if status == "done":
            return {"ok": True, "event_id": event_id, "status": status, "event": current}
        if status == "waiting_for_input":
            return {"ok": True, "event_id": event_id, "status": status, "event": current}
        if status == "failed":
            return {"ok": False, "event_id": event_id, "status": status, "event": current, "error": "failed"}
        time.sleep(interval)
    return {
        "ok": False,
        "event_id": event_id,
        "error": "timeout",
        "status": str((last or {}).get("status") or "unknown"),
    }


def fail_event(db_path: str, event_id: str, error: str, retryable: bool = True) -> Dict[str, Any]:
    now = time.time()
    conn = _connect(db_path)
    try:
        cur = conn.cursor()
        cur.execute(
            "SELECT attempts, max_attempts FROM cognitive_event_queue WHERE id=?",
            (event_id,),
        )
        row = cur.fetchone()
        attempts = int(row["attempts"]) if row else 1
        max_attempts = int(row["max_attempts"]) if row else 1

        err_text = str(error or "")
        lowered = err_text.lower()
        if (
            "invalid_api_key" in lowered
            or "api key" in lowered
            or "authenticationerror" in lowered
            or "unauthorized" in lowered
            or "http 401" in lowered
            or "http 403" in lowered
        ):
            failure_class = "auth"
        elif "rate limit" in lowered or "429" in lowered:
            failure_class = "rate_limit"
        elif (
            "timeout" in lowered
            or "connection" in lowered
            or "temporarily unavailable" in lowered
            or "connection refused" in lowered
            or "http 500" in lowered
            or "http 502" in lowered
            or "http 503" in lowered
            or "http 504" in lowered
        ):
            failure_class = "transient"
        elif "valueerror" in lowered or "required" in lowered or "validation" in lowered:
            failure_class = "validation"
        else:
            failure_class = "unknown"

        if not retryable:
            should_retry = False
            delay = None
        elif failure_class in {"auth", "validation"}:
            should_retry = False
            delay = None
        elif failure_class == "rate_limit":
            should_retry = attempts < max_attempts
            delay = min(300.0, float(10 * (2 ** max(0, attempts - 1))))
        elif failure_class == "transient":
            should_retry = attempts < max_attempts
            delay = min(120.0, float(2 ** max(0, attempts)))
        else:
            allowed = min(max_attempts, 2)
            should_retry = attempts < allowed
            delay = float(3 * max(1, attempts))

        if should_retry:
            next_time = now + delay
            cur.execute(
                """
                UPDATE cognitive_event_queue
                SET status='pending',
                    available_at=?,
                    updated_at=?,
                    failure_class=?,
                    last_error=?
                WHERE id=?
                """,
                (next_time, now, failure_class, err_text, event_id),
            )
            conn.commit()
            return {"status": "pending", "retry_in_seconds": delay, "failure_class": failure_class}

        cur.execute(
            """
            UPDATE cognitive_event_queue
            SET status='failed',
                finished_at=?,
                updated_at=?,
                failure_class=?,
                last_error=?
            WHERE id=?
            """,
            (now, now, failure_class, err_text, event_id),
        )
        cur.execute("SELECT niche_id, event_text FROM cognitive_event_queue WHERE id=?", (event_id,))
        row2 = cur.fetchone()
        niche_id = str(row2["niche_id"]) if row2 and row2["niche_id"] else "unknown"
        event_text = str(row2["event_text"]) if row2 and row2["event_text"] else ""
        digest = {
            "event_id": event_id,
            "niche_id": niche_id,
            "run_id": None,
            "action": "run_goal" if "/orion run" in event_text.lower() else None,
            "final_status": "failed",
            "one_line_summary": _first_line(err_text, fallback="Event failed."),
            "next_action": {
                "auth": "fix_auth",
                "validation": "fix_input",
                "rate_limit": "retry_later",
                "transient": "retry",
            }.get(failure_class, "inspect_error"),
            "risk_flags_json": json.dumps([failure_class] if failure_class else []),
            "execution_id": None,
            "created_at": now,
            "updated_at": now,
        }
        _upsert_digest_cursor(cur, digest)
        conn.commit()
        return {"status": "failed", "retry_in_seconds": None, "failure_class": failure_class}
    finally:
        conn.close()


def queue_counts(db_path: str, niche_id: str) -> Dict[str, int]:
    init_queue_db(db_path)
    conn = _connect(db_path)
    try:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT status, COUNT(*) as c
            FROM cognitive_event_queue
            WHERE niche_id=?
            GROUP BY status
            """,
            (niche_id,),
        )
        counts = {"pending": 0, "processing": 0, "waiting_for_input": 0, "done": 0, "failed": 0}
        for row in cur.fetchall():
            counts[str(row["status"])] = int(row["c"])
        return counts
    finally:
        conn.close()


def should_stop(db_path: str, niche_id: str) -> bool:
    state = read_daemon_state(db_path, niche_id)
    return str(state.get("status")) in {"stopping", "failed"}


def run_daemon_loop(
    niche_id: str,
    db_path: str,
    poll_seconds: float = 2.0,
    stale_after_seconds: float = 0.0,
) -> int:
    init_queue_db(db_path)

    # lazy import avoids hard dependency during queue-only tests
    from agency_logic import AgencyLogic, load_niche_config

    config = load_niche_config(niche_id)
    if not config:
        log(f"niche config not found: {niche_id}")
        write_daemon_state(db_path, niche_id, status="failed", last_error="NICHE_NOT_FOUND")
        return 2

    process_id = os.getpid()
    write_daemon_state(
        db_path,
        niche_id,
        status="running",
        pid=process_id,
        poll_seconds=poll_seconds,
    )
    recovered = requeue_stale_processing(db_path, niche_id, stale_after_seconds=stale_after_seconds)
    if recovered:
        log(f"requeued stale processing events: {recovered}")

    agent = AgencyLogic(config, db_path=db_path)
    log(f"daemon running niche={niche_id} pid={process_id}")
    skill_decay_interval = _float_or_default(
        os.getenv("ORION_COGNITIVE_SKILL_DECAY_INTERVAL_SECONDS"),
        300.0,
        minimum=30.0,
        maximum=86400.0,
    )
    skill_decay_max_age = _float_or_default(
        os.getenv("ORION_COGNITIVE_SKILL_DECAY_MAX_AGE_SECONDS"),
        86400.0 * 7.0,
        minimum=60.0,
        maximum=86400.0 * 365.0,
    )
    skill_decay_min_samples = _int_or_default(
        os.getenv("ORION_COGNITIVE_SKILL_DECAY_MIN_SAMPLES"),
        5,
        minimum=1,
        maximum=10000,
    )
    skill_decay_min_success = _float_or_default(
        os.getenv("ORION_COGNITIVE_SKILL_DECAY_MIN_SUCCESS_RATE"),
        0.55,
        minimum=0.0,
        maximum=1.0,
    )
    last_skill_decay_at = 0.0

    while True:
        if should_stop(db_path, niche_id):
            break

        write_daemon_state(
            db_path,
            niche_id,
            status="running",
            pid=process_id,
            poll_seconds=poll_seconds,
        )

        try:
            objective_tick = ingest_due_objectives(db_path=db_path, niche_id=niche_id, max_dispatch=3)
            dispatched_count = int(objective_tick.get("dispatched_count") or 0)
            if dispatched_count > 0:
                log(f"objective intake dispatched events: {dispatched_count}")
        except Exception as exc:
            log(f"objective intake failed: {exc}")

        now = time.time()
        if (now - last_skill_decay_at) >= skill_decay_interval:
            try:
                decay = decay_skill_candidates(
                    db_path=db_path,
                    niche_id=niche_id,
                    max_age_seconds=skill_decay_max_age,
                    min_samples=skill_decay_min_samples,
                    min_success_rate=skill_decay_min_success,
                    promoted_only=True,
                )
                demoted_count = int(decay.get("demoted_count") or 0)
                if demoted_count > 0:
                    log(f"skill decay demoted candidates: {demoted_count}")
            except Exception as exc:
                log(f"skill decay failed: {exc}")
            last_skill_decay_at = now

        event = claim_next_event(db_path, niche_id)
        if not event:
            time.sleep(max(0.2, float(poll_seconds)))
            continue

        event_id = str(event["id"])
        try:
            payload = json.loads(str(event.get("event_json") or "{}"))
            if isinstance(payload, dict):
                try:
                    replay = maybe_apply_skill_replay(
                        db_path=db_path,
                        niche_id=niche_id,
                        payload=payload,
                        limit=40,
                    )
                    objective_id_for_replay = str(event.get("parent_event_id") or "").strip()
                    if not objective_id_for_replay:
                        replay_meta = payload.get("metadata") if isinstance(payload.get("metadata"), dict) else {}
                        objective_id_for_replay = str(replay_meta.get("objective_id") or "").strip()
                    if objective_id_for_replay:
                        _record_objective_skill_replay_policy(
                            db_path=db_path,
                            objective_id=objective_id_for_replay,
                            replay=replay,
                        )
                    if bool(replay.get("applied")):
                        sig = str(replay.get("candidate_signature") or "")
                        conf = float(replay.get("confidence") or 0.0)
                        log(f"skill replay applied event={event_id} signature={sig} confidence={round(conf, 4)}")
                except Exception as replay_exc:
                    log(f"skill replay failed event={event_id}: {replay_exc}")
            result = agent.cognitive_tick(payload, k=5)
            complete_event(db_path, event_id, result)
            stopping_now = should_stop(db_path, niche_id)
            next_status = "stopping" if stopping_now else "running"
            write_daemon_state(
                db_path,
                niche_id,
                status=next_status,
                pid=process_id,
                poll_seconds=poll_seconds,
                last_event_id=event_id,
                increment_processed=1,
            )
            if stopping_now:
                break
        except Exception as exc:
            failure = fail_event(db_path, event_id, str(exc), retryable=True)
            stopping_now = should_stop(db_path, niche_id)
            next_status = "stopping" if stopping_now else "running"
            write_daemon_state(
                db_path,
                niche_id,
                status=next_status,
                pid=process_id,
                poll_seconds=poll_seconds,
                last_event_id=event_id,
                last_error=str(exc),
                increment_failed=1 if failure["status"] == "failed" else 0,
            )
            log(f"event failed id={event_id} status={failure['status']} error={exc}")
            if stopping_now:
                break

    write_daemon_state(db_path, niche_id, status="stopped", pid=process_id, poll_seconds=poll_seconds)
    log(f"daemon stopped niche={niche_id}")
    return 0


def start_daemon(
    niche_id: str,
    db_path: str,
    poll_seconds: float = 2.0,
    stale_after_seconds: float = 0.0,
    foreground: bool = False,
) -> Dict[str, Any]:
    init_queue_db(db_path)
    pid_file = _pid_file(niche_id)
    current_state = read_daemon_state(db_path, niche_id)
    existing_pid = current_state.get("pid")
    if existing_pid and _is_pid_alive(int(existing_pid)):
        return {"ok": True, "already_running": True, "pid": int(existing_pid), "pid_file": pid_file}

    if foreground:
        code = run_daemon_loop(
            niche_id=niche_id,
            db_path=db_path,
            poll_seconds=poll_seconds,
            stale_after_seconds=stale_after_seconds,
        )
        return {"ok": code == 0, "foreground": True, "exit_code": code}

    log_dir = os.path.join(os.path.dirname(__file__), "logs")
    os.makedirs(log_dir, exist_ok=True)
    log_path = os.path.join(log_dir, f"cognitive_daemon_{niche_id}.log")
    log_stream = open(log_path, "a", encoding="utf-8")
    cmd = [
        sys.executable,
        os.path.abspath(__file__),
        "run",
        "--niche-id",
        niche_id,
        "--db-path",
        db_path,
        "--poll-seconds",
        str(poll_seconds),
        "--stale-after-seconds",
        str(stale_after_seconds),
    ]
    proc = subprocess.Popen(
        cmd,
        stdin=subprocess.DEVNULL,
        stdout=log_stream,
        stderr=log_stream,
        start_new_session=True,
        close_fds=True,
    )
    with open(pid_file, "w", encoding="utf-8") as f:
        f.write(str(proc.pid))

    write_daemon_state(
        db_path,
        niche_id,
        status="starting",
        pid=proc.pid,
        poll_seconds=poll_seconds,
    )
    return {
        "ok": True,
        "started": True,
        "pid": proc.pid,
        "pid_file": pid_file,
        "log_path": log_path,
    }


def stop_daemon(niche_id: str, db_path: str, timeout_seconds: float = 5.0) -> Dict[str, Any]:
    init_queue_db(db_path)
    pid_file = _pid_file(niche_id)
    state = read_daemon_state(db_path, niche_id)
    pid = state.get("pid")
    if not pid and os.path.exists(pid_file):
        try:
            with open(pid_file, "r", encoding="utf-8") as f:
                pid = int((f.read() or "0").strip() or "0")
        except Exception:
            pid = None

    write_daemon_state(db_path, niche_id, status="stopping")

    forced = False
    if pid and _is_pid_alive(int(pid)):
        # Graceful-first: set "stopping" and let the loop finish any in-flight event.
        deadline = time.time() + max(1.0, float(timeout_seconds))
        while time.time() < deadline and _is_pid_alive(int(pid)):
            time.sleep(0.1)

        # If still alive past deadline, terminate explicitly.
        if _is_pid_alive(int(pid)):
            os.kill(int(pid), signal.SIGTERM)
            term_deadline = time.time() + 1.5
            while time.time() < term_deadline and _is_pid_alive(int(pid)):
                time.sleep(0.1)

        # Last resort force kill.
        if _is_pid_alive(int(pid)):
            forced = True
            os.kill(int(pid), signal.SIGKILL)

    if os.path.exists(pid_file):
        try:
            os.remove(pid_file)
        except Exception:
            pass

    # Recover any in-flight rows left behind by forced or abrupt stop.
    requeue_stale_processing(db_path, niche_id, stale_after_seconds=0.0)

    write_daemon_state(db_path, niche_id, status="stopped", pid=int(pid) if pid else None)
    return {"ok": True, "stopped": True, "pid": pid, "pid_file": pid_file, "forced": forced}


def daemon_status(niche_id: str, db_path: str) -> Dict[str, Any]:
    state = read_daemon_state(db_path, niche_id)
    counts = queue_counts(db_path, niche_id)
    last_digest = None
    last_event_id = str(state.get("last_event_id") or "").strip()
    if last_event_id:
        last_digest = get_event_digest(db_path, last_event_id)
    return {"ok": True, "state": state, "queue": counts, "last_digest": last_digest}


def _load_event_arg(text: Optional[str], event_json: Optional[str], event_file: Optional[str]) -> Any:
    if event_file:
        with open(event_file, "r", encoding="utf-8") as f:
            return json.load(f)
    if event_json:
        return json.loads(event_json)
    if text is not None:
        return {"text": text}
    raise ValueError("Provide one of --text, --event-json, or --event-file")


def build_dependency_plan(event: Any) -> List[Dict[str, Any]]:
    if isinstance(event, str):
        event_obj = {"text": event}
    elif isinstance(event, dict):
        event_obj = dict(event)
    else:
        raise ValueError("event must be a string or object")

    text = str(event_obj.get("text") or "").strip()
    source = str(event_obj.get("source") or "api")
    if not text.lower().startswith("/orion run "):
        return [event_obj]

    goal = text[len("/orion run ") :].strip()
    parts = [p.strip() for p in re.split(r"\s+(?:and|then)\s+|;\s*", goal) if p.strip()]
    if len(parts) <= 1:
        return [event_obj]

    tasks: List[Dict[str, Any]] = []
    for idx, part in enumerate(parts, start=1):
        tasks.append(
            {
                "text": f"/orion run {part}",
                "source": source,
                "metadata": {
                    "plan_step": idx,
                    "plan_total": len(parts),
                },
            }
        )
    return tasks


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Empyralis cognitive daemon")
    sub = parser.add_subparsers(dest="command", required=True)

    common = argparse.ArgumentParser(add_help=False)
    common.add_argument("--niche-id", required=True)
    common.add_argument("--db-path", default=default_cognitive_db_path())

    p_start = sub.add_parser("start", parents=[common])
    p_start.add_argument("--poll-seconds", type=float, default=2.0)
    p_start.add_argument("--stale-after-seconds", type=float, default=0.0)
    p_start.add_argument("--foreground", action="store_true")

    p_run = sub.add_parser("run", parents=[common])
    p_run.add_argument("--poll-seconds", type=float, default=2.0)
    p_run.add_argument("--stale-after-seconds", type=float, default=0.0)

    p_stop = sub.add_parser("stop", parents=[common])
    p_stop.add_argument("--timeout-seconds", type=float, default=5.0)

    sub.add_parser("status", parents=[common])

    p_enqueue = sub.add_parser("enqueue", parents=[common])
    p_enqueue.add_argument("--source", default="api")
    p_enqueue.add_argument("--execution-id", default=None)
    p_enqueue.add_argument("--priority", type=int, default=-1)
    p_enqueue.add_argument("--max-attempts", type=int, default=3)
    p_enqueue.add_argument("--text", default=None)
    p_enqueue.add_argument("--event-json", default=None)
    p_enqueue.add_argument("--event-file", default=None)
    p_enqueue.add_argument("--wait", action="store_true")
    p_enqueue.add_argument("--timeout-seconds", type=float, default=30.0)
    p_enqueue.add_argument("--poll-seconds", type=float, default=0.5)
    p_enqueue.add_argument("--plan", action="store_true")

    p_event = sub.add_parser("event", parents=[common])
    p_event.add_argument("--event-id", required=True)
    p_digest = sub.add_parser("digest", parents=[common])
    p_digest.add_argument("--event-id", required=True)
    p_digests = sub.add_parser("digests", parents=[common])
    p_digests.add_argument("--limit", type=int, default=20)
    p_approvals = sub.add_parser("approvals", parents=[common])
    p_approvals.add_argument("--limit", type=int, default=20)
    p_approvals.add_argument("--objective-id", default="")
    p_approve = sub.add_parser("approve", parents=[common])
    p_approve.add_argument("--event-id", required=True)
    p_approve.add_argument("--note", default="")
    p_reject = sub.add_parser("reject", parents=[common])
    p_reject.add_argument("--event-id", required=True)
    p_reject.add_argument("--note", default="")
    p_skills = sub.add_parser("skills", parents=[common])
    p_skills.add_argument("--limit", type=int, default=20)
    p_skills.add_argument("--action", default="")
    p_skills.add_argument("--objective-id", default="")
    p_skills.add_argument("--promoted-only", action="store_true")
    p_skill_decay = sub.add_parser("skill-decay", parents=[common])
    p_skill_decay.add_argument("--max-age-seconds", type=float, default=86400.0 * 7.0)
    p_skill_decay.add_argument("--min-samples", type=int, default=5)
    p_skill_decay.add_argument("--min-success-rate", type=float, default=0.55)
    p_skill_decay.add_argument("--all", action="store_true")

    p_objective_add = sub.add_parser("objective-add", parents=[common])
    p_objective_add.add_argument("--title", required=True)
    p_objective_add.add_argument("--goal", required=True)
    p_objective_add.add_argument("--priority", type=int, default=70)
    p_objective_add.add_argument("--cadence-seconds", type=float, default=0.0)
    p_objective_add.add_argument("--next-run-seconds", type=float, default=0.0)
    p_objective_add.add_argument("--constraints-json", default=None)
    p_objective_add.add_argument("--metadata-json", default=None)
    p_objective_add.add_argument("--sla-seconds", type=float, default=None)
    p_objective_add.add_argument("--deadline-seconds", type=float, default=None)
    p_objective_add.add_argument("--aging-window-seconds", type=float, default=None)
    p_objective_add.add_argument("--aging-max-boost", type=int, default=None)
    p_objective_add.add_argument("--max-fail-streak", type=int, default=None)
    p_objective_add.add_argument("--execution-target", default=None)
    p_objective_add.add_argument("--trust-mode", default=None)
    p_objective_add.add_argument("--operator-safety-profile", default=None)
    p_objective_add.add_argument(
        "--operator-approval-levels",
        default=None,
        help="Comma-separated risk levels requiring approval: low,medium,high",
    )
    p_objective_add.add_argument("--approval-retry-cooldown-seconds", type=float, default=None)
    p_objective_add.add_argument("--pause-on-deadline-miss", action="store_true")
    p_objective_add.add_argument("--pause-on-escalation", action="store_true")
    p_objective_add.add_argument("--disable-escalation", action="store_true")
    p_objective_add.add_argument("--autotune-enabled", action="store_true")
    p_objective_add.add_argument("--autotune-interval-seconds", type=float, default=None)
    p_objective_add.add_argument("--autotune-min-reflections", type=int, default=None)
    p_objective_add.add_argument("--autotune-sample-size", type=int, default=None)
    p_objective_add.add_argument("--autotune-apply", action="store_true")

    p_objective_list = sub.add_parser("objective-list", parents=[common])
    p_objective_list.add_argument("--status", default=None)
    p_objective_list.add_argument("--limit", type=int, default=50)

    p_objective_get = sub.add_parser("objective-get", parents=[common])
    p_objective_get.add_argument("--objective-id", required=True)

    p_objective_pause = sub.add_parser("objective-pause", parents=[common])
    p_objective_pause.add_argument("--objective-id", required=True)

    p_objective_resume = sub.add_parser("objective-resume", parents=[common])
    p_objective_resume.add_argument("--objective-id", required=True)

    p_objective_complete = sub.add_parser("objective-complete", parents=[common])
    p_objective_complete.add_argument("--objective-id", required=True)

    p_objective_tick = sub.add_parser("objective-tick", parents=[common])
    p_objective_tick.add_argument("--max-dispatch", type=int, default=3)

    p_objective_tail = sub.add_parser("objective-tail", parents=[common])
    p_objective_tail.add_argument("--objective-id", required=True)
    p_objective_tail.add_argument("--limit", type=int, default=20)

    p_objective_lessons = sub.add_parser("objective-lessons", parents=[common])
    p_objective_lessons.add_argument("--objective-id", default="")
    p_objective_lessons.add_argument("--limit", type=int, default=20)

    p_objective_dispatch = sub.add_parser("objective-dispatch", parents=[common])
    p_objective_dispatch.add_argument("--objective-id", required=True)
    p_objective_dispatch.add_argument("--no-resume", action="store_true")

    p_objective_simulate = sub.add_parser("objective-simulate", parents=[common])
    p_objective_simulate.add_argument("--objective-id", required=True)
    p_objective_simulate.add_argument("--action", default="run_goal")
    p_objective_simulate.add_argument("--final-status", default="done")
    p_objective_simulate.add_argument("--status", default="")
    p_objective_simulate.add_argument("--run-id", default="")
    p_objective_simulate.add_argument("--risk-flags", default="")
    p_objective_simulate.add_argument("--summary", default="")
    p_objective_simulate.add_argument("--duration-ms", type=int, default=0)
    p_objective_simulate.add_argument("--confidence", type=float, default=0.8)
    p_objective_simulate.add_argument("--now", type=float, default=None)

    p_objective_autotune = sub.add_parser("objective-autotune", parents=[common])
    p_objective_autotune.add_argument("--objective-id", required=True)
    p_objective_autotune.add_argument("--sample-size", type=int, default=20)
    p_objective_autotune.add_argument("--min-samples", type=int, default=4)
    p_objective_autotune.add_argument("--apply", action="store_true")

    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    try:
        if args.command == "start":
            data = start_daemon(
                niche_id=args.niche_id,
                db_path=args.db_path,
                poll_seconds=args.poll_seconds,
                stale_after_seconds=args.stale_after_seconds,
                foreground=bool(args.foreground),
            )
            print(json.dumps(data))
            return 0 if data.get("ok") else 1

        if args.command == "run":
            return run_daemon_loop(
                niche_id=args.niche_id,
                db_path=args.db_path,
                poll_seconds=args.poll_seconds,
                stale_after_seconds=args.stale_after_seconds,
            )

        if args.command == "stop":
            data = stop_daemon(
                niche_id=args.niche_id,
                db_path=args.db_path,
                timeout_seconds=args.timeout_seconds,
            )
            print(json.dumps(data))
            return 0 if data.get("ok") else 1

        if args.command == "status":
            data = daemon_status(niche_id=args.niche_id, db_path=args.db_path)
            print(json.dumps(data))
            return 0

        if args.command == "enqueue":
            event = _load_event_arg(args.text, args.event_json, args.event_file)
            planned_events = build_dependency_plan(event) if bool(args.plan) else [event]
            event_ids: List[str] = []
            last_id: Optional[str] = None
            for idx, planned_event in enumerate(planned_events):
                deps = [last_id] if last_id else []
                event_id = enqueue_event(
                    db_path=args.db_path,
                    niche_id=args.niche_id,
                    event=planned_event,
                    source=args.source,
                    execution_id=args.execution_id,
                    parent_event_id=event_ids[0] if event_ids else None,
                    dependency_ids=deps,
                    priority=(None if args.priority <= 0 else args.priority),
                    max_attempts=args.max_attempts,
                )
                event_ids.append(event_id)
                last_id = event_id
            if bool(args.wait):
                waited = wait_for_event(
                    db_path=args.db_path,
                    event_id=event_ids[-1],
                    timeout_seconds=args.timeout_seconds,
                    poll_seconds=args.poll_seconds,
                )
                waited["enqueued"] = True
                waited["event_ids"] = event_ids
                print(json.dumps(waited))
                return 0 if waited.get("ok") else 1
            if len(event_ids) == 1:
                print(json.dumps({"ok": True, "event_id": event_ids[0]}))
            else:
                print(json.dumps({"ok": True, "planned": True, "event_ids": event_ids, "root_event_id": event_ids[0]}))
            return 0

        if args.command == "event":
            event_id = str(args.event_id or "").strip()
            if not event_id:
                print(json.dumps({"ok": False, "error": "event_id_required"}))
                return 1
            row = get_event(db_path=args.db_path, event_id=event_id)
            if row is None:
                print(json.dumps({"ok": False, "error": "event_not_found", "event_id": event_id}))
                return 1
            print(json.dumps({"ok": True, "event": row}))
            return 0

        if args.command == "digest":
            event_id = str(args.event_id or "").strip()
            if not event_id:
                print(json.dumps({"ok": False, "error": "event_id_required"}))
                return 1
            digest = get_event_digest(db_path=args.db_path, event_id=event_id)
            if digest is None:
                print(json.dumps({"ok": False, "error": "digest_not_found", "event_id": event_id}))
                return 1
            print(json.dumps({"ok": True, "digest": digest}))
            return 0

        if args.command == "digests":
            items = list_event_digests(
                db_path=args.db_path,
                niche_id=args.niche_id,
                limit=args.limit,
            )
            print(json.dumps({"ok": True, "items": items, "count": len(items)}))
            return 0

        if args.command == "approvals":
            items = list_pending_approvals(
                db_path=args.db_path,
                niche_id=args.niche_id,
                limit=args.limit,
                objective_id=getattr(args, "objective_id", ""),
            )
            print(json.dumps({"ok": True, "items": items, "count": len(items)}))
            return 0

        if args.command == "approve":
            event_id = str(args.event_id or "").strip()
            if not event_id:
                print(json.dumps({"ok": False, "error": "event_id_required"}))
                return 1
            out = resolve_event_approval(
                db_path=args.db_path,
                event_id=event_id,
                approved=True,
                note=str(args.note or ""),
            )
            print(json.dumps(out))
            return 0 if out.get("ok") else 1

        if args.command == "reject":
            event_id = str(args.event_id or "").strip()
            if not event_id:
                print(json.dumps({"ok": False, "error": "event_id_required"}))
                return 1
            out = resolve_event_approval(
                db_path=args.db_path,
                event_id=event_id,
                approved=False,
                note=str(args.note or ""),
            )
            print(json.dumps(out))
            return 0 if out.get("ok") else 1

        if args.command == "skills":
            items = list_skill_candidates(
                db_path=args.db_path,
                niche_id=args.niche_id,
                limit=args.limit,
                action=str(args.action or ""),
                objective_id=str(args.objective_id or ""),
                promoted_only=bool(args.promoted_only),
            )
            print(json.dumps({"ok": True, "items": items, "count": len(items)}))
            return 0

        if args.command == "skill-decay":
            out = decay_skill_candidates(
                db_path=args.db_path,
                niche_id=args.niche_id,
                max_age_seconds=float(args.max_age_seconds),
                min_samples=int(args.min_samples),
                min_success_rate=float(args.min_success_rate),
                promoted_only=(not bool(args.all)),
            )
            print(json.dumps(out))
            return 0 if out.get("ok") else 1

        if args.command == "objective-add":
            now = time.time()
            deadline_at = None
            if args.deadline_seconds is not None:
                deadline_at = now + max(0.0, float(args.deadline_seconds))
            execution_target = _normalize_execution_target(args.execution_target)
            trust_mode = _normalize_trust_mode(args.trust_mode)
            operator_safety_profile = _normalize_operator_safety_profile(args.operator_safety_profile)
            operator_approval_levels = (
                _normalize_operator_approval_levels(args.operator_approval_levels)
                if args.operator_approval_levels is not None
                else None
            )
            overrides: Dict[str, Any] = {
                "sla_seconds": (float(args.sla_seconds) if args.sla_seconds is not None else None),
                "deadline_at": deadline_at,
                "aging_window_seconds": (float(args.aging_window_seconds) if args.aging_window_seconds is not None else None),
                "aging_max_boost": (int(args.aging_max_boost) if args.aging_max_boost is not None else None),
                "max_fail_streak": (int(args.max_fail_streak) if args.max_fail_streak is not None else None),
                "execution_target": (execution_target or None),
                "trust_mode": (trust_mode or None),
                "operator_safety_profile": (operator_safety_profile or None),
                "operator_approval_levels": operator_approval_levels,
                "approval_retry_cooldown_seconds": (
                    float(args.approval_retry_cooldown_seconds)
                    if args.approval_retry_cooldown_seconds is not None
                    else None
                ),
                "pause_on_deadline_miss": (True if bool(args.pause_on_deadline_miss) else None),
                "pause_on_escalation": (True if bool(args.pause_on_escalation) else None),
                "escalate_on_fail_streak": (False if bool(args.disable_escalation) else None),
                "autotune_enabled": (True if bool(args.autotune_enabled) else None),
                "autotune_interval_seconds": (
                    float(args.autotune_interval_seconds)
                    if args.autotune_interval_seconds is not None
                    else None
                ),
                "autotune_min_reflections": (
                    int(args.autotune_min_reflections)
                    if args.autotune_min_reflections is not None
                    else None
                ),
                "autotune_sample_size": (
                    int(args.autotune_sample_size)
                    if args.autotune_sample_size is not None
                    else None
                ),
                "autotune_apply": (True if bool(args.autotune_apply) else None),
            }
            merged_constraints = _merge_constraints_json(args.constraints_json, overrides)
            out = create_objective(
                db_path=args.db_path,
                niche_id=args.niche_id,
                title=str(args.title or "").strip(),
                goal_text=str(args.goal or "").strip(),
                priority=args.priority,
                cadence_seconds=args.cadence_seconds,
                next_run_at=now + max(0.0, float(args.next_run_seconds or 0.0)),
                constraints_json=merged_constraints,
                metadata_json=args.metadata_json,
            )
            print(json.dumps({"ok": True, "objective": out}))
            return 0

        if args.command == "objective-list":
            status_filter = str(args.status or "").strip() or None
            out = list_objectives(
                db_path=args.db_path,
                niche_id=args.niche_id,
                status=status_filter,
                limit=args.limit,
            )
            print(json.dumps({"ok": True, "items": out, "count": len(out)}))
            return 0

        if args.command == "objective-get":
            objective_id = str(args.objective_id or "").strip()
            item = get_objective(
                db_path=args.db_path,
                objective_id=objective_id,
            )
            if item is None:
                print(json.dumps({"ok": False, "error": "objective_not_found", "objective_id": objective_id}))
                return 1
            print(json.dumps({"ok": True, "objective": item}))
            return 0

        if args.command == "objective-pause":
            objective_id = str(args.objective_id or "").strip()
            item = update_objective(
                db_path=args.db_path,
                objective_id=objective_id,
                status="paused",
            )
            print(json.dumps({"ok": True, "objective": item}))
            return 0

        if args.command == "objective-resume":
            objective_id = str(args.objective_id or "").strip()
            item = update_objective(
                db_path=args.db_path,
                objective_id=objective_id,
                status="active",
            )
            print(json.dumps({"ok": True, "objective": item}))
            return 0

        if args.command == "objective-complete":
            objective_id = str(args.objective_id or "").strip()
            item = update_objective(
                db_path=args.db_path,
                objective_id=objective_id,
                status="completed",
            )
            print(json.dumps({"ok": True, "objective": item}))
            return 0

        if args.command == "objective-tick":
            out = ingest_due_objectives(
                db_path=args.db_path,
                niche_id=args.niche_id,
                max_dispatch=args.max_dispatch,
            )
            print(json.dumps(out))
            return 0 if out.get("ok") else 1

        if args.command == "objective-tail":
            objective_id = str(args.objective_id or "").strip()
            out = tail_objective(
                db_path=args.db_path,
                objective_id=objective_id,
                limit=args.limit,
            )
            print(json.dumps(out))
            return 0 if out.get("ok") else 1

        if args.command == "objective-lessons":
            objective_id = str(args.objective_id or "").strip()
            items = list_recent_objective_reflections(
                db_path=args.db_path,
                niche_id=args.niche_id,
                objective_id=objective_id,
                limit=args.limit,
            )
            print(json.dumps({"ok": True, "items": items, "count": len(items)}))
            return 0

        if args.command == "objective-dispatch":
            objective_id = str(args.objective_id or "").strip()
            out = dispatch_objective_now(
                db_path=args.db_path,
                niche_id=args.niche_id,
                objective_id=objective_id,
                resume_if_paused=(not bool(args.no_resume)),
            )
            print(json.dumps(out))
            return 0 if out.get("ok") else 1

        if args.command == "objective-simulate":
            objective_id = str(args.objective_id or "").strip()
            out = simulate_objective_policy(
                db_path=args.db_path,
                niche_id=args.niche_id,
                objective_id=objective_id,
                action=str(args.action or "run_goal"),
                final_status=str(args.final_status or "done"),
                status=str(args.status or ""),
                run_id=str(args.run_id or ""),
                risk_flags=_token_list(args.risk_flags),
                summary=str(args.summary or ""),
                duration_ms=int(args.duration_ms or 0),
                confidence=float(args.confidence),
                now=args.now,
            )
            print(json.dumps(out))
            return 0 if out.get("ok") else 1

        if args.command == "objective-autotune":
            objective_id = str(args.objective_id or "").strip()
            out = autotune_objective(
                db_path=args.db_path,
                niche_id=args.niche_id,
                objective_id=objective_id,
                sample_size=int(args.sample_size),
                min_samples=int(args.min_samples),
                apply=bool(args.apply),
            )
            print(json.dumps(out))
            return 0 if out.get("ok") else 1

        parser.print_help()
        return 1
    except Exception as exc:
        print(json.dumps({"ok": False, "error": str(exc)}))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
