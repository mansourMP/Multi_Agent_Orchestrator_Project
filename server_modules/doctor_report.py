from __future__ import annotations

import os
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List

import certifi


def build_doctor_report(health_data: Dict[str, Any], config: Dict[str, Any]) -> Dict[str, Any]:
    checks: List[Dict[str, Any]] = []

    def add_check(name: str, status: str, detail: str, recommendation: str = ""):
        checks.append(
            {
                "name": name,
                "status": status,  # pass | warn | fail
                "detail": detail,
                "recommendation": recommendation,
            }
        )

    runtime_api_version = str(health_data.get("runtime_api_version") or "").strip()
    runtime_api_min_cli_version = str(health_data.get("runtime_api_min_cli_version") or "").strip()
    if not runtime_api_version:
        add_check(
            "runtime_contract",
            "warn",
            "Runtime API version is not published in /health.",
            "Expose runtime_api_version and runtime_api_min_cli_version for compatibility handshakes.",
        )
    else:
        add_check(
            "runtime_contract",
            "pass",
            f"Runtime contract published (api={runtime_api_version}, min_cli={runtime_api_min_cli_version or 'unspecified'}).",
        )

    openai_env_present = bool(health_data.get("openai_key_present"))
    openai_vault_present = bool(health_data.get("openai_vault_present"))
    openai_present = openai_env_present or openai_vault_present
    openai_valid = bool(health_data.get("openai_key_valid"))
    openai_status = health_data.get("openai_status")
    openai_source = str(health_data.get("openai_credential_source") or "unknown")
    if not openai_present:
        add_check(
            "openai_credentials",
            "fail",
            "No OpenAI credential is configured (env or vault).",
            "Set OPENAI_API_KEY/OPENAI_ACCESS_TOKEN or add an OpenAI credential in Empyralis Setup (vault).",
        )
    elif not openai_valid:
        add_check(
            "openai_connectivity",
            "warn",
            f"OpenAI probe not healthy (source={openai_source}, status={openai_status}).",
            "Verify API key, TLS certificates, and outbound network access.",
        )
    else:
        add_check("openai_connectivity", "pass", f"OpenAI probe healthy (source={openai_source}, status={openai_status}).")

    codex_oauth_interactive = bool(health_data.get("codex_oauth_interactive_supported"))
    if codex_oauth_interactive:
        add_check("codex_signin_mode", "pass", "Interactive Codex OAuth sign-in is enabled.")
    else:
        add_check(
            "codex_signin_mode",
            "warn",
            "Interactive Codex OAuth sign-in is not enabled in this runtime build.",
            "Use Empyralis Setup -> Provider/Auth and store an OpenAI API key or OAuth access token in vault.",
        )

    runtime_valid = bool(health_data.get("runtime_valid"))
    if runtime_valid:
        add_check("runtime_validation", "pass", "Empyralis runtime configuration is valid.")
    else:
        add_check(
            "runtime_validation",
            "fail",
            "Empyralis runtime validation errors found.",
            "Fix Empyralis runtime configuration and restart the service.",
        )

    if bool(config.get("ORION_AUTH_REQUIRED")) and not bool(config.get("ORION_API_KEY")):
        add_check(
            "auth_policy",
            "fail",
            "ORION_AUTH_REQUIRED=1 but ORION_API_KEY is not configured.",
            "Set ORION_API_KEY or disable ORION_AUTH_REQUIRED for local dev only.",
        )
    elif bool(config.get("ORION_API_KEY")):
        add_check("auth_policy", "pass", "Runtime API key auth is configured.")
    else:
        add_check(
            "auth_policy",
            "warn",
            "Runtime API key auth is disabled.",
            "For production, set ORION_API_KEY and enable ORION_AUTH_REQUIRED=1.",
        )

    frontend_origins = str(config.get("FRONTEND_ORIGINS") or "")
    cors_origins = [origin.strip() for origin in frontend_origins.split(",") if origin.strip()]
    if not cors_origins:
        add_check(
            "cors_origins",
            "fail",
            "No FRONTEND_ORIGINS configured.",
            "Set FRONTEND_ORIGINS to explicit allowed web origins.",
        )
    elif "*" in cors_origins:
        add_check(
            "cors_origins",
            "warn",
            "Wildcard origin detected.",
            "Use explicit origin allowlist in production.",
        )
    else:
        add_check("cors_origins", "pass", f"Configured origins: {', '.join(cors_origins)}")

    control_plane_origins = config.get("CONTROL_PLANE_ORIGINS")
    if not isinstance(control_plane_origins, list) or not control_plane_origins:
        add_check(
            "control_plane_origins",
            "fail",
            "No CONTROL_PLANE_ORIGINS configured.",
            "Set CONTROL_PLANE_ORIGINS to explicit web origins allowed to perform write actions.",
        )
    elif "*" in control_plane_origins:
        add_check(
            "control_plane_origins",
            "warn",
            "Wildcard control-plane origin detected.",
            "Use explicit origins for control-plane writes in production.",
        )
    else:
        add_check("control_plane_origins", "pass", f"Configured: {', '.join(control_plane_origins)}")

    rate_limit_per_minute = int(config.get("CONTROL_PLANE_RATE_LIMIT_PER_MINUTE") or 0)
    rate_limit_burst = int(config.get("CONTROL_PLANE_RATE_LIMIT_BURST") or 0)
    if rate_limit_per_minute <= 0:
        add_check(
            "control_plane_rate_limit",
            "fail",
            "CONTROL_PLANE_RATE_LIMIT_PER_MINUTE must be > 0.",
            "Set CONTROL_PLANE_RATE_LIMIT_PER_MINUTE to a sane default (e.g., 60).",
        )
    else:
        add_check(
            "control_plane_rate_limit",
            "pass",
            f"Write rate limit={rate_limit_per_minute}/min burst={rate_limit_burst}.",
        )

    run_timeout_seconds = int(config.get("ORION_RUN_TIMEOUT_SECONDS") or 0)
    if run_timeout_seconds <= 0:
        add_check(
            "run_timeout",
            "fail",
            "ORION_RUN_TIMEOUT_SECONDS must be > 0.",
            "Set timeout to a safe value (recommended 300s).",
        )
    else:
        add_check("run_timeout", "pass", f"Run timeout is {run_timeout_seconds}s.")

    max_retries = int(config.get("ORION_MAX_RETRIES") or 0)
    if max_retries < 0:
        add_check(
            "retry_policy",
            "fail",
            "ORION_MAX_RETRIES cannot be negative.",
            "Set ORION_MAX_RETRIES to 0-3 for production safety.",
        )
    else:
        add_check("retry_policy", "pass", f"Retry policy configured (max={max_retries}).")

    scheduler_poll_seconds = int(config.get("ORION_SCHEDULER_POLL_SECONDS") or 0)
    scheduler_enabled = bool(config.get("ORION_SCHEDULER_ENABLED"))
    if scheduler_poll_seconds < 5:
        add_check(
            "scheduler_poll",
            "fail",
            f"Scheduler poll value {scheduler_poll_seconds}s is too low.",
            "Set ORION_SCHEDULER_POLL_SECONDS to >= 5.",
        )
    else:
        scheduler_mode = "enabled" if scheduler_enabled else "disabled"
        add_check(
            "scheduler",
            "pass",
            f"Weekly scheduler is {scheduler_mode} (poll={scheduler_poll_seconds}s).",
        )

    telegram_enabled = bool(health_data.get("telegram_autopilot_enabled"))
    telegram_active = bool(health_data.get("telegram_autopilot_active"))
    telegram_connectors_seen = int(health_data.get("telegram_autopilot_connectors_seen") or 0)
    telegram_connector_errors = int(health_data.get("telegram_autopilot_connector_error_count") or 0)
    telegram_last_error = str(health_data.get("telegram_autopilot_last_error") or "").strip()
    telegram_thread_alive = bool(health_data.get("telegram_autopilot_thread_alive"))
    if telegram_enabled:
        if not telegram_active or not telegram_thread_alive:
            add_check(
                "telegram_autopilot_runtime",
                "fail",
                "Telegram autopilot is enabled but worker thread is not active.",
                "Check runtime logs and restart Empyralis runtime.",
            )
        elif telegram_connectors_seen <= 0:
            add_check(
                "telegram_autopilot_connectors",
                "warn",
                "Telegram autopilot is enabled but no Telegram Bot connectors were found.",
                "Add a Telegram Bot connector in Empyralis Setup -> Connect Channels.",
            )
        elif telegram_connector_errors > 0 or telegram_last_error:
            add_check(
                "telegram_autopilot_errors",
                "warn",
                f"Telegram autopilot has connector errors ({telegram_connector_errors}).",
                "Open /channels/telegram/autopilot/status and fix connector credentials/chat_id.",
            )
        else:
            add_check(
                "telegram_autopilot",
                "pass",
                f"Telegram autopilot active (connectors_seen={telegram_connectors_seen}).",
            )
    else:
        add_check(
            "telegram_autopilot",
            "warn",
            "Telegram autopilot is disabled.",
            "Enable ORION_TELEGRAM_AUTOPILOT_ENABLED=1 to process Telegram inbox automatically.",
        )

    whatsapp_enabled = bool(health_data.get("whatsapp_autopilot_enabled"))
    whatsapp_active = bool(health_data.get("whatsapp_autopilot_active"))
    whatsapp_connectors_seen = int(health_data.get("whatsapp_autopilot_connectors_seen") or 0)
    whatsapp_connector_errors = int(health_data.get("whatsapp_autopilot_connector_error_count") or 0)
    whatsapp_last_error = str(health_data.get("whatsapp_autopilot_last_error") or "").strip()
    if whatsapp_enabled:
        if not whatsapp_active:
            add_check(
                "whatsapp_autopilot_runtime",
                "fail",
                "WhatsApp autopilot is enabled but not active.",
                "Restart Empyralis runtime and verify ORION_WHATSAPP_AUTOPILOT_ENABLED=1.",
            )
        elif whatsapp_connectors_seen <= 0:
            add_check(
                "whatsapp_autopilot_connectors",
                "warn",
                "WhatsApp autopilot is enabled but no WhatsApp (Twilio) connectors were found.",
                "Add a WhatsApp (Twilio) connector in Empyralis Setup -> Connect Channels.",
            )
        elif whatsapp_connector_errors > 0 or whatsapp_last_error:
            add_check(
                "whatsapp_autopilot_errors",
                "warn",
                f"WhatsApp autopilot has connector errors ({whatsapp_connector_errors}).",
                "Open /channels/whatsapp/autopilot/status and fix connector credentials/numbers.",
            )
        else:
            add_check(
                "whatsapp_autopilot",
                "pass",
                f"WhatsApp autopilot active (connectors_seen={whatsapp_connectors_seen}).",
            )
    else:
        add_check(
            "whatsapp_autopilot",
            "warn",
            "WhatsApp autopilot is disabled.",
            "Enable ORION_WHATSAPP_AUTOPILOT_ENABLED=1 and configure Twilio webhook.",
        )

    if bool(config.get("ORION_LOCAL_COMPANION_ENABLED")):
        add_check(
            "execution_routing",
            "pass",
            "Hybrid execution routing is enabled (cloud + local companion).",
        )
    else:
        add_check(
            "execution_routing",
            "warn",
            "Local companion routing is disabled; runs will execute in cloud mode.",
            "Set ORION_LOCAL_COMPANION_ENABLED=1 if you want hybrid routing with local companion.",
        )

    memory_enabled = bool(health_data.get("memory_enabled"))
    memory_ready = bool(health_data.get("memory_manager_ready"))
    memory_error = str(health_data.get("memory_manager_error") or "").strip()
    memory_db_path = str(health_data.get("memory_db_path") or config.get("ORION_MEMORY_DB_PATH") or "")
    memory_db_exists = bool(health_data.get("memory_db_exists"))
    memory_rows = int(health_data.get("memory_sqlite_rows") or 0)
    if not memory_enabled:
        add_check(
            "memory_runtime",
            "warn",
            "Memory runtime is disabled.",
            "Set ORION_MEMORY_ENABLED=1 to enable profile/project/session memory context.",
        )
    elif not memory_ready:
        add_check(
            "memory_runtime",
            "fail",
            f"Memory runtime is enabled but unavailable ({memory_error or 'unknown_error'}).",
            "Verify python_engine/memory_manager.py dependencies and DB path permissions.",
        )
    else:
        detail = f"Memory runtime healthy (rows={memory_rows}, db_exists={memory_db_exists}, db={memory_db_path})."
        add_check("memory_runtime", "pass", detail)

    default_state_home = Path.home() / ".empyralis" / "state"
    vault_file = Path(str(config.get("VAULT_FILE") or (default_state_home / "vault" / "credentials.json")))
    vault_parent = vault_file.parent if vault_file.parent != Path("") else Path(".")
    if not vault_parent.exists():
        add_check(
            "vault_storage",
            "fail",
            f"Vault directory does not exist: {vault_parent}",
            "Create directory or set CREDENTIAL_VAULT_FILE to a valid path.",
        )
    elif not os.access(vault_parent, os.W_OK):
        add_check(
            "vault_storage",
            "fail",
            f"Vault directory not writable: {vault_parent}",
            "Fix file permissions for runtime user.",
        )
    else:
        add_check("vault_storage", "pass", f"Vault path is writable: {vault_file}")

    setup_sessions_file = Path(str(config.get("ORION_SETUP_SESSIONS_FILE") or (default_state_home / "setup" / "sessions.json")))
    provider_profiles_file = Path(str(config.get("ORION_PROVIDER_PROFILES_FILE") or (default_state_home / "providers" / "profiles.json")))
    idempotency_file = Path(str(config.get("ORION_IDEMPOTENCY_FILE") or (default_state_home / "runtime" / "idempotency.json")))

    setup_parent = setup_sessions_file.parent if setup_sessions_file.parent != Path("") else Path(".")
    profiles_parent = provider_profiles_file.parent if provider_profiles_file.parent != Path("") else Path(".")
    idem_parent = idempotency_file.parent if idempotency_file.parent != Path("") else Path(".")
    if setup_parent.exists() and os.access(setup_parent, os.W_OK):
        add_check("setup_sessions_storage", "pass", f"Setup sessions path is writable: {setup_sessions_file}")
    else:
        add_check(
            "setup_sessions_storage",
            "fail",
            f"Setup sessions path is not writable: {setup_sessions_file}",
            "Fix directory permissions or configure ORION_SETUP_SESSIONS_FILE.",
        )
    if profiles_parent.exists() and os.access(profiles_parent, os.W_OK):
        add_check("provider_profiles_storage", "pass", f"Provider profiles path is writable: {provider_profiles_file}")
    else:
        add_check(
            "provider_profiles_storage",
            "fail",
            f"Provider profiles path is not writable: {provider_profiles_file}",
            "Fix directory permissions or configure ORION_PROVIDER_PROFILES_FILE.",
        )
    if idem_parent.exists() and os.access(idem_parent, os.W_OK):
        add_check("idempotency_storage", "pass", f"Idempotency path is writable: {idempotency_file}")
    else:
        add_check(
            "idempotency_storage",
            "fail",
            f"Idempotency path is not writable: {idempotency_file}",
            "Fix directory permissions or configure ORION_IDEMPOTENCY_FILE.",
        )

    cert_path = certifi.where()
    if cert_path and Path(cert_path).exists():
        add_check("tls_bundle", "pass", f"certifi bundle found: {cert_path}")
    else:
        add_check(
            "tls_bundle",
            "warn",
            "TLS cert bundle not detected.",
            "Install/repair certifi bundle for outbound HTTPS calls.",
        )

    fails = [c for c in checks if c["status"] == "fail"]
    warns = [c for c in checks if c["status"] == "warn"]

    return {
        "ok": len(fails) == 0,
        "summary": {
            "pass": len([c for c in checks if c["status"] == "pass"]),
            "warn": len(warns),
            "fail": len(fails),
        },
        "checks": checks,
        "generated_at": datetime.utcnow().isoformat() + "Z",
    }
