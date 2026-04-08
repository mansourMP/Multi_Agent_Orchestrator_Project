from __future__ import annotations

import os
import sys
from pathlib import Path
from typing import Any, Dict, Optional

from server_modules import local_queue, runtime_state_store


DESKTOP_SETUP_STATE_KEY = "desktop.first_run_setup_completed"


def _runtime_state_db_path() -> Path:
    explicit = str(os.getenv("ORION_RUNTIME_STATE_DB") or "").strip()
    if explicit:
        return Path(explicit).expanduser().resolve()
    state_home = Path(
        str(os.getenv("EMPYRALIS_STATE_HOME") or (Path.home() / ".empyralis" / "state"))
    ).expanduser()
    return (state_home / "runtime" / "state.db").resolve()


def _permission_entry(status: str, *, source: str, detail: str = "") -> Dict[str, Any]:
    normalized_status = str(status or "unknown").strip().lower() or "unknown"
    return {
        "status": normalized_status,
        "source": str(source or "probe").strip() or "probe",
        "detail": str(detail or "").strip(),
    }


def _macos_screen_recording_probe() -> Optional[bool]:
    try:
        import Quartz  # type: ignore

        probe = getattr(Quartz, "CGPreflightScreenCaptureAccess", None)
        if callable(probe):
            return bool(probe())
    except Exception:
        return None
    return None


def _macos_accessibility_probe() -> Optional[bool]:
    try:
        from ApplicationServices import AXIsProcessTrusted  # type: ignore

        return bool(AXIsProcessTrusted())
    except Exception:
        try:
            import Quartz  # type: ignore

            probe = getattr(Quartz, "AXIsProcessTrusted", None)
            if callable(probe):
                return bool(probe())
        except Exception:
            return None
    return None


def _filesystem_probe() -> Dict[str, Any]:
    db_path = _runtime_state_db_path()
    probe_dir = db_path.parent / "desktop_setup_probe"
    probe_file = probe_dir / "write-test.tmp"
    try:
        probe_dir.mkdir(parents=True, exist_ok=True)
        probe_file.write_text("ok", encoding="utf-8")
        contents = probe_file.read_text(encoding="utf-8")
        probe_file.unlink(missing_ok=True)
        if contents != "ok":
            raise RuntimeError("Filesystem probe returned unexpected contents.")
        return _permission_entry(
            "granted",
            source="local_probe",
            detail=f"Writable local state directory: {probe_dir}",
        )
    except Exception as exc:
        return _permission_entry(
            "denied",
            source="local_probe",
            detail=f"Could not write local state files: {exc}",
        )


def _pick_local_machine(workspace_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
    payload = local_queue.handle_get_local_workers_status()
    items = payload.get("items") if isinstance(payload.get("items"), list) else []
    requested_workspace = str(workspace_id or "").strip() or None
    candidates: list[Dict[str, Any]] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        item_workspace = str(item.get("workspace_id") or "default").strip() or "default"
        if requested_workspace and item_workspace != requested_workspace:
            continue
        execution_targets = {
            str(target or "").strip().lower()
            for target in (item.get("execution_targets") or [])
            if str(target or "").strip()
        }
        runtime_type = str(item.get("runtime_type") or "").strip().lower()
        if runtime_type == "local_companion" or "local_companion" in execution_targets:
            candidates.append(item)
    if not candidates:
        return None
    online = [item for item in candidates if bool(item.get("online"))]
    return dict((online or candidates)[0])


def _machine_permission_entry(machine: Optional[Dict[str, Any]], key: str) -> Optional[Dict[str, Any]]:
    if not isinstance(machine, dict):
        return None
    probe = machine.get("permission_probe") if isinstance(machine.get("permission_probe"), dict) else {}
    entry = probe.get(key)
    if isinstance(entry, dict):
        return {
            "status": str(entry.get("status") or "unknown").strip().lower() or "unknown",
            "source": str(entry.get("source") or "runtime_probe").strip() or "runtime_probe",
            "detail": str(entry.get("detail") or "").strip(),
            "updated_at": str(entry.get("updated_at") or "").strip() or None,
        }
    return None


def _fallback_screen_recording_entry() -> Dict[str, Any]:
    if sys.platform == "darwin":
        probe = _macos_screen_recording_probe()
        if isinstance(probe, bool):
            return _permission_entry(
                "granted" if probe else "denied",
                source="direct_probe",
                detail="macOS screen recording permission probe.",
            )
        return _permission_entry(
            "unknown",
            source="probe_pending",
            detail="macOS screen recording permission has not been confirmed yet.",
        )
    if sys.platform.startswith("win"):
        return _permission_entry(
            "granted",
            source="os_default",
            detail="Windows desktop capture does not require a separate privacy grant for this local desktop flow.",
        )
    return _permission_entry(
        "unsupported",
        source="platform_capabilities",
        detail="Screen recording permission probing is not implemented on this platform.",
    )


def _fallback_accessibility_entry() -> Dict[str, Any]:
    if sys.platform == "darwin":
        probe = _macos_accessibility_probe()
        if isinstance(probe, bool):
            return _permission_entry(
                "granted" if probe else "denied",
                source="direct_probe",
                detail="macOS accessibility permission probe.",
            )
        return _permission_entry(
            "unknown",
            source="probe_pending",
            detail="macOS accessibility permission has not been confirmed yet.",
        )
    if sys.platform.startswith("win"):
        return _permission_entry(
            "granted",
            source="os_default",
            detail="Windows desktop automation does not require a separate accessibility privacy grant for this local flow.",
        )
    return _permission_entry(
        "unsupported",
        source="platform_capabilities",
        detail="Accessibility permission probing is not implemented on this platform.",
    )


def desktop_setup_completed(*, db_path: Optional[Path] = None) -> bool:
    target = Path(db_path or _runtime_state_db_path()).expanduser().resolve()
    runtime_state_store.init_runtime_state_db(target)
    record = runtime_state_store.get_local_app_state(target, DESKTOP_SETUP_STATE_KEY)
    payload = record.get("value") if isinstance(record, dict) else None
    return bool(payload is True or (isinstance(payload, dict) and payload.get("completed") is True))


def mark_desktop_setup_completed(
    *,
    db_path: Optional[Path] = None,
    completed: bool = True,
    metadata: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    target = Path(db_path or _runtime_state_db_path()).expanduser().resolve()
    runtime_state_store.init_runtime_state_db(target)
    payload = {
        "completed": bool(completed),
        "metadata": dict(metadata or {}),
    }
    return runtime_state_store.put_local_app_state(target, DESKTOP_SETUP_STATE_KEY, payload)


def desktop_setup_status(*, workspace_id: Optional[str] = None) -> Dict[str, Any]:
    machine = _pick_local_machine(workspace_id)
    screen_entry = _machine_permission_entry(machine, "screen_recording") or _fallback_screen_recording_entry()
    accessibility_entry = _machine_permission_entry(machine, "accessibility") or _fallback_accessibility_entry()
    filesystem_entry = _filesystem_probe()
    checks = [
        {
            "id": "screen_recording",
            "label": "Screen recording",
            **screen_entry,
            "settings_target": "screen_recording",
        },
        {
            "id": "accessibility",
            "label": "Accessibility",
            **accessibility_entry,
            "settings_target": "accessibility",
        },
        {
            "id": "filesystem",
            "label": "File system access",
            **filesystem_entry,
            "settings_target": None,
        },
    ]
    all_granted = all(str(item.get("status") or "").strip().lower() == "granted" for item in checks)
    return {
        "ok": True,
        "platform": sys.platform,
        "desktop_setup_completed": desktop_setup_completed(),
        "can_continue": all_granted,
        "checks": checks,
        "machine": {
            "machine_id": str((machine or {}).get("machine_id") or "").strip() or None,
            "display_name": str((machine or {}).get("display_name") or "").strip() or None,
            "online": bool((machine or {}).get("online")),
            "runtime_type": str((machine or {}).get("runtime_type") or "").strip() or None,
            "enrollment_state": str((machine or {}).get("enrollment_state") or "").strip() or None,
            "last_seen_at": (machine or {}).get("last_seen_at"),
        },
        "missing_ids": [
            str(item.get("id") or "").strip()
            for item in checks
            if str(item.get("status") or "").strip().lower() != "granted"
        ],
    }
