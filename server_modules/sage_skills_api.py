from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, Optional

from fastapi import Depends

from server_modules.auth import enforce_workspace_access, workspace_tenant_id
from server_modules.installed_skills import (
    current_device_os_label,
    list_installed_skills,
    normalize_skill_id,
    skill_availability_state,
)
from server_modules.secret_redaction_service import redact_text


@dataclass(frozen=True)
class CuratedSkillDefinition:
    id: str
    name: str
    description: str
    supported_os: tuple[str, ...]
    what_it_does: str
    setup_requirement: str
    aliases: tuple[str, ...] = ()


_CURATED_SKILL_PACK: tuple[CuratedSkillDefinition, ...] = (
    CuratedSkillDefinition(
        id="1password",
        name="1Password",
        description="Use vault items and saved credentials without pasting secrets into chat.",
        supported_os=("macos",),
        what_it_does="Look up vault items, retrieve credentials, and keep secret handling on the paired computer.",
        setup_requirement="Install and unlock 1Password on this Mac, then enable the 1Password skill for Sage through Gateway.",
        aliases=("onepassword", "1-password"),
    ),
    CuratedSkillDefinition(
        id="apple-notes",
        name="Apple Notes",
        description="Read and organize personal notes from Apple Notes on the paired Mac.",
        supported_os=("macos",),
        what_it_does="Read note content, organize personal knowledge, and use Apple Notes as a trusted local reference surface.",
        setup_requirement="Use a paired Mac with Apple Notes available through Gateway, then enable the Apple Notes skill.",
        aliases=("notes", "apple_notes"),
    ),
    CuratedSkillDefinition(
        id="apple-reminders",
        name="Apple Reminders",
        description="Review and manage reminders from Apple Reminders on the paired Mac.",
        supported_os=("macos",),
        what_it_does="Read reminder lists, keep recurring responsibilities current, and update personal tasks through Apple Reminders.",
        setup_requirement="Use a paired Mac with Apple Reminders available through Gateway, then enable the Apple Reminders skill.",
        aliases=("reminders", "apple_reminders"),
    ),
    CuratedSkillDefinition(
        id="tmux",
        name="tmux",
        description="Inspect and manage terminal sessions without losing long-running local work.",
        supported_os=("macos", "linux"),
        what_it_does="Attach to persistent shell sessions, keep long-running commands alive, and resume local terminal work safely.",
        setup_requirement="Install tmux on this computer and expose the required local runtime access before Sage can use persistent terminal sessions.",
    ),
)


def _coerce_text(value: Any) -> str:
    return str(value or "").strip()


def _safe_skill_document(value: Any) -> str | None:
    text = _coerce_text(value)
    if not text:
        return None
    return redact_text(text).strip() or None


def _skill_status(item: Dict[str, Any]) -> str:
    return skill_availability_state(item)


def _status_label(status: str) -> str:
    labels = {
        "ready": "Ready",
        "needs_setup": "Needs setup",
        "unsupported_device": "Unsupported on this device",
        "disabled_policy": "Disabled by policy",
    }
    return labels.get(status, "Needs setup")


def _skill_reason(item: Dict[str, Any]) -> str | None:
    reasons = [
        _coerce_text(token)
        for token in list(item.get("availability_reasons") or [])
        if _coerce_text(token)
    ]
    if reasons:
        return "; ".join(reasons)
    missing_bins = [
        _coerce_text(token)
        for token in list(item.get("missing_bins") or [])
        if _coerce_text(token)
    ]
    if missing_bins:
        return f"Missing runtime dependencies: {', '.join(missing_bins)}"
    if not bool(item.get("enabled")):
        return "Disabled for this workspace."
    return None


def _current_device_supports(supported_os: tuple[str, ...] | list[str]) -> bool:
    normalized = {str(token or "").strip().lower() for token in supported_os if str(token or "").strip()}
    if not normalized:
        return True
    runtime_os = current_device_os_label().strip().lower()
    aliases = {runtime_os}
    if runtime_os == "macos":
        aliases.update({"mac", "osx", "darwin"})
    elif runtime_os == "linux":
        aliases.update({"unix"})
    elif runtime_os == "windows":
        aliases.update({"win", "win32"})
    return bool(normalized.intersection(aliases))


def _skill_setup_requirement(item: Dict[str, Any], curated: CuratedSkillDefinition | None) -> str | None:
    if not bool(item.get("enabled")):
        return "Enable this skill for the workspace before Sage can use it."
    missing_bins = [
        _coerce_text(token)
        for token in list(item.get("missing_bins") or [])
        if _coerce_text(token)
    ]
    missing_env_vars = [
        _coerce_text(token)
        for token in list(item.get("missing_env_vars") or [])
        if _coerce_text(token)
    ]
    missing_packages = [
        _coerce_text(token)
        for token in list(item.get("missing_python_packages") or [])
        if _coerce_text(token)
    ]
    setup_bits: list[str] = []
    if missing_bins:
        setup_bits.append(f"Install: {', '.join(missing_bins)}")
    if missing_env_vars:
        setup_bits.append(f"Set environment variables: {', '.join(missing_env_vars)}")
    if missing_packages:
        setup_bits.append(f"Install Python packages: {', '.join(missing_packages)}")
    if setup_bits:
        return ". ".join(setup_bits) + "."
    if curated is not None:
        return curated.setup_requirement
    return None


def _curated_skill_index(item: Dict[str, Any]) -> dict[str, Dict[str, Any]]:
    aliases = {
        normalize_skill_id(item.get("id")),
        normalize_skill_id(item.get("name")),
    }
    return {token: item for token in aliases if token}


def _skill_payload(item: Dict[str, Any], curated: CuratedSkillDefinition | None = None) -> Dict[str, Any]:
    status = _skill_status(item)
    supported_os = [token for token in list(item.get("supported_os") or []) if _coerce_text(token)]
    if curated is not None and not supported_os:
        supported_os = list(curated.supported_os)
    description = _coerce_text(item.get("description")) or (curated.description if curated is not None else "")
    what_it_does = _coerce_text(item.get("what_it_does")) or (curated.what_it_does if curated is not None else description)
    runtime_metadata = item.get("runtime_metadata") if isinstance(item.get("runtime_metadata"), dict) else {}
    return {
        "id": _coerce_text(item.get("id")) or (curated.id if curated is not None else ""),
        "name": _coerce_text(item.get("name")) or (curated.name if curated is not None else "Skill"),
        "description": description or None,
        "what_it_does": what_it_does or None,
        "enabled": bool(item.get("enabled")),
        "available": bool(item.get("available")),
        "active_now": status == "ready",
        "status": status,
        "status_label": _status_label(status),
        "reason": _skill_reason(item),
        "setup_requirement": _skill_setup_requirement(item, curated),
        "source": _coerce_text(item.get("source")) or ("curated_pack" if curated is not None else None),
        "required_bins": [token for token in list(item.get("required_bins") or []) if _coerce_text(token)],
        "missing_bins": [token for token in list(item.get("missing_bins") or []) if _coerce_text(token)],
        "required_env_vars": [token for token in list(item.get("required_env_vars") or []) if _coerce_text(token)],
        "missing_env_vars": [token for token in list(item.get("missing_env_vars") or []) if _coerce_text(token)],
        "required_python_packages": [token for token in list(item.get("required_python_packages") or []) if _coerce_text(token)],
        "missing_python_packages": [token for token in list(item.get("missing_python_packages") or []) if _coerce_text(token)],
        "supported_os": supported_os,
        "tools": [token for token in list(item.get("tools") or []) if _coerce_text(token)],
        "slash_commands": [token for token in list(item.get("slash_commands") or []) if _coerce_text(token)],
        "permission_label": _coerce_text(runtime_metadata.get("permission_label")) or None,
        "action_class": _coerce_text(runtime_metadata.get("action_class")) or None,
        "requires_approval": bool(runtime_metadata.get("requires_approval")),
        "execution_mode": _coerce_text(runtime_metadata.get("execution_mode")) or None,
        "skill_body": _safe_skill_document(item.get("skill_body")),
        "readme": _safe_skill_document(item.get("readme")),
        "allowed_runtime_modes": [
            token for token in list(runtime_metadata.get("allowed_runtime_modes") or []) if _coerce_text(token)
        ],
        "curated": curated is not None,
        "curated_rank": _CURATED_SKILL_PACK.index(curated) if curated is not None else None,
    }


def register_sage_skills_routes(app) -> None:
    import server as _server

    module_globals = globals()
    for key, value in _server.__dict__.items():
        if key not in module_globals:
            module_globals[key] = value

    member_dependency = getattr(_server, "require_api_key")

    @app.get("/api/sage-skills", dependencies=[Depends(member_dependency)])
    async def list_workspace_sage_skills(
        workspace_id: Optional[str] = None,
        current_user=Depends(member_dependency),
    ):
        resolved_workspace_id = enforce_workspace_access(
            current_user,
            workspace_id,
            minimum_role="viewer",
        )
        tenant_id = workspace_tenant_id(current_user, resolved_workspace_id)
        installed = list_installed_skills(workspace_id=resolved_workspace_id)
        installed_index: dict[str, Dict[str, Any]] = {}
        consumed_ids: set[str] = set()
        for item in installed:
            installed_index.update(_curated_skill_index(item))

        items = []
        for curated in _CURATED_SKILL_PACK:
            matched = None
            for token in (curated.id, *curated.aliases):
                normalized = normalize_skill_id(token)
                if normalized and normalized in installed_index:
                    matched = installed_index[normalized]
                    break
            if matched is None:
                matched = {
                    "id": curated.id,
                    "name": curated.name,
                    "description": curated.description,
                    "enabled": True,
                    "available": False,
                    "supported_os": list(curated.supported_os),
                    "availability_reasons": [] if _current_device_supports(curated.supported_os) else [f"Only available on: {', '.join(curated.supported_os)}"],
                    "source": "curated_pack",
                    "runtime_metadata": {},
                }
            else:
                consumed_ids.add(_coerce_text(matched.get("id")))
            items.append(_skill_payload(matched, curated))

        remainder = [
            _skill_payload(item)
            for item in installed
            if _coerce_text(item.get("id")) not in consumed_ids
        ]
        remainder.sort(key=lambda item: (item.get("name") or "").lower())
        items.extend(remainder)
        return {
            "workspace_id": resolved_workspace_id,
            "tenant_id": tenant_id,
            "curated_pack": [item for item in items if item.get("curated")],
            "items": items,
            "summary": {
                "total_count": len(items),
                "ready_count": len([item for item in items if item["status"] == "ready"]),
                "needs_setup_count": len([item for item in items if item["status"] == "needs_setup"]),
                "unsupported_count": len([item for item in items if item["status"] == "unsupported_device"]),
                "disabled_count": len([item for item in items if item["status"] == "disabled_policy"]),
            },
        }
