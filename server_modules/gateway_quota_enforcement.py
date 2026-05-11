from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Any, Dict


GATEWAY_TOOL_EXECUTION = "gateway_tool_execution"
GATEWAY_BROWSER_SESSION = "gateway_browser_session"
GATEWAY_APPROVAL_ACTION = "gateway_approval_action"
GATEWAY_WS_CONNECTION = "gateway_ws_connection"
GATEWAY_CHANNEL_OUTBOUND = "gateway_channel_outbound"


@dataclass
class QuotaWindow:
    max_requests: int
    window_seconds: int
    counters: Dict[str, list[float]] = field(default_factory=dict)

    def allow(self, key: str) -> bool:
        now = time.monotonic()
        window_start = now - self.window_seconds
        timestamps = self.counters.get(key, [])
        timestamps = [t for t in timestamps if t > window_start]
        if len(timestamps) >= self.max_requests:
            self.counters[key] = timestamps
            return False
        timestamps.append(now)
        self.counters[key] = timestamps
        return True

    def remaining(self, key: str) -> int:
        now = time.monotonic()
        window_start = now - self.window_seconds
        timestamps = [t for t in self.counters.get(key, []) if t > window_start]
        return max(0, self.max_requests - len(timestamps))


_GATEWAY_QUOTA_PROFILES: Dict[str, QuotaWindow] = {
    GATEWAY_TOOL_EXECUTION: QuotaWindow(max_requests=60, window_seconds=60),
    GATEWAY_BROWSER_SESSION: QuotaWindow(max_requests=5, window_seconds=60),
    GATEWAY_APPROVAL_ACTION: QuotaWindow(max_requests=30, window_seconds=60),
    GATEWAY_WS_CONNECTION: QuotaWindow(max_requests=10, window_seconds=60),
    GATEWAY_CHANNEL_OUTBOUND: QuotaWindow(max_requests=100, window_seconds=60),
}


@dataclass(frozen=True, slots=True)
class GatewayQuotaDecision:
    allowed: bool
    profile: str
    reason: str = ""
    remaining: int = 0
    retry_after_seconds: int = 0


def evaluate_gateway_quota(*, profile: str, gateway_id: str) -> GatewayQuotaDecision:
    quota = _GATEWAY_QUOTA_PROFILES.get(profile)
    if quota is None:
        return GatewayQuotaDecision(allowed=True, profile=profile, reason="no_quota_profile")

    key = f"{gateway_id}:{profile}"
    if quota.allow(key):
        return GatewayQuotaDecision(
            allowed=True,
            profile=profile,
            remaining=quota.remaining(key),
        )

    return GatewayQuotaDecision(
        allowed=False,
        profile=profile,
        reason=f"{profile}_rate_limited",
        remaining=0,
        retry_after_seconds=quota.window_seconds,
    )


def get_gateway_quota_snapshot(gateway_id: str) -> dict:
    snapshot: dict = {}
    for profile, quota in _GATEWAY_QUOTA_PROFILES.items():
        key = f"{gateway_id}:{profile}"
        snapshot[profile] = {
            "remaining": quota.remaining(key),
            "max_requests": quota.max_requests,
            "window_seconds": quota.window_seconds,
        }
    return snapshot
