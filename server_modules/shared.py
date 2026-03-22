import queue
import threading
from contextlib import AsyncExitStack, asynccontextmanager
from typing import Any, Dict, List, Optional, Set

from fastapi import FastAPI

from server_modules.runtime_config import *


@asynccontextmanager
async def app_lifespan(_: FastAPI):
    async with AsyncExitStack() as stack:
        await stack.enter_async_context(empyralist_mcp_lifespan())
        yield


app = FastAPI(title="Empyralis Runtime API", lifespan=app_lifespan)

# Global state
runs: Dict[str, Dict[str, Any]] = {}
RUN_QUEUE_INDEX: Dict[int, str] = {}
RUN_HISTORY_LOCK = threading.Lock()
RUN_HISTORY: List[Dict[str, Any]] = []
APPROVAL_AUDIT_LOCK = threading.Lock()
APPROVAL_AUDIT: List[Dict[str, Any]] = []
CHANNEL_EVENTS_LOCK = threading.Lock()
CHANNEL_EVENTS: List[Dict[str, Any]] = []
SCHEDULES_LOCK = threading.Lock()
WEEKLY_SCHEDULES: Dict[str, Dict[str, Any]] = {}
SETUP_SESSIONS_LOCK = threading.Lock()
SETUP_SESSIONS: Dict[str, Dict[str, Any]] = {}
PROFILES_LOCK = threading.Lock()
PROVIDER_PROFILES: Dict[str, Dict[str, Any]] = {}
RUNTIME_SKILLS_LOCK = threading.Lock()
RUNTIME_SKILLS_STATE: Dict[str, Any] = {
    "version": 1,
    "custom_skills": [],
    "bindings": {"assistant_defaults": [], "automation_defaults": []},
    "updated_at": None,
}
IDEMPOTENCY_LOCK = threading.Lock()
IDEMPOTENCY_RECORDS: Dict[str, Dict[str, Any]] = {}
RATE_LIMIT_LOCK = threading.Lock()
RATE_LIMIT_BUCKETS: Dict[str, List[float]] = {}
LOCAL_QUEUE_LOCK = threading.Lock()
LOCAL_PENDING_RUN_IDS: List[str] = []
LOCAL_CLAIMED_RUNS: Dict[str, Dict[str, Any]] = {}
LOCAL_WORKER_REGISTRY: Dict[str, Dict[str, Any]] = {}
TERMINAL_RUN_STATUSES: Set[str] = {
    "completed",
    "failed",
    "timeout",
    "waiting_for_input",
    "stopped",
    "cancelled",
}
MEMORY_BUCKETS: Set[str] = {"profile", "project", "session"}
METRICS_LOCK = threading.Lock()
RUNTIME_METRICS: Dict[str, float] = {
    "runs_started": 0,
    "runs_completed": 0,
    "runs_failed": 0,
    "runs_timeout": 0,
    "runs_waiting_for_input": 0,
    "run_duration_sum_ms": 0,
    "run_duration_count": 0,
    "first_value_sum_ms": 0,
    "first_value_count": 0,
    "hitl_wait_sum_ms": 0,
    "hitl_wait_count": 0,
}
TELEGRAM_AUTOPILOT_LOCK = threading.Lock()
TELEGRAM_AUTOPILOT_STATE: Dict[str, Any] = {
    "enabled": ORION_TELEGRAM_AUTOPILOT_ENABLED,
    "active": False,
    "started_at": None,
    "last_poll_at": None,
    "last_error": None,
    "last_error_at": None,
    "last_error_category": None,
    "last_error_source": None,
    "error_count": 0,
    "consecutive_errors": 0,
    "retry_count": 0,
    "last_retry_at": None,
    "backoff_seconds": 0.0,
    "next_retry_at": None,
    "last_success_at": None,
    "connectors_seen": 0,
    "processed_updates": 0,
    "runs_started": 0,
    "connectors": {},
}
TELEGRAM_AUTOPILOT_THREAD: Optional[threading.Thread] = None
WHATSAPP_AUTOPILOT_LOCK = threading.Lock()
WHATSAPP_AUTOPILOT_STATE: Dict[str, Any] = {
    "enabled": ORION_WHATSAPP_AUTOPILOT_ENABLED,
    "active": False,
    "started_at": None,
    "last_inbound_at": None,
    "last_error": None,
    "last_error_at": None,
    "last_error_category": None,
    "last_error_source": None,
    "error_count": 0,
    "consecutive_errors": 0,
    "connectors_seen": 0,
    "processed_messages": 0,
    "runs_started": 0,
    "connectors": {},
}
ORION_ENGINE_VALIDATION_ERRORS: List[str] = []
