"""Sage Doctor / Diagnostics service.

Checks all critical platform components and returns machine-readable
health results grouped by category.  Each check returns a dict with
id, label, status, detail, next_action, and group.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional


CHECK_GROUPS = frozenset({
    "Agent Computer",
    "Channels",
    "Providers",
    "Infrastructure",
    "Policy",
})


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _check(
    *,
    check_id: str,
    label: str,
    status: str,
    detail: str,
    next_action: str,
    group: str,
) -> Dict[str, Any]:
    assert group in CHECK_GROUPS, f"Unknown group: {group}"
    assert status in {"pass", "fail", "warn", "skip"}, f"Unknown status: {status}"
    return {
        "id": check_id,
        "label": label,
        "status": status,
        "detail": detail,
        "next_action": next_action,
        "group": group,
    }


def _summary(checks: List[Dict[str, Any]]) -> Dict[str, int]:
    counts: Dict[str, int] = {"pass": 0, "fail": 0, "warn": 0, "skip": 0}
    for c in checks:
        s = c.get("status", "skip")
        if s in counts:
            counts[s] += 1
        else:
            counts["skip"] += 1
    return counts


# ---------------------------------------------------------------------------
# Individual checks
# ---------------------------------------------------------------------------

def _check_agent_computer(
    workspace_id: str,
    tenant_id: str,
    user_id: str,
) -> Dict[str, Any]:
    """Check Agent Computer selection and online/offline status."""
    from server_modules import sage_agent_computer_selection_service

    try:
        selection = sage_agent_computer_selection_service.get_selection(
            workspace_id=workspace_id,
            user_id=user_id,
        )
    except Exception as exc:
        return _check(
            check_id="agent_computer",
            label="Agent Computer",
            status="warn",
            detail=f"Could not query Agent Computer selection: {exc}",
            next_action="Retry or check Agent Computer settings.",
            group="Agent Computer",
        )

    if not selection:
        return _check(
            check_id="agent_computer",
            label="Agent Computer",
            status="fail",
            detail="No Agent Computer device is selected for this workspace.",
            next_action="Agent Computer not selected. Go to Agent Computer settings and select a device.",
            group="Agent Computer",
        )

    selected_gateway_id = str(selection.get("selected_gateway_id") or "").strip()
    if not selected_gateway_id:
        return _check(
            check_id="agent_computer",
            label="Agent Computer",
            status="fail",
            detail="Agent Computer selection exists but has no gateway ID.",
            next_action="Select a valid Agent Computer device in settings.",
            group="Agent Computer",
        )

    # Try to determine online/offline via gateway health
    try:
        from server_modules import gateway_state_repository

        session = gateway_state_repository.get_latest_gateway_session(
            selected_gateway_id,
            include_revoked=False,
        )
        if session:
            session_status = str(session.get("status") or "").strip().lower()
            if session_status == "connected":
                return _check(
                    check_id="agent_computer",
                    label="Agent Computer",
                    status="pass",
                    detail=f"Agent Computer '{selected_gateway_id}' is online and connected.",
                    next_action="No action needed.",
                    group="Agent Computer",
                )
            elif session_status in {"disconnected", "expired"}:
                return _check(
                    check_id="agent_computer",
                    label="Agent Computer",
                    status="fail",
                    detail=f"Agent Computer '{selected_gateway_id}' is offline (session: {session_status}).",
                    next_action="Gateway is paired but offline. Check gateway power and network, or reinstall the gateway agent.",
                    group="Agent Computer",
                )
        registration = gateway_state_repository.get_gateway_registration(
            selected_gateway_id,
        )
        if registration:
            reg_status = str(registration.get("status") or "").strip().lower()
            if reg_status == "revoked":
                return _check(
                    check_id="agent_computer",
                    label="Agent Computer",
                    status="fail",
                    detail=f"Agent Computer '{selected_gateway_id}' registration was revoked.",
                    next_action="Gateway is revoked. Remove and re-pair the gateway.",
                    group="Agent Computer",
                )
            return _check(
                check_id="agent_computer",
                label="Agent Computer",
                status="warn",
                detail=f"Agent Computer '{selected_gateway_id}' is registered but no active session.",
                next_action="Check gateway power and network, or restart the gateway agent.",
                group="Agent Computer",
            )
    except Exception:
        pass

    return _check(
        check_id="agent_computer",
        label="Agent Computer",
        status="skip",
        detail=f"Agent Computer '{selected_gateway_id}' is selected but online status could not be determined.",
        next_action="Open Agent Computer settings to verify device connectivity.",
        group="Agent Computer",
    )


def _check_gateway_connection(
    workspace_id: str,
    tenant_id: str,
) -> Dict[str, Any]:
    """Check gateway registration and health."""
    from server_modules import gateway_registry_service

    try:
        registrations = gateway_registry_service.list_workspace_gateways(
            workspace_id=workspace_id,
        )
    except Exception as exc:
        return _check(
            check_id="gateway_connection",
            label="Gateway Connection",
            status="warn",
            detail=f"Could not query gateway registrations: {exc}",
            next_action="Retry or check the gateway service status.",
            group="Infrastructure",
        )

    items = registrations.get("items") if isinstance(registrations.get("items"), list) else []
    if not items:
        return _check(
            check_id="gateway_connection",
            label="Gateway Connection",
            status="fail",
            detail="No gateway registrations found for this workspace.",
            next_action="Install and pair a gateway device in workspace settings.",
            group="Infrastructure",
        )

    active = [item for item in items if str(item.get("status") or "").strip().lower() == "active"]
    if not active:
        statuses = {str(item.get("status") or "unknown").strip().lower() for item in items}
        if "revoked" in statuses:
            return _check(
                check_id="gateway_connection",
                label="Gateway Connection",
                status="fail",
                detail="All gateway registrations are revoked.",
                next_action="Gateway is revoked. Remove and re-pair the gateway.",
                group="Infrastructure",
            )
        return _check(
            check_id="gateway_connection",
            label="Gateway Connection",
            status="fail",
            detail="No active gateway registrations.",
            next_action="Check gateway power and network, or reinstall the gateway agent.",
            group="Infrastructure",
        )

    # Check if at least one active gateway has a live session
    from server_modules import gateway_state_repository

    online_count = 0
    for gw in active:
        gw_id = str(gw.get("gateway_id") or "").strip()
        if not gw_id:
            continue
        try:
            session = gateway_state_repository.get_latest_gateway_session(gw_id)
            if session and str(session.get("status") or "").strip().lower() == "connected":
                online_count += 1
        except Exception:
            continue

    if online_count > 0:
        return _check(
            check_id="gateway_connection",
            label="Gateway Connection",
            status="pass",
            detail=f"{len(active)} gateway(s) registered, {online_count} online.",
            next_action="No action needed.",
            group="Infrastructure",
        )

    return _check(
        check_id="gateway_connection",
        label="Gateway Connection",
        status="fail",
        detail=f"{len(active)} active gateway(s) found, but none have a live session.",
        next_action="Gateway is paired but offline. Check gateway power and network, or reinstall the gateway agent.",
        group="Infrastructure",
    )


def _check_browser_runtime(
    workspace_id: str,
    tenant_id: str,
) -> Dict[str, Any]:
    """Check Agent Computer browser runtime availability."""
    # Check whether the selected Agent Computer gateway has a live session.
    # The gateway session implies browser runtime availability since Agent
    # Computer is the gateway device.
    from server_modules import sage_agent_computer_selection_service
    from server_modules import gateway_state_repository

    try:
        selection = sage_agent_computer_selection_service.get_selection(
            workspace_id=workspace_id,
            user_id="default",
        )
    except Exception as exc:
        return _check(
            check_id="browser_runtime",
            label="Browser Runtime",
            status="warn",
            detail=f"Could not check Agent Computer selection: {exc}",
            next_action="Retry or check Agent Computer settings.",
            group="Agent Computer",
        )

    if not selection:
        return _check(
            check_id="browser_runtime",
            label="Browser Runtime",
            status="fail",
            detail="No Agent Computer device is selected for browser operations.",
            next_action="Agent Computer not selected. Go to Agent Computer settings and select a device.",
            group="Agent Computer",
        )

    selected_gateway_id = str(selection.get("selected_gateway_id") or "").strip()
    if not selected_gateway_id:
        return _check(
            check_id="browser_runtime",
            label="Browser Runtime",
            status="fail",
            detail="Agent Computer selection has no gateway ID.",
            next_action="Agent Computer not selected. Go to Agent Computer settings and select a device.",
            group="Agent Computer",
        )

    # Check for browser sessions on the selected gateway
    try:
        sessions = gateway_state_repository.list_gateway_browser_sessions(
            selected_gateway_id,
            limit=1,
        )
        if sessions:
            return _check(
                check_id="browser_runtime",
                label="Browser Runtime",
                status="pass",
                detail="Agent Computer browser runtime is online and available.",
                next_action="No action needed.",
                group="Agent Computer",
            )
    except Exception:
        pass

    # Check if the gateway has a live session at all
    try:
        session = gateway_state_repository.get_latest_gateway_session(
            selected_gateway_id,
        )
        if session and str(session.get("status") or "").strip().lower() == "connected":
            return _check(
                check_id="browser_runtime",
                label="Browser Runtime",
                status="pass",
                detail="Agent Computer gateway is connected; browser runtime should be available.",
                next_action="No action needed.",
                group="Agent Computer",
            )
    except Exception:
        pass

    return _check(
        check_id="browser_runtime",
        label="Browser Runtime",
        status="fail",
        detail="Agent Computer is selected but the browser/gateway runtime is offline.",
        next_action="Gateway is paired but offline. Check gateway power and network, or reinstall the gateway agent.",
        group="Agent Computer",
    )


def _check_telegram(
    workspace_id: str,
    tenant_id: str,
    user_id: str,
) -> Dict[str, Any]:
    """Check Telegram personal channel state."""
    from server_modules import personal_channels_repository

    gateway_id = _resolve_workspace_gateway_id(workspace_id)
    if not gateway_id:
        return _check(
            check_id="telegram_channel",
            label="Telegram Channel",
            status="skip",
            detail="No gateway available to check Telegram state.",
            next_action="Pair a gateway device first to enable personal channel checks.",
            group="Channels",
        )

    try:
        state = personal_channels_repository.get_telegram_state(
            gateway_id,
            channel_key="telegram_personal",
        )
    except Exception as exc:
        return _check(
            check_id="telegram_channel",
            label="Telegram Channel",
            status="warn",
            detail=f"Could not query Telegram state: {exc}",
            next_action="Retry or check gateway connectivity.",
            group="Channels",
        )

    if not state:
        return _check(
            check_id="telegram_channel",
            label="Telegram Channel",
            status="fail",
            detail="Telegram personal channel is not configured.",
            next_action="Telegram personal channel not configured. Open the channel and follow setup.",
            group="Channels",
        )

    status = str(state.get("status") or "").strip().lower()
    linked_user = bool(state.get("linked_user_id") or state.get("linked_username"))
    if status == "connected" and linked_user:
        linked_name = str(state.get("linked_name") or state.get("linked_username") or "unknown")
        return _check(
            check_id="telegram_channel",
            label="Telegram Channel",
            status="pass",
            detail=f"Telegram personal channel connected ({linked_name}).",
            next_action="No action needed.",
            group="Channels",
        )
    elif status == "connected" and not linked_user:
        return _check(
            check_id="telegram_channel",
            label="Telegram Channel",
            status="warn",
            detail="Telegram state exists but is not fully linked to a user.",
            next_action="Complete Telegram linking via the personal channel setup.",
            group="Channels",
        )
    elif status in {"error", "failed"}:
        return _check(
            check_id="telegram_channel",
            label="Telegram Channel",
            status="fail",
            detail=f"Telegram personal channel is in '{status}' state.",
            next_action="Telegram personal channel encountered an error. Reconnect in channel settings.",
            group="Channels",
        )

    return _check(
        check_id="telegram_channel",
        label="Telegram Channel",
        status="warn",
        detail=f"Telegram personal channel state: {status}.",
        next_action="Open the Telegram personal channel and follow setup to connect.",
        group="Channels",
    )


def _check_whatsapp(
    workspace_id: str,
    tenant_id: str,
    user_id: str,
) -> Dict[str, Any]:
    """Check WhatsApp personal channel state."""
    from server_modules import personal_channels_repository

    gateway_id = _resolve_workspace_gateway_id(workspace_id)
    if not gateway_id:
        return _check(
            check_id="whatsapp_channel",
            label="WhatsApp Channel",
            status="skip",
            detail="No gateway available to check WhatsApp state.",
            next_action="Pair a gateway device first to enable personal channel checks.",
            group="Channels",
        )

    try:
        state = personal_channels_repository.get_whatsapp_state(
            gateway_id,
            channel_key="whatsapp_personal",
        )
    except Exception as exc:
        return _check(
            check_id="whatsapp_channel",
            label="WhatsApp Channel",
            status="warn",
            detail=f"Could not query WhatsApp state: {exc}",
            next_action="Retry or check gateway connectivity.",
            group="Channels",
        )

    if not state:
        return _check(
            check_id="whatsapp_channel",
            label="WhatsApp Channel",
            status="fail",
            detail="WhatsApp personal channel is not configured.",
            next_action="WhatsApp personal channel not configured. Open the channel and follow setup.",
            group="Channels",
        )

    status = str(state.get("status") or "").strip().lower()
    linked = bool(state.get("linked_jid") or state.get("linked_name"))
    if status == "connected" and linked:
        linked_name = str(state.get("linked_name") or state.get("linked_jid") or "unknown")
        return _check(
            check_id="whatsapp_channel",
            label="WhatsApp Channel",
            status="pass",
            detail=f"WhatsApp personal channel connected ({linked_name}).",
            next_action="No action needed.",
            group="Channels",
        )
    elif status in {"error", "failed"}:
        return _check(
            check_id="whatsapp_channel",
            label="WhatsApp Channel",
            status="fail",
            detail=f"WhatsApp personal channel is in '{status}' state.",
            next_action="WhatsApp personal channel encountered an error. Reconnect in channel settings.",
            group="Channels",
        )

    return _check(
        check_id="whatsapp_channel",
        label="WhatsApp Channel",
        status="warn",
        detail=f"WhatsApp personal channel state: {status}.",
        next_action="Open the WhatsApp personal channel and follow setup to connect.",
        group="Channels",
    )


def _check_slack_credentials(
    workspace_id: str,
    tenant_id: str,
) -> Dict[str, Any]:
    """Check Slack OAuth credentials in vault."""
    connector_providers = {"slack"}
    return _vault_connector_check(
        connector_providers=connector_providers,
        workspace_id=workspace_id,
        display_name="Slack",
        check_id="slack_credentials",
        label="Slack OAuth Credentials",
        group="Channels",
    )


def _check_discord_credentials(
    workspace_id: str,
    tenant_id: str,
) -> Dict[str, Any]:
    """Check Discord OAuth credentials in vault."""
    connector_providers = {"discord"}
    return _vault_connector_check(
        connector_providers=connector_providers,
        workspace_id=workspace_id,
        display_name="Discord",
        check_id="discord_credentials",
        label="Discord OAuth Credentials",
        group="Channels",
    )


def _check_google_credentials(
    workspace_id: str,
    tenant_id: str,
) -> Dict[str, Any]:
    """Check Google Workspace (Gmail) credentials in vault."""
    connector_providers = {"google_workspace", "gmail", "google"}
    return _vault_connector_check(
        connector_providers=connector_providers,
        workspace_id=workspace_id,
        display_name="Google Workspace / Gmail",
        check_id="google_credentials",
        label="Google Workspace Credentials",
        group="Channels",
    )


def _vault_connector_check(
    connector_providers: set,
    workspace_id: str,
    display_name: str,
    check_id: str,
    label: str,
    group: str,
) -> Dict[str, Any]:
    """Generic check for OAuth/connector credentials in the vault."""
    from server_modules import vault_store

    try:
        vault = vault_store.load_vault()
    except Exception as exc:
        return _check(
            check_id=check_id,
            label=label,
            status="warn",
            detail=f"Could not load vault to check {display_name} credentials: {exc}",
            next_action="Verify vault integrity and restart.",
            group=group,
        )

    credentials = vault.get("credentials") if isinstance(vault.get("credentials"), list) else []
    matching = [
        entry
        for entry in credentials
        if isinstance(entry, dict)
        and str(entry.get("provider") or "").strip().lower() in connector_providers
    ]

    if not matching:
        return _check(
            check_id=check_id,
            label=label,
            status="fail",
            detail=f"{display_name} OAuth credentials not found in vault.",
            next_action=f"Connect {display_name} via OAuth.",
            group=group,
        )

    return _check(
        check_id=check_id,
        label=label,
        status="pass",
        detail=f"{display_name} OAuth credentials found in vault ({len(matching)} entry/ies).",
        next_action="No action needed.",
        group=group,
    )


def _check_mcp_registry(
    workspace_id: str,
    tenant_id: str,
) -> Dict[str, Any]:
    """Check MCP server registry for the workspace."""
    from server_modules import mcp_registry_service

    try:
        servers = mcp_registry_service.list_workspace_mcp_servers(workspace_id)
    except Exception as exc:
        return _check(
            check_id="mcp_registry",
            label="MCP Server Registry",
            status="warn",
            detail=f"Could not query MCP registry: {exc}",
            next_action="Retry or check MCP service status.",
            group="Infrastructure",
        )

    enabled_servers = [
        s for s in servers
        if isinstance(s, dict) and bool(s.get("enabled", True))
    ]
    count = len(enabled_servers)
    if count == 0:
        return _check(
            check_id="mcp_registry",
            label="MCP Server Registry",
            status="fail",
            detail="No MCP servers are registered for this workspace.",
            next_action="MCP servers registered: 0. Add an MCP server in Connections settings.",
            group="Infrastructure",
        )

    return _check(
        check_id="mcp_registry",
        label="MCP Server Registry",
        status="pass",
        detail=f"{count} MCP server(s) registered for this workspace.",
        next_action="No action needed.",
        group="Infrastructure",
    )


def _check_model_providers(
    workspace_id: str,
    tenant_id: str,
) -> Dict[str, Any]:
    """Check model provider credentials (OpenAI, Anthropic, Gemini)."""
    from server_modules import vault_helpers, vault_store
    from scripts.orion_local_worker_llm import provider_has_key

    target_providers = ["openai", "anthropic", "gemini"]
    found_providers: List[str] = []
    missing_providers: List[str] = []

    for provider_id in target_providers:
        try:
            has_key = provider_has_key(provider_id)
            if has_key:
                found_providers.append(provider_id)
                continue
        except Exception:
            pass
        # Also check vault for the provider
        try:
            vault_helpers.resolve_default_vault_credential(
                vault_store.load_vault,
                vault_store._openssl_decrypt,
                provider_id,
                workspace_id=workspace_id,
            )
            found_providers.append(provider_id)
        except Exception:
            missing_providers.append(provider_id)

    if found_providers:
        return _check(
            check_id="model_providers",
            label="Model Provider Credentials",
            status="pass",
            detail=f"Credentials found for: {', '.join(found_providers)}."
            + (f" Missing: {', '.join(missing_providers)}." if missing_providers else ""),
            next_action="No action needed." if not missing_providers
            else "Model provider credentials missing. Configure OpenAI/Anthropic/Gemini API keys in workspace settings.",
            group="Providers",
        )

    return _check(
        check_id="model_providers",
        label="Model Provider Credentials",
        status="fail",
        detail="No model provider credentials found (OpenAI, Anthropic, Gemini).",
        next_action="Model provider credentials missing. Configure OpenAI/Anthropic/Gemini API keys in workspace settings.",
        group="Providers",
    )


def _check_quota_store(
    workspace_id: str,
    tenant_id: str,
) -> Dict[str, Any]:
    """Check quota store availability."""
    from server_modules import durable_quota_store

    try:
        if durable_quota_store.use_in_memory_quota_mode():
            return _check(
                check_id="quota_store",
                label="Quota Store",
                status="warn",
                detail="Quota store is in in-memory mode (dev/test). No persistent quota DB.",
                next_action="Set EMPYRALIS_QUOTA_DB to a persistent path for production.",
                group="Infrastructure",
            )

        # Quick health check: ensure the DB path is accessible
        try:
            quota_db = durable_quota_store._db_path()
            if quota_db.parent.exists():
                return _check(
                    check_id="quota_store",
                    label="Quota Store",
                    status="pass",
                    detail=f"Quota store is active (db: {quota_db.name}).",
                    next_action="No action needed.",
                    group="Infrastructure",
                )
        except Exception:
            pass

        return _check(
            check_id="quota_store",
            label="Quota Store",
            status="pass",
            detail="Quota store is active.",
            next_action="No action needed.",
            group="Infrastructure",
        )
    except Exception as exc:
        return _check(
            check_id="quota_store",
            label="Quota Store",
            status="warn",
            detail=f"Could not query quota store: {exc}",
            next_action="Verify quota store configuration and restart.",
            group="Infrastructure",
        )


def _check_outbox_replay(
    workspace_id: str,
    tenant_id: str,
) -> Dict[str, Any]:
    """Check outbox/replay queue state."""
    from server_modules import outbox_service

    try:
        status = outbox_service.get_outbox_delivery_status()
    except Exception as exc:
        return _check(
            check_id="outbox_replay",
            label="Outbox / Replay Queue",
            status="warn",
            detail=f"Could not query outbox status: {exc}",
            next_action="Retry or check outbox service configuration.",
            group="Infrastructure",
        )

    undelivered = int(status.get("undelivered_count") or 0)
    poisoned = int(status.get("poisoned_count") or 0)
    last_error = str(status.get("last_delivery_error") or "").strip()

    if poisoned > 0:
        return _check(
            check_id="outbox_replay",
            label="Outbox / Replay Queue",
            status="fail",
            detail=f"{poisoned} poisoned event(s) in outbox. Undelivered: {undelivered}.",
            next_action=f"Check outbox for {poisoned} poisoned event(s) and resolve delivery errors: {last_error}" if last_error
            else f"Review {poisoned} poisoned outbox event(s) in the replay queue.",
            group="Infrastructure",
        )
    elif undelivered > 0:
        return _check(
            check_id="outbox_replay",
            label="Outbox / Replay Queue",
            status="warn",
            detail=f"{undelivered} undelivered event(s) in outbox.",
            next_action=f"Review {undelivered} pending outbox event(s) and check downstream connectivity.",
            group="Infrastructure",
        )

    return _check(
        check_id="outbox_replay",
        label="Outbox / Replay Queue",
        status="pass",
        detail="Outbox is empty; no pending replay events.",
        next_action="No action needed.",
        group="Infrastructure",
    )


def _check_policy_state(
    workspace_id: str,
    tenant_id: str,
) -> Dict[str, Any]:
    """Check main policy/approval state."""
    try:
        # Check that the runtime policy module initialises without error.
        from server_modules import runtime_policy
        runtime_policy._init()
        # Check tool enablement state
        try:
            runtime_policy._load_tool_state()
        except Exception:
            pass
        tool_state = getattr(runtime_policy, "TOOL_STATE", {})
        enabled_map = tool_state.get("enabled") if isinstance(tool_state.get("enabled"), dict) else {}
        blocked_count = sum(1 for v in enabled_map.values() if not v)
        total_tools = len(enabled_map) if enabled_map else 0
        action_risk = getattr(runtime_policy, "ACTION_RISK_LEVELS", None)
        if isinstance(action_risk, dict):
            sensitive = {k for k, v in action_risk.items() if str(v or "").strip().lower() in {"sensitive", "critical"}}
            critical = {k for k, v in action_risk.items() if str(v or "").strip().lower() == "critical"}
        else:
            sensitive = set()
            critical = set()
        sensitive_count = len(sensitive)
        critical_count = len(critical)
    except Exception as exc:
        return _check(
            check_id="policy_state",
            label="Approval / Policy State",
            status="warn",
            detail=f"Could not load policy state: {exc}",
            next_action="Review runtime policy configuration and restart.",
            group="Policy",
        )

    return _check(
        check_id="policy_state",
        label="Approval / Policy State",
        status="pass",
        detail=f"Policy active: {total_tools} tool(s) tracked, {blocked_count} blocked, {sensitive_count} sensitive, {critical_count} critical action(s).",
        next_action="No action needed.",
        group="Policy",
    )


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _resolve_workspace_gateway_id(workspace_id: str) -> Optional[str]:
    """Resolve the first active gateway ID for a workspace."""
    from server_modules import gateway_registry_service

    try:
        registrations = gateway_registry_service.list_workspace_gateways(
            workspace_id=workspace_id,
        )
    except Exception:
        return None

    items = registrations.get("items") if isinstance(registrations.get("items"), list) else []
    for item in items:
        if isinstance(item, dict) and str(item.get("status") or "").strip().lower() == "active":
            gw_id = str(item.get("gateway_id") or "").strip()
            if gw_id:
                return gw_id
    return None


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

class SageDoctorService:
    """Diagnostic service for checking platform component health."""

    @staticmethod
    def check_all(
        workspace_id: str,
        tenant_id: str,
        user_id: str = "default",
    ) -> Dict[str, Any]:
        """Run all checks and return grouped health results."""
        checks: List[Dict[str, Any]] = []

        checks.append(_check_agent_computer(workspace_id, tenant_id, user_id))
        checks.append(_check_gateway_connection(workspace_id, tenant_id))
        checks.append(_check_browser_runtime(workspace_id, tenant_id))
        checks.append(_check_telegram(workspace_id, tenant_id, user_id))
        checks.append(_check_whatsapp(workspace_id, tenant_id, user_id))
        checks.append(_check_slack_credentials(workspace_id, tenant_id))
        checks.append(_check_discord_credentials(workspace_id, tenant_id))
        checks.append(_check_google_credentials(workspace_id, tenant_id))
        checks.append(_check_mcp_registry(workspace_id, tenant_id))
        checks.append(_check_model_providers(workspace_id, tenant_id))
        checks.append(_check_quota_store(workspace_id, tenant_id))
        checks.append(_check_outbox_replay(workspace_id, tenant_id))
        checks.append(_check_policy_state(workspace_id, tenant_id))

        return {
            "workspace_id": workspace_id,
            "timestamp": _utc_now_iso(),
            "summary": _summary(checks),
            "checks": checks,
        }
