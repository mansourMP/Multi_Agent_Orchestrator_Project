from __future__ import annotations

import ipaddress
import hashlib
import json
import time
import uuid
from dataclasses import dataclass
from typing import Any, Callable, Dict, List, Optional, Protocol
from urllib.parse import urlparse

from server_modules import computer_action_safety, external_content_guard, secret_redaction_service
from server_modules.gateway_browser_runtime import GatewayBrowserRuntime


RUNTIME_INTERFACE_ID = "virtual_computer_runtime.v1"

RUNTIME_STATE_PROVISIONING = "provisioning"
RUNTIME_STATE_READY = "ready"
RUNTIME_STATE_RUNNING = "running"
RUNTIME_STATE_PAUSED = "paused"
RUNTIME_STATE_DEGRADED = "degraded"
RUNTIME_STATE_EXPIRED = "expired"
RUNTIME_STATE_TERMINATED = "terminated"
RUNTIME_STATE_FAILED = "failed"

RUNTIME_STATES = [
    RUNTIME_STATE_PROVISIONING,
    RUNTIME_STATE_READY,
    RUNTIME_STATE_RUNNING,
    RUNTIME_STATE_PAUSED,
    RUNTIME_STATE_DEGRADED,
    RUNTIME_STATE_EXPIRED,
    RUNTIME_STATE_TERMINATED,
    RUNTIME_STATE_FAILED,
]

RUNTIME_METHODS = [
    "create_session",
    "resume_session",
    "pause_session",
    "terminate_session",
    "execute_action",
    "stream_screenshot",
    "collect_artifact",
    "snapshot_session",
]

RUNTIME_CHOICE_LOCAL = "local"
RUNTIME_CHOICE_VIRTUAL_BROWSER = "virtual_browser"
RUNTIME_CHOICE_VIRTUAL_DESKTOP = "virtual_desktop"
RUNTIME_CHOICE_VIRTUAL_CODE_SANDBOX = "virtual_code_sandbox"
IDENTITY_CLASS_USER_LOCAL = "user_local_identity"
IDENTITY_CLASS_AGENT_VIRTUAL = "agent_virtual_identity"
IDENTITY_CLASS_BUSINESS_WORKSPACE = "business_workspace_identity"
IDENTITY_CLASS_EPHEMERAL_TASK = "ephemeral_task_identity"
LOGIN_STATE_USER_INTERACTIVE = "user_interactive_login"
LOGIN_STATE_CREDENTIAL_BROKER = "credential_broker_grant"
LOGIN_STATE_UNAUTHENTICATED = "unauthenticated"
SESSION_PERSISTENCE_EPHEMERAL = "ephemeral"
SESSION_PERSISTENCE_RESUMABLE = "resumable"

PROVIDER_ID_BROWSERBASE = "browserbase"
PROVIDER_ID_E2B = "e2b"
PROVIDER_ID_DAYTONA = "daytona"
PROVIDER_ID_AWS_WORKSPACES = "aws_workspaces"
PROVIDER_ID_AZURE_VIRTUAL_DESKTOP = "azure_virtual_desktop"
PROVIDER_ID_DOCKER_KUBERNETES = "docker_kubernetes"

PROVIDER_CAPABILITY_KEYS = [
    "browser",
    "shell",
    "filesystem",
    "screenshot",
    "persistence",
    "snapshots",
    "public_url",
    "network_controls",
    "max_runtime",
    "cost_unit",
]

METADATA_HOST_DENYLIST = {
    "169.254.169.254",
    "169.254.170.2",
    "100.100.100.200",
    "metadata.google.internal",
    "metadata.azure.internal",
}
ACTION_SCREENSHOT = "screenshot"
ACTION_CLICK = "click"
ACTION_TYPE = "type"
ACTION_SCROLL = "scroll"
ACTION_HOTKEY = "hotkey"
ACTION_WAIT = "wait"
ACTION_OPEN_URL = "open_url"
ACTION_DOWNLOAD_ARTIFACT = "download_artifact"
ACTION_RUN_COMMAND = "run_command"
ACTION_KILL_SWITCH = "kill_switch"
VALID_COMPUTER_USE_ACTIONS = {
    ACTION_SCREENSHOT,
    ACTION_CLICK,
    ACTION_TYPE,
    ACTION_SCROLL,
    ACTION_HOTKEY,
    ACTION_WAIT,
    ACTION_OPEN_URL,
    ACTION_DOWNLOAD_ARTIFACT,
    ACTION_RUN_COMMAND,
    ACTION_KILL_SWITCH,
}
ACTION_ALIASES = {
    "navigate": ACTION_OPEN_URL,
    "download_file": ACTION_DOWNLOAD_ARTIFACT,
}
ARTIFACT_TYPE_SCREENSHOT = "screenshot"
ARTIFACT_TYPE_PDF = "pdf"
ARTIFACT_TYPE_CSV = "csv"
ARTIFACT_TYPE_DOWNLOADED_FILE = "downloaded_file"
ARTIFACT_TYPE_GENERATED_DOCUMENT = "generated_document"
ARTIFACT_TYPE_BROWSER_TRACE = "browser_trace"
ARTIFACT_TYPE_TERMINAL_LOG = "terminal_log"
VALID_ARTIFACT_TYPES = {
    ARTIFACT_TYPE_SCREENSHOT,
    ARTIFACT_TYPE_PDF,
    ARTIFACT_TYPE_CSV,
    ARTIFACT_TYPE_DOWNLOADED_FILE,
    ARTIFACT_TYPE_GENERATED_DOCUMENT,
    ARTIFACT_TYPE_BROWSER_TRACE,
    ARTIFACT_TYPE_TERMINAL_LOG,
}
ARTIFACT_EXPORT_LOCAL = "local_computer"
ARTIFACT_EXPORT_WORKSPACE = "workspace"
IRREVERSIBLE_ACTIONS = {ACTION_RUN_COMMAND}
MAX_TYPE_TEXT_LEN = 4096
MAX_URL_LEN = 2048
MAX_COMMAND_LEN = 1024
MAX_KEY_TOKEN_LEN = 32
MAX_WAIT_MS = 120000
MAX_COORDINATE = 50000
UNTRUSTED_EXTERNAL_TEXT_FIELDS = {
    "page_text",
    "app_text",
    "ocr_text",
    "visible_text",
    "extracted_text",
}
RISK_CLASS_GREEN = "GREEN"
RISK_CLASS_YELLOW = "YELLOW"
RISK_CLASS_ORANGE = "ORANGE"
RISK_CLASS_RED = "RED"
VALID_RISK_CLASSES = {RISK_CLASS_GREEN, RISK_CLASS_YELLOW, RISK_CLASS_ORANGE, RISK_CLASS_RED}
RISK_DENY_WINS_DEFAULT = True
ORANGE_MARKERS = {
    "send",
    "submit",
    "upload",
    "login",
    "log in",
    "sign in",
    "checkout",
    "buy",
    "purchase",
    "confirm",
    "message",
}
RED_MARKERS = {
    "payment",
    "pay now",
    "charge",
    "wire transfer",
    "legal",
    "medical",
    "financial commitment",
    "credential export",
    "export credentials",
    "export api key",
    "mass message",
    "bulk send",
    "all contacts",
    "sweep send",
}
PHISHING_DOMAIN_MARKERS = {
    "secure-login",
    "verify-account",
    "update-billing",
    "wallet-recovery",
    "auth-check",
    "signin-now",
    "account-verify",
}
PHISHING_PATH_MARKERS = {
    "/login/verify",
    "/account/verify",
    "/security-check",
    "/oauth/consent/fake",
    "/wallet/recover",
}
DEFAULT_ENTERPRISE_APPROVAL_ROLES = ["owner", "admin", "security_reviewer"]


def _token(value: Any) -> str:
    return str(value or "").strip()


def _gateway_status_to_contract_state(status: Any) -> str:
    token = _token(status).lower()
    if token in {"started", "active", "attached", "resumed", "completed"}:
        return RUNTIME_STATE_RUNNING
    if token in {"waiting_for_input", "interrupted"}:
        return RUNTIME_STATE_PAUSED
    if token in {"not_attached", "attach_required"}:
        return RUNTIME_STATE_READY
    if token in {"attach_failed", "error", "failed"}:
        return RUNTIME_STATE_DEGRADED
    if token == "terminated":
        return RUNTIME_STATE_TERMINATED
    if token == "expired":
        return RUNTIME_STATE_EXPIRED
    return RUNTIME_STATE_READY


def _runtime_choice_default_isolation_profile(runtime_choice: Any) -> VirtualComputerIsolationProfile:
    choice = _token(runtime_choice).lower()
    if choice == RUNTIME_CHOICE_LOCAL:
        return VirtualComputerIsolationProfile(
            filesystem_quota_bytes=500 * 1024 * 1024,
            cpu_quota_seconds=300,
            memory_quota_mb=1024,
            runtime_ttl_seconds=60 * 60,
            allow_private_lan=False,
            allowed_hosts=[],
            block_metadata_endpoints=True,
            clipboard_enabled=False,
            file_transfer_enabled=False,
            kill_switch_enabled=True,
        )
    return VirtualComputerIsolationProfile(
        filesystem_quota_bytes=250 * 1024 * 1024,
        cpu_quota_seconds=120,
        memory_quota_mb=768,
        runtime_ttl_seconds=30 * 60,
        allow_private_lan=False,
        allowed_hosts=[],
        block_metadata_endpoints=True,
        clipboard_enabled=False,
        file_transfer_enabled=False,
        kill_switch_enabled=True,
    )


def _coerce_positive_int(value: Any, default_value: int, minimum: int) -> int:
    try:
        parsed = int(value)
    except Exception:
        return max(default_value, minimum)
    return max(parsed, minimum)


def _coerce_positive_float(value: Any, default_value: float, minimum: float) -> float:
    try:
        parsed = float(value)
    except Exception:
        return max(float(default_value), float(minimum))
    return max(float(parsed), float(minimum))


def _normalize_allowed_hosts(values: Any) -> List[str]:
    if not isinstance(values, list):
        return []
    normalized: List[str] = []
    for item in values:
        token = _token(item).lower()
        if token and token not in normalized:
            normalized.append(token)
    return normalized


def build_isolation_profile(payload: Dict[str, Any], *, runtime_choice: Any) -> VirtualComputerIsolationProfile:
    base = _runtime_choice_default_isolation_profile(runtime_choice)
    source = payload.get("isolation_profile") if isinstance(payload.get("isolation_profile"), dict) else {}
    return VirtualComputerIsolationProfile(
        filesystem_quota_bytes=_coerce_positive_int(
            source.get("filesystem_quota_bytes"),
            base.filesystem_quota_bytes,
            1 * 1024 * 1024,
        ),
        cpu_quota_seconds=_coerce_positive_int(source.get("cpu_quota_seconds"), base.cpu_quota_seconds, 10),
        memory_quota_mb=_coerce_positive_int(source.get("memory_quota_mb"), base.memory_quota_mb, 128),
        runtime_ttl_seconds=_coerce_positive_int(source.get("runtime_ttl_seconds"), base.runtime_ttl_seconds, 60),
        allow_private_lan=bool(source.get("allow_private_lan", base.allow_private_lan)),
        allowed_hosts=_normalize_allowed_hosts(source.get("allowed_hosts") or source.get("allowlist_hosts")),
        block_metadata_endpoints=bool(source.get("block_metadata_endpoints", base.block_metadata_endpoints)),
        clipboard_enabled=bool(source.get("clipboard_enabled", base.clipboard_enabled)),
        file_transfer_enabled=bool(source.get("file_transfer_enabled", base.file_transfer_enabled)),
        kill_switch_enabled=bool(source.get("kill_switch_enabled", base.kill_switch_enabled)),
    )


def _host_is_private_or_local(host: str) -> bool:
    token = _token(host).lower()
    if not token:
        return True
    try:
        addr = ipaddress.ip_address(token)
        return bool(
            addr.is_private
            or addr.is_loopback
            or addr.is_link_local
            or addr.is_reserved
            or addr.is_multicast
        )
    except ValueError:
        pass
    if token == "localhost":
        return True
    if token.endswith(".local") or token.endswith(".lan") or token.endswith(".internal") or token.endswith(".home") or token.endswith(".arpa"):
        return True
    return False


def _host_is_metadata_endpoint(host: str) -> bool:
    return _token(host).lower() in METADATA_HOST_DENYLIST


def _host_matches_allowlist(host: str, allowed_hosts: List[str]) -> bool:
    token = _token(host).lower()
    if not token:
        return False
    for entry in allowed_hosts:
        item = _token(entry).lower()
        if not item:
            continue
        if item.startswith("*."):
            suffix = item[2:]
            if token.endswith(f".{suffix}"):
                return True
            continue
        if token == item or token.endswith(f".{item}"):
            return True
    return False


def _assert_url_allowed(url: Any, profile: VirtualComputerIsolationProfile) -> None:
    token = _token(url)
    if not token:
        return
    parsed = urlparse(token)
    scheme = _token(parsed.scheme).lower()
    if scheme and scheme not in {"http", "https"}:
        raise RuntimeError("Isolation profile only allows http/https outbound URLs.")
    host = _token(parsed.hostname).lower()
    if not host:
        raise RuntimeError("Outbound URL host is required.")
    if profile.block_metadata_endpoints and _host_is_metadata_endpoint(host):
        raise RuntimeError("Isolation profile blocked a cloud metadata endpoint.")
    if not profile.allow_private_lan and _host_is_private_or_local(host):
        raise RuntimeError("Isolation profile blocked private LAN/localhost outbound access.")
    if profile.allowed_hosts and not _host_matches_allowlist(host, profile.allowed_hosts):
        raise RuntimeError("Isolation profile blocked outbound host not present in allowlist.")


def _normalize_policy_domain_list(values: Any) -> List[str]:
    if not isinstance(values, list):
        return []
    out: List[str] = []
    for item in values:
        token = _token(item).lower()
        if token and token not in out:
            out.append(token)
    return out


def _build_network_browser_security_policy(payload: Dict[str, Any]) -> Dict[str, Any]:
    source = payload.get("network_browser_policy") if isinstance(payload.get("network_browser_policy"), dict) else {}
    if not source:
        source = payload.get("browser_security_policy") if isinstance(payload.get("browser_security_policy"), dict) else {}
    return {
        "allowed_domains": _normalize_policy_domain_list(source.get("allowed_domains")),
        "denied_domains": _normalize_policy_domain_list(source.get("denied_domains") or source.get("blocked_domains")),
        "detect_phishing_pages": bool(source.get("detect_phishing_pages", True)),
        "block_auto_download_without_approval": bool(source.get("block_auto_download_without_approval", True)),
        "enforce_domain_bound_credential_injection": bool(source.get("enforce_domain_bound_credential_injection", True)),
    }


def _extract_host_from_url(url: Any) -> str:
    token = _token(url)
    if not token:
        return ""
    parsed = urlparse(token)
    return _token(parsed.hostname).lower()


def _domain_matches_scope(host: str, scope_domain: str) -> bool:
    host_token = _token(host).lower()
    scope = _token(scope_domain).lower()
    if not host_token or not scope:
        return False
    if scope.startswith("*."):
        return host_token.endswith("." + scope[2:]) or host_token == scope[2:]
    return host_token == scope or host_token.endswith("." + scope)


def _looks_like_phishing_page(url: Any, action_args: Dict[str, Any]) -> bool:
    token = _token(url).lower()
    if not token:
        return False
    host = _extract_host_from_url(token)
    parsed = urlparse(token)
    path = _token(parsed.path).lower()
    if any(marker in host for marker in PHISHING_DOMAIN_MARKERS):
        return True
    if any(marker in path for marker in PHISHING_PATH_MARKERS):
        return True
    blob = " ".join(
        [
            _token(action_args.get("target_description")).lower(),
            _token(action_args.get("target_text")).lower(),
            _token(action_args.get("page_text")).lower(),
            _token(action_args.get("app_text")).lower(),
        ]
    )
    if "enter your password" in blob and host and not host.endswith("example.com"):
        return True
    return False


def _assert_network_browser_security(
    *,
    action: str,
    action_args: Dict[str, Any],
    policy: Dict[str, Any],
    approval_granted: bool,
    current_url: Any = None,
) -> None:
    action_token = _token(action).lower()
    url = _token(action_args.get("url") or current_url)
    host = _extract_host_from_url(url)
    denied_domains = list(policy.get("denied_domains") or [])
    allowed_domains = list(policy.get("allowed_domains") or [])

    if host:
        for denied in denied_domains:
            if _domain_matches_scope(host, denied):
                raise RuntimeError("Network policy blocked denied domain.")
        if allowed_domains:
            if not any(_domain_matches_scope(host, allowed) for allowed in allowed_domains):
                raise RuntimeError("Network policy blocked non-allowlisted domain.")

    if bool(policy.get("detect_phishing_pages")) and url:
        if _looks_like_phishing_page(url, action_args):
            raise RuntimeError("Potential phishing page detected; action blocked.")

    if action_token == ACTION_DOWNLOAD_ARTIFACT:
        auto_download = bool(action_args.get("auto_download", True))
        if auto_download and bool(policy.get("block_auto_download_without_approval")) and not approval_granted:
            raise RuntimeError("Automatic download blocked without explicit approval.")


def _normalize_enterprise_controls(payload: Dict[str, Any]) -> Dict[str, Any]:
    source = payload.get("enterprise_controls") if isinstance(payload.get("enterprise_controls"), dict) else {}
    if not source:
        source = payload.get("workspace_admin_policy") if isinstance(payload.get("workspace_admin_policy"), dict) else {}
    workspace_admin_source = (
        source.get("workspace_admin_policy")
        if isinstance(source.get("workspace_admin_policy"), dict)
        else source
    )
    domain_allowlist = _normalize_policy_domain_list(source.get("domain_allowlist") or source.get("allowed_domains"))
    approval_roles = _normalize_policy_domain_list(
        source.get("approval_roles") or source.get("per_team_approval_roles") or []
    )
    return {
        "workspace_admin_policy": {
            "require_workspace_admin_for_runtime": bool(
                workspace_admin_source.get("require_workspace_admin_for_runtime", False)
            ),
        },
        "domain_allowlist": domain_allowlist,
        "data_residency": str(source.get("data_residency") or source.get("data_residency_flag") or "unspecified").strip().lower()
        or "unspecified",
        "disable_public_internet_mode": bool(source.get("disable_public_internet_mode", False)),
        "allow_audit_export": bool(source.get("allow_audit_export", True)),
        "sso_required": bool(source.get("sso_required", False)),
        "per_team_approval_roles": approval_roles,
        "session_recording_retention_seconds": _coerce_positive_int(
            source.get("session_recording_retention_seconds"),
            30 * 24 * 60 * 60,
            60,
        ),
    }


def _assert_workspace_admin_policy(payload: Dict[str, Any], controls: Dict[str, Any]) -> None:
    policy = controls.get("workspace_admin_policy") if isinstance(controls.get("workspace_admin_policy"), dict) else {}
    if not bool(policy.get("require_workspace_admin_for_runtime")):
        return
    approved = bool(
        payload.get("workspace_admin_approved")
        or payload.get("admin_approved")
        or payload.get("approved_by_workspace_admin")
        or _token(payload.get("workspace_admin_approval_id"))
    )
    if not approved:
        raise RuntimeError("Workspace admin approval is required by enterprise policy.")


def _assert_enterprise_network_controls(
    *,
    action: str,
    action_args: Dict[str, Any],
    controls: Dict[str, Any],
    current_url: Any,
) -> None:
    if not bool(controls.get("disable_public_internet_mode")):
        return
    action_token = _token(action).lower()
    if action_token not in {ACTION_OPEN_URL, ACTION_DOWNLOAD_ARTIFACT, ACTION_TYPE, ACTION_CLICK, ACTION_HOTKEY}:
        return
    allowlist = _normalize_policy_domain_list(controls.get("domain_allowlist"))
    target_host = _extract_host_from_url(action_args.get("url") or current_url)
    if not target_host:
        raise RuntimeError("Enterprise public-internet disable policy requires allowlisted target hosts.")
    if not allowlist:
        raise RuntimeError("Enterprise policy disabled public internet without a domain allowlist.")
    if not any(_domain_matches_scope(target_host, item) for item in allowlist):
        raise RuntimeError("Enterprise policy blocked non-allowlisted internet domain.")


def _assert_enterprise_approval_role_controls(
    *,
    action_policy: Dict[str, Any],
    payload: Dict[str, Any],
    controls: Dict[str, Any],
) -> None:
    if not bool(action_policy.get("requires_approval")):
        return
    if not bool(action_policy.get("approval_granted")):
        return
    allowed_roles = _normalize_policy_domain_list(controls.get("per_team_approval_roles"))
    if not allowed_roles:
        return
    policy_metadata = payload.get("policy_metadata") if isinstance(payload.get("policy_metadata"), dict) else {}
    approval_role = (
        _token(payload.get("approval_role"))
        or _token(payload.get("approved_by_role"))
        or _token(policy_metadata.get("approval_role"))
        or _token(policy_metadata.get("owner_role"))
    ).lower()
    if approval_role and approval_role in allowed_roles:
        return
    raise RuntimeError("Enterprise approval-role policy rejected approval role for this action.")


def _normalize_local_gateway_bridge_policy(payload: Dict[str, Any]) -> Dict[str, Any]:
    source = payload.get("local_gateway_bridge") if isinstance(payload.get("local_gateway_bridge"), dict) else {}
    if not source:
        source = payload.get("gateway_bridge_policy") if isinstance(payload.get("gateway_bridge_policy"), dict) else {}
    return {
        "local_handoff_enabled": bool(source.get("local_handoff_enabled", True)),
        "require_user_approval_for_local_move": True,
        "require_local_gateway_approval_for_artifact_transfer": True,
        "allow_cookie_transfer": False,
        "allow_file_transfer": False,
        "allow_clipboard_transfer": False,
        "allow_secret_transfer": False,
    }


def _assert_no_automatic_local_transfer(action_args: Dict[str, Any], payload: Dict[str, Any], bridge_policy: Dict[str, Any]) -> None:
    forbidden_truthy_keys = [
        "transfer_cookies_to_local",
        "transfer_files_to_local",
        "transfer_clipboard_to_local",
        "transfer_secrets_to_local",
        "reuse_local_cookies",
        "auto_local_handoff",
    ]
    for key in forbidden_truthy_keys:
        if bool(action_args.get(key)) or bool(payload.get(key)):
            raise RuntimeError("Local gateway bridge blocked automatic transfer across trust boundary.")
    if bool(action_args.get("move_to_my_mac")) and not bool(
        payload.get("local_handoff_approved") or payload.get("approved") or _token(payload.get("approval_id"))
    ):
        raise RuntimeError("User approval is required to move data to local computer.")


def _assert_local_handoff_transfer_approval(payload: Dict[str, Any], bridge_policy: Dict[str, Any]) -> None:
    if not bool(bridge_policy.get("local_handoff_enabled", True)):
        raise RuntimeError("Local gateway bridge handoff is disabled by policy.")
    user_approved = bool(payload.get("local_handoff_approved") or payload.get("approved") or _token(payload.get("approval_id")))
    if bool(bridge_policy.get("require_user_approval_for_local_move", True)) and not user_approved:
        raise RuntimeError("User approval is required for local gateway handoff.")
    gateway_approved = bool(payload.get("local_gateway_approved") or _token(payload.get("local_gateway_approval_id")))
    if bool(bridge_policy.get("require_local_gateway_approval_for_artifact_transfer", True)) and not gateway_approved:
        raise RuntimeError("Local gateway approval is required for artifact import/export handoff.")


def _assert_action_allowed(
    *,
    action: Any,
    action_args: Dict[str, Any],
    profile: VirtualComputerIsolationProfile,
) -> None:
    action_token = _token(action).lower()
    if profile.kill_switch_enabled and action_token == ACTION_KILL_SWITCH:
        return
    if not profile.clipboard_enabled and "clipboard" in action_token:
        raise RuntimeError("Clipboard is disabled by isolation profile.")
    if not profile.file_transfer_enabled and action_token in {"upload_files", "download_file", ACTION_DOWNLOAD_ARTIFACT}:
        raise RuntimeError("File upload/download is disabled by isolation profile.")
    if action_token in {"navigate", ACTION_OPEN_URL, "download_file", ACTION_DOWNLOAD_ARTIFACT}:
        _assert_url_allowed(action_args.get("url"), profile)


def _coerce_int_field(field_name: str, raw_value: Any) -> int:
    try:
        return int(raw_value)
    except Exception as exc:
        raise RuntimeError(f"Action field '{field_name}' must be an integer.") from exc


def _normalize_action_name(action: Any) -> str:
    token = _token(action).lower()
    return ACTION_ALIASES.get(token, token)


def _wrap_untrusted_action_content(action_args: Dict[str, Any]) -> tuple[Dict[str, Any], Dict[str, Any]]:
    wrapped_args = dict(action_args or {})
    wrapped_meta: Dict[str, Any] = {}
    for key in sorted(UNTRUSTED_EXTERNAL_TEXT_FIELDS):
        raw = wrapped_args.get(key)
        if not isinstance(raw, str) or not raw.strip():
            continue
        wrapped = external_content_guard.wrap_external_content(
            raw,
            source="virtual_computer_action",
            channel="virtual_computer",
        )
        wrapped_args[key] = wrapped.text
        wrapped_meta[key] = {
            "wrapper_id": wrapped.wrapper_id,
            "suspicious_patterns": list(wrapped.suspicious_patterns),
            "source": wrapped.metadata.source,
        }
    return wrapped_args, wrapped_meta


def _validate_computer_use_action_payload(
    *,
    action: Any,
    action_args: Dict[str, Any],
) -> tuple[str, Dict[str, Any], Dict[str, Any]]:
    normalized_action = _normalize_action_name(action)
    if normalized_action not in VALID_COMPUTER_USE_ACTIONS:
        raise RuntimeError(f"Unsupported virtual computer action '{action}'.")

    normalized_args = dict(action_args or {})
    if normalized_action == ACTION_CLICK:
        x = _coerce_int_field("x", normalized_args.get("x"))
        y = _coerce_int_field("y", normalized_args.get("y"))
        if x < 0 or y < 0 or x > MAX_COORDINATE or y > MAX_COORDINATE:
            raise RuntimeError("Click coordinates are outside the allowed range.")
        normalized_args["x"] = x
        normalized_args["y"] = y
    elif normalized_action == ACTION_TYPE:
        text = str(normalized_args.get("text") or "")
        if not text:
            raise RuntimeError("Type action requires non-empty text.")
        if len(text) > MAX_TYPE_TEXT_LEN:
            raise RuntimeError("Type action text exceeds the maximum allowed length.")
        normalized_args["text"] = text
    elif normalized_action == ACTION_SCROLL:
        has_dx = "delta_x" in normalized_args
        has_dy = "delta_y" in normalized_args
        if not has_dx and not has_dy:
            raise RuntimeError("Scroll action requires delta_x or delta_y.")
        if has_dx:
            delta_x = _coerce_int_field("delta_x", normalized_args.get("delta_x"))
            if abs(delta_x) > MAX_COORDINATE:
                raise RuntimeError("Scroll delta_x exceeds the allowed range.")
            normalized_args["delta_x"] = delta_x
        if has_dy:
            delta_y = _coerce_int_field("delta_y", normalized_args.get("delta_y"))
            if abs(delta_y) > MAX_COORDINATE:
                raise RuntimeError("Scroll delta_y exceeds the allowed range.")
            normalized_args["delta_y"] = delta_y
    elif normalized_action == ACTION_HOTKEY:
        keys = normalized_args.get("keys")
        if isinstance(keys, list):
            normalized_keys = [str(item or "").strip().lower() for item in keys if str(item or "").strip()]
        else:
            single = str(normalized_args.get("key") or "").strip().lower()
            normalized_keys = [single] if single else []
        if not normalized_keys:
            raise RuntimeError("Hotkey action requires at least one key.")
        if len(normalized_keys) > 6:
            raise RuntimeError("Hotkey action exceeds maximum key combination size.")
        if any(len(item) > MAX_KEY_TOKEN_LEN for item in normalized_keys):
            raise RuntimeError("Hotkey token exceeds maximum allowed length.")
        normalized_args["keys"] = normalized_keys
    elif normalized_action == ACTION_WAIT:
        if "duration_ms" in normalized_args:
            duration_ms = _coerce_int_field("duration_ms", normalized_args.get("duration_ms"))
        else:
            seconds = _coerce_int_field("seconds", normalized_args.get("seconds") or 0)
            duration_ms = seconds * 1000
        if duration_ms < 0 or duration_ms > MAX_WAIT_MS:
            raise RuntimeError("Wait duration is outside the allowed range.")
        normalized_args["duration_ms"] = duration_ms
    elif normalized_action in {ACTION_OPEN_URL, ACTION_DOWNLOAD_ARTIFACT}:
        url = _token(normalized_args.get("url"))
        if not url:
            raise RuntimeError(f"{normalized_action} action requires a URL.")
        if len(url) > MAX_URL_LEN:
            raise RuntimeError("URL exceeds maximum allowed length.")
        normalized_args["url"] = url
    elif normalized_action == ACTION_RUN_COMMAND:
        command = str(normalized_args.get("command") or "")
        if not command.strip():
            raise RuntimeError("run_command action requires a non-empty command.")
        if len(command) > MAX_COMMAND_LEN:
            raise RuntimeError("Command exceeds maximum allowed length.")
        normalized_args["command"] = command

    wrapped_args, wrapped_external = _wrap_untrusted_action_content(normalized_args)
    return normalized_action, wrapped_args, wrapped_external


def _evaluate_action_policy_and_approval(
    *,
    action: str,
    action_args: Dict[str, Any],
    runtime_kind: str,
    payload: Dict[str, Any],
) -> Dict[str, Any]:
    policy_metadata = payload.get("policy_metadata") if isinstance(payload.get("policy_metadata"), dict) else {}
    vc_risk_policy = (
        payload.get("risk_policy")
        if isinstance(payload.get("risk_policy"), dict)
        else policy_metadata.get("virtual_computer_risk_policy")
    )
    vc_risk_policy = vc_risk_policy if isinstance(vc_risk_policy, dict) else {}
    capability_id = f"computer_control.{action}"
    operation = {
        "action": action,
        "tool": "computer_control",
        "target_text": str(action_args.get("target_text") or ""),
        "target_description": str(action_args.get("target_description") or ""),
        "confirm_text": str(action_args.get("confirm_text") or ""),
        "text": str(action_args.get("text") or ""),
        "url": str(action_args.get("url") or ""),
        "script": str(action_args.get("command") or ""),
    }
    target = "local_companion" if runtime_kind == "local_gateway_runtime" else "cloud"
    eval_result = computer_action_safety.evaluate_dangerous_computer_action_policy(
        operation,
        metadata=policy_metadata,
        capability_id=capability_id,
        policy_mode=str(policy_metadata.get("policy_mode") or ""),
        target=target,
    )
    if str(eval_result.get("execution_decision") or "").strip().lower() == "deny":
        labels = ", ".join(list(eval_result.get("dangerous_action_labels") or []))
        if labels:
            raise RuntimeError(f"Computer-use action blocked by policy: {labels}.")
        raise RuntimeError("Computer-use action blocked by policy.")

    def _normalize_class_list(raw: Any) -> List[str]:
        values = raw if isinstance(raw, list) else []
        out: List[str] = []
        for item in values:
            token = str(item or "").strip().upper()
            if token in VALID_RISK_CLASSES and token not in out:
                out.append(token)
        return out

    def _risk_text_blob() -> str:
        parts = [
            str(action or ""),
            str(action_args.get("target_text") or ""),
            str(action_args.get("target_description") or ""),
            str(action_args.get("confirm_text") or ""),
            str(action_args.get("text") or ""),
            str(action_args.get("url") or ""),
            str(action_args.get("command") or ""),
            str(action_args.get("intent") or ""),
        ]
        return " ".join(parts).strip().lower()

    def _classify_risk() -> str:
        if action == ACTION_RUN_COMMAND:
            return RISK_CLASS_RED
        if action in {ACTION_SCREENSHOT, ACTION_OPEN_URL, ACTION_SCROLL, ACTION_WAIT}:
            base = RISK_CLASS_GREEN
        elif action in {ACTION_DOWNLOAD_ARTIFACT, ACTION_CLICK, ACTION_TYPE, ACTION_HOTKEY}:
            base = RISK_CLASS_YELLOW
        else:
            base = RISK_CLASS_YELLOW

        blob = _risk_text_blob()
        if any(marker in blob for marker in RED_MARKERS):
            return RISK_CLASS_RED
        if any(marker in blob for marker in ORANGE_MARKERS):
            return RISK_CLASS_ORANGE
        return base

    risk_class = _classify_risk()
    deny_classes = set(_normalize_class_list(vc_risk_policy.get("deny_classes") or []))
    allow_orange_without_approval = bool(vc_risk_policy.get("allow_orange_without_approval"))
    red_policy = str(vc_risk_policy.get("red_policy") or "block").strip().lower()
    if red_policy not in {"block", "owner_approval"}:
        red_policy = "block"
    deny_wins = bool(vc_risk_policy.get("deny_wins", RISK_DENY_WINS_DEFAULT))

    dangerous_classes = set(eval_result.get("dangerous_action_classes") or [])
    if "purchase_checkout" in dangerous_classes:
        risk_class = RISK_CLASS_RED
    elif "credential_entry" in dangerous_classes and risk_class != RISK_CLASS_RED:
        risk_class = RISK_CLASS_ORANGE

    if deny_wins and risk_class in deny_classes:
        raise RuntimeError(f"Computer-use action blocked by risk policy ({risk_class}).")

    owner_or_admin = computer_action_safety.owner_or_admin_mode(policy_metadata)
    approval_granted = bool(
        payload.get("approved")
        or payload.get("approval_granted")
        or _token(payload.get("approval_id"))
        or _token(payload.get("approval_token"))
    )
    requires_approval = bool(eval_result.get("requires_approval")) or action in IRREVERSIBLE_ACTIONS
    if risk_class == RISK_CLASS_ORANGE and not allow_orange_without_approval:
        requires_approval = True
    if risk_class == RISK_CLASS_RED:
        if red_policy == "block":
            raise RuntimeError("Computer-use RED-risk action is blocked by policy.")
        if not owner_or_admin:
            raise RuntimeError("Computer-use RED-risk action requires owner/admin mode.")
        requires_approval = True
    if requires_approval and not approval_granted:
        raise RuntimeError(f"Computer-use action requires explicit approval before execution ({risk_class}).")
    return {
        "requires_approval": requires_approval,
        "approval_granted": approval_granted,
        "dangerous_action_classes": list(eval_result.get("dangerous_action_classes") or []),
        "dangerous_action_labels": list(eval_result.get("dangerous_action_labels") or []),
        "risk_class": risk_class,
        "deny_wins": deny_wins,
        "deny_classes": sorted(deny_classes),
        "red_policy": red_policy,
        "owner_or_admin_mode": owner_or_admin,
        "decision": str(eval_result.get("decision") or "allow"),
        "execution_decision": str(eval_result.get("execution_decision") or "allow"),
    }


def _assert_session_active(state: VirtualComputerIsolationState) -> None:
    if state.terminated:
        detail = _token(state.termination_reason) or "kill_switch_terminated"
        raise RuntimeError(f"Session terminated by kill switch: {detail}.")
    if time.time() >= float(state.expires_at_epoch):
        raise RuntimeError("Session expired by runtime TTL.")


def _profile_payload(profile: VirtualComputerIsolationProfile) -> Dict[str, Any]:
    return {
        "filesystem_quota_bytes": int(profile.filesystem_quota_bytes),
        "cpu_quota_seconds": int(profile.cpu_quota_seconds),
        "memory_quota_mb": int(profile.memory_quota_mb),
        "runtime_ttl_seconds": int(profile.runtime_ttl_seconds),
        "allow_private_lan": bool(profile.allow_private_lan),
        "allowed_hosts": list(profile.allowed_hosts),
        "block_metadata_endpoints": bool(profile.block_metadata_endpoints),
        "clipboard_enabled": bool(profile.clipboard_enabled),
        "file_transfer_enabled": bool(profile.file_transfer_enabled),
        "kill_switch_enabled": bool(profile.kill_switch_enabled),
    }


def _normalize_identity_class(value: Any) -> str:
    token = _token(value).lower()
    if token in {
        IDENTITY_CLASS_USER_LOCAL,
        IDENTITY_CLASS_AGENT_VIRTUAL,
        IDENTITY_CLASS_BUSINESS_WORKSPACE,
        IDENTITY_CLASS_EPHEMERAL_TASK,
    }:
        return token
    return ""


def _normalize_login_state(value: Any) -> str:
    token = _token(value).lower()
    if token in {
        LOGIN_STATE_USER_INTERACTIVE,
        LOGIN_STATE_CREDENTIAL_BROKER,
        LOGIN_STATE_UNAUTHENTICATED,
    }:
        return token
    return ""


def _payload_requests_local_identity_reuse(payload: Dict[str, Any]) -> bool:
    if bool(payload.get("reuse_local_cookies")):
        return True
    if _token(payload.get("browser_session_mode")).lower() == "existing_session_attach":
        return True
    if _token(payload.get("attach_endpoint_url")):
        return True
    if payload.get("local_cookie_jar") is not None:
        return True
    if payload.get("local_browser_state") is not None:
        return True
    if payload.get("local_identity_session") is not None:
        return True
    return False


def _build_identity_context(payload: Dict[str, Any], *, runtime_choice: Any) -> VirtualComputerIdentityContext:
    choice = _token(runtime_choice).lower()
    identity_class = _normalize_identity_class(payload.get("identity_class"))
    login_state = _normalize_login_state(payload.get("login_state"))
    metadata = payload.get("identity_metadata") if isinstance(payload.get("identity_metadata"), dict) else {}
    principal_id = _token(payload.get("principal_id") or metadata.get("principal_id")) or None
    credential_grant_id = (
        _token(payload.get("credential_grant_id") or payload.get("scoped_credential_grant_id") or metadata.get("credential_grant_id"))
        or None
    )
    credential_scope_domain = _token(
        payload.get("credential_scope_domain")
        or payload.get("credential_domain")
        or metadata.get("credential_scope_domain")
        or metadata.get("credential_domain")
    ).lower() or None

    if choice == RUNTIME_CHOICE_LOCAL:
        resolved_identity_class = identity_class or IDENTITY_CLASS_USER_LOCAL
        resolved_login_state = login_state or LOGIN_STATE_USER_INTERACTIVE
        cookie_reuse_allowed = True
    else:
        if _payload_requests_local_identity_reuse(payload):
            raise RuntimeError(
                "VC-5 identity split blocked local browser cookie/session reuse in virtual computer runtime."
            )
        resolved_identity_class = identity_class or IDENTITY_CLASS_AGENT_VIRTUAL
        if bool(payload.get("ephemeral_task")):
            resolved_identity_class = IDENTITY_CLASS_EPHEMERAL_TASK
        if bool(payload.get("business_workspace_session")):
            resolved_identity_class = IDENTITY_CLASS_BUSINESS_WORKSPACE

        if login_state:
            resolved_login_state = login_state
        elif credential_grant_id:
            resolved_login_state = LOGIN_STATE_CREDENTIAL_BROKER
        elif bool(payload.get("user_authenticated_virtual_login")):
            resolved_login_state = LOGIN_STATE_USER_INTERACTIVE
        else:
            resolved_login_state = LOGIN_STATE_UNAUTHENTICATED
        cookie_reuse_allowed = bool(payload.get("allow_cookie_reuse", False))
        if cookie_reuse_allowed:
            raise RuntimeError(
                "VC-5 identity split blocked cookie reuse override for virtual computer runtime."
            )

    if resolved_login_state == LOGIN_STATE_CREDENTIAL_BROKER and not credential_grant_id:
        raise RuntimeError("Credential broker login state requires credential_grant_id.")

    return VirtualComputerIdentityContext(
        identity_class=resolved_identity_class,
        login_state=resolved_login_state,
        cookie_reuse_allowed=cookie_reuse_allowed,
        credential_grant_id=credential_grant_id,
        credential_scope_domain=credential_scope_domain,
        principal_id=principal_id,
    )


def _identity_payload(identity: VirtualComputerIdentityContext) -> Dict[str, Any]:
    return {
        "identity_class": identity.identity_class,
        "login_state": identity.login_state,
        "cookie_reuse_allowed": bool(identity.cookie_reuse_allowed),
        "credential_grant_id": identity.credential_grant_id,
        "credential_scope_domain": identity.credential_scope_domain,
        "principal_id": identity.principal_id,
    }


def _assert_domain_bound_credential_injection(
    *,
    identity: Optional[VirtualComputerIdentityContext],
    action: str,
    action_args: Dict[str, Any],
    current_url: Any,
    enforce: bool,
) -> None:
    if not enforce or identity is None:
        return
    if identity.login_state != LOGIN_STATE_CREDENTIAL_BROKER or not identity.credential_grant_id:
        return
    scope_domain = _token(identity.credential_scope_domain).lower()
    if not scope_domain:
        raise RuntimeError("Credential broker grant requires a bound credential scope domain.")
    action_token = _token(action).lower()
    if action_token not in {ACTION_OPEN_URL, ACTION_DOWNLOAD_ARTIFACT, ACTION_TYPE, ACTION_CLICK, ACTION_HOTKEY}:
        return
    target_host = _extract_host_from_url(action_args.get("url") or current_url)
    if not target_host:
        raise RuntimeError("Credential-bound action requires a target URL host.")
    if not _domain_matches_scope(target_host, scope_domain):
        raise RuntimeError("Credential injection blocked: target domain is outside scoped credential domain.")


def build_cost_quota_profile(payload: Dict[str, Any], *, provider_id: Any = None) -> VirtualComputerCostQuotaProfile:
    source = payload.get("cost_quota") if isinstance(payload.get("cost_quota"), dict) else {}
    runtime_quota = payload.get("runtime_quota") if isinstance(payload.get("runtime_quota"), dict) else {}
    computer_automation = payload.get("computer_automation") if isinstance(payload.get("computer_automation"), dict) else {}
    provider_token = _token(provider_id or payload.get("runtime_provider_id") or payload.get("virtual_provider_id"))
    default_cost_unit = "session_minute" if provider_token == PROVIDER_ID_BROWSERBASE else "runtime_unit"
    workspace_limit = float(source.get("workspace_monthly_budget_limit") or source.get("workspace_budget_limit") or 1000.0)
    threshold_ratio = _coerce_positive_float(source.get("budget_threshold_ratio"), 0.90, 0.10)
    threshold_ratio = min(threshold_ratio, 1.0)
    threshold_action = _token(source.get("budget_threshold_action")).lower() or "pause"
    if threshold_action not in {"pause", "kill"}:
        threshold_action = "pause"
    provider_concurrency_limit = _coerce_positive_int(
        source.get("provider_concurrency_limit") or runtime_quota.get("provider_concurrency_limit"),
        4,
        1,
    )
    workspace_concurrency_limit = _coerce_positive_int(
        source.get("workspace_concurrency_limit")
        or runtime_quota.get("workspace_concurrency_limit")
        or runtime_quota.get("max_concurrent_sessions"),
        provider_concurrency_limit,
        1,
    )
    agent_concurrency_limit = _coerce_positive_int(
        source.get("agent_concurrency_limit")
        or runtime_quota.get("agent_concurrency_limit")
        or computer_automation.get("max_concurrent_sessions")
        or payload.get("max_concurrent_sessions"),
        provider_concurrency_limit,
        1,
    )
    return VirtualComputerCostQuotaProfile(
        cost_unit=_token(source.get("cost_unit")) or default_cost_unit,
        per_session_cost_limit=float(source.get("per_session_cost_limit") or 120.0),
        workspace_budget_limit=workspace_limit,
        workspace_monthly_budget_limit=workspace_limit,
        agent_monthly_budget_limit=float(source.get("agent_monthly_budget_limit") or 300.0),
        per_session_runtime_seconds=_coerce_positive_int(source.get("per_session_runtime_seconds"), 60 * 60, 60),
        agent_runtime_budget_seconds=_coerce_positive_int(source.get("agent_runtime_budget_seconds"), 8 * 60 * 60, 1),
        provider_concurrency_limit=provider_concurrency_limit,
        workspace_concurrency_limit=workspace_concurrency_limit,
        agent_concurrency_limit=agent_concurrency_limit,
        idle_timeout_seconds=_coerce_positive_int(source.get("idle_timeout_seconds"), 10 * 60, 1),
        estimated_create_cost=float(source.get("estimated_create_cost") or 1.0),
        estimated_action_cost=float(source.get("estimated_action_cost") or 1.0),
        long_task_cost_estimate_threshold=float(source.get("long_task_cost_estimate_threshold") or 10.0),
        budget_threshold_ratio=threshold_ratio,
        budget_threshold_action=threshold_action,
    )


def _cost_quota_payload(profile: VirtualComputerCostQuotaProfile) -> Dict[str, Any]:
    return {
        "cost_unit": profile.cost_unit,
        "per_session_cost_limit": float(profile.per_session_cost_limit),
        "workspace_budget_limit": float(profile.workspace_budget_limit),
        "workspace_monthly_budget_limit": float(profile.workspace_monthly_budget_limit),
        "agent_monthly_budget_limit": float(profile.agent_monthly_budget_limit),
        "per_session_runtime_seconds": int(profile.per_session_runtime_seconds),
        "agent_runtime_budget_seconds": int(profile.agent_runtime_budget_seconds),
        "provider_concurrency_limit": int(profile.provider_concurrency_limit),
        "workspace_concurrency_limit": int(profile.workspace_concurrency_limit),
        "agent_concurrency_limit": int(profile.agent_concurrency_limit),
        "idle_timeout_seconds": int(profile.idle_timeout_seconds),
        "estimated_create_cost": float(profile.estimated_create_cost),
        "estimated_action_cost": float(profile.estimated_action_cost),
        "long_task_cost_estimate_threshold": float(profile.long_task_cost_estimate_threshold),
        "budget_threshold_ratio": float(profile.budget_threshold_ratio),
        "budget_threshold_action": profile.budget_threshold_action,
    }


def _cost_usage_payload(state: VirtualComputerCostQuotaState) -> Dict[str, Any]:
    return {
        "provider_id": state.provider_id,
        "workspace_id": state.workspace_id,
        "agent_id": state.agent_id,
        "started_at_epoch": float(state.started_at_epoch),
        "estimated_cost": float(state.estimated_cost),
        "last_activity_epoch": float(state.last_activity_epoch),
        "paused_by_budget": bool(state.paused_by_budget),
        "quota_terminated": bool(state.quota_terminated),
        "termination_reason": state.termination_reason,
    }


def _assert_revoked_session_not_used(session: Dict[str, Any], payload: Dict[str, Any]) -> None:
    session_id = _token(session.get("session_id"))
    revoked_ids_raw = payload.get("revoked_session_ids")
    revoked_ids: List[str] = []
    if isinstance(revoked_ids_raw, list):
        revoked_ids = [_token(item) for item in revoked_ids_raw if _token(item)]
    if bool(session.get("session_revoked")) or bool(payload.get("session_revoked")) or session_id in revoked_ids:
        session["session_revoked"] = True
        raise RuntimeError("Session was revoked and can no longer be resumed or executed.")


def _assert_session_token_fresh(session: Dict[str, Any], payload: Dict[str, Any]) -> None:
    if not bool(session.get("require_session_token")):
        return
    expected_token = _token(session.get("session_token"))
    provided_token = _token(
        payload.get("session_token")
        or payload.get("runtime_token")
        or payload.get("session_auth_token")
    )
    if not expected_token or not provided_token or provided_token != expected_token:
        raise RuntimeError("Session token mismatch: stale or invalid token cannot execute action.")
    expires_at = session.get("session_token_expires_at_epoch")
    if expires_at is None:
        return
    try:
        expires_at_epoch = float(expires_at)
    except Exception:
        return
    if time.time() >= expires_at_epoch:
        raise RuntimeError("Session token expired: stale token cannot execute action.")


def _assert_cross_tenant_session_access(
    *,
    session: Dict[str, Any],
    payload: Dict[str, Any],
    cost_state: Optional[VirtualComputerCostQuotaState],
) -> None:
    expected_workspace_id = _token((cost_state.workspace_id if cost_state is not None else None) or session.get("workspace_id"))
    actor_workspace_id = _token(payload.get("actor_workspace_id") or payload.get("workspace_id"))
    if expected_workspace_id and actor_workspace_id and actor_workspace_id != expected_workspace_id:
        raise RuntimeError("Cross-workspace session access denied.")
    expected_tenant_id = _token(session.get("tenant_id") or expected_workspace_id)
    actor_tenant_id = _token(payload.get("actor_tenant_id") or payload.get("tenant_id"))
    if expected_tenant_id and actor_tenant_id and actor_tenant_id != expected_tenant_id:
        raise RuntimeError("Cross-tenant session access denied.")


def build_session_persistence_profile(
    payload: Dict[str, Any],
    *,
    runtime_choice: Any,
    isolation_profile: VirtualComputerIsolationProfile,
) -> VirtualComputerSessionPersistenceProfile:
    source = payload.get("session_persistence") if isinstance(payload.get("session_persistence"), dict) else {}
    mode = _token(source.get("session_mode") or source.get("mode")).lower()
    if mode not in {SESSION_PERSISTENCE_EPHEMERAL, SESSION_PERSISTENCE_RESUMABLE}:
        if bool(payload.get("ephemeral_task")) and _token(runtime_choice).lower() != RUNTIME_CHOICE_LOCAL:
            mode = SESSION_PERSISTENCE_EPHEMERAL
        else:
            mode = SESSION_PERSISTENCE_RESUMABLE
    screenshot_ttl = _coerce_positive_int(source.get("screenshot_ttl_seconds"), 5 * 60, 30)
    artifact_ttl = _coerce_positive_int(source.get("artifact_ttl_seconds"), 60 * 60, 60)
    session_disk_ttl = _coerce_positive_int(
        source.get("session_disk_ttl_seconds"),
        max(int(isolation_profile.runtime_ttl_seconds), 10 * 60),
        60,
    )
    audit_ttl = _coerce_positive_int(source.get("audit_ttl_seconds"), 30 * 24 * 60 * 60, 60)
    snapshot_enabled = bool(source.get("snapshot_enabled", True))
    manual_terminate_enabled = bool(source.get("manual_terminate_enabled", True))
    auto_terminate = source.get("auto_terminate_on_task_complete")
    if auto_terminate is None:
        auto_terminate = mode == SESSION_PERSISTENCE_EPHEMERAL
    return VirtualComputerSessionPersistenceProfile(
        session_mode=mode,
        screenshot_ttl_seconds=screenshot_ttl,
        artifact_ttl_seconds=artifact_ttl,
        session_disk_ttl_seconds=session_disk_ttl,
        audit_ttl_seconds=audit_ttl,
        snapshot_enabled=snapshot_enabled,
        manual_terminate_enabled=manual_terminate_enabled,
        auto_terminate_on_task_complete=bool(auto_terminate),
    )


def _session_persistence_payload(profile: VirtualComputerSessionPersistenceProfile) -> Dict[str, Any]:
    return {
        "session_mode": profile.session_mode,
        "screenshot_ttl_seconds": int(profile.screenshot_ttl_seconds),
        "artifact_ttl_seconds": int(profile.artifact_ttl_seconds),
        "session_disk_ttl_seconds": int(profile.session_disk_ttl_seconds),
        "audit_ttl_seconds": int(profile.audit_ttl_seconds),
        "snapshot_enabled": bool(profile.snapshot_enabled),
        "manual_terminate_enabled": bool(profile.manual_terminate_enabled),
        "auto_terminate_on_task_complete": bool(profile.auto_terminate_on_task_complete),
    }


def _assert_persistence_active(state: VirtualComputerSessionPersistenceState) -> None:
    if time.time() >= float(state.disk_expires_at_epoch):
        raise RuntimeError("Session expired by disk TTL.")


def _register_persistence_activity(state: VirtualComputerSessionPersistenceState) -> None:
    now_epoch = time.time()
    state.last_activity_epoch = now_epoch
    state.disk_expires_at_epoch = now_epoch + float(state.profile.session_disk_ttl_seconds)


def _purge_expired_artifacts(session: Dict[str, Any]) -> None:
    now_epoch = time.time()
    artifacts = session.get("artifacts") if isinstance(session.get("artifacts"), list) else []
    retained = []
    for artifact in artifacts:
        if not isinstance(artifact, dict):
            continue
        expires_at = artifact.get("expires_at_epoch")
        if expires_at is not None:
            try:
                if now_epoch >= float(expires_at):
                    continue
            except Exception:
                continue
        retained.append(artifact)
    session["artifacts"] = retained


def _approval_why_card(action: str, action_policy: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    requires_approval = bool(action_policy.get("requires_approval"))
    risk_class = str(action_policy.get("risk_class") or RISK_CLASS_GREEN)
    if not requires_approval and risk_class not in {RISK_CLASS_ORANGE, RISK_CLASS_RED}:
        return None
    labels = list(action_policy.get("dangerous_action_labels") or [])
    if risk_class == RISK_CLASS_RED:
        reason = "This action can make high-stakes commitments or expose credentials."
    elif risk_class == RISK_CLASS_ORANGE:
        reason = "This action can submit, send, upload, or log in on your behalf."
    elif requires_approval:
        reason = "This action is configured to require explicit approval."
    else:
        reason = "This action has elevated risk signals."
    return {
        "action": action,
        "risk_class": risk_class,
        "requires_approval": requires_approval,
        "dangerous_action_labels": labels,
        "why_approval_is_needed": reason,
    }


def _append_timeline_event(
    timeline: List[Dict[str, Any]],
    *,
    event_type: str,
    action: str,
    status: str,
    risk_class: Optional[str] = None,
    details: Optional[Dict[str, Any]] = None,
) -> None:
    event = {
        "event_type": event_type,
        "action": action,
        "status": status,
        "created_at_epoch": time.time(),
    }
    if risk_class:
        event["risk_class"] = risk_class
    if isinstance(details, dict) and details:
        event["details"] = dict(details)
    timeline.append(event)


def _streaming_ui_payload(
    *,
    state: str,
    current_url: Any,
    app_title: Any,
    live_screenshot: Any,
    action_timeline: List[Dict[str, Any]],
    artifacts: List[Dict[str, Any]],
    can_pause: bool,
    can_resume: bool,
    can_terminate: bool,
    can_take_over: bool,
    risk_prompt: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    payload = {
        "state": _token(state) or RUNTIME_STATE_READY,
        "live_screenshot": live_screenshot if isinstance(live_screenshot, dict) else None,
        "action_timeline": [dict(item) for item in action_timeline if isinstance(item, dict)],
        "current_context": {
            "url": _token(current_url) or None,
            "app_title": _token(app_title) or None,
        },
        "controls": {
            "pause": bool(can_pause),
            "resume": bool(can_resume),
            "stop": bool(can_terminate),
            "take_over": bool(can_take_over),
        },
        "artifact_drawer": [dict(item) for item in artifacts if isinstance(item, dict)],
    }
    if isinstance(risk_prompt, dict) and risk_prompt:
        payload["risk_prompt"] = dict(risk_prompt)
    return payload


def _sha256_text(value: Any) -> str:
    return hashlib.sha256(str(value or "").encode("utf-8")).hexdigest()


def _stable_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True)


def _artifact_digest(artifact: Dict[str, Any]) -> str:
    return _sha256_text(_stable_json(secret_redaction_service.sanitize_mapping(artifact)))


def _normalize_artifact_type(value: Any) -> str:
    token = _token(value).lower().replace("-", "_").replace(" ", "_")
    aliases = {
        "download": ARTIFACT_TYPE_DOWNLOADED_FILE,
        "download_file": ARTIFACT_TYPE_DOWNLOADED_FILE,
        "downloaded": ARTIFACT_TYPE_DOWNLOADED_FILE,
        "generated_doc": ARTIFACT_TYPE_GENERATED_DOCUMENT,
        "generated_document": ARTIFACT_TYPE_GENERATED_DOCUMENT,
        "document": ARTIFACT_TYPE_GENERATED_DOCUMENT,
        "trace": ARTIFACT_TYPE_BROWSER_TRACE,
        "browsertrace": ARTIFACT_TYPE_BROWSER_TRACE,
        "terminal": ARTIFACT_TYPE_TERMINAL_LOG,
        "log": ARTIFACT_TYPE_TERMINAL_LOG,
    }
    return aliases.get(token, token)


def _artifact_policy_from_payload(payload: Dict[str, Any]) -> Dict[str, Any]:
    source = payload.get("artifact_policy") if isinstance(payload.get("artifact_policy"), dict) else {}
    allowed_raw = source.get("allowed_types")
    allowed_types: List[str] = []
    if isinstance(allowed_raw, list):
        for item in allowed_raw:
            normalized = _normalize_artifact_type(item)
            if normalized in VALID_ARTIFACT_TYPES and normalized not in allowed_types:
                allowed_types.append(normalized)
    if not allowed_types:
        allowed_types = sorted(VALID_ARTIFACT_TYPES)
    return {
        "allowed_types": allowed_types,
        "max_artifact_size_bytes": _coerce_positive_int(source.get("max_artifact_size_bytes"), 25 * 1024 * 1024, 1024),
        "max_total_artifact_bytes": _coerce_positive_int(source.get("max_total_artifact_bytes"), 250 * 1024 * 1024, 1024),
        "malware_scan_required": bool(source.get("malware_scan_required", True)),
        "allow_export_to_local": bool(source.get("allow_export_to_local", False)),
        "allow_export_to_workspace": bool(source.get("allow_export_to_workspace", True)),
        "require_export_approval": bool(source.get("require_export_approval", True)),
    }


def _artifact_size_bytes(artifact: Dict[str, Any]) -> int:
    try:
        value = int(artifact.get("size_bytes") or 0)
    except Exception:
        value = 0
    return max(value, 0)


def _evaluate_malware_scan(
    artifact: Dict[str, Any],
    *,
    malware_scan_required: bool,
    malware_scan_hook: Optional[Callable[[Dict[str, Any]], Any]],
) -> Dict[str, Any]:
    if not malware_scan_required:
        return {"status": "skipped", "engine": "disabled"}
    scan_result: Dict[str, Any] = {"status": "clean", "engine": "builtin_stub"}
    if callable(malware_scan_hook):
        hook_output = malware_scan_hook(dict(artifact))
        if isinstance(hook_output, dict):
            scan_result = {**scan_result, **hook_output}
        elif isinstance(hook_output, bool):
            scan_result["status"] = "clean" if hook_output else "infected"
    status = _token(scan_result.get("status")).lower()
    if status in {"infected", "malicious", "blocked", "quarantined"}:
        raise RuntimeError("Artifact blocked by malware scan.")
    return scan_result


def _enforce_artifact_policy(
    artifact: Dict[str, Any],
    *,
    artifact_policy: Dict[str, Any],
    current_total_artifact_bytes: int,
    malware_scan_hook: Optional[Callable[[Dict[str, Any]], Any]],
) -> Dict[str, Any]:
    enriched = dict(artifact or {})
    artifact_type = _normalize_artifact_type(enriched.get("type"))
    if artifact_type not in VALID_ARTIFACT_TYPES:
        raise RuntimeError("Artifact type is not allowed.")
    if artifact_type not in set(artifact_policy.get("allowed_types") or []):
        raise RuntimeError("Artifact type blocked by policy.")
    enriched["type"] = artifact_type
    size_bytes = _artifact_size_bytes(enriched)
    if size_bytes > int(artifact_policy.get("max_artifact_size_bytes") or 0):
        raise RuntimeError("Artifact size exceeded per-file limit.")
    if int(current_total_artifact_bytes) + size_bytes > int(artifact_policy.get("max_total_artifact_bytes") or 0):
        raise RuntimeError("Artifact size exceeded session artifact quota.")
    scan_result = _evaluate_malware_scan(
        enriched,
        malware_scan_required=bool(artifact_policy.get("malware_scan_required")),
        malware_scan_hook=malware_scan_hook,
    )
    enriched["malware_scan"] = scan_result
    return enriched


def _artifact_export_decision(artifact_policy: Dict[str, Any], payload: Dict[str, Any]) -> Dict[str, Any]:
    destination = _token(payload.get("export_destination")).lower()
    if destination not in {ARTIFACT_EXPORT_LOCAL, ARTIFACT_EXPORT_WORKSPACE}:
        return {"requested": False, "exported": False}
    approved = bool(payload.get("export_approved") or payload.get("approved") or _token(payload.get("approval_id")))
    if bool(artifact_policy.get("require_export_approval", True)) and not approved:
        raise RuntimeError("Artifact export requires explicit approval.")
    if destination == ARTIFACT_EXPORT_LOCAL and not bool(artifact_policy.get("allow_export_to_local")):
        raise RuntimeError("Artifact export to local computer is blocked by policy.")
    if destination == ARTIFACT_EXPORT_WORKSPACE and not bool(artifact_policy.get("allow_export_to_workspace")):
        raise RuntimeError("Artifact export to workspace is blocked by policy.")
    return {
        "requested": True,
        "exported": True,
        "destination": destination,
        "approved": approved,
    }


def _append_audit_event(
    audit_events: List[Dict[str, Any]],
    *,
    event_type: str,
    action: Any = None,
    decision: Any = None,
    metadata: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    safe_metadata = secret_redaction_service.sanitize_mapping(metadata or {})
    previous_hash = _token(audit_events[-1].get("event_hash")) if audit_events else "genesis"
    event_core: Dict[str, Any] = {
        "event_type": _token(event_type),
        "created_at_epoch": time.time(),
        "metadata": safe_metadata,
    }
    action_token = _token(action)
    decision_token = _token(decision)
    if action_token:
        event_core["action"] = action_token
    if decision_token:
        event_core["decision"] = decision_token
    event_hash = _sha256_text(_stable_json({"previous_hash": previous_hash, "event": event_core}))
    entry = {
        "index": len(audit_events) + 1,
        "previous_hash": previous_hash,
        "event_hash": event_hash,
        **event_core,
    }
    audit_events.append(entry)
    return entry


def _validate_audit_chain(audit_events: List[Dict[str, Any]]) -> bool:
    previous_hash = "genesis"
    for index, entry in enumerate(audit_events, start=1):
        if int(entry.get("index") or 0) != index:
            return False
        if _token(entry.get("previous_hash")) != previous_hash:
            return False
        event_core = {
            "event_type": _token(entry.get("event_type")),
            "created_at_epoch": entry.get("created_at_epoch"),
            "metadata": secret_redaction_service.sanitize_mapping(entry.get("metadata") or {}),
        }
        action_token = _token(entry.get("action"))
        decision_token = _token(entry.get("decision"))
        if action_token:
            event_core["action"] = action_token
        if decision_token:
            event_core["decision"] = decision_token
        expected_hash = _sha256_text(_stable_json({"previous_hash": previous_hash, "event": event_core}))
        if _token(entry.get("event_hash")) != expected_hash:
            return False
        previous_hash = expected_hash
    return True


def _build_audit_report(session_id: Any, audit_events: List[Dict[str, Any]]) -> Dict[str, Any]:
    chain_valid = _validate_audit_chain(audit_events)
    head_hash = _token(audit_events[-1].get("event_hash")) if audit_events else ""
    return {
        "session_id": _token(session_id),
        "event_count": len(audit_events),
        "head_hash": head_hash or None,
        "chain_valid": bool(chain_valid),
        "events": [dict(item) for item in audit_events if isinstance(item, dict)],
    }


def _assert_cost_quota_active(state: VirtualComputerCostQuotaState) -> None:
    now_epoch = time.time()
    if state.quota_terminated:
        detail = _token(state.termination_reason) or "quota_terminated"
        raise RuntimeError(f"Session terminated by cost/quota guardrail: {detail}.")
    if state.paused_by_budget:
        raise RuntimeError("Session paused by budget threshold; explicit budget override approval is required to resume.")
    if now_epoch - float(state.started_at_epoch) >= float(state.profile.per_session_runtime_seconds):
        state.quota_terminated = True
        state.termination_reason = "per_session_runtime_limit"
        raise RuntimeError("Session terminated by per-session runtime limit.")
    if now_epoch - float(state.last_activity_epoch) >= float(state.profile.idle_timeout_seconds):
        state.quota_terminated = True
        state.termination_reason = "idle_timeout"
        raise RuntimeError("Session terminated by idle timeout.")
    if float(state.estimated_cost) >= float(state.profile.per_session_cost_limit):
        state.quota_terminated = True
        state.termination_reason = "per_session_cost_limit"
        raise RuntimeError("Session terminated by per-session cost limit.")


def _charge_cost_quota(state: VirtualComputerCostQuotaState, amount: float) -> None:
    state.estimated_cost = float(state.estimated_cost) + max(float(amount or 0.0), 0.0)
    state.last_activity_epoch = time.time()
    threshold = float(state.profile.per_session_cost_limit) * float(state.profile.budget_threshold_ratio)
    if threshold > 0 and float(state.estimated_cost) >= threshold and not state.quota_terminated:
        action = _token(state.profile.budget_threshold_action).lower() or "pause"
        if action == "kill":
            state.quota_terminated = True
            state.termination_reason = "budget_threshold_kill"
            raise RuntimeError("Session terminated by budget threshold guardrail.")
        state.paused_by_budget = True
        state.termination_reason = "budget_threshold_pause"
        raise RuntimeError("Session paused by budget threshold guardrail.")
    if float(state.estimated_cost) > float(state.profile.per_session_cost_limit):
        state.quota_terminated = True
        state.termination_reason = "per_session_cost_limit"
        raise RuntimeError("Session terminated by per-session cost limit.")


def _estimate_action_cost(action: str, action_args: Dict[str, Any], profile: VirtualComputerCostQuotaProfile) -> float:
    base = max(float(profile.estimated_action_cost), 0.0)
    action_token = _token(action).lower()
    estimate = base
    if action_token == ACTION_WAIT:
        duration_ms = int(action_args.get("duration_ms") or 0)
        estimate += (float(duration_ms) / 60000.0) * max(base, 1.0)
    elif action_token == ACTION_RUN_COMMAND:
        command_len = len(str(action_args.get("command") or ""))
        estimate += (float(command_len) / 200.0) * max(base, 1.0)
    elif action_token == ACTION_DOWNLOAD_ARTIFACT and bool(action_args.get("auto_download", True)):
        estimate += max(base, 1.0)
    return max(estimate, base)


def _runtime_kill_state(payload: Dict[str, Any], session_state: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    state_sources = []
    for source in (session_state, payload):
        if isinstance(source, dict):
            state_sources.append(source)
            metadata = source.get("metadata")
            if isinstance(metadata, dict):
                state_sources.append(metadata)
            kill_state = source.get("runtime_kill_state")
            if isinstance(kill_state, dict):
                state_sources.append(kill_state)
            kill_switch = source.get("kill_switch")
            if isinstance(kill_switch, dict):
                state_sources.append(kill_switch)
    for source in state_sources:
        if bool(source.get("workspace_emergency_stop_active") or source.get("emergency_stop_active")):
            return {"blocked": True, "reason": "workspace_emergency_stop"}
        if bool(source.get("kill_switch_active") or source.get("active")):
            return {"blocked": True, "reason": "kill_switch_active"}
        deployment_state = _token(
            source.get("deployment_state") or source.get("agent_state") or source.get("runtime_state")
        ).lower()
        if deployment_state in {"paused", "suspended", "archived", "killed"}:
            return {"blocked": True, "reason": f"agent_{deployment_state}"}
    return {"blocked": False, "reason": ""}


def _assert_runtime_budget_cap(
    *,
    cost_state: Optional[VirtualComputerCostQuotaState],
    cost_profile: VirtualComputerCostQuotaProfile,
    workspace_estimated_cost: float,
    agent_estimated_cost: float,
    agent_runtime_seconds: float,
    estimated_increment: float,
) -> None:
    if cost_state is not None:
        _assert_cost_quota_active(cost_state)
        if float(cost_state.estimated_cost) + float(estimated_increment or 0.0) > float(cost_profile.per_session_cost_limit):
            cost_state.quota_terminated = True
            cost_state.termination_reason = "per_session_cost_limit"
            raise RuntimeError("Runtime admission gate rejected session/action: per-session budget cap exceeded.")
    if float(workspace_estimated_cost) + float(estimated_increment or 0.0) > float(cost_profile.workspace_monthly_budget_limit):
        if cost_state is not None:
            cost_state.quota_terminated = True
            cost_state.termination_reason = "workspace_monthly_budget_limit"
        raise RuntimeError("Runtime admission gate rejected session/action: workspace budget cap exceeded.")
    if float(agent_estimated_cost) + float(estimated_increment or 0.0) > float(cost_profile.agent_monthly_budget_limit):
        if cost_state is not None:
            cost_state.quota_terminated = True
            cost_state.termination_reason = "agent_monthly_budget_limit"
        raise RuntimeError("Runtime admission gate rejected session/action: agent budget cap exceeded.")
    if float(agent_runtime_seconds) >= float(cost_profile.agent_runtime_budget_seconds):
        if cost_state is not None:
            cost_state.quota_terminated = True
            cost_state.termination_reason = "agent_runtime_budget_limit"
        raise RuntimeError("Runtime admission gate rejected session/action: agent runtime budget cap exceeded.")


def _assert_runtime_concurrency_quota(
    *,
    active_provider_sessions: int,
    active_workspace_sessions: int,
    active_agent_sessions: int,
    cost_profile: VirtualComputerCostQuotaProfile,
    creating_session: bool,
) -> None:
    def exceeded(active: int, limit: int) -> bool:
        return int(active) >= int(limit) if creating_session else int(active) > int(limit)

    if exceeded(active_provider_sessions, cost_profile.provider_concurrency_limit):
        raise RuntimeError("Runtime admission gate rejected session/action: provider concurrency quota exceeded.")
    if exceeded(active_workspace_sessions, cost_profile.workspace_concurrency_limit):
        raise RuntimeError("Runtime admission gate rejected session/action: workspace concurrency quota exceeded.")
    if exceeded(active_agent_sessions, cost_profile.agent_concurrency_limit):
        raise RuntimeError("Runtime admission gate rejected session/action: agent concurrency quota exceeded.")


def _assert_session_recording_started(
    *,
    payload: Dict[str, Any],
    enterprise_controls: Dict[str, Any],
    session_state: Optional[Dict[str, Any]],
    creating_session: bool,
) -> Dict[str, Any]:
    recording_config = payload.get("session_recording") if isinstance(payload.get("session_recording"), dict) else {}
    if bool(
        payload.get("session_recording_start_failed")
        or recording_config.get("start_failed")
        or enterprise_controls.get("session_recording_start_failed")
    ):
        raise RuntimeError("Runtime admission gate rejected session/action: session recording could not start.")
    if (
        payload.get("session_recording_enabled") is False
        or recording_config.get("enabled") is False
        or enterprise_controls.get("session_recording_enabled") is False
    ):
        raise RuntimeError("Runtime admission gate rejected session/action: session recording is required.")
    retention_seconds = int(enterprise_controls.get("session_recording_retention_seconds") or 0)
    if retention_seconds <= 0:
        raise RuntimeError("Runtime admission gate rejected session/action: session recording retention is required.")
    if not creating_session:
        recording_state = session_state.get("session_recording") if isinstance(session_state, dict) else {}
        if not isinstance(recording_state, dict) or not bool(recording_state.get("started")):
            raise RuntimeError("Runtime admission gate rejected session/action: session recording is not active.")
    return {
        "started": True,
        "started_at_epoch": time.time(),
        "retention_seconds": retention_seconds,
        "provider": _token(recording_config.get("provider") or enterprise_controls.get("session_recording_provider")) or "runtime_audit_chain",
    }


def runtime_admission_gate(
    *,
    phase: str,
    payload: Dict[str, Any],
    action: Optional[str],
    action_args: Optional[Dict[str, Any]],
    runtime_kind: str,
    cost_profile: VirtualComputerCostQuotaProfile,
    cost_state: Optional[VirtualComputerCostQuotaState],
    workspace_estimated_cost: float,
    agent_estimated_cost: float,
    agent_runtime_seconds: float,
    active_provider_sessions: int,
    active_workspace_sessions: int,
    active_agent_sessions: int,
    network_policy: Dict[str, Any],
    enterprise_controls: Dict[str, Any],
    current_url: Any = None,
    session_state: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    phase_token = _token(phase).lower()
    action_token = _token(action).lower()
    safe_action_args = dict(action_args or {})
    creating_session = phase_token == "session_init"
    estimated_increment = float(cost_profile.estimated_create_cost if creating_session else 0.0)
    if not creating_session and action_token:
        estimated_increment = _estimate_action_cost(action_token, safe_action_args, cost_profile)

    _assert_runtime_budget_cap(
        cost_state=cost_state,
        cost_profile=cost_profile,
        workspace_estimated_cost=workspace_estimated_cost,
        agent_estimated_cost=agent_estimated_cost,
        agent_runtime_seconds=agent_runtime_seconds,
        estimated_increment=estimated_increment,
    )

    if action_token:
        _assert_network_browser_security(
            action=action_token,
            action_args=safe_action_args,
            policy=network_policy,
            approval_granted=bool(payload.get("approved") or payload.get("approval_granted") or _token(payload.get("approval_id"))),
            current_url=current_url,
        )
        _assert_enterprise_network_controls(
            action=action_token,
            action_args=safe_action_args,
            controls=enterprise_controls,
            current_url=current_url,
        )

    kill_state = _runtime_kill_state(payload, session_state=session_state)
    if bool(kill_state.get("blocked")):
        raise RuntimeError(f"Runtime admission gate rejected session/action: {kill_state.get('reason')}.")

    _assert_runtime_concurrency_quota(
        active_provider_sessions=active_provider_sessions,
        active_workspace_sessions=active_workspace_sessions,
        active_agent_sessions=active_agent_sessions,
        cost_profile=cost_profile,
        creating_session=creating_session,
    )

    recording_state = _assert_session_recording_started(
        payload=payload,
        enterprise_controls=enterprise_controls,
        session_state=session_state,
        creating_session=creating_session,
    )

    action_policy: Optional[Dict[str, Any]] = None
    if action_token:
        action_policy = _evaluate_action_policy_and_approval(
            action=action_token,
            action_args=safe_action_args,
            runtime_kind=runtime_kind,
            payload=payload,
        )

    return {
        "allowed": True,
        "phase": phase_token,
        "estimated_increment": estimated_increment,
        "recording_state": recording_state,
        "action_policy": action_policy,
    }


def contract_descriptor(runtime_choice: Any) -> Dict[str, Any]:
    choice = _token(runtime_choice).lower() or RUNTIME_CHOICE_LOCAL
    runtime_kind = "local_gateway_runtime" if choice == RUNTIME_CHOICE_LOCAL else "virtual_computer_runtime"
    return {
        "runtime_contract_interface": RUNTIME_INTERFACE_ID,
        "runtime_contract_kind": runtime_kind,
        "runtime_choice_selected": choice,
        "runtime_contract_methods": list(RUNTIME_METHODS),
        "runtime_contract_states": list(RUNTIME_STATES),
    }


@dataclass(frozen=True)
class VirtualComputerProviderSpec:
    provider_id: str
    label: str
    provider_kind: str
    runtime_choices: List[str]
    capabilities: Dict[str, Any]
    notes: str = ""


@dataclass
class VirtualComputerIsolationProfile:
    filesystem_quota_bytes: int
    cpu_quota_seconds: int
    memory_quota_mb: int
    runtime_ttl_seconds: int
    allow_private_lan: bool
    allowed_hosts: List[str]
    block_metadata_endpoints: bool
    clipboard_enabled: bool
    file_transfer_enabled: bool
    kill_switch_enabled: bool


@dataclass
class VirtualComputerIsolationState:
    profile: VirtualComputerIsolationProfile
    created_at_epoch: float
    expires_at_epoch: float
    terminated: bool = False
    termination_reason: str = ""


@dataclass
class VirtualComputerIdentityContext:
    identity_class: str
    login_state: str
    cookie_reuse_allowed: bool
    credential_grant_id: Optional[str] = None
    credential_scope_domain: Optional[str] = None
    principal_id: Optional[str] = None


@dataclass
class VirtualComputerCostQuotaProfile:
    cost_unit: str
    per_session_cost_limit: float
    workspace_budget_limit: float
    workspace_monthly_budget_limit: float
    agent_monthly_budget_limit: float
    per_session_runtime_seconds: int
    agent_runtime_budget_seconds: int
    provider_concurrency_limit: int
    workspace_concurrency_limit: int
    agent_concurrency_limit: int
    idle_timeout_seconds: int
    estimated_create_cost: float
    estimated_action_cost: float
    long_task_cost_estimate_threshold: float
    budget_threshold_ratio: float
    budget_threshold_action: str


@dataclass
class VirtualComputerCostQuotaState:
    profile: VirtualComputerCostQuotaProfile
    provider_id: str
    workspace_id: str
    agent_id: str
    started_at_epoch: float
    estimated_cost: float
    last_activity_epoch: float
    paused_by_budget: bool = False
    quota_terminated: bool = False
    termination_reason: str = ""


@dataclass
class VirtualComputerSessionPersistenceProfile:
    session_mode: str
    screenshot_ttl_seconds: int
    artifact_ttl_seconds: int
    session_disk_ttl_seconds: int
    audit_ttl_seconds: int
    snapshot_enabled: bool
    manual_terminate_enabled: bool
    auto_terminate_on_task_complete: bool


@dataclass
class VirtualComputerSessionPersistenceState:
    profile: VirtualComputerSessionPersistenceProfile
    created_at_epoch: float
    last_activity_epoch: float
    disk_expires_at_epoch: float


class VirtualComputerRuntime(Protocol):
    async def create_session(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        ...

    async def resume_session(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        ...

    async def pause_session(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        ...

    async def terminate_session(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        ...

    async def execute_action(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        ...

    async def stream_screenshot(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        ...

    async def collect_artifact(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        ...

    async def snapshot_session(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        ...


class VirtualComputerProviderAdapter(Protocol):
    def spec(self) -> VirtualComputerProviderSpec:
        ...

    def build_runtime(
        self,
        *,
        fallback_runtime: Optional["VirtualComputerRuntime"] = None,
    ) -> "VirtualComputerRuntime":
        ...


class LocalGatewayVirtualComputerRuntime:
    def __init__(
        self,
        runtime: GatewayBrowserRuntime | None = None,
        *,
        malware_scan_hook: Optional[Callable[[Dict[str, Any]], Any]] = None,
    ) -> None:
        self._runtime = runtime or GatewayBrowserRuntime()
        self._malware_scan_hook = malware_scan_hook
        self._isolation_by_session: Dict[str, VirtualComputerIsolationState] = {}
        self._identity_by_session: Dict[str, VirtualComputerIdentityContext] = {}
        self._cost_by_session: Dict[str, VirtualComputerCostQuotaState] = {}
        self._persistence_by_session: Dict[str, VirtualComputerSessionPersistenceState] = {}
        self._timeline_by_session: Dict[str, List[Dict[str, Any]]] = {}
        self._artifacts_by_session: Dict[str, List[Dict[str, Any]]] = {}
        self._context_by_session: Dict[str, Dict[str, Any]] = {}
        self._risk_prompt_by_session: Dict[str, Dict[str, Any]] = {}
        self._audit_by_session: Dict[str, List[Dict[str, Any]]] = {}
        self._bridge_policy_by_session: Dict[str, Dict[str, Any]] = {}
        self._handoff_requests_by_session: Dict[str, List[Dict[str, Any]]] = {}

    def _response(self, result: Dict[str, Any]) -> Dict[str, Any]:
        session = result.get("browser_session") if isinstance(result.get("browser_session"), dict) else {}
        status = _token(result.get("status") or session.get("status"))
        session_id = _token(session.get("browser_session_id"))
        isolation_state = self._isolation_by_session.get(session_id)
        isolation_profile = (
            _profile_payload(isolation_state.profile)
            if isolation_state is not None
            else _profile_payload(_runtime_choice_default_isolation_profile(RUNTIME_CHOICE_LOCAL))
        )
        identity = self._identity_by_session.get(session_id)
        cost_state = self._cost_by_session.get(session_id)
        persistence_state = self._persistence_by_session.get(session_id)
        timeline = self._timeline_by_session.get(session_id) or []
        artifacts = self._artifacts_by_session.get(session_id) or []
        context = self._context_by_session.get(session_id) or {}
        current_url = (
            context.get("url")
            or session.get("current_url")
            or session.get("url")
            or result.get("current_url")
            or result.get("url")
        )
        app_title = (
            context.get("app_title")
            or session.get("app_title")
            or session.get("title")
            or result.get("app_title")
            or result.get("title")
        )
        risk_prompt = self._risk_prompt_by_session.get(session_id)
        live_screenshot = artifacts[-1] if artifacts else None
        audit_events = self._audit_by_session.get(session_id) or []
        audit_report = _build_audit_report(session_id, audit_events)
        bridge_policy = self._bridge_policy_by_session.get(session_id) or {}
        handoff_requests = self._handoff_requests_by_session.get(session_id) or []
        artifact_policy = context.get("artifact_policy") if isinstance(context.get("artifact_policy"), dict) else None
        network_policy = context.get("network_browser_policy") if isinstance(context.get("network_browser_policy"), dict) else None
        enterprise_controls = context.get("enterprise_controls") if isinstance(context.get("enterprise_controls"), dict) else None
        artifact_total_size = int(context.get("artifact_total_size_bytes") or 0)
        streaming_ui = _streaming_ui_payload(
            state=_gateway_status_to_contract_state(status),
            current_url=current_url,
            app_title=app_title,
            live_screenshot=live_screenshot,
            action_timeline=timeline,
            artifacts=artifacts,
            can_pause=bool(
                persistence_state is not None
                and persistence_state.profile.session_mode == SESSION_PERSISTENCE_RESUMABLE
            ),
            can_resume=bool(
                persistence_state is not None
                and persistence_state.profile.session_mode == SESSION_PERSISTENCE_RESUMABLE
            ),
            can_terminate=True,
            can_take_over=True,
            risk_prompt=risk_prompt,
        )
        return {
            **result,
            "state": _gateway_status_to_contract_state(status),
            "runtime_contract_interface": RUNTIME_INTERFACE_ID,
            "runtime_kind": "local_gateway_runtime",
            "session_id": session_id,
            "snapshot": session.get("snapshot") if isinstance(session.get("snapshot"), dict) else {},
            "checkpoint": session.get("checkpoint") if isinstance(session.get("checkpoint"), dict) else {},
            "isolation_profile": isolation_profile,
            "ttl_expires_at_epoch": float(isolation_state.expires_at_epoch) if isolation_state is not None else None,
            "identity_context": _identity_payload(identity) if identity is not None else None,
            "cost_quota": _cost_quota_payload(cost_state.profile) if cost_state is not None else None,
            "cost_usage": _cost_usage_payload(cost_state) if cost_state is not None else None,
            "session_persistence": (
                _session_persistence_payload(persistence_state.profile) if persistence_state is not None else None
            ),
            "session_disk_expires_at_epoch": (
                float(persistence_state.disk_expires_at_epoch) if persistence_state is not None else None
            ),
            "session_controls": {
                "can_pause": bool(
                    persistence_state is not None
                    and persistence_state.profile.session_mode == SESSION_PERSISTENCE_RESUMABLE
                ),
                "can_resume": bool(
                    persistence_state is not None
                    and persistence_state.profile.session_mode == SESSION_PERSISTENCE_RESUMABLE
                ),
                "can_terminate": True,
                "manual_terminate_action": "terminate_session",
            },
            "streaming_ui": streaming_ui,
            "artifact_policy": dict(artifact_policy or {}),
            "network_browser_policy": dict(network_policy or {}),
            "enterprise_controls": dict(enterprise_controls or {}),
            "session_recording_retention_seconds": int(
                (enterprise_controls or {}).get("session_recording_retention_seconds") or 0
            ),
            "session_recording": dict(context.get("session_recording") or {}),
            "session_recording_expires_at_epoch": (
                float(context.get("session_recording_expires_at_epoch"))
                if context.get("session_recording_expires_at_epoch") is not None
                else None
            ),
            "local_gateway_bridge": {
                **dict(bridge_policy),
                "handoff_requests": [dict(item) for item in handoff_requests if isinstance(item, dict)],
            },
            "artifact_usage": {"total_size_bytes": artifact_total_size},
            "audit_chain": {
                "event_count": int(audit_report.get("event_count") or 0),
                "head_hash": audit_report.get("head_hash"),
                "chain_valid": bool(audit_report.get("chain_valid")),
            },
        }

    def _active_provider_count(self, provider_id: str) -> int:
        return sum(
            1
            for state in self._cost_by_session.values()
            if state.provider_id == provider_id and not state.quota_terminated
        )

    def _active_workspace_count(self, workspace_id: str) -> int:
        return sum(
            1
            for state in self._cost_by_session.values()
            if state.workspace_id == workspace_id and not state.quota_terminated
        )

    def _active_agent_count(self, agent_id: str) -> int:
        return sum(
            1
            for state in self._cost_by_session.values()
            if state.agent_id == agent_id and not state.quota_terminated
        )

    def _workspace_estimated_cost(self, workspace_id: str) -> float:
        return sum(
            float(state.estimated_cost)
            for state in self._cost_by_session.values()
            if state.workspace_id == workspace_id and not state.quota_terminated
        )

    def _agent_estimated_cost(self, agent_id: str) -> float:
        return sum(
            float(state.estimated_cost)
            for state in self._cost_by_session.values()
            if state.agent_id == agent_id and not state.quota_terminated
        )

    def _agent_runtime_seconds(self, agent_id: str) -> float:
        now_epoch = time.time()
        return sum(
            max(now_epoch - float(state.started_at_epoch), 0.0)
            for state in self._cost_by_session.values()
            if state.agent_id == agent_id and not state.quota_terminated
        )

    def _normalize_gateway_session_body(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        body = dict(payload or {})
        session_id = _token(body.get("browser_session_id") or body.get("session_id"))
        if session_id and not _token(body.get("browser_session_id")):
            body["browser_session_id"] = session_id
        return body

    async def create_session(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        body = dict(payload or {})
        runtime_choice = _token(body.get("runtime_choice")).lower() or RUNTIME_CHOICE_LOCAL
        isolation_profile = build_isolation_profile(body, runtime_choice=runtime_choice)
        artifact_policy = _artifact_policy_from_payload(body)
        network_policy = _build_network_browser_security_policy(body)
        bridge_policy = _normalize_local_gateway_bridge_policy(body)
        enterprise_controls = _normalize_enterprise_controls(body)
        _assert_workspace_admin_policy(body, enterprise_controls)
        if enterprise_controls.get("domain_allowlist"):
            merged_allowed_domains = _normalize_policy_domain_list(
                list(network_policy.get("allowed_domains") or [])
                + list(enterprise_controls.get("domain_allowlist") or [])
            )
            network_policy["allowed_domains"] = merged_allowed_domains
            if bool(enterprise_controls.get("disable_public_internet_mode")) and merged_allowed_domains:
                isolation_profile.allowed_hosts = list(merged_allowed_domains)
        persistence_profile = build_session_persistence_profile(
            body,
            runtime_choice=runtime_choice,
            isolation_profile=isolation_profile,
        )
        identity_context = _build_identity_context(body, runtime_choice=runtime_choice)
        provider_id = _token(body.get("runtime_provider_id") or body.get("provider_id")) or "local_gateway"
        workspace_id = _token(body.get("workspace_id")) or "default"
        agent_id = _token(body.get("agent_id") or body.get("run_id") or body.get("agent_runtime_id")) or "default_agent"
        cost_profile = build_cost_quota_profile(body, provider_id=provider_id)
        admission = runtime_admission_gate(
            phase="session_init",
            payload=body,
            action=None,
            action_args=None,
            runtime_kind="local_gateway_runtime",
            cost_profile=cost_profile,
            cost_state=None,
            workspace_estimated_cost=self._workspace_estimated_cost(workspace_id),
            agent_estimated_cost=self._agent_estimated_cost(agent_id),
            agent_runtime_seconds=self._agent_runtime_seconds(agent_id),
            active_provider_sessions=self._active_provider_count(provider_id),
            active_workspace_sessions=self._active_workspace_count(workspace_id),
            active_agent_sessions=self._active_agent_count(agent_id),
            network_policy=network_policy,
            enterprise_controls=enterprise_controls,
        )
        result = await self._runtime.start_session(body)
        session = result.get("browser_session") if isinstance(result.get("browser_session"), dict) else {}
        session_id = _token(session.get("browser_session_id"))
        now_epoch = time.time()
        self._isolation_by_session[session_id] = VirtualComputerIsolationState(
            profile=isolation_profile,
            created_at_epoch=now_epoch,
            expires_at_epoch=now_epoch + float(isolation_profile.runtime_ttl_seconds),
        )
        self._identity_by_session[session_id] = identity_context
        self._persistence_by_session[session_id] = VirtualComputerSessionPersistenceState(
            profile=persistence_profile,
            created_at_epoch=now_epoch,
            last_activity_epoch=now_epoch,
            disk_expires_at_epoch=now_epoch + float(persistence_profile.session_disk_ttl_seconds),
        )
        self._timeline_by_session[session_id] = []
        self._artifacts_by_session[session_id] = []
        self._context_by_session[session_id] = {
            "url": _token(body.get("url") or body.get("start_url")) or "",
            "app_title": _token(body.get("app_title") or body.get("title")) or "",
            "artifact_policy": dict(artifact_policy),
            "network_browser_policy": dict(network_policy),
            "enterprise_controls": dict(enterprise_controls),
            "artifact_total_size_bytes": 0,
            "session_recording_expires_at_epoch": now_epoch + float(
                enterprise_controls.get("session_recording_retention_seconds") or 0
            ),
            "session_recording": dict(admission.get("recording_state") or {}),
        }
        self._risk_prompt_by_session.pop(session_id, None)
        self._bridge_policy_by_session[session_id] = dict(bridge_policy)
        self._handoff_requests_by_session[session_id] = []
        audit_events: List[Dict[str, Any]] = []
        _append_audit_event(
            audit_events,
            event_type="session_created",
            metadata={
                "runtime_choice": runtime_choice,
                "provider_id": provider_id,
                "workspace_id": workspace_id,
            },
        )
        _append_audit_event(
            audit_events,
            event_type="policy_bundle",
            metadata={
                "isolation_profile": _profile_payload(isolation_profile),
                "session_persistence": _session_persistence_payload(persistence_profile),
                "identity_context": _identity_payload(identity_context),
                "risk_policy": dict(body.get("risk_policy") or {}),
                "artifact_policy": dict(artifact_policy),
                "network_browser_policy": dict(network_policy),
                "enterprise_controls": dict(enterprise_controls),
                "local_gateway_bridge": dict(bridge_policy),
                "runtime_admission_gate": {"phase": admission.get("phase"), "allowed": True},
            },
        )
        self._audit_by_session[session_id] = audit_events
        self._cost_by_session[session_id] = VirtualComputerCostQuotaState(
            profile=cost_profile,
            provider_id=provider_id,
            workspace_id=workspace_id,
            agent_id=agent_id,
            started_at_epoch=now_epoch,
            estimated_cost=float(cost_profile.estimated_create_cost),
            last_activity_epoch=now_epoch,
        )
        return self._response(result)

    async def resume_session(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        body = self._normalize_gateway_session_body(dict(payload or {}))
        session_id = _token(body.get("browser_session_id") or body.get("session_id"))
        isolation = self._isolation_by_session.get(session_id)
        if isolation is not None:
            _assert_session_active(isolation)
            isolation.expires_at_epoch = time.time() + float(isolation.profile.runtime_ttl_seconds)
        persistence_state = self._persistence_by_session.get(session_id)
        if persistence_state is not None:
            _assert_persistence_active(persistence_state)
            _register_persistence_activity(persistence_state)
        cost_state = self._cost_by_session.get(session_id)
        if cost_state is not None:
            if cost_state.paused_by_budget and bool(
                payload.get("budget_override_approved") or payload.get("approved") or _token(payload.get("approval_id"))
            ):
                cost_state.paused_by_budget = False
                cost_state.termination_reason = ""
            _assert_cost_quota_active(cost_state)
        return self._response(await self._runtime.resume_session(body))

    async def pause_session(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        body = self._normalize_gateway_session_body(dict(payload or {}))
        session_id = _token(body.get("browser_session_id") or body.get("session_id"))
        isolation = self._isolation_by_session.get(session_id)
        if isolation is not None:
            _assert_session_active(isolation)
        persistence_state = self._persistence_by_session.get(session_id)
        if persistence_state is not None:
            _assert_persistence_active(persistence_state)
            if persistence_state.profile.session_mode == SESSION_PERSISTENCE_EPHEMERAL:
                raise RuntimeError("Ephemeral virtual sessions do not support pause/resume.")
            _register_persistence_activity(persistence_state)
        cost_state = self._cost_by_session.get(session_id)
        if cost_state is not None:
            _assert_cost_quota_active(cost_state)
        return self._response(await self._runtime.takeover(body))

    async def terminate_session(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        body = self._normalize_gateway_session_body(dict(payload or {}))
        session_id = _token(body.get("browser_session_id") or body.get("session_id"))
        isolation = self._isolation_by_session.get(session_id)
        persistence_state = self._persistence_by_session.get(session_id)
        if persistence_state is not None and bool(payload.get("manual_terminate")) and not persistence_state.profile.manual_terminate_enabled:
            raise RuntimeError("Manual terminate is disabled by session persistence policy.")
        if isolation is not None:
            isolation.terminated = True
            isolation.termination_reason = "terminate_session"
        self._identity_by_session.pop(session_id, None)
        self._persistence_by_session.pop(session_id, None)
        self._timeline_by_session.pop(session_id, None)
        self._artifacts_by_session.pop(session_id, None)
        self._context_by_session.pop(session_id, None)
        self._risk_prompt_by_session.pop(session_id, None)
        self._bridge_policy_by_session.pop(session_id, None)
        self._handoff_requests_by_session.pop(session_id, None)
        audit_events = self._audit_by_session.get(session_id) or []
        _append_audit_event(
            audit_events,
            event_type="session_terminated",
            decision="terminated",
            metadata={"reason": "terminate_session", "manual_terminate": bool(payload.get("manual_terminate"))},
        )
        cost_state = self._cost_by_session.get(session_id)
        if cost_state is not None:
            cost_state.quota_terminated = True
            cost_state.termination_reason = "terminate_session"
        result = self._response(await self._runtime.interrupt_session(body))
        result["state"] = RUNTIME_STATE_TERMINATED
        result["status"] = "terminated"
        return result

    async def execute_action(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        body = self._normalize_gateway_session_body(dict(payload or {}))
        session_id = _token(body.get("browser_session_id") or body.get("session_id"))
        action, action_args, wrapped_external = _validate_computer_use_action_payload(
            action=body.get("action"),
            action_args=dict(body.get("action_args") or {}),
        )
        body["action"] = action
        body["action_args"] = action_args
        bridge_policy = self._bridge_policy_by_session.get(session_id) or _normalize_local_gateway_bridge_policy({})
        _assert_no_automatic_local_transfer(action_args, body, bridge_policy)
        isolation = self._isolation_by_session.get(session_id)
        if isolation is not None:
            _assert_session_active(isolation)
            _assert_action_allowed(action=action, action_args=action_args, profile=isolation.profile)
            if isolation.profile.kill_switch_enabled and action.lower() == ACTION_KILL_SWITCH:
                isolation.terminated = True
                isolation.termination_reason = "kill_switch_action"
                await self._runtime.interrupt_session({"browser_session_id": session_id})
                return {
                    "runtime_contract_interface": RUNTIME_INTERFACE_ID,
                    "runtime_kind": "local_gateway_runtime",
                    "session_id": session_id,
                    "state": RUNTIME_STATE_TERMINATED,
                    "status": "terminated",
                    "kill_switch_triggered": True,
                    "isolation_profile": _profile_payload(isolation.profile),
                    "ttl_expires_at_epoch": float(isolation.expires_at_epoch),
                }
        persistence_state = self._persistence_by_session.get(session_id)
        if persistence_state is not None:
            _assert_persistence_active(persistence_state)
            _register_persistence_activity(persistence_state)
        audit_events = self._audit_by_session.setdefault(session_id, [])
        _append_audit_event(
            audit_events,
            event_type="model_action_request",
            action=action,
            metadata={"action_args": dict(action_args or {})},
        )
        context = self._context_by_session.setdefault(session_id, {})
        context_network_policy = (
            context.get("network_browser_policy") if isinstance(context.get("network_browser_policy"), dict) else {}
        )
        enterprise_controls = (
            context.get("enterprise_controls") if isinstance(context.get("enterprise_controls"), dict) else {}
        )
        body_network_policy = _build_network_browser_security_policy(body)
        network_policy = dict(context_network_policy)
        payload_denied_domains = body_network_policy.get("denied_domains")
        if payload_denied_domains:
            network_policy["denied_domains"] = list(
                dict.fromkeys(list(network_policy.get("denied_domains") or []) + list(payload_denied_domains))
            )
        for key in (
            "detect_phishing_pages",
            "block_auto_download_without_approval",
            "enforce_domain_bound_credential_injection",
        ):
            if key in body_network_policy:
                network_policy.setdefault(key, body_network_policy.get(key))
        cost_state = self._cost_by_session.get(session_id)
        if cost_state is None:
            raise RuntimeError("Runtime admission gate rejected session/action: missing cost quota state.")
        try:
            admission = runtime_admission_gate(
                phase="action",
                payload=body,
                action=action,
                action_args=action_args,
                runtime_kind="local_gateway_runtime",
                cost_profile=cost_state.profile,
                cost_state=cost_state,
                workspace_estimated_cost=self._workspace_estimated_cost(cost_state.workspace_id),
                agent_estimated_cost=self._agent_estimated_cost(cost_state.agent_id),
                agent_runtime_seconds=self._agent_runtime_seconds(cost_state.agent_id),
                active_provider_sessions=self._active_provider_count(cost_state.provider_id),
                active_workspace_sessions=self._active_workspace_count(cost_state.workspace_id),
                active_agent_sessions=self._active_agent_count(cost_state.agent_id),
                network_policy=network_policy,
                enterprise_controls=enterprise_controls,
                current_url=context.get("url"),
                session_state=context,
            )
            action_policy = dict(admission.get("action_policy") or {})
        except Exception as exc:
            _append_audit_event(
                audit_events,
                event_type="admission_gate_denied",
                action=action,
                decision="denied",
                metadata={"reason": str(exc)},
            )
            _append_audit_event(
                audit_events,
                event_type="approval_decision",
                action=action,
                decision="denied",
                metadata={"reason": str(exc)},
            )
            raise
        _append_audit_event(
            audit_events,
            event_type="approval_decision",
            action=action,
            decision="approved" if bool(action_policy.get("approval_granted")) else "allowed",
            metadata={"policy": dict(action_policy or {})},
        )
        try:
            identity = self._identity_by_session.get(session_id)
            _assert_domain_bound_credential_injection(
                identity=identity,
                action=action,
                action_args=action_args,
                current_url=context.get("url"),
                enforce=bool(network_policy.get("enforce_domain_bound_credential_injection", True)),
            )
            _assert_enterprise_approval_role_controls(
                action_policy=action_policy,
                payload=body,
                controls=enterprise_controls,
            )
        except Exception as exc:
            _append_audit_event(
                audit_events,
                event_type="approval_decision",
                action=action,
                decision="denied",
                metadata={"reason": str(exc), "security_layer": "network_browser"},
            )
            raise
        approval_card = _approval_why_card(action, action_policy)
        if approval_card is not None:
            self._risk_prompt_by_session[session_id] = dict(approval_card)
        timeline = self._timeline_by_session.setdefault(session_id, [])
        _append_timeline_event(
            timeline,
            event_type="action",
            action=action,
            status="executing",
            risk_class=str(action_policy.get("risk_class") or ""),
            details={"requires_approval": bool(action_policy.get("requires_approval"))},
        )
        action_cost_estimate = None
        if cost_state is not None:
            action_cost_estimate = float(admission.get("estimated_increment") or 0.0)
            if action_cost_estimate >= float(cost_state.profile.long_task_cost_estimate_threshold):
                estimate_approved = bool(
                    payload.get("cost_estimate_approved")
                    or payload.get("approved")
                    or _token(payload.get("approval_id"))
                )
                if not estimate_approved:
                    raise RuntimeError(
                        f"Long task cost estimate requires approval before execution ({action_cost_estimate:.2f} {cost_state.profile.cost_unit})."
                    )
            _charge_cost_quota(cost_state, action_cost_estimate)
            if self._workspace_estimated_cost(cost_state.workspace_id) > float(cost_state.profile.workspace_monthly_budget_limit):
                cost_state.quota_terminated = True
                cost_state.termination_reason = "workspace_monthly_budget_limit"
                raise RuntimeError("Session terminated by workspace monthly budget limit.")
            if self._agent_estimated_cost(cost_state.agent_id) > float(cost_state.profile.agent_monthly_budget_limit):
                cost_state.quota_terminated = True
                cost_state.termination_reason = "agent_monthly_budget_limit"
                raise RuntimeError("Session terminated by agent monthly budget limit.")
            if self._agent_runtime_seconds(cost_state.agent_id) > float(cost_state.profile.agent_runtime_budget_seconds):
                cost_state.quota_terminated = True
                cost_state.termination_reason = "agent_runtime_budget_limit"
                raise RuntimeError("Session terminated by per-agent runtime budget.")
        response = self._response(await self._runtime.perform_action(body))
        _append_timeline_event(
            timeline,
            event_type="action",
            action=action,
            status="completed",
            risk_class=str(action_policy.get("risk_class") or ""),
        )
        _append_audit_event(
            audit_events,
            event_type="executed_action",
            action=action,
            decision="executed",
            metadata={"policy": dict(action_policy or {})},
        )
        if action == ACTION_OPEN_URL:
            context = self._context_by_session.setdefault(session_id, {})
            context["url"] = _token(action_args.get("url"))
            context["app_title"] = _token(action_args.get("app_title") or action_args.get("title"))
        if persistence_state is not None and persistence_state.profile.auto_terminate_on_task_complete:
            self._identity_by_session.pop(session_id, None)
            self._persistence_by_session.pop(session_id, None)
            self._risk_prompt_by_session.pop(session_id, None)
            if isolation is not None:
                isolation.terminated = True
                isolation.termination_reason = "ephemeral_auto_terminate"
            if cost_state is not None:
                cost_state.quota_terminated = True
                cost_state.termination_reason = "ephemeral_auto_terminate"
            await self._runtime.interrupt_session({"browser_session_id": session_id})
            response["state"] = RUNTIME_STATE_TERMINATED
            response["status"] = "terminated"
            response["auto_terminated"] = True
        response["action_result"] = {
            "ok": True,
            "action": action,
            "policy": action_policy,
            "external_content_wrappers": wrapped_external,
        }
        if action_cost_estimate is not None:
            response["action_result"]["cost_estimate"] = {
                "estimated_cost": float(action_cost_estimate),
                "cost_unit": cost_state.profile.cost_unit if cost_state is not None else "runtime_unit",
                "long_task_threshold": (
                    float(cost_state.profile.long_task_cost_estimate_threshold) if cost_state is not None else None
                ),
            }
        if approval_card is not None:
            response["action_result"]["approval_prompt"] = approval_card
        return response

    async def stream_screenshot(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        body = self._normalize_gateway_session_body(dict(payload or {}))
        session_id = _token(body.get("browser_session_id") or body.get("session_id"))
        isolation = self._isolation_by_session.get(session_id)
        if isolation is not None:
            _assert_session_active(isolation)
        persistence_state = self._persistence_by_session.get(session_id)
        if persistence_state is not None:
            _assert_persistence_active(persistence_state)
            _register_persistence_activity(persistence_state)
        cost_state = self._cost_by_session.get(session_id)
        if cost_state is not None:
            _assert_cost_quota_active(cost_state)
            _charge_cost_quota(cost_state, cost_state.profile.estimated_action_cost)
        body["action"] = "screenshot"
        body["action_args"] = dict(body.get("action_args") or {})
        raw = await self._runtime.perform_action(body)
        response = self._response(raw)
        artifact = {
            "artifact_id": f"artifact_{uuid.uuid4().hex[:12]}",
            "type": "screenshot",
            "path": _token(((response.get("result_data") or {}).get("screenshot_path")) or "") or None,
            "created_at_epoch": time.time(),
            "expires_at_epoch": (
                time.time() + float(persistence_state.profile.screenshot_ttl_seconds)
                if persistence_state is not None
                else time.time() + float(5 * 60)
            ),
            "size_bytes": int(payload.get("size_bytes") or 256 * 1024),
        }
        context = self._context_by_session.setdefault(session_id, {})
        artifact_policy = context.get("artifact_policy") if isinstance(context.get("artifact_policy"), dict) else _artifact_policy_from_payload({})
        current_total_size = int(context.get("artifact_total_size_bytes") or 0)
        artifact = _enforce_artifact_policy(
            artifact,
            artifact_policy=artifact_policy,
            current_total_artifact_bytes=current_total_size,
            malware_scan_hook=self._malware_scan_hook,
        )
        context["artifact_total_size_bytes"] = current_total_size + _artifact_size_bytes(artifact)
        self._context_by_session[session_id] = context
        artifacts = self._artifacts_by_session.setdefault(session_id, [])
        artifacts.append(artifact)
        timeline = self._timeline_by_session.setdefault(session_id, [])
        _append_timeline_event(timeline, event_type="stream", action=ACTION_SCREENSHOT, status="streaming")
        audit_events = self._audit_by_session.setdefault(session_id, [])
        _append_audit_event(
            audit_events,
            event_type="screenshot_hash",
            action=ACTION_SCREENSHOT,
            metadata={"screenshot_hash": _artifact_digest(artifact)},
        )
        return self._response(raw)

    async def collect_artifact(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        artifact = payload.get("artifact") if isinstance(payload.get("artifact"), dict) else {}
        session_id = _token(payload.get("browser_session_id") or payload.get("session_id"))
        isolation = self._isolation_by_session.get(session_id)
        if isolation is not None:
            _assert_session_active(isolation)
        persistence_state = self._persistence_by_session.get(session_id)
        if persistence_state is not None:
            _assert_persistence_active(persistence_state)
            _register_persistence_activity(persistence_state)
        cost_state = self._cost_by_session.get(session_id)
        if cost_state is not None:
            _assert_cost_quota_active(cost_state)
        context = self._context_by_session.setdefault(session_id, {})
        artifact_policy = context.get("artifact_policy") if isinstance(context.get("artifact_policy"), dict) else _artifact_policy_from_payload({})
        current_total_size = int(context.get("artifact_total_size_bytes") or 0)
        bridge_policy = self._bridge_policy_by_session.get(session_id) or _normalize_local_gateway_bridge_policy({})
        artifact_with_retention = dict(artifact)
        if persistence_state is not None:
            now_epoch = time.time()
            ttl = (
                persistence_state.profile.screenshot_ttl_seconds
                if _token(artifact_with_retention.get("type")).lower() == "screenshot"
                else persistence_state.profile.artifact_ttl_seconds
            )
            artifact_with_retention.setdefault("created_at_epoch", now_epoch)
            artifact_with_retention.setdefault("expires_at_epoch", now_epoch + float(ttl))
        artifact_with_retention = _enforce_artifact_policy(
            artifact_with_retention,
            artifact_policy=artifact_policy,
            current_total_artifact_bytes=current_total_size,
            malware_scan_hook=self._malware_scan_hook,
        )
        export_decision = _artifact_export_decision(artifact_policy, payload)
        if bool(export_decision.get("requested")) and _token(export_decision.get("destination")) == ARTIFACT_EXPORT_LOCAL:
            _append_audit_event(
                self._audit_by_session.setdefault(session_id, []),
                event_type="local_handoff_requested",
                action="artifact_export_local",
                metadata={"artifact_id": _token(artifact_with_retention.get("artifact_id"))},
            )
            _assert_local_handoff_transfer_approval(payload, bridge_policy)
            _append_audit_event(
                self._audit_by_session.setdefault(session_id, []),
                event_type="local_handoff_approved",
                action="artifact_export_local",
                decision="approved",
                metadata={
                    "artifact_id": _token(artifact_with_retention.get("artifact_id")),
                    "user_approval": bool(payload.get("local_handoff_approved") or payload.get("approved") or _token(payload.get("approval_id"))),
                    "local_gateway_approval": bool(payload.get("local_gateway_approved") or _token(payload.get("local_gateway_approval_id"))),
                },
            )
        context["artifact_total_size_bytes"] = current_total_size + _artifact_size_bytes(artifact_with_retention)
        self._context_by_session[session_id] = context
        artifacts = self._artifacts_by_session.setdefault(session_id, [])
        artifacts.append(dict(artifact_with_retention))
        timeline = self._timeline_by_session.setdefault(session_id, [])
        _append_timeline_event(
            timeline,
            event_type="artifact",
            action=ACTION_DOWNLOAD_ARTIFACT,
            status="collected",
            details={"artifact_id": _token(artifact_with_retention.get("artifact_id"))},
        )
        audit_events = self._audit_by_session.setdefault(session_id, [])
        _append_audit_event(
            audit_events,
            event_type="artifact_hash",
            action=ACTION_DOWNLOAD_ARTIFACT,
            metadata={
                "artifact_id": _token(artifact_with_retention.get("artifact_id")),
                "artifact_hash": _artifact_digest(artifact_with_retention),
                "artifact_type": _token(artifact_with_retention.get("type")),
                "artifact_size_bytes": _artifact_size_bytes(artifact_with_retention),
                "malware_scan": dict(artifact_with_retention.get("malware_scan") or {}),
                "export": dict(export_decision),
            },
        )
        return {
            "ok": True,
            "artifact": artifact_with_retention,
            "artifact_policy": dict(artifact_policy),
            "export": export_decision,
            "runtime_contract_interface": RUNTIME_INTERFACE_ID,
            "runtime_kind": "local_gateway_runtime",
        }

    async def snapshot_session(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        body = self._normalize_gateway_session_body(dict(payload or {}))
        session_id = _token(body.get("browser_session_id") or body.get("session_id"))
        isolation = self._isolation_by_session.get(session_id)
        if isolation is not None:
            _assert_session_active(isolation)
        persistence_state = self._persistence_by_session.get(session_id)
        if persistence_state is not None:
            _assert_persistence_active(persistence_state)
            _register_persistence_activity(persistence_state)
            if not persistence_state.profile.snapshot_enabled:
                raise RuntimeError("Snapshots are disabled by session persistence policy.")
        cost_state = self._cost_by_session.get(session_id)
        if cost_state is not None:
            _assert_cost_quota_active(cost_state)
        body["action"] = "observe"
        body["action_args"] = dict(body.get("action_args") or {})
        observed = self._response(await self._runtime.perform_action(body))
        timeline = self._timeline_by_session.setdefault(session_id, [])
        _append_timeline_event(timeline, event_type="snapshot", action="snapshot_session", status="snapshotted")
        audit_report = _build_audit_report(session_id, self._audit_by_session.get(session_id) or [])
        return {
            "runtime_contract_interface": RUNTIME_INTERFACE_ID,
            "runtime_kind": "local_gateway_runtime",
            "session_id": observed.get("session_id"),
            "state": observed.get("state"),
            "snapshot": observed.get("snapshot") or {},
            "checkpoint": observed.get("checkpoint") or {},
            "audit_report": audit_report,
        }

    async def export_audit_report(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        session_id = _token(payload.get("browser_session_id") or payload.get("session_id"))
        context = self._context_by_session.get(session_id) if isinstance(self._context_by_session.get(session_id), dict) else {}
        enterprise_controls = context.get("enterprise_controls") if isinstance(context.get("enterprise_controls"), dict) else {}
        if enterprise_controls and not bool(enterprise_controls.get("allow_audit_export", True)):
            raise RuntimeError("Enterprise policy blocked audit export.")
        audit_events = self._audit_by_session.get(session_id) or []
        return {
            "ok": True,
            "runtime_contract_interface": RUNTIME_INTERFACE_ID,
            "runtime_kind": "local_gateway_runtime",
            "audit_report": _build_audit_report(session_id, audit_events),
        }

    async def request_local_handoff(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        session_id = _token(payload.get("browser_session_id") or payload.get("session_id"))
        bridge_policy = self._bridge_policy_by_session.get(session_id) or _normalize_local_gateway_bridge_policy({})
        handoff_id = _token(payload.get("handoff_id")) or f"handoff_{uuid.uuid4().hex[:12]}"
        direction = _token(payload.get("direction")).lower() or "export_to_local"
        artifact_id = _token(payload.get("artifact_id")) or None
        request = {
            "handoff_id": handoff_id,
            "direction": direction,
            "artifact_id": artifact_id,
            "requested_at_epoch": time.time(),
            "requested": True,
        }
        self._handoff_requests_by_session.setdefault(session_id, []).append(dict(request))
        audit_events = self._audit_by_session.setdefault(session_id, [])
        _append_audit_event(
            audit_events,
            event_type="local_handoff_requested",
            action="local_gateway_bridge",
            metadata=dict(request),
        )
        _assert_local_handoff_transfer_approval(payload, bridge_policy)
        _append_audit_event(
            audit_events,
            event_type="local_handoff_approved",
            action="local_gateway_bridge",
            decision="approved",
            metadata={
                **request,
                "user_approval": bool(payload.get("local_handoff_approved") or payload.get("approved") or _token(payload.get("approval_id"))),
                "local_gateway_approval": bool(payload.get("local_gateway_approved") or _token(payload.get("local_gateway_approval_id"))),
            },
        )
        return {
            "ok": True,
            "runtime_contract_interface": RUNTIME_INTERFACE_ID,
            "runtime_kind": "local_gateway_runtime",
            "session_id": session_id,
            "handoff_request": {
                **request,
                "approved": True,
            },
            "local_gateway_bridge": dict(bridge_policy),
        }


class InMemoryVirtualComputerRuntime:
    def __init__(self, *, malware_scan_hook: Optional[Callable[[Dict[str, Any]], Any]] = None) -> None:
        self._malware_scan_hook = malware_scan_hook
        self._sessions: Dict[str, Dict[str, Any]] = {}
        self._isolation_by_session: Dict[str, VirtualComputerIsolationState] = {}
        self._identity_by_session: Dict[str, VirtualComputerIdentityContext] = {}
        self._cost_by_session: Dict[str, VirtualComputerCostQuotaState] = {}
        self._persistence_by_session: Dict[str, VirtualComputerSessionPersistenceState] = {}

    def _session(self, session_id: str) -> Dict[str, Any]:
        token = _token(session_id)
        session = self._sessions.get(token)
        if session is None:
            raise RuntimeError("Virtual computer session was not found.")
        return session

    def _assert_session_access(self, session: Dict[str, Any], payload: Dict[str, Any]) -> None:
        session_id = _token(session.get("session_id"))
        _assert_revoked_session_not_used(session, payload)
        _assert_session_token_fresh(session, payload)
        cost_state = self._cost_by_session.get(session_id)
        _assert_cross_tenant_session_access(session=session, payload=payload, cost_state=cost_state)

    def _base_response(self, session: Dict[str, Any]) -> Dict[str, Any]:
        session_id = _token(session.get("session_id"))
        isolation = self._isolation_by_session.get(session_id)
        isolation_profile = (
            _profile_payload(isolation.profile)
            if isolation is not None
            else _profile_payload(_runtime_choice_default_isolation_profile(RUNTIME_CHOICE_VIRTUAL_BROWSER))
        )
        identity = self._identity_by_session.get(session_id)
        cost_state = self._cost_by_session.get(session_id)
        persistence_state = self._persistence_by_session.get(session_id)
        _purge_expired_artifacts(session)
        action_timeline = session.get("ui_action_timeline") if isinstance(session.get("ui_action_timeline"), list) else []
        artifacts = session.get("artifacts") if isinstance(session.get("artifacts"), list) else []
        artifact_policy = session.get("artifact_policy") if isinstance(session.get("artifact_policy"), dict) else {}
        network_policy = session.get("network_browser_policy") if isinstance(session.get("network_browser_policy"), dict) else {}
        enterprise_controls = session.get("enterprise_controls") if isinstance(session.get("enterprise_controls"), dict) else {}
        bridge_policy = session.get("local_gateway_bridge") if isinstance(session.get("local_gateway_bridge"), dict) else {}
        handoff_requests = session.get("local_handoff_requests") if isinstance(session.get("local_handoff_requests"), list) else []
        artifact_total_size = int(session.get("artifact_total_size_bytes") or 0)
        audit_events = session.get("audit_events") if isinstance(session.get("audit_events"), list) else []
        audit_report = _build_audit_report(session_id, audit_events)
        streaming_ui = _streaming_ui_payload(
            state=_token(session.get("state")) or RUNTIME_STATE_READY,
            current_url=session.get("ui_current_url"),
            app_title=session.get("ui_app_title"),
            live_screenshot=session.get("ui_live_screenshot"),
            action_timeline=action_timeline,
            artifacts=artifacts,
            can_pause=bool(
                persistence_state is not None
                and persistence_state.profile.session_mode == SESSION_PERSISTENCE_RESUMABLE
            ),
            can_resume=bool(
                persistence_state is not None
                and persistence_state.profile.session_mode == SESSION_PERSISTENCE_RESUMABLE
            ),
            can_terminate=True,
            can_take_over=True,
            risk_prompt=session.get("ui_risk_prompt") if isinstance(session.get("ui_risk_prompt"), dict) else None,
        )
        return {
            "runtime_contract_interface": RUNTIME_INTERFACE_ID,
            "runtime_kind": "virtual_computer_runtime",
            "session_id": session_id,
            "state": _token(session.get("state")) or RUNTIME_STATE_READY,
            "session": dict(session),
            "isolation_profile": isolation_profile,
            "ttl_expires_at_epoch": float(isolation.expires_at_epoch) if isolation is not None else None,
            "identity_context": _identity_payload(identity) if identity is not None else None,
            "cost_quota": _cost_quota_payload(cost_state.profile) if cost_state is not None else None,
            "cost_usage": _cost_usage_payload(cost_state) if cost_state is not None else None,
            "session_persistence": (
                _session_persistence_payload(persistence_state.profile) if persistence_state is not None else None
            ),
            "session_disk_expires_at_epoch": (
                float(persistence_state.disk_expires_at_epoch) if persistence_state is not None else None
            ),
            "session_controls": {
                "can_pause": bool(
                    persistence_state is not None
                    and persistence_state.profile.session_mode == SESSION_PERSISTENCE_RESUMABLE
                ),
                "can_resume": bool(
                    persistence_state is not None
                    and persistence_state.profile.session_mode == SESSION_PERSISTENCE_RESUMABLE
                ),
                "can_terminate": True,
                "manual_terminate_action": "terminate_session",
            },
            "streaming_ui": streaming_ui,
            "artifact_policy": dict(artifact_policy),
            "network_browser_policy": dict(network_policy),
            "enterprise_controls": dict(enterprise_controls),
            "session_recording_retention_seconds": int(enterprise_controls.get("session_recording_retention_seconds") or 0),
            "session_recording": dict(session.get("session_recording") or {}),
            "session_recording_expires_at_epoch": (
                float(session.get("session_recording_expires_at_epoch"))
                if session.get("session_recording_expires_at_epoch") is not None
                else None
            ),
            "local_gateway_bridge": {
                **dict(bridge_policy),
                "handoff_requests": [dict(item) for item in handoff_requests if isinstance(item, dict)],
            },
            "artifact_usage": {"total_size_bytes": artifact_total_size},
            "audit_chain": {
                "event_count": int(audit_report.get("event_count") or 0),
                "head_hash": audit_report.get("head_hash"),
                "chain_valid": bool(audit_report.get("chain_valid")),
            },
        }

    def _active_provider_count(self, provider_id: str) -> int:
        return sum(
            1
            for state in self._cost_by_session.values()
            if state.provider_id == provider_id and not state.quota_terminated
        )

    def _active_workspace_count(self, workspace_id: str) -> int:
        return sum(
            1
            for state in self._cost_by_session.values()
            if state.workspace_id == workspace_id and not state.quota_terminated
        )

    def _active_agent_count(self, agent_id: str) -> int:
        return sum(
            1
            for state in self._cost_by_session.values()
            if state.agent_id == agent_id and not state.quota_terminated
        )

    def _workspace_estimated_cost(self, workspace_id: str) -> float:
        return sum(
            float(state.estimated_cost)
            for state in self._cost_by_session.values()
            if state.workspace_id == workspace_id and not state.quota_terminated
        )

    def _agent_estimated_cost(self, agent_id: str) -> float:
        return sum(
            float(state.estimated_cost)
            for state in self._cost_by_session.values()
            if state.agent_id == agent_id and not state.quota_terminated
        )

    def _agent_runtime_seconds(self, agent_id: str) -> float:
        now_epoch = time.time()
        return sum(
            max(now_epoch - float(state.started_at_epoch), 0.0)
            for state in self._cost_by_session.values()
            if state.agent_id == agent_id and not state.quota_terminated
        )

    async def create_session(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        body = dict(payload or {})
        runtime_choice = _token(body.get("runtime_choice")) or RUNTIME_CHOICE_VIRTUAL_BROWSER
        isolation_profile = build_isolation_profile(body, runtime_choice=runtime_choice)
        artifact_policy = _artifact_policy_from_payload(body)
        network_policy = _build_network_browser_security_policy(body)
        bridge_policy = _normalize_local_gateway_bridge_policy(body)
        enterprise_controls = _normalize_enterprise_controls(body)
        _assert_workspace_admin_policy(body, enterprise_controls)
        if enterprise_controls.get("domain_allowlist"):
            merged_allowed_domains = _normalize_policy_domain_list(
                list(network_policy.get("allowed_domains") or [])
                + list(enterprise_controls.get("domain_allowlist") or [])
            )
            network_policy["allowed_domains"] = merged_allowed_domains
            if bool(enterprise_controls.get("disable_public_internet_mode")) and merged_allowed_domains:
                isolation_profile.allowed_hosts = list(merged_allowed_domains)
        persistence_profile = build_session_persistence_profile(
            body,
            runtime_choice=runtime_choice,
            isolation_profile=isolation_profile,
        )
        identity_context = _build_identity_context(body, runtime_choice=runtime_choice)
        provider_id = _token(body.get("runtime_provider_id") or body.get("provider_id")) or "in_memory"
        workspace_id = _token(body.get("workspace_id")) or "default"
        tenant_id = _token(body.get("tenant_id")) or workspace_id
        agent_id = _token(body.get("agent_id") or body.get("run_id") or body.get("agent_runtime_id")) or "default_agent"
        now_epoch = time.time()
        token_ttl_seconds = _coerce_positive_int(body.get("session_token_ttl_seconds"), 15 * 60, 1)
        token_expires_at = body.get("session_token_expires_at_epoch")
        session_token_expires_at_epoch: Optional[float] = None
        if token_expires_at is not None:
            try:
                session_token_expires_at_epoch = float(token_expires_at)
            except Exception:
                session_token_expires_at_epoch = None
        elif bool(body.get("require_session_token")):
            session_token_expires_at_epoch = now_epoch + float(token_ttl_seconds)
        cost_profile = build_cost_quota_profile(body, provider_id=provider_id)
        admission = runtime_admission_gate(
            phase="session_init",
            payload=body,
            action=None,
            action_args=None,
            runtime_kind="virtual_computer_runtime",
            cost_profile=cost_profile,
            cost_state=None,
            workspace_estimated_cost=self._workspace_estimated_cost(workspace_id),
            agent_estimated_cost=self._agent_estimated_cost(agent_id),
            agent_runtime_seconds=self._agent_runtime_seconds(agent_id),
            active_provider_sessions=self._active_provider_count(provider_id),
            active_workspace_sessions=self._active_workspace_count(workspace_id),
            active_agent_sessions=self._active_agent_count(agent_id),
            network_policy=network_policy,
            enterprise_controls=enterprise_controls,
        )
        session_id = _token(body.get("session_id")) or f"vcsess_{uuid.uuid4().hex}"
        session = {
            "session_id": session_id,
            "state": RUNTIME_STATE_RUNNING,
            "runtime_choice": runtime_choice,
            "workspace_id": workspace_id,
            "tenant_id": tenant_id,
            "actions": [],
            "artifacts": [],
            "snapshot": {},
            "filesystem_used_bytes": 0,
            "audit_events": [],
            "ui_action_timeline": [],
            "ui_current_url": _token(body.get("url") or body.get("start_url")) or "",
            "ui_app_title": _token(body.get("app_title") or body.get("title")) or "",
            "ui_live_screenshot": None,
            "ui_risk_prompt": None,
            "artifact_policy": dict(artifact_policy),
            "network_browser_policy": dict(network_policy),
            "local_gateway_bridge": dict(bridge_policy),
            "local_handoff_requests": [],
            "enterprise_controls": dict(enterprise_controls),
            "artifact_total_size_bytes": 0,
            "session_revoked": False,
            "require_session_token": bool(body.get("require_session_token")),
            "session_token": (
                _token(body.get("session_token"))
                or (f"vctok_{uuid.uuid4().hex[:16]}" if bool(body.get("require_session_token")) else "")
            ),
            "session_token_expires_at_epoch": session_token_expires_at_epoch,
            "session_recording_expires_at_epoch": now_epoch + float(
                enterprise_controls.get("session_recording_retention_seconds") or 0
            ),
            "session_recording": dict(admission.get("recording_state") or {}),
        }
        self._sessions[session_id] = session
        self._isolation_by_session[session_id] = VirtualComputerIsolationState(
            profile=isolation_profile,
            created_at_epoch=now_epoch,
            expires_at_epoch=now_epoch + float(isolation_profile.runtime_ttl_seconds),
        )
        self._identity_by_session[session_id] = identity_context
        self._persistence_by_session[session_id] = VirtualComputerSessionPersistenceState(
            profile=persistence_profile,
            created_at_epoch=now_epoch,
            last_activity_epoch=now_epoch,
            disk_expires_at_epoch=now_epoch + float(persistence_profile.session_disk_ttl_seconds),
        )
        self._cost_by_session[session_id] = VirtualComputerCostQuotaState(
            profile=cost_profile,
            provider_id=provider_id,
            workspace_id=workspace_id,
            agent_id=agent_id,
            started_at_epoch=now_epoch,
            estimated_cost=float(cost_profile.estimated_create_cost),
            last_activity_epoch=now_epoch,
        )
        audit_events = session.get("audit_events") if isinstance(session.get("audit_events"), list) else []
        _append_audit_event(
            audit_events,
            event_type="session_created",
            metadata={
                "runtime_choice": runtime_choice,
                "provider_id": provider_id,
                "workspace_id": workspace_id,
            },
        )
        _append_audit_event(
            audit_events,
            event_type="policy_bundle",
            metadata={
                "isolation_profile": _profile_payload(isolation_profile),
                "session_persistence": _session_persistence_payload(persistence_profile),
                "identity_context": _identity_payload(identity_context),
                "risk_policy": dict(body.get("risk_policy") or {}),
                "artifact_policy": dict(artifact_policy),
                "network_browser_policy": dict(network_policy),
                "local_gateway_bridge": dict(bridge_policy),
                "enterprise_controls": dict(enterprise_controls),
                "runtime_admission_gate": {"phase": admission.get("phase"), "allowed": True},
            },
        )
        session["audit_events"] = audit_events
        response = self._base_response(session)
        response["status"] = "started"
        return response

    async def resume_session(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        session_id = _token(payload.get("session_id"))
        session = self._session(session_id)
        self._assert_session_access(session, dict(payload or {}))
        isolation = self._isolation_by_session.get(session_id)
        if isolation is not None:
            _assert_session_active(isolation)
            isolation.expires_at_epoch = time.time() + float(isolation.profile.runtime_ttl_seconds)
        persistence_state = self._persistence_by_session.get(session_id)
        if persistence_state is not None:
            _assert_persistence_active(persistence_state)
            _register_persistence_activity(persistence_state)
        cost_state = self._cost_by_session.get(session_id)
        if cost_state is not None:
            if cost_state.paused_by_budget and bool(
                payload.get("budget_override_approved") or payload.get("approved") or _token(payload.get("approval_id"))
            ):
                cost_state.paused_by_budget = False
                cost_state.termination_reason = ""
            _assert_cost_quota_active(cost_state)
        session["state"] = RUNTIME_STATE_RUNNING
        response = self._base_response(session)
        response["status"] = "resumed"
        return response

    async def pause_session(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        session_id = _token(payload.get("session_id"))
        session = self._session(session_id)
        self._assert_session_access(session, dict(payload or {}))
        isolation = self._isolation_by_session.get(session_id)
        if isolation is not None:
            _assert_session_active(isolation)
        persistence_state = self._persistence_by_session.get(session_id)
        if persistence_state is not None:
            _assert_persistence_active(persistence_state)
            if persistence_state.profile.session_mode == SESSION_PERSISTENCE_EPHEMERAL:
                raise RuntimeError("Ephemeral virtual sessions do not support pause/resume.")
            _register_persistence_activity(persistence_state)
        cost_state = self._cost_by_session.get(session_id)
        if cost_state is not None:
            _assert_cost_quota_active(cost_state)
        session["state"] = RUNTIME_STATE_PAUSED
        response = self._base_response(session)
        response["status"] = "paused"
        return response

    async def terminate_session(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        session_id = _token(payload.get("session_id"))
        session = self._session(session_id)
        self._assert_session_access(session, dict(payload or {}))
        isolation = self._isolation_by_session.get(session_id)
        persistence_state = self._persistence_by_session.get(session_id)
        if persistence_state is not None and bool(payload.get("manual_terminate")) and not persistence_state.profile.manual_terminate_enabled:
            raise RuntimeError("Manual terminate is disabled by session persistence policy.")
        if isolation is not None:
            isolation.terminated = True
            isolation.termination_reason = "terminate_session"
        self._identity_by_session.pop(session_id, None)
        self._persistence_by_session.pop(session_id, None)
        cost_state = self._cost_by_session.get(session_id)
        if cost_state is not None:
            cost_state.quota_terminated = True
            cost_state.termination_reason = "terminate_session"
        audit_events = session.get("audit_events") if isinstance(session.get("audit_events"), list) else []
        _append_audit_event(
            audit_events,
            event_type="session_terminated",
            decision="terminated",
            metadata={"reason": "terminate_session", "manual_terminate": bool(payload.get("manual_terminate"))},
        )
        session["audit_events"] = audit_events
        session["state"] = RUNTIME_STATE_TERMINATED
        response = self._base_response(session)
        response["status"] = "terminated"
        return response

    async def execute_action(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        session_id = _token(payload.get("session_id"))
        session = self._session(session_id)
        self._assert_session_access(session, dict(payload or {}))
        isolation = self._isolation_by_session.get(session_id)
        action, action_args, wrapped_external = _validate_computer_use_action_payload(
            action=payload.get("action"),
            action_args=dict(payload.get("action_args") or {}),
        )
        bridge_policy = (
            session.get("local_gateway_bridge")
            if isinstance(session.get("local_gateway_bridge"), dict)
            else _normalize_local_gateway_bridge_policy({})
        )
        _assert_no_automatic_local_transfer(action_args, dict(payload or {}), bridge_policy)
        if isolation is not None:
            _assert_session_active(isolation)
            _assert_action_allowed(action=action, action_args=action_args, profile=isolation.profile)
            if isolation.profile.kill_switch_enabled and _token(action).lower() == ACTION_KILL_SWITCH:
                isolation.terminated = True
                isolation.termination_reason = "kill_switch_action"
                session["state"] = RUNTIME_STATE_TERMINATED
                cost_state = self._cost_by_session.get(session_id)
                if cost_state is not None:
                    cost_state.quota_terminated = True
                    cost_state.termination_reason = "kill_switch_action"
                response = self._base_response(session)
                response["status"] = "terminated"
                response["kill_switch_triggered"] = True
                return response
        persistence_state = self._persistence_by_session.get(session_id)
        if persistence_state is not None:
            _assert_persistence_active(persistence_state)
            _register_persistence_activity(persistence_state)
        audit_events = session.get("audit_events") if isinstance(session.get("audit_events"), list) else []
        _append_audit_event(
            audit_events,
            event_type="model_action_request",
            action=action,
            metadata={"action_args": dict(action_args or {})},
        )
        session_network_policy = (
            session.get("network_browser_policy") if isinstance(session.get("network_browser_policy"), dict) else {}
        )
        enterprise_controls = (
            session.get("enterprise_controls") if isinstance(session.get("enterprise_controls"), dict) else {}
        )
        payload_network_policy = _build_network_browser_security_policy(dict(payload or {}))
        network_policy = dict(session_network_policy)
        payload_denied_domains = payload_network_policy.get("denied_domains")
        if payload_denied_domains:
            network_policy["denied_domains"] = list(
                dict.fromkeys(list(network_policy.get("denied_domains") or []) + list(payload_denied_domains))
            )
        for key in (
            "detect_phishing_pages",
            "block_auto_download_without_approval",
            "enforce_domain_bound_credential_injection",
        ):
            if key in payload_network_policy:
                network_policy.setdefault(key, payload_network_policy.get(key))
        cost_state = self._cost_by_session.get(session_id)
        if cost_state is None:
            raise RuntimeError("Runtime admission gate rejected session/action: missing cost quota state.")
        try:
            admission = runtime_admission_gate(
                phase="action",
                payload=dict(payload or {}),
                action=action,
                action_args=action_args,
                runtime_kind="virtual_computer_runtime",
                cost_profile=cost_state.profile,
                cost_state=cost_state,
                workspace_estimated_cost=self._workspace_estimated_cost(cost_state.workspace_id),
                agent_estimated_cost=self._agent_estimated_cost(cost_state.agent_id),
                agent_runtime_seconds=self._agent_runtime_seconds(cost_state.agent_id),
                active_provider_sessions=self._active_provider_count(cost_state.provider_id),
                active_workspace_sessions=self._active_workspace_count(cost_state.workspace_id),
                active_agent_sessions=self._active_agent_count(cost_state.agent_id),
                network_policy=network_policy,
                enterprise_controls=enterprise_controls,
                current_url=session.get("ui_current_url"),
                session_state=session,
            )
            action_policy = dict(admission.get("action_policy") or {})
        except Exception as exc:
            _append_audit_event(
                audit_events,
                event_type="admission_gate_denied",
                action=action,
                decision="denied",
                metadata={"reason": str(exc)},
            )
            _append_audit_event(
                audit_events,
                event_type="approval_decision",
                action=action,
                decision="denied",
                metadata={"reason": str(exc)},
            )
            session["audit_events"] = audit_events
            raise
        _append_audit_event(
            audit_events,
            event_type="approval_decision",
            action=action,
            decision="approved" if bool(action_policy.get("approval_granted")) else "allowed",
            metadata={"policy": dict(action_policy or {})},
        )
        try:
            identity = self._identity_by_session.get(session_id)
            _assert_domain_bound_credential_injection(
                identity=identity,
                action=action,
                action_args=action_args,
                current_url=session.get("ui_current_url"),
                enforce=bool(network_policy.get("enforce_domain_bound_credential_injection", True)),
            )
            _assert_enterprise_approval_role_controls(
                action_policy=action_policy,
                payload=dict(payload or {}),
                controls=enterprise_controls,
            )
        except Exception as exc:
            _append_audit_event(
                audit_events,
                event_type="approval_decision",
                action=action,
                decision="denied",
                metadata={"reason": str(exc), "security_layer": "network_browser"},
            )
            session["audit_events"] = audit_events
            raise
        approval_card = _approval_why_card(action, action_policy)
        if approval_card is not None:
            session["ui_risk_prompt"] = dict(approval_card)
        timeline = session.get("ui_action_timeline") if isinstance(session.get("ui_action_timeline"), list) else []
        _append_timeline_event(
            timeline,
            event_type="action",
            action=action,
            status="executing",
            risk_class=str(action_policy.get("risk_class") or ""),
            details={"requires_approval": bool(action_policy.get("requires_approval"))},
        )
        session["ui_action_timeline"] = timeline
        action_cost_estimate = None
        if cost_state is not None:
            action_cost_estimate = float(admission.get("estimated_increment") or 0.0)
            if action_cost_estimate >= float(cost_state.profile.long_task_cost_estimate_threshold):
                estimate_approved = bool(
                    payload.get("cost_estimate_approved")
                    or _token(payload.get("cost_estimate_approval_id"))
                )
                if not estimate_approved:
                    raise RuntimeError(
                        f"Long task cost estimate requires approval before execution ({action_cost_estimate:.2f} {cost_state.profile.cost_unit})."
                    )
            try:
                _charge_cost_quota(cost_state, action_cost_estimate)
            except RuntimeError:
                if cost_state.paused_by_budget:
                    session["state"] = RUNTIME_STATE_PAUSED
                raise
            if self._workspace_estimated_cost(cost_state.workspace_id) > float(cost_state.profile.workspace_monthly_budget_limit):
                cost_state.quota_terminated = True
                cost_state.termination_reason = "workspace_monthly_budget_limit"
                session["state"] = RUNTIME_STATE_TERMINATED
                raise RuntimeError("Session terminated by workspace monthly budget limit.")
            if self._agent_estimated_cost(cost_state.agent_id) > float(cost_state.profile.agent_monthly_budget_limit):
                cost_state.quota_terminated = True
                cost_state.termination_reason = "agent_monthly_budget_limit"
                session["state"] = RUNTIME_STATE_TERMINATED
                raise RuntimeError("Session terminated by agent monthly budget limit.")
            if self._agent_runtime_seconds(cost_state.agent_id) > float(cost_state.profile.agent_runtime_budget_seconds):
                cost_state.quota_terminated = True
                cost_state.termination_reason = "agent_runtime_budget_limit"
                session["state"] = RUNTIME_STATE_TERMINATED
                raise RuntimeError("Session terminated by per-agent runtime budget.")
        if session.get("state") in {RUNTIME_STATE_TERMINATED, RUNTIME_STATE_FAILED, RUNTIME_STATE_EXPIRED}:
            raise RuntimeError("Session is no longer executable.")
        actions = session.get("actions") if isinstance(session.get("actions"), list) else []
        actions.append({"action": action, "action_args": action_args})
        session["actions"] = actions
        fs_used = int(session.get("filesystem_used_bytes") or 0)
        fs_used += len(str(action_args))
        session["filesystem_used_bytes"] = fs_used
        if isolation is not None and fs_used > int(isolation.profile.filesystem_quota_bytes):
            session["state"] = RUNTIME_STATE_FAILED
            raise RuntimeError("Filesystem quota exceeded for virtual session.")
        _append_audit_event(
            audit_events,
            event_type="executed_action",
            action=action,
            decision="executed",
            metadata={"policy": dict(action_policy or {})},
        )
        session["audit_events"] = audit_events
        _append_timeline_event(
            timeline,
            event_type="action",
            action=action,
            status="completed",
            risk_class=str(action_policy.get("risk_class") or ""),
        )
        if action == ACTION_OPEN_URL:
            session["ui_current_url"] = _token(action_args.get("url"))
            session["ui_app_title"] = _token(action_args.get("app_title") or action_args.get("title"))
        session["state"] = RUNTIME_STATE_RUNNING
        response = self._base_response(session)
        response["status"] = "completed"
        response["action_result"] = {
            "ok": True,
            "action": action,
            "policy": action_policy,
            "external_content_wrappers": wrapped_external,
        }
        if action_cost_estimate is not None:
            response["action_result"]["cost_estimate"] = {
                "estimated_cost": float(action_cost_estimate),
                "cost_unit": cost_state.profile.cost_unit if cost_state is not None else "runtime_unit",
                "long_task_threshold": (
                    float(cost_state.profile.long_task_cost_estimate_threshold) if cost_state is not None else None
                ),
            }
        if approval_card is not None:
            response["action_result"]["approval_prompt"] = approval_card
        if persistence_state is not None and persistence_state.profile.auto_terminate_on_task_complete:
            if isolation is not None:
                isolation.terminated = True
                isolation.termination_reason = "ephemeral_auto_terminate"
            if cost_state is not None:
                cost_state.quota_terminated = True
                cost_state.termination_reason = "ephemeral_auto_terminate"
            session["state"] = RUNTIME_STATE_TERMINATED
            self._identity_by_session.pop(session_id, None)
            self._persistence_by_session.pop(session_id, None)
            response = self._base_response(session)
            response["status"] = "terminated"
            response["auto_terminated"] = True
            response["action_result"] = {
                "ok": True,
                "action": action,
                "policy": action_policy,
                "external_content_wrappers": wrapped_external,
            }
            if approval_card is not None:
                response["action_result"]["approval_prompt"] = approval_card
        return response

    async def stream_screenshot(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        session_id = _token(payload.get("session_id"))
        session = self._session(session_id)
        self._assert_session_access(session, dict(payload or {}))
        isolation = self._isolation_by_session.get(session_id)
        if isolation is not None:
            _assert_session_active(isolation)
        persistence_state = self._persistence_by_session.get(session_id)
        if persistence_state is not None:
            _assert_persistence_active(persistence_state)
            _register_persistence_activity(persistence_state)
        cost_state = self._cost_by_session.get(session_id)
        if cost_state is not None:
            _assert_cost_quota_active(cost_state)
            _charge_cost_quota(cost_state, cost_state.profile.estimated_action_cost)
        artifacts = session.get("artifacts") if isinstance(session.get("artifacts"), list) else []
        artifact_id = f"artifact_{uuid.uuid4().hex[:12]}"
        now_epoch = time.time()
        screenshot_ttl = (
            persistence_state.profile.screenshot_ttl_seconds if persistence_state is not None else 5 * 60
        )
        artifact = {
            "artifact_id": artifact_id,
            "type": "screenshot",
            "path": f"/virtual/{artifact_id}.png",
            "created_at_epoch": now_epoch,
            "expires_at_epoch": now_epoch + float(screenshot_ttl),
            "size_bytes": int(payload.get("size_bytes") or 256 * 1024),
        }
        artifact_policy = session.get("artifact_policy") if isinstance(session.get("artifact_policy"), dict) else _artifact_policy_from_payload({})
        current_total_size = int(session.get("artifact_total_size_bytes") or 0)
        artifact = _enforce_artifact_policy(
            artifact,
            artifact_policy=artifact_policy,
            current_total_artifact_bytes=current_total_size,
            malware_scan_hook=self._malware_scan_hook,
        )
        artifacts.append(artifact)
        session["artifacts"] = artifacts
        session["artifact_total_size_bytes"] = current_total_size + _artifact_size_bytes(artifact)
        session["ui_live_screenshot"] = dict(artifact)
        timeline = session.get("ui_action_timeline") if isinstance(session.get("ui_action_timeline"), list) else []
        _append_timeline_event(
            timeline,
            event_type="stream",
            action=ACTION_SCREENSHOT,
            status="streaming",
            details={"artifact_id": artifact_id},
        )
        session["ui_action_timeline"] = timeline
        audit_events = session.get("audit_events") if isinstance(session.get("audit_events"), list) else []
        _append_audit_event(
            audit_events,
            event_type="screenshot_hash",
            action=ACTION_SCREENSHOT,
            metadata={"screenshot_hash": _artifact_digest(artifact)},
        )
        session["audit_events"] = audit_events
        response = self._base_response(session)
        response["status"] = "streaming"
        response["artifact"] = artifact
        return response

    async def collect_artifact(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        session_id = _token(payload.get("session_id"))
        session = self._session(session_id)
        self._assert_session_access(session, dict(payload or {}))
        isolation = self._isolation_by_session.get(session_id)
        if isolation is not None:
            _assert_session_active(isolation)
        persistence_state = self._persistence_by_session.get(session_id)
        if persistence_state is not None:
            _assert_persistence_active(persistence_state)
            _register_persistence_activity(persistence_state)
        cost_state = self._cost_by_session.get(session_id)
        if cost_state is not None:
            _assert_cost_quota_active(cost_state)
        _purge_expired_artifacts(session)
        artifact_id = _token(payload.get("artifact_id"))
        artifacts = session.get("artifacts") if isinstance(session.get("artifacts"), list) else []
        artifact = next((item for item in artifacts if _token(item.get("artifact_id")) == artifact_id), None)
        if artifact is None:
            raise RuntimeError("Artifact was not found for this session.")
        artifact_policy = session.get("artifact_policy") if isinstance(session.get("artifact_policy"), dict) else _artifact_policy_from_payload({})
        artifact = _enforce_artifact_policy(
            dict(artifact),
            artifact_policy=artifact_policy,
            current_total_artifact_bytes=0,
            malware_scan_hook=self._malware_scan_hook,
        )
        export_decision = _artifact_export_decision(artifact_policy, payload)
        audit_events = session.get("audit_events") if isinstance(session.get("audit_events"), list) else []
        bridge_policy = (
            session.get("local_gateway_bridge")
            if isinstance(session.get("local_gateway_bridge"), dict)
            else _normalize_local_gateway_bridge_policy({})
        )
        if bool(export_decision.get("requested")) and _token(export_decision.get("destination")) == ARTIFACT_EXPORT_LOCAL:
            _append_audit_event(
                audit_events,
                event_type="local_handoff_requested",
                action="artifact_export_local",
                metadata={"artifact_id": artifact_id},
            )
            _assert_local_handoff_transfer_approval(dict(payload or {}), bridge_policy)
            _append_audit_event(
                audit_events,
                event_type="local_handoff_approved",
                action="artifact_export_local",
                decision="approved",
                metadata={
                    "artifact_id": artifact_id,
                    "user_approval": bool(payload.get("local_handoff_approved") or payload.get("approved") or _token(payload.get("approval_id"))),
                    "local_gateway_approval": bool(payload.get("local_gateway_approved") or _token(payload.get("local_gateway_approval_id"))),
                },
            )
        timeline = session.get("ui_action_timeline") if isinstance(session.get("ui_action_timeline"), list) else []
        _append_timeline_event(
            timeline,
            event_type="artifact",
            action=ACTION_DOWNLOAD_ARTIFACT,
            status="collected",
            details={"artifact_id": artifact_id},
        )
        session["ui_action_timeline"] = timeline
        _append_audit_event(
            audit_events,
            event_type="artifact_hash",
            action=ACTION_DOWNLOAD_ARTIFACT,
            metadata={
                "artifact_id": artifact_id,
                "artifact_hash": _artifact_digest(dict(artifact)),
                "artifact_type": _token(artifact.get("type")),
                "artifact_size_bytes": _artifact_size_bytes(dict(artifact)),
                "malware_scan": dict(artifact.get("malware_scan") or {}),
                "export": dict(export_decision),
            },
        )
        session["audit_events"] = audit_events
        response = self._base_response(session)
        response["status"] = "collected"
        response["artifact"] = dict(artifact)
        response["artifact_policy"] = dict(artifact_policy)
        response["export"] = export_decision
        return response

    async def snapshot_session(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        session_id = _token(payload.get("session_id"))
        session = self._session(session_id)
        self._assert_session_access(session, dict(payload or {}))
        isolation = self._isolation_by_session.get(session_id)
        if isolation is not None:
            _assert_session_active(isolation)
        persistence_state = self._persistence_by_session.get(session_id)
        if persistence_state is not None:
            _assert_persistence_active(persistence_state)
            _register_persistence_activity(persistence_state)
            if not persistence_state.profile.snapshot_enabled:
                raise RuntimeError("Snapshots are disabled by session persistence policy.")
        cost_state = self._cost_by_session.get(session_id)
        if cost_state is not None:
            _assert_cost_quota_active(cost_state)
        _purge_expired_artifacts(session)
        actions = session.get("actions") if isinstance(session.get("actions"), list) else []
        artifacts = session.get("artifacts") if isinstance(session.get("artifacts"), list) else []
        redacted_actions = [
            secret_redaction_service.sanitize_mapping(dict(item))
            for item in actions
            if isinstance(item, dict)
        ]
        redacted_artifacts = [
            secret_redaction_service.sanitize_mapping(dict(item))
            for item in artifacts
            if isinstance(item, dict)
        ]
        snapshot = {
            "state": session.get("state"),
            "runtime_choice": session.get("runtime_choice"),
            "actions_count": len(redacted_actions),
            "actions": redacted_actions,
            "artifacts_count": len(redacted_artifacts),
            "artifacts": redacted_artifacts,
            "filesystem_used_bytes": int(session.get("filesystem_used_bytes") or 0),
        }
        session["snapshot"] = snapshot
        timeline = session.get("ui_action_timeline") if isinstance(session.get("ui_action_timeline"), list) else []
        _append_timeline_event(timeline, event_type="snapshot", action="snapshot_session", status="snapshotted")
        session["ui_action_timeline"] = timeline
        audit_events = session.get("audit_events") if isinstance(session.get("audit_events"), list) else []
        _append_audit_event(
            audit_events,
            event_type="audit_report_exported",
            action="snapshot_session",
            decision="exported",
            metadata={"event_count": len(audit_events)},
        )
        session["audit_events"] = audit_events
        response = self._base_response(session)
        response["status"] = "snapshotted"
        response["snapshot"] = snapshot
        response["audit_report"] = _build_audit_report(session_id, audit_events)
        return response

    async def export_audit_report(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        session_id = _token(payload.get("session_id"))
        session = self._session(session_id)
        self._assert_session_access(session, dict(payload or {}))
        enterprise_controls = session.get("enterprise_controls") if isinstance(session.get("enterprise_controls"), dict) else {}
        if enterprise_controls and not bool(enterprise_controls.get("allow_audit_export", True)):
            raise RuntimeError("Enterprise policy blocked audit export.")
        audit_events = session.get("audit_events") if isinstance(session.get("audit_events"), list) else []
        _append_audit_event(
            audit_events,
            event_type="audit_report_exported",
            action="export_audit_report",
            decision="exported",
            metadata={"event_count": len(audit_events)},
        )
        session["audit_events"] = audit_events
        return {
            "ok": True,
            "runtime_contract_interface": RUNTIME_INTERFACE_ID,
            "runtime_kind": "virtual_computer_runtime",
            "audit_report": _build_audit_report(session_id, audit_events),
        }

    async def request_local_handoff(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        session_id = _token(payload.get("session_id"))
        session = self._session(session_id)
        self._assert_session_access(session, dict(payload or {}))
        bridge_policy = (
            session.get("local_gateway_bridge")
            if isinstance(session.get("local_gateway_bridge"), dict)
            else _normalize_local_gateway_bridge_policy({})
        )
        handoff_id = _token(payload.get("handoff_id")) or f"handoff_{uuid.uuid4().hex[:12]}"
        direction = _token(payload.get("direction")).lower() or "export_to_local"
        artifact_id = _token(payload.get("artifact_id")) or None
        request = {
            "handoff_id": handoff_id,
            "direction": direction,
            "artifact_id": artifact_id,
            "requested_at_epoch": time.time(),
            "requested": True,
        }
        handoffs = session.get("local_handoff_requests") if isinstance(session.get("local_handoff_requests"), list) else []
        handoffs.append(dict(request))
        session["local_handoff_requests"] = handoffs
        audit_events = session.get("audit_events") if isinstance(session.get("audit_events"), list) else []
        _append_audit_event(
            audit_events,
            event_type="local_handoff_requested",
            action="local_gateway_bridge",
            metadata=dict(request),
        )
        _assert_local_handoff_transfer_approval(dict(payload or {}), bridge_policy)
        _append_audit_event(
            audit_events,
            event_type="local_handoff_approved",
            action="local_gateway_bridge",
            decision="approved",
            metadata={
                **request,
                "user_approval": bool(payload.get("local_handoff_approved") or payload.get("approved") or _token(payload.get("approval_id"))),
                "local_gateway_approval": bool(payload.get("local_gateway_approved") or _token(payload.get("local_gateway_approval_id"))),
            },
        )
        session["audit_events"] = audit_events
        return {
            "ok": True,
            "runtime_contract_interface": RUNTIME_INTERFACE_ID,
            "runtime_kind": "virtual_computer_runtime",
            "session_id": session_id,
            "handoff_request": {
                **request,
                "approved": True,
            },
            "local_gateway_bridge": dict(bridge_policy),
        }


class ProviderTaggedVirtualComputerRuntime:
    def __init__(self, runtime: VirtualComputerRuntime, provider_spec: VirtualComputerProviderSpec) -> None:
        self._runtime = runtime
        self._provider_spec = provider_spec

    def _tag(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        response = dict(payload or {})
        response["provider_id"] = self._provider_spec.provider_id
        response["provider_label"] = self._provider_spec.label
        response["provider_kind"] = self._provider_spec.provider_kind
        response["provider_capabilities"] = dict(self._provider_spec.capabilities)
        response["provider_runtime_choices"] = list(self._provider_spec.runtime_choices)
        return response

    def _provider_payload(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        body = dict(payload or {})
        body.setdefault("runtime_provider_id", self._provider_spec.provider_id)
        return body

    async def create_session(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        return self._tag(await self._runtime.create_session(self._provider_payload(payload)))

    async def resume_session(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        return self._tag(await self._runtime.resume_session(self._provider_payload(payload)))

    async def pause_session(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        return self._tag(await self._runtime.pause_session(self._provider_payload(payload)))

    async def terminate_session(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        return self._tag(await self._runtime.terminate_session(self._provider_payload(payload)))

    async def execute_action(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        return self._tag(await self._runtime.execute_action(self._provider_payload(payload)))

    async def stream_screenshot(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        return self._tag(await self._runtime.stream_screenshot(self._provider_payload(payload)))

    async def collect_artifact(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        return self._tag(await self._runtime.collect_artifact(self._provider_payload(payload)))

    async def snapshot_session(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        return self._tag(await self._runtime.snapshot_session(self._provider_payload(payload)))

    async def export_audit_report(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        runtime_method = getattr(self._runtime, "export_audit_report", None)
        if not callable(runtime_method):
            raise RuntimeError("Audit report export is unavailable for this runtime provider.")
        return self._tag(await runtime_method(self._provider_payload(payload)))

    async def request_local_handoff(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        runtime_method = getattr(self._runtime, "request_local_handoff", None)
        if not callable(runtime_method):
            raise RuntimeError("Local gateway handoff is unavailable for this runtime provider.")
        return self._tag(await runtime_method(self._provider_payload(payload)))


class StaticVirtualComputerProviderAdapter:
    def __init__(
        self,
        provider_spec: VirtualComputerProviderSpec,
        *,
        runtime_factory: Optional[Callable[[], VirtualComputerRuntime]] = None,
    ) -> None:
        self._provider_spec = provider_spec
        self._runtime_factory = runtime_factory

    def spec(self) -> VirtualComputerProviderSpec:
        return self._provider_spec

    def build_runtime(
        self,
        *,
        fallback_runtime: Optional[VirtualComputerRuntime] = None,
    ) -> VirtualComputerRuntime:
        if self._runtime_factory is not None:
            return self._runtime_factory()
        if fallback_runtime is not None:
            return fallback_runtime
        return InMemoryVirtualComputerRuntime()


class VirtualComputerProviderRegistry:
    def __init__(self, adapters: List[VirtualComputerProviderAdapter]) -> None:
        self._adapters: List[VirtualComputerProviderAdapter] = list(adapters or [])
        self._adapters_by_id: Dict[str, VirtualComputerProviderAdapter] = {
            _token(adapter.spec().provider_id).lower(): adapter
            for adapter in self._adapters
            if _token(adapter.spec().provider_id)
        }

    def list_provider_specs(self) -> List[Dict[str, Any]]:
        return [
            {
                "provider_id": adapter.spec().provider_id,
                "label": adapter.spec().label,
                "provider_kind": adapter.spec().provider_kind,
                "runtime_choices": list(adapter.spec().runtime_choices),
                "capabilities": dict(adapter.spec().capabilities),
                "notes": adapter.spec().notes,
            }
            for adapter in self._adapters
        ]

    def provider_spec(self, provider_id: Any) -> Dict[str, Any]:
        adapter = self._adapters_by_id.get(_token(provider_id).lower())
        if adapter is None:
            raise RuntimeError(f"Unknown virtual computer provider '{provider_id}'.")
        spec = adapter.spec()
        return {
            "provider_id": spec.provider_id,
            "label": spec.label,
            "provider_kind": spec.provider_kind,
            "runtime_choices": list(spec.runtime_choices),
            "capabilities": dict(spec.capabilities),
            "notes": spec.notes,
        }

    def select_provider(
        self,
        *,
        runtime_choice: Any,
        preferred_provider_id: Any = None,
    ) -> VirtualComputerProviderAdapter:
        choice = _token(runtime_choice).lower()
        preferred = _token(preferred_provider_id).lower()
        if preferred:
            preferred_adapter = self._adapters_by_id.get(preferred)
            if preferred_adapter is not None:
                supported = {_token(item).lower() for item in preferred_adapter.spec().runtime_choices}
                if not choice or choice in supported:
                    return preferred_adapter
        for adapter in self._adapters:
            supported = {_token(item).lower() for item in adapter.spec().runtime_choices}
            if choice in supported:
                return adapter
        if self._adapters:
            return self._adapters[0]
        raise RuntimeError("No virtual computer providers are registered.")

    def build_runtime(
        self,
        *,
        runtime_choice: Any,
        preferred_provider_id: Any = None,
        fallback_runtime: Optional[VirtualComputerRuntime] = None,
    ) -> VirtualComputerRuntime:
        adapter = self.select_provider(
            runtime_choice=runtime_choice,
            preferred_provider_id=preferred_provider_id,
        )
        runtime = adapter.build_runtime(fallback_runtime=fallback_runtime)
        return ProviderTaggedVirtualComputerRuntime(runtime, adapter.spec())


def default_virtual_computer_provider_registry() -> VirtualComputerProviderRegistry:
    return VirtualComputerProviderRegistry(
        [
            StaticVirtualComputerProviderAdapter(
                VirtualComputerProviderSpec(
                    provider_id=PROVIDER_ID_BROWSERBASE,
                    label="Browserbase-style Browser Sessions",
                    provider_kind="browser_session_provider",
                    runtime_choices=[RUNTIME_CHOICE_VIRTUAL_BROWSER],
                    capabilities={
                        "browser": True,
                        "shell": False,
                        "filesystem": False,
                        "screenshot": True,
                        "persistence": True,
                        "snapshots": True,
                        "public_url": True,
                        "network_controls": True,
                        "max_runtime": "180m",
                        "cost_unit": "session_minute",
                    },
                    notes="Primary browser-session isolation profile.",
                )
            ),
            StaticVirtualComputerProviderAdapter(
                VirtualComputerProviderSpec(
                    provider_id=PROVIDER_ID_E2B,
                    label="E2B-style Code Sandboxes",
                    provider_kind="code_sandbox_provider",
                    runtime_choices=[RUNTIME_CHOICE_VIRTUAL_CODE_SANDBOX],
                    capabilities={
                        "browser": False,
                        "shell": True,
                        "filesystem": True,
                        "screenshot": False,
                        "persistence": True,
                        "snapshots": True,
                        "public_url": True,
                        "network_controls": True,
                        "max_runtime": "240m",
                        "cost_unit": "sandbox_minute",
                    },
                    notes="Primary code/data sandbox profile.",
                )
            ),
            StaticVirtualComputerProviderAdapter(
                VirtualComputerProviderSpec(
                    provider_id=PROVIDER_ID_DAYTONA,
                    label="Daytona-style Dev Environments",
                    provider_kind="snapshot_dev_environment_provider",
                    runtime_choices=[RUNTIME_CHOICE_VIRTUAL_CODE_SANDBOX, RUNTIME_CHOICE_VIRTUAL_DESKTOP],
                    capabilities={
                        "browser": False,
                        "shell": True,
                        "filesystem": True,
                        "screenshot": False,
                        "persistence": True,
                        "snapshots": True,
                        "public_url": True,
                        "network_controls": True,
                        "max_runtime": "480m",
                        "cost_unit": "workspace_hour",
                    },
                    notes="Snapshot-centric dev runtime profile.",
                )
            ),
            StaticVirtualComputerProviderAdapter(
                VirtualComputerProviderSpec(
                    provider_id=PROVIDER_ID_AWS_WORKSPACES,
                    label="AWS WorkSpaces (future)",
                    provider_kind="virtual_desktop_provider",
                    runtime_choices=[RUNTIME_CHOICE_VIRTUAL_DESKTOP],
                    capabilities={
                        "browser": True,
                        "shell": True,
                        "filesystem": True,
                        "screenshot": True,
                        "persistence": True,
                        "snapshots": False,
                        "public_url": False,
                        "network_controls": True,
                        "max_runtime": "720m",
                        "cost_unit": "desktop_hour",
                    },
                    notes="Enterprise desktop provider target for later phases.",
                )
            ),
            StaticVirtualComputerProviderAdapter(
                VirtualComputerProviderSpec(
                    provider_id=PROVIDER_ID_AZURE_VIRTUAL_DESKTOP,
                    label="Azure Virtual Desktop (future)",
                    provider_kind="virtual_desktop_provider",
                    runtime_choices=[RUNTIME_CHOICE_VIRTUAL_DESKTOP],
                    capabilities={
                        "browser": True,
                        "shell": True,
                        "filesystem": True,
                        "screenshot": True,
                        "persistence": True,
                        "snapshots": False,
                        "public_url": False,
                        "network_controls": True,
                        "max_runtime": "720m",
                        "cost_unit": "desktop_hour",
                    },
                    notes="Enterprise desktop provider target for later phases.",
                )
            ),
            StaticVirtualComputerProviderAdapter(
                VirtualComputerProviderSpec(
                    provider_id=PROVIDER_ID_DOCKER_KUBERNETES,
                    label="Self-hosted Docker/Kubernetes (future)",
                    provider_kind="self_hosted_sandbox_provider",
                    runtime_choices=[RUNTIME_CHOICE_VIRTUAL_CODE_SANDBOX],
                    capabilities={
                        "browser": False,
                        "shell": True,
                        "filesystem": True,
                        "screenshot": False,
                        "persistence": True,
                        "snapshots": True,
                        "public_url": False,
                        "network_controls": True,
                        "max_runtime": "720m",
                        "cost_unit": "cluster_minute",
                    },
                    notes="Self-hosted runtime profile for later phases.",
                )
            ),
        ]
    )


@dataclass
class VirtualComputerRuntimeRegistry:
    local_runtime: VirtualComputerRuntime
    virtual_runtime: VirtualComputerRuntime
    provider_registry: Optional[VirtualComputerProviderRegistry] = None

    def resolve(self, runtime_choice: Any, *, preferred_provider_id: Any = None) -> VirtualComputerRuntime:
        choice = _token(runtime_choice).lower()
        if choice == RUNTIME_CHOICE_LOCAL:
            return self.local_runtime
        if self.provider_registry is not None:
            return self.provider_registry.build_runtime(
                runtime_choice=runtime_choice,
                preferred_provider_id=preferred_provider_id,
                fallback_runtime=self.virtual_runtime,
            )
        return self.virtual_runtime

    def describe_provider(self, runtime_choice: Any, *, preferred_provider_id: Any = None) -> Dict[str, Any]:
        if self.provider_registry is None:
            return {}
        adapter = self.provider_registry.select_provider(
            runtime_choice=runtime_choice,
            preferred_provider_id=preferred_provider_id,
        )
        spec = adapter.spec()
        return {
            "provider_id": spec.provider_id,
            "label": spec.label,
            "provider_kind": spec.provider_kind,
            "runtime_choices": list(spec.runtime_choices),
            "capabilities": dict(spec.capabilities),
            "notes": spec.notes,
        }


def build_default_runtime_registry() -> VirtualComputerRuntimeRegistry:
    return VirtualComputerRuntimeRegistry(
        local_runtime=LocalGatewayVirtualComputerRuntime(),
        virtual_runtime=InMemoryVirtualComputerRuntime(),
        provider_registry=default_virtual_computer_provider_registry(),
    )
