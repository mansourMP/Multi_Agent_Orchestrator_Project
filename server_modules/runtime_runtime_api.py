from __future__ import annotations

from typing import Any, Dict, List, Optional
import uuid

from fastapi import Depends, HTTPException
from pydantic import BaseModel, Field

from server_modules.runtime_common import require_api_key
from server_modules import local_queue


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


class RuntimeHeartbeatPayload(BaseModel):
    session_token: Optional[str] = None
    instance_id: Optional[str] = None
    current_run_id: Optional[str] = None
    note: Optional[str] = None


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


class RuntimeTaskCompletePayload(BaseModel):
    runtime_id: Optional[str] = None
    session_token: Optional[str] = None
    instance_id: Optional[str] = None
    result_text: Optional[str] = None
    result_data: Optional[Dict[str, Any]] = None
    usage_masked: Optional[Dict[str, Any]] = None


class RuntimeTaskFailPayload(BaseModel):
    runtime_id: Optional[str] = None
    session_token: Optional[str] = None
    instance_id: Optional[str] = None
    error: str


def _runtime_summary_from_worker_item(item: Dict[str, Any]) -> Dict[str, Any]:
    return {
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
        "last_seen_at": item.get("last_seen_at"),
        "registered_at": item.get("registered_at"),
        "last_registered_at": item.get("last_registered_at"),
        "session_issued_at": item.get("session_issued_at"),
        "instance_id": item.get("instance_id"),
        "capability_digest": item.get("capability_digest"),
        "trust_state": item.get("trust_state") or "unverified",
        "note": item.get("note"),
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
        "prompt": str(context.get("user_goal") or ""),
        "created_at": run.get("created_at"),
        "required_capabilities": list(precheck.get("capability_ids") or []) if isinstance(precheck, dict) else [],
        "policy_mode": metadata.get("policy_mode"),
        "context": context,
        "metadata": metadata,
        "run": run,
    }


def runtime_status_payload() -> Dict[str, Any]:
    payload = local_queue.handle_get_local_workers_status()
    items = payload.get("items") if isinstance(payload.get("items"), list) else []
    return {
        "scope": "local_companion_bridge",
        "summary": payload.get("summary") if isinstance(payload.get("summary"), dict) else {},
        "capability_queue": payload.get("capability_queue") if isinstance(payload.get("capability_queue"), dict) else {},
        "items": [_runtime_summary_from_worker_item(item) for item in items if isinstance(item, dict)],
    }


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
    @app.get("/runtime/runtimes/status", dependencies=[Depends(require_api_key)])
    async def get_runtime_status():
        return runtime_status_payload()

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
        )
        heartbeat = local_queue.LocalWorkerHeartbeatPayload(
            current_run_id=body.current_run_id,
            note=body.note or "runtime_registered",
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
        )
        result = local_queue.handle_heartbeat_local_run(task_id, local_payload)
        return {
            "ok": True,
            "task_id": str(task_id),
            "last_heartbeat_at": result.get("last_heartbeat_at"),
        }

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
