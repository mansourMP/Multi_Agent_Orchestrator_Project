from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Callable, Generic, Optional, TypeVar


T = TypeVar("T")


class DownstreamResilienceError(RuntimeError):
    pass


class DownstreamCircuitOpenError(DownstreamResilienceError):
    pass


@dataclass(frozen=True)
class RetryPolicy:
    attempts: int = 3
    initial_delay_seconds: float = 0.05
    backoff_multiplier: float = 2.0


@dataclass(frozen=True)
class CircuitBreakerPolicy:
    failure_threshold: int = 3
    reset_after_seconds: float = 30.0


@dataclass
class _CircuitState:
    failures: int = 0
    opened_at: Optional[float] = None


_CIRCUITS: dict[str, _CircuitState] = {}


def reset_circuits_for_tests() -> None:
    _CIRCUITS.clear()


def _circuit_state(name: str) -> _CircuitState:
    return _CIRCUITS.setdefault(str(name or "downstream").strip() or "downstream", _CircuitState())


def call_with_retries(
    *,
    name: str,
    operation: Callable[[], T],
    retry_policy: RetryPolicy = RetryPolicy(),
    circuit_policy: CircuitBreakerPolicy = CircuitBreakerPolicy(),
    sleep: Callable[[float], None] = time.sleep,
    now: Callable[[], float] = time.time,
) -> T:
    circuit_name = str(name or "downstream").strip() or "downstream"
    state = _circuit_state(circuit_name)
    current_time = now()
    if state.opened_at is not None:
        if current_time - state.opened_at < circuit_policy.reset_after_seconds:
            raise DownstreamCircuitOpenError(f"Downstream circuit is open for {circuit_name}.")
        state.failures = 0
        state.opened_at = None

    attempts = max(int(retry_policy.attempts or 1), 1)
    delay = max(float(retry_policy.initial_delay_seconds or 0), 0)
    last_error: BaseException | None = None
    for index in range(attempts):
        try:
            result = operation()
            state.failures = 0
            state.opened_at = None
            return result
        except BaseException as exc:
            last_error = exc
            if index < attempts - 1 and delay > 0:
                sleep(delay)
                delay *= max(float(retry_policy.backoff_multiplier or 1), 1)

    state.failures += 1
    if state.failures >= max(int(circuit_policy.failure_threshold or 1), 1):
        state.opened_at = now()
    if last_error is not None:
        raise last_error
    raise DownstreamResilienceError(f"Downstream operation failed for {circuit_name}.")
