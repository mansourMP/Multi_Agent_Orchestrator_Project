from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
import json
import mimetypes
import os
from pathlib import Path
import re
import shutil
from typing import Any, Dict, Mapping, Optional
from urllib.parse import urlparse
import uuid


ARTIFACT_URI_SCHEME = "artifact"
ARTIFACT_STORAGE_BACKEND = "filesystem_object_store"
DEFAULT_RETENTION_POLICY = {
    "mode": "default",
    "retention_days": None,
    "expires_at": None,
    "policy_status": "placeholder",
}


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _project_root() -> Path:
    return Path(__file__).resolve().parents[1]


def _safe_filename(value: str) -> str:
    text = re.sub(r"[^A-Za-z0-9._-]+", "-", str(value or "").strip()).strip("-.")
    return text or "artifact.bin"


def _json_safe(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, Path):
        return str(value)
    if isinstance(value, dict):
        return {str(key): _json_safe(item) for key, item in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [_json_safe(item) for item in value]
    return str(value)


def _artifact_store_root() -> Path:
    configured = (
        str(os.getenv("EMPYRALIS_OBJECT_STORAGE_ROOT") or "").strip()
        or str(os.getenv("ORION_OBJECT_STORAGE_ROOT") or "").strip()
        or str((_project_root() / ".orion-object-store").resolve())
    )
    target = Path(configured).expanduser().resolve()
    target.mkdir(parents=True, exist_ok=True)
    return target


def _artifact_objects_root() -> Path:
    target = _artifact_store_root() / "objects"
    target.mkdir(parents=True, exist_ok=True)
    return target


def _artifact_records_root() -> Path:
    target = _artifact_store_root() / "records"
    target.mkdir(parents=True, exist_ok=True)
    return target


def is_artifact_uri(value: str) -> bool:
    return str(value or "").strip().lower().startswith(f"{ARTIFACT_URI_SCHEME}://")


def artifact_uri(artifact_id: str, file_name: str) -> str:
    return f"{ARTIFACT_URI_SCHEME}://{str(artifact_id or '').strip()}/{_safe_filename(file_name)}"


def artifact_id_from_reference(value: str) -> Optional[str]:
    token = str(value or "").strip()
    if not token:
        return None
    if is_artifact_uri(token):
        parsed = urlparse(token)
        return str(parsed.netloc or "").strip() or None
    if "/" not in token and "\\" not in token and " " not in token:
        return token
    return None


def canonical_artifact_reference(value: Mapping[str, Any]) -> Optional[str]:
    if not isinstance(value, Mapping):
        return None
    uri = str(value.get("uri") or value.get("uri_or_path") or value.get("file_path") or value.get("path") or "").strip()
    if is_artifact_uri(uri):
        return uri
    return None


def is_canonical_artifact_payload(value: Mapping[str, Any]) -> bool:
    if not isinstance(value, Mapping):
        return False
    artifact_id = str(value.get("artifact_id") or "").strip()
    uri = canonical_artifact_reference(value)
    return bool(artifact_id and uri)


def retention_placeholder(retention_days: Optional[int] = None, expires_at: Optional[str] = None) -> Dict[str, Any]:
    payload = dict(DEFAULT_RETENTION_POLICY)
    payload["retention_days"] = int(retention_days) if isinstance(retention_days, int) and retention_days > 0 else None
    payload["expires_at"] = str(expires_at or "").strip() or None
    return payload


def _guess_content_type(file_name: str, explicit: Optional[str] = None) -> str:
    declared = str(explicit or "").strip()
    if declared:
        return declared
    guessed = mimetypes.guess_type(file_name)[0]
    return guessed or "application/octet-stream"


def _artifact_object_path(run_id: str, artifact_id: str, file_name: str) -> tuple[str, Path]:
    run_token = _safe_filename(str(run_id or "").strip() or "run")
    stored_name = _safe_filename(file_name)
    object_key = f"runs/{run_token}/{artifact_id}/{stored_name}"
    target = (_artifact_objects_root() / object_key).resolve()
    target.parent.mkdir(parents=True, exist_ok=True)
    return object_key, target


def _artifact_record_path(artifact_id: str) -> Path:
    return (_artifact_records_root() / f"{artifact_id}.json").resolve()


@dataclass(slots=True)
class ArtifactRecord:
    artifact_id: str
    run_id: str
    kind: str
    uri: str
    tenant_id: str = "default"
    workspace_id: str = "default"
    label: str = ""
    mime_type: str = ""
    content_type: str = ""
    byte_size: int = 0
    created_at: str = ""
    machine_id: Optional[str] = None
    step_id: Optional[str] = None
    step_index: Optional[int] = None
    step_number: Optional[int] = None
    storage_backend: str = ARTIFACT_STORAGE_BACKEND
    object_key: str = ""
    file_name: str = ""
    retention: Dict[str, Any] = field(default_factory=lambda: dict(DEFAULT_RETENTION_POLICY))
    metadata: Dict[str, Any] = field(default_factory=dict)

    def as_payload(self) -> Dict[str, Any]:
        payload = {
            "artifact_id": self.artifact_id,
            "run_id": self.run_id,
            "tenant_id": self.tenant_id,
            "workspace_id": self.workspace_id,
            "kind": self.kind,
            "uri": self.uri,
            "uri_or_path": self.uri,
            "path": self.uri,
            "file_path": self.uri,
            "label": self.label,
            "mime_type": self.mime_type or self.content_type,
            "content_type": self.content_type or self.mime_type,
            "byte_size": int(self.byte_size or 0),
            "created_at": self.created_at,
            "machine_id": self.machine_id,
            "step_id": self.step_id,
            "step_index": self.step_index,
            "step_number": self.step_number,
            "storage_backend": self.storage_backend,
            "file_name": self.file_name,
            "retention": dict(self.retention or DEFAULT_RETENTION_POLICY),
            "metadata": dict(self.metadata or {}),
        }
        return {key: value for key, value in payload.items() if value is not None}


def _persist_record(record: ArtifactRecord, *, stored_path: Path, source_path: Optional[Path] = None) -> None:
    payload = record.as_payload()
    payload["stored_path"] = str(stored_path.resolve())
    if source_path is not None:
        payload["source_path"] = str(source_path.resolve())
    _artifact_record_path(record.artifact_id).write_text(
        json.dumps(_json_safe(payload), ensure_ascii=False, indent=2, sort_keys=True),
        encoding="utf-8",
    )


def store_artifact_file(
    source_path: Path | str,
    *,
    run_id: str,
    kind: str,
    tenant_id: Optional[str] = None,
    workspace_id: Optional[str] = None,
    label: Optional[str] = None,
    machine_id: Optional[str] = None,
    step_id: Optional[str] = None,
    step_index: Optional[int] = None,
    step_number: Optional[int] = None,
    content_type: Optional[str] = None,
    retention_days: Optional[int] = None,
    retention_expires_at: Optional[str] = None,
    metadata: Optional[Mapping[str, Any]] = None,
    artifact_id: Optional[str] = None,
    created_at: Optional[str] = None,
) -> ArtifactRecord:
    source = Path(source_path).expanduser().resolve()
    if not source.exists() or not source.is_file():
        raise FileNotFoundError(source)
    resolved_label = str(label or source.name).strip() or source.name
    artifact_token = str(artifact_id or uuid.uuid4().hex).strip() or uuid.uuid4().hex
    object_key, target = _artifact_object_path(str(run_id or "").strip(), artifact_token, resolved_label)
    if source != target:
        shutil.copy2(source, target)
    stat = target.stat()
    mime = _guess_content_type(target.name, explicit=content_type)
    record = ArtifactRecord(
        artifact_id=artifact_token,
        run_id=str(run_id or "").strip(),
        tenant_id=str(tenant_id or "default").strip() or "default",
        workspace_id=str(workspace_id or "default").strip() or "default",
        kind=str(kind or "artifact").strip() or "artifact",
        uri=artifact_uri(artifact_token, resolved_label),
        label=resolved_label,
        mime_type=mime,
        content_type=mime,
        byte_size=int(stat.st_size),
        created_at=str(created_at or _utc_now_iso()).strip() or _utc_now_iso(),
        machine_id=str(machine_id or "").strip() or None,
        step_id=str(step_id or "").strip() or None,
        step_index=int(step_index) if isinstance(step_index, int) else None,
        step_number=int(step_number) if isinstance(step_number, int) else None,
        object_key=object_key,
        file_name=target.name,
        retention=retention_placeholder(retention_days, retention_expires_at),
        metadata=dict(_json_safe(dict(metadata or {})) or {}),
    )
    _persist_record(record, stored_path=target, source_path=source)
    return record


def store_artifact_bytes(
    content: bytes,
    *,
    run_id: str,
    kind: str,
    file_name: str,
    tenant_id: Optional[str] = None,
    workspace_id: Optional[str] = None,
    label: Optional[str] = None,
    machine_id: Optional[str] = None,
    step_id: Optional[str] = None,
    step_index: Optional[int] = None,
    step_number: Optional[int] = None,
    content_type: Optional[str] = None,
    retention_days: Optional[int] = None,
    retention_expires_at: Optional[str] = None,
    metadata: Optional[Mapping[str, Any]] = None,
    artifact_id: Optional[str] = None,
    created_at: Optional[str] = None,
) -> ArtifactRecord:
    artifact_token = str(artifact_id or uuid.uuid4().hex).strip() or uuid.uuid4().hex
    resolved_name = str(label or file_name or "artifact.bin").strip() or "artifact.bin"
    object_key, target = _artifact_object_path(str(run_id or "").strip(), artifact_token, resolved_name)
    target.write_bytes(bytes(content))
    mime = _guess_content_type(target.name, explicit=content_type)
    record = ArtifactRecord(
        artifact_id=artifact_token,
        run_id=str(run_id or "").strip(),
        tenant_id=str(tenant_id or "default").strip() or "default",
        workspace_id=str(workspace_id or "default").strip() or "default",
        kind=str(kind or "artifact").strip() or "artifact",
        uri=artifact_uri(artifact_token, resolved_name),
        label=resolved_name,
        mime_type=mime,
        content_type=mime,
        byte_size=int(target.stat().st_size),
        created_at=str(created_at or _utc_now_iso()).strip() or _utc_now_iso(),
        machine_id=str(machine_id or "").strip() or None,
        step_id=str(step_id or "").strip() or None,
        step_index=int(step_index) if isinstance(step_index, int) else None,
        step_number=int(step_number) if isinstance(step_number, int) else None,
        object_key=object_key,
        file_name=target.name,
        retention=retention_placeholder(retention_days, retention_expires_at),
        metadata=dict(_json_safe(dict(metadata or {})) or {}),
    )
    _persist_record(record, stored_path=target)
    return record


def load_artifact_metadata(reference: str) -> Optional[Dict[str, Any]]:
    artifact_id = artifact_id_from_reference(reference)
    if not artifact_id:
        return None
    target = _artifact_record_path(artifact_id)
    if not target.exists():
        return None
    try:
        payload = json.loads(target.read_text(encoding="utf-8"))
    except Exception:
        return None
    return payload if isinstance(payload, dict) else None


def resolve_artifact_content_path(reference: str) -> Optional[Path]:
    payload = load_artifact_metadata(reference)
    if not isinstance(payload, dict):
        return None
    stored_path = str(payload.get("stored_path") or "").strip()
    if not stored_path:
        object_key = str(payload.get("object_key") or "").strip()
        if not object_key:
            return None
        candidate = (_artifact_objects_root() / object_key).resolve()
        return candidate if candidate.exists() and candidate.is_file() else None
    candidate = Path(stored_path).expanduser().resolve()
    return candidate if candidate.exists() and candidate.is_file() else None
