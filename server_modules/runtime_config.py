import os
import uuid
import threading
import queue
import json
import csv
import time
import subprocess
import shutil
import secrets
import base64
import re
import hashlib
import html
import mimetypes
from datetime import datetime, timedelta, timezone
from typing import List, Optional, Dict, Any, Set, Tuple
from pathlib import Path
from urllib import request as urlrequest
from urllib import error as urlerror
from urllib.parse import quote_plus, parse_qs, urlencode
import ssl
import certifi
from contextlib import AsyncExitStack, asynccontextmanager
from fastapi import FastAPI, HTTPException, Header, Depends, Request
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.middleware.cors import CORSMiddleware
from sse_starlette.sse import EventSourceResponse
from dotenv import load_dotenv
from mcp_server import (
    EMPYRALIST_MCP_ENDPOINT,
    EMPYRALIST_MCP_TOOLS,
    mount_empyralist_mcp,
    empyralist_mcp_lifespan,
)
from scripts.platform_execution import (
    capability_metadata,
    capability_tool_id,
    default_local_companion_allow_prefixes,
    supported_capability_catalog,
)
from server_modules import (
    build_doctor_report,
    build_runtime_contract_payload,
    build_probe_payload,
    collect_local_queue_counts,
    collect_runtime_counts,
    probe_openai_credential,
)
from server_modules.provider_profiles import (
    PROVIDER_CATALOG,
    normalize_provider_id,
    normalize_auth_mode,
    provider_supports_auth_mode,
    provider_requires_credential,
    secretless_provider_credentials,
    resolve_provider_adapter,
    ProviderAdapter,
    OpenAIAdapter,
    AnthropicAdapter,
    GeminiAdapter,
    VertexAdapter,
    PROVIDER_ADAPTERS,
    PROVIDER_COST_PER_1K,
    estimate_tokens,
    masked_cost_band,
    build_masked_usage,
    _persist_provider_profiles,
    _load_provider_profiles,
    _profile_cooldown_seconds_for_error,
    _profile_ready,
    _mark_profile_success,
    _mark_profile_failure,
    _sorted_profiles,
    _build_provider_credential_candidates,
)
from server_modules.local_queue import (
    LocalRunClaimRequest,
    LocalRunHeartbeatPayload,
    LocalWorkerHeartbeatPayload,
    LocalRunCompletePayload,
    LocalRunFailPayload,
    _cleanup_stale_local_claims,
    _is_worker_online,
    handle_get_local_run_queue,
    handle_get_local_workers_status,
    handle_heartbeat_local_worker,
    handle_claim_local_run,
    handle_heartbeat_local_run,
    handle_complete_local_run,
    handle_fail_local_run,
)
from server_modules.autopilot_connectors import (
    _load_telegram_autopilot_state,
    _load_whatsapp_autopilot_state,
    _run_telegram_autopilot_forever,
    _whatsapp_autopilot_activate,
    _telegram_autopilot_snapshot,
    _whatsapp_autopilot_snapshot,
    handle_whatsapp_twilio_webhook,
    handle_telegram_autopilot_status,
    handle_whatsapp_autopilot_status,
    handle_list_autopilot_profiles,
    handle_telegram_send_message,
    handle_telegram_autopilot_test_message,
)
from server_modules.connector_validators import (
    validate_google_workspace_connector as _validate_google_workspace_connector,
    validate_microsoft_365_connector as _validate_microsoft_365_connector,
    validate_telegram_connector as _validate_telegram_connector,
    validate_wechat_work_connector as _validate_wechat_work_connector,
    validate_whatsapp_twilio_connector as _validate_whatsapp_twilio_connector,
    validate_discord_bot_connector as _validate_discord_bot_connector,
    validate_instagram_business_connector as _validate_instagram_business_connector,
    validate_irc_connector as _validate_irc_connector,
)
from server_modules.vault_store import (
    _vault_passphrase,
    _set_vault_passphrase,
    _vault_encrypt_with_passphrase,
    _vault_decrypt_v2_with_passphrase,
    _openssl_encrypt_with_passphrase,
    _openssl_decrypt_with_passphrase,
    _openssl_encrypt,
    _openssl_decrypt,
    load_vault,
    save_vault,
)
from server_modules.google_workspace_cli import (
    google_workspace_uses_local_cli,
    google_workspace_local_create_calendar_event,
    google_workspace_local_create_draft,
    google_workspace_local_get_profile,
    google_workspace_local_list_recent_messages,
    google_workspace_local_send_message,
    _gmail_message_summary,
)
from server_modules.google_drive_api import (
    google_workspace_list_drive_children,
    google_workspace_create_document,
    google_workspace_create_spreadsheet,
)
from server_modules.installed_skills import (
    active_installed_skill_ids,
    build_active_skill_prompt_append,
    list_installed_skills,
    merge_skill_prompt_append,
)
from server_modules.installed_solutions import (
    active_installed_solutions,
    call_installed_solution_hook,
    find_installed_solution,
    list_installed_solutions,
)
from server_modules.connector_metadata import (
    _sanitize_connector_metadata,
    _connector_public_metadata,
    _provider_public_metadata,
    _connector_identity_signature,
    _find_duplicate_connector_entry,
)
from server_modules.customer_ops_pack import (
    classify_inbox_priority,
    classify_inbox_category,
    classify_lead_stage,
    extract_lead_name,
)
from server_modules.outcome_packs import execute_outcome_pack
from server_modules.microsoft_365_graph import (
    microsoft_365_create_calendar_event,
    microsoft_365_create_draft,
    microsoft_365_download_drive_file,
    microsoft_365_get_profile,
    microsoft_365_list_drive_children,
    microsoft_graph_request,
    microsoft_365_normalize_drive_path,
    microsoft_365_send_message,
    microsoft_365_upload_drive_file,
)
from server_modules.office_ooxml import (
    DOCX_MIME,
    PPTX_MIME,
    build_docx,
    build_pptx,
    build_updated_docx,
    build_updated_pptx,
    normalize_deck_slides,
    normalize_doc_sections,
)
from server_modules.setup_sessions import (
    SetupSessionCreateRequest,
    SetupSessionActionRequest,
    _cleanup_setup_sessions_locked,
    _load_setup_sessions,
    handle_create_setup_session,
    handle_get_setup_session,
    handle_setup_session_action,
    handle_cancel_setup_session,
    handle_resume_setup_session,
    handle_create_onboarding_session,
    handle_get_onboarding_session,
    handle_onboarding_session_action,
    handle_cancel_onboarding_session,
    handle_resume_onboarding_session,
)
from server_modules.idempotency import (
    _idempotency_record_key,
    _prune_idempotency_locked,
    _persist_idempotency,
    _load_idempotency,
    _idempotency_get,
    _idempotency_store,
)
from server_modules.vault_helpers import (
    normalize_workspace_id as _normalize_workspace_id_impl,
    workspace_visible as _workspace_visible_impl,
    list_vault_credentials as _list_vault_credentials_impl,
    list_vault_connectors as _list_vault_connectors_impl,
    resolve_vault_credential as _resolve_vault_credential_impl,
    parse_iso_datetime as _parse_iso_datetime_impl,
    resolve_default_vault_credential as _resolve_default_vault_credential_impl,
    credential_identity as _credential_identity_impl,
    sanitize_bearer_token as _sanitize_bearer_token_impl,
    codex_token_from_vault as _codex_token_from_vault_impl,
    openai_env_bearer_with_source as _openai_env_bearer_with_source_impl,
    openai_bearer_from_credentials as _openai_bearer_from_credentials_impl,
)
from server_modules.runtime_policy import *
from server_modules.runtime_state_store import (
    init_runtime_state_db,
    upsert_run_history_item,
    replace_run_history,
    list_run_history,
    append_channel_event,
    replace_channel_events,
    list_channel_events,
)
from server_modules.runtime_memory import (
    configure_runtime_memory,
    _memory_health_snapshot,
    _memory_manager_or_503,
    _memory_prompt_context_block,
    _memory_search_scoped,
    _normalize_memory_bucket,
    _persist_run_memory,
    _trim_memory_trace,
    _hydrate_run_memory_context,
)
from server_modules.runtime_events import (
    configure_runtime_events,
    load_channel_events as _load_channel_events,
    append_channel_event_item as _append_channel_event,
    channel_event_matches as _channel_event_matches,
    iter_channel_events_stream as _iter_channel_events_stream,
    summarize_channel_sessions as _summarize_channel_sessions,
)
from server_modules.runtime_runs_api import register_run_routes
from server_modules.runtime_events_api import register_inbox_routes
from server_modules.agent_workspace_api import AGENT_WORKSPACE_LABELS, register_agent_workspace_routes
from server_modules.profile_api import register_profile_routes
from server_modules.app_registry_api import register_app_registry_routes, resolve_app_permissions


EMPYRALIS_STATE_HOME = Path(
    os.getenv("EMPYRALIS_STATE_HOME", str(Path.home() / ".empyralis" / "state"))
).expanduser()


def _resolve_state_file(env_name: str, default_relative: str, legacy_filename: Optional[str] = None) -> Path:
    explicit = os.getenv(env_name)
    if explicit is not None and explicit.strip():
        return Path(explicit.strip()).expanduser()
    preferred = (EMPYRALIS_STATE_HOME / default_relative).expanduser()
    if legacy_filename:
        legacy_path = Path(legacy_filename)
        if legacy_path.exists() and not preferred.exists():
            return legacy_path
    return preferred


def _resolve_state_dir(env_name: str, default_relative: str, legacy_dirname: Optional[str] = None) -> Path:
    explicit = os.getenv(env_name)
    if explicit is not None and explicit.strip():
        return Path(explicit.strip()).expanduser()
    preferred = (EMPYRALIS_STATE_HOME / default_relative).expanduser()
    if legacy_dirname:
        legacy_path = Path(legacy_dirname)
        if legacy_path.exists() and not preferred.exists():
            return legacy_path
    return preferred


from server_modules.runtime_models import (
    configure_runtime_model_context,
    RunStartRequest,
    RunDelegationRequest,
    RunAutoDelegationRequest,
    RunDelegationRetryRequest,
    MemoryUpsertRequest,
    MemorySearchRequest,
    WeeklyScheduleUpsertRequest,
    WeeklySchedulePatchRequest,
    DecisionPayload,
    ToolPolicyEvaluateRequest,
    RuntimeSkillsStateUpsertRequest,
    ProviderProfileUpsertRequest,
    ApprovalResolvePayload,
    CredentialUpsertRequest,
    CredentialTestRequest,
    ConnectorUpsertRequest,
    ConnectorPatchRequest,
    TelegramSendRequest,
    TelegramAutopilotTestRequest,
    VaultRotateKeyRequest,
    VaultExportRequest,
    VaultImportRequest,
)

try:
    from python_engine.memory_manager import MemoryManager as RuntimeMemoryManager
except Exception:
    RuntimeMemoryManager = None  # type: ignore[assignment]
# 1. Load Secrets
load_dotenv()
# Avoid interactive trace prompts and color issues in headless runtime
os.environ.setdefault("RICH_DISABLE_COLOR", "1")
os.environ.setdefault("RICH_NO_COLOR", "1")
os.environ.setdefault("NO_COLOR", "1")
os.environ.setdefault("TERM", "dumb")

@asynccontextmanager
async def app_lifespan(_: FastAPI):
    async with AsyncExitStack() as stack:
        await stack.enter_async_context(empyralist_mcp_lifespan())
        yield



# --- CONFIG ---
FRONTEND_ORIGINS = os.getenv("FRONTEND_ORIGINS", "http://127.0.0.1:3000,http://localhost:3000")
ORION_API_KEY = os.getenv("ORION_API_KEY")
_ORION_AUTH_REQUIRED_RAW = os.getenv("ORION_AUTH_REQUIRED")
ORION_DEV_INSECURE_NO_AUTH = os.getenv("ORION_DEV_INSECURE_NO_AUTH", "0") == "1"
# Fail-closed by default (OpenClaw-style): auth is on unless explicitly disabled.
ORION_AUTH_REQUIRED = (_ORION_AUTH_REQUIRED_RAW != "0") if _ORION_AUTH_REQUIRED_RAW is not None else True
if ORION_DEV_INSECURE_NO_AUTH:
    ORION_AUTH_REQUIRED = False
    print("[WARN] ORION_DEV_INSECURE_NO_AUTH=1 set; runtime API auth is disabled for this process.")
ORION_ALLOW_SYSTEM_PROXY = os.getenv("ORION_ALLOW_SYSTEM_PROXY", "0") == "1"
ORION_RUN_TIMEOUT_SECONDS = int(os.getenv("ORION_RUN_TIMEOUT_SECONDS", "300"))
ORION_MAX_RETRIES = int(os.getenv("ORION_MAX_RETRIES", "2"))
ORION_RETRY_BACKOFF_SECONDS = float(os.getenv("ORION_RETRY_BACKOFF_SECONDS", "1.5"))
ORION_MAX_EVENT_BUFFER = int(os.getenv("ORION_MAX_EVENT_BUFFER", "2000"))
ORION_HISTORY_LIMIT = int(os.getenv("ORION_HISTORY_LIMIT", "800"))
ORION_HISTORY_FILE = _resolve_state_file("ORION_HISTORY_FILE", "runtime/run_history.json", ".orion_run_history.json")
ORION_RUNTIME_STATE_DB = _resolve_state_file("ORION_RUNTIME_STATE_DB", "runtime/state.db", ".orion_runtime_state.db")
ORION_CHANNEL_EVENTS_LIMIT = int(os.getenv("ORION_CHANNEL_EVENTS_LIMIT", "2000"))
ORION_CHANNEL_SESSIONS_LIMIT = int(os.getenv("ORION_CHANNEL_SESSIONS_LIMIT", "80"))
ORION_CHANNEL_EVENTS_FILE = _resolve_state_file("ORION_CHANNEL_EVENTS_FILE", "channels/events.json", ".orion_channel_events.json")
ORION_CHANNEL_DEAD_LETTER_FILE = _resolve_state_file(
    "ORION_CHANNEL_DEAD_LETTER_FILE",
    "channels/dead_letters.json",
    ".orion_channel_dead_letters.json",
)
ORION_CHANNEL_DEAD_LETTER_LIMIT = int(os.getenv("ORION_CHANNEL_DEAD_LETTER_LIMIT", "500"))
ORION_APPROVAL_AUDIT_FILE = _resolve_state_file("ORION_APPROVAL_AUDIT_FILE", "approvals/audit.json", ".orion_approval_audit.json")
ORION_APPROVAL_AUDIT_LIMIT = int(os.getenv("ORION_APPROVAL_AUDIT_LIMIT", "2000"))
ORION_SCHEDULES_FILE = _resolve_state_file("ORION_SCHEDULES_FILE", "automations/weekly_schedules.json", ".orion_weekly_schedules.json")
ORION_SETUP_SESSIONS_FILE = _resolve_state_file("ORION_SETUP_SESSIONS_FILE", "setup/sessions.json", ".orion_setup_sessions.json")
ORION_SETUP_SESSION_TTL_SECONDS = int(os.getenv("ORION_SETUP_SESSION_TTL_SECONDS", "1800"))
ORION_PROVIDER_PROFILES_FILE = _resolve_state_file(
    "ORION_PROVIDER_PROFILES_FILE",
    "providers/profiles.json",
    ".orion_provider_profiles.json",
)
ORION_RUNTIME_SKILLS_FILE = _resolve_state_file("ORION_RUNTIME_SKILLS_FILE", "runtime/skills.json", ".orion_runtime_skills.json")
ORION_APP_REGISTRY_FILE = _resolve_state_file("ORION_APP_REGISTRY_FILE", "apps/registry.json", ".orion_app_registry.json")
ORION_PROFILE_ROOT = _resolve_state_dir("ORION_PROFILE_ROOT", "profiles", ".orion_profiles")
ORION_PROFILE_DEFAULT_FILE = _resolve_state_file("ORION_PROFILE_DEFAULT_FILE", "profiles/default.json", ".orion_default_profile.json")
ORION_VALIDATION_REPORT_DIR = _resolve_state_dir("ORION_VALIDATION_REPORT_DIR", "validation", ".orion-validation")
ORION_VALIDATION_LATEST_FILE = Path(
    os.getenv("ORION_VALIDATION_LATEST_FILE", str(ORION_VALIDATION_REPORT_DIR / "latest_core_smoke.json"))
)
ORION_DOCTOR_REPORT_FILE = _resolve_state_file("ORION_DOCTOR_REPORT_FILE", "diagnostics/doctor_latest.json", ".orion_doctor_latest.json")
ORION_DOCTOR_HISTORY_FILE = _resolve_state_file("ORION_DOCTOR_HISTORY_FILE", "diagnostics/doctor_history.json", ".orion_doctor_history.json")
ORION_DOCTOR_HISTORY_LIMIT = int(os.getenv("ORION_DOCTOR_HISTORY_LIMIT", "120"))
ORION_PROFILE_COOLDOWN_AUTH_SECONDS = int(os.getenv("ORION_PROFILE_COOLDOWN_AUTH_SECONDS", "600"))
ORION_PROFILE_COOLDOWN_RATE_LIMIT_SECONDS = int(os.getenv("ORION_PROFILE_COOLDOWN_RATE_LIMIT_SECONDS", "120"))
ORION_PROFILE_COOLDOWN_TRANSIENT_SECONDS = int(os.getenv("ORION_PROFILE_COOLDOWN_TRANSIENT_SECONDS", "60"))
ORION_APPROVAL_TTL_SECONDS = int(os.getenv("ORION_APPROVAL_TTL_SECONDS", "180"))
ORION_IDEMPOTENCY_FILE = _resolve_state_file("ORION_IDEMPOTENCY_FILE", "runtime/idempotency.json", ".orion_idempotency_log.json")
ORION_IDEMPOTENCY_TTL_SECONDS = int(os.getenv("ORION_IDEMPOTENCY_TTL_SECONDS", "86400"))
ORION_SCHEDULER_ENABLED = os.getenv("ORION_SCHEDULER_ENABLED", "1") == "1"
ORION_SCHEDULER_POLL_SECONDS = int(os.getenv("ORION_SCHEDULER_POLL_SECONDS", "20"))
ORION_LOCAL_COMPANION_ENABLED = os.getenv("ORION_LOCAL_COMPANION_ENABLED", "1") == "1"
ORION_LOCAL_LEASE_SECONDS = int(os.getenv("ORION_LOCAL_LEASE_SECONDS", "120"))


def _compat_env(primary: str, legacy: str, default: str) -> str:
    value = os.getenv(primary)
    if value is not None:
        return value
    value = os.getenv(legacy)
    if value is not None:
        return value
    return default

ORION_TELEGRAM_AUTOPILOT_ENABLED = os.getenv("ORION_TELEGRAM_AUTOPILOT_ENABLED", "1") == "1"
ORION_TELEGRAM_AUTOPILOT_POLL_SECONDS = float(os.getenv("ORION_TELEGRAM_AUTOPILOT_POLL_SECONDS", "3"))
ORION_TELEGRAM_AUTOPILOT_MAX_UPDATES = int(os.getenv("ORION_TELEGRAM_AUTOPILOT_MAX_UPDATES", "20"))
ORION_TELEGRAM_AUTOPILOT_RUN_TIMEOUT_SECONDS = int(os.getenv("ORION_TELEGRAM_AUTOPILOT_RUN_TIMEOUT_SECONDS", "180"))
ORION_TELEGRAM_AUTOPILOT_ENGINE = os.getenv("ORION_TELEGRAM_AUTOPILOT_ENGINE", "codex").strip() or "codex"
ORION_TELEGRAM_AUTOPILOT_WORKSPACE_ID = (os.getenv("ORION_TELEGRAM_AUTOPILOT_WORKSPACE_ID", "").strip() or None)
ORION_TELEGRAM_AUTOPILOT_REQUIRE_PREFIX = (
    _compat_env("EMPYRALIS_TELEGRAM_AUTOPILOT_REQUIRE_PREFIX", "ORION_TELEGRAM_AUTOPILOT_REQUIRE_PREFIX", "0") == "1"
)
ORION_TELEGRAM_AUTOPILOT_PREFIX = (
    _compat_env("EMPYRALIS_TELEGRAM_AUTOPILOT_PREFIX", "ORION_TELEGRAM_AUTOPILOT_PREFIX", "/empyralis").strip()
    or "/empyralis"
)
ORION_TELEGRAM_AUTOPILOT_PROFILE = (
    _compat_env("EMPYRALIS_TELEGRAM_AUTOPILOT_PROFILE", "ORION_TELEGRAM_AUTOPILOT_PROFILE", "assistant").strip().lower()
    or "assistant"
)
ORION_TELEGRAM_AUTOPILOT_SEND_ACK = os.getenv("ORION_TELEGRAM_AUTOPILOT_SEND_ACK", "0") == "1"
ORION_TELEGRAM_AUTOPILOT_ALLOW_ANY_CHAT = os.getenv("ORION_TELEGRAM_AUTOPILOT_ALLOW_ANY_CHAT", "1") == "1"
ORION_TELEGRAM_AUTOPILOT_TRUST_MODE = os.getenv("ORION_TELEGRAM_AUTOPILOT_TRUST_MODE", "guarded").strip().lower() or "guarded"
ORION_TELEGRAM_AUTOPILOT_EXECUTION_TARGET = (
    os.getenv("ORION_TELEGRAM_AUTOPILOT_EXECUTION_TARGET", "local_companion").strip().lower() or "local_companion"
)
ORION_TELEGRAM_AUTOPILOT_STATE_FILE = _resolve_state_file(
    "ORION_TELEGRAM_AUTOPILOT_STATE_FILE",
    "channels/telegram/autopilot_state.json",
    ".orion_telegram_autopilot_state.json",
)
ORION_TELEGRAM_AUTOPILOT_MAX_REPLY_CHARS = int(os.getenv("ORION_TELEGRAM_AUTOPILOT_MAX_REPLY_CHARS", "1400"))
ORION_WHATSAPP_AUTOPILOT_ENABLED = os.getenv("ORION_WHATSAPP_AUTOPILOT_ENABLED", "1") == "1"
ORION_WHATSAPP_AUTOPILOT_PROFILE = (
    _compat_env("EMPYRALIS_WHATSAPP_AUTOPILOT_PROFILE", "ORION_WHATSAPP_AUTOPILOT_PROFILE", "assistant").strip().lower()
    or "assistant"
)
ORION_WHATSAPP_AUTOPILOT_ENGINE = os.getenv("ORION_WHATSAPP_AUTOPILOT_ENGINE", "codex").strip() or "codex"
ORION_WHATSAPP_AUTOPILOT_WORKSPACE_ID = (os.getenv("ORION_WHATSAPP_AUTOPILOT_WORKSPACE_ID", "").strip() or None)
ORION_WHATSAPP_AUTOPILOT_REQUIRE_PREFIX = (
    _compat_env("EMPYRALIS_WHATSAPP_AUTOPILOT_REQUIRE_PREFIX", "ORION_WHATSAPP_AUTOPILOT_REQUIRE_PREFIX", "0") == "1"
)
ORION_WHATSAPP_AUTOPILOT_PREFIX = (
    _compat_env("EMPYRALIS_WHATSAPP_AUTOPILOT_PREFIX", "ORION_WHATSAPP_AUTOPILOT_PREFIX", "/empyralis").strip()
    or "/empyralis"
)
ORION_WHATSAPP_AUTOPILOT_SEND_ACK = os.getenv("ORION_WHATSAPP_AUTOPILOT_SEND_ACK", "0") == "1"
ORION_WHATSAPP_AUTOPILOT_TRUST_MODE = os.getenv("ORION_WHATSAPP_AUTOPILOT_TRUST_MODE", "guarded").strip().lower() or "guarded"
ORION_WHATSAPP_AUTOPILOT_EXECUTION_TARGET = (
    os.getenv("ORION_WHATSAPP_AUTOPILOT_EXECUTION_TARGET", "local_companion").strip().lower() or "local_companion"
)
ORION_WHATSAPP_AUTOPILOT_RUN_TIMEOUT_SECONDS = int(os.getenv("ORION_WHATSAPP_AUTOPILOT_RUN_TIMEOUT_SECONDS", "180"))
ORION_WHATSAPP_AUTOPILOT_MAX_REPLY_CHARS = int(os.getenv("ORION_WHATSAPP_AUTOPILOT_MAX_REPLY_CHARS", "700"))
ORION_WHATSAPP_AUTOPILOT_STATE_FILE = _resolve_state_file(
    "ORION_WHATSAPP_AUTOPILOT_STATE_FILE",
    "channels/whatsapp/autopilot_state.json",
    ".orion_whatsapp_autopilot_state.json",
)
ORION_WHATSAPP_AUTOPILOT_WEBHOOK_SECRET = os.getenv("ORION_WHATSAPP_AUTOPILOT_WEBHOOK_SECRET", "").strip()
OPENAI_API_URL = os.getenv("OPENAI_API_URL", "https://api.openai.com/v1/models")
OPENAI_RESPONSES_URL = os.getenv("OPENAI_RESPONSES_URL", "https://api.openai.com/v1/responses")
OPENAI_ORG_ID = os.getenv("OPENAI_ORG_ID")
OPENAI_PROJECT_ID = os.getenv("OPENAI_PROJECT_ID")
OPENAI_ACCESS_TOKEN = os.getenv("OPENAI_ACCESS_TOKEN")
OPENAI_OAUTH_TOKEN = os.getenv("OPENAI_OAUTH_TOKEN")
CODEX_OAUTH_TOKEN = os.getenv("CODEX_OAUTH_TOKEN")
OPENAI_HEALTHCHECK = os.getenv("OPENAI_HEALTHCHECK", "1") == "1"
ORION_AUTH_MODE = (os.getenv("ORION_AUTH_MODE", "codex").strip().lower() or "codex")
ORION_DISABLE_OPENAI_API_KEY = os.getenv("ORION_DISABLE_OPENAI_API_KEY", "1") == "1"
ORION_SINGLE_AGENT_MODE = _compat_env("EMPYRALIS_SINGLE_AGENT_MODE", "ORION_SINGLE_AGENT_MODE", "0") == "1"
ORION_SINGLE_AGENT_ROLE = "orchestrator"
CODEX_AUTH_FILE = Path(
    os.getenv("CODEX_AUTH_FILE", str(Path.home() / ".codex" / "auth.json"))
).expanduser()
CODEX_MODEL = os.getenv("CODEX_MODEL", "gpt-4.1")
ORION_CODEX_SYSTEM_PROMPT = os.getenv(
    "ORION_CODEX_SYSTEM_PROMPT",
    "You are Empyralis runtime assistant. Be concise, accurate, and action-focused.",
)
ORION_PLANNER_SYSTEM_PROMPT = os.getenv(
    "ORION_PLANNER_SYSTEM_PROMPT",
    "You are Empyralis Planner. Produce deterministic execution plans. Be explicit about side effects.",
)
ORION_OPERATOR_SYSTEM_PROMPT = os.getenv(
    "ORION_OPERATOR_SYSTEM_PROMPT",
    "You are Empyralis Operator. Execute safely and report outcomes clearly.",
)
DEFAULT_LOCAL_COMPANION_ALLOW_PREFIXES = default_local_companion_allow_prefixes(Path(__file__).resolve().parent)
VAULT_FILE = _resolve_state_file(
    "CREDENTIAL_VAULT_FILE",
    "vault/credentials.json",
    ".orion_credentials_vault.json",
)
VAULT_KEY_FILE = _resolve_state_file(
    "CREDENTIAL_VAULT_KEY_FILE",
    "vault/key",
    ".orion_vault_key",
)
VAULT_KEY_ENV = os.getenv("CREDENTIAL_VAULT_KEY")
ORION_VAULT_CIPHER_PREFIX = os.getenv("ORION_VAULT_CIPHER_PREFIX", "orion.v2:")
ORION_VAULT_KDF_ITERATIONS = max(
    120000,
    min(int(os.getenv("ORION_VAULT_KDF_ITERATIONS", "390000")), 3000000),
)
ORION_VAULT_LEGACY_OPENSSL_DECRYPT = os.getenv("ORION_VAULT_LEGACY_OPENSSL_DECRYPT", "1") == "1"
ORION_VAULT_LEGACY_OPENSSL_ENCRYPT_FALLBACK = (
    os.getenv("ORION_VAULT_LEGACY_OPENSSL_ENCRYPT_FALLBACK", "1") == "1"
)
PROVIDER_TIMEOUT_SECONDS = int(os.getenv("PROVIDER_TIMEOUT_SECONDS", "12"))
CONTROL_PLANE_ORIGINS = [origin.strip() for origin in os.getenv("CONTROL_PLANE_ORIGINS", FRONTEND_ORIGINS).split(",") if origin.strip()]
CONTROL_PLANE_RATE_LIMIT_PER_MINUTE = int(os.getenv("CONTROL_PLANE_RATE_LIMIT_PER_MINUTE", "60"))
CONTROL_PLANE_RATE_LIMIT_BURST = int(os.getenv("CONTROL_PLANE_RATE_LIMIT_BURST", "20"))
ORION_RUNTIME_API_VERSION = os.getenv("ORION_RUNTIME_API_VERSION", "1.0.0").strip() or "1.0.0"
ORION_RUNTIME_API_MIN_CLI_VERSION = (
    os.getenv("ORION_RUNTIME_API_MIN_CLI_VERSION", "2026.2.0").strip() or "2026.2.0"
)
ORION_RUNTIME_CONTRACT_SCHEMA_VERSION = (
    os.getenv("ORION_RUNTIME_CONTRACT_SCHEMA_VERSION", "2026.2.0").strip() or "2026.2.0"
)
ORION_MEMORY_ENABLED = os.getenv("ORION_MEMORY_ENABLED", "1") == "1"
ORION_MEMORY_READ_K = max(1, min(int(os.getenv("ORION_MEMORY_READ_K", "5")), 20))
ORION_MEMORY_MAX_TEXT_CHARS = max(400, min(int(os.getenv("ORION_MEMORY_MAX_TEXT_CHARS", "2400")), 12000))
ORION_MEMORY_RETENTION_DAYS_DEFAULT = max(
    1,
    min(int(os.getenv("ORION_MEMORY_RETENTION_DAYS_DEFAULT", "365")), 3650),
)
ORION_MEMORY_DB_PATH = (
    os.getenv(
        "ORION_MEMORY_DB_PATH",
        str(Path(__file__).resolve().parent / "python_engine" / "agency_memory.db"),
    ).strip()
    or str(Path(__file__).resolve().parent / "python_engine" / "agency_memory.db")
)
ORION_MEMORY_LANCEDB_URI = (
    os.getenv(
        "ORION_MEMORY_LANCEDB_URI",
        str(Path(__file__).resolve().parent / "python_engine" / "data" / "lancedb"),
    ).strip()
    or str(Path(__file__).resolve().parent / "python_engine" / "data" / "lancedb")
)

CONNECTOR_CATALOG = {
    "google_workspace": {
        "label": "Google Workspace",
        "auth": ["access_token"],
    },
    "microsoft_365": {
        "label": "Microsoft 365",
        "auth": ["access_token"],
    },
    "telegram_bot": {
        "label": "Telegram Bot",
        "auth": ["bot_token", "chat_id"],
    },
    "wechat_work": {
        "label": "WeChat Work",
        "auth": ["webhook_url"],
    },
    "whatsapp_twilio": {
        "label": "WhatsApp (Twilio)",
        "auth": ["account_sid", "auth_token", "from_number", "to_number"],
    },
    "discord_bot": {
        "label": "Discord (Bot API)",
        "auth": ["bot_token", "channel_id", "guild_id"],
    },
    "instagram_business": {
        "label": "Instagram Business",
        "auth": ["access_token", "instagram_account_id", "page_id"],
    },
    "irc": {
        "label": "IRC (Server + Nick)",
        "auth": ["server", "port", "nick", "channel", "password", "use_tls"],
    },
}

TELEGRAM_AUTOPILOT_PROFILE_CATALOG: Dict[str, Dict[str, Any]] = {
    "assistant": {
        "label": "Assistant",
        "description": "Best for chat UX. Free text starts runs; help/status commands are available.",
        "allow_free_text": True,
        "allow_status": True,
        "allow_help": True,
    },
    "commands_only": {
        "label": "Commands Only",
        "description": "Only explicit commands are accepted: run/status/help.",
        "allow_free_text": False,
        "allow_status": True,
        "allow_help": True,
    },
    "run_only": {
        "label": "Run Only",
        "description": "Focus on run requests; status command is disabled.",
        "allow_free_text": True,
        "allow_status": False,
        "allow_help": True,
    },
}
WHATSAPP_AUTOPILOT_PROFILE_CATALOG: Dict[str, Dict[str, Any]] = {
    "assistant": {
        "label": "Assistant",
        "description": "Best for chat UX. Free text starts runs; help/status commands are available.",
        "allow_free_text": True,
        "allow_status": True,
        "allow_help": True,
    },
    "commands_only": {
        "label": "Commands Only",
        "description": "Only explicit commands are accepted: run/status/help.",
        "allow_free_text": False,
        "allow_status": True,
        "allow_help": True,
    },
    "run_only": {
        "label": "Run Only",
        "description": "Focus on run requests; status command is disabled.",
        "allow_free_text": True,
        "allow_status": False,
        "allow_help": True,
    },
}

RUNTIME_BUILTIN_SKILLS: List[Dict[str, Any]] = [
    {
        "id": "ops-commander",
        "title": "Ops Commander",
        "intent": "Diagnose incidents, propose fixes, and keep execution logs concise.",
        "tools": ["read_logs", "query_metrics", "send_message"],
        "guardrail": "Requires approval for outbound actions in guarded mode.",
        "runtime_tools": ["send_message", "draft_email", "create_calendar_event"],
        "preferred_target": "cloud",
        "preferred_trust_mode": "guarded",
        "policy_mode": "warn",
        "version": "1.0.0",
        "author": "Empyralis",
        "category": "Operations",
    },
    {
        "id": "founder-assistant",
        "title": "Founder Assistant",
        "intent": "Turn rough ideas into concrete tasks, priorities, and weekly plans.",
        "tools": ["summarize", "create_task", "draft_email"],
        "guardrail": "Never auto-send externally without explicit approval.",
        "runtime_tools": ["draft_email"],
        "preferred_target": "cloud",
        "preferred_trust_mode": "guarded",
        "policy_mode": "warn",
        "version": "1.0.0",
        "author": "Empyralis",
        "category": "Execution",
    },
    {
        "id": "exam-coach",
        "title": "Exam Coach",
        "intent": "Build study plans, drills, and daily check-ins with accountability.",
        "tools": ["plan", "memory.search", "send_message"],
        "guardrail": "No destructive actions. Keep focus on learning workflow.",
        "runtime_tools": ["send_message"],
        "preferred_target": "cloud",
        "preferred_trust_mode": "guarded",
        "policy_mode": "warn",
        "version": "1.0.0",
        "author": "Empyralis",
        "category": "Learning",
    },
]
