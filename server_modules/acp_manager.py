from __future__ import annotations

import json
import queue
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Dict, Iterable, List, MutableMapping, MutableSequence, Optional

from server_modules.runtime_config import (
    ORION_HISTORY_LIMIT,
    ORION_IDEMPOTENCY_FILE,
    ORION_MEMORY_ENABLED,
    ORION_PROVIDER_PROFILES_FILE,
    ORION_RUNTIME_STATE_DB,
    ORION_SETUP_SESSIONS_FILE,
)
from server_modules.runtime_state_store import (
    delete_live_run_state,
    init_runtime_state_db,
    list_live_run_states,
    list_run_history,
    load_local_runtime_state,
    replace_local_runtime_state,
    replace_run_history,
    upsert_live_run_state,
)

_LIVE_RUN_EXCLUDED_KEYS = {
    "logs",
    "input_queue",
}
_LIVE_RUN_MONO_KEYS = {
    "_started_mono",
    "_finished_mono",
    "_first_value_mono",
    "_hitl_wait_start_mono",
}


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _json_safe(value: Any) -> Any:
    try:
        return json.loads(json.dumps(value, default=str))
    except Exception:
        return str(value)


def _safe_read_json(path: Path, fallback: Any) -> Any:
    try:
        if not path.exists():
            return fallback
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return fallback


def _safe_write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = path.with_suffix(f"{path.suffix}.tmp")
    tmp_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp_path.replace(path)


class _PersistentBase:
    def __init__(self, *, callback: Optional[Callable[[], None]] = None) -> None:
        self._callback = callback
        self._suspend_notifications = False

    def _notify(self) -> None:
        if self._suspend_notifications:
            return
        if callable(self._callback):
            self._callback()

    def _wrap(self, value: Any) -> Any:
        if isinstance(value, (_PersistentDict, _PersistentList)):
            return value
        if isinstance(value, dict):
            return _PersistentDict(value, callback=self._notify)
        if isinstance(value, list):
            return _PersistentList(value, callback=self._notify)
        return value


class _PersistentDict(dict, _PersistentBase):
    def __init__(self, initial: Optional[Dict[str, Any]] = None, *, callback: Optional[Callable[[], None]] = None) -> None:
        dict.__init__(self)
        _PersistentBase.__init__(self, callback=callback)
        self._suspend_notifications = True
        for key, value in (initial or {}).items():
            dict.__setitem__(self, key, self._wrap(value))
        self._suspend_notifications = False

    def __setitem__(self, key: Any, value: Any) -> None:
        dict.__setitem__(self, key, self._wrap(value))
        self._notify()

    def __delitem__(self, key: Any) -> None:
        dict.__delitem__(self, key)
        self._notify()

    def clear(self) -> None:
        dict.clear(self)
        self._notify()

    def pop(self, key: Any, default: Any = None) -> Any:
        if key in self:
            value = dict.pop(self, key)
            self._notify()
            return value
        return default

    def popitem(self) -> Any:
        item = dict.popitem(self)
        self._notify()
        return item

    def setdefault(self, key: Any, default: Any = None) -> Any:
        if key not in self:
            dict.__setitem__(self, key, self._wrap(default))
            self._notify()
        return dict.__getitem__(self, key)

    def update(self, *args: Any, **kwargs: Any) -> None:
        updates = dict(*args, **kwargs)
        for key, value in updates.items():
            dict.__setitem__(self, key, self._wrap(value))
        if updates:
            self._notify()


class _PersistentList(list, _PersistentBase):
    def __init__(self, initial: Optional[Iterable[Any]] = None, *, callback: Optional[Callable[[], None]] = None) -> None:
        list.__init__(self)
        _PersistentBase.__init__(self, callback=callback)
        self._suspend_notifications = True
        for item in (initial or []):
            list.append(self, self._wrap(item))
        self._suspend_notifications = False

    def __setitem__(self, index: Any, value: Any) -> None:
        if isinstance(index, slice):
            list.__setitem__(self, index, [self._wrap(item) for item in value])
        else:
            list.__setitem__(self, index, self._wrap(value))
        self._notify()

    def __delitem__(self, index: Any) -> None:
        list.__delitem__(self, index)
        self._notify()

    def append(self, value: Any) -> None:
        list.append(self, self._wrap(value))
        self._notify()

    def extend(self, values: Iterable[Any]) -> None:
        list.extend(self, [self._wrap(item) for item in values])
        self._notify()

    def insert(self, index: int, value: Any) -> None:
        list.insert(self, index, self._wrap(value))
        self._notify()

    def pop(self, index: int = -1) -> Any:
        value = list.pop(self, index)
        self._notify()
        return value

    def remove(self, value: Any) -> None:
        list.remove(self, value)
        self._notify()

    def clear(self) -> None:
        list.clear(self)
        self._notify()

    def sort(self, *args: Any, **kwargs: Any) -> None:
        list.sort(self, *args, **kwargs)
        self._notify()

    def reverse(self) -> None:
        list.reverse(self)
        self._notify()

    def __iadd__(self, values: Iterable[Any]):
        self.extend(values)
        return self


class _PersistentRunStore(dict):
    def __init__(self, manager: "AcpSessionManager") -> None:
        super().__init__()
        self._manager = manager
        self._loading = False

    def _wrap_run(self, run_id: str, payload: Dict[str, Any]) -> _PersistentDict:
        holder: Dict[str, _PersistentDict] = {}

        def _persist() -> None:
            current = holder.get("run")
            if current is None or self._loading:
                return
            self._manager.persist_live_run(run_id, current)

        run = _PersistentDict(payload, callback=_persist)
        holder["run"] = run
        return run

    def __setitem__(self, key: str, value: Dict[str, Any]) -> None:
        run_id = str(key or "").strip()
        wrapped = self._wrap_run(run_id, value if isinstance(value, dict) else {})
        dict.__setitem__(self, run_id, wrapped)
        if not self._loading:
            self._manager.persist_live_run(run_id, wrapped)

    def clear(self) -> None:
        run_ids = [str(key) for key in dict.keys(self)]
        dict.clear(self)
        if not self._loading:
            for run_id in run_ids:
                self._manager.delete_live_run(run_id)

    def pop(self, key: str, default: Any = None) -> Any:
        token = str(key or "").strip()
        if token in self:
            value = dict.pop(self, token)
            if not self._loading:
                self._manager.delete_live_run(token)
            return value
        return default

    def reload(self, persisted_items: List[Dict[str, Any]]) -> None:
        self._loading = True
        try:
            dict.clear(self)
            for item in persisted_items:
                restored = self._manager.restore_live_run(item)
                if not restored:
                    continue
                run_id, run = restored
                dict.__setitem__(self, run_id, self._wrap_run(run_id, run))
        finally:
            self._loading = False


class _PersistentSnapshotList(_PersistentList):
    def __init__(self, *, callback: Optional[Callable[[], None]] = None) -> None:
        super().__init__([], callback=callback)
        self._loading = False

    def reload(self, items: Iterable[Any]) -> None:
        self._loading = True
        self._suspend_notifications = True
        try:
            list.clear(self)
            for item in items:
                list.append(self, self._wrap(item))
        finally:
            self._suspend_notifications = False
            self._loading = False


class _PersistentStateDict(_PersistentDict):
    def __init__(self, *, callback: Optional[Callable[[], None]] = None) -> None:
        super().__init__({}, callback=callback)
        self._loading = False

    def reload(self, items: Dict[str, Any]) -> None:
        self._loading = True
        self._suspend_notifications = True
        try:
            dict.clear(self)
            for key, value in items.items():
                dict.__setitem__(self, str(key), self._wrap(value))
        finally:
            self._suspend_notifications = False
            self._loading = False


class _PersistentStateList(_PersistentList):
    def __init__(self, *, callback: Optional[Callable[[], None]] = None) -> None:
        super().__init__([], callback=callback)
        self._loading = False

    def reload(self, items: Iterable[Any]) -> None:
        self._loading = True
        self._suspend_notifications = True
        try:
            list.clear(self)
            for item in items:
                list.append(self, self._wrap(item))
        finally:
            self._suspend_notifications = False
            self._loading = False


class AcpSessionManager:
    def __init__(
        self,
        *,
        runtime_db_path: Path,
        setup_sessions_path: Path,
        provider_profiles_path: Path,
        idempotency_path: Path,
    ) -> None:
        self.runtime_db_path = Path(runtime_db_path).expanduser().resolve()
        self.setup_sessions_path = Path(setup_sessions_path).expanduser().resolve()
        self.provider_profiles_path = Path(provider_profiles_path).expanduser().resolve()
        self.idempotency_path = Path(idempotency_path).expanduser().resolve()
        self._global_lock = threading.Lock()
        self._scope_locks: Dict[str, threading.Lock] = {}

        self.runs = _PersistentRunStore(self)
        self.run_history = _PersistentSnapshotList(callback=self._persist_run_history)
        self.setup_sessions = _PersistentStateDict(callback=self._persist_setup_sessions)
        self.provider_profiles = _PersistentStateDict(callback=self._persist_provider_profiles)
        self.idempotency_records = _PersistentStateDict(callback=self._persist_idempotency)
        self.local_pending_run_ids = _PersistentStateList(callback=self._persist_local_runtime_state)
        self.local_claimed_runs = _PersistentStateDict(callback=self._persist_local_runtime_state)
        self.local_worker_registry = _PersistentStateDict(callback=self._persist_local_runtime_state)
        self.reload_all()

    def _ensure_runtime_db(self) -> None:
        try:
            init_runtime_state_db(self.runtime_db_path)
        except Exception:
            pass

    def reconfigure_paths(
        self,
        *,
        runtime_db_path: Optional[Path] = None,
        setup_sessions_path: Optional[Path] = None,
        provider_profiles_path: Optional[Path] = None,
        idempotency_path: Optional[Path] = None,
    ) -> None:
        if runtime_db_path is not None:
            self.runtime_db_path = Path(runtime_db_path).expanduser().resolve()
        if setup_sessions_path is not None:
            self.setup_sessions_path = Path(setup_sessions_path).expanduser().resolve()
        if provider_profiles_path is not None:
            self.provider_profiles_path = Path(provider_profiles_path).expanduser().resolve()
        if idempotency_path is not None:
            self.idempotency_path = Path(idempotency_path).expanduser().resolve()

    def _lock_for(self, scope_key: str) -> threading.Lock:
        with self._global_lock:
            lock = self._scope_locks.get(scope_key)
            if lock is None:
                lock = threading.Lock()
                self._scope_locks[scope_key] = lock
            return lock

    def restore_live_run(self, item: Dict[str, Any]) -> Optional[tuple[str, Dict[str, Any]]]:
        payload = _json_safe(item)
        if not isinstance(payload, dict):
            return None
        run_id = str(payload.pop("run_id", "") or "").strip()
        if not run_id:
            return None
        log_queue: queue.Queue = queue.Queue()
        events = payload.get("events") if isinstance(payload.get("events"), list) else []
        event_seq = int(payload.get("_event_seq") or 0)
        for entry in events:
            if not isinstance(entry, dict):
                continue
            try:
                event_seq = max(event_seq, int(entry.get("seq") or 0))
            except Exception:
                continue
        run: Dict[str, Any] = dict(payload)
        run["run_id"] = run_id
        run["logs"] = log_queue
        run["input_queue"] = queue.Queue()
        run["thread_id"] = None
        run["_archived"] = False
        run["_event_seq"] = event_seq
        if not isinstance(run.get("events"), list):
            run["events"] = []
        if not isinstance(run.get("tool_policy_audit"), list):
            run["tool_policy_audit"] = []
        if not isinstance(run.get("memory_trace"), dict):
            run["memory_trace"] = {
                "enabled": ORION_MEMORY_ENABLED,
                "reads": [],
                "writes": [],
                "last_error": None,
                "updated_at": _utc_now_iso(),
            }
        if "_hitl_wait_total_ms" not in run:
            run["_hitl_wait_total_ms"] = 0.0
        return run_id, run

    def _serialize_live_run(self, run_id: str, run: MutableMapping[str, Any]) -> Dict[str, Any]:
        payload: Dict[str, Any] = {"run_id": str(run_id or "").strip()}
        for key, value in run.items():
            if key in _LIVE_RUN_EXCLUDED_KEYS or key in _LIVE_RUN_MONO_KEYS:
                continue
            payload[key] = value
        if "thread_id" not in payload:
            payload["thread_id"] = None
        if "_archived" not in payload:
            payload["_archived"] = False
        return _json_safe(payload)

    def persist_live_run(self, run_id: str, run: MutableMapping[str, Any]) -> None:
        token = str(run_id or "").strip()
        if not token:
            return
        self._ensure_runtime_db()
        with self._lock_for(f"run:{token}"):
            upsert_live_run_state(self.runtime_db_path, self._serialize_live_run(token, run))

    def delete_live_run(self, run_id: str) -> None:
        token = str(run_id or "").strip()
        if not token:
            return
        self._ensure_runtime_db()
        with self._lock_for(f"run:{token}"):
            delete_live_run_state(self.runtime_db_path, token)

    def _persist_run_history(self) -> None:
        self._ensure_runtime_db()
        with self._lock_for("run_history"):
            replace_run_history(
                self.runtime_db_path,
                [_json_safe(item) for item in self.run_history],
                ORION_HISTORY_LIMIT,
            )

    def _persist_local_runtime_state(self) -> None:
        self._ensure_runtime_db()
        with self._lock_for("local_runtime_state"):
            replace_local_runtime_state(
                self.runtime_db_path,
                pending_run_ids=[str(item) for item in self.local_pending_run_ids],
                claimed_runs={str(key): _json_safe(value) for key, value in self.local_claimed_runs.items()},
                runtime_registrations={str(key): _json_safe(value) for key, value in self.local_worker_registry.items()},
            )

    def _persist_setup_sessions(self) -> None:
        with self._lock_for("setup_sessions"):
            _safe_write_json(
                self.setup_sessions_path,
                {
                    "version": 1,
                    "updated_at": _utc_now_iso(),
                    "items": _json_safe(dict(self.setup_sessions)),
                },
            )

    def _persist_provider_profiles(self) -> None:
        with self._lock_for("provider_profiles"):
            _safe_write_json(
                self.provider_profiles_path,
                {
                    "version": 1,
                    "updated_at": _utc_now_iso(),
                    "items": _json_safe(dict(self.provider_profiles)),
                },
            )

    def _persist_idempotency(self) -> None:
        with self._lock_for("idempotency"):
            _safe_write_json(
                self.idempotency_path,
                {
                    "version": 1,
                    "updated_at": _utc_now_iso(),
                    "items": _json_safe(dict(self.idempotency_records)),
                },
            )

    def reload_runtime_state(self) -> None:
        self._ensure_runtime_db()
        try:
            persisted_runs = list_live_run_states(self.runtime_db_path)
        except Exception:
            persisted_runs = []
        try:
            local_state = load_local_runtime_state(self.runtime_db_path)
        except Exception:
            local_state = {}
        try:
            history_items = list_run_history(self.runtime_db_path, ORION_HISTORY_LIMIT)
        except Exception:
            history_items = []
        self.runs.reload(persisted_runs)
        self.local_pending_run_ids.reload(local_state.get("pending_run_ids") if isinstance(local_state, dict) else [])
        self.local_claimed_runs.reload(local_state.get("claimed_runs") if isinstance(local_state, dict) else {})
        self.local_worker_registry.reload(local_state.get("runtime_registrations") if isinstance(local_state, dict) else {})
        self.run_history.reload(history_items)

    def reload_secondary_state(self) -> None:
        setup_payload = _safe_read_json(self.setup_sessions_path, {"version": 1, "items": {}})
        self.setup_sessions.reload(setup_payload.get("items") if isinstance(setup_payload.get("items"), dict) else {})
        provider_payload = _safe_read_json(self.provider_profiles_path, {"version": 1, "items": {}})
        self.provider_profiles.reload(provider_payload.get("items") if isinstance(provider_payload.get("items"), dict) else {})
        idem_payload = _safe_read_json(self.idempotency_path, {"version": 1, "items": {}})
        self.idempotency_records.reload(idem_payload.get("items") if isinstance(idem_payload.get("items"), dict) else {})

    def reload_all(self) -> None:
        self.reload_runtime_state()
        self.reload_secondary_state()


DEFAULT_ACP_MANAGER = AcpSessionManager(
    runtime_db_path=ORION_RUNTIME_STATE_DB,
    setup_sessions_path=ORION_SETUP_SESSIONS_FILE,
    provider_profiles_path=ORION_PROVIDER_PROFILES_FILE,
    idempotency_path=ORION_IDEMPOTENCY_FILE,
)
