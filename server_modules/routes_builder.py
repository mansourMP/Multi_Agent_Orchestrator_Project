import json
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from server_modules.auth import enforce_workspace_access
from server_modules.model_router import call_model, resolve_call_credentials
from server_modules.runtime_common import require_api_key


router = APIRouter()

ALLOWED_NODE_TYPES = {"trigger", "agent", "action", "http_request", "condition", "transform", "code"}
NODE_TYPE_ALIASES = {
    "start": "trigger",
    "end": "action",
    "tool": "http_request",
}
BUILDER_SYSTEM_PROMPT = """You are a workflow builder AI for Empyralist, an AI operations platform.
Given a plain language description of a business outcome, return ONLY valid JSON.
Structure:
{
  "nodes": [
    {"id": "1", "type": "trigger", "label": "Start", "subtitle": "How the workflow begins", "x": 100, "y": 100},
    {"id": "2", "type": "agent", "label": "Agent", "subtitle": "Primary worker", "x": 320, "y": 100}
  ],
  "edges": [
    {"source": "1", "target": "2"}
  ]
}
Node types allowed: trigger, agent, action, http_request, condition, transform, code.
Use concise labels and subtitles.
Use numeric x/y positions suitable for a left-to-right flow.
No markdown, no prose, no backticks."""


class BuilderGenerateRequest(BaseModel):
    prompt: str
    model: Optional[str] = None
    profile_id: Optional[str] = None
    workspace_id: Optional[str] = None


def _clean_json_text(raw: str) -> str:
    text = str(raw or "").strip()
    if text.startswith("```"):
        text = text.strip("`").strip()
        if text.lower().startswith("json"):
            text = text[4:].strip()
    return text


def _sanitize_node_type(raw: Any) -> Optional[str]:
    value = str(raw or "").strip().lower()
    value = NODE_TYPE_ALIASES.get(value, value)
    return value if value in ALLOWED_NODE_TYPES else None


def _parse_workflow_payload(raw: str) -> Dict[str, Any]:
    try:
        payload = json.loads(_clean_json_text(raw))
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=502, detail=f"Builder returned invalid JSON: {exc.msg}.") from exc
    if not isinstance(payload, dict):
        raise HTTPException(status_code=502, detail="Builder returned an invalid workflow payload.")

    raw_nodes = payload.get("nodes")
    if not isinstance(raw_nodes, list):
        raise HTTPException(status_code=502, detail="Builder workflow is missing a nodes array.")

    nodes = []
    node_ids = set()
    for index, item in enumerate(raw_nodes):
        if not isinstance(item, dict):
            continue
        node_id = str(item.get("id") or "").strip() or str(index + 1)
        node_type = _sanitize_node_type(item.get("type"))
        if not node_type or node_id in node_ids:
            continue
        node_ids.add(node_id)
        label = str(item.get("label") or "").strip() or node_type.replace("_", " ").title()
        subtitle = str(item.get("subtitle") or "").strip()
        raw_x = item.get("x")
        raw_y = item.get("y")
        nodes.append(
            {
                "id": node_id,
                "type": node_type,
                "label": label,
                "subtitle": subtitle,
                "x": raw_x if isinstance(raw_x, (int, float)) else 120 + index * 220,
                "y": raw_y if isinstance(raw_y, (int, float)) else 120,
            }
        )

    if not nodes:
        raise HTTPException(status_code=502, detail="Builder returned no usable workflow nodes.")

    raw_edges = payload.get("edges")
    edges = []
    if isinstance(raw_edges, list):
        for item in raw_edges:
            if not isinstance(item, dict):
                continue
            source = str(item.get("source") or "").strip()
            target = str(item.get("target") or "").strip()
            if source and target and source in node_ids and target in node_ids:
                edges.append({"source": source, "target": target})

    return {"nodes": nodes, "edges": edges}


@router.post("/api/v1/builder/generate", dependencies=[Depends(require_api_key)])
async def builder_generate(body: BuilderGenerateRequest, current_user=Depends(require_api_key)):
    prompt = str(body.prompt or "").strip()
    if not prompt:
        raise HTTPException(status_code=400, detail="Prompt is required.")
    body.workspace_id = enforce_workspace_access(current_user, body.workspace_id)

    resolution = resolve_call_credentials(
        model=body.model,
        workspace_id=body.workspace_id,
        profile_id=body.profile_id,
    )
    credentials = resolution.get("credentials")
    provider = str(resolution.get("provider") or "").strip() or "openai"
    resolved_model = str(resolution.get("model") or "").strip()

    if not credentials:
        raise HTTPException(
            status_code=400,
            detail=f"No credential available for provider '{provider}'. Add a provider profile or platform key first.",
        )

    try:
        result = await call_model(
            messages=[
                {"role": "system", "content": BUILDER_SYSTEM_PROMPT},
                {"role": "user", "content": prompt},
            ],
            model=resolved_model,
            provider=provider,
            profile_id=body.profile_id,
            credentials=credentials,
            max_tokens=1500,
            temperature=0.3,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    workflow = _parse_workflow_payload(str(result.get("content") or ""))
    return {
        "workflow": workflow,
        "usage": result.get("usage") or {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0},
        "model": result.get("model") or resolved_model,
        "provider": result.get("provider") or provider,
    }
