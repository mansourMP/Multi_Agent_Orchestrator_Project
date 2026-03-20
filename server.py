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
from fastapi import FastAPI, HTTPException, Header, Depends, Request
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.middleware.cors import CORSMiddleware
from sse_starlette.sse import EventSourceResponse
from dotenv import load_dotenv
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

app = FastAPI(title="Empyralis Runtime API")

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

app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in FRONTEND_ORIGINS.split(",") if origin.strip()],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global State
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
ORION_ENGINE_VALIDATION_ERRORS: List[str] = []
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


def metrics_inc(key: str, amount: float = 1):
    with METRICS_LOCK:
        RUNTIME_METRICS[key] = RUNTIME_METRICS.get(key, 0) + amount


def metrics_add(key: str, amount: float):
    with METRICS_LOCK:
        RUNTIME_METRICS[key] = RUNTIME_METRICS.get(key, 0) + amount


def _safe_write_json(path: Path, payload: Dict[str, Any]):
    parent = path.parent if path.parent != Path("") else Path(".")
    parent.mkdir(parents=True, exist_ok=True)
    # Use per-write temp file names so concurrent writers cannot race on a shared tmp path.
    tmp_path = parent / f".{path.name}.{uuid.uuid4().hex}.tmp"
    tmp_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    tmp_path.replace(path)


def _safe_read_json(path: Path, fallback: Dict[str, Any]) -> Dict[str, Any]:
    if not path.exists():
        return fallback
    try:
        raw = path.read_text(encoding="utf-8")
        parsed = json.loads(raw) if raw else {}
        if isinstance(parsed, dict):
            return parsed
        return fallback
    except Exception:
        return fallback


def _sanitize_skill_card(item: Any) -> Optional[Dict[str, Any]]:
    if not isinstance(item, dict):
        return None
    skill_id = str(item.get("id") or "").strip().lower()
    title = str(item.get("title") or "").strip()
    intent = str(item.get("intent") or "").strip()
    if not skill_id or not title or not intent:
        return None
    tools_raw = item.get("tools")
    tools: List[str] = []
    if isinstance(tools_raw, list):
        for entry in tools_raw:
            token = str(entry or "").strip().lower()
            if token and token not in tools:
                tools.append(token[:120])
    runtime_tools_raw = item.get("runtime_tools")
    runtime_tools: List[str] = []
    if isinstance(runtime_tools_raw, list):
        for entry in runtime_tools_raw:
            token = normalize_action_id(entry)
            if token and token in TOOL_CONTRACTS and token not in runtime_tools:
                runtime_tools.append(token)
    guardrail = str(item.get("guardrail") or "").strip()
    preferred_target = ""
    raw_target = str(item.get("preferred_target") or "").strip().lower()
    if raw_target in VALID_EXECUTION_TARGETS:
        preferred_target = raw_target
    preferred_trust_mode = ""
    raw_trust_mode = str(item.get("preferred_trust_mode") or "").strip().lower()
    if raw_trust_mode:
        normalized_trust_mode = normalize_trust_mode(raw_trust_mode)
        if normalized_trust_mode in VALID_TRUST_MODES:
            preferred_trust_mode = normalized_trust_mode
    policy_mode = "warn"
    raw_policy_mode = str(item.get("policy_mode") or item.get("skill_policy_mode") or "").strip().lower()
    if raw_policy_mode in {"off", "warn", "enforce"}:
        policy_mode = raw_policy_mode
    version = str(item.get("version") or "").strip()
    author = str(item.get("author") or "").strip()
    category = str(item.get("category") or "").strip()
    card = {
        "id": skill_id[:80],
        "title": title[:120],
        "intent": intent[:1000],
        "tools": tools[:30],
        "guardrail": guardrail[:1000],
        "policy_mode": policy_mode,
    }
    if runtime_tools:
        card["runtime_tools"] = runtime_tools[:30]
    if preferred_target:
        card["preferred_target"] = preferred_target
    if preferred_trust_mode:
        card["preferred_trust_mode"] = preferred_trust_mode
    if version:
        card["version"] = version[:40]
    if author:
        card["author"] = author[:80]
    if category:
        card["category"] = category[:80]
    return card


def _sanitize_skill_id_list(raw_items: Any) -> List[str]:
    if not isinstance(raw_items, list):
        return []
    out: List[str] = []
    for raw in raw_items:
        token = str(raw or "").strip().lower()
        if not token or token in out:
            continue
        out.append(token[:80])
    return out[:50]


def _compose_skill_prompt_append(skills: List[Dict[str, Any]]) -> str:
    if not skills:
        return ""
    lines = ["Active skill directives (follow unless user overrides explicitly):"]
    for skill in skills:
        title = str(skill.get("title") or "").strip()
        intent = str(skill.get("intent") or "").strip()
        guardrail = str(skill.get("guardrail") or "").strip()
        tools = skill.get("tools") if isinstance(skill.get("tools"), list) else []
        tools_text = ", ".join(str(item).strip() for item in tools if str(item).strip()) or "none"
        runtime_tools = skill.get("runtime_tools") if isinstance(skill.get("runtime_tools"), list) else []
        runtime_tools_text = ", ".join(str(item).strip() for item in runtime_tools if str(item).strip()) or "none"
        preferred_target = str(skill.get("preferred_target") or "").strip()
        preferred_trust_mode = str(skill.get("preferred_trust_mode") or "").strip()
        policy_mode = str(skill.get("policy_mode") or "").strip()
        extra_parts: List[str] = []
        if preferred_target:
            extra_parts.append(f"Preferred target: {preferred_target}.")
        if preferred_trust_mode:
            extra_parts.append(f"Preferred trust mode: {preferred_trust_mode}.")
        if policy_mode:
            extra_parts.append(f"Policy mode: {policy_mode}.")
        extra_suffix = f" {' '.join(extra_parts)}" if extra_parts else ""
        lines.append(f"- {title}: {intent} Guardrail: {guardrail or 'none'}. Tools: {tools_text}. Runtime tools: {runtime_tools_text}.{extra_suffix}")
    return "\n".join(lines).strip()


def _build_skill_contract_from_metadata(
    metadata: Dict[str, Any],
    predicted_tool_ids: List[str],
    trust_mode: str,
    target: str,
) -> Dict[str, Any]:
    bundle = metadata.get("skill_bundle") if isinstance(metadata.get("skill_bundle"), dict) else {}
    skills = bundle.get("skills") if isinstance(bundle.get("skills"), list) else []
    skill_ids = _sanitize_skill_id_list(bundle.get("skill_ids"))
    declared_runtime_tools: List[str] = []
    seen_runtime_tools: Set[str] = set()
    preferred_targets: List[str] = []
    preferred_trust_modes: List[str] = []
    skill_policy_modes: List[str] = []

    for raw in skills:
        if not isinstance(raw, dict):
            continue
        for entry in raw.get("runtime_tools") if isinstance(raw.get("runtime_tools"), list) else []:
            tool_id = normalize_action_id(entry)
            if tool_id and tool_id in TOOL_CONTRACTS and tool_id not in seen_runtime_tools:
                seen_runtime_tools.add(tool_id)
                declared_runtime_tools.append(tool_id)
        target_hint = str(raw.get("preferred_target") or "").strip().lower()
        if target_hint in VALID_EXECUTION_TARGETS and target_hint not in preferred_targets:
            preferred_targets.append(target_hint)
        trust_hint = str(raw.get("preferred_trust_mode") or "").strip().lower()
        if trust_hint:
            normalized_trust = normalize_trust_mode(trust_hint)
            if normalized_trust in VALID_TRUST_MODES and normalized_trust not in preferred_trust_modes:
                preferred_trust_modes.append(normalized_trust)
        policy_hint = str(raw.get("policy_mode") or raw.get("skill_policy_mode") or "").strip().lower()
        if policy_hint in {"off", "warn", "enforce"} and policy_hint not in skill_policy_modes:
            skill_policy_modes.append(policy_hint)

    undeclared_tools = [
        tool_id for tool_id in predicted_tool_ids if declared_runtime_tools and tool_id not in seen_runtime_tools
    ]
    mode = str(metadata.get("skill_policy_mode") or "").strip().lower() or "warn"
    if mode not in {"off", "warn", "enforce"}:
        if "enforce" in skill_policy_modes:
            mode = "enforce"
        elif "warn" in skill_policy_modes:
            mode = "warn"
        elif "off" in skill_policy_modes:
            mode = "off"
        else:
            mode = "warn"

    return {
        "scope": str(metadata.get("skill_scope") or "").strip() or None,
        "skill_ids": skill_ids,
        "declared_runtime_tools": declared_runtime_tools,
        "preferred_targets": preferred_targets,
        "preferred_trust_modes": preferred_trust_modes,
        "skill_policy_modes": skill_policy_modes,
        "undeclared_tools": undeclared_tools,
        "policy_mode": mode,
        "target_conflict": bool(preferred_targets and target not in preferred_targets),
        "trust_conflict": bool(preferred_trust_modes and trust_mode not in preferred_trust_modes),
    }


def _runtime_skill_catalog_map(custom_skills: List[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
    merged: List[Dict[str, Any]] = []
    merged.extend(RUNTIME_BUILTIN_SKILLS)
    merged.extend(custom_skills)
    out: Dict[str, Dict[str, Any]] = {}
    for raw in merged:
        card = _sanitize_skill_card(raw)
        if not card:
            continue
        out[card["id"]] = card
    return out


def _runtime_skill_bundle_for_scope(scope: str) -> Dict[str, Any]:
    scope_key = str(scope or "").strip().lower()
    if scope_key not in {"assistant_defaults", "automation_defaults"}:
        scope_key = "assistant_defaults"
    with RUNTIME_SKILLS_LOCK:
        state = dict(RUNTIME_SKILLS_STATE)
        bindings = dict(state.get("bindings") or {})
        custom_skills = list(state.get("custom_skills") or [])
    selected_ids = _sanitize_skill_id_list(bindings.get(scope_key))
    if not selected_ids:
        return {"scope": scope_key, "skill_ids": [], "skills": [], "prompt_append": ""}
    skill_map = _runtime_skill_catalog_map(custom_skills)
    active: List[Dict[str, Any]] = []
    for skill_id in selected_ids:
        skill = skill_map.get(skill_id)
        if skill:
            active.append(skill)
    prompt_append = _compose_skill_prompt_append(active)
    return {
        "scope": scope_key,
        "skill_ids": [str(item.get("id") or "") for item in active],
        "skills": active,
        "prompt_append": prompt_append,
    }


def _inject_runtime_skill_defaults(context: Dict[str, Any]) -> None:
    if not isinstance(context, dict):
        return
    metadata = context.get("metadata") if isinstance(context.get("metadata"), dict) else {}
    if not isinstance(metadata, dict):
        metadata = {}
    if not metadata.get("skill_bundle") and not metadata.get("skill_prompt_append"):
        scope_key = "assistant_defaults"
        if str(metadata.get("source") or "").strip().lower() in {"weekly_scheduler", "scheduled"}:
            scope_key = "automation_defaults"
        if str(metadata.get("outcome_pack") or "").strip():
            scope_key = "automation_defaults"
        bundle = _runtime_skill_bundle_for_scope(scope_key)
        if bundle.get("skills"):
            metadata["skill_scope"] = bundle.get("scope")
            metadata["skill_bundle"] = {
                "skill_ids": bundle.get("skill_ids"),
                "skills": bundle.get("skills"),
            }
            metadata["skill_prompt_append"] = bundle.get("prompt_append")
    installed_prompt = build_active_skill_prompt_append()
    if installed_prompt:
        metadata["installed_skill_ids"] = active_installed_skill_ids()
        metadata["skill_prompt_append"] = merge_skill_prompt_append(
            str(metadata.get("skill_prompt_append") or "").strip(),
            installed_prompt,
        )
    context["metadata"] = metadata


def _persist_runtime_skills_state() -> None:
    with RUNTIME_SKILLS_LOCK:
        payload = {
            "version": 1,
            "custom_skills": list(RUNTIME_SKILLS_STATE.get("custom_skills") or []),
            "bindings": dict(RUNTIME_SKILLS_STATE.get("bindings") or {}),
            "updated_at": RUNTIME_SKILLS_STATE.get("updated_at"),
        }
    _safe_write_json(ORION_RUNTIME_SKILLS_FILE, payload)


def _load_runtime_skills_state() -> None:
    payload = _safe_read_json(
        ORION_RUNTIME_SKILLS_FILE,
        {
            "version": 1,
            "custom_skills": [],
            "bindings": {"assistant_defaults": [], "automation_defaults": []},
            "updated_at": None,
        },
    )
    custom_raw = payload.get("custom_skills") if isinstance(payload.get("custom_skills"), list) else []
    custom_skills: List[Dict[str, Any]] = []
    for item in custom_raw:
        card = _sanitize_skill_card(item)
        if card:
            custom_skills.append(card)
    bindings_raw = payload.get("bindings") if isinstance(payload.get("bindings"), dict) else {}
    bindings = {
        "assistant_defaults": _sanitize_skill_id_list(bindings_raw.get("assistant_defaults")),
        "automation_defaults": _sanitize_skill_id_list(bindings_raw.get("automation_defaults")),
    }
    with RUNTIME_SKILLS_LOCK:
        RUNTIME_SKILLS_STATE["version"] = 1
        RUNTIME_SKILLS_STATE["custom_skills"] = custom_skills
        RUNTIME_SKILLS_STATE["bindings"] = bindings
        RUNTIME_SKILLS_STATE["updated_at"] = str(payload.get("updated_at") or "").strip() or None


def _runtime_skills_snapshot() -> Dict[str, Any]:
    with RUNTIME_SKILLS_LOCK:
        custom = list(RUNTIME_SKILLS_STATE.get("custom_skills") or [])
        bindings = dict(RUNTIME_SKILLS_STATE.get("bindings") or {})
        updated_at = RUNTIME_SKILLS_STATE.get("updated_at")
    return {
        "version": 1,
        "custom_skills": custom,
        "bindings": {
            "assistant_defaults": _sanitize_skill_id_list(bindings.get("assistant_defaults")),
            "automation_defaults": _sanitize_skill_id_list(bindings.get("automation_defaults")),
        },
        "registry": {
            "builtin_count": len(_runtime_skill_catalog_map([])),
            "custom_count": len(custom),
            "installed_count": len(_runtime_skill_catalog_map(custom)),
            "assistant_bundle_count": len(_runtime_skill_bundle_for_scope("assistant_defaults").get("skill_ids") or []),
            "automation_bundle_count": len(_runtime_skill_bundle_for_scope("automation_defaults").get("skill_ids") or []),
        },
        "updated_at": updated_at,
    }


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _utc_now_iso() -> str:
    return _utc_now().isoformat().replace("+00:00", "Z")


def _parse_utc_ts(raw: Any) -> Optional[datetime]:
    if not isinstance(raw, str) or not raw.strip():
        return None
    value = raw.strip()
    try:
        if value.endswith("Z"):
            value = value[:-1] + "+00:00"
        return datetime.fromisoformat(value).astimezone(timezone.utc)
    except Exception:
        return None


def _is_control_plane_mutation(request: Request) -> bool:
    return request.method.upper() in {"POST", "PUT", "PATCH", "DELETE"}


def _extract_request_api_key(request: Request) -> str:
    direct = request.headers.get("x-api-key")
    if isinstance(direct, str) and direct.strip():
        return direct.strip()
    auth = request.headers.get("authorization") or ""
    if auth.lower().startswith("bearer "):
        return auth[7:].strip()
    qp = request.query_params.get("api_key")
    if isinstance(qp, str) and qp.strip():
        return qp.strip()
    return ""


def _check_control_plane_origin(request: Request) -> Optional[JSONResponse]:
    if not _is_control_plane_mutation(request):
        return None
    if not CONTROL_PLANE_ORIGINS:
        return None
    origin = request.headers.get("origin")
    if not origin:
        return None
    if origin not in CONTROL_PLANE_ORIGINS:
        return JSONResponse(
            status_code=403,
            content={
                "detail": "Origin is not allowed.",
                "origin": origin,
                "allowed_origins": CONTROL_PLANE_ORIGINS,
            },
        )
    return None


def _control_plane_rate_limit(request: Request) -> Optional[JSONResponse]:
    if not _is_control_plane_mutation(request):
        return None
    request_path = str(request.url.path or "")
    if request_path.startswith("/local/runs/") or request_path.startswith("/local/workers/"):
        # Local companion loops (claim/heartbeat/complete/fail) are chatty by design.
        # Keep control-plane limits focused on user-facing mutation APIs.
        return None
    now = time.time()
    client_host = request.client.host if request.client else "unknown"
    api_key = _extract_request_api_key(request)
    identity = f"{client_host}:{api_key or 'anon'}"
    with RATE_LIMIT_LOCK:
        bucket = RATE_LIMIT_BUCKETS.get(identity, [])
        cutoff = now - 60.0
        bucket = [ts for ts in bucket if ts >= cutoff]
        limit = max(1, CONTROL_PLANE_RATE_LIMIT_PER_MINUTE + CONTROL_PLANE_RATE_LIMIT_BURST)
        if len(bucket) >= limit:
            retry_after = max(1, int(round(bucket[0] + 60.0 - now)))
            return JSONResponse(
                status_code=429,
                content={"detail": "Control plane rate limit exceeded.", "retry_after_seconds": retry_after},
                headers={"Retry-After": str(retry_after)},
            )
        bucket.append(now)
        RATE_LIMIT_BUCKETS[identity] = bucket
    return None







@app.middleware("http")
async def control_plane_guard_middleware(request: Request, call_next):
    origin_failure = _check_control_plane_origin(request)
    if origin_failure is not None:
        return origin_failure

    rate_limit_failure = _control_plane_rate_limit(request)
    if rate_limit_failure is not None:
        return rate_limit_failure

    if not _is_control_plane_mutation(request):
        return await call_next(request)

    idempotency_key = request.headers.get("x-idempotency-key") or request.headers.get("X-Idempotency-Key")
    if not isinstance(idempotency_key, str) or not idempotency_key.strip():
        return await call_next(request)

    body = await request.body()
    body_hash = hashlib.sha256(body).hexdigest()
    lookup = _idempotency_get(request.method, request.url.path, idempotency_key.strip(), body_hash)
    if lookup.get("hit") and lookup.get("conflict"):
        return JSONResponse(status_code=409, content={"detail": "Idempotency key reused with different payload."})
    if lookup.get("hit") and isinstance(lookup.get("record"), dict):
        record = lookup["record"]
        headers = {"X-Idempotent-Replay": "1"}
        return JSONResponse(status_code=int(record.get("status_code", 200)), content=record.get("response"), headers=headers)

    response = await call_next(request)
    if response.status_code >= 500:
        return response

    if response.media_type and "application/json" not in response.media_type.lower():
        return response
    if response.headers.get("content-type") and "application/json" not in response.headers.get("content-type", "").lower():
        return response

    body_bytes = b""
    async for chunk in response.body_iterator:
        body_bytes += chunk
    replay_response = Response(
        content=body_bytes,
        status_code=response.status_code,
        headers=dict(response.headers),
        media_type=response.media_type,
    )
    try:
        parsed = json.loads(body_bytes.decode("utf-8")) if body_bytes else None
    except Exception:
        parsed = None
    if parsed is not None:
        _idempotency_store(request.method, request.url.path, idempotency_key.strip(), body_hash, response.status_code, parsed)
    return replay_response


def _pack_id_from_context(run: Dict[str, Any]) -> Optional[str]:
    context = run.get("context") if isinstance(run.get("context"), dict) else {}
    metadata = context.get("metadata") if isinstance(context.get("metadata"), dict) else {}
    pack_id = metadata.get("outcome_pack")
    if isinstance(pack_id, str) and pack_id.strip():
        return pack_id.strip().lower()
    result_data = run.get("result_data")
    if isinstance(result_data, dict):
        from_result = result_data.get("pack_id")
        if isinstance(from_result, str) and from_result.strip():
            return from_result.strip().lower()
    return None


def _build_replay_request_from_context(context: Dict[str, Any]) -> Dict[str, Any]:
    metadata = context.get("metadata") if isinstance(context.get("metadata"), dict) else {}
    replay_metadata = dict(metadata)
    replay_metadata.pop("credentials", None)
    replay_metadata.pop("access_token", None)
    replay_metadata.pop("api_key", None)
    replay_metadata.pop("secret", None)
    return {
        "engine": context.get("engine") or "orion",
        "workflow_id": context.get("workflow_id"),
        "workspace_id": context.get("workspace_id"),
        "user_goal": context.get("user_goal"),
        "business_plan": context.get("business_plan"),
        "provider": context.get("provider"),
        "model": context.get("model"),
        "credential_id": context.get("credential_id"),
        "agents": context.get("agents") if isinstance(context.get("agents"), list) else [],
        "metadata": replay_metadata,
    }


def _serialize_run_snapshot(run_id: str, run: Dict[str, Any]) -> Dict[str, Any]:
    context = run.get("context") if isinstance(run.get("context"), dict) else {}
    metadata = context.get("metadata") if isinstance(context.get("metadata"), dict) else {}
    usage_masked = run.get("usage_masked") if isinstance(run.get("usage_masked"), dict) else {}
    events = run.get("events") if isinstance(run.get("events"), list) else []
    trimmed_events = events[-min(len(events), ORION_MAX_EVENT_BUFFER):]
    tool_policy_audit = run.get("tool_policy_audit") if isinstance(run.get("tool_policy_audit"), list) else []
    trimmed_tool_policy_audit = tool_policy_audit[-min(len(tool_policy_audit), 500):]
    memory_trace = run.get("memory_trace") if isinstance(run.get("memory_trace"), dict) else {}
    trimmed_memory_trace = _trim_memory_trace(memory_trace)
    result_data = run.get("result_data") if isinstance(run.get("result_data"), dict) else None
    result_summary = run.get("result")
    if isinstance(result_summary, str):
        summary_text = result_summary.strip()
    elif isinstance(result_data, dict) and isinstance(result_data.get("summary"), str):
        summary_text = str(result_data.get("summary")).strip()
    else:
        summary_text = ""

    return {
        "run_id": run_id,
        "engine": run.get("engine", "orion"),
        "status": run.get("status", "unknown"),
        "created_at": run.get("created_at"),
        "updated_at": run.get("updated_at"),
        "completed_at": run.get("completed_at"),
        "duration_ms": run.get("duration_ms"),
        "time_to_first_value_ms": run.get("time_to_first_value_ms"),
        "hitl_wait_total_ms": round(float(run.get("_hitl_wait_total_ms", 0.0)), 2),
        "workflow_id": context.get("workflow_id"),
        "workspace_id": context.get("workspace_id"),
        "pack_id": _pack_id_from_context(run),
        "agent_role": metadata.get("agent_role"),
        "agent_role_source": metadata.get("agent_role_source"),
        "parent_run_id": metadata.get("parent_run_id"),
        "delegation_root_run_id": metadata.get("delegation_root_run_id"),
        "delegated_by_run_id": metadata.get("delegated_by_run_id"),
        "delegated_by_role": metadata.get("delegated_by_role"),
        "delegation_note": metadata.get("delegation_note"),
        "delegation_summary_cache": metadata.get("delegation_summary_cache"),
        "delegation_next_action": metadata.get("delegation_next_action"),
        "delegation_ready": metadata.get("delegation_ready"),
        "retry_of_run_id": metadata.get("retry_of_run_id"),
        "retry_root_run_id": metadata.get("retry_root_run_id"),
        "retry_sequence": metadata.get("retry_sequence"),
        "trust_mode": metadata.get("trust_mode"),
        "execution_target_requested": metadata.get("execution_target_requested"),
        "execution_target_selected": metadata.get("execution_target_selected"),
        "execution_target_reason": metadata.get("execution_target_reason"),
        "execution_target_fallback": metadata.get("execution_target_fallback"),
        "user_goal": context.get("user_goal"),
        "result_summary": summary_text[:5000],
        "usage_masked": usage_masked,
        "usage_provider": usage_masked.get("provider"),
        "usage_model": usage_masked.get("model"),
        "usage_total_tokens_est": usage_masked.get("total_tokens_est"),
        "usage_cost_band": usage_masked.get("cost_band"),
        "result_data": result_data,
        "tool_policy_precheck": metadata.get("tool_policy_precheck"),
        "tool_policy_audit": trimmed_tool_policy_audit,
        "memory_trace": trimmed_memory_trace,
        "dag": run.get("dag"),
        "context": redact_sensitive(context),
        "replay_request": _build_replay_request_from_context(context),
        "events": trimmed_events,
    }


def _archive_run_if_terminal(run_id: str, run: Dict[str, Any]):
    if run.get("_archived"):
        return
    snapshot = _serialize_run_snapshot(run_id, run)
    try:
        upsert_run_history_item(ORION_RUNTIME_STATE_DB, snapshot, ORION_HISTORY_LIMIT)
    except Exception:
        pass
    with RUN_HISTORY_LOCK:
        RUN_HISTORY.insert(0, snapshot)
        del RUN_HISTORY[ORION_HISTORY_LIMIT:]
    run["_archived"] = True


def _refresh_archived_run_snapshot(run_id: str, run: Dict[str, Any]) -> None:
    if not run.get("_archived"):
        return
    snapshot = _serialize_run_snapshot(run_id, run)
    try:
        upsert_run_history_item(ORION_RUNTIME_STATE_DB, snapshot, ORION_HISTORY_LIMIT)
    except Exception:
        pass
    with RUN_HISTORY_LOCK:
        for idx, item in enumerate(RUN_HISTORY):
            if str(item.get("run_id") or "").strip() == run_id:
                RUN_HISTORY[idx] = snapshot
                break


def _upsert_run_history_snapshot(snapshot: Dict[str, Any]) -> None:
    run_id = str(snapshot.get("run_id") or "").strip()
    if not run_id:
        return
    try:
        upsert_run_history_item(ORION_RUNTIME_STATE_DB, snapshot, ORION_HISTORY_LIMIT)
    except Exception:
        pass
    with RUN_HISTORY_LOCK:
        for idx, item in enumerate(RUN_HISTORY):
            if str(item.get("run_id") or "").strip() == run_id:
                RUN_HISTORY[idx] = snapshot
                break
        else:
            RUN_HISTORY.insert(0, snapshot)
            del RUN_HISTORY[ORION_HISTORY_LIMIT:]


def _load_run_history():
    items: List[Dict[str, Any]] = []
    try:
        items = list_run_history(ORION_RUNTIME_STATE_DB, ORION_HISTORY_LIMIT)
    except Exception:
        items = []
    if not items:
        # One-time fallback for older local installs that only have JSON state.
        payload = _safe_read_json(ORION_HISTORY_FILE, {"version": 1, "items": []})
        raw_items = payload.get("items")
        if isinstance(raw_items, list):
            for item in raw_items[:ORION_HISTORY_LIMIT]:
                if isinstance(item, dict) and isinstance(item.get("run_id"), str):
                    items.append(item)
        if items:
            try:
                replace_run_history(ORION_RUNTIME_STATE_DB, items, ORION_HISTORY_LIMIT)
            except Exception:
                pass
    with RUN_HISTORY_LOCK:
        RUN_HISTORY.clear()
        for item in items[:ORION_HISTORY_LIMIT]:
            RUN_HISTORY.append(item)


def _persist_approval_audit():
    with APPROVAL_AUDIT_LOCK:
        payload = {
            "version": 1,
            "updated_at": _utc_now_iso(),
            "items": APPROVAL_AUDIT[:ORION_APPROVAL_AUDIT_LIMIT],
        }
    _safe_write_json(ORION_APPROVAL_AUDIT_FILE, payload)


def _load_approval_audit():
    payload = _safe_read_json(ORION_APPROVAL_AUDIT_FILE, {"version": 1, "items": []})
    items = payload.get("items")
    if not isinstance(items, list):
        return
    with APPROVAL_AUDIT_LOCK:
        APPROVAL_AUDIT.clear()
        for item in items[:ORION_APPROVAL_AUDIT_LIMIT]:
            if not isinstance(item, dict):
                continue
            approval_id = str(item.get("approval_id") or "").strip()
            if not approval_id:
                continue
            APPROVAL_AUDIT.append(
                {
                    "id": str(item.get("id") or uuid.uuid4()),
                    "ts": str(item.get("ts") or _utc_now_iso()),
                    "correlation_id": str(item.get("correlation_id") or "").strip(),
                    "approval_id": approval_id,
                    "run_id": str(item.get("run_id") or "").strip(),
                    "event_id": str(item.get("event_id") or "").strip(),
                    "stage": str(item.get("stage") or "").strip().lower(),
                    "decision": str(item.get("decision") or "").strip().lower(),
                    "actor": str(item.get("actor") or "").strip().lower(),
                    "source": str(item.get("source") or "").strip().lower(),
                    "note": _compact_event_text(item.get("note"), limit=300),
                    "metadata": _json_safe(item.get("metadata") if isinstance(item.get("metadata"), dict) else {}),
                }
            )


def _approval_correlation_id(approval_id: str, run_id: Optional[str] = None, event_id: Optional[str] = None) -> str:
    token = str(approval_id or "").strip()[:8]
    run_token = str(run_id or "").strip()[:8]
    event_token = str(event_id or "").strip()[:8]
    if run_token:
        return f"run:{run_token}:{token}"
    if event_token:
        return f"event:{event_token}:{token}"
    return f"approval:{token}"


def _append_approval_audit(
    *,
    approval_id: str,
    stage: str,
    decision: str = "",
    actor: str = "system",
    source: str = "runtime",
    run_id: Optional[str] = None,
    event_id: Optional[str] = None,
    note: str = "",
    correlation_id: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    aid = str(approval_id or "").strip()
    if not aid:
        return {}
    corr = str(correlation_id or "").strip() or _approval_correlation_id(aid, run_id=run_id, event_id=event_id)
    item = {
        "id": str(uuid.uuid4()),
        "ts": _utc_now_iso(),
        "correlation_id": corr,
        "approval_id": aid,
        "run_id": str(run_id or "").strip(),
        "event_id": str(event_id or "").strip(),
        "stage": str(stage or "").strip().lower(),
        "decision": str(decision or "").strip().lower(),
        "actor": str(actor or "").strip().lower() or "system",
        "source": str(source or "").strip().lower() or "runtime",
        "note": _compact_event_text(note, limit=300),
        "metadata": _json_safe(metadata if isinstance(metadata, dict) else {}),
    }
    with APPROVAL_AUDIT_LOCK:
        APPROVAL_AUDIT.insert(0, item)
        del APPROVAL_AUDIT[ORION_APPROVAL_AUDIT_LIMIT:]
    _persist_approval_audit()
    return item


def _begin_run_pending_approval(
    run_id: str,
    prompt: str,
    *,
    source: str = "runtime",
    metadata: Optional[Dict[str, Any]] = None,
    emit_pause_required: bool = False,
) -> Dict[str, Any]:
    run = runs.get(run_id)
    if not isinstance(run, dict):
        raise RuntimeError("Run ID not found.")
    context = run.get("context")
    context_metadata = {}
    if isinstance(context, dict):
        raw_metadata = context.get("metadata")
        if isinstance(raw_metadata, dict):
            context_metadata = raw_metadata
    configured_ttl = context_metadata.get("approval_ttl_seconds") if isinstance(context_metadata, dict) else None
    ttl_seconds = ORION_APPROVAL_TTL_SECONDS
    if isinstance(configured_ttl, (int, float)):
        ttl_seconds = int(configured_ttl)
    ttl_seconds = max(30, min(1800, ttl_seconds))
    requested_at = _utc_now_iso()
    expires_at = (_utc_now() + timedelta(seconds=ttl_seconds)).isoformat().replace("+00:00", "Z")
    approval_id = str(uuid.uuid4())
    correlation_id = _approval_correlation_id(approval_id, run_id=run_id)
    payload = {
        "approval_id": approval_id,
        "correlation_id": correlation_id,
        "status": "waiting",
        "requested_at": requested_at,
        "expires_at": expires_at,
        "prompt": prompt,
        "ttl_seconds": ttl_seconds,
        "metadata": _json_safe(metadata if isinstance(metadata, dict) else {}),
    }
    run["pending_approval"] = payload
    emit_log(
        run["logs"],
        "warn",
        prompt,
        event="approval_requested",
        data={
            "approval_id": approval_id,
            "correlation_id": correlation_id,
            "ttl_seconds": ttl_seconds,
            "expires_at": expires_at,
            **(_json_safe(metadata) if isinstance(metadata, dict) else {}),
        },
    )
    _append_approval_audit(
        approval_id=approval_id,
        stage="requested",
        actor="system",
        source=source,
        run_id=run_id,
        note=prompt,
        correlation_id=correlation_id,
        metadata={"ttl_seconds": ttl_seconds, "expires_at": expires_at, **(metadata or {})},
    )
    emit_log(
        run["logs"],
        "info",
        "Approval request is waiting for user resolution.",
        event="approval_waiting",
        data={
            "approval_id": approval_id,
            "correlation_id": correlation_id,
            "ttl_seconds": ttl_seconds,
            "expires_at": expires_at,
        },
    )
    _append_approval_audit(
        approval_id=approval_id,
        stage="waiting",
        actor="system",
        source=source,
        run_id=run_id,
        correlation_id=correlation_id,
    )
    set_run_status(run_id, "waiting_for_input")
    if emit_pause_required:
        run["logs"].put("__PAUSE_REQUIRED__")
    return payload


def _json_safe(value: Any) -> Any:
    try:
        return json.loads(json.dumps(value, default=str))
    except Exception:
        return str(value)


def _compact_event_text(value: Any, limit: int = 800) -> str:
    text = re.sub(r"\s+", " ", str(value or "")).strip()
    if len(text) <= limit:
        return text
    return text[: max(1, limit - 1)].rstrip() + "…"


configure_runtime_model_context(
    memory_max_text_chars=ORION_MEMORY_MAX_TEXT_CHARS,
    normalize_memory_bucket=_normalize_memory_bucket,
    normalize_action_id=normalize_action_id,
    provider_catalog=PROVIDER_CATALOG,
    connector_catalog=CONNECTOR_CATALOG,
)
def _cognitive_defaults() -> Dict[str, str]:
    niche_id = str(os.getenv("ORION_COGNITIVE_NICHE_ID") or "astronomy").strip() or "astronomy"
    db_override = str(os.getenv("ORION_COGNITIVE_DB_PATH") or "").strip()
    if db_override:
        db_path = db_override
    else:
        db_path = str(Path(__file__).resolve().parent / "python_engine" / "agency_memory.db")
    return {"niche_id": niche_id, "db_path": db_path}


def _cognitive_daemon_module():
    try:
        from python_engine import cognitive_daemon as _cd  # type: ignore
        return _cd
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"cognitive_daemon_unavailable: {exc}") from exc


def _persist_weekly_schedules():
    with SCHEDULES_LOCK:
        payload = {
            "version": 1,
            "updated_at": datetime.utcnow().isoformat() + "Z",
            "items": list(WEEKLY_SCHEDULES.values()),
        }
    _safe_write_json(ORION_SCHEDULES_FILE, payload)


def _load_weekly_schedules():
    payload = _safe_read_json(ORION_SCHEDULES_FILE, {"version": 1, "items": []})
    items = payload.get("items")
    if not isinstance(items, list):
        return
    with SCHEDULES_LOCK:
        WEEKLY_SCHEDULES.clear()
        for item in items:
            if not isinstance(item, dict):
                continue
            schedule_id = item.get("id")
            if isinstance(schedule_id, str) and schedule_id.strip():
                WEEKLY_SCHEDULES[schedule_id] = item


def _schedule_now_snapshot(now: datetime, tz_mode: str) -> Dict[str, Any]:
    if tz_mode == "utc":
        current = now.astimezone(timezone.utc)
    else:
        current = now.astimezone()
    return {
        "weekday": current.strftime("%A"),
        "hhmm": current.strftime("%H:%M"),
        "date_key": current.strftime("%Y-%m-%d"),
    }


def set_run_status(run_id: str, status: str):
    run = runs.get(run_id)
    if not run:
        return
    context = run.get("context") if isinstance(run.get("context"), dict) else {}
    metadata = context.get("metadata") if isinstance(context.get("metadata"), dict) else {}
    parent_run_id = _normalize_run_id_token(metadata.get("parent_run_id")) if isinstance(metadata, dict) else None
    previous = run.get("status")
    now_mono = time.monotonic()

    if previous == "waiting_for_input" and status != "waiting_for_input":
        wait_start = run.get("_hitl_wait_start_mono")
        if isinstance(wait_start, (int, float)):
            waited_ms = max(0.0, (now_mono - wait_start) * 1000.0)
            run["_hitl_wait_total_ms"] = run.get("_hitl_wait_total_ms", 0.0) + waited_ms
            metrics_add("hitl_wait_sum_ms", waited_ms)
            metrics_inc("hitl_wait_count", 1)
            run["_hitl_wait_start_mono"] = None

    if status == "waiting_for_input":
        run["_hitl_wait_start_mono"] = now_mono
        metrics_inc("runs_waiting_for_input", 1)

    if status in ["completed", "failed", "timeout"] and run.get("_finished_mono") is None:
        run["_finished_mono"] = now_mono
        started = run.get("_started_mono")
        if isinstance(started, (int, float)):
            duration_ms = max(0.0, (now_mono - started) * 1000.0)
            run["duration_ms"] = round(duration_ms, 2)
            metrics_add("run_duration_sum_ms", duration_ms)
            metrics_inc("run_duration_count", 1)
        run["completed_at"] = datetime.utcnow().isoformat() + "Z"
        if status == "completed":
            metrics_inc("runs_completed", 1)
        elif status == "failed":
            metrics_inc("runs_failed", 1)
        elif status == "timeout":
            metrics_inc("runs_timeout", 1)

    run["status"] = status
    run["updated_at"] = datetime.utcnow().isoformat() + "Z"
    if status in ["completed", "failed", "timeout"]:
        with LOCAL_QUEUE_LOCK:
            if run_id in LOCAL_PENDING_RUN_IDS:
                LOCAL_PENDING_RUN_IDS[:] = [rid for rid in LOCAL_PENDING_RUN_IDS if rid != run_id]
            LOCAL_CLAIMED_RUNS.pop(run_id, None)
        _archive_run_if_terminal(run_id, run)
        log_queue = run.get("logs")
        if log_queue is not None:
            RUN_QUEUE_INDEX.pop(id(log_queue), None)
    if parent_run_id and status in TERMINAL_RUN_STATUSES:
        _refresh_parent_delegation_state(parent_run_id, triggering_run_id=run_id)

# --- LOGGING UTILITY ---
def emit_log(log_queue, level: str, message: str, event: str = "runtime", data: Optional[dict] = None):
    payload = {
        "event_id": str(uuid.uuid4()),
        "ts": datetime.utcnow().isoformat() + "Z",
        "level": level,
        "event": event,
        "message": message,
    }
    if data:
        payload["data"] = data
    run_id = RUN_QUEUE_INDEX.get(id(log_queue))
    if run_id:
        run = runs.get(run_id)
        if isinstance(run, dict):
            seq = int(run.get("_event_seq", 0)) + 1
            run["_event_seq"] = seq
            payload["seq"] = seq
            payload["run_id"] = run_id
            events = run.setdefault("events", [])
            if isinstance(events, list):
                events.append(payload)
                if len(events) > ORION_MAX_EVENT_BUFFER:
                    del events[: len(events) - ORION_MAX_EVENT_BUFFER]
    log_queue.put(payload)

class LogStreamer:
    def __init__(self, log_queue):
        self.log_queue = log_queue
    def write(self, text):
        cleaned = text.strip()
        if cleaned:
            emit_log(self.log_queue, "info", cleaned, event="stdout")
    def flush(self):
        pass

def require_api_key(
    request: Request,
    x_api_key: str = Header(None),
    authorization: str = Header(None),
):
    if not ORION_AUTH_REQUIRED:
        return

    api_key = x_api_key or request.query_params.get("api_key")
    if not api_key and authorization and authorization.lower().startswith("bearer "):
        api_key = authorization[7:].strip()

    if not ORION_API_KEY:
        raise HTTPException(status_code=503, detail="Auth required but ORION_API_KEY is not configured.")

    if not api_key or api_key != ORION_API_KEY:
        raise HTTPException(status_code=401, detail="Invalid API key")


def http_json_request(
    url: str,
    method: str = "GET",
    headers: Optional[Dict[str, str]] = None,
    payload: Optional[Dict[str, Any]] = None,
    timeout: int = PROVIDER_TIMEOUT_SECONDS,
) -> Dict[str, Any]:
    body = json.dumps(payload).encode("utf-8") if payload is not None else None
    req = urlrequest.Request(url, data=body, headers=headers or {}, method=method)
    context = ssl.create_default_context(cafile=certifi.where())

    def _open():
        if ORION_ALLOW_SYSTEM_PROXY:
            return urlrequest.urlopen(req, timeout=timeout, context=context)
        # Disable system/env proxy auto-discovery for deterministic local runtime behavior.
        if str(url).lower().startswith("https://"):
            opener = urlrequest.build_opener(
                urlrequest.ProxyHandler({}),
                urlrequest.HTTPSHandler(context=context),
            )
        else:
            opener = urlrequest.build_opener(
                urlrequest.ProxyHandler({}),
                urlrequest.HTTPHandler(),
            )
        return opener.open(req, timeout=timeout)

    try:
        with _open() as resp:
            raw = resp.read().decode("utf-8", errors="ignore")
            parsed = None
            if raw:
                try:
                    parsed = json.loads(raw)
                except Exception:
                    parsed = None
            return {"status": resp.status, "text": raw, "json": parsed}
    except urlerror.HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="ignore") if hasattr(exc, "read") else ""
        detail = raw or str(exc)
        try:
            parsed = json.loads(raw) if raw else None
            if isinstance(parsed, dict):
                err_obj = parsed.get("error")
                if isinstance(err_obj, dict):
                    msg = str(err_obj.get("message") or "").strip()
                    err_type = str(err_obj.get("type") or "").strip()
                    if msg:
                        detail = msg
                        if err_type:
                            detail = f"{detail} ({err_type})"
        except Exception:
            pass
        raise RuntimeError(f"HTTP {exc.code}: {detail}") from exc
    except Exception as exc:
        raise RuntimeError(str(exc)) from exc

_normalize_workspace_id = _normalize_workspace_id_impl
_workspace_visible = _workspace_visible_impl
_parse_iso_datetime = _parse_iso_datetime_impl
_credential_identity = _credential_identity_impl
_sanitize_bearer_token = _sanitize_bearer_token_impl
_openai_bearer_from_credentials = _openai_bearer_from_credentials_impl

list_vault_credentials = lambda workspace_id=None: _list_vault_credentials_impl(load_vault, CONNECTOR_CATALOG, workspace_id)
list_vault_connectors = lambda workspace_id=None: _list_vault_connectors_impl(load_vault, CONNECTOR_CATALOG, workspace_id)
resolve_vault_credential = lambda credential_id, workspace_id=None: _resolve_vault_credential_impl(load_vault, _openssl_decrypt, credential_id, workspace_id)
resolve_default_vault_credential = lambda provider, workspace_id=None: _resolve_default_vault_credential_impl(load_vault, _openssl_decrypt, provider, workspace_id)
_codex_token_from_vault = lambda: _codex_token_from_vault_impl(CODEX_AUTH_FILE, _safe_read_json)

validate_google_workspace_connector = lambda credentials: _validate_google_workspace_connector(credentials, http_json_request)
validate_microsoft_365_connector = lambda credentials: _validate_microsoft_365_connector(credentials, http_json_request)
validate_telegram_connector = lambda credentials: _validate_telegram_connector(credentials, http_json_request)
validate_whatsapp_twilio_connector = lambda credentials: _validate_whatsapp_twilio_connector(credentials, http_json_request)
validate_discord_bot_connector = lambda credentials: _validate_discord_bot_connector(credentials, http_json_request)
validate_instagram_business_connector = lambda credentials: _validate_instagram_business_connector(credentials, http_json_request)
validate_irc_connector = lambda credentials: _validate_irc_connector(credentials)


def list_recent_connector_messages(
    credentials: Dict[str, Any],
    *,
    limit: int = 3,
) -> List[Dict[str, Any]]:
    provider = str(credentials.get("_provider") or "").strip().lower()
    safe_limit = max(1, min(int(limit or 3), 10))
    if provider == "google_workspace":
        if google_workspace_uses_local_cli(credentials):
            return google_workspace_local_list_recent_messages(credentials, limit=safe_limit)

        listing = http_json_request(
            "https://gmail.googleapis.com/gmail/v1/users/me/messages",
            headers={"Authorization": f"Bearer {str(credentials.get('access_token') or '').strip()}"},
            payload=None,
            timeout=20,
        )
        body = listing.get("json") if isinstance(listing.get("json"), dict) else {}
        messages = body.get("messages") if isinstance(body.get("messages"), list) else []
        out: List[Dict[str, Any]] = []
        for item in messages[:safe_limit]:
            if not isinstance(item, dict):
                continue
            message_id = str(item.get("id") or "").strip()
            if not message_id:
                continue
            detail = http_json_request(
                f"https://gmail.googleapis.com/gmail/v1/users/me/messages/{quote_plus(message_id)}?format=full",
                headers={"Authorization": f"Bearer {str(credentials.get('access_token') or '').strip()}"},
                payload=None,
                timeout=20,
            )
            payload = detail.get("json") if isinstance(detail.get("json"), dict) else {}
            out.append(_gmail_message_summary(payload, message_id))
        return out

    if provider == "microsoft_365":
        payload = microsoft_graph_request(
            http_json_request,
            credentials,
            f"/me/mailFolders/inbox/messages?$top={safe_limit}&$select=id,subject,receivedDateTime,bodyPreview,from",
        )
        items = payload.get("value") if isinstance(payload.get("value"), list) else []
        return [
            {
                "id": item.get("id"),
                "threadId": None,
                "snippet": str(item.get("bodyPreview") or "").strip(),
                "subject": str(item.get("subject") or "").strip(),
                "from": str((((item.get("from") or {}).get("emailAddress") or {}).get("address")) or "").strip()
                if isinstance(item, dict)
                else "",
                "to": "",
                "date": str(item.get("receivedDateTime") or "").strip() if isinstance(item, dict) else "",
            }
            for item in items
            if isinstance(item, dict)
        ]

    raise RuntimeError(f"Recent message listing is unavailable for connector '{provider or 'unknown'}'.")


def _openai_env_bearer_with_source() -> tuple[str, str]:
    return _openai_env_bearer_with_source_impl(
        codex_oauth_token=CODEX_OAUTH_TOKEN,
        openai_oauth_token=OPENAI_OAUTH_TOKEN,
        openai_access_token=OPENAI_ACCESS_TOKEN,
        codex_vault_token=_codex_token_from_vault(),
        disable_openai_api_key=ORION_DISABLE_OPENAI_API_KEY,
        auth_mode=ORION_AUTH_MODE,
    )


configure_runtime_memory(
    memory_enabled=ORION_MEMORY_ENABLED,
    memory_lancedb_uri=ORION_MEMORY_LANCEDB_URI,
    memory_db_path=ORION_MEMORY_DB_PATH,
    memory_read_k=ORION_MEMORY_READ_K,
    memory_retention_days_default=ORION_MEMORY_RETENTION_DAYS_DEFAULT,
    memory_max_text_chars=ORION_MEMORY_MAX_TEXT_CHARS,
    memory_buckets=MEMORY_BUCKETS,
    runtime_memory_manager=RuntimeMemoryManager,
    utc_now=_utc_now,
    utc_now_iso=_utc_now_iso,
    parse_utc_ts=_parse_utc_ts,
    normalize_workspace_id=_normalize_workspace_id,
    json_safe=_json_safe,
    compact_event_text=_compact_event_text,
    emit_log=emit_log,
    refresh_archived_run_snapshot=_refresh_archived_run_snapshot,
)

configure_runtime_events(
    channel_events=CHANNEL_EVENTS,
    channel_events_lock=CHANNEL_EVENTS_LOCK,
    channel_events_limit=ORION_CHANNEL_EVENTS_LIMIT,
    channel_sessions_limit=ORION_CHANNEL_SESSIONS_LIMIT,
    channel_events_file=ORION_CHANNEL_EVENTS_FILE,
    runtime_state_db=ORION_RUNTIME_STATE_DB,
    list_channel_events_fn=list_channel_events,
    replace_channel_events_fn=replace_channel_events,
    append_channel_event_fn=append_channel_event,
    utc_now_iso=_utc_now_iso,
    parse_utc_ts=_parse_utc_ts,
    normalize_workspace_id=_normalize_workspace_id,
    compact_event_text=_compact_event_text,
    json_safe=_json_safe,
    safe_read_json=_safe_read_json,
)

register_run_routes(app)
register_inbox_routes(app)
register_agent_workspace_routes(app)
register_profile_routes(app)
register_app_registry_routes(app)
def format_agent_summary(agents: Any) -> str:
    if not isinstance(agents, list) or not agents:
        return "- none"

    lines: List[str] = []
    for agent in agents:
        if not isinstance(agent, dict):
            continue
        role = str(agent.get("role") or "Worker")
        model = str(agent.get("modelId") or "unknown-model")
        provider = str(agent.get("provider") or "unknown-provider")
        duty = str(agent.get("duty") or agent.get("description") or "").strip()
        if duty:
            lines.append(f"- {role} ({provider}:{model}) duty={duty[:120]}")
        else:
            lines.append(f"- {role} ({provider}:{model})")
    return "\n".join(lines) if lines else "- none"


def resolve_run_execution_context(context: Dict[str, Any]):
    metadata = context.get("metadata") if isinstance(context.get("metadata"), dict) else {}
    provider = normalize_provider_id(context.get("provider") or metadata.get("provider") or "openai")
    if provider not in PROVIDER_CATALOG:
        raise RuntimeError(f"Unsupported provider '{provider}'")

    workspace_id = context.get("workspace_id") or metadata.get("workspace_id")
    credential_id = context.get("credential_id") or metadata.get("credential_id")
    selected_model = (
        context.get("model")
        or metadata.get("model")
        or PROVIDER_CATALOG.get(provider, {}).get("default_model")
        or CODEX_MODEL
    )
    candidate_context = dict(context)
    candidate_context["credential_id"] = credential_id
    candidate_context["workspace_id"] = workspace_id
    candidates = _build_provider_credential_candidates(candidate_context, metadata, provider)
    if not candidates:
        raise RuntimeError(f"No credentials available for provider '{provider}'.")

    return provider, str(selected_model), candidates, metadata


def generate_with_candidate_failover(
    state: Dict[str, Any],
    context: Dict[str, Any],
    log_queue: queue.Queue,
    system_prompt: str,
    user_input: str,
) -> str:
    provider = str(state.get("provider") or "openai").strip().lower()
    default_model = str(state.get("selected_model") or CODEX_MODEL).strip() or CODEX_MODEL
    candidates = state.get("credential_candidates") if isinstance(state.get("credential_candidates"), list) else []
    if not candidates:
        raise RuntimeError(f"No credentials available for provider '{provider}'.")

    last_error: Optional[Exception] = None
    for idx, candidate in enumerate(candidates):
        if not isinstance(candidate, dict):
            continue
        credentials = candidate.get("credentials") if isinstance(candidate.get("credentials"), dict) else {}
        if not credentials:
            continue
        model = str(candidate.get("model") or default_model).strip() or default_model
        profile_id = str(candidate.get("profile_id") or "").strip() or None
        source = str(candidate.get("source") or "unknown").strip()
        try:
            resolved_provider, adapter_key, adapter = resolve_provider_adapter(provider, credentials)
            text = adapter.generate(system_prompt, user_input, model, credentials)
            if profile_id:
                _mark_profile_success(profile_id)
            state["active_candidate_index"] = idx
            state["active_profile_id"] = profile_id
            state["active_model"] = model
            state["active_provider"] = resolved_provider
            state["active_adapter"] = adapter_key
            state["credentials"] = credentials
            if idx > 0:
                emit_log(
                    log_queue,
                    "warn",
                    f"Provider failover succeeded using candidate {idx + 1} ({source}).",
                    event="profile_failover",
                    data={"provider": provider, "profile_id": profile_id, "candidate_index": idx, "source": source},
                )
            return text
        except Exception as exc:
            last_error = exc
            raw_error = str(exc)
            if profile_id:
                _mark_profile_failure(profile_id, raw_error)
            emit_log(
                log_queue,
                "warn",
                f"Provider candidate failed ({source}): {friendly_runtime_error_message(exc)}",
                event="profile_candidate_failed",
                data={
                    "provider": provider,
                    "profile_id": profile_id,
                    "candidate_index": idx,
                    "source": source,
                    "error": raw_error[:800],
                },
            )
            continue
    if last_error is not None:
        raise last_error
    raise RuntimeError(f"No usable credentials remained for provider '{provider}'.")


def requires_human_approval(context: Dict[str, Any], plan_text: str) -> tuple[bool, str]:
    metadata = context.get("metadata") if isinstance(context.get("metadata"), dict) else {}
    trust_mode = normalize_trust_mode(metadata.get("trust_mode"))
    if trust_mode == TRUST_MODE_AUTO:
        return False, ""
    if trust_mode == TRUST_MODE_STRICT:
        return True, "Strict mode requires explicit approval before execution."

    raw = " ".join(
        [
            str(context.get("user_goal") or ""),
            str(context.get("business_plan") or ""),
            str(plan_text or ""),
        ]
    ).lower()

    matched = [kw for kw in RISKY_ACTION_KEYWORDS if kw in raw]
    if trust_mode == TRUST_MODE_SENSITIVE_GUARD:
        if matched:
            return True, f"Sensitive Guard detected sensitive actions ({', '.join(sorted(set(matched))[:4])})."
        return False, ""
    if trust_mode == TRUST_MODE_COST_GUARD:
        if len(matched) >= 2:
            return True, f"Cost Guard detected multiple potentially expensive actions ({', '.join(sorted(set(matched))[:4])})."
        return False, ""
    if matched:
        return True, f"Potentially risky actions detected ({', '.join(sorted(set(matched))[:4])})."
    return False, ""


def wait_for_human_decision(run_id: str, prompt: str) -> bool:
    run = runs[run_id]
    pending_payload = _begin_run_pending_approval(
        run_id,
        prompt,
        source="runtime_wait",
        emit_pause_required=True,
    )
    approval_id = str(pending_payload.get("approval_id") or "").strip()
    correlation_id = str(pending_payload.get("correlation_id") or "").strip()
    ttl_seconds = int(pending_payload.get("ttl_seconds") or ORION_APPROVAL_TTL_SECONDS)
    approve_tokens = {"proceed", "approve", "yes", "y", "continue", "ok"}
    reject_tokens = {"hold", "reject", "no", "n", "abort", "stop", "cancel"}
    escalate_tokens = {"escalate", "escalated"}
    deadline = time.monotonic() + ttl_seconds
    while True:
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            pending = run.get("pending_approval") if isinstance(run.get("pending_approval"), dict) else {}
            pending["status"] = "expired"
            pending["expired_at"] = _utc_now_iso()
            run["pending_approval"] = pending
            emit_log(
                run["logs"],
                "error",
                "Approval request expired before user decision.",
                event="approval_timeout",
                data={"approval_id": approval_id, "correlation_id": correlation_id, "ttl_seconds": ttl_seconds},
            )
            _append_approval_audit(
                approval_id=approval_id,
                stage="timeout",
                decision="timeout",
                actor="system",
                source="runtime_wait",
                run_id=run_id,
                note="Approval timeout reached while waiting for user decision.",
                correlation_id=correlation_id,
            )
            raise RuntimeError("Approval timeout reached while waiting for user decision.")
        try:
            decision_raw = run["input_queue"].get(timeout=remaining)
        except queue.Empty:
            continue

        incoming_approval_id: Optional[str] = None
        decision_text = ""
        if isinstance(decision_raw, dict):
            incoming_approval_id = str(decision_raw.get("approval_id") or "").strip() or None
            decision_text = str(decision_raw.get("decision") or "").strip().lower()
        else:
            decision_text = str(decision_raw or "").strip().lower()

        if incoming_approval_id and incoming_approval_id != approval_id:
            emit_log(
                run["logs"],
                "warn",
                "Ignored stale approval resolution for different approval_id.",
                event="approval_ignored",
                data={
                    "approval_id": incoming_approval_id,
                    "expected_approval_id": approval_id,
                    "correlation_id": correlation_id,
                },
            )
            _append_approval_audit(
                approval_id=incoming_approval_id,
                stage="ignored",
                decision="ignored",
                actor="runtime",
                source="runtime_wait",
                run_id=run_id,
                note=f"Expected approval_id={approval_id}",
                correlation_id=correlation_id,
                metadata={"expected_approval_id": approval_id},
            )
            continue

        pending = run.get("pending_approval") if isinstance(run.get("pending_approval"), dict) else {}
        pending["status"] = "resolved"
        pending["resolved_at"] = _utc_now_iso()
        pending["decision"] = decision_text
        run["pending_approval"] = pending
        set_run_status(run_id, "running")
        emit_log(
            run["logs"],
            "info",
            f"Decision received: {decision_text}",
            event="approval_received",
            data={"approval_id": approval_id, "correlation_id": correlation_id, "decision": decision_text},
        )
        _append_approval_audit(
            approval_id=approval_id,
            stage="received",
            decision=decision_text,
            actor="user",
            source="runtime_wait",
            run_id=run_id,
            note=str(decision_raw),
            correlation_id=correlation_id,
        )

        approved = decision_text in approve_tokens
        rejected = decision_text in reject_tokens
        escalated = decision_text in escalate_tokens
        if not approved and not rejected and not escalated:
            rejected = True
        emit_log(
            run["logs"],
            "info" if approved else "warn",
            "Approval resolved.",
            event="approval_resolved",
            data={
                "approval_id": approval_id,
                "correlation_id": correlation_id,
                "decision": decision_text,
                "approved": approved,
                "rejected": bool(rejected),
                "escalated": bool(escalated),
            },
        )
        _append_approval_audit(
            approval_id=approval_id,
            stage="resolved",
            decision=("approved" if approved else "escalated" if escalated else "rejected"),
            actor="runtime",
            source="runtime_wait",
            run_id=run_id,
            correlation_id=correlation_id,
            metadata={
                "raw_decision": decision_text,
                "approved": bool(approved),
                "rejected": bool(rejected),
                "escalated": bool(escalated),
            },
        )
        run["pending_approval"] = None
        return approved


def validate_orion_runtime() -> List[str]:
    errors: List[str] = []
    if ORION_RUN_TIMEOUT_SECONDS <= 0:
        errors.append("ORION_RUN_TIMEOUT_SECONDS must be > 0.")
    if ORION_MAX_RETRIES < 0:
        errors.append("ORION_MAX_RETRIES cannot be negative.")
    if ORION_RETRY_BACKOFF_SECONDS < 0:
        errors.append("ORION_RETRY_BACKOFF_SECONDS cannot be negative.")
    if ORION_MAX_EVENT_BUFFER <= 0:
        errors.append("ORION_MAX_EVENT_BUFFER must be > 0.")
    if ORION_HISTORY_LIMIT <= 0:
        errors.append("ORION_HISTORY_LIMIT must be > 0.")
    if ORION_CHANNEL_EVENTS_LIMIT <= 0:
        errors.append("ORION_CHANNEL_EVENTS_LIMIT must be > 0.")
    if ORION_SCHEDULER_POLL_SECONDS < 5:
        errors.append("ORION_SCHEDULER_POLL_SECONDS must be >= 5.")
    if ORION_APPROVAL_TTL_SECONDS < 30:
        errors.append("ORION_APPROVAL_TTL_SECONDS must be >= 30.")
    if ORION_SETUP_SESSION_TTL_SECONDS < 300:
        errors.append("ORION_SETUP_SESSION_TTL_SECONDS must be >= 300.")
    if ORION_IDEMPOTENCY_TTL_SECONDS < 60:
        errors.append("ORION_IDEMPOTENCY_TTL_SECONDS must be >= 60.")
    if CONTROL_PLANE_RATE_LIMIT_PER_MINUTE <= 0:
        errors.append("CONTROL_PLANE_RATE_LIMIT_PER_MINUTE must be > 0.")
    if CONTROL_PLANE_RATE_LIMIT_BURST < 0:
        errors.append("CONTROL_PLANE_RATE_LIMIT_BURST cannot be negative.")
    if ORION_TELEGRAM_AUTOPILOT_POLL_SECONDS < 1:
        errors.append("ORION_TELEGRAM_AUTOPILOT_POLL_SECONDS must be >= 1.")
    if ORION_TELEGRAM_AUTOPILOT_MAX_UPDATES <= 0:
        errors.append("ORION_TELEGRAM_AUTOPILOT_MAX_UPDATES must be > 0.")
    if ORION_TELEGRAM_AUTOPILOT_MAX_UPDATES > 100:
        errors.append("ORION_TELEGRAM_AUTOPILOT_MAX_UPDATES must be <= 100.")
    if ORION_TELEGRAM_AUTOPILOT_RUN_TIMEOUT_SECONDS < 30:
        errors.append("ORION_TELEGRAM_AUTOPILOT_RUN_TIMEOUT_SECONDS must be >= 30.")
    if ORION_TELEGRAM_AUTOPILOT_MAX_REPLY_CHARS < 120:
        errors.append("ORION_TELEGRAM_AUTOPILOT_MAX_REPLY_CHARS must be >= 120.")
    if ORION_TELEGRAM_AUTOPILOT_MAX_REPLY_CHARS > 6000:
        errors.append("ORION_TELEGRAM_AUTOPILOT_MAX_REPLY_CHARS must be <= 6000.")
    target_raw = str(ORION_TELEGRAM_AUTOPILOT_EXECUTION_TARGET or "").strip().lower()
    valid_target_inputs = VALID_EXECUTION_TARGETS.union(
        {"local", "local-worker", "local_worker", "companion", "localcompanion", "server", "managed", "hybrid"}
    )
    if target_raw and target_raw not in valid_target_inputs:
        errors.append("ORION_TELEGRAM_AUTOPILOT_EXECUTION_TARGET is invalid.")
    trust_raw = str(ORION_TELEGRAM_AUTOPILOT_TRUST_MODE or "").strip().lower()
    valid_trust_inputs = set(TRUST_MODE_ALIASES.keys()).union(VALID_TRUST_MODES)
    if trust_raw and trust_raw not in valid_trust_inputs:
        errors.append("ORION_TELEGRAM_AUTOPILOT_TRUST_MODE is invalid.")
    if ORION_TELEGRAM_AUTOPILOT_PROFILE and ORION_TELEGRAM_AUTOPILOT_PROFILE not in TELEGRAM_AUTOPILOT_PROFILE_CATALOG:
        errors.append("ORION_TELEGRAM_AUTOPILOT_PROFILE is invalid.")
    if ORION_TELEGRAM_AUTOPILOT_ENGINE and ORION_TELEGRAM_AUTOPILOT_ENGINE not in ENGINE_REGISTRY:
        errors.append("ORION_TELEGRAM_AUTOPILOT_ENGINE is invalid.")
    if ORION_WHATSAPP_AUTOPILOT_RUN_TIMEOUT_SECONDS < 30:
        errors.append("ORION_WHATSAPP_AUTOPILOT_RUN_TIMEOUT_SECONDS must be >= 30.")
    if ORION_WHATSAPP_AUTOPILOT_MAX_REPLY_CHARS < 120:
        errors.append("ORION_WHATSAPP_AUTOPILOT_MAX_REPLY_CHARS must be >= 120.")
    if ORION_WHATSAPP_AUTOPILOT_MAX_REPLY_CHARS > 6000:
        errors.append("ORION_WHATSAPP_AUTOPILOT_MAX_REPLY_CHARS must be <= 6000.")
    whatsapp_target_raw = str(ORION_WHATSAPP_AUTOPILOT_EXECUTION_TARGET or "").strip().lower()
    valid_target_inputs = VALID_EXECUTION_TARGETS.union(
        {"local", "local-worker", "local_worker", "companion", "localcompanion", "server", "managed", "hybrid"}
    )
    if whatsapp_target_raw and whatsapp_target_raw not in valid_target_inputs:
        errors.append("ORION_WHATSAPP_AUTOPILOT_EXECUTION_TARGET is invalid.")
    whatsapp_trust_raw = str(ORION_WHATSAPP_AUTOPILOT_TRUST_MODE or "").strip().lower()
    valid_trust_inputs = set(TRUST_MODE_ALIASES.keys()).union(VALID_TRUST_MODES)
    if whatsapp_trust_raw and whatsapp_trust_raw not in valid_trust_inputs:
        errors.append("ORION_WHATSAPP_AUTOPILOT_TRUST_MODE is invalid.")
    if ORION_WHATSAPP_AUTOPILOT_PROFILE and ORION_WHATSAPP_AUTOPILOT_PROFILE not in WHATSAPP_AUTOPILOT_PROFILE_CATALOG:
        errors.append("ORION_WHATSAPP_AUTOPILOT_PROFILE is invalid.")
    if ORION_WHATSAPP_AUTOPILOT_ENGINE and ORION_WHATSAPP_AUTOPILOT_ENGINE not in ENGINE_REGISTRY:
        errors.append("ORION_WHATSAPP_AUTOPILOT_ENGINE is invalid.")
    if not PROVIDER_ADAPTERS:
        errors.append("No provider adapters are registered.")
    return errors


class OrionEngineAdapter:
    name = "orion"

    def execute(self, run_id: str):
        run_orion_mission(run_id)


def extract_openai_text(payload: Dict[str, Any]) -> str:
    if isinstance(payload.get("output_text"), str) and payload.get("output_text"):
        return payload["output_text"]

    output = payload.get("output") or []
    text_parts: List[str] = []
    if isinstance(output, list):
        for item in output:
            if not isinstance(item, dict):
                continue
            content = item.get("content") or []
            if isinstance(content, list):
                for block in content:
                    if not isinstance(block, dict):
                        continue
                    block_text = block.get("text")
                    if isinstance(block_text, str) and block_text.strip():
                        text_parts.append(block_text.strip())
            item_text = item.get("text")
            if isinstance(item_text, str) and item_text.strip():
                text_parts.append(item_text.strip())

    if text_parts:
        return "\n".join(text_parts)

    choices = payload.get("choices") or []
    if isinstance(choices, list) and choices:
        first = choices[0]
        if isinstance(first, dict):
            message = first.get("message") or {}
            if isinstance(message, dict):
                content = message.get("content")
                if isinstance(content, str) and content.strip():
                    return content
    return json.dumps(payload)


def call_openai_responses(system_prompt: str, user_input: str) -> Dict[str, Any]:
    openai_key, _ = _openai_env_bearer_with_source()
    if not openai_key:
        raise RuntimeError(
            "OpenAI credential is missing "
            "(CODEX_OAUTH_TOKEN / OPENAI_OAUTH_TOKEN / OPENAI_ACCESS_TOKEN"
            " / OPENAI_API_KEY)."
        )

    headers = {
        "Authorization": f"Bearer {openai_key}",
        "Content-Type": "application/json",
    }
    if OPENAI_ORG_ID:
        headers["OpenAI-Organization"] = OPENAI_ORG_ID
    if OPENAI_PROJECT_ID:
        headers["OpenAI-Project"] = OPENAI_PROJECT_ID

    payload = {
        "model": CODEX_MODEL,
        "instructions": system_prompt,
        "input": user_input,
    }

    body = json.dumps(payload).encode("utf-8")
    req = urlrequest.Request(OPENAI_RESPONSES_URL, data=body, headers=headers, method="POST")
    context = ssl.create_default_context(cafile=certifi.where())

    def _open():
        if ORION_ALLOW_SYSTEM_PROXY:
            return urlrequest.urlopen(req, timeout=60, context=context)
        opener = urlrequest.build_opener(
            urlrequest.ProxyHandler({}),
            urlrequest.HTTPSHandler(context=context),
        )
        return opener.open(req, timeout=60)

    try:
        with _open() as resp:
            raw = resp.read().decode("utf-8")
            return json.loads(raw)
    except urlerror.HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="ignore") if hasattr(exc, "read") else ""
        detail = raw or str(exc)
        raise RuntimeError(f"OpenAI responses error ({exc.code}): {detail}") from exc
    except Exception as exc:
        raise RuntimeError(f"OpenAI responses call failed: {exc}") from exc


class CodexEngineAdapter:
    name = "codex"

    def execute(self, run_id: str):
        run = runs[run_id]
        run["thread_id"] = threading.get_ident()
        log_queue = run["logs"]
        context = run.get("context", {})

        try:
            set_run_status(run_id, "running")
            emit_log(log_queue, "info", f"Codex run started.", event="run_start", data={"run_id": run_id})

            workflow_id = context.get("workflow_id")
            metadata = context.get("metadata") or {}
            workspace_id = context.get("workspace_id") or metadata.get("workspace_id")
            user_goal = context.get("user_goal") or "Execute the requested business plan."
            business_plan = context.get("business_plan") or ""
            agents = context.get("agents") or []

            provider = normalize_provider_id(context.get("provider") or metadata.get("provider") or "openai")
            if provider not in PROVIDER_CATALOG:
                raise RuntimeError(f"Unsupported provider '{provider}'")

            credential_id = context.get("credential_id") or metadata.get("credential_id")
            selected_model = context.get("model") or metadata.get("model") or PROVIDER_CATALOG.get(provider, {}).get("default_model") or CODEX_MODEL

            credentials: Dict[str, Any] = {}
            if credential_id:
                credentials = resolve_vault_credential(str(credential_id), str(workspace_id) if workspace_id else None)
            elif isinstance(metadata.get("credentials"), dict):
                credentials = metadata.get("credentials") or {}
            elif provider == "openai":
                try:
                    credentials = resolve_default_vault_credential("openai", str(workspace_id) if workspace_id else None)
                except Exception:
                    openai_key, _ = _openai_env_bearer_with_source()
                    if openai_key:
                        credentials = {
                            "access_token": openai_key,
                            "org_id": OPENAI_ORG_ID,
                            "project_id": OPENAI_PROJECT_ID,
                        }

            if not credentials:
                raise RuntimeError(f"No credentials available for provider '{provider}'.")

            agent_summary = (
                [
                    f"- {agent.get('role', 'Worker')} ({agent.get('provider', 'unknown-provider')}:{agent.get('modelId', 'unknown-model')})"
                    for agent in agents
                    if isinstance(agent, dict)
                ]
                if isinstance(agents, list)
                else []
            )
            wants_structured_plan = bool((business_plan or "").strip()) or bool(
                re.search(r"\b(plan|roadmap|strategy|steps|phase|milestone|architecture|execution plan)\b", (user_goal or "").strip().lower())
            )
            available_agents = chr(10).join(agent_summary) if agent_summary else "- none"
            memory_context_block = _memory_prompt_context_block(context)
            response_contract = (
                "Provide: 1) ordered steps, 2) immediate external actions, 3) key risks/unknowns."
                if wants_structured_plan
                else "Respond as a normal assistant (not a forced plan template). For greeting/chat reply naturally and briefly; for work requests give direct actionable help; ask clarifying questions only when required."
            )
            user_message = (
                f"Workflow ID: {workflow_id or 'n/a'}\nUser Request: {user_goal}\n\n"
                f"Business Plan Context:\n{business_plan or 'No business plan provided.'}\n\n"
                f"{memory_context_block}\n\n"
                f"Selected Provider: {provider}\nSelected Model: {selected_model}\n\nAvailable Agents:\n{available_agents}\n\n{response_contract}"
            )

            system_prompt = ORION_CODEX_SYSTEM_PROMPT
            _, _, adapter = resolve_provider_adapter(provider, credentials)
            text = adapter.generate(system_prompt, user_message, str(selected_model), credentials)
            usage = build_masked_usage(provider, str(selected_model), user_message, text)
            usage_message = (
                f"[Telemetry] provider={usage['provider']} model={usage['model']} "
                f"tokens~{usage['total_tokens_est']} cost={usage['cost_band']}"
            )

            emit_log(log_queue, "info", text, event="codex_output")
            emit_log(log_queue, "info", usage_message, event="usage_masked", data=usage)
            emit_log(log_queue, "info", "Codex run completed.", event="run_complete")
            run["result"] = text
            run["usage_masked"] = usage
            set_run_status(run_id, "completed")
        except Exception as exc:
            emit_log(log_queue, "error", str(exc), event="run_error")
            set_run_status(run_id, "failed")
        finally:
            log_queue.put(None)


ENGINE_REGISTRY = {
    "orion": OrionEngineAdapter(),
    "codex": CodexEngineAdapter(),
}

ORION_ENGINE_VALIDATION_ERRORS = validate_orion_runtime()
if ORION_ENGINE_VALIDATION_ERRORS:
    print("⚠️ Empyralis runtime validation failed:")
    for err in ORION_ENGINE_VALIDATION_ERRORS:
        print(f" - {err}")


def selected_execution_target_from_context(context: Optional[Dict[str, Any]]) -> str:
    if not isinstance(context, dict):
        return EXECUTION_TARGET_LOCAL_COMPANION if ORION_LOCAL_COMPANION_ENABLED else EXECUTION_TARGET_CLOUD
    metadata = context.get("metadata") if isinstance(context.get("metadata"), dict) else {}
    selected = str(metadata.get("execution_target_selected") or "").strip().lower()
    if selected in VALID_EXECUTION_TARGETS:
        return selected
    requested = str(metadata.get("execution_target_requested") or "").strip().lower()
    if requested in VALID_EXECUTION_TARGETS:
        return requested
    return EXECUTION_TARGET_LOCAL_COMPANION if ORION_LOCAL_COMPANION_ENABLED else EXECUTION_TARGET_CLOUD


def _predict_tool_ids_for_context(context: Dict[str, Any]) -> List[str]:
    metadata = context.get("metadata") if isinstance(context.get("metadata"), dict) else {}
    pack_id = str(metadata.get("outcome_pack") or "").strip().lower()
    pack_inputs = metadata.get("pack_inputs") if isinstance(metadata.get("pack_inputs"), dict) else {}

    if pack_id == CUSTOMER_OPS_PACK_ID:
        return ["draft_email", "create_calendar_event", "send_message"]
    if pack_id == WEEKLY_CONTENT_PACK_ID:
        return ["publish_content"]
    if pack_id == COMPETITOR_BRIEF_PACK_ID:
        return ["external_research"]
    if pack_id == SPREADSHEET_OPS_PACK_ID:
        operation = normalize_action_id(
            pack_inputs.get("operation")
            or pack_inputs.get("operation_type")
            or pack_inputs.get("leads")
            or "read"
        )
        if operation in {"append"}:
            return ["spreadsheet_append"]
        if operation in {"update", "edit"}:
            return ["spreadsheet_update"]
        if operation in {"create", "new"}:
            return ["spreadsheet_create"]
        return ["spreadsheet_read"]
    if pack_id == DOCUMENT_STUDIO_PACK_ID:
        operation = normalize_action_id(pack_inputs.get("operation") or pack_inputs.get("operation_type") or pack_inputs.get("leads") or "create")
        file_path = str(pack_inputs.get("file_path") or pack_inputs.get("path") or pack_inputs.get("inbox") or "").strip().lower()
        is_presentation = file_path.endswith(".pptx")
        if is_presentation:
            return ["presentation_update" if operation in {"update", "edit", "append"} else "presentation_create"]
        return ["document_update" if operation in {"update", "edit", "append"} else "document_create"]
    if pack_id == LOCAL_EXECUTION_PACK_ID:
        operations = pack_inputs.get("operations") if isinstance(pack_inputs.get("operations"), list) else []
        predicted: List[str] = []
        seen_tools: Set[str] = set()

        def _append_predicted(raw_tool: Any) -> None:
            clean = normalize_action_id(raw_tool)
            if clean and clean not in seen_tools:
                seen_tools.add(clean)
                predicted.append(clean)

        if operations:
            for item in operations:
                if not isinstance(item, dict):
                    continue
                _append_predicted(item.get("tool") or item.get("action"))
        else:
            inferred_tool = (
                pack_inputs.get("tool")
                or pack_inputs.get("action")
                or capability_tool_id(pack_inputs.get("capability"))
                or ("execute_shell_command" if str(pack_inputs.get("command") or "").strip() or isinstance(pack_inputs.get("argv"), list) else "")
                or ("browser_automation" if str(pack_inputs.get("url") or "").strip() else "")
                or ("capture_screenshot" if bool(pack_inputs.get("screenshot")) else "")
            )
            if not inferred_tool and str(pack_inputs.get("path") or pack_inputs.get("file_path") or "").strip():
                inferred_tool = "read_write_files"
            _append_predicted(inferred_tool)
        return predicted

    text_parts: List[str] = []
    user_goal = str(context.get("user_goal") or "").strip()
    business_plan = str(context.get("business_plan") or "").strip()
    if user_goal:
        text_parts.append(user_goal)
    if business_plan:
        text_parts.append(business_plan)
    inferred = infer_actions_from_text("\n".join(text_parts))
    ordered = [normalize_action_id(action) for action in inferred.keys()]
    unique: List[str] = []
    seen: Set[str] = set()
    for action in ordered:
        if action and action not in seen:
            seen.add(action)
            unique.append(action)
    return unique


def _predict_capability_ids_for_context(context: Dict[str, Any]) -> List[str]:
    metadata = context.get("metadata") if isinstance(context.get("metadata"), dict) else {}
    pack_id = normalize_action_id(metadata.get("outcome_pack"))
    pack_inputs = metadata.get("pack_inputs") if isinstance(metadata.get("pack_inputs"), dict) else {}
    if pack_id != LOCAL_EXECUTION_PACK_ID:
        return []

    operations = pack_inputs.get("operations") if isinstance(pack_inputs.get("operations"), list) else []
    seen: Set[str] = set()
    capability_ids: List[str] = []

    def _append_capability(raw_capability: Any) -> None:
        clean = str(raw_capability or "").strip().lower()
        if clean and clean not in seen:
            seen.add(clean)
            capability_ids.append(clean)

    if operations:
        for item in operations:
            if not isinstance(item, dict):
                continue
            _append_capability(item.get("capability"))
    else:
        _append_capability(pack_inputs.get("capability"))
    return capability_ids


_BROWSER_AUTH_ACTIONS: Set[str] = {
    "type",
    "click",
    "select",
    "upload",
    "download",
    "open_popup",
    "open_tab",
    "switch_tab",
    "close_tab",
    "navigate",
}
_BROWSER_PRIVILEGED_ACTIONS: Set[str] = {
    "upload",
    "download",
    "open_popup",
    "open_tab",
    "close_tab",
}


def _derive_browser_automation_policy(context: Dict[str, Any]) -> Dict[str, Any]:
    metadata = context.get("metadata") if isinstance(context.get("metadata"), dict) else {}
    if normalize_action_id(metadata.get("outcome_pack")) != normalize_action_id(LOCAL_EXECUTION_PACK_ID):
        return {}
    pack_inputs = metadata.get("pack_inputs") if isinstance(metadata.get("pack_inputs"), dict) else {}
    operations = pack_inputs.get("operations") if isinstance(pack_inputs.get("operations"), list) else []
    browser_ops: List[Dict[str, Any]] = []
    if operations:
        for item in operations:
            if not isinstance(item, dict):
                continue
            if normalize_action_id(item.get("tool") or item.get("action")) == "browser_automation":
                browser_ops.append(item)
    elif str(pack_inputs.get("url") or "").strip():
        browser_ops.append(pack_inputs)
    if not browser_ops:
        return {}

    session_profiles: Set[str] = set()
    interactive_actions: Set[str] = set()
    privileged_actions: Set[str] = set()
    capture_page = False
    for operation in browser_ops:
        profile = str(operation.get("session_profile") or operation.get("sessionProfile") or "").strip()
        if profile:
            session_profiles.add(profile)
        if normalize_action_id(operation.get("mode") or "extract_text") == "capture_page":
            capture_page = True
        raw_actions = operation.get("browser_actions") if isinstance(operation.get("browser_actions"), list) else []
        for raw in raw_actions:
            if not isinstance(raw, dict):
                continue
            action = normalize_action_id(raw.get("action"))
            if not action:
                continue
            if action in _BROWSER_AUTH_ACTIONS:
                interactive_actions.add(action)
            if action in _BROWSER_PRIVILEGED_ACTIONS:
                privileged_actions.add(action)

    profile = "public_readonly"
    if session_profiles and privileged_actions:
        profile = "authenticated_privileged"
    elif session_profiles and interactive_actions:
        profile = "authenticated_interactive"
    elif session_profiles:
        profile = "authenticated_readonly"
    elif privileged_actions:
        profile = "public_privileged"
    elif interactive_actions:
        profile = "public_interactive"

    approval_reason = ""
    requires_approval = False
    if session_profiles and privileged_actions:
        requires_approval = True
        approval_reason = "session-backed privileged browser automation requires approval"
    elif session_profiles and interactive_actions:
        requires_approval = True
        approval_reason = "session-backed interactive browser automation requires approval"

    return {
        "profile": profile,
        "session_profiles": sorted(session_profiles),
        "session_profile_count": len(session_profiles),
        "interactive_actions": sorted(interactive_actions),
        "privileged_actions": sorted(privileged_actions),
        "capture_page": bool(capture_page),
        "requires_approval": requires_approval,
        "reason": approval_reason,
    }


def _compute_tool_policy_precheck(context: Dict[str, Any]) -> Dict[str, Any]:
    metadata = context.get("metadata") if isinstance(context.get("metadata"), dict) else {}
    trust_mode = normalize_trust_mode(metadata.get("trust_mode"))
    target = normalize_execution_target(
        metadata.get("execution_target_selected") or metadata.get("execution_target")
    )
    tool_ids = _predict_tool_ids_for_context(context)
    skill_contract = _build_skill_contract_from_metadata(metadata, tool_ids, trust_mode, target)
    enforced_undeclared = set(skill_contract.get("undeclared_tools") or []) if skill_contract.get("policy_mode") == "enforce" else set()
    items: List[Dict[str, Any]] = []
    blocked: List[str] = []
    approval_required: List[str] = []
    allowed: List[str] = []

    browser_policy = _derive_browser_automation_policy(context)
    evaluation_metadata = dict(metadata)
    if browser_policy:
        evaluation_metadata["browser_automation_policy"] = browser_policy

    capability_ids = _predict_capability_ids_for_context(context)
    capability_details = [
        detail
        for detail in (
            capability_metadata(capability_id, Path(__file__).resolve().parent)
            for capability_id in capability_ids
        )
        if isinstance(detail, dict)
    ]
    capabilities_by_tool: Dict[str, List[str]] = {}
    for detail in capability_details:
        tool_for_capability = normalize_action_id(detail.get("tool_id"))
        capability_id = str(detail.get("id") or "").strip().lower()
        if not tool_for_capability or not capability_id:
            continue
        capabilities_by_tool.setdefault(tool_for_capability, []).append(capability_id)

    for tool_id in tool_ids:
        item = evaluate_tool_policy_decision(
            tool_id=tool_id,
            trust_mode=trust_mode,
            target=target,
            metadata=evaluation_metadata,
            capability_ids=capabilities_by_tool.get(normalize_action_id(tool_id), []),
        )
        if tool_id in enforced_undeclared:
            item = dict(item)
            item["decision"] = "blocked"
            item["reason"] = "skill_contract_missing_runtime_tool"
        elif skill_contract.get("declared_runtime_tools"):
            item = dict(item)
            item["skill_declared"] = tool_id in set(skill_contract.get("declared_runtime_tools") or [])
        items.append(item)
        decision = str(item.get("decision") or "").strip().lower()
        clean_tool = str(item.get("tool_id") or tool_id).strip().lower()
        if decision == "blocked":
            blocked.append(clean_tool)
        elif decision == "approval_required":
            approval_required.append(clean_tool)
        else:
            allowed.append(clean_tool)

    return {
        "trust_mode": trust_mode,
        "target": target,
        "tool_ids": tool_ids,
        "capability_ids": capability_ids,
        "capabilities": capability_details,
        "blocked": blocked,
        "approval_required": approval_required,
        "allowed": allowed,
        "blocked_count": len(blocked),
        "approval_required_count": len(approval_required),
        "allow_count": len(allowed),
        "items": items,
        "skill_contract": skill_contract,
        "browser_automation_policy": browser_policy or None,
    }


def _append_run_tool_policy_audit(
    run_id: Optional[str],
    evaluation: Dict[str, Any],
    source: str,
    metadata: Optional[Dict[str, Any]] = None,
) -> None:
    if not run_id:
        return
    run = runs.get(str(run_id))
    if not isinstance(run, dict):
        return
    payload = {
        "ts": _utc_now_iso(),
        "source": str(source or "runtime").strip().lower(),
        "tool_id": str(evaluation.get("tool_id") or "").strip().lower(),
        "decision": str(evaluation.get("decision") or "").strip().lower(),
        "reason": str(evaluation.get("reason") or "").strip(),
        "trust_mode": str(evaluation.get("trust_mode") or "").strip().lower(),
        "target": str(evaluation.get("target") or "").strip().lower(),
        "is_sensitive": bool(evaluation.get("is_sensitive")),
        "is_critical": bool(evaluation.get("is_critical")),
        "metadata": _json_safe(metadata if isinstance(metadata, dict) else {}),
    }
    items = run.setdefault("tool_policy_audit", [])
    if isinstance(items, list):
        items.append(payload)
        if len(items) > 500:
            del items[:-500]
        run["tool_policy_audit"] = items


def _enqueue_local_companion_run(run_id: str, *, message: str = "Run queued for Local Companion execution.", event: str = "local_queued") -> None:
    run = runs.get(run_id)
    if not isinstance(run, dict):
        return
    set_run_status(run_id, "queued_local")
    run["updated_at"] = datetime.utcnow().isoformat() + "Z"
    with LOCAL_QUEUE_LOCK:
        if run_id not in LOCAL_PENDING_RUN_IDS:
            LOCAL_PENDING_RUN_IDS.append(run_id)
    emit_log(
        run["logs"],
        "info",
        message,
        event=event,
        data={"run_id": run_id, "lease_seconds": ORION_LOCAL_LEASE_SECONDS},
    )



def create_run(engine: str, context: Optional[dict] = None, *, defer_local_enqueue: bool = False) -> str:
    run_id = str(uuid.uuid4())
    now = datetime.utcnow().isoformat() + "Z"
    started_mono = time.monotonic()
    log_queue: queue.Queue = queue.Queue()
    run_context = context or {}
    if isinstance(run_context, dict):
        try:
            _inject_runtime_skill_defaults(run_context)
        except Exception:
            pass
    if engine == "orion" and isinstance(run_context, dict):
        metadata = run_context.get("metadata") if isinstance(run_context.get("metadata"), dict) else {}
        if isinstance(metadata, dict) and not isinstance(metadata.get("tool_policy_precheck"), dict):
            try:
                metadata["tool_policy_precheck"] = _compute_tool_policy_precheck(run_context)
                run_context["metadata"] = metadata
            except Exception:
                pass
    selected_target = selected_execution_target_from_context(run_context)
    runs[run_id] = {
        "status": "starting",
        "logs": log_queue,
        "input_queue": queue.Queue(),
        "thread_id": None,
        "engine": engine,
        "context": run_context,
        "created_at": now,
        "updated_at": now,
        "result": None,
        "result_data": None,
        "duration_ms": None,
        "_started_mono": started_mono,
        "_finished_mono": None,
        "_first_value_mono": None,
        "_hitl_wait_start_mono": None,
        "_hitl_wait_total_ms": 0.0,
        "_archived": False,
        "_event_seq": 0,
        "events": [],
        "tool_policy_audit": [],
        "memory_trace": {
            "enabled": ORION_MEMORY_ENABLED,
            "reads": [],
            "writes": [],
            "last_error": None,
            "updated_at": _utc_now_iso(),
        },
    }
    RUN_QUEUE_INDEX[id(log_queue)] = run_id
    metrics_inc("runs_started", 1)

    if selected_target == EXECUTION_TARGET_LOCAL_COMPANION:
        try:
            _hydrate_run_memory_context(run_id, runs[run_id])
        except Exception:
            pass
        if not defer_local_enqueue:
            _enqueue_local_companion_run(run_id)
        return run_id

    worker = threading.Thread(target=run_mission, args=(run_id,), daemon=True)
    worker.start()
    return run_id


def redact_sensitive(value: Any) -> Any:
    if isinstance(value, dict):
        redacted: Dict[str, Any] = {}
        for key, sub in value.items():
            key_lower = str(key).lower()
            if any(token in key_lower for token in ["token", "key", "secret", "password", "authorization", "credential", "access"]):
                redacted[key] = "***redacted***"
            else:
                redacted[key] = redact_sensitive(sub)
        return redacted
    if isinstance(value, list):
        return [redact_sensitive(item) for item in value]
    return value


def _compile_orion_dag(context: Dict[str, Any]) -> Dict[str, Any]:
    metadata = context.get("metadata") if isinstance(context.get("metadata"), dict) else {}
    outcome_pack = str(metadata.get("outcome_pack") or "").strip().lower()

    if outcome_pack in SUPPORTED_OUTCOME_PACKS:
        nodes = [
            {"id": "pack.prepare", "kind": "pack_prepare", "deps": []},
            {"id": "pack.approval", "kind": "pack_approval", "deps": ["pack.prepare"]},
            {"id": "pack.finalize", "kind": "pack_finalize", "deps": ["pack.approval"]},
        ]
        return {
            "id": f"orion-pack-{outcome_pack}-v1",
            "type": "outcome_pack",
            "outcome_pack": outcome_pack,
            "nodes": nodes,
        }

    nodes = [
        {"id": "runtime.resolve", "kind": "runtime_resolve", "deps": []},
        {"id": "plan.generate", "kind": "plan_generate", "deps": ["runtime.resolve"]},
        {"id": "plan.approval", "kind": "plan_approval", "deps": ["plan.generate"]},
        {"id": "result.generate", "kind": "result_generate", "deps": ["plan.approval"]},
        {"id": "usage.finalize", "kind": "usage_finalize", "deps": ["result.generate"]},
    ]
    return {
        "id": "orion-standard-v1",
        "type": "standard",
        "nodes": nodes,
    }


def _resolve_dag_order(nodes: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    node_map: Dict[str, Dict[str, Any]] = {}
    indegree: Dict[str, int] = {}
    adjacency: Dict[str, List[str]] = {}

    for raw_node in nodes:
        node_id = str(raw_node.get("id") or "").strip()
        if not node_id:
            raise RuntimeError("DAG node id is required.")
        if node_id in node_map:
            raise RuntimeError(f"Duplicate DAG node id '{node_id}'.")
        deps_raw = raw_node.get("deps")
        deps: List[str] = []
        if isinstance(deps_raw, list):
            for dep in deps_raw:
                dep_id = str(dep or "").strip()
                if dep_id:
                    deps.append(dep_id)
        node = dict(raw_node)
        node["deps"] = deps
        node_map[node_id] = node
        indegree[node_id] = 0

    for node_id, node in node_map.items():
        deps = node.get("deps", [])
        if not isinstance(deps, list):
            raise RuntimeError(f"DAG node '{node_id}' deps must be a list.")
        for dep_id in deps:
            if dep_id not in node_map:
                raise RuntimeError(f"DAG node '{node_id}' depends on unknown node '{dep_id}'.")
            adjacency.setdefault(dep_id, []).append(node_id)
            indegree[node_id] += 1

    ready = sorted([nid for nid, count in indegree.items() if count == 0])
    ordered_ids: List[str] = []
    while ready:
        current = ready.pop(0)
        ordered_ids.append(current)
        for nxt in sorted(adjacency.get(current, [])):
            indegree[nxt] -= 1
            if indegree[nxt] == 0:
                ready.append(nxt)
        ready.sort()

    if len(ordered_ids) != len(node_map):
        raise RuntimeError("DAG contains a cycle or unresolved dependency.")
    return [node_map[nid] for nid in ordered_ids]


def _execute_orion_dag_node(
    run_id: str,
    context: Dict[str, Any],
    log_queue: queue.Queue,
    node: Dict[str, Any],
    state: Dict[str, Any],
):
    kind = str(node.get("kind") or "").strip()
    metadata = context.get("metadata") if isinstance(context.get("metadata"), dict) else {}
    user_goal = str(context.get("user_goal") or "Execute the requested business objective.")

    if kind == "pack_prepare":
        outcome_pack = str(state.get("outcome_pack") or "").strip().lower()
        if outcome_pack not in SUPPORTED_OUTCOME_PACKS:
            raise RuntimeError(f"Unsupported outcome pack '{outcome_pack}'.")
        emit_log(log_queue, "info", f"Outcome pack started: {outcome_pack}.", event="pack_start")
        for phase in PACK_PHASES.get(outcome_pack, []):
            emit_log(log_queue, "info", phase, event="pack_phase")
        tool_precheck = _compute_tool_policy_precheck(context)
        state["tool_policy_precheck"] = tool_precheck
        blocked_tools = list(tool_precheck.get("blocked") or [])
        for evaluation in tool_precheck.get("items") if isinstance(tool_precheck.get("items"), list) else []:
            if isinstance(evaluation, dict):
                _append_run_tool_policy_audit(
                    run_id,
                    evaluation,
                    source="dag_precheck",
                    metadata={"node": "pack_prepare", "pack_id": outcome_pack},
                )
        emit_log(
            log_queue,
            "info",
            (
                "Tool policy precheck: "
                f"allow={tool_precheck.get('allow_count', 0)} "
                f"approval={tool_precheck.get('approval_required_count', 0)} "
                f"blocked={tool_precheck.get('blocked_count', 0)}"
            ),
            event="tool_policy_precheck",
            data=tool_precheck,
        )
        if blocked_tools:
            raise RuntimeError(f"Tool policy blocked requested actions: {', '.join(blocked_tools)}.")

        raw_result = execute_outcome_pack(outcome_pack, context, run_id=run_id)
        result_data = normalize_pack_result(outcome_pack, raw_result)
        validate_pack_tool_contracts(outcome_pack, result_data, role="orion_operator")
        trust_mode = normalize_trust_mode(metadata.get("trust_mode"))
        action_counts = infer_actions_from_pack_result(outcome_pack, result_data)
        action_policy = evaluate_action_policy(
            action_counts,
            trust_mode,
            metadata,
            metadata.get("execution_target_selected") or metadata.get("execution_target"),
        )
        state["action_policy"] = action_policy
        emit_log(
            log_queue,
            "info",
            summarize_action_policy_eval(action_policy),
            event="action_policy_evaluated",
            data={
                "phase": "pack_prepare",
                "target": action_policy.get("target"),
                "blocked_actions": action_policy.get("blocked_actions"),
                "approval_actions": action_policy.get("approval_actions"),
            },
        )
        blocked_actions = action_policy.get("blocked_actions") if isinstance(action_policy.get("blocked_actions"), list) else []
        if blocked_actions:
            raise RuntimeError(f"Action policy blocked requested actions: {', '.join(blocked_actions)}.")
        approval_required, approval_reason = pack_approval_policy(trust_mode, result_data, metadata)
        if bool(action_policy.get("requires_approval")):
            approval_required = True
            policy_reason = str(action_policy.get("approval_reason") or "").strip()
            if policy_reason:
                approval_reason = f"{approval_reason} {policy_reason}".strip()
        summary_text = str(result_data.get("summary") or "Outcome pack completed.")
        state["result_data"] = result_data
        state["trust_mode"] = trust_mode
        state["approval_required"] = approval_required
        state["approval_reason"] = approval_reason
        state["summary_text"] = summary_text
        return {"approval_required": approval_required, "trust_mode": trust_mode}

    if kind == "pack_approval":
        if not bool(state.get("approval_required")):
            emit_log(log_queue, "info", "Approval skipped by trust policy.", event="approval_skipped")
            return {"skipped": True}
        result_data = state.get("result_data") if isinstance(state.get("result_data"), dict) else {}
        outputs = result_data.get("outputs") if isinstance(result_data.get("outputs"), dict) else {}
        outbound_actions = parse_positive_int(outputs.get("outbound_actions"), 0)
        approval_reason = str(state.get("approval_reason") or "Approval required.")
        prompt = (
            f"Approval required. {approval_reason} "
            f"Planned outbound actions: {outbound_actions}. "
            "Reply with Proceed to continue or Hold to stop."
        )
        approved = wait_for_human_decision(run_id, prompt)
        if not approved:
            raise RuntimeError("Run stopped by human decision.")
        return {"approved": True}

    if kind == "pack_finalize":
        outcome_pack = str(state.get("outcome_pack") or "").strip().lower()
        result_data = state.get("result_data") if isinstance(state.get("result_data"), dict) else {}
        summary_text = str(state.get("summary_text") or "Outcome pack completed.")
        trust_mode = str(state.get("trust_mode") or normalize_trust_mode(metadata.get("trust_mode")))
        approval_required = bool(state.get("approval_required"))
        approval_reason = str(state.get("approval_reason") or "")
        execution_summary = build_pack_execution_summary(
            outcome_pack,
            result_data,
            trust_mode,
            approval_required,
            approval_reason,
        )
        action_policy = state.get("action_policy") if isinstance(state.get("action_policy"), dict) else {}
        execution_summary["action_policy"] = {
            "blocked_actions": action_policy.get("blocked_actions", []),
            "approval_actions": action_policy.get("approval_actions", []),
            "target": action_policy.get("target"),
        }
        result_data["execution_summary"] = execution_summary
        result_data["result_schema_version"] = 2
        result_data["trust_mode"] = trust_mode
        emit_log(log_queue, "info", summary_text, event="pack_summary", data=result_data)
        emit_log(
            log_queue,
            "info",
            (
                f"Execution summary: risk={execution_summary['risk_level']} "
                f"time_saved~{execution_summary['estimated_time_saved_minutes']}m "
                f"approval_required={execution_summary['approval_required']}"
            ),
            event="execution_summary",
            data=execution_summary,
        )
        usage = build_masked_usage(
            "orion",
            outcome_pack,
            f"{user_goal}\n{json.dumps(result_data.get('inputs', {}), ensure_ascii=True)}",
            summary_text,
        )
        emit_log(
            log_queue,
            "info",
            f"[Telemetry] provider={usage['provider']} model={usage['model']} "
            f"tokens~{usage['total_tokens_est']} cost={usage['cost_band']}",
            event="usage_masked",
            data=usage,
        )
        emit_log(log_queue, "info", "Empyralis run completed.", event="run_complete")
        state["final_result_text"] = summary_text
        state["final_result_data"] = result_data
        state["final_usage"] = usage
        return {"done": True}

    if kind == "runtime_resolve":
        workflow_id = context.get("workflow_id") or "n/a"
        business_plan = str(context.get("business_plan") or "")
        agent_summary = format_agent_summary(context.get("agents"))
        memory_context_block = _memory_prompt_context_block(context)
        provider, selected_model, candidates, _ = resolve_run_execution_context(context)
        plan_input = (
            f"Workflow ID: {workflow_id}\n"
            f"User Goal: {user_goal}\n\n"
            f"Business Plan:\n{business_plan or 'No business plan provided.'}\n\n"
            f"{memory_context_block}\n\n"
            f"Agent Setup:\n{agent_summary}\n\n"
            "Output only:\n"
            "1) Ordered plan\n"
            "2) External actions required\n"
            "3) Risks and assumptions\n"
        )
        state["provider"] = provider
        state["selected_model"] = str(selected_model)
        state["credential_candidates"] = candidates
        state["credentials"] = candidates[0].get("credentials") if candidates else {}
        state["plan_input"] = plan_input
        return {"provider": provider, "model": str(selected_model)}

    if kind == "plan_generate":
        plan_input = str(state.get("plan_input") or "")
        plan_prompt = ORION_PLANNER_SYSTEM_PROMPT
        plan_text = generate_with_candidate_failover(state, context, log_queue, plan_prompt, plan_input)
        emit_log(log_queue, "info", plan_text, event="orion_plan")
        state["plan_text"] = plan_text
        return {"chars": len(plan_text)}

    if kind == "plan_approval":
        plan_text = str(state.get("plan_text") or "")
        needs_approval, reason = requires_human_approval(context, plan_text)
        trust_mode = normalize_trust_mode(metadata.get("trust_mode"))
        plan_actions = infer_actions_from_text(plan_text)
        action_policy = evaluate_action_policy(
            plan_actions,
            trust_mode,
            metadata,
            metadata.get("execution_target_selected") or metadata.get("execution_target"),
        )
        state["action_policy"] = action_policy
        emit_log(
            log_queue,
            "info",
            summarize_action_policy_eval(action_policy),
            event="action_policy_evaluated",
            data={
                "phase": "plan_approval",
                "target": action_policy.get("target"),
                "blocked_actions": action_policy.get("blocked_actions"),
                "approval_actions": action_policy.get("approval_actions"),
            },
        )
        blocked_actions = action_policy.get("blocked_actions") if isinstance(action_policy.get("blocked_actions"), list) else []
        if blocked_actions:
            raise RuntimeError(f"Action policy blocked requested actions: {', '.join(blocked_actions)}.")
        if bool(action_policy.get("requires_approval")):
            needs_approval = True
            policy_reason = str(action_policy.get("approval_reason") or "").strip()
            if policy_reason:
                reason = f"{reason} {policy_reason}".strip()
        if not needs_approval:
            emit_log(log_queue, "info", "Approval skipped by trust policy.", event="approval_skipped")
            return {"skipped": True}
        prompt = (
            f"Approval required before execution. {reason} "
            "Reply with Proceed to continue or Hold to stop."
        ).strip()
        approved = wait_for_human_decision(run_id, prompt)
        if not approved:
            raise RuntimeError("Run stopped by human decision.")
        return {"approved": True}

    if kind == "result_generate":
        plan_text = str(state.get("plan_text") or "")
        execute_input = (
            f"User Goal: {user_goal}\n\n"
            f"Execution Plan:\n{plan_text}\n\n"
            "Now return:\n"
            "1) What Empyralis did\n"
            "2) What Empyralis needs from user\n"
            "3) Next immediate steps\n"
            "Keep the response concise and operational."
        )
        execute_prompt = ORION_OPERATOR_SYSTEM_PROMPT
        result_text = generate_with_candidate_failover(state, context, log_queue, execute_prompt, execute_input)
        emit_log(log_queue, "info", result_text, event="orion_result")
        final_text = (
            "Execution Plan\n"
            f"{plan_text}\n\n"
            "Execution Result\n"
            f"{result_text}"
        )
        state["execute_input"] = execute_input
        state["result_text"] = result_text
        state["final_text"] = final_text
        return {"chars": len(final_text)}

    if kind == "usage_finalize":
        provider = str(state.get("provider") or "openai")
        selected_model = str(state.get("active_model") or state.get("selected_model") or CODEX_MODEL)
        plan_input = str(state.get("plan_input") or "")
        execute_input = str(state.get("execute_input") or "")
        final_text = str(state.get("final_text") or "")
        usage = build_masked_usage(
            provider,
            selected_model,
            f"{plan_input}\n\n{execute_input}",
            final_text,
        )
        emit_log(
            log_queue,
            "info",
            f"[Telemetry] provider={usage['provider']} model={usage['model']} "
            f"tokens~{usage['total_tokens_est']} cost={usage['cost_band']}",
            event="usage_masked",
            data=usage,
        )
        emit_log(log_queue, "info", "Empyralis run completed.", event="run_complete")
        state["final_result_text"] = final_text
        state["final_result_data"] = None
        state["final_usage"] = usage
        return {"done": True}

    raise RuntimeError(f"Unsupported DAG node kind '{kind}'.")


def _execute_orion_dag_once(run_id: str, context: Dict[str, Any], log_queue: queue.Queue, dag_spec: Dict[str, Any]) -> Dict[str, Any]:
    nodes_raw = dag_spec.get("nodes")
    if not isinstance(nodes_raw, list) or not nodes_raw:
        raise RuntimeError("Compiled DAG has no nodes.")

    ordered_nodes = _resolve_dag_order(nodes_raw)
    emit_log(
        log_queue,
        "info",
        f"DAG compiled: {dag_spec.get('id')} ({len(ordered_nodes)} nodes).",
        event="dag_compiled",
        data={
            "dag_id": dag_spec.get("id"),
            "dag_type": dag_spec.get("type"),
            "node_count": len(ordered_nodes),
            "nodes": [str(node.get("id") or "") for node in ordered_nodes],
        },
    )

    state: Dict[str, Any] = {
        "outcome_pack": dag_spec.get("outcome_pack"),
        "node_results": {},
    }
    completed: Set[str] = set()
    for node in ordered_nodes:
        node_id = str(node.get("id") or "").strip()
        deps = node.get("deps", [])
        if any(dep not in completed for dep in deps):
            missing = [dep for dep in deps if dep not in completed]
            raise RuntimeError(f"DAG node '{node_id}' has unresolved dependencies: {', '.join(missing)}")

        node_started = time.monotonic()
        emit_log(log_queue, "info", f"Node started: {node_id}", event="dag_node_start", data={"node_id": node_id})
        try:
            node_output = _execute_orion_dag_node(run_id, context, log_queue, node, state)
        except Exception as exc:
            emit_log(
                log_queue,
                "error",
                friendly_runtime_error_message(exc),
                event="dag_node_error",
                data={"node_id": node_id},
            )
            raise
        elapsed_ms = round((time.monotonic() - node_started) * 1000.0, 2)
        state["node_results"][node_id] = node_output
        completed.add(node_id)
        emit_log(
            log_queue,
            "info",
            f"Node completed: {node_id} ({elapsed_ms} ms)",
            event="dag_node_complete",
            data={"node_id": node_id, "duration_ms": elapsed_ms},
        )

    final_text = state.get("final_result_text")
    final_usage = state.get("final_usage")
    if not isinstance(final_text, str) or not isinstance(final_usage, dict):
        raise RuntimeError("DAG execution finished without final result payload.")
    final_data = state.get("final_result_data") if isinstance(state.get("final_result_data"), dict) else None
    return {
        "result_text": final_text,
        "result_data": final_data,
        "usage_masked": final_usage,
    }


def run_orion_mission(run_id: str):
    run = runs[run_id]
    run["thread_id"] = threading.get_ident()
    log_queue = run["logs"]
    context = run.get("context", {}) if isinstance(run.get("context"), dict) else {}

    set_run_status(run_id, "running")
    emit_log(log_queue, "info", "Empyralis run started.", event="run_start", data={"run_id": run_id})
    started_at = time.time()
    last_error: Optional[Exception] = None

    dag_spec = _compile_orion_dag(context)
    run["dag"] = {
        "id": dag_spec.get("id"),
        "type": dag_spec.get("type"),
        "nodes": [str(node.get("id") or "") for node in dag_spec.get("nodes", []) if isinstance(node, dict)],
    }

    for attempt in range(ORION_MAX_RETRIES + 1):
        try:
            if (time.time() - started_at) > ORION_RUN_TIMEOUT_SECONDS:
                raise RuntimeError(f"Empyralis run exceeded {ORION_RUN_TIMEOUT_SECONDS}s timeout.")

            result = _execute_orion_dag_once(run_id, context, log_queue, dag_spec)
            run["result"] = result["result_text"]
            run["result_data"] = result.get("result_data")
            run["usage_masked"] = result["usage_masked"]
            set_run_status(run_id, "completed")
            run["logs"].put(None)
            return
        except Exception as exc:
            last_error = exc
            raw_message = str(exc)
            message = friendly_runtime_error_message(exc)
            non_retryable = is_non_retryable_runtime_error(exc)

            if "timeout" in raw_message.lower() or "timeout" in message.lower():
                emit_log(log_queue, "error", message, event="timeout")
                set_run_status(run_id, "timeout")
                run["logs"].put(None)
                return

            if "stopped by human decision" in raw_message.lower() or "stopped by human decision" in message.lower():
                emit_log(log_queue, "warn", message, event="run_stopped")
                set_run_status(run_id, "failed")
                run["logs"].put(None)
                return

            if non_retryable:
                emit_log(
                    log_queue,
                    "error",
                    message,
                    event="run_error",
                    data={"attempt": attempt + 1, "retryable": False, "raw_error": raw_message},
                )
                set_run_status(run_id, "failed")
                run["logs"].put(None)
                return

            emit_log(
                log_queue,
                "warn",
                f"Empyralis run failed on attempt {attempt + 1}.",
                event="run_retry",
                data={"attempt": attempt + 1, "error": message, "raw_error": raw_message},
            )
            if attempt < ORION_MAX_RETRIES:
                backoff = ORION_RETRY_BACKOFF_SECONDS * (2 ** attempt)
                time.sleep(backoff)

    emit_log(log_queue, "error", friendly_runtime_error_message(last_error or Exception("Unknown runtime failure")), event="run_error")
    set_run_status(run_id, "failed")
    run["logs"].put(None)


def run_mission(run_id):
    run = runs.get(run_id)
    if not run:
        return
    engine_name = (run.get("engine") or "orion").lower()
    context = run.get("context") if isinstance(run.get("context"), dict) else {}
    metadata = context.get("metadata") if isinstance(context.get("metadata"), dict) else {}
    selected_target = str(metadata.get("execution_target_selected") or "").strip().lower()
    requested_target = str(metadata.get("execution_target_requested") or "").strip().lower()
    route_reason = str(metadata.get("execution_target_reason") or "").strip()
    route_fallback = str(metadata.get("execution_target_fallback") or "").strip()

    if selected_target:
        route_msg = (
            f"Routing: requested={requested_target or 'auto'}, "
            f"selected={selected_target}. {route_reason}".strip()
        )
        emit_log(
            run["logs"],
            "info",
            route_msg,
            event="route_decision",
            data={
                "requested": requested_target or EXECUTION_TARGET_AUTO,
                "selected": selected_target,
                "reason": route_reason,
                "fallback": route_fallback or None,
            },
        )
        if route_fallback:
            emit_log(run["logs"], "warn", route_fallback, event="route_fallback")

    engine = ENGINE_REGISTRY.get(engine_name)
    if not engine:
        emit_log(run["logs"], "error", f"Unsupported engine: {engine_name}", event="run_error")
        set_run_status(run_id, "failed")
        run["logs"].put(None)
        return

    try:
        _hydrate_run_memory_context(run_id, run)
    except Exception as exc:
        trace = run.setdefault("memory_trace", {"enabled": ORION_MEMORY_ENABLED, "reads": [], "writes": [], "last_error": None, "updated_at": None})
        trace["last_error"] = f"memory_read_failed:{exc}"
        trace["updated_at"] = _utc_now_iso()
        run["memory_trace"] = trace
        emit_log(run["logs"], "warn", "Memory context read failed; continuing without memory.", event="memory_context_error")

    try:
        engine.execute(run_id)
        try:
            _persist_run_memory(run_id, run)
        except Exception as exc:
            trace = run.setdefault("memory_trace", {"enabled": ORION_MEMORY_ENABLED, "reads": [], "writes": [], "last_error": None, "updated_at": None})
            trace["last_error"] = f"memory_write_failed:{exc}"
            trace["updated_at"] = _utc_now_iso()
            run["memory_trace"] = trace
            emit_log(run["logs"], "warn", "Memory write failed after run completion.", event="memory_write_error")
    except Exception as exc:
        emit_log(run["logs"], "error", friendly_runtime_error_message(exc), event="run_error")
        set_run_status(run_id, "failed")
        run["logs"].put(None)


def _history_item_matches(
    item: Dict[str, Any],
    workspace_id: Optional[str],
    status: Optional[str],
    pack_id: Optional[str],
) -> bool:
    if workspace_id and str(item.get("workspace_id") or "").strip() != workspace_id:
        return False
    if status and str(item.get("status") or "").strip().lower() != status.lower().strip():
        return False
    if pack_id and str(item.get("pack_id") or "").strip().lower() != pack_id.lower().strip():
        return False
    return True


def _resolve_run_connector_binding(item: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    context = item.get("context") if isinstance(item.get("context"), dict) else {}
    metadata = context.get("metadata") if isinstance(context.get("metadata"), dict) else {}
    connector_id = str(
        item.get("connector_credential_id")
        or metadata.get("connector_credential_id")
        or ""
    ).strip()
    channel = str(
        item.get("source_channel")
        or metadata.get("source_channel")
        or metadata.get("channel")
        or ""
    ).strip().lower()
    if not connector_id and not channel:
        return None

    workspace_id = _normalize_workspace_id(
        item.get("workspace_id")
        or context.get("workspace_id")
        or metadata.get("workspace_id")
    )
    connector_row = None
    if connector_id:
        for entry in list_vault_connectors(workspace_id):
            if str(entry.get("id") or "").strip() == connector_id:
                connector_row = entry
                break

    provider = str((connector_row or {}).get("connector") or "").strip().lower()
    connector_metadata = (connector_row or {}).get("metadata") if isinstance((connector_row or {}).get("metadata"), dict) else {}
    assigned_role = normalize_agent_role(connector_metadata.get("agent_role"))
    identity_label = (
        str(connector_metadata.get("chat_id") or "").strip()
        or str(connector_metadata.get("bot_username") or "").strip()
        or str(connector_metadata.get("from_number") or "").strip()
        or str(connector_metadata.get("phone_number") or "").strip()
        or str(connector_metadata.get("emailAddress") or "").strip()
        or str(connector_metadata.get("mail") or "").strip()
        or str(connector_metadata.get("userPrincipalName") or "").strip()
        or str(connector_metadata.get("displayName") or "").strip()
        or str(connector_metadata.get("calendar_id") or "").strip()
    )
    if connector_id and not identity_label:
        try:
            secret = resolve_vault_credential(connector_id, workspace_id)
        except Exception:
            secret = {}
        identity_label = (
            str(secret.get("chat_id") or "").strip()
            or str(secret.get("channel_id") or "").strip()
            or str(secret.get("instagram_account_id") or "").strip()
            or str(secret.get("page_id") or "").strip()
            or str(secret.get("bot_username") or "").strip()
            or str(secret.get("from_number") or "").strip()
            or str(secret.get("phone_number") or "").strip()
            or str(secret.get("emailAddress") or "").strip()
            or str(secret.get("calendar_id") or "").strip()
        )

    if not channel:
        connector_channel_map = {
            "telegram_bot": "telegram",
            "whatsapp_twilio": "whatsapp",
            "google_workspace": "email",
            "microsoft_365": "email",
            "discord_bot": "discord",
            "instagram_business": "instagram",
            "irc": "irc",
        }
        channel = connector_channel_map.get(provider, "")

    if not connector_id and not channel and not provider and not identity_label:
        return None

    return {
        "connector_id": connector_id or None,
        "channel": channel or None,
        "connector": provider or None,
        "label": (connector_row or {}).get("label"),
        "identity_label": identity_label or None,
        "routing_scope": AGENT_WORKSPACE_LABELS.get(assigned_role, assigned_role) if assigned_role else "Shared workspace",
        "agent_role": assigned_role or None,
    }


def _summarize_history_item(item: Dict[str, Any]) -> Dict[str, Any]:
    policy_audit = item.get("tool_policy_audit") if isinstance(item.get("tool_policy_audit"), list) else []
    memory_trace = item.get("memory_trace") if isinstance(item.get("memory_trace"), dict) else {}
    memory_reads = memory_trace.get("reads") if isinstance(memory_trace.get("reads"), list) else []
    memory_writes = memory_trace.get("writes") if isinstance(memory_trace.get("writes"), list) else []
    blocked_count = 0
    approval_required_count = 0
    allow_count = 0
    for entry in policy_audit:
        if not isinstance(entry, dict):
            continue
        decision = str(entry.get("decision") or "").strip().lower()
        if decision == "blocked":
            blocked_count += 1
        elif decision == "approval_required":
            approval_required_count += 1
        elif decision == "allow":
            allow_count += 1
    return {
        "run_id": item.get("run_id"),
        "engine": item.get("engine"),
        "status": item.get("status"),
        "created_at": item.get("created_at"),
        "updated_at": item.get("updated_at"),
        "completed_at": item.get("completed_at"),
        "duration_ms": item.get("duration_ms"),
        "time_to_first_value_ms": item.get("time_to_first_value_ms"),
        "hitl_wait_total_ms": item.get("hitl_wait_total_ms"),
        "workflow_id": item.get("workflow_id"),
        "workspace_id": item.get("workspace_id"),
        "pack_id": item.get("pack_id"),
        "agent_role": item.get("agent_role"),
        "agent_role_source": item.get("agent_role_source"),
        "parent_run_id": item.get("parent_run_id"),
        "delegation_root_run_id": item.get("delegation_root_run_id"),
        "delegated_by_run_id": item.get("delegated_by_run_id"),
        "delegated_by_role": item.get("delegated_by_role"),
        "delegation_note": item.get("delegation_note"),
        "delegation_summary": item.get("delegation_summary_cache"),
        "delegation_next_action": item.get("delegation_next_action"),
        "delegation_ready": bool(item.get("delegation_ready")),
        "trust_mode": item.get("trust_mode"),
        "execution_target_requested": item.get("execution_target_requested"),
        "execution_target_selected": item.get("execution_target_selected"),
        "execution_target_reason": item.get("execution_target_reason"),
        "execution_target_fallback": item.get("execution_target_fallback"),
        "user_goal": item.get("user_goal"),
        "result_summary": item.get("result_summary"),
        "connector_binding": _resolve_run_connector_binding(item),
        "usage_provider": item.get("usage_provider"),
        "usage_model": item.get("usage_model"),
        "usage_total_tokens_est": item.get("usage_total_tokens_est"),
        "usage_cost_band": item.get("usage_cost_band"),
        "tool_policy_precheck": item.get("tool_policy_precheck"),
        "tool_policy_audit_count": len(policy_audit),
        "tool_policy_blocked_count": blocked_count,
        "tool_policy_approval_required_count": approval_required_count,
        "tool_policy_allow_count": allow_count,
        "memory_enabled": bool(memory_trace.get("enabled")),
        "memory_read_count": len(memory_reads),
        "memory_write_count": len(memory_writes),
        "memory_last_error": memory_trace.get("last_error"),
    }


def _get_archived_run_history_item(run_id: str) -> Optional[Dict[str, Any]]:
    with RUN_HISTORY_LOCK:
        for item in RUN_HISTORY:
            if str(item.get("run_id")) == run_id:
                return dict(item)
    return None


def _snapshot_updated_sort_ts(snapshot: Optional[Dict[str, Any]]) -> datetime:
    if not isinstance(snapshot, dict):
        return datetime.min.replace(tzinfo=timezone.utc)
    return (
        _parse_utc_ts(snapshot.get("updated_at"))
        or _parse_utc_ts(snapshot.get("completed_at"))
        or _parse_utc_ts(snapshot.get("created_at"))
        or datetime.min.replace(tzinfo=timezone.utc)
    )


def _prefer_archived_snapshot(active_snapshot: Optional[Dict[str, Any]], archived_snapshot: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    if not isinstance(active_snapshot, dict):
        return archived_snapshot if isinstance(archived_snapshot, dict) else None
    if not isinstance(archived_snapshot, dict):
        return active_snapshot
    if _snapshot_updated_sort_ts(archived_snapshot) >= _snapshot_updated_sort_ts(active_snapshot):
        return archived_snapshot
    return active_snapshot


def _get_replay_payload(run_id: str) -> Dict[str, Any]:
    active = runs.get(run_id)
    archived_item = _get_archived_run_history_item(run_id)
    active_snapshot = _serialize_run_snapshot(run_id, active) if isinstance(active, dict) else None
    chosen_snapshot = _prefer_archived_snapshot(active_snapshot, archived_item)
    if isinstance(chosen_snapshot, dict):
        chosen_snapshot["connector_binding"] = _resolve_run_connector_binding(chosen_snapshot)
        return chosen_snapshot

    raise HTTPException(status_code=404, detail="Run ID not found")


def _normalized_weekday(value: str) -> str:
    return str(value or "").strip().capitalize()


def _run_weekly_scheduler_forever():
    poll_seconds = max(5, ORION_SCHEDULER_POLL_SECONDS)
    while True:
        time.sleep(poll_seconds)
        now = datetime.now(timezone.utc)
        changed = False
        with SCHEDULES_LOCK:
            schedule_items = [dict(item) for item in WEEKLY_SCHEDULES.values()]

        for schedule in schedule_items:
            if not bool(schedule.get("enabled")):
                continue
            tz_mode = str(schedule.get("timezone") or "local").strip().lower()
            if tz_mode not in {"local", "utc"}:
                tz_mode = "local"
            day = _normalized_weekday(str(schedule.get("day_of_week") or ""))
            hhmm = str(schedule.get("time_hhmm") or "").strip()
            snapshot = _schedule_now_snapshot(now, tz_mode)
            if day != snapshot["weekday"]:
                continue
            if hhmm != snapshot["hhmm"]:
                continue
            if str(schedule.get("last_trigger_date") or "") == snapshot["date_key"]:
                continue

            schedule_id = str(schedule.get("id") or "")
            req_payload = schedule.get("run_request") if isinstance(schedule.get("run_request"), dict) else {}
            if not schedule_id or not isinstance(req_payload, dict):
                continue

            try:
                req = RunStartRequest(**req_payload)
                run_result = _create_run_from_request(req, schedule_id=schedule_id)
                with SCHEDULES_LOCK:
                    current = WEEKLY_SCHEDULES.get(schedule_id)
                    if current is not None:
                        current["last_trigger_date"] = snapshot["date_key"]
                        current["last_run_id"] = run_result.get("run_id")
                        current["last_error"] = None
                        current["updated_at"] = datetime.utcnow().isoformat() + "Z"
                        WEEKLY_SCHEDULES[schedule_id] = current
                        changed = True
            except Exception as exc:
                with SCHEDULES_LOCK:
                    current = WEEKLY_SCHEDULES.get(schedule_id)
                    if current is not None:
                        current["last_trigger_date"] = snapshot["date_key"]
                        current["last_error"] = str(exc)
                        current["updated_at"] = datetime.utcnow().isoformat() + "Z"
                        WEEKLY_SCHEDULES[schedule_id] = current
                        changed = True

        if changed:
            _persist_weekly_schedules()


init_runtime_state_db(ORION_RUNTIME_STATE_DB)
_load_run_history()
_load_approval_audit()
_load_channel_events()
_load_weekly_schedules()
_load_setup_sessions()
_load_provider_profiles()
_load_idempotency()
_load_runtime_skills_state()
_load_telegram_autopilot_state()
_load_whatsapp_autopilot_state()

if ORION_SCHEDULER_ENABLED:
    _scheduler_thread = threading.Thread(target=_run_weekly_scheduler_forever, daemon=True)
    _scheduler_thread.start()
if ORION_TELEGRAM_AUTOPILOT_ENABLED:
    TELEGRAM_AUTOPILOT_THREAD = threading.Thread(target=_run_telegram_autopilot_forever, daemon=True)
    TELEGRAM_AUTOPILOT_THREAD.start()
if ORION_WHATSAPP_AUTOPILOT_ENABLED:
    _whatsapp_autopilot_activate()

# --- ENDPOINTS ---
def _env_truthy(value: Optional[str], default: bool = False) -> bool:
    if value is None:
        return bool(default)
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


def _normalize_operator_risk_levels(raw_value: Optional[str], fallback: List[str]) -> List[str]:
    allowed = {"low", "medium", "high"}
    if raw_value is None:
        base = list(fallback)
    else:
        base = [part.strip().lower() for part in str(raw_value).split(",") if part.strip()]
        if not base:
            base = list(fallback)
    seen: Set[str] = set()
    normalized: List[str] = []
    for level in base:
        if level not in allowed or level in seen:
            continue
        normalized.append(level)
        seen.add(level)
    return normalized


def _build_cognitive_operator_policy() -> Dict[str, Any]:
    enabled = _env_truthy(os.getenv("ORION_COGNITIVE_OPERATOR_ENABLED"), default=True)
    trust_mode_default = (str(os.getenv("ORION_COGNITIVE_OPERATOR_TRUST_MODE") or "guarded").strip().lower() or "guarded")
    if trust_mode_default not in {"auto", "guarded", "strict"}:
        trust_mode_default = "guarded"

    timeout_seconds = 60
    timeout_raw = str(os.getenv("ORION_COGNITIVE_OPERATOR_TIMEOUT_SECONDS") or "60").strip()
    if timeout_raw.isdigit():
        timeout_seconds = max(1, int(timeout_raw))

    max_output_chars = 1600
    max_output_raw = str(os.getenv("ORION_COGNITIVE_OPERATOR_MAX_OUTPUT_CHARS") or "1600").strip()
    if max_output_raw.isdigit():
        max_output_chars = max(200, int(max_output_raw))

    root = str(os.getenv("ORION_COGNITIVE_OPERATOR_ROOT") or "").strip() or str(Path.cwd())
    allow_shell_fallback = _env_truthy(os.getenv("ORION_COGNITIVE_OPERATOR_ALLOW_SHELL_FALLBACK"), default=False)
    allow_prefixes_raw = (
        str(os.getenv("ORION_LOCAL_COMPANION_COMMAND_ALLOW_PREFIXES") or "").strip()
        or str(os.getenv("ORION_COGNITIVE_OPERATOR_ALLOW_PREFIXES") or "").strip()
    )
    if allow_prefixes_raw:
        allow_prefixes = [part.strip() for part in allow_prefixes_raw.split(",") if part.strip()]
    else:
        allow_prefixes = list(DEFAULT_LOCAL_COMPANION_ALLOW_PREFIXES)
    strict_approval_all = _env_truthy(os.getenv("ORION_COGNITIVE_OPERATOR_STRICT_APPROVAL_ALL"), default=False)
    strict_default = ["low", "medium", "high"] if strict_approval_all else ["medium", "high"]
    approval_levels_by_trust = {
        "auto": _normalize_operator_risk_levels(
            os.getenv("ORION_COGNITIVE_OPERATOR_APPROVAL_LEVELS_AUTO"),
            [],
        ),
        "guarded": _normalize_operator_risk_levels(
            os.getenv("ORION_COGNITIVE_OPERATOR_APPROVAL_LEVELS_GUARDED"),
            ["medium", "high"],
        ),
        "strict": _normalize_operator_risk_levels(
            os.getenv("ORION_COGNITIVE_OPERATOR_APPROVAL_LEVELS_STRICT"),
            strict_default,
        ),
    }
    return {
        "enabled": enabled,
        "trust_mode_default": trust_mode_default,
        "approval_levels_by_trust_mode": approval_levels_by_trust,
        "strict_approval_all": strict_approval_all,
        "allow_prefixes": allow_prefixes,
        "capabilities": supported_capability_catalog(Path(__file__).resolve().parent),
        "root": root,
        "timeout_seconds": timeout_seconds,
        "max_output_chars": max_output_chars,
        "allow_shell_fallback": allow_shell_fallback,
        "command_allowlist_enforced": True,
    }


def _runtime_contract_payload() -> Dict[str, Any]:
    return build_runtime_contract_payload(
        contract_schema_version=ORION_RUNTIME_CONTRACT_SCHEMA_VERSION,
        runtime_api_version=ORION_RUNTIME_API_VERSION,
        runtime_api_min_cli_version=ORION_RUNTIME_API_MIN_CLI_VERSION,
        auth_mode=ORION_AUTH_MODE,
        openai_api_key_allowed=not ORION_DISABLE_OPENAI_API_KEY,
        supported_engines=list(ENGINE_REGISTRY.keys()),
        supported_providers=list(PROVIDER_ADAPTERS.keys()),
        supported_execution_targets=sorted(list(VALID_EXECUTION_TARGETS)),
        codex_oauth_interactive_supported=False,
        codex_token_credential_supported=True,
        openai_supported_credential_fields=["api_key", "access_token", "oauth_token"],
        cognitive_operator_policy=_build_cognitive_operator_policy(),
        local_execution_capabilities=supported_capability_catalog(Path(__file__).resolve().parent),
    )


@app.get("/contract")
async def runtime_contract():
    return {
        "ok": True,
        "contract": _runtime_contract_payload(),
    }


@app.get("/memory/health", dependencies=[Depends(require_api_key)])
async def memory_health():
    snapshot = _memory_health_snapshot()
    return {
        "ok": bool(snapshot.get("enabled")) and bool(snapshot.get("manager_ready")),
        **snapshot,
    }


@app.post("/memory/search", dependencies=[Depends(require_api_key)])
async def memory_search(body: MemorySearchRequest):
    body.validate_fields()
    _memory_manager_or_503()
    bucket = _normalize_memory_bucket(body.bucket, required=False)
    workspace_id = _normalize_workspace_id(body.workspace_id) or "default"
    items = _memory_search_scoped(
        query=body.query.strip(),
        bucket=bucket,
        workspace_id=workspace_id,
        profile_id=str(body.profile_id or "").strip() or None,
        project_id=str(body.project_id or "").strip() or None,
        session_key=str(body.session_key or "").strip() or None,
        k=int(body.k),
    )
    return {
        "ok": True,
        "query": body.query.strip(),
        "bucket": bucket,
        "workspace_id": workspace_id,
        "count": len(items),
        "items": items,
    }


@app.post("/memory/upsert", dependencies=[Depends(require_api_key)])
async def memory_upsert(body: MemoryUpsertRequest):
    body.validate_fields()
    manager = _memory_manager_or_503()
    bucket = _normalize_memory_bucket(body.bucket, required=True) or "session"
    workspace_id = _normalize_workspace_id(body.workspace_id) or "default"
    retention_days = int(body.retention_days or ORION_MEMORY_RETENTION_DAYS_DEFAULT)
    expires_at = (_utc_now() + timedelta(days=retention_days)).isoformat().replace("+00:00", "Z")
    metadata = dict(body.metadata) if isinstance(body.metadata, dict) else {}
    metadata.update(
        {
            "bucket": bucket,
            "workspace_id": workspace_id,
            "profile_id": str(body.profile_id or "").strip(),
            "project_id": str(body.project_id or "").strip(),
            "session_key": str(body.session_key or "").strip(),
            "source": str(body.source or "api").strip().lower() or "api",
            "retention_days": retention_days,
            "expires_at": expires_at,
        }
    )
    if isinstance(body.id, str) and body.id.strip():
        metadata["id"] = body.id.strip()
    memory_id = manager.upsert_memory(body.text.strip(), metadata)
    return {
        "ok": True,
        "id": memory_id,
        "bucket": bucket,
        "workspace_id": workspace_id,
        "retention_days": retention_days,
        "expires_at": expires_at,
    }


@app.get("/health")
async def health():
    runtime_contract = _runtime_contract_payload()
    openai_key, openai_env_source = _openai_env_bearer_with_source()
    openai_probe = probe_openai_credential(
        openai_key=openai_key,
        openai_env_source=openai_env_source,
        openai_healthcheck=OPENAI_HEALTHCHECK,
        openai_api_url=OPENAI_API_URL,
        openai_org_id=OPENAI_ORG_ID,
        openai_project_id=OPENAI_PROJECT_ID,
        resolve_default_vault_credential=resolve_default_vault_credential,
        provider_adapters=PROVIDER_ADAPTERS,
    )

    runtime_valid = not ORION_ENGINE_VALIDATION_ERRORS
    runtime_counts = collect_runtime_counts(
        weekly_schedules=WEEKLY_SCHEDULES,
        schedules_lock=SCHEDULES_LOCK,
        setup_sessions=SETUP_SESSIONS,
        setup_sessions_lock=SETUP_SESSIONS_LOCK,
        cleanup_setup_sessions_locked=_cleanup_setup_sessions_locked,
        provider_profiles=PROVIDER_PROFILES,
        profiles_lock=PROFILES_LOCK,
        idempotency_records=IDEMPOTENCY_RECORDS,
        idempotency_lock=IDEMPOTENCY_LOCK,
        prune_idempotency_locked=_prune_idempotency_locked,
    )
    telegram_autopilot = _telegram_autopilot_snapshot()
    whatsapp_autopilot = _whatsapp_autopilot_snapshot()
    default_tool_policy = tool_policy_snapshot()
    memory_snapshot = _memory_health_snapshot()
    runtime_skills = _runtime_skills_snapshot()
    ok = bool(openai_probe["openai_key_valid"]) and runtime_valid
    return {
        "ok": ok,
        "runtime_api_version": ORION_RUNTIME_API_VERSION,
        "runtime_api_min_cli_version": ORION_RUNTIME_API_MIN_CLI_VERSION,
        "runtime_contract_schema_version": runtime_contract.get("contract_schema_version"),
        "runtime_contract_endpoint": "/contract",
        "auth_required": bool(ORION_AUTH_REQUIRED),
        "auth_insecure_dev_override": bool(ORION_DEV_INSECURE_NO_AUTH),
        "orion_api_key_configured": bool(ORION_API_KEY),
        "auth_mode": ORION_AUTH_MODE,
        "openai_api_key_allowed": not ORION_DISABLE_OPENAI_API_KEY,
        "openai_key_present": openai_probe["openai_key_present"],
        "openai_vault_present": openai_probe["openai_vault_present"],
        "openai_key_valid": openai_probe["openai_key_valid"],
        "openai_credential_source": openai_probe["openai_credential_source"],
        "openai_status": openai_probe["openai_status"],
        "openai_error": openai_probe["openai_error"],
        "engines": list(ENGINE_REGISTRY.keys()),
        "providers": list(PROVIDER_ADAPTERS.keys()),
        "codex_model": CODEX_MODEL,
        "codex_oauth_interactive_supported": False,
        "codex_token_credential_supported": True,
        "openai_supported_credential_fields": ["api_key", "access_token", "oauth_token"],
        "run_timeout_seconds": ORION_RUN_TIMEOUT_SECONDS,
        "max_retries": ORION_MAX_RETRIES,
        "retry_backoff_seconds": ORION_RETRY_BACKOFF_SECONDS,
        "tool_policy_blocked_actions": default_tool_policy.get("blocked_actions"),
        "tool_policy_approval_actions": default_tool_policy.get("approval_actions"),
        "tool_policy_allow_actions": default_tool_policy.get("allow_actions"),
        "tool_policy_sensitivity": {
            "sensitive_tools": default_tool_policy.get("sensitive_tools"),
            "critical_tools": default_tool_policy.get("critical_tools"),
            "block_cloud_critical": default_tool_policy.get("block_cloud_critical"),
            "connector_cloud_readonly": default_tool_policy.get("connector_cloud_readonly"),
        },
        "memory_enabled": memory_snapshot.get("enabled"),
        "memory_manager_ready": memory_snapshot.get("manager_ready"),
        "memory_manager_error": memory_snapshot.get("manager_error"),
        "memory_db_path": memory_snapshot.get("db_path"),
        "memory_db_exists": memory_snapshot.get("db_exists"),
        "memory_db_size_bytes": memory_snapshot.get("db_size_bytes"),
        "memory_sqlite_rows": memory_snapshot.get("sqlite_rows"),
        "memory_sqlite_error": memory_snapshot.get("sqlite_error"),
        "memory_lancedb_uri": memory_snapshot.get("lancedb_uri"),
        "memory_lancedb_initialized": memory_snapshot.get("lancedb_initialized"),
        "scheduler_enabled": ORION_SCHEDULER_ENABLED,
        "scheduler_poll_seconds": ORION_SCHEDULER_POLL_SECONDS,
        "telegram_autopilot_enabled": telegram_autopilot.get("enabled"),
        "telegram_autopilot_active": telegram_autopilot.get("active"),
        "telegram_autopilot_last_poll_at": telegram_autopilot.get("last_poll_at"),
        "telegram_autopilot_last_error": telegram_autopilot.get("last_error"),
        "telegram_autopilot_last_error_at": telegram_autopilot.get("last_error_at"),
        "telegram_autopilot_last_error_category": telegram_autopilot.get("last_error_category"),
        "telegram_autopilot_last_error_source": telegram_autopilot.get("last_error_source"),
        "telegram_autopilot_error_count": telegram_autopilot.get("error_count"),
        "telegram_autopilot_consecutive_errors": telegram_autopilot.get("consecutive_errors"),
        "telegram_autopilot_retry_count": telegram_autopilot.get("retry_count"),
        "telegram_autopilot_last_retry_at": telegram_autopilot.get("last_retry_at"),
        "telegram_autopilot_backoff_seconds": telegram_autopilot.get("backoff_seconds"),
        "telegram_autopilot_next_retry_at": telegram_autopilot.get("next_retry_at"),
        "telegram_autopilot_last_success_at": telegram_autopilot.get("last_success_at"),
        "telegram_autopilot_connectors_seen": telegram_autopilot.get("connectors_seen"),
        "telegram_autopilot_processed_updates": telegram_autopilot.get("processed_updates"),
        "telegram_autopilot_runs_started": telegram_autopilot.get("runs_started"),
        "telegram_autopilot_connector_error_count": telegram_autopilot.get("connector_error_count"),
        "telegram_autopilot_thread_alive": telegram_autopilot.get("thread_alive"),
        "telegram_autopilot_state_file": telegram_autopilot.get("state_file"),
        "telegram_autopilot_default_profile": telegram_autopilot.get("default_profile"),
        "whatsapp_autopilot_enabled": whatsapp_autopilot.get("enabled"),
        "whatsapp_autopilot_active": whatsapp_autopilot.get("active"),
        "whatsapp_autopilot_last_inbound_at": whatsapp_autopilot.get("last_inbound_at"),
        "whatsapp_autopilot_last_error": whatsapp_autopilot.get("last_error"),
        "whatsapp_autopilot_last_error_at": whatsapp_autopilot.get("last_error_at"),
        "whatsapp_autopilot_last_error_category": whatsapp_autopilot.get("last_error_category"),
        "whatsapp_autopilot_last_error_source": whatsapp_autopilot.get("last_error_source"),
        "whatsapp_autopilot_error_count": whatsapp_autopilot.get("error_count"),
        "whatsapp_autopilot_consecutive_errors": whatsapp_autopilot.get("consecutive_errors"),
        "whatsapp_autopilot_connectors_seen": whatsapp_autopilot.get("connectors_seen"),
        "whatsapp_autopilot_processed_messages": whatsapp_autopilot.get("processed_messages"),
        "whatsapp_autopilot_runs_started": whatsapp_autopilot.get("runs_started"),
        "whatsapp_autopilot_connector_error_count": whatsapp_autopilot.get("connector_error_count"),
        "whatsapp_autopilot_state_file": whatsapp_autopilot.get("state_file"),
        "whatsapp_autopilot_default_profile": whatsapp_autopilot.get("default_profile"),
        "weekly_schedules": runtime_counts["weekly_schedules"],
        "setup_sessions_total": runtime_counts["setup_sessions_total"],
        "setup_sessions_active": runtime_counts["setup_sessions_active"],
        "provider_profiles_total": runtime_counts["provider_profiles_total"],
        "idempotency_records": runtime_counts["idempotency_records"],
        "approval_ttl_seconds": ORION_APPROVAL_TTL_SECONDS,
        "setup_session_ttl_seconds": ORION_SETUP_SESSION_TTL_SECONDS,
        "idempotency_ttl_seconds": ORION_IDEMPOTENCY_TTL_SECONDS,
        "control_plane_allowed_origins": CONTROL_PLANE_ORIGINS,
        "control_plane_rate_limit_per_minute": CONTROL_PLANE_RATE_LIMIT_PER_MINUTE,
        "control_plane_rate_limit_burst": CONTROL_PLANE_RATE_LIMIT_BURST,
        "local_companion_enabled": ORION_LOCAL_COMPANION_ENABLED,
        "local_companion_lease_seconds": ORION_LOCAL_LEASE_SECONDS,
        "supported_execution_targets": sorted(list(VALID_EXECUTION_TARGETS)),
        "history_file": str(ORION_HISTORY_FILE),
        "runtime_state_db": str(ORION_RUNTIME_STATE_DB),
        "channel_events_file": str(ORION_CHANNEL_EVENTS_FILE),
        "channel_events_count": len(CHANNEL_EVENTS),
        "channel_dead_letters_file": str(ORION_CHANNEL_DEAD_LETTER_FILE),
        "channel_dead_letters_count": len(_safe_read_json(ORION_CHANNEL_DEAD_LETTER_FILE, {"items": []}).get("items") or []),
        "approval_audit_file": str(ORION_APPROVAL_AUDIT_FILE),
        "approval_audit_count": len(_safe_read_json(ORION_APPROVAL_AUDIT_FILE, {"items": []}).get("items") or []),
        "schedules_file": str(ORION_SCHEDULES_FILE),
        "setup_sessions_file": str(ORION_SETUP_SESSIONS_FILE),
        "provider_profiles_file": str(ORION_PROVIDER_PROFILES_FILE),
        "empyralis_state_home": str(EMPYRALIS_STATE_HOME),
        "runtime_skills_file": str(ORION_RUNTIME_SKILLS_FILE),
        "runtime_skills_custom_count": len(runtime_skills.get("custom_skills") or []),
        "runtime_skills_assistant_defaults_count": len(((runtime_skills.get("bindings") or {}).get("assistant_defaults") or [])),
        "runtime_skills_automation_defaults_count": len(((runtime_skills.get("bindings") or {}).get("automation_defaults") or [])),
        "runtime_skills_updated_at": runtime_skills.get("updated_at"),
        "idempotency_file": str(ORION_IDEMPOTENCY_FILE),
        "vault_file": str(VAULT_FILE),
        "vault_key_file": str(VAULT_KEY_FILE),
        "vault_cipher_prefix": ORION_VAULT_CIPHER_PREFIX,
        "vault_kdf_iterations": ORION_VAULT_KDF_ITERATIONS,
        "vault_legacy_openssl_decrypt": ORION_VAULT_LEGACY_OPENSSL_DECRYPT,
        "vault_legacy_openssl_encrypt_fallback": ORION_VAULT_LEGACY_OPENSSL_ENCRYPT_FALLBACK,
        "runtime_valid": runtime_valid,
        "runtime_contract": runtime_contract,
        "tool_policy": default_tool_policy,
        "runtime_skills": runtime_skills,
        "telegram_autopilot": telegram_autopilot,
        "whatsapp_autopilot": whatsapp_autopilot,
        "errors": ORION_ENGINE_VALIDATION_ERRORS
    }


@app.get("/mobile/handoff")
async def mobile_handoff():
    return {
        "ok": True,
        "product": "Empyralis",
        "surface": "mobile_handoff",
        "message": "Empyralis mobile handoff is ready.",
        "runtime_api_version": ORION_RUNTIME_API_VERSION,
        "auth_required": bool(ORION_AUTH_REQUIRED),
        "auth_mode": ORION_AUTH_MODE,
        "pairing": {
            "api_key_header": "X-API-Key" if ORION_AUTH_REQUIRED else None,
            "workspace_id": "default",
        },
        "tabs": ["Home", "Agents", "Runs", "Approvals", "You"],
        "endpoints": {
            "health": "/health",
            "contract": "/contract",
            "agent_snapshot": "/agents/workspace/snapshot?workspace_id=default",
            "runs": "/history/runs?workspace_id=default",
            "approvals": "/approvals?workspace_id=default",
            "artifacts": "/artifacts?workspace_id=default",
        },
        "generated_at": datetime.utcnow().isoformat() + "Z",
    }


@app.get("/validation/latest", dependencies=[Depends(require_api_key)])
async def validation_latest():
    if not ORION_VALIDATION_LATEST_FILE.exists():
        return {
            "suite": "empyralis_core_smoke",
            "generated_at": None,
            "summary": {"pass": 0, "fail": 0, "total": 0, "ok": False},
            "checks": [],
            "detail": "No validation report found yet.",
        }
    try:
        payload = json.loads(ORION_VALIDATION_LATEST_FILE.read_text(encoding="utf-8"))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to read validation report: {exc}")
    if not isinstance(payload, dict):
        raise HTTPException(status_code=500, detail="Validation report is not an object.")
    payload.setdefault("suite", "empyralis_core_smoke")
    payload.setdefault("generated_at", None)
    payload.setdefault("summary", {"pass": 0, "fail": 0, "total": 0, "ok": False})
    payload.setdefault("checks", [])
    return payload


@app.get("/validation/history", dependencies=[Depends(require_api_key)])
async def validation_history(limit: int = 10):
    safe_limit = max(1, min(limit, 30))
    items: List[Dict[str, Any]] = []
    try:
        report_files = sorted(
            ORION_VALIDATION_REPORT_DIR.glob("core_smoke_*.json"),
            key=lambda path: path.stat().st_mtime,
            reverse=True,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to read validation directory: {exc}")
    for path in report_files[:safe_limit]:
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            continue
        if not isinstance(payload, dict):
            continue
        summary = payload.get("summary") if isinstance(payload.get("summary"), dict) else {}
        items.append(
            {
                "suite": payload.get("suite") or "empyralis_core_smoke",
                "generated_at": payload.get("generated_at"),
                "summary": {
                    "pass": int(summary.get("pass") or 0),
                    "fail": int(summary.get("fail") or 0),
                    "total": int(summary.get("total") or 0),
                    "ok": bool(summary.get("ok")),
                },
                "detail": payload.get("detail"),
                "filename": path.name,
            }
        )
    return {
        "items": items,
        "count": len(items),
    }


@app.get("/doctor", dependencies=[Depends(require_api_key)])
async def doctor():
    health_data = await health()
    return build_doctor_report(
        health_data,
        {
            "ORION_AUTH_REQUIRED": ORION_AUTH_REQUIRED,
            "ORION_DEV_INSECURE_NO_AUTH": ORION_DEV_INSECURE_NO_AUTH,
            "ORION_API_KEY": ORION_API_KEY,
            "FRONTEND_ORIGINS": FRONTEND_ORIGINS,
            "CONTROL_PLANE_ORIGINS": CONTROL_PLANE_ORIGINS,
            "CONTROL_PLANE_RATE_LIMIT_PER_MINUTE": CONTROL_PLANE_RATE_LIMIT_PER_MINUTE,
            "CONTROL_PLANE_RATE_LIMIT_BURST": CONTROL_PLANE_RATE_LIMIT_BURST,
            "ORION_RUN_TIMEOUT_SECONDS": ORION_RUN_TIMEOUT_SECONDS,
            "ORION_MAX_RETRIES": ORION_MAX_RETRIES,
            "ORION_SCHEDULER_POLL_SECONDS": ORION_SCHEDULER_POLL_SECONDS,
            "ORION_SCHEDULER_ENABLED": ORION_SCHEDULER_ENABLED,
            "ORION_LOCAL_COMPANION_ENABLED": ORION_LOCAL_COMPANION_ENABLED,
            "EMPYRALIS_STATE_HOME": str(EMPYRALIS_STATE_HOME),
            "VAULT_FILE": str(VAULT_FILE),
            "ORION_VAULT_CIPHER_PREFIX": ORION_VAULT_CIPHER_PREFIX,
            "ORION_VAULT_KDF_ITERATIONS": ORION_VAULT_KDF_ITERATIONS,
            "ORION_VAULT_LEGACY_OPENSSL_DECRYPT": ORION_VAULT_LEGACY_OPENSSL_DECRYPT,
            "ORION_VAULT_LEGACY_OPENSSL_ENCRYPT_FALLBACK": ORION_VAULT_LEGACY_OPENSSL_ENCRYPT_FALLBACK,
            "ORION_SETUP_SESSIONS_FILE": str(ORION_SETUP_SESSIONS_FILE),
            "ORION_PROVIDER_PROFILES_FILE": str(ORION_PROVIDER_PROFILES_FILE),
            "ORION_IDEMPOTENCY_FILE": str(ORION_IDEMPOTENCY_FILE),
            "ORION_RUNTIME_STATE_DB": str(ORION_RUNTIME_STATE_DB),
            "ORION_MEMORY_ENABLED": ORION_MEMORY_ENABLED,
            "ORION_MEMORY_DB_PATH": ORION_MEMORY_DB_PATH,
            "ORION_MEMORY_LANCEDB_URI": ORION_MEMORY_LANCEDB_URI,
        },
    )


@app.get("/skills/state", dependencies=[Depends(require_api_key)])
async def get_runtime_skills_state():
    state = _runtime_skills_snapshot()
    return {
        "ok": True,
        "state": state,
        "builtins": RUNTIME_BUILTIN_SKILLS,
        "installed": list_installed_skills(),
    }


@app.get("/solutions/state", dependencies=[Depends(require_api_key)])
async def get_runtime_solutions_state():
    return {
        "ok": True,
        "installed": list_installed_solutions(),
        "active": active_installed_solutions(),
    }


@app.put("/skills/state", dependencies=[Depends(require_api_key)])
async def put_runtime_skills_state(body: RuntimeSkillsStateUpsertRequest):
    body.validate_fields()
    custom_skills: Optional[List[Dict[str, Any]]] = None
    if body.custom_skills is not None:
        custom_skills = []
        for item in body.custom_skills:
            card = _sanitize_skill_card(item)
            if card:
                custom_skills.append(card)
    bindings_patch: Optional[Dict[str, List[str]]] = None
    if body.bindings is not None:
        bindings_patch = {
            "assistant_defaults": _sanitize_skill_id_list(body.bindings.get("assistant_defaults")),
            "automation_defaults": _sanitize_skill_id_list(body.bindings.get("automation_defaults")),
        }
    with RUNTIME_SKILLS_LOCK:
        if custom_skills is not None:
            RUNTIME_SKILLS_STATE["custom_skills"] = custom_skills
        current_bindings = dict(RUNTIME_SKILLS_STATE.get("bindings") or {})
        if bindings_patch is not None:
            current_bindings.update(bindings_patch)
        current_bindings["assistant_defaults"] = _sanitize_skill_id_list(current_bindings.get("assistant_defaults"))
        current_bindings["automation_defaults"] = _sanitize_skill_id_list(current_bindings.get("automation_defaults"))
        RUNTIME_SKILLS_STATE["bindings"] = current_bindings
        RUNTIME_SKILLS_STATE["updated_at"] = _utc_now_iso()
    _persist_runtime_skills_state()
    state = _runtime_skills_snapshot()
    return {
        "ok": True,
        "state": state,
        "assistant_bundle": _runtime_skill_bundle_for_scope("assistant_defaults"),
        "automation_bundle": _runtime_skill_bundle_for_scope("automation_defaults"),
    }


def _ensure_installed_solution(solution_id: str) -> Dict[str, Any]:
    solution = find_installed_solution(solution_id)
    if solution is None or not bool(solution.get("enabled")):
        raise HTTPException(status_code=404, detail=f"Solution '{solution_id}' is not installed or enabled.")
    return solution


@app.api_route("/api/solutions/{solution_id}/{subpath:path}", methods=["GET", "POST", "PUT"], dependencies=[Depends(require_api_key)])
async def dispatch_installed_solution_api(solution_id: str, subpath: str, request: Request):
    _ensure_installed_solution(solution_id)
    body: Dict[str, Any] = {}
    if request.method.upper() in {"POST", "PUT", "PATCH"}:
        try:
            parsed = await request.json()
            if isinstance(parsed, dict):
                body = parsed
        except Exception:
            body = {}
    try:
        payload = call_installed_solution_hook(
            solution_id,
            "handle_api_request",
            request.method,
            subpath,
            body,
            dict(request.query_params),
        )
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except (RuntimeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if isinstance(payload, Response):
        return payload
    if isinstance(payload, (dict, list)):
        return payload
    return {"ok": True}


@app.get("/probe")
async def probe():
    runtime_valid = len(ORION_ENGINE_VALIDATION_ERRORS) == 0
    runtime_counts = collect_runtime_counts(
        weekly_schedules=WEEKLY_SCHEDULES,
        schedules_lock=SCHEDULES_LOCK,
        setup_sessions=SETUP_SESSIONS,
        setup_sessions_lock=SETUP_SESSIONS_LOCK,
        cleanup_setup_sessions_locked=_cleanup_setup_sessions_locked,
        provider_profiles=PROVIDER_PROFILES,
        profiles_lock=PROFILES_LOCK,
        idempotency_records=IDEMPOTENCY_RECORDS,
        idempotency_lock=IDEMPOTENCY_LOCK,
        prune_idempotency_locked=_prune_idempotency_locked,
    )
    local_counts = collect_local_queue_counts(
        cleanup_stale_local_claims=_cleanup_stale_local_claims,
        local_queue_lock=LOCAL_QUEUE_LOCK,
        local_worker_registry=LOCAL_WORKER_REGISTRY,
        local_pending_run_ids=LOCAL_PENDING_RUN_IDS,
        local_claimed_runs=LOCAL_CLAIMED_RUNS,
        utc_now=_utc_now,
        is_worker_online=_is_worker_online,
    )
    return build_probe_payload(
        runtime_valid=runtime_valid,
        errors=ORION_ENGINE_VALIDATION_ERRORS,
        scheduler_enabled=ORION_SCHEDULER_ENABLED,
        runtime_counts=runtime_counts,
        local_queue_counts=local_counts,
        generated_at_iso=_utc_now_iso(),
    )


def iter_logs_for_run(run_id: str):
    run = runs.get(run_id)
    if not run:
        return
    q = run["logs"]
    while True:
        try:
            data = q.get(timeout=1)
            if data is None:
                break
            if data == "__PAUSE_REQUIRED__":
                yield {"event": "pause", "data": "Human Input Needed"}
            else:
                if run.get("_first_value_mono") is None:
                    first_mono = time.monotonic()
                    run["_first_value_mono"] = first_mono
                    started = run.get("_started_mono")
                    if isinstance(started, (int, float)):
                        ttfv_ms = max(0.0, (first_mono - started) * 1000.0)
                        run["time_to_first_value_ms"] = round(ttfv_ms, 2)
                        metrics_add("first_value_sum_ms", ttfv_ms)
                        metrics_inc("first_value_count", 1)
                yield {"event": "log", "data": json.dumps(data)}
        except queue.Empty:
            status = runs.get(run_id, {}).get("status")
            if status in ["completed", "failed", "timeout"]:
                break
            continue




@app.post("/setup/sessions", dependencies=[Depends(require_api_key)])
async def create_setup_session(body: Optional[SetupSessionCreateRequest] = None):
    return await handle_create_setup_session(body)

@app.get("/setup/sessions/{session_id}", dependencies=[Depends(require_api_key)])
async def get_setup_session(session_id: str):
    return await handle_get_setup_session(session_id)

@app.post("/setup/sessions/{session_id}/actions", dependencies=[Depends(require_api_key)])
async def setup_session_action(session_id: str, body: SetupSessionActionRequest):
    return await handle_setup_session_action(session_id, body)

@app.post("/setup/sessions/{session_id}/cancel", dependencies=[Depends(require_api_key)])
async def cancel_setup_session(session_id: str):
    return await handle_cancel_setup_session(session_id)

@app.post("/setup/sessions/{session_id}/resume", dependencies=[Depends(require_api_key)])
async def resume_setup_session(session_id: str):
    return await handle_resume_setup_session(session_id)


@app.post("/onboarding/sessions", dependencies=[Depends(require_api_key)])
async def create_onboarding_session(body: Optional[SetupSessionCreateRequest] = None):
    return await handle_create_onboarding_session(body)


@app.get("/onboarding/sessions/{session_id}", dependencies=[Depends(require_api_key)])
async def get_onboarding_session(session_id: str):
    return await handle_get_onboarding_session(session_id)


@app.post("/onboarding/sessions/{session_id}/actions", dependencies=[Depends(require_api_key)])
async def onboarding_session_action(session_id: str, body: SetupSessionActionRequest):
    return await handle_onboarding_session_action(session_id, body)


@app.post("/onboarding/sessions/{session_id}/cancel", dependencies=[Depends(require_api_key)])
async def cancel_onboarding_session(session_id: str):
    return await handle_cancel_onboarding_session(session_id)


@app.post("/onboarding/sessions/{session_id}/resume", dependencies=[Depends(require_api_key)])
async def resume_onboarding_session(session_id: str):
    return await handle_resume_onboarding_session(session_id)


def _serialize_profile(profile: Dict[str, Any]) -> Dict[str, Any]:
    now = _utc_now()
    cooldown_until = _parse_utc_ts(profile.get("cooldown_until"))
    return {
        "id": profile.get("id"),
        "provider": normalize_provider_id(profile.get("provider")),
        "label": profile.get("label"),
        "credential_id": profile.get("credential_id"),
        "auth_mode": normalize_auth_mode(profile.get("provider"), profile.get("auth_mode")),
        "workspace_id": profile.get("workspace_id"),
        "priority": profile.get("priority", 100),
        "enabled": bool(profile.get("enabled", True)),
        "model": profile.get("model"),
        "health": "cooldown" if cooldown_until and cooldown_until > now else ("healthy" if bool(profile.get("enabled", True)) else "disabled"),
        "cooldown_until": profile.get("cooldown_until"),
        "last_error": profile.get("last_error"),
        "last_used_at": profile.get("last_used_at"),
        "last_success_at": profile.get("last_success_at"),
        "last_failure_at": profile.get("last_failure_at"),
        "success_count": int(profile.get("success_count", 0)),
        "failure_count": int(profile.get("failure_count", 0)),
        "created_at": profile.get("created_at"),
        "updated_at": profile.get("updated_at"),
    }


@app.get("/providers/profiles", dependencies=[Depends(require_api_key)])
async def list_provider_profiles(workspace_id: Optional[str] = None, provider: Optional[str] = None):
    requested_ws = _normalize_workspace_id(workspace_id) or None
    requested_provider = normalize_provider_id(provider) if provider else None
    with PROFILES_LOCK:
        items = [dict(item) for item in PROVIDER_PROFILES.values() if isinstance(item, dict)]
    out: List[Dict[str, Any]] = []
    for item in items:
        if requested_ws and str(item.get("workspace_id") or "default").strip() != requested_ws:
            continue
        if requested_provider and normalize_provider_id(item.get("provider")) != requested_provider:
            continue
        out.append(_serialize_profile(item))
    out.sort(key=lambda p: (str(p.get("provider") or ""), int(p.get("priority") or 100), str(p.get("label") or "")))
    return {"items": out}


@app.post("/providers/profiles", dependencies=[Depends(require_api_key)])
async def upsert_provider_profile(body: ProviderProfileUpsertRequest):
    body.validate_fields()
    workspace_id = _normalize_workspace_id(body.workspace_id) or "default"
    provider_id = normalize_provider_id(body.provider)
    auth_mode = normalize_auth_mode(provider_id, body.auth_mode)
    if auth_mode and not provider_supports_auth_mode(provider_id, auth_mode):
        raise HTTPException(status_code=400, detail=f"Unsupported auth mode '{body.auth_mode}' for provider '{provider_id}'.")
    credential_id = str(body.credential_id or "").strip()
    if provider_requires_credential(provider_id, auth_mode):
        if len(credential_id) < 6:
            raise HTTPException(status_code=400, detail="credential_id is required.")
        _ = resolve_vault_credential(credential_id, workspace_id)
    else:
        credential_id = ""
    now = _utc_now_iso()
    profile_id = str(body.id or "").strip() or str(uuid.uuid4())
    with PROFILES_LOCK:
        existing = PROVIDER_PROFILES.get(profile_id, {})
        if existing and not isinstance(existing, dict):
            existing = {}
        profile = {
            "id": profile_id,
            "provider": provider_id,
            "label": str(body.label).strip(),
            "credential_id": credential_id,
            "auth_mode": auth_mode or None,
            "workspace_id": workspace_id,
            "priority": int(body.priority),
            "enabled": bool(body.enabled),
            "model": str(body.model).strip() if body.model else None,
            "cooldown_until": existing.get("cooldown_until"),
            "last_error": existing.get("last_error"),
            "last_used_at": existing.get("last_used_at"),
            "last_success_at": existing.get("last_success_at"),
            "last_failure_at": existing.get("last_failure_at"),
            "success_count": int(existing.get("success_count", 0)),
            "failure_count": int(existing.get("failure_count", 0)),
            "created_at": existing.get("created_at") or now,
            "updated_at": now,
        }
        PROVIDER_PROFILES[profile_id] = profile
    _persist_provider_profiles()
    return {"item": _serialize_profile(profile)}


@app.post("/providers/profiles/{profile_id}/enable", dependencies=[Depends(require_api_key)])
async def enable_provider_profile(profile_id: str):
    with PROFILES_LOCK:
        profile = PROVIDER_PROFILES.get(profile_id)
        if not isinstance(profile, dict):
            raise HTTPException(status_code=404, detail="Profile not found.")
        profile["enabled"] = True
        profile["updated_at"] = _utc_now_iso()
        PROVIDER_PROFILES[profile_id] = profile
    _persist_provider_profiles()
    return {"item": _serialize_profile(profile)}


@app.post("/providers/profiles/{profile_id}/disable", dependencies=[Depends(require_api_key)])
async def disable_provider_profile(profile_id: str):
    with PROFILES_LOCK:
        profile = PROVIDER_PROFILES.get(profile_id)
        if not isinstance(profile, dict):
            raise HTTPException(status_code=404, detail="Profile not found.")
        profile["enabled"] = False
        profile["updated_at"] = _utc_now_iso()
        PROVIDER_PROFILES[profile_id] = profile
    _persist_provider_profiles()
    return {"item": _serialize_profile(profile)}


@app.delete("/providers/profiles/{profile_id}", dependencies=[Depends(require_api_key)])
async def delete_provider_profile(profile_id: str):
    with PROFILES_LOCK:
        profile = PROVIDER_PROFILES.get(profile_id)
        if not isinstance(profile, dict):
            raise HTTPException(status_code=404, detail="Profile not found.")
        del PROVIDER_PROFILES[profile_id]
    _persist_provider_profiles()
    return {"status": "ok"}


@app.get("/providers/profiles/health", dependencies=[Depends(require_api_key)])
async def provider_profiles_health(workspace_id: Optional[str] = None):
    requested_ws = _normalize_workspace_id(workspace_id) or None
    with PROFILES_LOCK:
        profiles = [dict(item) for item in PROVIDER_PROFILES.values() if isinstance(item, dict)]
    summary = {"healthy": 0, "cooldown": 0, "disabled": 0, "total": 0}
    items: List[Dict[str, Any]] = []
    for profile in profiles:
        if requested_ws and str(profile.get("workspace_id") or "default").strip() != requested_ws:
            continue
        item = _serialize_profile(profile)
        health = str(item.get("health") or "disabled")
        if health not in summary:
            health = "disabled"
        summary[health] += 1
        summary["total"] += 1
        items.append(item)
    return {"summary": summary, "items": items}


@app.get("/tools/contracts", dependencies=[Depends(require_api_key)])
async def get_tool_contracts():
    items: List[Dict[str, Any]] = []
    for tool_id, contract in TOOL_CONTRACTS.items():
        if not isinstance(contract, dict):
            continue
        items.append(
            {
                "tool_id": tool_id,
                "description": contract.get("description"),
                "optional": bool(contract.get("optional", True)),
                "allowlist_roles": contract.get("allowlist_roles", []),
                "denylist_roles": contract.get("denylist_roles", []),
                "input_schema": contract.get("input_schema", {}),
            }
        )
    items.sort(key=lambda item: str(item.get("tool_id") or ""))
    return {"items": items}


@app.post("/tools/policy/evaluate", dependencies=[Depends(require_api_key)])
async def evaluate_tools_policy(body: ToolPolicyEvaluateRequest):
    body.validate_fields()
    trust_mode = normalize_trust_mode(body.trust_mode)
    target = normalize_execution_target(body.target)
    metadata = body.metadata if isinstance(body.metadata, dict) else {}

    evaluations: List[Dict[str, Any]] = []
    for raw_tool in body.tool_ids:
        tool_id = normalize_action_id(raw_tool)
        if not tool_id:
            continue
        evaluations.append(
            evaluate_tool_policy_decision(
                tool_id=tool_id,
                trust_mode=trust_mode,
                target=target,
                metadata=metadata,
            )
        )

    return {
        "ok": True,
        "trust_mode": trust_mode,
        "target": target,
        "count": len(evaluations),
        "items": evaluations,
        "tool_policy": tool_policy_snapshot(metadata),
    }


@app.get("/providers", dependencies=[Depends(require_api_key)])
async def list_providers():
    providers = []
    for provider_id, info in PROVIDER_CATALOG.items():
        if bool(info.get("hidden")):
            continue
        providers.append({
            "id": provider_id,
            "label": info.get("label", provider_id),
            "auth": info.get("auth", []),
            "auth_modes": info.get("auth_modes", []),
            "default_auth_mode": info.get("default_auth_mode"),
            "default_model": info.get("default_model"),
        })
    return {"providers": providers}


@app.get("/providers/anthropic/local-cli/status", dependencies=[Depends(require_api_key)])
async def get_anthropic_local_cli_status():
    if not shutil.which("claude"):
        return {
            "ok": False,
            "available": False,
            "loggedIn": False,
            "message": "Claude CLI is not installed on this machine.",
        }
    try:
        result = subprocess.run(
            ["claude", "auth", "status", "--json"],
            capture_output=True,
            text=True,
            timeout=15,
            check=False,
        )
    except Exception as exc:
        return {
            "ok": False,
            "available": True,
            "loggedIn": False,
            "message": str(exc),
        }

    raw = str(result.stdout or result.stderr or "").strip()
    if result.returncode != 0:
        return {
            "ok": False,
            "available": True,
            "loggedIn": False,
            "message": raw or f"Claude auth status failed with exit code {result.returncode}.",
        }
    try:
        payload = json.loads(raw) if raw else {}
    except Exception:
        payload = {}
    logged_in = bool(payload.get("loggedIn"))
    return {
        "ok": True,
        "available": True,
        "loggedIn": logged_in,
        "authMethod": str(payload.get("authMethod") or "").strip(),
        "apiProvider": str(payload.get("apiProvider") or "").strip(),
        "message": "Claude subscription is signed in on this machine." if logged_in else "Claude subscription is not signed in yet.",
    }


@app.post("/providers/anthropic/local-cli/login", dependencies=[Depends(require_api_key)])
async def start_anthropic_local_cli_login():
    if not shutil.which("claude"):
        raise HTTPException(status_code=400, detail="Claude CLI is not installed on this machine.")
    try:
        subprocess.Popen(
            ["claude", "auth", "login"],
            cwd=str(PROJECT_ROOT),
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            stdin=subprocess.DEVNULL,
            start_new_session=True,
        )
        return {
            "ok": True,
            "message": "Claude login has been started. Complete the sign-in flow, then return here and refresh status.",
        }
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@app.post("/providers/test", dependencies=[Depends(require_api_key)])
async def test_provider_credentials(body: CredentialTestRequest):
    body.validate_fields()
    provider, _, adapter = resolve_provider_adapter(body.provider, body.credentials)
    try:
        result = adapter.validate(body.credentials)
        models = adapter.list_models(body.credentials) if result.get("ok") else []
        return {
            "ok": bool(result.get("ok")),
            "status": result.get("status"),
            "message": result.get("message", "Validation complete."),
            "provider": provider,
            "models_preview": models[:25],
        }
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@app.get("/providers/{provider}/models", dependencies=[Depends(require_api_key)])
async def get_provider_models(
    provider: str,
    credential_id: Optional[str] = None,
    workspace_id: Optional[str] = None,
    profile_id: Optional[str] = None,
):
    provider_id = normalize_provider_id(provider)
    if provider_id not in PROVIDER_CATALOG:
        raise HTTPException(status_code=400, detail=f"Unsupported provider '{provider}'")
    credentials: Dict[str, Any] = {}
    if profile_id:
        with PROFILES_LOCK:
            profile = PROVIDER_PROFILES.get(profile_id)
        if not isinstance(profile, dict):
            raise HTTPException(status_code=404, detail="Profile not found.")
        if normalize_provider_id(profile.get("provider")) != provider_id:
            raise HTTPException(status_code=400, detail="Profile provider mismatch.")
        ws = _normalize_workspace_id(workspace_id) or str(profile.get("workspace_id") or "default").strip() or "default"
        profile_auth_mode = normalize_auth_mode(provider_id, profile.get("auth_mode"))
        profile_credential_id = str(profile.get("credential_id") or "").strip()
        if profile_credential_id:
            try:
                credentials = resolve_vault_credential(profile_credential_id, ws)
            except Exception as exc:
                raise HTTPException(status_code=404, detail=str(exc))
        elif not provider_requires_credential(provider_id, profile_auth_mode):
            credentials = secretless_provider_credentials(provider_id, profile_auth_mode)
    elif credential_id:
        try:
            credentials = resolve_vault_credential(credential_id, workspace_id)
        except Exception as exc:
            raise HTTPException(status_code=404, detail=str(exc))
    elif provider_id == "openai":
        try:
            credentials = resolve_default_vault_credential("openai", workspace_id)
        except Exception:
            key, _ = _openai_env_bearer_with_source()
            if key:
                credentials = {
                    "access_token": key,
                    "org_id": OPENAI_ORG_ID,
                    "project_id": OPENAI_PROJECT_ID,
                }

    if not credentials:
        raise HTTPException(status_code=400, detail="No credential available for this provider.")

    try:
        _, _, adapter = resolve_provider_adapter(provider_id, credentials)
        models = adapter.list_models(credentials)
        return {"provider": provider_id, "models": models}
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@app.get("/credentials/vault", dependencies=[Depends(require_api_key)])
async def list_credentials_vault(workspace_id: Optional[str] = None):
    return {"items": list_vault_credentials(workspace_id)}


@app.get("/connectors", dependencies=[Depends(require_api_key)])
async def list_connectors():
    items = []
    for connector_id, info in CONNECTOR_CATALOG.items():
        items.append(
            {
                "id": connector_id,
                "label": info.get("label", connector_id),
                "auth": info.get("auth", []),
            }
        )
    return {"connectors": items}


@app.get("/connectors/vault", dependencies=[Depends(require_api_key)])
async def list_connectors_vault(workspace_id: Optional[str] = None):
    return {"items": list_vault_connectors(workspace_id)}


@app.get("/connectors/vault/{connector_id}/microsoft-drive", dependencies=[Depends(require_api_key)])
async def browse_microsoft_connector_drive(
    connector_id: str,
    workspace_id: Optional[str] = None,
    path: Optional[str] = None,
):
    try:
        secret = resolve_vault_credential(connector_id, workspace_id)
    except Exception as exc:
        raise HTTPException(status_code=404, detail=str(exc))

    if str(secret.get("_provider") or "").strip() != "microsoft_365":
        raise HTTPException(status_code=400, detail="Connector is not Microsoft 365.")

    try:
        listing = microsoft_365_list_drive_children(
            secret,
            http_json_request,
            path=str(path or ""),
            top=50,
        )
        return {
            "ok": True,
            "path": listing.get("path") or "onedrive:/",
            "items": listing.get("items") if isinstance(listing.get("items"), list) else [],
        }
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@app.get("/connectors/vault/{connector_id}/google-drive", dependencies=[Depends(require_api_key)])
async def browse_google_connector_drive(
    connector_id: str,
    workspace_id: Optional[str] = None,
    path: Optional[str] = None,
):
    try:
        secret = resolve_vault_credential(connector_id, workspace_id)
    except Exception as exc:
        raise HTTPException(status_code=404, detail=str(exc))

    if str(secret.get("_provider") or "").strip() != "google_workspace":
        raise HTTPException(status_code=400, detail="Connector is not Google Workspace.")

    try:
        listing = google_workspace_list_drive_children(
            secret,
            path=str(path or ""),
            top=50,
        )
        return {
            "ok": True,
            "path": listing.get("path") or "gdrive:/",
            "items": listing.get("items") if isinstance(listing.get("items"), list) else [],
        }
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@app.post("/connectors/vault/{connector_id}/google-doc", dependencies=[Depends(require_api_key)])
async def create_google_connector_document(
    connector_id: str,
    body: Optional[Dict[str, Any]] = None,
    workspace_id: Optional[str] = None,
):
    try:
        secret = resolve_vault_credential(connector_id, workspace_id)
    except Exception as exc:
        raise HTTPException(status_code=404, detail=str(exc))

    if str(secret.get("_provider") or "").strip() != "google_workspace":
        raise HTTPException(status_code=400, detail="Connector is not Google Workspace.")

    payload = body if isinstance(body, dict) else {}
    title = str(payload.get("title") or "").strip() or f"Empyralis Doc {datetime.utcnow().strftime('%Y-%m-%d %H:%M')}"
    try:
        created = google_workspace_create_document(secret, title)
        document_id = str(created.get("documentId") or "").strip()
        web_url = f"https://docs.google.com/document/d/{document_id}/edit" if document_id else None
        return {
            "ok": True,
            "title": title,
            "documentId": document_id or None,
            "webUrl": web_url,
            "raw": created,
        }
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@app.post("/connectors/vault/{connector_id}/google-sheet", dependencies=[Depends(require_api_key)])
async def create_google_connector_spreadsheet(
    connector_id: str,
    body: Optional[Dict[str, Any]] = None,
    workspace_id: Optional[str] = None,
):
    try:
        secret = resolve_vault_credential(connector_id, workspace_id)
    except Exception as exc:
        raise HTTPException(status_code=404, detail=str(exc))

    if str(secret.get("_provider") or "").strip() != "google_workspace":
        raise HTTPException(status_code=400, detail="Connector is not Google Workspace.")

    payload = body if isinstance(body, dict) else {}
    title = str(payload.get("title") or "").strip() or f"Empyralis Sheet {datetime.utcnow().strftime('%Y-%m-%d %H:%M')}"
    try:
        created = google_workspace_create_spreadsheet(secret, title)
        spreadsheet_id = str(created.get("spreadsheetId") or "").strip()
        web_url = str(created.get("spreadsheetUrl") or "").strip() or (
            f"https://docs.google.com/spreadsheets/d/{spreadsheet_id}/edit" if spreadsheet_id else ""
        )
        return {
            "ok": True,
            "title": title,
            "spreadsheetId": spreadsheet_id or None,
            "webUrl": web_url or None,
            "raw": created,
        }
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@app.post("/channels/whatsapp/twilio/webhook")
async def whatsapp_twilio_webhook(request: Request):
    return await handle_whatsapp_twilio_webhook(request)


@app.get("/channels/telegram/autopilot/status", dependencies=[Depends(require_api_key)])
async def telegram_autopilot_status():
    return await handle_telegram_autopilot_status()


@app.get("/channels/whatsapp/autopilot/status", dependencies=[Depends(require_api_key)])
async def whatsapp_autopilot_status():
    return await handle_whatsapp_autopilot_status()


@app.get("/channels/autopilot/profiles", dependencies=[Depends(require_api_key)])
async def list_autopilot_profiles():
    return await handle_list_autopilot_profiles()


@app.post("/channels/telegram/send", dependencies=[Depends(require_api_key)])
async def telegram_send_message(body: TelegramSendRequest):
    body.validate_fields()
    try:
        return await handle_telegram_send_message(
            text=body.text,
            workspace_id=body.workspace_id,
            session_key=body.session_key,
            chat_id=body.chat_id,
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@app.post("/channels/telegram/autopilot/test-message", dependencies=[Depends(require_api_key)])
async def telegram_autopilot_test_message(body: TelegramAutopilotTestRequest):
    body.validate_fields()
    try:
        return await handle_telegram_autopilot_test_message(
            text=body.text,
            workspace_id=body.workspace_id,
            session_key=body.session_key,
            chat_id=body.chat_id,
            connector_id=body.connector_id,
            sender_id=body.sender_id,
            timeout_seconds=body.timeout_seconds,
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@app.post("/connectors/vault", dependencies=[Depends(require_api_key)])
async def create_connector_vault(body: ConnectorUpsertRequest):
    body.validate_fields()
    connector = body.connector.lower().strip()
    credentials = body.credentials

    try:
        if connector == "google_workspace":
            test = validate_google_workspace_connector(credentials)
        elif connector == "microsoft_365":
            test = validate_microsoft_365_connector(credentials)
        elif connector == "telegram_bot":
            test = validate_telegram_connector(credentials)
        elif connector == "whatsapp_twilio":
            test = validate_whatsapp_twilio_connector(credentials)
        elif connector == "discord_bot":
            test = validate_discord_bot_connector(credentials)
        elif connector == "instagram_business":
            test = validate_instagram_business_connector(credentials)
        elif connector == "irc":
            test = validate_irc_connector(credentials)
        else:
            raise RuntimeError(f"Unsupported connector '{connector}'")
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    now = datetime.utcnow().isoformat() + "Z"
    connector_metadata = {
        **_connector_public_metadata(connector, credentials),
        **(body.metadata or {}),
    }
    if connector == "google_workspace" and isinstance(test, dict):
        profile = test.get("profile") if isinstance(test.get("profile"), dict) else {}
        email_address = str(profile.get("emailAddress") or "").strip() if isinstance(profile, dict) else ""
        auth_mode = str(credentials.get("auth_mode") or credentials.get("authMode") or "").strip().lower()
        drive = test.get("drive") if isinstance(test.get("drive"), dict) else {}
        drive_type = str(drive.get("driveType") or "").strip() if isinstance(drive, dict) else ""
        if email_address:
            connector_metadata["emailAddress"] = email_address
        if auth_mode:
            connector_metadata["auth_mode"] = auth_mode
        if drive_type:
            connector_metadata["drive_type"] = drive_type
    if connector == "microsoft_365" and isinstance(test, dict):
        profile = test.get("profile") if isinstance(test.get("profile"), dict) else {}
        display_name = str(profile.get("displayName") or "").strip() if isinstance(profile, dict) else ""
        mail = str(profile.get("mail") or "").strip() if isinstance(profile, dict) else ""
        user_principal_name = str(profile.get("userPrincipalName") or "").strip() if isinstance(profile, dict) else ""
        account_id = str(profile.get("id") or "").strip() if isinstance(profile, dict) else ""
        drive = test.get("drive") if isinstance(test.get("drive"), dict) else {}
        drive_id = str(drive.get("id") or "").strip() if isinstance(drive, dict) else ""
        drive_type = str(drive.get("driveType") or "").strip() if isinstance(drive, dict) else ""
        if display_name:
            connector_metadata["displayName"] = display_name
        if mail:
            connector_metadata["mail"] = mail
            connector_metadata["email"] = mail
        if user_principal_name:
            connector_metadata["userPrincipalName"] = user_principal_name
        if drive_id:
            connector_metadata["drive_id"] = drive_id
        if drive_type:
            connector_metadata["drive_type"] = drive_type
        if account_id:
            credentials = {**credentials, "account_id": account_id}
        if user_principal_name and not credentials.get("userPrincipalName"):
            credentials = {**credentials, "userPrincipalName": user_principal_name}
        if drive_id and not credentials.get("drive_id"):
            credentials = {**credentials, "drive_id": drive_id}

    duplicate = _find_duplicate_connector_entry(connector, credentials, body.workspace_id)
    if isinstance(duplicate, dict):
        raise HTTPException(
            status_code=409,
            detail=(
                "Duplicate connector identity already exists: "
                f"{str(duplicate.get('label') or duplicate.get('id') or 'existing connector')}"
            ),
        )

    entry = {
        "id": str(uuid.uuid4()),
        "label": body.label.strip(),
        "provider": connector,
        "workspace_id": _normalize_workspace_id(body.workspace_id),
        "mode": "connector",
        "metadata": _sanitize_connector_metadata(connector_metadata),
        "created_at": now,
        "updated_at": now,
        "encrypted_secret": _openssl_encrypt(json.dumps(credentials, separators=(",", ":"))),
    }

    vault = load_vault()
    existing = vault.get("credentials", [])
    if not isinstance(existing, list):
        existing = []
    existing.append(entry)
    vault["credentials"] = existing
    save_vault(vault)

    return {
        "id": entry["id"],
        "label": entry["label"],
        "connector": connector,
        "workspace_id": entry.get("workspace_id"),
        "metadata": entry["metadata"],
        "created_at": entry["created_at"],
        "updated_at": entry["updated_at"],
        "test": test,
    }


@app.patch("/connectors/vault/{credential_id}", dependencies=[Depends(require_api_key)])
async def update_connector_vault(credential_id: str, body: ConnectorPatchRequest):
    body.validate_fields()
    vault = load_vault()
    existing = vault.get("credentials", [])
    if not isinstance(existing, list):
        existing = []

    found = False
    updated_entry: Dict[str, Any] | None = None
    next_items: List[Dict[str, Any]] = []
    requested_workspace = _normalize_workspace_id(body.workspace_id)
    for item in existing:
        if not isinstance(item, dict):
            next_items.append(item)
            continue
        if str(item.get("id") or "").strip() != credential_id:
            next_items.append(item)
            continue
        found = True
        if str(item.get("mode") or "").strip().lower() != "connector":
            raise HTTPException(status_code=400, detail="Credential is not a connector.")
        if not _workspace_visible(item.get("workspace_id"), requested_workspace):
            raise HTTPException(status_code=403, detail="Connector is not accessible for this workspace.")
        next_item = dict(item)
        if body.label is not None:
            next_item["label"] = body.label.strip()
        if body.metadata is not None:
            merged_metadata = dict(next_item.get("metadata") if isinstance(next_item.get("metadata"), dict) else {})
            for key, value in body.metadata.items():
                if value is None:
                    merged_metadata.pop(str(key), None)
                else:
                    merged_metadata[str(key)] = value
            next_item["metadata"] = _sanitize_connector_metadata(merged_metadata)
        next_item["updated_at"] = datetime.utcnow().isoformat() + "Z"
        updated_entry = next_item
        next_items.append(next_item)
    if not found or not isinstance(updated_entry, dict):
        raise HTTPException(status_code=404, detail="Connector not found.")

    vault["credentials"] = next_items
    save_vault(vault)
    return {
        "id": updated_entry["id"],
        "label": updated_entry["label"],
        "connector": str(updated_entry.get("provider") or "").strip().lower(),
        "workspace_id": updated_entry.get("workspace_id"),
        "metadata": updated_entry.get("metadata") if isinstance(updated_entry.get("metadata"), dict) else {},
        "created_at": updated_entry.get("created_at"),
        "updated_at": updated_entry.get("updated_at"),
    }


@app.post("/connectors/vault/{credential_id}/test", dependencies=[Depends(require_api_key)])
async def test_connector_vault(credential_id: str, workspace_id: Optional[str] = None):
    try:
        credentials = resolve_vault_credential(credential_id, workspace_id)
    except Exception as exc:
        raise HTTPException(status_code=404, detail=str(exc))

    connector = str(credentials.get("_provider") or "").lower().strip()
    if connector == "google_workspace":
        try:
            return validate_google_workspace_connector(credentials)
        except Exception as exc:
            raise HTTPException(status_code=400, detail=str(exc))
    if connector == "microsoft_365":
        try:
            return validate_microsoft_365_connector(credentials)
        except Exception as exc:
            raise HTTPException(status_code=400, detail=str(exc))
    if connector == "telegram_bot":
        try:
            return validate_telegram_connector(credentials)
        except Exception as exc:
            raise HTTPException(status_code=400, detail=str(exc))
    if connector == "whatsapp_twilio":
        try:
            return validate_whatsapp_twilio_connector(credentials)
        except Exception as exc:
            raise HTTPException(status_code=400, detail=str(exc))
    if connector == "discord_bot":
        try:
            return validate_discord_bot_connector(credentials)
        except Exception as exc:
            raise HTTPException(status_code=400, detail=str(exc))
    if connector == "instagram_business":
        try:
            return validate_instagram_business_connector(credentials)
        except Exception as exc:
            raise HTTPException(status_code=400, detail=str(exc))
    if connector == "irc":
        try:
            return validate_irc_connector(credentials)
        except Exception as exc:
            raise HTTPException(status_code=400, detail=str(exc))

    raise HTTPException(status_code=400, detail=f"Unsupported connector '{connector}'")


@app.delete("/connectors/vault/{credential_id}", dependencies=[Depends(require_api_key)])
async def delete_connector_vault(credential_id: str, workspace_id: Optional[str] = None):
    vault = load_vault()
    existing = vault.get("credentials", [])
    if not isinstance(existing, list):
        existing = []
    found = False
    next_items = []
    for item in existing:
        if not isinstance(item, dict):
            next_items.append(item)
            continue
        if str(item.get("id") or "").strip() != credential_id:
            next_items.append(item)
            continue
        found = True
        if str(item.get("mode") or "").strip().lower() != "connector":
            raise HTTPException(status_code=400, detail="Credential is not a connector.")
        if not _workspace_visible(item.get("workspace_id"), workspace_id):
            raise HTTPException(status_code=403, detail="Connector is not accessible for this workspace.")
    if not found:
        raise HTTPException(status_code=404, detail="Connector not found.")
    vault["credentials"] = next_items
    save_vault(vault)
    return {"status": "ok"}


@app.post("/credentials/vault", dependencies=[Depends(require_api_key)])
async def create_vault_credential(body: CredentialUpsertRequest):
    body.validate_fields()
    provider = normalize_provider_id(body.provider)
    credentials = dict(body.credentials or {})
    auth_mode = normalize_auth_mode(provider, credentials=credentials)
    if auth_mode and not provider_supports_auth_mode(provider, auth_mode):
        raise HTTPException(status_code=400, detail=f"Unsupported auth mode '{auth_mode}' for provider '{provider}'.")
    if auth_mode:
        credentials["auth_mode"] = auth_mode
    _, _, adapter = resolve_provider_adapter(provider, credentials)

    try:
        check = adapter.validate(credentials)
        if not check.get("ok"):
            raise RuntimeError(check.get("message", "Credential validation failed."))
        models = adapter.list_models(credentials)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    now = datetime.utcnow().isoformat() + "Z"
    entry_metadata = {
        **_provider_public_metadata(provider, credentials),
        **(body.metadata or {}),
    }
    entry = {
        "id": str(uuid.uuid4()),
        "label": body.label.strip(),
        "provider": provider,
        "workspace_id": _normalize_workspace_id(body.workspace_id),
        "mode": body.mode,
        "metadata": entry_metadata,
        "created_at": now,
        "updated_at": now,
        "encrypted_secret": _openssl_encrypt(json.dumps(credentials, separators=(",", ":"))),
    }

    vault = load_vault()
    existing = vault.get("credentials", [])
    if not isinstance(existing, list):
        existing = []
    existing.append(entry)
    vault["credentials"] = existing
    save_vault(vault)

    return {
        "id": entry["id"],
        "label": entry["label"],
        "provider": entry["provider"],
        "workspace_id": entry.get("workspace_id"),
        "mode": entry["mode"],
        "metadata": entry["metadata"],
        "created_at": entry["created_at"],
        "updated_at": entry["updated_at"],
        "models_preview": models[:25],
    }


@app.delete("/credentials/vault/{credential_id}", dependencies=[Depends(require_api_key)])
async def delete_vault_credential(credential_id: str, workspace_id: Optional[str] = None):
    vault = load_vault()
    existing = vault.get("credentials", [])
    if not isinstance(existing, list):
        existing = []
    found = False
    next_items = []
    for item in existing:
        if item.get("id") != credential_id:
            next_items.append(item)
            continue
        found = True
        if not _workspace_visible(item.get("workspace_id"), workspace_id):
            raise HTTPException(status_code=403, detail="Credential is not accessible for this workspace.")
    if not found:
        raise HTTPException(status_code=404, detail="Credential not found.")
    vault["credentials"] = next_items
    save_vault(vault)
    return {"status": "ok"}


@app.post("/credentials/vault/{credential_id}/test", dependencies=[Depends(require_api_key)])
async def test_vault_credential(credential_id: str, workspace_id: Optional[str] = None):
    try:
        credentials = resolve_vault_credential(credential_id, workspace_id)
    except Exception as exc:
        raise HTTPException(status_code=404, detail=str(exc))

    try:
        provider, _, adapter = resolve_provider_adapter(credentials.get("_provider"), credentials)
        result = adapter.validate(credentials)
        models = adapter.list_models(credentials)
        return {
            "ok": bool(result.get("ok")),
            "status": result.get("status"),
            "message": result.get("message", "Validation complete."),
            "provider": provider,
            "models_preview": models[:25],
        }
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@app.post("/credentials/vault/rotate-key", dependencies=[Depends(require_api_key)])
async def rotate_vault_key(body: VaultRotateKeyRequest):
    body.validate_fields()
    if VAULT_KEY_ENV and VAULT_KEY_ENV.strip():
        raise HTTPException(
            status_code=400,
            detail="Vault key rotation is disabled while CREDENTIAL_VAULT_KEY env var is active.",
        )

    old_passphrase = _vault_passphrase()
    new_passphrase = body.new_passphrase.strip()
    if old_passphrase == new_passphrase:
        return {"status": "ok", "rotated": 0, "message": "New key matches current key."}

    vault = load_vault()
    items = vault.get("credentials", [])
    if not isinstance(items, list):
        items = []

    rotated = 0
    now = datetime.utcnow().isoformat() + "Z"
    for entry in items:
        encrypted = entry.get("encrypted_secret")
        if not isinstance(encrypted, str) or not encrypted:
            continue
        plain = _openssl_decrypt_with_passphrase(encrypted, old_passphrase)
        entry["encrypted_secret"] = _openssl_encrypt_with_passphrase(plain, new_passphrase)
        entry["updated_at"] = now
        rotated += 1

    vault["credentials"] = items
    save_vault(vault)
    _set_vault_passphrase(new_passphrase)
    return {"status": "ok", "rotated": rotated}


@app.post("/credentials/vault/export", dependencies=[Depends(require_api_key)])
async def export_vault_credentials(body: VaultExportRequest):
    body.validate_fields()
    workspace_id = _normalize_workspace_id(body.workspace_id)
    passphrase = body.passphrase.strip()

    vault = load_vault()
    items = vault.get("credentials", [])
    if not isinstance(items, list):
        items = []

    export_items = []
    for entry in items:
        if not _workspace_visible(entry.get("workspace_id"), workspace_id):
            continue
        encrypted = entry.get("encrypted_secret")
        if not isinstance(encrypted, str) or not encrypted:
            continue
        try:
            plain = _openssl_decrypt(encrypted)
            creds = json.loads(plain)
        except Exception:
            continue
        if not isinstance(creds, dict):
            continue
        export_items.append({
            "label": entry.get("label"),
            "provider": entry.get("provider"),
            "workspace_id": entry.get("workspace_id"),
            "mode": entry.get("mode", "byok"),
            "metadata": entry.get("metadata", {}),
            "credentials": creds,
        })

    export_doc = {
        "version": 1,
        "workspace_id": workspace_id,
        "exported_at": datetime.utcnow().isoformat() + "Z",
        "credentials": export_items,
    }
    bundle = _openssl_encrypt_with_passphrase(
        json.dumps(export_doc, separators=(",", ":")),
        passphrase,
    )
    return {
        "status": "ok",
        "workspace_id": workspace_id,
        "count": len(export_items),
        "bundle": bundle,
    }


@app.post("/credentials/vault/import", dependencies=[Depends(require_api_key)])
async def import_vault_credentials(body: VaultImportRequest):
    body.validate_fields()
    workspace_override = _normalize_workspace_id(body.workspace_id)
    passphrase = body.passphrase.strip()

    try:
        plain = _openssl_decrypt_with_passphrase(body.bundle.strip(), passphrase)
        parsed = json.loads(plain)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Invalid import bundle: {exc}")

    if not isinstance(parsed, dict):
        raise HTTPException(status_code=400, detail="Import bundle payload is invalid.")
    raw_items = parsed.get("credentials")
    if not isinstance(raw_items, list):
        raise HTTPException(status_code=400, detail="Import bundle is missing credentials list.")

    vault = load_vault()
    existing = vault.get("credentials", [])
    if not isinstance(existing, list):
        existing = []

    index_by_identity = {}
    for idx, item in enumerate(existing):
        provider = str(item.get("provider") or "").strip().lower()
        label = str(item.get("label") or "").strip()
        if not provider or not label:
            continue
        key = _credential_identity(provider, label, item.get("workspace_id"))
        index_by_identity[key] = idx

    imported = 0
    overwritten = 0
    skipped = 0
    now = datetime.utcnow().isoformat() + "Z"

    for raw in raw_items:
        if not isinstance(raw, dict):
            skipped += 1
            continue
        provider = str(raw.get("provider") or "").strip().lower()
        label = str(raw.get("label") or "").strip()
        mode = str(raw.get("mode") or "byok").strip().lower()
        metadata = raw.get("metadata")
        credentials = raw.get("credentials")
        item_workspace_id = workspace_override if workspace_override is not None else _normalize_workspace_id(raw.get("workspace_id"))

        if provider not in PROVIDER_CATALOG or len(label) < 2:
            skipped += 1
            continue
        if mode not in ["byok", "managed", "vertex"]:
            mode = "byok"
        if not isinstance(credentials, dict) or len(credentials) == 0:
            skipped += 1
            continue
        if not isinstance(metadata, dict):
            metadata = {}
        metadata = {
            **_provider_public_metadata(provider, credentials),
            **metadata,
        }

        encrypted_secret = _openssl_encrypt(json.dumps(credentials, separators=(",", ":")))
        identity = _credential_identity(provider, label, item_workspace_id)
        existing_idx = index_by_identity.get(identity)
        if existing_idx is not None:
            if not body.overwrite:
                skipped += 1
                continue
            previous = existing[existing_idx]
            existing[existing_idx] = {
                "id": previous.get("id") or str(uuid.uuid4()),
                "label": label,
                "provider": provider,
                "workspace_id": item_workspace_id,
                "mode": mode,
                "metadata": metadata,
                "created_at": previous.get("created_at") or now,
                "updated_at": now,
                "encrypted_secret": encrypted_secret,
            }
            overwritten += 1
            continue

        existing.append({
            "id": str(uuid.uuid4()),
            "label": label,
            "provider": provider,
            "workspace_id": item_workspace_id,
            "mode": mode,
            "metadata": metadata,
            "created_at": now,
            "updated_at": now,
            "encrypted_secret": encrypted_secret,
        })
        index_by_identity[identity] = len(existing) - 1
        imported += 1

    vault["credentials"] = existing
    save_vault(vault)
    return {
        "status": "ok",
        "imported": imported,
        "overwritten": overwritten,
        "skipped": skipped,
        "workspace_id": workspace_override,
    }


VALID_AGENT_ROLES: Set[str] = {
    "orchestrator",
    "support",
    "sales",
    "research",
    "finance",
    "builder",
    "private-assistant",
}

AGENT_ROLE_ALIASES: Dict[str, str] = {
    "ceo": "orchestrator",
    "dispatcher": "orchestrator",
    "support-inbox": "support",
    "support_inbox": "support",
    "customer-support": "support",
    "customer_support": "support",
    "sales-booking": "sales",
    "sales_booking": "sales",
    "booking": "sales",
    "research-memory": "research",
    "research_memory": "research",
    "memory": "research",
    "finance-sheets": "finance",
    "finance_sheets": "finance",
    "sheets": "finance",
    "builder-ops": "builder",
    "builder_ops": "builder",
    "developer": "builder",
    "design": "builder",
    "private assistant": "private-assistant",
    "private_assistant": "private-assistant",
}

AGENT_ROLE_KEYWORDS: Dict[str, List[str]] = {
    "support": ["support", "customer", "feedback", "reply", "inbox", "message", "complaint", "telegram", "whatsapp"],
    "sales": ["sales", "lead", "booking", "book", "appointment", "follow-up", "follow up", "pipeline", "convert", "slot"],
    "research": ["research", "study", "exam", "memory", "brief", "summary", "docs", "analyze", "analysis", "plan"],
    "finance": ["finance", "sheet", "sheets", "excel", "budget", "invoice", "expense", "revenue", "report", "spreadsheet"],
    "builder": ["build", "builder", "code", "debug", "fix", "frontend", "backend", "design", "automation", "script", "workflow", "platform"],
    "private-assistant": ["personal", "private", "reminder", "study", "habit", "routine", "travel", "note", "calendar"],
}

OUTCOME_PACK_AGENT_ROLE_MAP: Dict[str, str] = {
    "customer-ops-autopilot": "sales",
    "weekly-content": "research",
    "competitor-brief": "research",
    "spreadsheet-ops": "finance",
    "spreadsheet-ops-v1": "finance",
    "document-studio-v1": "builder",
    "local-execution-v1": "builder",
}


def normalize_agent_role(value: Any) -> str:
    raw = str(value or "").strip().lower()
    if not raw:
        return ""
    raw = AGENT_ROLE_ALIASES.get(raw, raw)
    return raw if raw in VALID_AGENT_ROLES else ""


def _detect_agent_role(req: RunStartRequest, metadata: Dict[str, Any]) -> Tuple[str, str]:
    if ORION_SINGLE_AGENT_MODE:
        return ORION_SINGLE_AGENT_ROLE, "single_agent"
    explicit = normalize_agent_role(req.agent_role or metadata.get("agent_role"))
    if explicit:
        return explicit, "explicit"

    agents = req.agents if isinstance(req.agents, list) else []
    for item in agents:
        if not isinstance(item, dict):
            continue
        candidate = normalize_agent_role(item.get("agent_role") or item.get("role") or item.get("kind") or item.get("id"))
        if candidate:
            return candidate, "agents"

    outcome_pack = str(metadata.get("outcome_pack") or "").strip().lower()
    if outcome_pack:
        mapped = OUTCOME_PACK_AGENT_ROLE_MAP.get(outcome_pack)
        if mapped:
            return mapped, "outcome_pack"

    haystack = " ".join(
        part
        for part in [
            str(req.user_goal or "").strip(),
            str(req.business_plan or "").strip(),
            outcome_pack,
            " ".join(
                sorted(str(key).strip().lower() for key in (metadata.get("pack_inputs") or {}).keys())
            ) if isinstance(metadata.get("pack_inputs"), dict) else "",
        ]
        if part
    ).lower()

    best_role = "builder"
    best_score = 0
    for role, keywords in AGENT_ROLE_KEYWORDS.items():
        score = sum(1 for keyword in keywords if keyword in haystack)
        if score > best_score:
            best_role = role
            best_score = score
    if best_score > 0:
        return best_role, "inferred"

    if any(token in haystack for token in ["plan", "summary", "analyze", "analysis", "docs"]):
        return "research", "inferred"

    return "builder", "default"


def _normalize_run_id_token(value: Any) -> Optional[str]:
    token = str(value or "").strip()
    if not token:
        return None
    try:
        return str(uuid.UUID(token))
    except Exception:
        return None


def _extract_run_relationships_from_context(context: Dict[str, Any]) -> Dict[str, Optional[str]]:
    metadata = context.get("metadata") if isinstance(context.get("metadata"), dict) else {}
    if not isinstance(metadata, dict):
        metadata = {}
    return {
        "parent_run_id": _normalize_run_id_token(metadata.get("parent_run_id")),
        "delegation_root_run_id": _normalize_run_id_token(metadata.get("delegation_root_run_id")),
        "delegated_by_run_id": _normalize_run_id_token(metadata.get("delegated_by_run_id")),
        "delegated_by_role": normalize_agent_role(metadata.get("delegated_by_role")) or None,
        "delegation_note": str(metadata.get("delegation_note") or "").strip() or None,
        "retry_of_run_id": _normalize_run_id_token(metadata.get("retry_of_run_id")),
        "retry_root_run_id": _normalize_run_id_token(metadata.get("retry_root_run_id")),
    }


def _run_relation_summary(snapshot: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "run_id": snapshot.get("run_id"),
        "status": snapshot.get("status"),
        "agent_role": snapshot.get("agent_role"),
        "agent_role_source": snapshot.get("agent_role_source"),
        "agent_label": AGENT_WORKSPACE_LABELS.get(str(snapshot.get("agent_role") or "").strip().lower(), str(snapshot.get("agent_role") or "")) if snapshot.get("agent_role") else None,
        "user_goal": snapshot.get("user_goal"),
        "result_summary": snapshot.get("result_summary"),
        "created_at": snapshot.get("created_at"),
        "updated_at": snapshot.get("updated_at"),
        "completed_at": snapshot.get("completed_at"),
        "parent_run_id": snapshot.get("parent_run_id"),
        "delegation_root_run_id": snapshot.get("delegation_root_run_id"),
        "delegated_by_run_id": snapshot.get("delegated_by_run_id"),
        "delegated_by_role": snapshot.get("delegated_by_role"),
        "delegation_note": snapshot.get("delegation_note"),
        "retry_of_run_id": snapshot.get("retry_of_run_id"),
        "retry_root_run_id": snapshot.get("retry_root_run_id"),
        "retry_sequence": snapshot.get("retry_sequence"),
    }


def _iter_known_run_snapshots() -> List[Dict[str, Any]]:
    items: List[Dict[str, Any]] = []
    seen: Set[str] = set()
    for run_id, run in list(runs.items()):
        if not isinstance(run, dict):
            continue
        snapshot = _serialize_run_snapshot(run_id, run)
        run_id_value = str(snapshot.get("run_id") or "").strip()
        if not run_id_value or run_id_value in seen:
            continue
        seen.add(run_id_value)
        items.append(snapshot)
    with RUN_HISTORY_LOCK:
        history_items = list(RUN_HISTORY)
    for item in history_items:
        if not isinstance(item, dict):
            continue
        run_id_value = str(item.get("run_id") or "").strip()
        if not run_id_value or run_id_value in seen:
            continue
        seen.add(run_id_value)
        items.append(item)
    return items


def _find_run_relationships(target_run_id: str, snapshot: Dict[str, Any]) -> Tuple[Optional[Dict[str, Any]], List[Dict[str, Any]]]:
    context = snapshot.get("context") if isinstance(snapshot.get("context"), dict) else {}
    relationships = _extract_run_relationships_from_context(context) if isinstance(context, dict) else {}
    parent_run_id = relationships.get("parent_run_id")
    parent_summary: Optional[Dict[str, Any]] = None
    child_summaries: List[Dict[str, Any]] = []
    for candidate in _iter_known_run_snapshots():
        candidate_run_id = str(candidate.get("run_id") or "").strip()
        if not candidate_run_id or candidate_run_id == target_run_id:
            continue
        candidate_parent_run_id = _normalize_run_id_token(candidate.get("parent_run_id"))
        if candidate_parent_run_id == target_run_id:
            child_summaries.append(_run_relation_summary(candidate))
        if parent_run_id and candidate_run_id == parent_run_id:
            parent_summary = _run_relation_summary(candidate)
    child_summaries.sort(
        key=lambda item: (
            _parse_utc_ts(item.get("updated_at")) or _parse_utc_ts(item.get("created_at")) or datetime.min.replace(tzinfo=timezone.utc),
            str(item.get("run_id") or ""),
        ),
        reverse=True,
    )
    return parent_summary, child_summaries


def _build_delegation_summary(
    snapshot: Dict[str, Any],
    child_runs: List[Dict[str, Any]],
) -> Optional[Dict[str, Any]]:
    if not isinstance(child_runs, list) or not child_runs:
        return None

    total_children = len(child_runs)
    latest_by_lineage: Dict[str, Dict[str, Any]] = {}
    for child in child_runs:
        lineage_key = (
            _normalize_run_id_token(child.get("retry_root_run_id"))
            or _normalize_run_id_token(child.get("retry_of_run_id"))
            or _normalize_run_id_token(child.get("run_id"))
            or str(child.get("run_id") or "")
        )
        previous = latest_by_lineage.get(lineage_key)
        child_sort_key = (
            _parse_utc_ts(child.get("updated_at")) or _parse_utc_ts(child.get("created_at")) or datetime.min.replace(tzinfo=timezone.utc),
            str(child.get("run_id") or ""),
        )
        previous_sort_key = (
            _parse_utc_ts(previous.get("updated_at")) or _parse_utc_ts(previous.get("created_at")) or datetime.min.replace(tzinfo=timezone.utc),
            str(previous.get("run_id") or ""),
        ) if isinstance(previous, dict) else None
        if previous_sort_key is None or child_sort_key > previous_sort_key:
            latest_by_lineage[lineage_key] = child

    effective_child_runs = list(latest_by_lineage.values())
    effective_children = len(effective_child_runs)
    terminal_children = 0
    completed_children = 0
    failed_children = 0
    waiting_children = 0
    active_children = 0
    child_roles: List[str] = []
    child_summaries: List[str] = []
    failed_run_ids: List[str] = []

    for child in effective_child_runs:
        status = str(child.get("status") or "").strip().lower()
        role = normalize_agent_role(child.get("agent_role")) or str(child.get("agent_role") or "").strip().lower()
        if role and role not in child_roles:
            child_roles.append(role)
        if status in TERMINAL_RUN_STATUSES:
            terminal_children += 1
        else:
            active_children += 1
        if status == "completed":
            completed_children += 1
        elif status == "failed":
            failed_children += 1
            child_run_id = _normalize_run_id_token(child.get("run_id"))
            if child_run_id:
                failed_run_ids.append(child_run_id)
        elif status in {"waiting", "waiting_for_input"}:
            waiting_children += 1

        label = AGENT_WORKSPACE_LABELS.get(role, role or "Agent")
        summary = str(child.get("result_summary") or child.get("user_goal") or "").strip()
        if status == "completed" and summary:
            child_summaries.append(f"{label}: {summary}")
        elif status == "failed":
            child_summaries.append(f"{label}: failed")
        elif status in {"waiting", "waiting_for_input"}:
            child_summaries.append(f"{label}: waiting")
        elif status and status not in TERMINAL_RUN_STATUSES:
            child_summaries.append(f"{label}: {status}")

    if active_children > 0:
        overall_status = "active"
        next_action = "waiting_for_children"
    elif waiting_children > 0:
        overall_status = "waiting"
        next_action = "resolve_child_approvals"
    elif failed_children > 0:
        overall_status = "attention"
        next_action = "retry_failed_children"
    else:
        overall_status = "completed"
        next_action = "merge_results"

    summary_text = "; ".join(child_summaries[:4]).strip() or None
    return {
        "ready": active_children == 0 and waiting_children == 0,
        "overall_status": overall_status,
        "next_action": next_action,
        "total_children": total_children,
        "effective_children": effective_children,
        "terminal_children": terminal_children,
        "completed_children": completed_children,
        "failed_children": failed_children,
        "waiting_children": waiting_children,
        "active_children": active_children,
        "failed_run_ids": failed_run_ids,
        "retryable_failed_children": len(failed_run_ids),
        "ready_for_merge": active_children == 0 and waiting_children == 0 and failed_children == 0 and completed_children > 0,
        "child_roles": child_roles,
        "summary_text": summary_text,
        "parent_run_id": snapshot.get("run_id"),
    }


def _prepare_run_start_request(req: RunStartRequest) -> Dict[str, Any]:
    engine = (req.engine or "orion").lower().strip()
    metadata = dict(req.metadata) if isinstance(req.metadata, dict) else {}
    outcome_pack = str(metadata.get("outcome_pack") or "").strip().lower()
    if engine not in ENGINE_REGISTRY:
        raise HTTPException(status_code=400, detail=f"Unsupported engine '{engine}'")
    if engine == "orion" and ORION_ENGINE_VALIDATION_ERRORS:
        raise HTTPException(status_code=503, detail="Empyralis runtime validation failed.")
    if engine == "orion" and outcome_pack and outcome_pack not in SUPPORTED_OUTCOME_PACKS:
        raise HTTPException(status_code=400, detail=f"Unsupported outcome pack '{outcome_pack}'")

    if engine == "orion":
        raw_trust_mode = str(metadata.get("trust_mode") or "").strip().lower()
        normalized_trust_mode = normalize_trust_mode(raw_trust_mode)
        if raw_trust_mode and raw_trust_mode not in TRUST_MODE_ALIASES and raw_trust_mode not in VALID_TRUST_MODES:
            raise HTTPException(
                status_code=400,
                detail="Unsupported trust_mode. Use one of: auto, guarded, strict, cost_guard, sensitive_guard.",
            )
        metadata["trust_mode"] = normalized_trust_mode

        if "pack_inputs" in metadata and not isinstance(metadata.get("pack_inputs"), dict):
            raise HTTPException(status_code=400, detail="metadata.pack_inputs must be an object.")
        if "outcome_scope" in metadata and not isinstance(metadata.get("outcome_scope"), list):
            raise HTTPException(status_code=400, detail="metadata.outcome_scope must be a list.")
        if "connector_credential_id" in metadata and metadata.get("connector_credential_id") is not None:
            if not isinstance(metadata.get("connector_credential_id"), str):
                raise HTTPException(status_code=400, detail="metadata.connector_credential_id must be a string.")
        if "approval_rules" in metadata and not isinstance(metadata.get("approval_rules"), dict):
            raise HTTPException(status_code=400, detail="metadata.approval_rules must be an object.")
        if "schedule" in metadata and not isinstance(metadata.get("schedule"), dict):
            raise HTTPException(status_code=400, detail="metadata.schedule must be an object.")
        if "execution_target" in metadata:
            normalized_target = normalize_execution_target(metadata.get("execution_target"))
            if normalized_target not in VALID_EXECUTION_TARGETS:
                raise HTTPException(
                    status_code=400,
                    detail="Unsupported execution_target. Use one of: auto, cloud, local_companion.",
                )
            metadata["execution_target"] = normalized_target

    parent_run_id = _normalize_run_id_token(req.parent_run_id or metadata.get("parent_run_id"))
    if parent_run_id:
        metadata["parent_run_id"] = parent_run_id
    elif "parent_run_id" in metadata:
        metadata.pop("parent_run_id", None)

    delegation_root_run_id = _normalize_run_id_token(metadata.get("delegation_root_run_id"))
    if delegation_root_run_id:
        metadata["delegation_root_run_id"] = delegation_root_run_id
    elif "delegation_root_run_id" in metadata:
        metadata.pop("delegation_root_run_id", None)

    delegated_by_run_id = _normalize_run_id_token(metadata.get("delegated_by_run_id"))
    if delegated_by_run_id:
        metadata["delegated_by_run_id"] = delegated_by_run_id
    elif "delegated_by_run_id" in metadata:
        metadata.pop("delegated_by_run_id", None)

    delegated_by_role = normalize_agent_role(metadata.get("delegated_by_role"))
    if delegated_by_role:
        metadata["delegated_by_role"] = delegated_by_role
    elif "delegated_by_role" in metadata:
        metadata.pop("delegated_by_role", None)

    agent_role, agent_role_source = _detect_agent_role(req, metadata)
    metadata["agent_role"] = agent_role
    metadata["agent_role_source"] = agent_role_source

    app_id = str(metadata.get("app_id") or "").strip()
    if app_id:
        app_permissions = resolve_app_permissions(app_id)
        metadata["app_id"] = app_id
        metadata["app_permissions"] = app_permissions
        app_policy = action_policy_from_app_permissions(app_permissions)
        existing_policy = metadata.get("action_policy") if isinstance(metadata.get("action_policy"), dict) else {}
        metadata["action_policy"] = merge_action_policies(
            {"action_policy": existing_policy},
            {"action_policy": app_policy},
        )

    return {
        "engine": engine,
        "metadata": metadata,
    }


def _local_execution_requires_start_approval(metadata: Dict[str, Any], precheck: Dict[str, Any]) -> bool:
    target = str(metadata.get("execution_target_selected") or metadata.get("execution_target") or "").strip().lower()
    outcome_pack = str(metadata.get("outcome_pack") or "").strip().lower()
    if target != EXECUTION_TARGET_LOCAL_COMPANION:
        return False
    if outcome_pack != LOCAL_EXECUTION_PACK_ID:
        return False
    return bool(precheck.get("approval_required_count"))


def _precheck_human_action_labels(precheck: Dict[str, Any], decision: str = "approval_required") -> List[str]:
    items = precheck.get("items") if isinstance(precheck.get("items"), list) else []
    labels: List[str] = []
    seen: Set[str] = set()
    for item in items:
        if not isinstance(item, dict):
            continue
        if str(item.get("decision") or "").strip().lower() != decision:
            continue
        capabilities = item.get("capabilities") if isinstance(item.get("capabilities"), list) else []
        capability_labels = [
            str(cap.get("title") or "").strip()
            for cap in capabilities
            if isinstance(cap, dict) and str(cap.get("title") or "").strip()
        ]
        raw_label = (
            capability_labels[0]
            if capability_labels
            else str(item.get("tool_id") or "").strip().replace("_", " ")
        )
        clean = raw_label.strip()
        if clean and clean.lower() not in seen:
            seen.add(clean.lower())
            labels.append(clean)
    return labels


def _local_execution_approval_prompt(precheck: Dict[str, Any]) -> str:
    labels = _precheck_human_action_labels(precheck, decision="approval_required")
    if labels:
        return f"Approval required before local companion execution: {', '.join(labels)}."
    return "Approval required before local companion execution."


def _mark_local_execution_tools_approved(metadata: Dict[str, Any]) -> None:
    precheck = metadata.get("tool_policy_precheck") if isinstance(metadata.get("tool_policy_precheck"), dict) else None
    if not isinstance(precheck, dict):
        return

    approved_tools = [
        str(item).strip().lower()
        for item in (precheck.get("approval_required") or [])
        if str(item).strip()
    ]
    if not approved_tools:
        return

    allowed = [
        str(item).strip().lower()
        for item in (precheck.get("allowed") or [])
        if str(item).strip()
    ]
    allowed_set = set(allowed)
    for tool in approved_tools:
        allowed_set.add(tool)

    items = precheck.get("items") if isinstance(precheck.get("items"), list) else []
    rewritten_items: List[Dict[str, Any]] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        next_item = dict(item)
        tool_id = str(next_item.get("tool_id") or "").strip().lower()
        if tool_id in approved_tools:
            next_item["decision"] = "allow"
            next_item["reason"] = "approved_for_local_execution"
        rewritten_items.append(next_item)

    precheck["approval_required"] = []
    precheck["approval_required_count"] = 0
    precheck["allowed"] = sorted(allowed_set)
    precheck["allow_count"] = len(precheck["allowed"])
    precheck["items"] = rewritten_items
    metadata["tool_policy_precheck"] = precheck


def _create_run_from_request(req: RunStartRequest, schedule_id: Optional[str] = None) -> Dict[str, Any]:
    prepared = _prepare_run_start_request(req)
    engine = prepared["engine"]
    metadata = prepared["metadata"]
    route = decide_execution_target(metadata, schedule_id=schedule_id)
    metadata = dict(metadata)
    metadata["execution_target_requested"] = route["requested"]
    metadata["execution_target_selected"] = route["selected"]
    metadata["execution_target_reason"] = route["reason"]
    if route.get("fallback"):
        metadata["execution_target_fallback"] = route.get("fallback")

    if schedule_id:
        metadata["schedule_id"] = schedule_id
        metadata["scheduled"] = True
    preview_context = {
        "workflow_id": req.workflow_id,
        "workspace_id": req.workspace_id,
        "user_goal": req.user_goal,
        "business_plan": req.business_plan,
        "agent_role": req.agent_role,
        "provider": req.provider,
        "model": req.model,
        "credential_id": req.credential_id,
        "agents": req.agents or [],
        "metadata": metadata,
    }
    metadata["tool_policy_precheck"] = _compute_tool_policy_precheck(preview_context)
    needs_local_approval = _local_execution_requires_start_approval(metadata, metadata["tool_policy_precheck"])
    if needs_local_approval:
        metadata["local_execution_waiting_approval"] = True
        preview_context["metadata"] = metadata
    run_id = create_run(
        engine=engine,
        context=preview_context,
        defer_local_enqueue=needs_local_approval,
    )
    status = "starting"
    if needs_local_approval:
        approval_labels = _precheck_human_action_labels(metadata["tool_policy_precheck"], decision="approval_required")
        pending = _begin_run_pending_approval(
            run_id,
            _local_execution_approval_prompt(metadata["tool_policy_precheck"]),
            source="local_execution_start",
            metadata={
                "target": metadata.get("execution_target_selected"),
                "approval_actions": list(metadata["tool_policy_precheck"].get("approval_required") or []),
                "approval_labels": approval_labels,
                "approval_capabilities": list(metadata["tool_policy_precheck"].get("capability_ids") or []),
                "outcome_pack": metadata.get("outcome_pack"),
            },
        )
        status = "waiting_for_input"
    else:
        pending = None
    return {
        "run_id": run_id,
        "engine": engine,
        "status": status,
        "agent_role": metadata.get("agent_role"),
        "agent_role_source": metadata.get("agent_role_source"),
        "parent_run_id": metadata.get("parent_run_id"),
        "delegation_root_run_id": metadata.get("delegation_root_run_id"),
        "delegated_by_run_id": metadata.get("delegated_by_run_id"),
        "delegated_by_role": metadata.get("delegated_by_role"),
        "route": route,
        "pending_approval": pending,
    }


def _lookup_run_snapshot(run_id: str) -> Dict[str, Any]:
    active = runs.get(run_id)
    archived_item = _get_archived_run_history_item(run_id)
    active_snapshot = _serialize_run_snapshot(run_id, active) if isinstance(active, dict) else None
    chosen_snapshot = _prefer_archived_snapshot(active_snapshot, archived_item)
    if isinstance(chosen_snapshot, dict):
        return chosen_snapshot
    return _get_replay_payload(run_id)


def _build_delegated_run_request(
    parent_snapshot: Dict[str, Any],
    child_payload: Dict[str, Any],
    note: Optional[str] = None,
) -> RunStartRequest:
    parent_context = parent_snapshot.get("context") if isinstance(parent_snapshot.get("context"), dict) else {}
    parent_metadata = parent_context.get("metadata") if isinstance(parent_context.get("metadata"), dict) else {}
    if not isinstance(parent_metadata, dict):
        parent_metadata = {}
    child_metadata = dict(child_payload.get("metadata") or {})
    parent_run_id = str(parent_snapshot.get("run_id") or "").strip()
    root_run_id = _normalize_run_id_token(parent_snapshot.get("delegation_root_run_id") or parent_metadata.get("delegation_root_run_id")) or parent_run_id
    delegated_by_role = normalize_agent_role(parent_snapshot.get("agent_role") or parent_metadata.get("agent_role")) or "orchestrator"

    child_metadata["parent_run_id"] = parent_run_id
    child_metadata["delegation_root_run_id"] = root_run_id
    child_metadata["delegated_by_run_id"] = parent_run_id
    child_metadata["delegated_by_role"] = delegated_by_role
    if note:
        child_metadata["delegation_note"] = note
    selected_target = str(parent_metadata.get("execution_target_selected") or parent_metadata.get("execution_target") or "").strip().lower()
    if selected_target in VALID_EXECUTION_TARGETS and "execution_target" not in child_metadata:
        child_metadata["execution_target"] = selected_target
    if parent_metadata.get("trust_mode") and "trust_mode" not in child_metadata:
        child_metadata["trust_mode"] = parent_metadata.get("trust_mode")

    return RunStartRequest(
        engine=str(parent_snapshot.get("engine") or "orion"),
        workflow_id=parent_context.get("workflow_id"),
        workspace_id=parent_context.get("workspace_id"),
        user_goal=str(child_payload.get("user_goal") or "").strip(),
        business_plan=str(child_payload.get("business_plan") or parent_context.get("business_plan") or "").strip() or None,
        agent_role=str(child_payload.get("agent_role") or "").strip(),
        provider=parent_context.get("provider"),
        model=parent_context.get("model"),
        credential_id=parent_context.get("credential_id"),
        parent_run_id=parent_run_id,
        metadata=child_metadata,
    )


def _refresh_parent_delegation_state(parent_run_id: str, *, triggering_run_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
    try:
        snapshot = _lookup_run_snapshot(parent_run_id)
    except HTTPException:
        return None

    parent_run, child_runs = _find_run_relationships(parent_run_id, snapshot)
    delegation_summary = _build_delegation_summary(snapshot, child_runs)
    if delegation_summary is None:
        return None

    refreshed_at = _utc_now_iso()
    orchestration_payload = {
        "summary": delegation_summary,
        "parent_run": parent_run,
        "child_runs": child_runs,
        "triggering_run_id": triggering_run_id,
        "updated_at": refreshed_at,
    }

    live_parent = runs.get(parent_run_id)
    if isinstance(live_parent, dict):
        context = live_parent.setdefault("context", {})
        if not isinstance(context, dict):
            context = {}
            live_parent["context"] = context
        metadata = context.setdefault("metadata", {})
        if not isinstance(metadata, dict):
            metadata = {}
            context["metadata"] = metadata
        previous_next_action = str(metadata.get("delegation_next_action") or "").strip()
        metadata["delegation_summary_cache"] = delegation_summary
        metadata["delegation_last_refreshed_at"] = refreshed_at
        metadata["delegation_next_action"] = delegation_summary.get("next_action")
        metadata["delegation_ready"] = bool(delegation_summary.get("ready"))

        result_data = live_parent.get("result_data")
        if not isinstance(result_data, dict):
            result_data = {}
        result_data["orchestration"] = orchestration_payload
        live_parent["result_data"] = result_data
        live_parent["updated_at"] = refreshed_at
        _refresh_archived_run_snapshot(parent_run_id, live_parent)

        if previous_next_action != str(delegation_summary.get("next_action") or "").strip():
            log_queue = live_parent.get("logs")
            if log_queue is not None:
                next_action = str(delegation_summary.get("next_action") or "").strip()
                message_map = {
                    "waiting_for_children": "Delegated child runs are still in progress.",
                    "resolve_child_approvals": "Delegated child runs are waiting for approval.",
                    "retry_failed_children": "Delegated child runs failed and can be retried.",
                    "merge_results": "Delegated child runs finished and results are ready to merge.",
                }
                emit_log(
                    log_queue,
                    "info",
                    message_map.get(next_action, "Delegation state updated."),
                    event="delegation_state",
                    data={
                        "parent_run_id": parent_run_id,
                        "triggering_run_id": triggering_run_id,
                        "summary": delegation_summary,
                    },
                )
    else:
        context = snapshot.get("context") if isinstance(snapshot.get("context"), dict) else {}
        metadata = context.get("metadata") if isinstance(context.get("metadata"), dict) else {}
        if isinstance(metadata, dict):
            metadata["delegation_summary_cache"] = delegation_summary
            metadata["delegation_last_refreshed_at"] = refreshed_at
            metadata["delegation_next_action"] = delegation_summary.get("next_action")
            metadata["delegation_ready"] = bool(delegation_summary.get("ready"))
        result_data = snapshot.get("result_data")
        if not isinstance(result_data, dict):
            result_data = {}
        result_data["orchestration"] = orchestration_payload
        snapshot["result_data"] = result_data
        snapshot["updated_at"] = refreshed_at
        _upsert_run_history_snapshot(snapshot)

    return delegation_summary


def _build_retry_child_payload(parent_snapshot: Dict[str, Any], child_snapshot: Dict[str, Any], *, note: Optional[str] = None) -> Dict[str, Any]:
    child_context = child_snapshot.get("context") if isinstance(child_snapshot.get("context"), dict) else {}
    child_metadata = child_context.get("metadata") if isinstance(child_context.get("metadata"), dict) else {}
    if not isinstance(child_metadata, dict):
        child_metadata = {}
    retry_root_run_id = _normalize_run_id_token(child_metadata.get("retry_root_run_id")) or _normalize_run_id_token(child_snapshot.get("run_id"))
    retry_sequence = int(child_metadata.get("retry_sequence") or 0) + 1
    next_metadata = dict(child_metadata)
    next_metadata["retry_of_run_id"] = str(child_snapshot.get("run_id") or "").strip()
    next_metadata["retry_root_run_id"] = retry_root_run_id
    next_metadata["retry_sequence"] = retry_sequence
    if note:
        next_metadata["delegation_retry_note"] = note
    return {
        "agent_role": normalize_agent_role(child_snapshot.get("agent_role") or child_metadata.get("agent_role")) or str(child_snapshot.get("agent_role") or "").strip(),
        "user_goal": str(child_context.get("user_goal") or child_snapshot.get("user_goal") or "").strip(),
        "business_plan": str(child_context.get("business_plan") or "").strip() or None,
        "metadata": next_metadata,
    }


AUTO_DELEGATION_ROLE_RULES: Dict[str, Dict[str, Any]] = {
    "research": {
        "keywords": [
            "research", "market", "analysis", "analyze", "brief", "summary", "competitor",
            "plan", "strategy", "launch", "marketing", "investigate", "study",
        ],
        "goal": "Research and summarize the key findings for this objective: {objective}",
        "reason": "Research and planning support is needed.",
    },
    "builder": {
        "keywords": [
            "build", "implement", "fix", "ship", "code", "frontend", "backend", "bug",
            "automation", "platform", "app", "browser", "workflow", "integrat",
        ],
        "goal": "Implement or validate the execution work needed for this objective: {objective}",
        "reason": "Execution or implementation work is needed.",
    },
    "sales": {
        "keywords": [
            "sales", "lead", "booking", "book", "appointment", "pipeline", "conversion",
            "convert", "follow-up", "follow up", "outreach",
        ],
        "goal": "Handle the sales or booking follow-through required for this objective: {objective}",
        "reason": "Sales or booking work is needed.",
    },
    "support": {
        "keywords": [
            "support", "customer", "inbox", "message", "feedback", "complaint", "reply",
            "telegram", "whatsapp", "email",
        ],
        "goal": "Handle customer-facing support follow-up for this objective: {objective}",
        "reason": "Customer support work is needed.",
    },
    "finance": {
        "keywords": [
            "finance", "budget", "revenue", "price", "pricing", "invoice", "expense",
            "spreadsheet", "sheet", "excel", "report",
        ],
        "goal": "Prepare the financial or spreadsheet work needed for this objective: {objective}",
        "reason": "Financial or reporting work is needed.",
    },
    "private-assistant": {
        "keywords": [
            "personal", "study", "exam", "reminder", "calendar", "routine", "habit",
            "travel", "meal", "homework",
        ],
        "goal": "Handle the personal assistant follow-up for this objective: {objective}",
        "reason": "Personal assistance is needed.",
    },
}


def _build_auto_delegation_plan(
    parent_snapshot: Dict[str, Any],
    *,
    max_children: int = 3,
) -> List[Dict[str, Any]]:
    parent_context = parent_snapshot.get("context") if isinstance(parent_snapshot.get("context"), dict) else {}
    parent_metadata = parent_context.get("metadata") if isinstance(parent_context.get("metadata"), dict) else {}
    objective = str(
        parent_snapshot.get("user_goal")
        or parent_context.get("user_goal")
        or parent_context.get("business_plan")
        or parent_snapshot.get("result_summary")
        or ""
    ).strip()
    business_plan = str(parent_context.get("business_plan") or "").strip() or None
    combined = " ".join(
        part for part in [
            objective,
            business_plan or "",
            str(parent_snapshot.get("result_summary") or "").strip(),
            str((parent_metadata or {}).get("skill_scope") or "").strip(),
        ] if part
    ).lower()

    if not objective:
        objective = "Coordinate the delegated work needed for this run."

    scored: List[Tuple[int, str, Dict[str, Any]]] = []
    for role, rule in AUTO_DELEGATION_ROLE_RULES.items():
        keywords = [str(item).lower() for item in (rule.get("keywords") or []) if str(item).strip()]
        score = sum(1 for keyword in keywords if keyword in combined)
        if role == "research" and any(term in combined for term in ("plan", "strategy", "launch", "marketing")):
            score += 1
        if score <= 0:
            continue
        scored.append((score, role, rule))

    scored.sort(key=lambda item: (-item[0], item[1]))
    chosen: List[Tuple[str, Dict[str, Any]]] = []
    seen_roles: Set[str] = set()
    for _, role, rule in scored:
        if role in seen_roles:
            continue
        chosen.append((role, rule))
        seen_roles.add(role)
        if len(chosen) >= max_children:
            break

    if not chosen:
        chosen.append(("research", AUTO_DELEGATION_ROLE_RULES["research"]))
        if len(chosen) < max_children and any(term in combined for term in ("build", "implement", "fix", "platform", "app", "automation")):
            chosen.append(("builder", AUTO_DELEGATION_ROLE_RULES["builder"]))

    plan: List[Dict[str, Any]] = []
    for role, rule in chosen[:max_children]:
        plan.append(
            {
                "agent_role": role,
                "user_goal": str(rule.get("goal") or "{objective}").format(objective=objective),
                "business_plan": business_plan,
                "metadata": {
                    "auto_delegation_rule": role,
                    "auto_delegation_reason": str(rule.get("reason") or "").strip() or None,
                },
            }
        )
    return plan


@app.get("/cognitive/approvals", dependencies=[Depends(require_api_key)])
async def list_cognitive_approvals(limit: int = 20):
    mod = _cognitive_daemon_module()
    conf = _cognitive_defaults()
    safe_limit = max(1, min(int(limit), 200))
    try:
        items = mod.list_pending_approvals(
            db_path=conf["db_path"],
            niche_id=conf["niche_id"],
            limit=safe_limit,
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"failed_to_list_cognitive_approvals: {exc}") from exc
    return {
        "ok": True,
        "niche_id": conf["niche_id"],
        "db_path": conf["db_path"],
        "count": len(items),
        "items": items,
    }


@app.post("/cognitive/approvals/{event_id}/resolve", dependencies=[Depends(require_api_key)])
async def resolve_cognitive_approval(event_id: str, payload: ApprovalResolvePayload):
    payload.validate_fields()
    target_event_id = str(event_id or "").strip()
    if not target_event_id:
        raise HTTPException(status_code=400, detail="event_id is required.")

    approve_tokens = {"proceed", "approve", "yes", "y", "continue", "ok"}
    reject_tokens = {"hold", "reject", "no", "n", "abort", "stop", "cancel"}
    escalate_tokens = {"escalate", "escalated"}
    decision = str(payload.decision or "").strip().lower()
    approved = decision in approve_tokens
    escalated = decision in escalate_tokens
    if decision not in approve_tokens and decision not in reject_tokens and decision not in escalate_tokens:
        raise HTTPException(status_code=400, detail="Unsupported decision value.")
    correlation_id = _approval_correlation_id(target_event_id, event_id=target_event_id)

    mod = _cognitive_daemon_module()
    conf = _cognitive_defaults()
    try:
        out = mod.resolve_event_approval(
            db_path=conf["db_path"],
            event_id=target_event_id,
            approved=approved,
            note=str(payload.note or "").strip(),
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"failed_to_resolve_cognitive_approval: {exc}") from exc

    if not isinstance(out, dict):
        raise HTTPException(status_code=500, detail="invalid_cognitive_approval_response")
    if not bool(out.get("ok")):
        reason = str(out.get("error") or "approval_update_failed")
        if reason == "event_not_found":
            raise HTTPException(status_code=404, detail=reason)
        if reason == "event_not_waiting_for_input":
            raise HTTPException(status_code=409, detail=reason)
        raise HTTPException(status_code=400, detail=reason)
    _append_approval_audit(
        approval_id=target_event_id,
        stage="resolved",
        decision=("approved" if approved else "escalated" if escalated else "rejected"),
        actor="user",
        source="cognitive_api",
        event_id=target_event_id,
        note=str(payload.note or ""),
        correlation_id=correlation_id,
        metadata={"raw_decision": decision},
    )
    out["correlation_id"] = correlation_id
    out["decision_kind"] = "approved" if approved else ("escalated" if escalated else "rejected")
    return out


@app.get("/approvals/audit", dependencies=[Depends(require_api_key)])
async def get_approval_audit(
    limit: int = 100,
    run_id: Optional[str] = None,
    event_id: Optional[str] = None,
    approval_id: Optional[str] = None,
    correlation_id: Optional[str] = None,
):
    safe_limit = max(1, min(int(limit), 500))
    with APPROVAL_AUDIT_LOCK:
        items = list(APPROVAL_AUDIT)
    run_value = str(run_id or "").strip()
    event_value = str(event_id or "").strip()
    approval_value = str(approval_id or "").strip()
    correlation_value = str(correlation_id or "").strip()
    filtered: List[Dict[str, Any]] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        if run_value and str(item.get("run_id") or "").strip() != run_value:
            continue
        if event_value and str(item.get("event_id") or "").strip() != event_value:
            continue
        if approval_value and str(item.get("approval_id") or "").strip() != approval_value:
            continue
        if correlation_value and str(item.get("correlation_id") or "").strip() != correlation_value:
            continue
        filtered.append(item)
    payload = filtered[:safe_limit]
    return {
        "items": payload,
        "count": len(payload),
        "total": len(filtered),
        "source_file": str(ORION_APPROVAL_AUDIT_FILE),
    }


@app.get("/approvals", dependencies=[Depends(require_api_key)])
async def list_pending_approvals(
    workspace_id: Optional[str] = None,
    limit: int = 100,
):
    safe_limit = max(1, min(int(limit), 300))
    workspace_filter = _normalize_workspace_id(workspace_id) if workspace_id else None
    pending_items: List[Dict[str, Any]] = []
    for run_id, run in list(runs.items()):
        if not isinstance(run, dict):
            continue
        context = run.get("context") if isinstance(run.get("context"), dict) else {}
        metadata = context.get("metadata") if isinstance(context.get("metadata"), dict) else {}
        run_workspace = _normalize_workspace_id(context.get("workspace_id"))
        if workspace_filter and run_workspace != workspace_filter:
            continue
        status = str(run.get("status") or "").strip().lower()
        if status != "waiting_for_input":
            continue
        pending = run.get("pending_approval")
        if not isinstance(pending, dict):
            continue
        approval_id = str(pending.get("approval_id") or "").strip()
        if not approval_id:
            continue
        pending_items.append(
            {
                "run_id": run_id,
                "approval_id": approval_id,
                "prompt": str(pending.get("prompt") or "Approval required."),
                "status": str(pending.get("status") or "pending").strip().lower() or "pending",
                "labels": list(pending.get("metadata", {}).get("approval_labels") or []) if isinstance(pending.get("metadata"), dict) else [],
                "capabilities": list(pending.get("metadata", {}).get("approval_capabilities") or []) if isinstance(pending.get("metadata"), dict) else [],
                "agent_role": str(metadata.get("agent_role") or "").strip() or None,
                "requested_at": pending.get("requested_at"),
                "expires_at": pending.get("expires_at"),
                "correlation_id": pending.get("correlation_id"),
            }
        )
        if len(pending_items) >= safe_limit:
            break
    return {
        "items": pending_items,
        "count": len(pending_items),
    }


@app.get("/audit", dependencies=[Depends(require_api_key)])
async def get_audit(
    limit: int = 100,
    run_id: Optional[str] = None,
    event_id: Optional[str] = None,
    approval_id: Optional[str] = None,
    correlation_id: Optional[str] = None,
):
    return await get_approval_audit(
        limit=limit,
        run_id=run_id,
        event_id=event_id,
        approval_id=approval_id,
        correlation_id=correlation_id,
    )


@app.get("/schedules/weekly", dependencies=[Depends(require_api_key)])
async def list_weekly_schedules(workspace_id: Optional[str] = None):
    with SCHEDULES_LOCK:
        items = list(WEEKLY_SCHEDULES.values())
    if workspace_id:
        items = [item for item in items if str(item.get("workspace_id") or "").strip() == workspace_id]
    items.sort(key=lambda item: str(item.get("updated_at") or ""), reverse=True)
    return {"items": items}


@app.post("/schedules/weekly", dependencies=[Depends(require_api_key)])
async def create_weekly_schedule(body: WeeklyScheduleUpsertRequest):
    body.validate_fields()
    schedule_id = str(uuid.uuid4())
    now = datetime.utcnow().isoformat() + "Z"
    item = {
        "id": schedule_id,
        "name": body.name.strip(),
        "workspace_id": _normalize_workspace_id(body.workspace_id),
        "enabled": bool(body.enabled),
        "day_of_week": _normalized_weekday(body.day_of_week),
        "time_hhmm": body.time_hhmm.strip(),
        "timezone": str(body.timezone).strip().lower(),
        "run_request": body.run_request.model_dump(),
        "last_trigger_date": None,
        "last_run_id": None,
        "last_error": None,
        "created_at": now,
        "updated_at": now,
    }
    with SCHEDULES_LOCK:
        WEEKLY_SCHEDULES[schedule_id] = item
    _persist_weekly_schedules()
    return item


@app.patch("/schedules/weekly/{schedule_id}", dependencies=[Depends(require_api_key)])
async def update_weekly_schedule(schedule_id: str, body: WeeklySchedulePatchRequest):
    body.validate_fields()
    with SCHEDULES_LOCK:
        current = WEEKLY_SCHEDULES.get(schedule_id)
        if current is None:
            raise HTTPException(status_code=404, detail="Schedule not found")
        if body.name is not None:
            current["name"] = body.name.strip()
        if body.enabled is not None:
            current["enabled"] = bool(body.enabled)
        if body.day_of_week is not None:
            current["day_of_week"] = _normalized_weekday(body.day_of_week)
        if body.time_hhmm is not None:
            current["time_hhmm"] = body.time_hhmm.strip()
        if body.timezone is not None:
            current["timezone"] = str(body.timezone).strip().lower()
        if body.run_request is not None:
            current["run_request"] = body.run_request.model_dump()
        current["updated_at"] = datetime.utcnow().isoformat() + "Z"
        WEEKLY_SCHEDULES[schedule_id] = current
    _persist_weekly_schedules()
    with SCHEDULES_LOCK:
        return dict(WEEKLY_SCHEDULES[schedule_id])


@app.delete("/schedules/weekly/{schedule_id}", dependencies=[Depends(require_api_key)])
async def delete_weekly_schedule(schedule_id: str):
    with SCHEDULES_LOCK:
        if schedule_id not in WEEKLY_SCHEDULES:
            raise HTTPException(status_code=404, detail="Schedule not found")
        deleted = WEEKLY_SCHEDULES.pop(schedule_id)
    _persist_weekly_schedules()
    return {"status": "ok", "deleted": {"id": deleted.get("id"), "name": deleted.get("name")}}


@app.post("/schedules/weekly/{schedule_id}/run-now", dependencies=[Depends(require_api_key)])
async def trigger_weekly_schedule_now(schedule_id: str):
    with SCHEDULES_LOCK:
        schedule = WEEKLY_SCHEDULES.get(schedule_id)
        if schedule is None:
            raise HTTPException(status_code=404, detail="Schedule not found")
        req_payload = dict(schedule.get("run_request") or {})
    try:
        req = RunStartRequest(**req_payload)
        result = _create_run_from_request(req, schedule_id=schedule_id)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    with SCHEDULES_LOCK:
        current = WEEKLY_SCHEDULES.get(schedule_id)
        if current is not None:
            current["last_run_id"] = result.get("run_id")
            current["last_error"] = None
            current["updated_at"] = datetime.utcnow().isoformat() + "Z"
            WEEKLY_SCHEDULES[schedule_id] = current
    _persist_weekly_schedules()
    return result


@app.get("/metrics", dependencies=[Depends(require_api_key)])
async def get_runtime_metrics():
    _cleanup_stale_local_claims()
    with METRICS_LOCK:
        snapshot = dict(RUNTIME_METRICS)

    started = int(snapshot.get("runs_started", 0))
    completed = int(snapshot.get("runs_completed", 0))
    failed = int(snapshot.get("runs_failed", 0))
    timeout = int(snapshot.get("runs_timeout", 0))
    finished_total = completed + failed + timeout
    completion_rate = (completed / finished_total) if finished_total > 0 else 0.0

    run_duration_count = int(snapshot.get("run_duration_count", 0))
    run_duration_sum_ms = float(snapshot.get("run_duration_sum_ms", 0.0))
    avg_run_duration_ms = (run_duration_sum_ms / run_duration_count) if run_duration_count > 0 else 0.0

    first_value_count = int(snapshot.get("first_value_count", 0))
    first_value_sum_ms = float(snapshot.get("first_value_sum_ms", 0.0))
    avg_first_value_ms = (first_value_sum_ms / first_value_count) if first_value_count > 0 else 0.0

    hitl_wait_count = int(snapshot.get("hitl_wait_count", 0))
    hitl_wait_sum_ms = float(snapshot.get("hitl_wait_sum_ms", 0.0))
    avg_hitl_wait_ms = (hitl_wait_sum_ms / hitl_wait_count) if hitl_wait_count > 0 else 0.0

    active_runs = 0
    waiting_runs = 0
    for run in runs.values():
        status = run.get("status")
        if status in ["starting", "running", "running_local", "queued_local", "waiting_for_input"]:
            active_runs += 1
        if status == "waiting_for_input":
            waiting_runs += 1
    with SCHEDULES_LOCK:
        schedule_count = len(WEEKLY_SCHEDULES)
    with LOCAL_QUEUE_LOCK:
        local_pending = len(LOCAL_PENDING_RUN_IDS)
        local_claimed = len(LOCAL_CLAIMED_RUNS)
        now = _utc_now()
        known_workers = len(LOCAL_WORKER_REGISTRY)
        online_workers = len([record for record in LOCAL_WORKER_REGISTRY.values() if isinstance(record, dict) and _is_worker_online(record, now)])

    return {
        "auth_required": bool(ORION_AUTH_REQUIRED),
        "auth_insecure_dev_override": bool(ORION_DEV_INSECURE_NO_AUTH),
        "scheduler": {
            "enabled": ORION_SCHEDULER_ENABLED,
            "poll_seconds": ORION_SCHEDULER_POLL_SECONDS,
            "weekly_schedules": schedule_count,
        },
        "local_companion": {
            "enabled": ORION_LOCAL_COMPANION_ENABLED,
            "lease_seconds": ORION_LOCAL_LEASE_SECONDS,
            "pending_runs": local_pending,
            "claimed_runs": local_claimed,
            "known_workers": known_workers,
            "online_workers": online_workers,
        },
        "runs": {
            "started": started,
            "completed": completed,
            "failed": failed,
            "timeout": timeout,
            "active": active_runs,
            "waiting_for_input": waiting_runs,
            "completion_rate": round(completion_rate, 4),
        },
        "kpis": {
            "avg_run_duration_ms": round(avg_run_duration_ms, 2),
            "avg_time_to_first_value_ms": round(avg_first_value_ms, 2),
            "avg_human_wait_ms": round(avg_hitl_wait_ms, 2),
        },
    }


@app.get("/kpis", dependencies=[Depends(require_api_key)])
async def get_runtime_kpis():
    return await get_runtime_metrics()


@app.get("/runs/queue/local", dependencies=[Depends(require_api_key)])
async def get_local_run_queue(workspace_id: Optional[str] = None, limit: int = 50):
    return handle_get_local_run_queue(workspace_id, limit)


@app.get("/local/workers/status", dependencies=[Depends(require_api_key)])
async def get_local_workers_status():
    return handle_get_local_workers_status()


@app.post("/local/workers/{worker_id}/heartbeat", dependencies=[Depends(require_api_key)])
async def heartbeat_local_worker(worker_id: str, payload: Optional[LocalWorkerHeartbeatPayload] = None):
    return handle_heartbeat_local_worker(worker_id, payload)


@app.post("/local/runs/claim", dependencies=[Depends(require_api_key)])
async def claim_local_run(body: Optional[LocalRunClaimRequest] = None):
    return handle_claim_local_run(body)


@app.post("/local/runs/{run_id}/heartbeat", dependencies=[Depends(require_api_key)])
async def heartbeat_local_run(run_id: uuid.UUID, payload: Optional[LocalRunHeartbeatPayload] = None):
    return handle_heartbeat_local_run(run_id, payload)


@app.post("/local/runs/{run_id}/complete", dependencies=[Depends(require_api_key)])
async def complete_local_run(run_id: uuid.UUID, payload: LocalRunCompletePayload):
    return handle_complete_local_run(run_id, payload)


@app.post("/local/runs/{run_id}/fail", dependencies=[Depends(require_api_key)])
async def fail_local_run(run_id: uuid.UUID, payload: LocalRunFailPayload):
    return handle_fail_local_run(run_id, payload)
