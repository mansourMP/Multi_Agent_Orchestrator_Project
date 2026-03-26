from __future__ import annotations

from typing import Any, Dict, List, Optional, Set

from fastapi import HTTPException

from server_modules.builder_runtime_mapping import (
    default_file_mount_grants,
    normalize_file_mount_grants,
    validate_file_mount_grants,
)
from server_modules.runtime_policy import normalize_execution_target, normalize_trust_mode


EMPYRALIST_WORKFLOW_SCHEMA_VERSION = "empyralist.workflow.v2"

WORKFLOW_NODE_TYPES: Set[str] = {"trigger", "agent", "tool", "decision", "human", "data", "subflow"}
TRIGGER_VARIANTS: Set[str] = {
    "connector_event",
    "schedule",
    "webhook",
    "workflow",
    "file_watch",
    "manual",
}
TOOL_VARIANTS: Set[str] = {
    "connector_action",
    "http",
    "browser",
    "file",
    "shell",
    "document",
    "spreadsheet",
    "code",
}
DECISION_VARIANTS: Set[str] = {"if_else", "classifier", "field_router"}
HUMAN_VARIANTS: Set[str] = {"approval", "review", "wait_for_reply"}
DATA_VARIANTS: Set[str] = {"transform", "compose", "validate"}
SUBFLOW_VARIANTS: Set[str] = {"call_workflow"}


def _is_record(value: Any) -> bool:
    return isinstance(value, dict)


def _clean_text(value: Any, max_chars: int = 500) -> str:
    text = " ".join(str(value or "").strip().split())
    if not text:
        return ""
    if len(text) <= max_chars:
        return text
    return text[: max(0, max_chars - 1)].rstrip() + "…"


def _dedupe_strings(value: Any) -> List[str]:
    items = value if isinstance(value, list) else []
    out: List[str] = []
    seen: Set[str] = set()
    for item in items:
        token = _clean_text(item, 160)
        if not token or token in seen:
            continue
        seen.add(token)
        out.append(token)
    return out


def default_agent_config(raw_config: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    source = raw_config if isinstance(raw_config, dict) else {}
    runtime = source.get("runtime") if isinstance(source.get("runtime"), dict) else {}
    execution_target = normalize_execution_target(runtime.get("execution_target") or "auto")
    permissions = source.get("permissions") if isinstance(source.get("permissions"), dict) else {}

    return {
        "identity": {
            "name": _clean_text(source.get("identity", {}).get("name") if isinstance(source.get("identity"), dict) else source.get("name") or "Agent", 120) or "Agent",
            "role": _clean_text(source.get("identity", {}).get("role") if isinstance(source.get("identity"), dict) else source.get("role") or "Agent", 120) or "Agent",
            "goal": _clean_text(source.get("identity", {}).get("goal") if isinstance(source.get("identity"), dict) else source.get("goal"), 1000),
            "success_condition": _clean_text(source.get("identity", {}).get("success_condition") if isinstance(source.get("identity"), dict) else source.get("success_condition"), 400),
            "output_contract": _clean_text(source.get("identity", {}).get("output_contract") if isinstance(source.get("identity"), dict) else source.get("output_contract"), 400),
        },
        "runtime": {
            "provider_profile_id": _clean_text(runtime.get("provider_profile_id"), 160) or None,
            "model": _clean_text(runtime.get("model"), 120) or None,
            "provider": _clean_text(runtime.get("provider"), 80) or None,
            "execution_target": execution_target,
            "timeout_seconds": int(runtime.get("timeout_seconds") or 300),
            "token_budget": runtime.get("token_budget"),
            "retry_policy": runtime.get("retry_policy") if isinstance(runtime.get("retry_policy"), dict) else {"max_attempts": 1},
        },
        "skills": {
            "skill_bundle_ids": _dedupe_strings(source.get("skills", {}).get("skill_bundle_ids") if isinstance(source.get("skills"), dict) else source.get("skill_bundle_ids")),
            "overrides": source.get("skills", {}).get("overrides") if isinstance(source.get("skills"), dict) and isinstance(source.get("skills", {}).get("overrides"), dict) else {},
            "prompt_append": _clean_text(source.get("skills", {}).get("prompt_append") if isinstance(source.get("skills"), dict) else source.get("prompt_append"), 4000),
        },
        "tools": {
            "dynamic_allowed": _dedupe_strings(source.get("tools", {}).get("dynamic_allowed") if isinstance(source.get("tools"), dict) else source.get("dynamic_allowed")),
            "explicit_required": _dedupe_strings(source.get("tools", {}).get("explicit_required") if isinstance(source.get("tools"), dict) else source.get("explicit_required")),
        },
        "memory": {
            "read_scopes": _dedupe_strings(source.get("memory", {}).get("read_scopes") if isinstance(source.get("memory"), dict) else source.get("read_scopes")) or ["session"],
            "write_scopes": _dedupe_strings(source.get("memory", {}).get("write_scopes") if isinstance(source.get("memory"), dict) else source.get("write_scopes")) or ["session"],
            "retrieval_policy": _clean_text(source.get("memory", {}).get("retrieval_policy") if isinstance(source.get("memory"), dict) else source.get("retrieval_policy") or "recent", 80) or "recent",
            "retention": source.get("memory", {}).get("retention") if isinstance(source.get("memory"), dict) and isinstance(source.get("memory", {}).get("retention"), dict) else {},
        },
        "connectors": {
            "bindings": source.get("connectors", {}).get("bindings") if isinstance(source.get("connectors"), dict) and isinstance(source.get("connectors", {}).get("bindings"), list) else [],
        },
        "permissions": {
            "action_policy": normalize_trust_mode(permissions.get("action_policy") or "guarded"),
            "connector_permissions": _dedupe_strings(permissions.get("connector_permissions") or permissions.get("connectors")),
            "browser_permissions": permissions.get("browser_permissions") if isinstance(permissions.get("browser_permissions"), dict) else {"allow": False},
            "file_mount_grants": normalize_file_mount_grants(permissions.get("file_mount_grants"), execution_target),
        },
    }


def _default_node_config(node_type: str, variant: str, raw_node: Dict[str, Any], prompt: str) -> Dict[str, Any]:
    if node_type == "trigger":
        return {
            "connector": _clean_text(raw_node.get("config", {}).get("connector") if _is_record(raw_node.get("config")) else "", 120),
            "event": _clean_text(raw_node.get("config", {}).get("event") if _is_record(raw_node.get("config")) else "", 120),
            "schedule": raw_node.get("config", {}).get("schedule") if _is_record(raw_node.get("config")) and _is_record(raw_node.get("config", {}).get("schedule")) else {},
            "webhook": raw_node.get("config", {}).get("webhook") if _is_record(raw_node.get("config")) and _is_record(raw_node.get("config", {}).get("webhook")) else {},
            "workflow_id": _clean_text(raw_node.get("config", {}).get("workflow_id") if _is_record(raw_node.get("config")) else "", 160),
            "file_watch": raw_node.get("config", {}).get("file_watch") if _is_record(raw_node.get("config")) and _is_record(raw_node.get("config", {}).get("file_watch")) else {},
            "test_only": variant == "manual",
        }
    if node_type == "agent":
        seed = raw_node.get("config") if _is_record(raw_node.get("config")) else {}
        if not seed and prompt:
            seed = {
                "identity": {
                    "goal": _clean_text(prompt, 1000),
                    "name": _clean_text(raw_node.get("label") or "Agent", 120) or "Agent",
                }
            }
        return default_agent_config(seed)
    if node_type == "tool":
        return {
            "action_id": _clean_text(raw_node.get("config", {}).get("action_id") if _is_record(raw_node.get("config")) else raw_node.get("label"), 160),
            "connector": _clean_text(raw_node.get("config", {}).get("connector") if _is_record(raw_node.get("config")) else "", 120),
            "method": _clean_text(raw_node.get("config", {}).get("method") if _is_record(raw_node.get("config")) else "GET", 12) or "GET",
            "url": _clean_text(raw_node.get("config", {}).get("url") if _is_record(raw_node.get("config")) else "", 600),
            "summary": _clean_text(raw_node.get("config", {}).get("summary") if _is_record(raw_node.get("config")) else raw_node.get("subtitle"), 600),
            "code": _clean_text(raw_node.get("config", {}).get("code") if _is_record(raw_node.get("config")) else "", 8000),
            "permissions": raw_node.get("config", {}).get("permissions") if _is_record(raw_node.get("config")) and _is_record(raw_node.get("config", {}).get("permissions")) else {},
        }
    if node_type == "decision":
        return {
            "expression": _clean_text(raw_node.get("config", {}).get("expression") if _is_record(raw_node.get("config")) else raw_node.get("subtitle"), 1000),
            "field": _clean_text(raw_node.get("config", {}).get("field") if _is_record(raw_node.get("config")) else "", 160),
            "routes": raw_node.get("config", {}).get("routes") if _is_record(raw_node.get("config")) and isinstance(raw_node.get("config", {}).get("routes"), list) else [],
        }
    if node_type == "human":
        return {
            "title": _clean_text(raw_node.get("config", {}).get("title") if _is_record(raw_node.get("config")) else raw_node.get("label") or "Approval", 160) or "Approval",
            "instructions": _clean_text(raw_node.get("config", {}).get("instructions") if _is_record(raw_node.get("config")) else raw_node.get("subtitle"), 1200),
            "decision_options": _dedupe_strings(raw_node.get("config", {}).get("decision_options") if _is_record(raw_node.get("config")) else []) or ["approve", "reject"],
            "timeout_seconds": raw_node.get("config", {}).get("timeout_seconds") if _is_record(raw_node.get("config")) else None,
        }
    if node_type == "data":
        return {
            "mapping": _clean_text(raw_node.get("config", {}).get("mapping") if _is_record(raw_node.get("config")) else raw_node.get("subtitle"), 1200),
            "template": _clean_text(raw_node.get("config", {}).get("template") if _is_record(raw_node.get("config")) else "", 2000),
            "schema": raw_node.get("config", {}).get("schema") if _is_record(raw_node.get("config")) and _is_record(raw_node.get("config", {}).get("schema")) else {},
        }
    if node_type == "subflow":
        return {
            "workflow_id": _clean_text(raw_node.get("config", {}).get("workflow_id") if _is_record(raw_node.get("config")) else "", 160),
            "mode": _clean_text(raw_node.get("config", {}).get("mode") if _is_record(raw_node.get("config")) else "sync", 40) or "sync",
            "input_mapping": raw_node.get("config", {}).get("input_mapping") if _is_record(raw_node.get("config")) and _is_record(raw_node.get("config", {}).get("input_mapping")) else {},
        }
    return {}


def _compatibility_fields(node_type: str, variant: str, config: Dict[str, Any], raw_node: Dict[str, Any], index: int) -> Dict[str, Any]:
    x = raw_node.get("x")
    y = raw_node.get("y")
    label = _clean_text(raw_node.get("label"), 120)
    subtitle = _clean_text(raw_node.get("subtitle"), 160)
    if node_type == "agent":
        identity = config.get("identity") if isinstance(config.get("identity"), dict) else {}
        label = label or _clean_text(identity.get("name") or identity.get("role") or "Agent", 120) or "Agent"
        subtitle = subtitle or _clean_text(identity.get("goal"), 160)
    elif node_type == "trigger":
        label = label or ("Manual trigger" if variant == "manual" else variant.replace("_", " ").title())
        subtitle = subtitle or ("Test only" if variant == "manual" else "Workflow trigger")
    else:
        label = label or node_type.replace("_", " ").title()
    return {
        "label": label,
        "subtitle": subtitle,
        "x": x if isinstance(x, (int, float)) else 120 + index * 220,
        "y": y if isinstance(y, (int, float)) else 120,
    }


def _validate_node(node: Dict[str, Any], *, for_publish: bool) -> List[Dict[str, str]]:
    issues: List[Dict[str, str]] = []
    node_type = str(node.get("type") or "").strip()
    variant = str(node.get("variant") or "").strip()
    config = node.get("config") if isinstance(node.get("config"), dict) else {}

    if node_type == "trigger":
        if variant not in TRIGGER_VARIANTS:
            issues.append({"code": "trigger_variant_invalid", "message": f"Trigger variant '{variant or 'unknown'}' is not supported."})
        if variant == "file_watch":
            issues.append(
                {
                    "code": "file_watch_not_executable_yet",
                    "message": "file_watch triggers are schema-valid but cannot be published until local trigger runtime support is added."
                    if for_publish
                    else "file_watch triggers are not executable yet.",
                }
            )
    elif node_type == "agent":
        identity = config.get("identity") if isinstance(config.get("identity"), dict) else {}
        runtime = config.get("runtime") if isinstance(config.get("runtime"), dict) else {}
        permissions = config.get("permissions") if isinstance(config.get("permissions"), dict) else {}
        if not _clean_text(identity.get("name") or identity.get("role"), 120):
            issues.append({"code": "agent_identity_missing", "message": "Agent identity requires a name or role."})
        issues.extend(validate_file_mount_grants(permissions.get("file_mount_grants"), runtime.get("execution_target") or "auto"))
    elif node_type == "tool":
        if variant not in TOOL_VARIANTS:
            issues.append({"code": "tool_variant_invalid", "message": f"Tool variant '{variant or 'unknown'}' is not supported."})
        issues.extend(
            validate_file_mount_grants(
                config.get("permissions", {}).get("file_mount_grants") if isinstance(config.get("permissions"), dict) else [],
                config.get("execution_target") or "auto",
            )
        )
        if variant == "shell" and normalize_execution_target(config.get("execution_target") or "auto") != "local_companion":
            issues.append({"code": "shell_requires_local_companion", "message": "Shell tool nodes require the local_companion execution target."})
    elif node_type == "human":
        if variant not in HUMAN_VARIANTS:
            issues.append({"code": "human_variant_invalid", "message": f"Human node variant '{variant or 'unknown'}' is not supported."})
        if variant == "approval":
            decision_options = _dedupe_strings(config.get("decision_options"))
            if not decision_options:
                issues.append({"code": "approval_options_missing", "message": "Approval nodes require at least one decision option."})
    elif node_type == "subflow":
        if variant not in SUBFLOW_VARIANTS:
            issues.append({"code": "subflow_variant_invalid", "message": f"Subflow variant '{variant or 'unknown'}' is not supported."})
        if not _clean_text(config.get("workflow_id"), 160):
            issues.append({"code": "subflow_target_missing", "message": "Subflow nodes require a target workflow_id."})
    elif node_type == "decision" and variant not in DECISION_VARIANTS:
        issues.append({"code": "decision_variant_invalid", "message": f"Decision variant '{variant or 'unknown'}' is not supported."})
    elif node_type == "data" and variant not in DATA_VARIANTS:
        issues.append({"code": "data_variant_invalid", "message": f"Data variant '{variant or 'unknown'}' is not supported."})
    return issues


def normalize_builder_generated_workflow(payload: Dict[str, Any], *, prompt: str = "", for_publish: bool = False) -> Dict[str, Any]:
    if not isinstance(payload, dict):
        raise HTTPException(status_code=502, detail="Builder returned an invalid workflow payload.")

    raw_nodes = payload.get("nodes")
    if not isinstance(raw_nodes, list):
        raise HTTPException(status_code=502, detail="Builder workflow is missing a nodes array.")

    nodes: List[Dict[str, Any]] = []
    node_ids: Set[str] = set()
    issues: List[Dict[str, str]] = []
    for index, item in enumerate(raw_nodes):
        if not isinstance(item, dict):
            continue
        node_id = _clean_text(item.get("id"), 120) or f"node_{index + 1}"
        node_type = _clean_text(item.get("type"), 40).lower()
        if node_type not in WORKFLOW_NODE_TYPES or node_id in node_ids:
            continue
        variant = _clean_text(item.get("variant"), 40).lower()
        if node_type == "trigger" and variant not in TRIGGER_VARIANTS:
            variant = "manual"
        elif node_type == "tool" and variant not in TOOL_VARIANTS:
            variant = "connector_action"
        elif node_type == "decision" and variant not in DECISION_VARIANTS:
            variant = "if_else"
        elif node_type == "human" and variant not in HUMAN_VARIANTS:
            variant = "approval"
        elif node_type == "data" and variant not in DATA_VARIANTS:
            variant = "transform"
        elif node_type == "subflow" and variant not in SUBFLOW_VARIANTS:
            variant = "call_workflow"

        config = _default_node_config(node_type, variant, item, prompt)
        compatibility = _compatibility_fields(node_type, variant, config, item, index)
        node = {
            "id": node_id,
            "type": node_type,
            "variant": variant if variant else None,
            "config": config,
            "resources": item.get("resources") if isinstance(item.get("resources"), dict) else {},
            "policy": item.get("policy") if isinstance(item.get("policy"), dict) else {},
            "position": {
                "x": compatibility["x"],
                "y": compatibility["y"],
            },
            **compatibility,
        }
        node_ids.add(node_id)
        nodes.append(node)
        issues.extend({**issue, "node_id": node_id} for issue in _validate_node(node, for_publish=for_publish))

    if not nodes:
        raise HTTPException(status_code=502, detail="Builder returned no usable workflow nodes.")

    raw_edges = payload.get("edges")
    edges: List[Dict[str, Any]] = []
    if isinstance(raw_edges, list):
        for index, item in enumerate(raw_edges):
            if not isinstance(item, dict):
                continue
            source = _clean_text(item.get("source"), 120)
            target = _clean_text(item.get("target"), 120)
            if source and target and source in node_ids and target in node_ids:
                edges.append(
                    {
                        "id": _clean_text(item.get("id"), 160) or f"edge-{source}-{target}-{index + 1}",
                        "source": source,
                        "target": target,
                        "sourceHandle": _clean_text(item.get("sourceHandle"), 80) or None,
                        "targetHandle": _clean_text(item.get("targetHandle"), 80) or None,
                    }
                )

    if for_publish:
        triggers = [node for node in nodes if node.get("type") == "trigger"]
        if not triggers or all(str(node.get("variant") or "").strip() == "manual" for node in triggers):
            issues.append(
                {
                    "code": "manual_trigger_only",
                    "message": "Published workflows require at least one non-manual trigger.",
                }
            )

    blocking_codes = {
        "manual_trigger_only",
        "trigger_variant_invalid",
        "tool_variant_invalid",
        "decision_variant_invalid",
        "human_variant_invalid",
        "data_variant_invalid",
        "subflow_variant_invalid",
        "subflow_target_missing",
        "approval_options_missing",
        "local_root_requires_local_companion",
        "shell_requires_local_companion",
    }
    if for_publish:
        blocking_codes.add("file_watch_not_executable_yet")
    blocking = [issue for issue in issues if issue.get("code") in blocking_codes]
    if blocking:
        raise HTTPException(status_code=502, detail=" ".join(str(issue.get("message") or "").strip() for issue in blocking if str(issue.get("message") or "").strip()))

    return {
        "version": EMPYRALIST_WORKFLOW_SCHEMA_VERSION,
        "nodes": nodes,
        "edges": edges,
        "defaults": {},
        "resources": payload.get("resources") if isinstance(payload.get("resources"), dict) else {},
        "policy": payload.get("policy") if isinstance(payload.get("policy"), dict) else {},
        "issues": issues,
    }
