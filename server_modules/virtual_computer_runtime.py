from __future__ import annotations

import ipaddress
import time
import uuid
from dataclasses import dataclass
from typing import Any, Callable, Dict, List, Optional, Protocol
from urllib.parse import urlparse

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


def _assert_action_allowed(
    *,
    action: Any,
    action_args: Dict[str, Any],
    profile: VirtualComputerIsolationProfile,
) -> None:
    action_token = _token(action).lower()
    if profile.kill_switch_enabled and action_token == "kill_switch":
        return
    if not profile.clipboard_enabled and "clipboard" in action_token:
        raise RuntimeError("Clipboard is disabled by isolation profile.")
    if not profile.file_transfer_enabled and action_token in {"upload_files", "download_file"}:
        raise RuntimeError("File upload/download is disabled by isolation profile.")
    if action_token in {"navigate", "open_url", "download_file"}:
        _assert_url_allowed(action_args.get("url"), profile)


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
        principal_id=principal_id,
    )


def _identity_payload(identity: VirtualComputerIdentityContext) -> Dict[str, Any]:
    return {
        "identity_class": identity.identity_class,
        "login_state": identity.login_state,
        "cookie_reuse_allowed": bool(identity.cookie_reuse_allowed),
        "credential_grant_id": identity.credential_grant_id,
        "principal_id": identity.principal_id,
    }


def build_cost_quota_profile(payload: Dict[str, Any], *, provider_id: Any = None) -> VirtualComputerCostQuotaProfile:
    source = payload.get("cost_quota") if isinstance(payload.get("cost_quota"), dict) else {}
    provider_token = _token(provider_id or payload.get("runtime_provider_id") or payload.get("virtual_provider_id"))
    default_cost_unit = "session_minute" if provider_token == PROVIDER_ID_BROWSERBASE else "runtime_unit"
    return VirtualComputerCostQuotaProfile(
        cost_unit=_token(source.get("cost_unit")) or default_cost_unit,
        per_session_cost_limit=float(source.get("per_session_cost_limit") or 120.0),
        workspace_budget_limit=float(source.get("workspace_budget_limit") or 1000.0),
        provider_concurrency_limit=_coerce_positive_int(source.get("provider_concurrency_limit"), 4, 1),
        idle_timeout_seconds=_coerce_positive_int(source.get("idle_timeout_seconds"), 10 * 60, 60),
        estimated_create_cost=float(source.get("estimated_create_cost") or 1.0),
        estimated_action_cost=float(source.get("estimated_action_cost") or 1.0),
    )


def _cost_quota_payload(profile: VirtualComputerCostQuotaProfile) -> Dict[str, Any]:
    return {
        "cost_unit": profile.cost_unit,
        "per_session_cost_limit": float(profile.per_session_cost_limit),
        "workspace_budget_limit": float(profile.workspace_budget_limit),
        "provider_concurrency_limit": int(profile.provider_concurrency_limit),
        "idle_timeout_seconds": int(profile.idle_timeout_seconds),
        "estimated_create_cost": float(profile.estimated_create_cost),
        "estimated_action_cost": float(profile.estimated_action_cost),
    }


def _cost_usage_payload(state: VirtualComputerCostQuotaState) -> Dict[str, Any]:
    return {
        "provider_id": state.provider_id,
        "workspace_id": state.workspace_id,
        "estimated_cost": float(state.estimated_cost),
        "last_activity_epoch": float(state.last_activity_epoch),
        "quota_terminated": bool(state.quota_terminated),
        "termination_reason": state.termination_reason,
    }


def _assert_cost_quota_active(state: VirtualComputerCostQuotaState) -> None:
    now_epoch = time.time()
    if state.quota_terminated:
        detail = _token(state.termination_reason) or "quota_terminated"
        raise RuntimeError(f"Session terminated by cost/quota guardrail: {detail}.")
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
    if float(state.estimated_cost) > float(state.profile.per_session_cost_limit):
        state.quota_terminated = True
        state.termination_reason = "per_session_cost_limit"
        raise RuntimeError("Session terminated by per-session cost limit.")


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
    principal_id: Optional[str] = None


@dataclass
class VirtualComputerCostQuotaProfile:
    cost_unit: str
    per_session_cost_limit: float
    workspace_budget_limit: float
    provider_concurrency_limit: int
    idle_timeout_seconds: int
    estimated_create_cost: float
    estimated_action_cost: float


@dataclass
class VirtualComputerCostQuotaState:
    profile: VirtualComputerCostQuotaProfile
    provider_id: str
    workspace_id: str
    estimated_cost: float
    last_activity_epoch: float
    quota_terminated: bool = False
    termination_reason: str = ""


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
    def __init__(self, runtime: GatewayBrowserRuntime | None = None) -> None:
        self._runtime = runtime or GatewayBrowserRuntime()
        self._isolation_by_session: Dict[str, VirtualComputerIsolationState] = {}
        self._identity_by_session: Dict[str, VirtualComputerIdentityContext] = {}
        self._cost_by_session: Dict[str, VirtualComputerCostQuotaState] = {}

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
        }

    def _active_provider_count(self, provider_id: str) -> int:
        return sum(
            1
            for state in self._cost_by_session.values()
            if state.provider_id == provider_id and not state.quota_terminated
        )

    def _workspace_estimated_cost(self, workspace_id: str) -> float:
        return sum(
            float(state.estimated_cost)
            for state in self._cost_by_session.values()
            if state.workspace_id == workspace_id and not state.quota_terminated
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
        identity_context = _build_identity_context(body, runtime_choice=runtime_choice)
        provider_id = _token(body.get("runtime_provider_id") or body.get("provider_id")) or "local_gateway"
        workspace_id = _token(body.get("workspace_id")) or "default"
        cost_profile = build_cost_quota_profile(body, provider_id=provider_id)
        if self._active_provider_count(provider_id) >= int(cost_profile.provider_concurrency_limit):
            raise RuntimeError("Provider concurrency quota exceeded for virtual computer runtime.")
        if self._workspace_estimated_cost(workspace_id) + float(cost_profile.estimated_create_cost) > float(cost_profile.workspace_budget_limit):
            raise RuntimeError("Workspace virtual computer budget quota exceeded.")
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
        self._cost_by_session[session_id] = VirtualComputerCostQuotaState(
            profile=cost_profile,
            provider_id=provider_id,
            workspace_id=workspace_id,
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
        cost_state = self._cost_by_session.get(session_id)
        if cost_state is not None:
            _assert_cost_quota_active(cost_state)
        return self._response(await self._runtime.resume_session(body))

    async def pause_session(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        body = self._normalize_gateway_session_body(dict(payload or {}))
        session_id = _token(body.get("browser_session_id") or body.get("session_id"))
        isolation = self._isolation_by_session.get(session_id)
        if isolation is not None:
            _assert_session_active(isolation)
        cost_state = self._cost_by_session.get(session_id)
        if cost_state is not None:
            _assert_cost_quota_active(cost_state)
        return self._response(await self._runtime.takeover(body))

    async def terminate_session(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        body = self._normalize_gateway_session_body(dict(payload or {}))
        session_id = _token(body.get("browser_session_id") or body.get("session_id"))
        isolation = self._isolation_by_session.get(session_id)
        if isolation is not None:
            isolation.terminated = True
            isolation.termination_reason = "terminate_session"
        self._identity_by_session.pop(session_id, None)
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
        action = _token(body.get("action"))
        action_args = dict(body.get("action_args") or {})
        isolation = self._isolation_by_session.get(session_id)
        if isolation is not None:
            _assert_session_active(isolation)
            _assert_action_allowed(action=action, action_args=action_args, profile=isolation.profile)
            if isolation.profile.kill_switch_enabled and action.lower() == "kill_switch":
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
        cost_state = self._cost_by_session.get(session_id)
        if cost_state is not None:
            _assert_cost_quota_active(cost_state)
            _charge_cost_quota(cost_state, cost_state.profile.estimated_action_cost)
        return self._response(await self._runtime.perform_action(body))

    async def stream_screenshot(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        body = self._normalize_gateway_session_body(dict(payload or {}))
        session_id = _token(body.get("browser_session_id") or body.get("session_id"))
        isolation = self._isolation_by_session.get(session_id)
        if isolation is not None:
            _assert_session_active(isolation)
        cost_state = self._cost_by_session.get(session_id)
        if cost_state is not None:
            _assert_cost_quota_active(cost_state)
            _charge_cost_quota(cost_state, cost_state.profile.estimated_action_cost)
        body["action"] = "screenshot"
        body["action_args"] = dict(body.get("action_args") or {})
        return self._response(await self._runtime.perform_action(body))

    async def collect_artifact(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        artifact = payload.get("artifact") if isinstance(payload.get("artifact"), dict) else {}
        session_id = _token(payload.get("browser_session_id") or payload.get("session_id"))
        isolation = self._isolation_by_session.get(session_id)
        if isolation is not None:
            _assert_session_active(isolation)
            if not isolation.profile.file_transfer_enabled:
                raise RuntimeError("Artifact export is disabled by isolation profile.")
        cost_state = self._cost_by_session.get(session_id)
        if cost_state is not None:
            _assert_cost_quota_active(cost_state)
        return {
            "ok": True,
            "artifact": artifact,
            "runtime_contract_interface": RUNTIME_INTERFACE_ID,
            "runtime_kind": "local_gateway_runtime",
        }

    async def snapshot_session(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        body = self._normalize_gateway_session_body(dict(payload or {}))
        session_id = _token(body.get("browser_session_id") or body.get("session_id"))
        isolation = self._isolation_by_session.get(session_id)
        if isolation is not None:
            _assert_session_active(isolation)
        cost_state = self._cost_by_session.get(session_id)
        if cost_state is not None:
            _assert_cost_quota_active(cost_state)
        body["action"] = "observe"
        body["action_args"] = dict(body.get("action_args") or {})
        observed = self._response(await self._runtime.perform_action(body))
        return {
            "runtime_contract_interface": RUNTIME_INTERFACE_ID,
            "runtime_kind": "local_gateway_runtime",
            "session_id": observed.get("session_id"),
            "state": observed.get("state"),
            "snapshot": observed.get("snapshot") or {},
            "checkpoint": observed.get("checkpoint") or {},
        }


class InMemoryVirtualComputerRuntime:
    def __init__(self) -> None:
        self._sessions: Dict[str, Dict[str, Any]] = {}
        self._isolation_by_session: Dict[str, VirtualComputerIsolationState] = {}
        self._identity_by_session: Dict[str, VirtualComputerIdentityContext] = {}
        self._cost_by_session: Dict[str, VirtualComputerCostQuotaState] = {}

    def _session(self, session_id: str) -> Dict[str, Any]:
        token = _token(session_id)
        session = self._sessions.get(token)
        if session is None:
            raise RuntimeError("Virtual computer session was not found.")
        return session

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
        }

    def _active_provider_count(self, provider_id: str) -> int:
        return sum(
            1
            for state in self._cost_by_session.values()
            if state.provider_id == provider_id and not state.quota_terminated
        )

    def _workspace_estimated_cost(self, workspace_id: str) -> float:
        return sum(
            float(state.estimated_cost)
            for state in self._cost_by_session.values()
            if state.workspace_id == workspace_id and not state.quota_terminated
        )

    async def create_session(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        body = dict(payload or {})
        runtime_choice = _token(body.get("runtime_choice")) or RUNTIME_CHOICE_VIRTUAL_BROWSER
        isolation_profile = build_isolation_profile(body, runtime_choice=runtime_choice)
        identity_context = _build_identity_context(body, runtime_choice=runtime_choice)
        provider_id = _token(body.get("runtime_provider_id") or body.get("provider_id")) or "in_memory"
        workspace_id = _token(body.get("workspace_id")) or "default"
        cost_profile = build_cost_quota_profile(body, provider_id=provider_id)
        if self._active_provider_count(provider_id) >= int(cost_profile.provider_concurrency_limit):
            raise RuntimeError("Provider concurrency quota exceeded for virtual computer runtime.")
        if self._workspace_estimated_cost(workspace_id) + float(cost_profile.estimated_create_cost) > float(cost_profile.workspace_budget_limit):
            raise RuntimeError("Workspace virtual computer budget quota exceeded.")
        session_id = _token(body.get("session_id")) or f"vcsess_{uuid.uuid4().hex}"
        session = {
            "session_id": session_id,
            "state": RUNTIME_STATE_RUNNING,
            "runtime_choice": runtime_choice,
            "actions": [],
            "artifacts": [],
            "snapshot": {},
            "filesystem_used_bytes": 0,
        }
        self._sessions[session_id] = session
        now_epoch = time.time()
        self._isolation_by_session[session_id] = VirtualComputerIsolationState(
            profile=isolation_profile,
            created_at_epoch=now_epoch,
            expires_at_epoch=now_epoch + float(isolation_profile.runtime_ttl_seconds),
        )
        self._identity_by_session[session_id] = identity_context
        self._cost_by_session[session_id] = VirtualComputerCostQuotaState(
            profile=cost_profile,
            provider_id=provider_id,
            workspace_id=workspace_id,
            estimated_cost=float(cost_profile.estimated_create_cost),
            last_activity_epoch=now_epoch,
        )
        response = self._base_response(session)
        response["status"] = "started"
        return response

    async def resume_session(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        session_id = _token(payload.get("session_id"))
        session = self._session(session_id)
        isolation = self._isolation_by_session.get(session_id)
        if isolation is not None:
            _assert_session_active(isolation)
            isolation.expires_at_epoch = time.time() + float(isolation.profile.runtime_ttl_seconds)
        cost_state = self._cost_by_session.get(session_id)
        if cost_state is not None:
            _assert_cost_quota_active(cost_state)
        session["state"] = RUNTIME_STATE_RUNNING
        response = self._base_response(session)
        response["status"] = "resumed"
        return response

    async def pause_session(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        session_id = _token(payload.get("session_id"))
        session = self._session(session_id)
        isolation = self._isolation_by_session.get(session_id)
        if isolation is not None:
            _assert_session_active(isolation)
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
        isolation = self._isolation_by_session.get(session_id)
        if isolation is not None:
            isolation.terminated = True
            isolation.termination_reason = "terminate_session"
        self._identity_by_session.pop(session_id, None)
        cost_state = self._cost_by_session.get(session_id)
        if cost_state is not None:
            cost_state.quota_terminated = True
            cost_state.termination_reason = "terminate_session"
        session["state"] = RUNTIME_STATE_TERMINATED
        response = self._base_response(session)
        response["status"] = "terminated"
        return response

    async def execute_action(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        session_id = _token(payload.get("session_id"))
        session = self._session(session_id)
        isolation = self._isolation_by_session.get(session_id)
        action = _token(payload.get("action")) or "unknown"
        action_args = dict(payload.get("action_args") or {})
        if isolation is not None:
            _assert_session_active(isolation)
            _assert_action_allowed(action=action, action_args=action_args, profile=isolation.profile)
            if isolation.profile.kill_switch_enabled and _token(action).lower() == "kill_switch":
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
        cost_state = self._cost_by_session.get(session_id)
        if cost_state is not None:
            _assert_cost_quota_active(cost_state)
            _charge_cost_quota(cost_state, cost_state.profile.estimated_action_cost)
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
        session["state"] = RUNTIME_STATE_RUNNING
        response = self._base_response(session)
        response["status"] = "completed"
        response["action_result"] = {"ok": True, "action": action}
        return response

    async def stream_screenshot(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        session_id = _token(payload.get("session_id"))
        session = self._session(session_id)
        isolation = self._isolation_by_session.get(session_id)
        if isolation is not None:
            _assert_session_active(isolation)
        cost_state = self._cost_by_session.get(session_id)
        if cost_state is not None:
            _assert_cost_quota_active(cost_state)
            _charge_cost_quota(cost_state, cost_state.profile.estimated_action_cost)
        artifacts = session.get("artifacts") if isinstance(session.get("artifacts"), list) else []
        artifact_id = f"artifact_{uuid.uuid4().hex[:12]}"
        artifact = {"artifact_id": artifact_id, "type": "screenshot", "path": f"/virtual/{artifact_id}.png"}
        artifacts.append(artifact)
        session["artifacts"] = artifacts
        response = self._base_response(session)
        response["status"] = "streaming"
        response["artifact"] = artifact
        return response

    async def collect_artifact(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        session_id = _token(payload.get("session_id"))
        session = self._session(session_id)
        isolation = self._isolation_by_session.get(session_id)
        if isolation is not None:
            _assert_session_active(isolation)
            if not isolation.profile.file_transfer_enabled:
                raise RuntimeError("Artifact export is disabled by isolation profile.")
        cost_state = self._cost_by_session.get(session_id)
        if cost_state is not None:
            _assert_cost_quota_active(cost_state)
        artifact_id = _token(payload.get("artifact_id"))
        artifacts = session.get("artifacts") if isinstance(session.get("artifacts"), list) else []
        artifact = next((item for item in artifacts if _token(item.get("artifact_id")) == artifact_id), None)
        if artifact is None:
            raise RuntimeError("Artifact was not found for this session.")
        response = self._base_response(session)
        response["status"] = "collected"
        response["artifact"] = dict(artifact)
        return response

    async def snapshot_session(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        session_id = _token(payload.get("session_id"))
        session = self._session(session_id)
        isolation = self._isolation_by_session.get(session_id)
        if isolation is not None:
            _assert_session_active(isolation)
        cost_state = self._cost_by_session.get(session_id)
        if cost_state is not None:
            _assert_cost_quota_active(cost_state)
        snapshot = {
            "state": session.get("state"),
            "actions_count": len(session.get("actions") if isinstance(session.get("actions"), list) else []),
            "artifacts_count": len(session.get("artifacts") if isinstance(session.get("artifacts"), list) else []),
            "filesystem_used_bytes": int(session.get("filesystem_used_bytes") or 0),
        }
        session["snapshot"] = snapshot
        response = self._base_response(session)
        response["status"] = "snapshotted"
        response["snapshot"] = snapshot
        return response


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
