from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List, Literal, Optional


RiskLevel = Literal["low", "medium", "high", "critical"]


@dataclass(frozen=True, slots=True)
class CapabilityContract:
    capability_id: str
    display_name: str
    risk_level: RiskLevel
    requires_approval: bool
    reversible: bool
    required_os_permissions: List[str]
    allowed_environments: List[str]
    artifact_outputs: List[str]


def _contract(
    capability_id: str,
    display_name: str,
    *,
    risk_level: RiskLevel,
    requires_approval: bool,
    reversible: bool,
    required_os_permissions: List[str],
    allowed_environments: List[str],
    artifact_outputs: List[str],
) -> CapabilityContract:
    return CapabilityContract(
        capability_id=capability_id,
        display_name=display_name,
        risk_level=risk_level,
        requires_approval=requires_approval,
        reversible=reversible,
        required_os_permissions=list(required_os_permissions),
        allowed_environments=list(allowed_environments),
        artifact_outputs=list(artifact_outputs),
    )


CAPABILITY_REGISTRY: Dict[str, CapabilityContract] = {
    "screenshot.capture": _contract(
        "screenshot.capture",
        "Capture Screenshot",
        risk_level="medium",
        requires_approval=True,
        reversible=True,
        required_os_permissions=["screen_recording"],
        allowed_environments=["local_companion"],
        artifact_outputs=["image/png"],
    ),
    "computer_control.ocr": _contract(
        "computer_control.ocr",
        "Read Screen Text",
        risk_level="critical",
        requires_approval=True,
        reversible=True,
        required_os_permissions=["screen_recording"],
        allowed_environments=["local_companion"],
        artifact_outputs=["text/plain"],
    ),
    "computer_control.click": _contract(
        "computer_control.click",
        "Click Screen",
        risk_level="critical",
        requires_approval=True,
        reversible=True,
        required_os_permissions=["accessibility"],
        allowed_environments=["local_companion"],
        artifact_outputs=[],
    ),
    "computer_control.type": _contract(
        "computer_control.type",
        "Type Into App",
        risk_level="critical",
        requires_approval=True,
        reversible=True,
        required_os_permissions=["accessibility"],
        allowed_environments=["local_companion"],
        artifact_outputs=[],
    ),
    "computer_control.clipboard_read": _contract(
        "computer_control.clipboard_read",
        "Read Clipboard",
        risk_level="critical",
        requires_approval=True,
        reversible=True,
        required_os_permissions=["clipboard"],
        allowed_environments=["local_companion"],
        artifact_outputs=["text/plain"],
    ),
    "computer_control.clipboard_write": _contract(
        "computer_control.clipboard_write",
        "Write Clipboard",
        risk_level="critical",
        requires_approval=True,
        reversible=True,
        required_os_permissions=["clipboard"],
        allowed_environments=["local_companion"],
        artifact_outputs=[],
    ),
    "computer_control.launch_app": _contract(
        "computer_control.launch_app",
        "Launch Application",
        risk_level="critical",
        requires_approval=True,
        reversible=True,
        required_os_permissions=["accessibility"],
        allowed_environments=["local_companion"],
        artifact_outputs=[],
    ),
    "computer_control.notify": _contract(
        "computer_control.notify",
        "Show Notification",
        risk_level="critical",
        requires_approval=True,
        reversible=True,
        required_os_permissions=["notifications"],
        allowed_environments=["local_companion"],
        artifact_outputs=[],
    ),
    "computer_control.list_apps": _contract(
        "computer_control.list_apps",
        "List Running Apps",
        risk_level="critical",
        requires_approval=True,
        reversible=True,
        required_os_permissions=["accessibility"],
        allowed_environments=["local_companion"],
        artifact_outputs=["application/json"],
    ),
    "computer_control.applescript": _contract(
        "computer_control.applescript",
        "Run AppleScript",
        risk_level="critical",
        requires_approval=True,
        reversible=False,
        required_os_permissions=["automation"],
        allowed_environments=["local_companion"],
        artifact_outputs=["text/plain"],
    ),
    "computer_control.speak": _contract(
        "computer_control.speak",
        "Speak Text",
        risk_level="critical",
        requires_approval=True,
        reversible=True,
        required_os_permissions=["audio_output"],
        allowed_environments=["local_companion"],
        artifact_outputs=[],
    ),
    "browser_automation.interactive": _contract(
        "browser_automation.interactive",
        "Interactive Browser Automation",
        risk_level="medium",
        requires_approval=False,
        reversible=True,
        required_os_permissions=[],
        allowed_environments=["local_companion", "hosted"],
        artifact_outputs=["text/html", "image/png", "application/json"],
    ),
    "shell.execute": _contract(
        "shell.execute",
        "Execute Shell Command",
        risk_level="critical",
        requires_approval=True,
        reversible=False,
        required_os_permissions=["filesystem", "process_execution"],
        allowed_environments=["local_companion"],
        artifact_outputs=["text/plain", "application/json"],
    ),
    "filesystem.write": _contract(
        "filesystem.write",
        "Write File",
        risk_level="medium",
        requires_approval=True,
        reversible=True,
        required_os_permissions=["filesystem"],
        allowed_environments=["local_companion"],
        artifact_outputs=["text/plain"],
    ),
    "filesystem.read": _contract(
        "filesystem.read",
        "Read File",
        risk_level="medium",
        requires_approval=True,
        reversible=True,
        required_os_permissions=["filesystem"],
        allowed_environments=["local_companion"],
        artifact_outputs=["text/plain"],
    ),
    "filesystem.read_write": _contract(
        "filesystem.read_write",
        "Read Or Write Files",
        risk_level="medium",
        requires_approval=True,
        reversible=True,
        required_os_permissions=["filesystem"],
        allowed_environments=["local_companion"],
        artifact_outputs=["text/plain"],
    ),
    # Compatibility tool ids retained as aliases so existing runtime paths can
    # resolve through the canonical registry during migration.
    "computer_control": _contract(
        "computer_control",
        "Computer Control",
        risk_level="critical",
        requires_approval=True,
        reversible=True,
        required_os_permissions=["accessibility", "screen_recording", "clipboard"],
        allowed_environments=["local_companion"],
        artifact_outputs=["image/png", "text/plain", "application/json"],
    ),
}


_CAPABILITY_ALIASES: Dict[str, str] = {
    "read_write_files": "filesystem.read_write",
    "capture_screenshot": "screenshot.capture",
    "browser_automation": "browser_automation.interactive",
    "execute_shell_command": "shell.execute",
    "browser.interactive": "browser_automation.interactive",
}


def resolve_capability(capability_id: str) -> Optional[CapabilityContract]:
    token = str(capability_id or "").strip().lower()
    if not token:
        return None
    canonical = _CAPABILITY_ALIASES.get(token, token)
    return CAPABILITY_REGISTRY.get(canonical)
