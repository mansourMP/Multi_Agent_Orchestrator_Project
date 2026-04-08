from __future__ import annotations

import asyncio
import io
import os
import re
from typing import Any, AsyncIterator, Dict, List, Literal, Optional
import uuid

import httpx
from fastapi import Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from server_modules.auth import (
    allowed_workspace_ids,
    enforce_workspace_access,
    grant_workspace_owner_machine_trust,
    revoke_workspace_owner_machine_trust,
    workspace_machine_enrollment_scope,
    workspace_role,
    workspace_tenant_id,
)
from server_modules.runtime_common import require_api_key
from server_modules import local_queue
from server_modules import outbox_service
from server_modules import run_state_repository, runs_output, shared, telemetry

SUPPORTED_STT_CONTENT_TYPES: Dict[str, str] = {
    "audio/webm": "input.webm",
    "audio/wav": "input.wav",
    "audio/wave": "input.wav",
    "audio/x-wav": "input.wav",
}
TTS_MAX_CHARS = 4096
TTS_VOICES = {"alloy", "echo", "fable", "onyx", "nova", "shimmer"}


class RuntimeRegisterPayload(BaseModel):
    runtime_type: str = "local"
    display_name: Optional[str] = None
    platform: Optional[str] = None
    policy_mode: str = "local_default"
    capabilities: List[str] = Field(default_factory=list)
    execution_targets: List[str] = Field(default_factory=list)
    instance_id: Optional[str] = None
    capability_digest: Optional[str] = None
    current_run_id: Optional[str] = None
    note: Optional[str] = None
    permission_probe: Dict[str, Dict[str, Any]] = Field(default_factory=dict)


class RuntimeHeartbeatPayload(BaseModel):
    session_token: Optional[str] = None
    instance_id: Optional[str] = None
    current_run_id: Optional[str] = None
    note: Optional[str] = None
    permission_probe: Dict[str, Dict[str, Any]] = Field(default_factory=dict)


class MachineEnrollPayload(BaseModel):
    tenant_id: Optional[str] = None
    workspace_id: Optional[str] = None
    machine_id: Optional[str] = None
    runtime_type: str = "local_companion"
    display_name: Optional[str] = None
    platform: Optional[str] = None
    policy_mode: Optional[str] = None
    capabilities: List[str] = Field(default_factory=list)
    execution_targets: List[str] = Field(default_factory=lambda: ["local_companion"])
    note: Optional[str] = None


class MachineEnrollmentStatePayload(BaseModel):
    enrollment_token: str = Field(min_length=1)
    state: Literal[
        "awaiting_local_acceptance",
        "installing",
        "starting",
        "registering",
        "healthy",
        "failed",
    ]
    error: Optional[str] = None


class MachineBootstrapCompletePayload(BaseModel):
    enrollment_token: str = Field(min_length=1)


class MachineControlPayload(BaseModel):
    reason: Optional[str] = None


class RuntimeTaskClaimRequest(BaseModel):
    runtime_id: Optional[str] = None
    session_token: Optional[str] = None
    instance_id: Optional[str] = None
    execution_target: str = "local"
    required_capabilities: List[str] = Field(default_factory=list)


class RuntimeTaskHeartbeatPayload(BaseModel):
    runtime_id: Optional[str] = None
    session_token: Optional[str] = None
    instance_id: Optional[str] = None
    note: Optional[str] = None
    event: Optional[Dict[str, Any]] = None


class RuntimeTaskControlStatePayload(BaseModel):
    runtime_id: Optional[str] = None
    session_token: Optional[str] = None
    instance_id: Optional[str] = None


class RuntimeTaskCompletePayload(BaseModel):
    runtime_id: Optional[str] = None
    session_token: Optional[str] = None
    instance_id: Optional[str] = None
    result_text: Optional[str] = None
    result_data: Optional[Dict[str, Any]] = None
    usage_masked: Optional[Dict[str, Any]] = None


class RuntimeTaskPausePayload(BaseModel):
    runtime_id: Optional[str] = None
    session_token: Optional[str] = None
    instance_id: Optional[str] = None
    result_text: Optional[str] = None
    result_data: Optional[Dict[str, Any]] = None
    browser_checkpoint: Optional[Dict[str, Any]] = None
    wait_reason: Optional[str] = None


class RuntimeTaskFailPayload(BaseModel):
    runtime_id: Optional[str] = None
    session_token: Optional[str] = None
    instance_id: Optional[str] = None
    error: str


class RuntimeTtsPayload(BaseModel):
    text: str = Field(min_length=1)
    voice: Literal["alloy", "echo", "fable", "onyx", "nova", "shimmer"] = "alloy"
    speed: float = Field(default=1.0, ge=0.25, le=4.0)


def _normalized_openai_api_key() -> str:
    return str(os.getenv("OPENAI_API_KEY") or "").strip()


async def _transcribe_with_openai(audio_bytes: bytes, content_type: str) -> Dict[str, Any]:
    api_key = _normalized_openai_api_key()
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY is not configured.")
    filename = SUPPORTED_STT_CONTENT_TYPES.get(content_type, "input.webm")
    files = {
        "file": (filename, audio_bytes, content_type),
    }
    data = {
        "model": "whisper-1",
        "response_format": "json",
    }
    async with httpx.AsyncClient(timeout=120.0, follow_redirects=True) as client:
        response = await client.post(
            "https://api.openai.com/v1/audio/transcriptions",
            headers={"Authorization": f"Bearer {api_key}"},
            data=data,
            files=files,
        )
    response.raise_for_status()
    payload = response.json()
    transcript = str(payload.get("text") or "").strip()
    return {
        "transcript": transcript,
        "confidence": 1.0 if transcript else 0.0,
        "provider": "openai_whisper",
    }


def _transcribe_with_google(audio_bytes: bytes, content_type: str) -> Dict[str, Any]:
    if content_type not in {"audio/wav", "audio/wave", "audio/x-wav"}:
        raise RuntimeError("Google speech fallback only supports WAV audio.")
    try:
        import speech_recognition as sr  # type: ignore
    except ImportError as exc:
        raise RuntimeError("Google speech fallback is unavailable.") from exc
    recognizer = sr.Recognizer()
    with sr.AudioFile(io.BytesIO(audio_bytes)) as source:
        audio = recognizer.record(source)
    transcript = str(recognizer.recognize_google(audio) or "").strip()
    return {
        "transcript": transcript,
        "confidence": 0.6 if transcript else 0.0,
        "provider": "google_speech",
    }


async def _transcribe_audio_bytes(audio_bytes: bytes, content_type: str) -> Dict[str, Any]:
    if _normalized_openai_api_key():
        return await _transcribe_with_openai(audio_bytes, content_type)
    return await asyncio.to_thread(_transcribe_with_google, audio_bytes, content_type)


def _split_tts_text(text: str, max_chars: int = TTS_MAX_CHARS) -> List[str]:
    normalized = re.sub(r"[ \t]+\n", "\n", str(text or "")).strip()
    if not normalized:
        return []
    if len(normalized) <= max_chars:
        return [normalized]

    def flush_chunk(chunks: List[str], current: str) -> str:
        value = current.strip()
        if value:
            chunks.append(value)
        return ""

    chunks: List[str] = []
    current = ""
    paragraphs = [part.strip() for part in re.split(r"\n{2,}", normalized) if part.strip()]
    for paragraph in paragraphs:
        sentences = [part.strip() for part in re.split(r"(?<=[.!?])\s+", paragraph) if part.strip()]
        if not sentences:
            sentences = [paragraph]
        for sentence in sentences:
            candidate = f"{current} {sentence}".strip() if current else sentence
            if len(candidate) <= max_chars:
                current = candidate
                continue
            current = flush_chunk(chunks, current)
            if len(sentence) <= max_chars:
                current = sentence
                continue
            start = 0
            while start < len(sentence):
                slice_end = min(start + max_chars, len(sentence))
                piece = sentence[start:slice_end].strip()
                if piece:
                    chunks.append(piece)
                start = slice_end
        current = flush_chunk(chunks, current)
    flush_chunk(chunks, current)
    return chunks or [normalized[:max_chars]]


async def _synthesize_tts_chunk(text: str, voice: str, speed: float) -> bytes:
    api_key = _normalized_openai_api_key()
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY is not configured.")
    async with httpx.AsyncClient(timeout=180.0, follow_redirects=True) as client:
        response = await client.post(
            "https://api.openai.com/v1/audio/speech",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": "tts-1",
                "voice": voice,
                "input": text,
                "speed": speed,
                "format": "mp3",
            },
        )
    response.raise_for_status()
    return bytes(response.content)


async def _synthesize_tts_chunks(text: str, voice: str, speed: float) -> List[bytes]:
    parts = _split_tts_text(text)
    if not parts:
        raise RuntimeError("Text is required.")
    results: List[bytes] = []
    for part in parts:
        results.append(await _synthesize_tts_chunk(part, voice, speed))
    return results


async def _iter_audio_chunks(chunks: List[bytes]) -> AsyncIterator[bytes]:
    for chunk in chunks:
        yield chunk


def _runtime_summary_from_worker_item(item: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "tenant_id": str(item.get("tenant_id") or "default").strip() or "default",
        "workspace_id": str(item.get("workspace_id") or "default").strip() or "default",
        "machine_id": str(item.get("machine_id") or item.get("runtime_id") or item.get("worker_id") or ""),
        "runtime_id": str(item.get("runtime_id") or item.get("worker_id") or ""),
        "runtime_type": str(item.get("runtime_type") or "local"),
        "display_name": str(item.get("display_name") or item.get("worker_id") or ""),
        "platform": item.get("platform"),
        "policy_mode": str(item.get("policy_mode") or "local_default"),
        "capabilities": list(item.get("capabilities") or []),
        "execution_targets": list(item.get("execution_targets") or []),
        "status": item.get("status"),
        "online": bool(item.get("online")),
        "current_task_id": item.get("current_run_id"),
        "current_lease_holder": item.get("current_lease_holder"),
        "last_seen_at": item.get("last_seen_at"),
        "registered_at": item.get("registered_at"),
        "last_registered_at": item.get("last_registered_at"),
        "session_issued_at": item.get("session_issued_at"),
        "instance_id": item.get("instance_id"),
        "capability_digest": item.get("capability_digest"),
        "trust_state": item.get("trust_state") or "unverified",
        "note": item.get("note"),
        "permission_probe": item.get("permission_probe") if isinstance(item.get("permission_probe"), dict) else {},
        "permission_probe_updated_at": item.get("permission_probe_updated_at"),
        "control_state": item.get("control_state") or "active",
        "control_state_updated_at": item.get("control_state_updated_at"),
        "suspended_at": item.get("suspended_at"),
        "suspended_reason": item.get("suspended_reason"),
        "revoked_at": item.get("revoked_at"),
        "revoked_reason": item.get("revoked_reason"),
        "safe_mode_status": item.get("safe_mode_status") if isinstance(item.get("safe_mode_status"), dict) else {},
        "kill_switch_status": item.get("kill_switch_status") if isinstance(item.get("kill_switch_status"), dict) else {},
        "enrollment_state": item.get("enrollment_state"),
        "enrollment_requested_at": item.get("enrollment_requested_at"),
        "enrollment_updated_at": item.get("enrollment_updated_at"),
        "bootstrap_error": item.get("bootstrap_error"),
        "machine_enrollment_scope": item.get("machine_enrollment_scope") or "workspace",
    }


def _task_summary_from_local_claim(run: Dict[str, Any]) -> Dict[str, Any]:
    context = run.get("context") if isinstance(run.get("context"), dict) else {}
    metadata = context.get("metadata") if isinstance(context.get("metadata"), dict) else {}
    precheck = metadata.get("tool_policy_precheck") if isinstance(metadata.get("tool_policy_precheck"), dict) else {}
    return {
        "task_id": run.get("run_id"),
        "execution_target": "local",
        "status": run.get("status"),
        "lease_seconds": run.get("lease_seconds"),
        "machine_id": run.get("machine_id") or run.get("local_worker_id"),
        "machine_lease_id": run.get("machine_lease_id"),
        "prompt": str(context.get("user_goal") or ""),
        "created_at": run.get("created_at"),
        "required_capabilities": list(precheck.get("capability_ids") or []) if isinstance(precheck, dict) else [],
        "policy_mode": metadata.get("policy_mode"),
        "context": context,
        "metadata": metadata,
        "run": run,
    }


def runtime_status_payload() -> Dict[str, Any]:
    local_queue.recover_orphaned_local_runs_on_startup()
    payload = local_queue.handle_get_local_workers_status()
    items = payload.get("items") if isinstance(payload.get("items"), list) else []
    return {
        "scope": "local_companion_bridge",
        "summary": payload.get("summary") if isinstance(payload.get("summary"), dict) else {},
        "capability_queue": payload.get("capability_queue") if isinstance(payload.get("capability_queue"), dict) else {},
        "outbox": outbox_service.get_outbox_delivery_status(),
        "items": [_runtime_summary_from_worker_item(item) for item in items if isinstance(item, dict)],
    }


def _recent_failed_run_snapshots(limit: int = 100) -> List[Dict[str, Any]]:
    snapshots: List[Dict[str, Any]] = []
    seen: set[str] = set()
    try:
        live_failed = run_state_repository.sync_list_live_runs_by_state(["failed", "timeout"])
    except Exception:
        live_failed = []
    for item in live_failed:
        if not isinstance(item, dict):
            continue
        run_id = str(item.get("run_id") or "").strip()
        if not run_id or run_id in seen:
            continue
        try:
            snapshots.append(runs_output._serialize_run_snapshot(run_id, item))
            seen.add(run_id)
        except Exception:
            continue
        if len(snapshots) >= limit:
            return snapshots
    try:
        archived = run_state_repository.sync_list_run_archive(limit=limit)
    except Exception:
        archived = []
    for item in archived:
        if not isinstance(item, dict):
            continue
        run_id = str(item.get("run_id") or "").strip()
        if not run_id or run_id in seen:
            continue
        snapshots.append(dict(item))
        seen.add(run_id)
        if len(snapshots) >= limit:
            return snapshots
    with shared.RUN_HISTORY_LOCK:
        history_items = list(shared.RUN_HISTORY)
    for item in history_items:
        if not isinstance(item, dict):
            continue
        run_id = str(item.get("run_id") or "").strip()
        if not run_id or run_id in seen:
            continue
        snapshots.append(dict(item))
        seen.add(run_id)
        if len(snapshots) >= limit:
            break
    return snapshots


def runtime_reliability_payload() -> Dict[str, Any]:
    payload = telemetry.get_reliability_snapshot(failed_run_snapshots=_recent_failed_run_snapshots())
    payload["outbox"] = outbox_service.get_outbox_delivery_status()
    return payload


def legacy_local_workers_status_payload() -> Dict[str, Any]:
    payload = runtime_status_payload()
    items = payload.get("items") if isinstance(payload.get("items"), list) else []
    summary = payload.get("summary") if isinstance(payload.get("summary"), dict) else {}
    return {
        "enabled": True,
        "scope": payload.get("scope"),
        "summary": summary,
        "items": items,
        "known": int(summary.get("known") or len(items)),
        "online": int(summary.get("online") or 0),
        "idle": int(summary.get("idle") or 0),
        "busy": int(summary.get("busy") or 0),
        "offline": int(summary.get("offline") or 0),
        "online_workers": int(summary.get("online") or 0),
    }


def register_runtime_routes(app) -> None:
    @app.post("/stt", dependencies=[Depends(require_api_key)])
    async def transcribe_audio(request: Request):
        raw_content_type = str(request.headers.get("content-type") or "").split(";", 1)[0].strip().lower()
        if raw_content_type not in SUPPORTED_STT_CONTENT_TYPES:
            raise HTTPException(status_code=415, detail="Unsupported audio format.")
        audio_bytes = await request.body()
        if not audio_bytes:
            raise HTTPException(status_code=400, detail="Audio payload is required.")
        try:
            result = await _transcribe_audio_bytes(audio_bytes, raw_content_type)
        except httpx.HTTPStatusError as exc:
            detail = exc.response.text.strip() if exc.response is not None else "Speech transcription failed."
            raise HTTPException(status_code=502, detail=detail or "Speech transcription failed.") from exc
        except RuntimeError as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc
        return {
            "transcript": str(result.get("transcript") or "").strip(),
            "confidence": float(result.get("confidence") or 0.0),
        }

    @app.post("/tts", dependencies=[Depends(require_api_key)])
    async def synthesize_speech(payload: RuntimeTtsPayload):
        if payload.voice not in TTS_VOICES:
            raise HTTPException(status_code=400, detail="Unsupported voice.")
        try:
            chunks = await _synthesize_tts_chunks(payload.text, payload.voice, payload.speed)
        except httpx.HTTPStatusError as exc:
            detail = exc.response.text.strip() if exc.response is not None else "Text-to-speech synthesis failed."
            raise HTTPException(status_code=502, detail=detail or "Text-to-speech synthesis failed.") from exc
        except RuntimeError as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc
        return StreamingResponse(_iter_audio_chunks(chunks), media_type="audio/mpeg")

    @app.get("/runtime/runtimes/status", dependencies=[Depends(require_api_key)])
    async def get_runtime_status():
        return runtime_status_payload()

    @app.get("/runtime/runtimes/reliability", dependencies=[Depends(require_api_key)])
    async def get_runtime_reliability():
        return runtime_reliability_payload()

    @app.get("/machines", dependencies=[Depends(require_api_key)])
    async def get_machines(
        tenant_id: Optional[str] = None,
        workspace_id: Optional[str] = None,
        current_user=Depends(require_api_key),
    ):
        requested_workspace_id = (
            enforce_workspace_access(current_user, workspace_id, tenant_id=tenant_id, minimum_role="viewer")
            if workspace_id
            else None
        )
        payload = runtime_status_payload()
        items = payload.get("items") if isinstance(payload.get("items"), list) else []
        allowed = allowed_workspace_ids(current_user)
        filtered = []
        for item in items:
            if not isinstance(item, dict):
                continue
            item_tenant_id = str(item.get("tenant_id") or "default").strip() or "default"
            item_workspace_id = str(item.get("workspace_id") or "default").strip() or "default"
            if tenant_id and item_tenant_id != str(tenant_id).strip():
                continue
            if requested_workspace_id and item_workspace_id != requested_workspace_id:
                continue
            if allowed is not None and item_workspace_id not in allowed:
                continue
            filtered.append(item)
        payload["items"] = filtered
        payload["summary"] = {
            **(payload.get("summary") if isinstance(payload.get("summary"), dict) else {}),
            "known": len(filtered),
            "online": sum(1 for item in filtered if bool(item.get("online"))),
            "busy": sum(1 for item in filtered if bool(item.get("current_run_id"))),
            "idle": sum(1 for item in filtered if bool(item.get("online")) and not bool(item.get("current_run_id"))),
            "offline": sum(1 for item in filtered if not bool(item.get("online"))),
            "suspended": sum(1 for item in filtered if str(item.get("control_state") or "").strip().lower() == "suspended"),
            "revoked": sum(1 for item in filtered if str(item.get("control_state") or "").strip().lower() == "revoked"),
        }
        return payload

    @app.post("/machines/enroll", dependencies=[Depends(require_api_key)])
    async def enroll_machine(
        payload: Optional[MachineEnrollPayload] = None,
        current_user=Depends(require_api_key),
    ):
        body = payload or MachineEnrollPayload()
        workspace_id = enforce_workspace_access(
            current_user,
            body.workspace_id,
            tenant_id=body.tenant_id,
            minimum_role="member",
            capability_id="machines.manage",
        )
        tenant_id = workspace_tenant_id(current_user, workspace_id)
        enrollment_scope = workspace_machine_enrollment_scope(current_user, workspace_id)
        if enrollment_scope == "tenant" and workspace_role(current_user, workspace_id) != "owner":
            raise HTTPException(status_code=403, detail="Owner role required for tenant-scoped machine enrollment.")
        if enrollment_scope == "global" and not bool((current_user or {}).get("is_admin")):
            raise HTTPException(status_code=403, detail="Admin role required for global machine enrollment.")
        result = local_queue.handle_enroll_local_runtime(
            tenant_id=tenant_id,
            workspace_id=workspace_id,
            machine_id=body.machine_id,
            runtime_type=body.runtime_type,
            display_name=body.display_name,
            platform=body.platform,
            policy_mode=body.policy_mode,
            capabilities=body.capabilities,
            execution_targets=body.execution_targets,
            note=body.note,
            machine_enrollment_scope=enrollment_scope,
        )
        if workspace_role(current_user, workspace_id) == "owner":
            grant_workspace_owner_machine_trust(workspace_id, str(result.get("machine_id") or "").strip())
        return result

    @app.post("/machines/enrollment-intents", dependencies=[Depends(require_api_key)])
    async def create_machine_enrollment_intent(
        payload: Optional[MachineEnrollPayload] = None,
        current_user=Depends(require_api_key),
    ):
        body = payload or MachineEnrollPayload()
        workspace_id = enforce_workspace_access(
            current_user,
            body.workspace_id,
            tenant_id=body.tenant_id,
            minimum_role="member",
            capability_id="machines.manage",
        )
        tenant_id = workspace_tenant_id(current_user, workspace_id)
        enrollment_scope = workspace_machine_enrollment_scope(current_user, workspace_id)
        if enrollment_scope == "tenant" and workspace_role(current_user, workspace_id) != "owner":
            raise HTTPException(status_code=403, detail="Owner role required for tenant-scoped machine enrollment.")
        if enrollment_scope == "global" and not bool((current_user or {}).get("is_admin")):
            raise HTTPException(status_code=403, detail="Admin role required for global machine enrollment.")
        result = local_queue.create_machine_enrollment_intent(
            tenant_id=tenant_id,
            workspace_id=workspace_id,
            machine_id=body.machine_id,
            runtime_type=body.runtime_type,
            display_name=body.display_name,
            platform=body.platform,
            policy_mode=body.policy_mode,
            capabilities=body.capabilities,
            execution_targets=body.execution_targets,
            note=body.note,
            machine_enrollment_scope=enrollment_scope,
        )
        if workspace_role(current_user, workspace_id) == "owner":
            grant_workspace_owner_machine_trust(workspace_id, str(result.get("machine_id") or "").strip())
        return result

    @app.post("/machines/{machine_id}/enrollment-state", dependencies=[Depends(require_api_key)])
    async def update_machine_enrollment_state(machine_id: str, payload: MachineEnrollmentStatePayload):
        return local_queue.update_machine_enrollment_state(
            machine_id,
            enrollment_token=payload.enrollment_token,
            state=payload.state,
            error=payload.error,
        )

    @app.post("/machines/{machine_id}/bootstrap-complete", dependencies=[Depends(require_api_key)])
    async def complete_machine_bootstrap(machine_id: str, payload: MachineBootstrapCompletePayload):
        return local_queue.complete_machine_bootstrap(
            machine_id,
            enrollment_token=payload.enrollment_token,
        )

    @app.delete("/machines/{machine_id}", dependencies=[Depends(require_api_key)])
    async def delete_machine(machine_id: str, current_user=Depends(require_api_key)):
        status_payload = local_queue.handle_get_local_workers_status()
        items = status_payload.get("items") if isinstance(status_payload.get("items"), list) else []
        machine = next(
            (
                item
                for item in items
                if isinstance(item, dict)
                and str(item.get("machine_id") or item.get("runtime_id") or "").strip() == str(machine_id or "").strip()
            ),
            None,
        )
        workspace_id = enforce_workspace_access(
            current_user,
            (machine or {}).get("workspace_id") or "default",
            tenant_id=(machine or {}).get("tenant_id"),
            minimum_role="member",
            capability_id="machines.manage",
        )
        result = local_queue.handle_delete_local_runtime(machine_id)
        revoke_workspace_owner_machine_trust(workspace_id, str(machine_id or "").strip())
        return result

    @app.post("/machines/{machine_id}/suspend", dependencies=[Depends(require_api_key)])
    async def suspend_machine(
        machine_id: str,
        payload: Optional[MachineControlPayload] = None,
        current_user=Depends(require_api_key),
    ):
        status_payload = local_queue.handle_get_local_workers_status()
        items = status_payload.get("items") if isinstance(status_payload.get("items"), list) else []
        machine = next(
            (
                item
                for item in items
                if isinstance(item, dict)
                and str(item.get("machine_id") or item.get("runtime_id") or "").strip() == str(machine_id or "").strip()
            ),
            None,
        )
        enforce_workspace_access(
            current_user,
            (machine or {}).get("workspace_id") or "default",
            tenant_id=(machine or {}).get("tenant_id"),
            minimum_role="member",
            capability_id="machines.manage",
        )
        body = payload or MachineControlPayload()
        return local_queue.handle_set_local_runtime_control(machine_id, action="suspend", reason=body.reason)

    @app.post("/machines/{machine_id}/resume", dependencies=[Depends(require_api_key)])
    async def resume_machine(
        machine_id: str,
        payload: Optional[MachineControlPayload] = None,
        current_user=Depends(require_api_key),
    ):
        status_payload = local_queue.handle_get_local_workers_status()
        items = status_payload.get("items") if isinstance(status_payload.get("items"), list) else []
        machine = next(
            (
                item
                for item in items
                if isinstance(item, dict)
                and str(item.get("machine_id") or item.get("runtime_id") or "").strip() == str(machine_id or "").strip()
            ),
            None,
        )
        enforce_workspace_access(
            current_user,
            (machine or {}).get("workspace_id") or "default",
            tenant_id=(machine or {}).get("tenant_id"),
            minimum_role="member",
            capability_id="machines.manage",
        )
        body = payload or MachineControlPayload()
        return local_queue.handle_set_local_runtime_control(machine_id, action="resume", reason=body.reason)

    @app.get("/local/workers/status", dependencies=[Depends(require_api_key)])
    async def get_legacy_local_workers_status():
        return legacy_local_workers_status_payload()

    @app.post("/runtime/runtimes/{runtime_id}/register", dependencies=[Depends(require_api_key)])
    async def register_runtime(runtime_id: str, payload: Optional[RuntimeRegisterPayload] = None):
        runtime_token = str(runtime_id or "").strip()
        if not runtime_token:
            raise HTTPException(status_code=400, detail="runtime_id is required.")
        body = payload or RuntimeRegisterPayload()
        registration = local_queue._upsert_runtime_registration(
            runtime_token,
            runtime_type=body.runtime_type,
            display_name=body.display_name,
            platform=body.platform,
            policy_mode=body.policy_mode,
            capabilities=body.capabilities,
            execution_targets=body.execution_targets or ["local"],
            instance_id=body.instance_id,
            capability_digest=body.capability_digest,
            permission_probe=body.permission_probe,
        )
        heartbeat = local_queue.LocalWorkerHeartbeatPayload(
            current_run_id=body.current_run_id,
            note=body.note or "runtime_registered",
            permission_probe=body.permission_probe,
        )
        local_queue.handle_heartbeat_local_worker(runtime_token, heartbeat)
        status_payload = local_queue.handle_get_local_workers_status()
        items = status_payload.get("items") if isinstance(status_payload.get("items"), list) else []
        item = next(
            (
                _runtime_summary_from_worker_item(candidate)
                for candidate in items
                if isinstance(candidate, dict)
                and str(candidate.get("runtime_id") or candidate.get("worker_id") or "").strip() == runtime_token
            ),
            None,
        )
        return {
            "ok": True,
            "runtime": item,
            "session_token": registration.get("session_token"),
            "machine_id": registration.get("machine_id") or runtime_token,
            "instance_id": registration.get("instance_id"),
            "capability_digest": registration.get("capability_digest"),
            "session_issued_at": registration.get("session_issued_at"),
        }

    @app.post("/runtime/runtimes/{runtime_id}/heartbeat", dependencies=[Depends(require_api_key)])
    async def heartbeat_runtime(runtime_id: str, payload: Optional[RuntimeHeartbeatPayload] = None):
        runtime_token = str(runtime_id or "").strip()
        if not runtime_token:
            raise HTTPException(status_code=400, detail="runtime_id is required.")
        body = payload or RuntimeHeartbeatPayload()
        local_queue._assert_runtime_session(runtime_token, body.session_token, instance_id=body.instance_id)
        local_payload = local_queue.LocalWorkerHeartbeatPayload(
            current_run_id=body.current_run_id,
            note=body.note or "runtime_heartbeat",
            permission_probe=body.permission_probe,
        )
        result = local_queue.handle_heartbeat_local_worker(runtime_token, local_payload)
        return {
            "ok": True,
            "runtime_id": runtime_token,
            "current_task_id": result.get("current_run_id"),
            "last_seen_at": result.get("last_seen_at"),
        }

    @app.post("/runtime/tasks/claim", dependencies=[Depends(require_api_key)])
    async def claim_runtime_task(body: Optional[RuntimeTaskClaimRequest] = None):
        payload = body or RuntimeTaskClaimRequest()
        runtime_token = str(payload.runtime_id or "").strip()
        if not runtime_token:
            raise HTTPException(status_code=400, detail="runtime_id is required.")
        local_queue._assert_runtime_session(runtime_token, payload.session_token, instance_id=payload.instance_id)
        requested_target = str(payload.execution_target or "local").strip().lower()
        if requested_target not in {"local", "local_companion"}:
            raise HTTPException(status_code=400, detail="Only local execution_target is supported by this runtime bridge.")
        result = local_queue.handle_claim_local_run(
            local_queue.LocalRunClaimRequest(
                worker_id=runtime_token,
                required_capabilities=list(payload.required_capabilities or []),
            )
        )
        run = result.get("run") if isinstance(result.get("run"), dict) else None
        return {
            "ok": True,
            "runtime_id": result.get("worker_id") or runtime_token,
            "task": _task_summary_from_local_claim(run) if isinstance(run, dict) else None,
        }

    @app.post("/runtime/tasks/{task_id}/heartbeat", dependencies=[Depends(require_api_key)])
    async def heartbeat_runtime_task(task_id: uuid.UUID, payload: Optional[RuntimeTaskHeartbeatPayload] = None):
        body = payload or RuntimeTaskHeartbeatPayload()
        runtime_token = str(body.runtime_id or "").strip()
        local_queue._assert_runtime_session(runtime_token, body.session_token, instance_id=body.instance_id)
        local_payload = local_queue.LocalRunHeartbeatPayload(
            worker_id=runtime_token or None,
            note=body.note or "runtime_task_heartbeat",
            event=(dict(body.event) if isinstance(body.event, dict) else None),
        )
        result = local_queue.handle_heartbeat_local_run(task_id, local_payload)
        return {
            "ok": True,
            "task_id": str(task_id),
            "last_heartbeat_at": result.get("last_heartbeat_at"),
        }

    @app.post("/runtime/tasks/{task_id}/control-state", dependencies=[Depends(require_api_key)])
    async def get_runtime_task_control_state(task_id: uuid.UUID, payload: Optional[RuntimeTaskControlStatePayload] = None):
        body = payload or RuntimeTaskControlStatePayload()
        runtime_token = str(body.runtime_id or "").strip()
        local_queue._assert_runtime_session(runtime_token, body.session_token, instance_id=body.instance_id)
        result = local_queue.handle_get_local_run_control_state(
            task_id,
            local_queue.LocalRunControlStatePayload(worker_id=runtime_token or None),
        )
        return {"ok": True, "task_id": str(task_id), **result}

    @app.post("/runtime/tasks/{task_id}/complete", dependencies=[Depends(require_api_key)])
    async def complete_runtime_task(task_id: uuid.UUID, payload: RuntimeTaskCompletePayload):
        local_queue._assert_runtime_session(str(payload.runtime_id or "").strip(), payload.session_token, instance_id=payload.instance_id)
        result = local_queue.handle_complete_local_run(
            task_id,
            local_queue.LocalRunCompletePayload(
                worker_id=(str(payload.runtime_id or "").strip() or None),
                result_text=payload.result_text,
                result_data=payload.result_data,
                usage_masked=payload.usage_masked,
            ),
        )
        return {"ok": True, "task_id": str(task_id), **result}

    @app.post("/runtime/tasks/{task_id}/pause", dependencies=[Depends(require_api_key)])
    async def pause_runtime_task(task_id: uuid.UUID, payload: RuntimeTaskPausePayload):
        local_queue._assert_runtime_session(str(payload.runtime_id or "").strip(), payload.session_token, instance_id=payload.instance_id)
        result = local_queue.handle_pause_local_run(
            task_id,
            local_queue.LocalRunPausePayload(
                worker_id=(str(payload.runtime_id or "").strip() or None),
                result_text=payload.result_text,
                result_data=payload.result_data,
                browser_checkpoint=payload.browser_checkpoint,
                wait_reason=payload.wait_reason,
            ),
        )
        return {"ok": True, "task_id": str(task_id), **result}

    @app.post("/runtime/tasks/{task_id}/fail", dependencies=[Depends(require_api_key)])
    async def fail_runtime_task(task_id: uuid.UUID, payload: RuntimeTaskFailPayload):
        local_queue._assert_runtime_session(str(payload.runtime_id or "").strip(), payload.session_token, instance_id=payload.instance_id)
        result = local_queue.handle_fail_local_run(
            task_id,
            local_queue.LocalRunFailPayload(
                worker_id=(str(payload.runtime_id or "").strip() or None),
                error=payload.error,
            ),
        )
        return {"ok": True, "task_id": str(task_id), **result}
