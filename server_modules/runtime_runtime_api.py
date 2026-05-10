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
from sse_starlette.sse import EventSourceResponse
from starlette.concurrency import iterate_in_threadpool, run_in_threadpool

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
from server_modules import agent_registry_repository, demo_workflows, local_queue, machine_capability_check
from server_modules import outbox_service
from server_modules import run_state_repository, runs_output, shared, telemetry
from server_modules import billing_service, entitlements_service
from server_modules import security_audit_service

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
    prewarm_state: Optional[str] = None
    warm_pool: Optional[str] = None
    current_run_id: Optional[str] = None
    note: Optional[str] = None
    permission_probe: Dict[str, Dict[str, Any]] = Field(default_factory=dict)
    runtime_role: Optional[str] = None
    install_id: Optional[str] = None
    specialist_key: Optional[str] = None
    summary_channel: Optional[str] = None
    artifact_channel: Optional[str] = None
    local_private_memory_only: Optional[bool] = None
    summary_text: Optional[str] = None
    artifacts: Optional[List[Dict[str, Any]]] = None
    health_state: Optional[str] = None


class RuntimeCompanionBootstrapPayload(RuntimeRegisterPayload):
    runtime_type: str = "local_companion"
    enrollment_token: str = Field(min_length=1)


class SelfHostedNodeEnrollPayload(BaseModel):
    enrollment_token: str = Field(min_length=1)
    public_key: str = Field(min_length=8)
    node_kind: Optional[Literal["mac_mini", "mac", "linux_server", "docker_host"]] = None
    capabilities: List[str] = Field(default_factory=list)
    max_concurrent_sessions: Optional[int] = Field(default=None, ge=1, le=64)
    root_policy: Dict[str, Any] = Field(default_factory=dict)
    display_name: Optional[str] = None


class SelfHostedNodeHeartbeatPayload(BaseModel):
    node_session_token: str = Field(min_length=1)
    status: Optional[str] = None
    note: Optional[str] = None
    capabilities: List[str] = Field(default_factory=list)
    health_state: Optional[str] = None


class SelfHostedNodeCommandEnqueuePayload(BaseModel):
    workspace_id: str = Field(min_length=1)
    runtime_node_id: str = Field(min_length=1)
    agent_id: str = Field(min_length=1)
    command_type: str = Field(default="runtime_action", min_length=1)
    command_payload: Dict[str, Any] = Field(default_factory=dict)
    ttl_seconds: Optional[int] = Field(default=None, ge=30, le=3600)


class SelfHostedNodeCommandClaimPayload(BaseModel):
    node_session_token: str = Field(min_length=1)
    max_commands: int = Field(default=1, ge=1, le=50)
    lease_seconds: int = Field(default=120, ge=15, le=600)


class SelfHostedNodeCommandResultPayload(BaseModel):
    node_session_token: str = Field(min_length=1)
    status: Literal["completed", "failed"]
    result_payload: Dict[str, Any] = Field(default_factory=dict)
    artifacts: List[Dict[str, Any]] = Field(default_factory=list)
    audit_references: List[Dict[str, Any]] = Field(default_factory=list)
    error: Optional[str] = None


class RuntimeHeartbeatPayload(BaseModel):
    session_token: Optional[str] = None
    instance_id: Optional[str] = None
    current_run_id: Optional[str] = None
    note: Optional[str] = None
    permission_probe: Dict[str, Dict[str, Any]] = Field(default_factory=dict)
    runtime_role: Optional[str] = None
    install_id: Optional[str] = None
    specialist_key: Optional[str] = None
    summary_channel: Optional[str] = None
    artifact_channel: Optional[str] = None
    local_private_memory_only: Optional[bool] = None
    summary_text: Optional[str] = None
    artifacts: Optional[List[Dict[str, Any]]] = None
    health_state: Optional[str] = None
    lifecycle_reason: Optional[str] = None


class LocalClusterLifecyclePayload(BaseModel):
    session_token: Optional[str] = None
    instance_id: Optional[str] = None
    current_run_id: Optional[str] = None
    note: Optional[str] = None
    reason: Optional[str] = None
    permission_probe: Dict[str, Dict[str, Any]] = Field(default_factory=dict)
    runtime_role: Optional[str] = None
    install_id: Optional[str] = None
    specialist_key: Optional[str] = None
    summary_channel: Optional[str] = None
    artifact_channel: Optional[str] = None
    local_private_memory_only: Optional[bool] = None
    summary_text: Optional[str] = None
    artifacts: Optional[List[Dict[str, Any]]] = None
    health_state: Optional[str] = None


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


def _workspace_entitlement_payload(
    cache: Dict[str, Dict[str, Any]],
    workspace_id: str,
) -> Dict[str, Any]:
    token = str(workspace_id or "default").strip() or "default"
    payload = cache.get(token)
    if payload is None:
        payload = entitlements_service.workspace_entitlement_payload_for_workspace_id(workspace_id=token)
        cache[token] = payload
    return payload


def _ensure_advanced_features_access(workspace_id: str) -> None:
    workspace_token = str(workspace_id or "default").strip() or "default"
    payload = entitlements_service.workspace_entitlement_payload_for_workspace_id(
        workspace_id=workspace_token,
    )
    capabilities = payload.get("capabilities") if isinstance(payload.get("capabilities"), dict) else {}
    if str(payload.get("source") or "").strip().lower() == "default":
        return
    billing_summary = billing_service.workspace_billing_summary_for_workspace_id(workspace_token)
    subscription = billing_summary.get("subscription") if isinstance(billing_summary, dict) and isinstance(billing_summary.get("subscription"), dict) else {}
    billing_metadata = subscription.get("metadata") if isinstance(subscription.get("metadata"), dict) else {}
    if (
        str(billing_metadata.get("source") or "").strip().lower() == "workspace_default"
        and str(payload.get("source") or "").strip().lower() in {"default", "workspace_billing"}
    ):
        return
    if not bool(capabilities.get("advanced_features_enabled")):
        raise HTTPException(
            status_code=403,
            detail="Advanced runtime controls are not included in this workspace plan.",
        )


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


class DesktopSetupPayload(BaseModel):
    workspace_id: Optional[str] = None


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
        "connection_mode": str(item.get("connection_mode") or "direct_runtime_api").strip().lower() or "direct_runtime_api",
        "runtime_role": str(item.get("runtime_role") or "generic").strip().lower() or "generic",
        "install_id": str(item.get("install_id") or "").strip() or None,
        "specialist_key": str(item.get("specialist_key") or "").strip() or None,
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
        "lifecycle_state": item.get("lifecycle_state") or "registered",
        "lifecycle_state_updated_at": item.get("lifecycle_state_updated_at"),
        "lifecycle_reason": item.get("lifecycle_reason"),
        "started_at": item.get("started_at"),
        "last_started_at": item.get("last_started_at"),
        "stopped_at": item.get("stopped_at"),
        "recovery_requested_at": item.get("recovery_requested_at"),
        "last_recovered_at": item.get("last_recovered_at"),
        "last_recovered_run_ids": list(item.get("last_recovered_run_ids") or []),
        "last_resumed_run_ids": list(item.get("last_resumed_run_ids") or []),
        "health_state": item.get("health_state") or "unknown",
        "health_updated_at": item.get("health_updated_at"),
        "summary_channel": item.get("summary_channel"),
        "artifact_channel": item.get("artifact_channel"),
        "local_private_memory_only": bool(item.get("local_private_memory_only", True)),
        "last_summary": item.get("last_summary"),
        "last_summary_at": item.get("last_summary_at"),
        "last_artifacts": list(item.get("last_artifacts") or []),
        "last_artifact_at": item.get("last_artifact_at"),
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
        "prewarm_state": item.get("prewarm_state"),
        "warm_pool": item.get("warm_pool"),
        "queue_shard": item.get("queue_shard"),
    }


def _local_cluster_worker_payload(
    payload: Optional[LocalClusterLifecyclePayload | RuntimeHeartbeatPayload],
) -> local_queue.LocalWorkerHeartbeatPayload:
    body = payload or LocalClusterLifecyclePayload()
    return local_queue.LocalWorkerHeartbeatPayload(
        current_run_id=body.current_run_id,
        note=body.note,
        permission_probe=dict(body.permission_probe or {}),
        runtime_role=body.runtime_role,
        install_id=body.install_id,
        specialist_key=body.specialist_key,
        summary_channel=body.summary_channel,
        artifact_channel=body.artifact_channel,
        local_private_memory_only=body.local_private_memory_only,
        summary_text=body.summary_text,
        artifacts=body.artifacts,
        health_state=body.health_state,
        lifecycle_reason=getattr(body, "lifecycle_reason", None) or getattr(body, "reason", None),
    )


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

    @app.get("/desktop/setup/status", dependencies=[Depends(require_api_key)])
    async def get_desktop_setup_status(
        workspace_id: Optional[str] = None,
        current_user=Depends(require_api_key),
    ):
        requested_workspace_id = enforce_workspace_access(
            current_user,
            workspace_id or "default",
            minimum_role="viewer",
        )
        return machine_capability_check.desktop_setup_status(workspace_id=requested_workspace_id)

    @app.post("/desktop/setup/complete", dependencies=[Depends(require_api_key)])
    async def complete_desktop_setup(
        payload: Optional[DesktopSetupPayload] = None,
        current_user=Depends(require_api_key),
    ):
        body = payload or DesktopSetupPayload()
        requested_workspace_id = enforce_workspace_access(
            current_user,
            body.workspace_id or "default",
            minimum_role="member",
        )
        status_payload = machine_capability_check.desktop_setup_status(workspace_id=requested_workspace_id)
        if not bool(status_payload.get("can_continue")):
            raise HTTPException(status_code=409, detail="Desktop setup cannot be completed until all required checks pass.")
        record = machine_capability_check.mark_desktop_setup_completed(
            metadata={
                "workspace_id": requested_workspace_id,
                "actor_type": str((current_user or {}).get("auth_type") or "").strip() or "api_key",
                "user_id": str((current_user or {}).get("user_id") or "").strip() or None,
            }
        )
        return {
            "ok": True,
            "workspace_id": requested_workspace_id,
            "desktop_setup_completed": True,
            "updated_at": record.get("updated_at"),
        }

    @app.post("/desktop/demo/screenshot-description", dependencies=[Depends(require_api_key)])
    async def start_desktop_demo(
        payload: Optional[DesktopSetupPayload] = None,
        current_user=Depends(require_api_key),
    ):
        body = payload or DesktopSetupPayload()
        requested_workspace_id = enforce_workspace_access(
            current_user,
            body.workspace_id or "default",
            minimum_role="member",
        )
        return await demo_workflows.start_first_run_demo(
            workspace_id=requested_workspace_id,
            current_user=current_user,
        )

    @app.get("/desktop/demo/{run_id}", dependencies=[Depends(require_api_key)])
    async def get_desktop_demo_status(
        run_id: str,
        workspace_id: Optional[str] = None,
        current_user=Depends(require_api_key),
    ):
        requested_workspace_id = enforce_workspace_access(
            current_user,
            workspace_id or "default",
            minimum_role="viewer",
        )
        payload = demo_workflows.first_run_demo_status(run_id)
        if str(payload.get("workspace_id") or "default").strip() != requested_workspace_id:
            raise HTTPException(status_code=404, detail="Demo run not found in this workspace.")
        return payload

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
        entitlement_cache: Dict[str, Dict[str, Any]] = {}
        if requested_workspace_id:
            _ensure_advanced_features_access(requested_workspace_id)
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
            item_entitlements = _workspace_entitlement_payload(entitlement_cache, item_workspace_id)
            item_capabilities = item_entitlements.get("capabilities") if isinstance(item_entitlements.get("capabilities"), dict) else {}
            if not bool(item_capabilities.get("advanced_features_enabled")):
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
        _ensure_advanced_features_access(workspace_id)
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
        security_audit_service.emit_security_audit_event(
            action="runtime_target.machine_enrolled",
            tenant_id=tenant_id,
            workspace_id=workspace_id,
            current_user=current_user,
            machine_id=str(result.get("machine_id") or body.machine_id or "").strip() or None,
            trace_id=str(result.get("machine_id") or "").strip(),
            idempotency_key=f"runtime_target.machine_enrolled:{workspace_id}:{str(result.get('machine_id') or body.machine_id or '').strip()}",
            metadata={
                "runtime_type": body.runtime_type,
                "display_name": body.display_name,
                "machine_enrollment_scope": enrollment_scope,
            },
        )
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
        _ensure_advanced_features_access(workspace_id)
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
        security_audit_service.emit_security_audit_event(
            action="runtime_target.machine_enrollment_intent_created",
            tenant_id=tenant_id,
            workspace_id=workspace_id,
            current_user=current_user,
            machine_id=str(result.get("machine_id") or body.machine_id or "").strip() or None,
            trace_id=str(result.get("machine_id") or "").strip(),
            idempotency_key=f"runtime_target.machine_enrollment_intent_created:{workspace_id}:{str(result.get('machine_id') or body.machine_id or '').strip()}",
            metadata={
                "runtime_type": body.runtime_type,
                "display_name": body.display_name,
                "machine_enrollment_scope": enrollment_scope,
            },
        )
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
        _ensure_advanced_features_access(workspace_id)
        result = local_queue.handle_delete_local_runtime(machine_id)
        revoke_workspace_owner_machine_trust(workspace_id, str(machine_id or "").strip())
        security_audit_service.emit_security_audit_event(
            action="runtime_target.machine_deleted",
            tenant_id=str((machine or {}).get("tenant_id") or "default").strip() or "default",
            workspace_id=workspace_id,
            current_user=current_user,
            machine_id=str(machine_id or "").strip() or None,
            trace_id=str(machine_id or "").strip(),
            idempotency_key=f"runtime_target.machine_deleted:{workspace_id}:{str(machine_id or '').strip()}",
        )
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
        workspace_id = enforce_workspace_access(
            current_user,
            (machine or {}).get("workspace_id") or "default",
            tenant_id=(machine or {}).get("tenant_id"),
            minimum_role="member",
            capability_id="machines.manage",
        )
        _ensure_advanced_features_access(workspace_id)
        body = payload or MachineControlPayload()
        result = local_queue.handle_set_local_runtime_control(machine_id, action="suspend", reason=body.reason)
        security_audit_service.emit_security_audit_event(
            action="runtime_target.machine_suspended",
            tenant_id=str((machine or {}).get("tenant_id") or "default").strip() or "default",
            workspace_id=workspace_id,
            current_user=current_user,
            machine_id=str(machine_id or "").strip() or None,
            trace_id=str(machine_id or "").strip(),
            idempotency_key=f"runtime_target.machine_suspended:{workspace_id}:{str(machine_id or '').strip()}:{str(body.reason or '').strip()}",
            metadata={"reason": str(body.reason or "").strip() or None},
        )
        return result

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
        workspace_id = enforce_workspace_access(
            current_user,
            (machine or {}).get("workspace_id") or "default",
            tenant_id=(machine or {}).get("tenant_id"),
            minimum_role="member",
            capability_id="machines.manage",
        )
        _ensure_advanced_features_access(workspace_id)
        body = payload or MachineControlPayload()
        result = local_queue.handle_set_local_runtime_control(machine_id, action="resume", reason=body.reason)
        security_audit_service.emit_security_audit_event(
            action="runtime_target.machine_resumed",
            tenant_id=str((machine or {}).get("tenant_id") or "default").strip() or "default",
            workspace_id=workspace_id,
            current_user=current_user,
            machine_id=str(machine_id or "").strip() or None,
            trace_id=str(machine_id or "").strip(),
            idempotency_key=f"runtime_target.machine_resumed:{workspace_id}:{str(machine_id or '').strip()}:{str(body.reason or '').strip()}",
            metadata={"reason": str(body.reason or "").strip() or None},
        )
        return result

    @app.post("/machines/{machine_id}/hard-kill", dependencies=[Depends(require_api_key)])
    async def hard_kill_machine(
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
        workspace_id = enforce_workspace_access(
            current_user,
            (machine or {}).get("workspace_id") or "default",
            tenant_id=(machine or {}).get("tenant_id"),
            minimum_role="member",
            capability_id="machines.manage",
        )
        _ensure_advanced_features_access(workspace_id)
        body = payload or MachineControlPayload()
        requested_by = str((current_user or {}).get("user_id") or (current_user or {}).get("auth_type") or "operator").strip() or "operator"
        result = local_queue.handle_request_local_runtime_hard_kill(
            machine_id,
            reason=body.reason,
            requested_by=requested_by,
        )
        security_audit_service.emit_security_audit_event(
            action="runtime_target.machine_hard_killed",
            tenant_id=str((machine or {}).get("tenant_id") or "default").strip() or "default",
            workspace_id=workspace_id,
            current_user=current_user,
            machine_id=str(machine_id or "").strip() or None,
            trace_id=str(machine_id or "").strip(),
            idempotency_key=f"runtime_target.machine_hard_killed:{workspace_id}:{str(machine_id or '').strip()}:{requested_by}",
            metadata={"reason": str(body.reason or "").strip() or None},
        )
        return result

    @app.post("/runs/{run_id}/hard-kill", dependencies=[Depends(require_api_key)])
    async def hard_kill_run(
        run_id: uuid.UUID,
        payload: Optional[MachineControlPayload] = None,
        current_user=Depends(require_api_key),
    ):
        local_queue._init()
        run = local_queue._server.runs.get(str(run_id))
        if not isinstance(run, dict):
            raise HTTPException(status_code=404, detail="Run ID not found")
        context = run.get("context") if isinstance(run.get("context"), dict) else {}
        metadata = context.get("metadata") if isinstance(context.get("metadata"), dict) else {}
        workspace_id = enforce_workspace_access(
            current_user,
            context.get("workspace_id") or metadata.get("workspace_id") or "default",
            tenant_id=context.get("tenant_id") or metadata.get("tenant_id"),
            minimum_role="member",
        )
        body = payload or MachineControlPayload()
        requested_by = str((current_user or {}).get("user_id") or (current_user or {}).get("auth_type") or "operator").strip() or "operator"
        result = local_queue.handle_request_local_run_hard_kill(
            str(run_id),
            reason=body.reason,
            requested_by=requested_by,
        )
        result["workspace_id"] = workspace_id
        security_audit_service.emit_security_audit_event(
            action="runtime_target.run_hard_killed",
            tenant_id=context.get("tenant_id") or metadata.get("tenant_id") or "default",
            workspace_id=workspace_id,
            current_user=current_user,
            run_id=str(run_id),
            machine_id=str(run.get("machine_id") or run.get("local_worker_id") or "").strip() or None,
            trace_id=str(run_id),
            idempotency_key=f"runtime_target.run_hard_killed:{workspace_id}:{str(run_id)}:{requested_by}",
            metadata={"reason": str(body.reason or "").strip() or None},
        )
        return result

    @app.get("/local/workers/status", dependencies=[Depends(require_api_key)])
    async def get_legacy_local_workers_status():
        return await run_in_threadpool(legacy_local_workers_status_payload)

    @app.post("/runtime/runtimes/{runtime_id}/register", dependencies=[Depends(require_api_key)])
    async def register_runtime(runtime_id: str, payload: Optional[RuntimeRegisterPayload] = None):
        runtime_token = str(runtime_id or "").strip()
        if not runtime_token:
            raise HTTPException(status_code=400, detail="runtime_id is required.")
        body = payload or RuntimeRegisterPayload()
        def _register_runtime() -> tuple[Dict[str, Any], Dict[str, Any]]:
            registration = local_queue.handle_register_local_cluster_runtime(
                runtime_token,
                runtime_type=body.runtime_type,
                display_name=body.display_name,
                platform=body.platform,
                policy_mode=body.policy_mode,
                capabilities=body.capabilities,
                execution_targets=body.execution_targets or ["local"],
                instance_id=body.instance_id,
                capability_digest=body.capability_digest,
                prewarm_state=body.prewarm_state,
                warm_pool=body.warm_pool,
                permission_probe=body.permission_probe,
                runtime_role=body.runtime_role,
                install_id=body.install_id,
                specialist_key=body.specialist_key,
                summary_channel=body.summary_channel,
                artifact_channel=body.artifact_channel,
                local_private_memory_only=body.local_private_memory_only,
                note=body.note,
                summary_text=body.summary_text,
                artifacts=body.artifacts,
                health_state=body.health_state,
            )
            runtime = local_queue.handle_start_local_runtime(
                runtime_token,
                local_queue.LocalWorkerHeartbeatPayload(
                    current_run_id=body.current_run_id,
                    note=body.note or "runtime_registered",
                    permission_probe=body.permission_probe,
                    runtime_role=body.runtime_role,
                    install_id=body.install_id,
                    specialist_key=body.specialist_key,
                    summary_channel=body.summary_channel,
                    artifact_channel=body.artifact_channel,
                    local_private_memory_only=body.local_private_memory_only,
                    summary_text=body.summary_text,
                    artifacts=body.artifacts,
                    health_state=body.health_state,
                ),
            )
            return registration, runtime

        registration, runtime = await run_in_threadpool(_register_runtime)
        return {
            "ok": True,
            "runtime": _runtime_summary_from_worker_item(runtime.get("runtime") or {}),
            "session_token": registration.get("session_token"),
            "machine_id": registration.get("machine_id") or runtime_token,
            "instance_id": registration.get("instance_id"),
            "capability_digest": registration.get("capability_digest"),
            "session_issued_at": registration.get("session_issued_at"),
        }

    @app.post("/runtime/companions/{runtime_id}/bootstrap")
    async def bootstrap_runtime_companion(runtime_id: str, payload: RuntimeCompanionBootstrapPayload):
        runtime_token = str(runtime_id or "").strip()
        if not runtime_token:
            raise HTTPException(status_code=400, detail="runtime_id is required.")
        body = payload

        def _bootstrap_runtime() -> Dict[str, Any]:
            return local_queue.handle_bootstrap_enrolled_local_companion_runtime(
                runtime_token,
                enrollment_token=body.enrollment_token,
                runtime_type=body.runtime_type or "local_companion",
                display_name=body.display_name,
                platform=body.platform,
                policy_mode=body.policy_mode,
                capabilities=body.capabilities,
                execution_targets=body.execution_targets or ["local_companion"],
                instance_id=body.instance_id,
                capability_digest=body.capability_digest,
                prewarm_state=body.prewarm_state,
                warm_pool=body.warm_pool,
                permission_probe=body.permission_probe,
                runtime_role=body.runtime_role,
                install_id=body.install_id,
                specialist_key=body.specialist_key,
                summary_channel=body.summary_channel,
                artifact_channel=body.artifact_channel,
                local_private_memory_only=body.local_private_memory_only,
                note=body.note,
                current_run_id=body.current_run_id,
                summary_text=body.summary_text,
                artifacts=body.artifacts,
                health_state=body.health_state,
            )

        result = await run_in_threadpool(_bootstrap_runtime)
        return {
            "ok": True,
            "runtime": _runtime_summary_from_worker_item(result.get("runtime") or {}),
            "session_token": result.get("session_token"),
            "machine_id": result.get("machine_id") or runtime_token,
            "instance_id": result.get("instance_id"),
            "capability_digest": result.get("capability_digest"),
            "session_issued_at": result.get("session_issued_at"),
            "enrollment_bootstrap": True,
            "connection_mode": result.get("connection_mode") or "platform_relay",
        }

    @app.post("/runtime/self-hosted-nodes/{runtime_profile_id}/enroll")
    async def enroll_self_hosted_node(runtime_profile_id: str, payload: SelfHostedNodeEnrollPayload):
        try:
            result = await agent_registry_repository.enroll_self_hosted_runtime_profile(
                runtime_profile_id=runtime_profile_id,
                enrollment_token=payload.enrollment_token,
                public_key=payload.public_key,
                node_kind=payload.node_kind,
                capabilities=payload.capabilities,
                max_concurrent_sessions=payload.max_concurrent_sessions,
                root_policy=payload.root_policy,
                label=payload.display_name,
            )
        except ValueError as error:
            raise HTTPException(status_code=400, detail=str(error)) from error
        return {
            "ok": True,
            "runtime_profile_id": result.get("runtime_profile_id"),
            "runtime_node_id": result.get("runtime_node_id"),
            "workspace_id": result.get("workspace_id"),
            "node_session_token": result.get("node_session_token"),
            "owner_approval_required": True,
            "runtime_profile": result.get("runtime_profile"),
        }

    @app.post("/runtime/self-hosted-nodes/{runtime_profile_id}/heartbeat")
    async def heartbeat_self_hosted_node(runtime_profile_id: str, payload: SelfHostedNodeHeartbeatPayload):
        try:
            result = await agent_registry_repository.resolve_self_hosted_runtime_heartbeat(
                runtime_profile_id=runtime_profile_id,
                node_session_token=payload.node_session_token,
                status=payload.status or "idle",
                note=payload.note,
                capabilities=payload.capabilities,
                health_state=payload.health_state or "healthy",
            )
        except ValueError as error:
            raise HTTPException(status_code=400, detail=str(error)) from error
        return result

    @app.post("/runtime/self-hosted-nodes/{runtime_profile_id}/commands", dependencies=[Depends(require_api_key)])
    async def enqueue_self_hosted_node_command(
        runtime_profile_id: str,
        payload: SelfHostedNodeCommandEnqueuePayload,
        current_user: Dict[str, Any] = Depends(require_api_key),
    ):
        workspace_id = enforce_workspace_access(current_user, payload.workspace_id)
        role = workspace_role(current_user, workspace_id)
        if role not in {"owner", "admin"} and not bool((current_user or {}).get("is_admin")):
            raise HTTPException(status_code=403, detail="Workspace owner or admin role is required.")
        _ensure_advanced_features_access(workspace_id)
        tenant_id = workspace_tenant_id(current_user, workspace_id)
        try:
            result = await agent_registry_repository.enqueue_self_hosted_runtime_command(
                runtime_profile_id=runtime_profile_id,
                tenant_id=tenant_id,
                workspace_id=workspace_id,
                runtime_node_id=payload.runtime_node_id,
                agent_id=payload.agent_id,
                command_type=payload.command_type,
                command_payload=payload.command_payload,
                requested_by_user_id=str((current_user or {}).get("user_id") or "").strip() or None,
                ttl_seconds=payload.ttl_seconds or agent_registry_repository.SELF_HOSTED_NODE_COMMAND_DEFAULT_TTL_SECONDS,
            )
        except ValueError as error:
            raise HTTPException(status_code=400, detail=str(error)) from error
        return result

    @app.post("/runtime/self-hosted-nodes/{runtime_profile_id}/commands/claim")
    async def claim_self_hosted_node_commands(runtime_profile_id: str, payload: SelfHostedNodeCommandClaimPayload):
        try:
            return await agent_registry_repository.claim_self_hosted_runtime_commands(
                runtime_profile_id=runtime_profile_id,
                node_session_token=payload.node_session_token,
                max_commands=payload.max_commands,
                lease_seconds=payload.lease_seconds,
            )
        except ValueError as error:
            raise HTTPException(status_code=400, detail=str(error)) from error

    @app.post("/runtime/self-hosted-nodes/{runtime_profile_id}/commands/{command_id}/result")
    async def complete_self_hosted_node_command(
        runtime_profile_id: str,
        command_id: str,
        payload: SelfHostedNodeCommandResultPayload,
    ):
        try:
            return await agent_registry_repository.complete_self_hosted_runtime_command(
                runtime_profile_id=runtime_profile_id,
                node_session_token=payload.node_session_token,
                command_id=command_id,
                status=payload.status,
                result_payload=payload.result_payload,
                artifacts=payload.artifacts,
                audit_references=payload.audit_references,
                error=payload.error,
            )
        except ValueError as error:
            raise HTTPException(status_code=400, detail=str(error)) from error

    @app.post("/runtime/runtimes/{runtime_id}/heartbeat")
    async def heartbeat_runtime(runtime_id: str, payload: Optional[RuntimeHeartbeatPayload] = None):
        runtime_token = str(runtime_id or "").strip()
        if not runtime_token:
            raise HTTPException(status_code=400, detail="runtime_id is required.")
        body = payload or RuntimeHeartbeatPayload()
        local_payload = _local_cluster_worker_payload(body)
        if not str(local_payload.note or "").strip():
            local_payload.note = "runtime_heartbeat"
        def _heartbeat_runtime() -> Dict[str, Any]:
            local_queue._assert_runtime_session(runtime_token, body.session_token, instance_id=body.instance_id)
            return local_queue.handle_heartbeat_local_runtime(runtime_token, local_payload)

        result = await run_in_threadpool(_heartbeat_runtime)
        return {
            "ok": True,
            "runtime_id": runtime_token,
            "current_task_id": result.get("current_run_id"),
            "last_seen_at": result.get("last_seen_at"),
            "runtime": _runtime_summary_from_worker_item(result.get("runtime") or {}),
        }

    @app.post("/runtime/local-cluster/{runtime_id}/register", dependencies=[Depends(require_api_key)])
    async def register_local_cluster_runtime(runtime_id: str, payload: Optional[RuntimeRegisterPayload] = None):
        runtime_token = str(runtime_id or "").strip()
        if not runtime_token:
            raise HTTPException(status_code=400, detail="runtime_id is required.")
        body = payload or RuntimeRegisterPayload()
        result = await run_in_threadpool(
            local_queue.handle_register_local_cluster_runtime,
            runtime_token,
            runtime_type=body.runtime_type,
            display_name=body.display_name,
            platform=body.platform,
            policy_mode=body.policy_mode,
            capabilities=body.capabilities,
            execution_targets=body.execution_targets or ["local_companion"],
            instance_id=body.instance_id,
            capability_digest=body.capability_digest,
            prewarm_state=body.prewarm_state,
            warm_pool=body.warm_pool,
            permission_probe=body.permission_probe,
            runtime_role=body.runtime_role,
            install_id=body.install_id,
            specialist_key=body.specialist_key,
            summary_channel=body.summary_channel,
            artifact_channel=body.artifact_channel,
            local_private_memory_only=body.local_private_memory_only,
            note=body.note,
            summary_text=body.summary_text,
            artifacts=body.artifacts,
            health_state=body.health_state,
        )
        result["runtime"] = _runtime_summary_from_worker_item(result.get("runtime") or {})
        return result

    @app.post("/runtime/local-cluster/{runtime_id}/start")
    async def start_local_cluster_runtime(runtime_id: str, payload: Optional[LocalClusterLifecyclePayload] = None):
        runtime_token = str(runtime_id or "").strip()
        if not runtime_token:
            raise HTTPException(status_code=400, detail="runtime_id is required.")
        body = payload or LocalClusterLifecyclePayload()
        def _start_runtime() -> Dict[str, Any]:
            local_queue._assert_runtime_session(runtime_token, body.session_token, instance_id=body.instance_id)
            return local_queue.handle_start_local_runtime(runtime_token, _local_cluster_worker_payload(body))

        result = await run_in_threadpool(_start_runtime)
        result["runtime"] = _runtime_summary_from_worker_item(result.get("runtime") or {})
        return result

    @app.get("/runtime/local-cluster/{runtime_id}/health", dependencies=[Depends(require_api_key)])
    async def get_local_cluster_runtime_health(runtime_id: str):
        runtime_token = str(runtime_id or "").strip()
        if not runtime_token:
            raise HTTPException(status_code=400, detail="runtime_id is required.")
        result = await run_in_threadpool(local_queue.handle_get_local_runtime_health, runtime_token)
        result["runtime"] = _runtime_summary_from_worker_item(result.get("runtime") or {})
        return result

    @app.post("/runtime/local-cluster/{runtime_id}/heartbeat")
    async def heartbeat_local_cluster_runtime(runtime_id: str, payload: Optional[LocalClusterLifecyclePayload] = None):
        runtime_token = str(runtime_id or "").strip()
        if not runtime_token:
            raise HTTPException(status_code=400, detail="runtime_id is required.")
        body = payload or LocalClusterLifecyclePayload()
        def _heartbeat_local_cluster_runtime() -> Dict[str, Any]:
            local_queue._assert_runtime_session(runtime_token, body.session_token, instance_id=body.instance_id)
            return local_queue.handle_heartbeat_local_runtime(runtime_token, _local_cluster_worker_payload(body))

        result = await run_in_threadpool(_heartbeat_local_cluster_runtime)
        result["runtime"] = _runtime_summary_from_worker_item(result.get("runtime") or {})
        return result

    @app.post("/runtime/local-cluster/{runtime_id}/stop")
    async def stop_local_cluster_runtime(runtime_id: str, payload: Optional[LocalClusterLifecyclePayload] = None):
        runtime_token = str(runtime_id or "").strip()
        if not runtime_token:
            raise HTTPException(status_code=400, detail="runtime_id is required.")
        body = payload or LocalClusterLifecyclePayload()
        def _stop_runtime() -> Dict[str, Any]:
            local_queue._assert_runtime_session(runtime_token, body.session_token, instance_id=body.instance_id)
            return local_queue.handle_stop_local_runtime(
                runtime_token,
                reason=body.reason,
                note=body.note,
                summary_text=body.summary_text,
                artifacts=body.artifacts,
                health_state=body.health_state,
            )

        result = await run_in_threadpool(_stop_runtime)
        result["runtime"] = _runtime_summary_from_worker_item(result.get("runtime") or {})
        return result

    @app.post("/runtime/local-cluster/{runtime_id}/revoke", dependencies=[Depends(require_api_key)])
    async def revoke_local_cluster_runtime(runtime_id: str, payload: Optional[LocalClusterLifecyclePayload] = None):
        runtime_token = str(runtime_id or "").strip()
        if not runtime_token:
            raise HTTPException(status_code=400, detail="runtime_id is required.")
        body = payload or LocalClusterLifecyclePayload()
        result = await run_in_threadpool(local_queue.handle_revoke_local_runtime, runtime_token, reason=body.reason)
        result["machine"] = _runtime_summary_from_worker_item(result.get("machine") or {})
        return result

    @app.post("/runtime/local-cluster/{runtime_id}/recover")
    async def recover_local_cluster_runtime(runtime_id: str, payload: Optional[LocalClusterLifecyclePayload] = None):
        runtime_token = str(runtime_id or "").strip()
        if not runtime_token:
            raise HTTPException(status_code=400, detail="runtime_id is required.")
        body = payload or LocalClusterLifecyclePayload()
        def _recover_runtime() -> Dict[str, Any]:
            local_queue._assert_runtime_session(runtime_token, body.session_token, instance_id=body.instance_id)
            return local_queue.handle_recover_local_runtime(runtime_token, _local_cluster_worker_payload(body))

        result = await run_in_threadpool(_recover_runtime)
        result["runtime"] = _runtime_summary_from_worker_item(result.get("runtime") or {})
        return result

    @app.get("/runtime/runtimes/{runtime_id}/control/stream")
    async def stream_runtime_control(
        runtime_id: str,
        session_token: Optional[str] = None,
        instance_id: Optional[str] = None,
        since_sequence: int = 0,
        include_backlog: bool = True,
        heartbeat_seconds: float = 5.0,
        timeout_seconds: float = 30.0,
    ):
        runtime_token = str(runtime_id or "").strip()
        if not runtime_token:
            raise HTTPException(status_code=400, detail="runtime_id is required.")
        local_queue._assert_runtime_session(runtime_token, session_token, instance_id=instance_id)
        safe_heartbeat = max(1.0, min(float(heartbeat_seconds), 60.0))
        return EventSourceResponse(
            iterate_in_threadpool(
                local_queue.iter_runtime_control_stream(
                    runtime_token,
                    since_sequence=max(0, int(since_sequence or 0)),
                    include_backlog=bool(include_backlog),
                    heartbeat_seconds=safe_heartbeat,
                    timeout_seconds=max(safe_heartbeat, min(float(timeout_seconds or 30.0), 300.0)),
                )
            ),
            ping=max(3, int(safe_heartbeat)),
        )

    @app.post("/runtime/tasks/claim")
    async def claim_runtime_task(body: Optional[RuntimeTaskClaimRequest] = None):
        payload = body or RuntimeTaskClaimRequest()
        runtime_token = str(payload.runtime_id or "").strip()
        if not runtime_token:
            raise HTTPException(status_code=400, detail="runtime_id is required.")
        requested_target = str(payload.execution_target or "local").strip().lower()
        if requested_target not in {"local", "local_companion"}:
            raise HTTPException(status_code=400, detail="Only local execution_target is supported by this runtime bridge.")
        def _claim_task() -> Dict[str, Any]:
            local_queue._assert_runtime_session(runtime_token, payload.session_token, instance_id=payload.instance_id)
            return local_queue.handle_claim_local_run(
                local_queue.LocalRunClaimRequest(
                    worker_id=runtime_token,
                    required_capabilities=list(payload.required_capabilities or []),
                )
            )

        result = await run_in_threadpool(_claim_task)
        run = result.get("run") if isinstance(result.get("run"), dict) else None
        return {
            "ok": True,
            "runtime_id": result.get("worker_id") or runtime_token,
            "task": _task_summary_from_local_claim(run) if isinstance(run, dict) else None,
        }

    @app.post("/runtime/tasks/{task_id}/heartbeat")
    async def heartbeat_runtime_task(task_id: uuid.UUID, payload: Optional[RuntimeTaskHeartbeatPayload] = None):
        body = payload or RuntimeTaskHeartbeatPayload()
        runtime_token = str(body.runtime_id or "").strip()
        local_payload = local_queue.LocalRunHeartbeatPayload(
            worker_id=runtime_token or None,
            note=body.note or "runtime_task_heartbeat",
            event=(dict(body.event) if isinstance(body.event, dict) else None),
        )
        def _heartbeat_task() -> Dict[str, Any]:
            local_queue._assert_runtime_session(runtime_token, body.session_token, instance_id=body.instance_id)
            return local_queue.handle_heartbeat_local_run(task_id, local_payload)

        result = await run_in_threadpool(_heartbeat_task)
        return {
            "ok": True,
            "task_id": str(task_id),
            "last_heartbeat_at": result.get("last_heartbeat_at"),
        }

    @app.post("/runtime/tasks/{task_id}/control-state")
    async def get_runtime_task_control_state(task_id: uuid.UUID, payload: Optional[RuntimeTaskControlStatePayload] = None):
        body = payload or RuntimeTaskControlStatePayload()
        runtime_token = str(body.runtime_id or "").strip()
        def _get_control_state() -> Dict[str, Any]:
            local_queue._assert_runtime_session(runtime_token, body.session_token, instance_id=body.instance_id)
            return local_queue.handle_get_local_run_control_state(
                task_id,
                local_queue.LocalRunControlStatePayload(worker_id=runtime_token or None),
            )

        result = await run_in_threadpool(_get_control_state)
        return {"ok": True, "task_id": str(task_id), **result}

    @app.post("/runtime/tasks/{task_id}/complete")
    async def complete_runtime_task(task_id: uuid.UUID, payload: RuntimeTaskCompletePayload):
        def _complete_task() -> Dict[str, Any]:
            local_queue._assert_runtime_session(str(payload.runtime_id or "").strip(), payload.session_token, instance_id=payload.instance_id)
            return local_queue.handle_complete_local_run(
                task_id,
                local_queue.LocalRunCompletePayload(
                    worker_id=(str(payload.runtime_id or "").strip() or None),
                    result_text=payload.result_text,
                    result_data=payload.result_data,
                    usage_masked=payload.usage_masked,
                ),
            )

        result = await run_in_threadpool(_complete_task)
        return {"ok": True, "task_id": str(task_id), **result}

    @app.post("/runtime/tasks/{task_id}/pause")
    async def pause_runtime_task(task_id: uuid.UUID, payload: RuntimeTaskPausePayload):
        def _pause_task() -> Dict[str, Any]:
            local_queue._assert_runtime_session(str(payload.runtime_id or "").strip(), payload.session_token, instance_id=payload.instance_id)
            return local_queue.handle_pause_local_run(
                task_id,
                local_queue.LocalRunPausePayload(
                    worker_id=(str(payload.runtime_id or "").strip() or None),
                    result_text=payload.result_text,
                    result_data=payload.result_data,
                    browser_checkpoint=payload.browser_checkpoint,
                    wait_reason=payload.wait_reason,
                ),
            )

        result = await run_in_threadpool(_pause_task)
        return {"ok": True, "task_id": str(task_id), **result}

    @app.post("/runtime/tasks/{task_id}/fail")
    async def fail_runtime_task(task_id: uuid.UUID, payload: RuntimeTaskFailPayload):
        def _fail_task() -> Dict[str, Any]:
            local_queue._assert_runtime_session(str(payload.runtime_id or "").strip(), payload.session_token, instance_id=payload.instance_id)
            return local_queue.handle_fail_local_run(
                task_id,
                local_queue.LocalRunFailPayload(
                    worker_id=(str(payload.runtime_id or "").strip() or None),
                    error=payload.error,
                ),
            )

        result = await run_in_threadpool(_fail_task)
        return {"ok": True, "task_id": str(task_id), **result}
