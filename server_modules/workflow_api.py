from __future__ import annotations

import json
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from server_modules.auth import enforce_workspace_access
from server_modules.builder_schema import normalize_builder_generated_workflow
from server_modules.runtime_common import require_api_key


router = APIRouter()
_WORKFLOW_LOCK = threading.Lock()


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[1]


def _workflow_store_path() -> Path:
    return _repo_root() / ".orion-stack" / "workflows.json"


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _read_store() -> Dict[str, Any]:
    path = _workflow_store_path()
    try:
        raw = path.read_text(encoding="utf-8")
    except FileNotFoundError:
        return {"items": []}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Unable to read workflow store: {exc}") from exc
    try:
        parsed = json.loads(raw) if raw else {}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Workflow store is invalid JSON: {exc}") from exc
    if not isinstance(parsed, dict):
        return {"items": []}
    items = parsed.get("items")
    if not isinstance(items, list):
        parsed["items"] = []
    return parsed


def _write_store(payload: Dict[str, Any]) -> None:
    path = _workflow_store_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


def _normalize_issue(issue: Dict[str, Any]) -> Dict[str, Any]:
    code = str(issue.get("code") or "").strip()
    message = str(issue.get("message") or "").strip()
    node_id = str(issue.get("node_id") or issue.get("nodeId") or "").strip() or None
    warning_markers = (
        "requires approval",
        "prefer",
        "warn",
        "reviewed",
        "session-backed",
        "interactive",
    )
    level = "warning" if any(marker in message.lower() or marker in code.lower() for marker in warning_markers) else "error"
    return {
        "code": code or "workflow_issue",
        "message": message or "Workflow validation issue.",
        "level": level,
        "nodeId": node_id,
    }


def _validation_summary(definition: Dict[str, Any]) -> Dict[str, Any]:
    draft_normalized = normalize_builder_generated_workflow(definition, for_publish=False)
    draft_issues = [
        _normalize_issue(issue)
        for issue in (draft_normalized.get("issues") if isinstance(draft_normalized.get("issues"), list) else [])
        if isinstance(issue, dict)
    ]

    publish_issues: List[Dict[str, Any]] = []
    try:
        publish_normalized = normalize_builder_generated_workflow(definition, for_publish=True)
        publish_issues = [
            _normalize_issue(issue)
            for issue in (publish_normalized.get("issues") if isinstance(publish_normalized.get("issues"), list) else [])
            if isinstance(issue, dict)
        ]
    except HTTPException as exc:
        detail = exc.detail
        detail_text = detail if isinstance(detail, str) else "Workflow cannot be published yet."
        publish_issues = [{
            "code": "publish_blocked",
            "message": detail_text,
            "level": "error",
            "nodeId": None,
        }]

    draft_error_count = sum(1 for issue in draft_issues if issue.get("level") == "error")
    publish_error_count = sum(1 for issue in publish_issues if issue.get("level") == "error")
    draft_warning_count = sum(1 for issue in draft_issues if issue.get("level") == "warning")
    publish_warning_count = sum(1 for issue in publish_issues if issue.get("level") == "warning")
    return {
        "draftIssues": draft_issues,
        "publishIssues": publish_issues,
        "hasDraftErrors": draft_error_count > 0,
        "hasPublishErrors": publish_error_count > 0,
        "draftErrorCount": draft_error_count,
        "publishErrorCount": publish_error_count,
        "draftWarningCount": draft_warning_count,
        "publishWarningCount": publish_warning_count,
    }


def _normalize_definition(value: Any) -> Dict[str, Any]:
    source = value if isinstance(value, dict) else {}
    return normalize_builder_generated_workflow(source, for_publish=False)


def _record_payload(item: Dict[str, Any]) -> Dict[str, Any]:
    definition = item.get("definition") if isinstance(item.get("definition"), dict) else {"version": "empyralist.workflow.v2", "nodes": [], "edges": []}
    return {
        "id": str(item.get("id") or "").strip(),
        "name": str(item.get("name") or "").strip() or "Untitled Workflow",
        "description": str(item.get("description") or "").strip(),
        "workspaceId": str(item.get("workspaceId") or "default").strip() or "default",
        "status": str(item.get("status") or "draft").strip() or "draft",
        "definition": definition,
        "validation": _validation_summary(definition),
        "nodeCount": len(definition.get("nodes") or []),
        "lastRun": item.get("lastRun"),
        "createdAt": str(item.get("createdAt") or "").strip() or None,
        "updatedAt": str(item.get("updatedAt") or "").strip() or None,
        "created_at": str(item.get("createdAt") or "").strip() or None,
        "updated_at": str(item.get("updatedAt") or "").strip() or None,
    }


def _find_item(items: List[Dict[str, Any]], workflow_id: str) -> Optional[Dict[str, Any]]:
    token = str(workflow_id or "").strip()
    if not token:
        return None
    for item in items:
        if str(item.get("id") or "").strip() == token:
            return item
    return None


class WorkflowCreateRequest(BaseModel):
    name: str
    description: Optional[str] = None
    definition: Optional[Dict[str, Any]] = None


class WorkflowUpdateRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    definition: Optional[Dict[str, Any]] = None


def register_workflow_routes(app: APIRouter) -> None:
    @app.get("/workflows", dependencies=[Depends(require_api_key)])
    async def list_workflows(
        workspaceId: Optional[str] = Query(default=None),
        current_user=Depends(require_api_key),
    ):
        workspace_id = enforce_workspace_access(current_user, workspaceId)
        with _WORKFLOW_LOCK:
            data = _read_store()
            items = [
                _record_payload(item)
                for item in (data.get("items") if isinstance(data.get("items"), list) else [])
                if isinstance(item, dict) and str(item.get("workspaceId") or "default").strip() == workspace_id
            ]
        items.sort(key=lambda item: str(item.get("updatedAt") or ""), reverse=True)
        return {"items": items}

    @app.post("/workflows", dependencies=[Depends(require_api_key)])
    async def create_workflow(
        body: WorkflowCreateRequest,
        workspaceId: Optional[str] = Query(default=None),
        current_user=Depends(require_api_key),
    ):
        workspace_id = enforce_workspace_access(current_user, workspaceId)
        definition = _normalize_definition(body.definition or {"version": "empyralist.workflow.v2", "nodes": [], "edges": []})
        now = _utc_now_iso()
        item = {
            "id": f"wf_{uuid.uuid4().hex[:12]}",
            "name": str(body.name or "").strip() or "Untitled Workflow",
            "description": str(body.description or "").strip(),
            "workspaceId": workspace_id,
            "status": "draft",
            "definition": definition,
            "createdAt": now,
            "updatedAt": now,
            "lastRun": None,
        }
        with _WORKFLOW_LOCK:
            data = _read_store()
            items = data.get("items") if isinstance(data.get("items"), list) else []
            items.append(item)
            data["items"] = items
            _write_store(data)
        return _record_payload(item)

    @app.get("/workflows/{workflow_id}", dependencies=[Depends(require_api_key)])
    async def get_workflow(workflow_id: str, current_user=Depends(require_api_key)):
        with _WORKFLOW_LOCK:
            data = _read_store()
            item = _find_item(data.get("items") if isinstance(data.get("items"), list) else [], workflow_id)
        if not item:
            raise HTTPException(status_code=404, detail="Workflow not found.")
        enforce_workspace_access(current_user, str(item.get("workspaceId") or "default"))
        return _record_payload(item)

    async def _update_workflow(workflow_id: str, body: WorkflowUpdateRequest, current_user=Depends(require_api_key)):
        with _WORKFLOW_LOCK:
            data = _read_store()
            items = data.get("items") if isinstance(data.get("items"), list) else []
            item = _find_item(items, workflow_id)
            if not item:
                raise HTTPException(status_code=404, detail="Workflow not found.")
            workspace_id = enforce_workspace_access(current_user, str(item.get("workspaceId") or "default"))
            item["workspaceId"] = workspace_id
            if body.name is not None:
                item["name"] = str(body.name or "").strip() or item.get("name") or "Untitled Workflow"
            if body.description is not None:
                item["description"] = str(body.description or "").strip()
            if body.definition is not None:
                item["definition"] = _normalize_definition(body.definition)
            item["updatedAt"] = _utc_now_iso()
            _write_store(data)
        return _record_payload(item)

    @app.put("/workflows/{workflow_id}", dependencies=[Depends(require_api_key)])
    async def replace_workflow(workflow_id: str, body: WorkflowUpdateRequest, current_user=Depends(require_api_key)):
        return await _update_workflow(workflow_id, body, current_user)

    @app.patch("/workflows/{workflow_id}", dependencies=[Depends(require_api_key)])
    async def update_workflow(workflow_id: str, body: WorkflowUpdateRequest, current_user=Depends(require_api_key)):
        return await _update_workflow(workflow_id, body, current_user)

    @app.delete("/workflows/{workflow_id}", dependencies=[Depends(require_api_key)])
    async def delete_workflow(workflow_id: str, current_user=Depends(require_api_key)):
        with _WORKFLOW_LOCK:
            data = _read_store()
            items = data.get("items") if isinstance(data.get("items"), list) else []
            item = _find_item(items, workflow_id)
            if not item:
                raise HTTPException(status_code=404, detail="Workflow not found.")
            enforce_workspace_access(current_user, str(item.get("workspaceId") or "default"))
            next_items = [entry for entry in items if str(entry.get("id") or "").strip() != str(workflow_id or "").strip()]
            data["items"] = next_items
            _write_store(data)
        return {"ok": True, "id": str(workflow_id or "").strip()}

    @app.post("/workflows/{workflow_id}/publish", dependencies=[Depends(require_api_key)])
    async def publish_workflow(workflow_id: str, current_user=Depends(require_api_key)):
        with _WORKFLOW_LOCK:
            data = _read_store()
            items = data.get("items") if isinstance(data.get("items"), list) else []
            item = _find_item(items, workflow_id)
            if not item:
                raise HTTPException(status_code=404, detail="Workflow not found.")
            enforce_workspace_access(current_user, str(item.get("workspaceId") or "default"))
            definition = item.get("definition") if isinstance(item.get("definition"), dict) else {}
            normalized = normalize_builder_generated_workflow(definition, for_publish=True)
            item["definition"] = normalized
            item["status"] = "published"
            item["updatedAt"] = _utc_now_iso()
            _write_store(data)
        return _record_payload(item)
