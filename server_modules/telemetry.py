from __future__ import annotations

from contextlib import contextmanager
import json
import sys
from threading import Lock
from typing import Any, Dict, Iterator, Optional

try:
    from opentelemetry import trace as _otel_trace
    from opentelemetry.sdk.trace import TracerProvider as _TracerProvider
    from opentelemetry.sdk.trace.export import BatchSpanProcessor as _BatchSpanProcessor
    from opentelemetry.sdk.trace.export import ConsoleSpanExporter as _ConsoleSpanExporter

    _OTEL_AVAILABLE = True
except Exception:  # pragma: no cover - optional dependency
    _otel_trace = None
    _TracerProvider = None
    _BatchSpanProcessor = None
    _ConsoleSpanExporter = None
    _OTEL_AVAILABLE = False


_INITIALIZED = False
_INIT_LOCK = Lock()


class _NoopSpanContext:
    trace_id = 0


class _NoopSpan:
    def set_attribute(self, _key: str, _value: Any) -> None:
        return None

    def record_exception(self, _exc: BaseException) -> None:
        return None

    def get_span_context(self) -> _NoopSpanContext:
        return _NoopSpanContext()


@contextmanager
def _noop_span_manager() -> Iterator[_NoopSpan]:
    yield _NoopSpan()


class _NoopTracer:
    def start_as_current_span(self, _name: str, **_kwargs: Any):
        return _noop_span_manager()


_NOOP_TRACER = _NoopTracer()


def _initialize_tracing() -> None:
    global _INITIALIZED
    if _INITIALIZED:
        return
    with _INIT_LOCK:
        if _INITIALIZED:
            return
        if not _OTEL_AVAILABLE:
            _INITIALIZED = True
            return
        try:
            provider = _TracerProvider()
            processor = _BatchSpanProcessor(_ConsoleSpanExporter(out=sys.stdout))
            provider.add_span_processor(processor)
            _otel_trace.set_tracer_provider(provider)
        except Exception:
            pass
        _INITIALIZED = True


def get_tracer(name: str = "empyralis.runtime") -> Any:
    if not _OTEL_AVAILABLE:
        return _NOOP_TRACER
    _initialize_tracing()
    try:
        return _otel_trace.get_tracer(name)
    except Exception:
        return _NOOP_TRACER


def span_trace_id(span: Any) -> Optional[str]:
    try:
        context = span.get_span_context()
        trace_id = int(getattr(context, "trace_id", 0) or 0)
    except Exception:
        return None
    if trace_id <= 0:
        return None
    return f"{trace_id:032x}"


def _coerce_attribute_value(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, (bool, int, float, str)):
        return value
    if isinstance(value, (list, tuple)):
        coerced = []
        for item in value:
            normalized = _coerce_attribute_value(item)
            if normalized is None:
                continue
            if isinstance(normalized, (bool, int, float, str)):
                coerced.append(normalized)
            else:
                coerced.append(str(normalized))
        return tuple(coerced)
    try:
        return json.dumps(value, sort_keys=True, default=str)
    except Exception:
        return str(value)


def set_span_attributes(span: Any, attributes: Dict[str, Any]) -> Optional[str]:
    if span is None or not isinstance(attributes, dict):
        return span_trace_id(span)
    for key, value in attributes.items():
        normalized_key = str(key or "").strip()
        if not normalized_key:
            continue
        normalized_value = _coerce_attribute_value(value)
        if normalized_value is None:
            continue
        try:
            span.set_attribute(normalized_key, normalized_value)
        except Exception:
            continue
    trace_id = span_trace_id(span)
    if trace_id:
        try:
            span.set_attribute("trace_id", trace_id)
        except Exception:
            pass
    return trace_id

