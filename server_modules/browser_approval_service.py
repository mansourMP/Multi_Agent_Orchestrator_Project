from __future__ import annotations

from typing import Any, Callable, Dict, Iterable, List, Optional


def browser_policy_session_profiles(browser_policy: Any) -> List[str]:
    if not isinstance(browser_policy, dict):
        return []
    profiles = browser_policy.get("session_profiles")
    if not isinstance(profiles, list):
        return []
    return [str(item or "").strip() for item in profiles if str(item or "").strip()]


def browser_policy_session_profile(browser_policy: Any) -> Optional[str]:
    profiles = browser_policy_session_profiles(browser_policy)
    return profiles[0] if profiles else None


def browser_policy_metadata_overrides(
    browser_policy: Any,
    *,
    session_profile: str = "",
    interactive_actions: Optional[Iterable[str]] = None,
) -> Dict[str, Any]:
    policy = browser_policy if isinstance(browser_policy, dict) else {}
    resolved_session_profile = str(session_profile or "").strip() or browser_policy_session_profile(policy)
    immutable_plan_hash = str(policy.get("immutable_plan_hash") or "").strip()
    normalized_interactive_actions = [
        str(item or "").strip().lower()
        for item in (interactive_actions or [])
        if str(item or "").strip()
    ]
    payload: Dict[str, Any] = {
        "browser_reviewed_approval_required": bool(policy.get("reviewed_approval_required")),
    }
    if resolved_session_profile:
        payload["browser_session_profile"] = resolved_session_profile
    if normalized_interactive_actions:
        payload["browser_interactive_actions"] = normalized_interactive_actions
    if immutable_plan_hash:
        payload["browser_immutable_plan_hash"] = immutable_plan_hash
    return payload


def apply_browser_policy_metadata(metadata: Dict[str, Any], browser_policy: Any) -> None:
    if not isinstance(metadata, dict):
        return
    overrides = browser_policy_metadata_overrides(browser_policy)
    session_profile = overrides.get("browser_session_profile")
    immutable_plan_hash = overrides.get("browser_immutable_plan_hash")
    reviewed_required = bool(overrides.get("browser_reviewed_approval_required"))
    if session_profile:
        metadata["browser_session_profile"] = session_profile
    if immutable_plan_hash:
        metadata["browser_immutable_plan_hash"] = immutable_plan_hash
    if reviewed_required:
        metadata["browser_reviewed_approval_required"] = True
    else:
        metadata.pop("browser_reviewed_approval_required", None)


def prepare_browser_local_tool_context(
    config: Dict[str, Any],
    permissions: Dict[str, Any],
    *,
    normalize_action_id_fn: Callable[[Any], str],
    browser_auth_actions: Iterable[str],
    browser_automation_policy_from_operations_fn: Callable[[List[Dict[str, Any]]], Dict[str, Any]],
) -> Dict[str, Any]:
    browser_permissions = permissions.get("browser_permissions") if isinstance(permissions.get("browser_permissions"), dict) else {}
    browser_actions = config.get("browser_actions") if isinstance(config.get("browser_actions"), list) else None
    session_profile = str(config.get("session_profile") or "").strip()
    if (session_profile or browser_actions) and not bool(browser_permissions.get("allow")):
        raise RuntimeError("Browser tool nodes with session_profile or browser_actions require browser_permissions.allow = true.")
    normalized_browser_actions = [
        normalize_action_id_fn(item.get("action"))
        for item in (browser_actions or [])
        if isinstance(item, dict) and normalize_action_id_fn(item.get("action"))
    ]
    interactive_actions = [
        action for action in normalized_browser_actions if action in set(str(item).strip().lower() for item in browser_auth_actions)
    ]
    browser_policy = browser_automation_policy_from_operations_fn(
        [
            {
                "tool": "browser_automation.interactive",
                "mode": str(config.get("mode") or "extract_text").strip() or "extract_text",
                "url": str(config.get("url") or "").strip(),
                "session_profile": session_profile,
                "browser_actions": browser_actions or [],
            }
        ]
    )
    metadata_overrides = browser_policy_metadata_overrides(
        browser_policy,
        session_profile=session_profile,
        interactive_actions=interactive_actions,
    )
    return {
        "browser_permissions": browser_permissions if isinstance(browser_permissions, dict) else {"allow": False},
        "browser_actions": browser_actions,
        "session_profile": session_profile or None,
        "interactive_actions": interactive_actions,
        "browser_policy": browser_policy,
        "metadata_overrides": metadata_overrides,
    }
