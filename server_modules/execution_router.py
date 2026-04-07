from __future__ import annotations

"""Authorized execution adapter for browser automation and other gated local actions."""

from typing import Any, Dict, Optional


def enforce_browser_execution_gate(
    metadata: Optional[Dict[str, Any]] = None,
    *,
    target: str = "local_companion",
) -> None:
    from server_modules.browser_engine import enforce_browser_automation_gate

    enforce_browser_automation_gate(metadata, target=target)


def get_browser_engine(
    metadata: Optional[Dict[str, Any]] = None,
    *,
    target: str = "local_companion",
) -> Any:
    from server_modules.browser_engine import BrowserEngine

    enforce_browser_execution_gate(metadata, target=target)
    return BrowserEngine()
