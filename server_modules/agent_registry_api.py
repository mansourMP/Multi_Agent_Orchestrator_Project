from __future__ import annotations

from typing import Any, Dict, Literal, Optional

from fastapi import Depends, HTTPException
from pydantic import BaseModel, Field

from server_modules import agent_registry_repository
from server_modules.auth import enforce_workspace_access
from server_modules.agent_turn import AgentTurnRequest, TurnActor, agent_turn as execute_canonical_agent_turn
from server_modules.api_contract import ApiAgentTurnResponse, normalize_agent_turn_result
from server_modules.run_service import build_server_run_execution_services
from server_modules import runtime_run_access_service
from server_modules import template_compiler_service
from server_modules import thread_service


def _late_server_export(name: str):
    import server as _server

    return getattr(_server, name)


def _refresh_server_exports():
    import server as _server

    globals().update(_server.__dict__)
    return _server


def _coerce_dict(value: Any) -> Dict[str, Any]:
    return dict(value) if isinstance(value, dict) else {}


class AgentInstallRunRequest(BaseModel):
    message: Optional[str] = None
    thread_id: Optional[str] = None
    session_id: Optional[str] = None
    channel: str = "web"
    execution_mode: Literal["sync", "durable"] = "durable"
    response_mode: Literal["stream", "artifact", "channel_reply"] = "artifact"
    machine_target: Optional[str] = None
    policy_context: Dict[str, Any] = Field(default_factory=dict)
    metadata: Dict[str, Any] = Field(default_factory=dict)
    force_recompile: bool = False


class AgentInstallUpsertRequest(BaseModel):
    workspace_id: str
    agent_definition_id: Optional[str] = None
    agent_definition_version_id: Optional[str] = None
    label: Optional[str] = None
    runtime_profile_id: Optional[str] = None
    root_folder_uri: Optional[str] = None
    tool_toggles: Dict[str, Any] = Field(default_factory=dict)
    folder_grants: list[Any] = Field(default_factory=list)
    connector_bindings: Dict[str, Any] = Field(default_factory=dict)
    memory_scope_overrides: Dict[str, Any] = Field(default_factory=dict)
    policy_context_overrides: Dict[str, Any] = Field(default_factory=dict)
    enabled: Optional[bool] = None
    status: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)


def _workspace_id_from_query_or_body(
    *,
    query_workspace_id: Optional[str],
    body_workspace_id: Optional[str] = None,
) -> str:
    return str(body_workspace_id or query_workspace_id or "").strip() or "default"


def _run_execution_services():
    return build_server_run_execution_services(
        stamp_request_owner=runtime_run_access_service.stamp_request_owner,
        late_server_export=_late_server_export,
    )


def _current_actor(current_user: Any) -> TurnActor:
    user_id = str((current_user or {}).get("user_id") or "").strip()
    email = str((current_user or {}).get("email") or "").strip()
    actor_id = user_id or email or "web-user"
    return TurnActor(type="user", id=actor_id, display_name=email or actor_id)


def register_agent_registry_routes(app) -> None:
    _server = _refresh_server_exports()
    member_dependency = getattr(_server, "require_api_key")

    @app.get("/agent-registry/definitions", dependencies=[Depends(member_dependency)])
    async def list_agent_definitions(
        workspace_id: Optional[str] = None,
        current_user=Depends(member_dependency),
    ):
        _refresh_server_exports()
        resolved_workspace_id = enforce_workspace_access(
            current_user,
            _workspace_id_from_query_or_body(query_workspace_id=workspace_id),
            minimum_role="viewer",
        )
        tenant_id = str((current_user or {}).get("tenant_id") or "default").strip() or "default"
        items = await agent_registry_repository.list_agent_definitions(
            tenant_id=tenant_id,
            workspace_id=resolved_workspace_id,
        )
        return {"items": items}

    @app.get("/agent-registry/definitions/{definition_id}", dependencies=[Depends(member_dependency)])
    async def get_agent_definition(
        definition_id: str,
        workspace_id: Optional[str] = None,
        current_user=Depends(member_dependency),
    ):
        _refresh_server_exports()
        resolved_workspace_id = enforce_workspace_access(
            current_user,
            _workspace_id_from_query_or_body(query_workspace_id=workspace_id),
            minimum_role="viewer",
        )
        tenant_id = str((current_user or {}).get("tenant_id") or "default").strip() or "default"
        record = await agent_registry_repository.get_agent_definition(
            definition_id,
            tenant_id=tenant_id,
            workspace_id=resolved_workspace_id,
        )
        if not isinstance(record, dict):
            raise HTTPException(status_code=404, detail="Agent definition not found.")
        return record

    @app.get("/agent-registry/runtime-profiles", dependencies=[Depends(member_dependency)])
    async def list_runtime_profiles(
        workspace_id: Optional[str] = None,
        current_user=Depends(member_dependency),
    ):
        _refresh_server_exports()
        resolved_workspace_id = enforce_workspace_access(
            current_user,
            _workspace_id_from_query_or_body(query_workspace_id=workspace_id),
            minimum_role="viewer",
        )
        tenant_id = str((current_user or {}).get("tenant_id") or "default").strip() or "default"
        items = await agent_registry_repository.list_runtime_profiles(
            tenant_id=tenant_id,
            workspace_id=resolved_workspace_id,
        )
        return {"items": items}

    @app.get("/agent-registry/installs", dependencies=[Depends(member_dependency)])
    async def list_agent_installs(
        workspace_id: Optional[str] = None,
        include_master: bool = False,
        current_user=Depends(member_dependency),
    ):
        _refresh_server_exports()
        resolved_workspace_id = enforce_workspace_access(
            current_user,
            _workspace_id_from_query_or_body(query_workspace_id=workspace_id),
            minimum_role="viewer",
        )
        tenant_id = str((current_user or {}).get("tenant_id") or "default").strip() or "default"
        items = await agent_registry_repository.list_workspace_agent_installs(
            tenant_id=tenant_id,
            workspace_id=resolved_workspace_id,
            include_master=bool(include_master),
        )
        return {"items": items}

    @app.get("/agent-registry/chat-context", dependencies=[Depends(member_dependency)])
    async def get_master_chat_context(
        workspace_id: Optional[str] = None,
        current_user=Depends(member_dependency),
    ):
        _refresh_server_exports()
        resolved_workspace_id = enforce_workspace_access(
            current_user,
            _workspace_id_from_query_or_body(query_workspace_id=workspace_id),
            minimum_role="viewer",
        )
        tenant_id = str((current_user or {}).get("tenant_id") or "default").strip() or "default"
        owner_user_id = str((current_user or {}).get("user_id") or "").strip() or None
        master_install = await agent_registry_repository.get_workspace_master_agent_install(
            tenant_id=tenant_id,
            workspace_id=resolved_workspace_id,
            created_by_user_id=owner_user_id,
        )
        if not isinstance(master_install, dict):
            raise HTTPException(status_code=500, detail="Workspace master agent is unavailable.")
        thread_id = agent_registry_repository.build_master_thread_id(
            workspace_id=resolved_workspace_id,
            owner_user_id=owner_user_id,
        )
        await thread_service.ensure_master_thread(
            thread_id=thread_id,
            tenant_id=tenant_id,
            workspace_id=resolved_workspace_id,
            owner_user_id=owner_user_id,
            master_agent_install_id=str(master_install.get("id") or "").strip() or None,
            channel="web",
            title="Sage",
            metadata={
                "source": "master_chat_context",
                "system_agent": True,
                "workspace_master": True,
            },
        )
        thread_record = await thread_service.get_thread(thread_id, include_turns=True)
        specialist_installs = await agent_registry_repository.list_workspace_agent_installs(
            tenant_id=tenant_id,
            workspace_id=resolved_workspace_id,
            include_master=False,
        )
        active_specialists = [
            item for item in specialist_installs
            if isinstance(item, dict)
            and bool(item.get("enabled", True))
            and str(item.get("status") or "active").strip().lower() == "active"
        ]
        return {
            "workspace_id": resolved_workspace_id,
            "tenant_id": tenant_id,
            "thread_id": thread_id,
            "master_install": master_install,
            "specialist_installs": active_specialists,
            "thread": thread_record,
        }

    @app.post("/agent-registry/installs", dependencies=[Depends(member_dependency)])
    async def create_agent_install(
        body: AgentInstallUpsertRequest,
        current_user=Depends(member_dependency),
    ):
        _refresh_server_exports()
        resolved_workspace_id = enforce_workspace_access(
            current_user,
            _workspace_id_from_query_or_body(query_workspace_id=None, body_workspace_id=body.workspace_id),
            minimum_role="member",
        )
        tenant_id = str((current_user or {}).get("tenant_id") or "default").strip() or "default"
        install = await agent_registry_repository.create_workspace_agent_install(
            tenant_id=tenant_id,
            workspace_id=resolved_workspace_id,
            agent_definition_id=str(body.agent_definition_id or "").strip(),
            agent_definition_version_id=str(body.agent_definition_version_id or "").strip() or None,
            installed_by_user_id=str((current_user or {}).get("user_id") or "").strip() or None,
            owner_user_id=str((current_user or {}).get("user_id") or "").strip() or None,
            label=str(body.label or "").strip() or None,
            runtime_profile_id=str(body.runtime_profile_id or "").strip() or None,
            root_folder_uri=str(body.root_folder_uri or "").strip() or None,
            tool_toggles=_coerce_dict(body.tool_toggles),
            folder_grants=list(body.folder_grants or []),
            connector_bindings=_coerce_dict(body.connector_bindings),
            memory_scope_overrides=_coerce_dict(body.memory_scope_overrides),
            policy_context_overrides=_coerce_dict(body.policy_context_overrides),
            metadata=_coerce_dict(body.metadata),
        )
        if not isinstance(install, dict):
            raise HTTPException(status_code=404, detail="Agent definition not found for installation.")
        compiled = await template_compiler_service.ensure_install_compiled_artifact(
            str(install.get("id") or "").strip(),
            tenant_id=tenant_id,
            workspace_id=resolved_workspace_id,
            compiled_by_user_id=str((current_user or {}).get("user_id") or "").strip() or None,
            force_recompile=True,
        )
        return compiled.get("install") if isinstance(compiled.get("install"), dict) else install

    @app.get("/agent-registry/installs/{install_id}", dependencies=[Depends(member_dependency)])
    async def get_agent_install(
        install_id: str,
        workspace_id: Optional[str] = None,
        current_user=Depends(member_dependency),
    ):
        _refresh_server_exports()
        resolved_workspace_id = enforce_workspace_access(
            current_user,
            _workspace_id_from_query_or_body(query_workspace_id=workspace_id),
            minimum_role="viewer",
        )
        tenant_id = str((current_user or {}).get("tenant_id") or "default").strip() or "default"
        record = await agent_registry_repository.get_workspace_agent_install_bundle(
            install_id,
            tenant_id=tenant_id,
            workspace_id=resolved_workspace_id,
        )
        if not isinstance(record, dict):
            raise HTTPException(status_code=404, detail="Installed agent not found.")
        return record

    @app.patch("/agent-registry/installs/{install_id}", dependencies=[Depends(member_dependency)])
    async def update_agent_install(
        install_id: str,
        body: AgentInstallUpsertRequest,
        current_user=Depends(member_dependency),
    ):
        _refresh_server_exports()
        resolved_workspace_id = enforce_workspace_access(
            current_user,
            _workspace_id_from_query_or_body(query_workspace_id=None, body_workspace_id=body.workspace_id),
            minimum_role="member",
        )
        tenant_id = str((current_user or {}).get("tenant_id") or "default").strip() or "default"
        install = await agent_registry_repository.update_workspace_agent_install(
            install_id,
            tenant_id=tenant_id,
            workspace_id=resolved_workspace_id,
            label=str(body.label or "").strip() or None,
            runtime_profile_id=str(body.runtime_profile_id or "").strip() or None,
            root_folder_uri=str(body.root_folder_uri or "").strip() or None,
            tool_toggles=_coerce_dict(body.tool_toggles),
            folder_grants=list(body.folder_grants or []),
            connector_bindings=_coerce_dict(body.connector_bindings),
            memory_scope_overrides=_coerce_dict(body.memory_scope_overrides),
            policy_context_overrides=_coerce_dict(body.policy_context_overrides),
            enabled=body.enabled,
            status=str(body.status or "").strip() or None,
            metadata=_coerce_dict(body.metadata),
        )
        if not isinstance(install, dict):
            raise HTTPException(status_code=404, detail="Installed agent not found.")
        compiled = await template_compiler_service.ensure_install_compiled_artifact(
            install_id,
            tenant_id=tenant_id,
            workspace_id=resolved_workspace_id,
            compiled_by_user_id=str((current_user or {}).get("user_id") or "").strip() or None,
            force_recompile=True,
        )
        return compiled.get("install") if isinstance(compiled.get("install"), dict) else install

    @app.post("/agents/{install_id}/run", dependencies=[Depends(member_dependency)], response_model=ApiAgentTurnResponse)
    async def run_installed_agent(
        install_id: str,
        body: AgentInstallRunRequest,
        current_user=Depends(member_dependency),
    ):
        _refresh_server_exports()
        compiled = await template_compiler_service.ensure_install_compiled_artifact(
            install_id,
            compiled_by_user_id=str((current_user or {}).get("user_id") or "").strip() or None,
            force_recompile=bool(body.force_recompile),
        )
        install = compiled.get("install") if isinstance(compiled.get("install"), dict) else {}
        workspace_id = enforce_workspace_access(
            current_user,
            str(install.get("workspace_id") or "").strip() or "default",
            tenant_id=str(install.get("tenant_id") or "").strip() or None,
            minimum_role="member",
        )
        runtime_profile = install.get("runtime_profile") if isinstance(install.get("runtime_profile"), dict) else {}
        workflow_snapshot = compiled.get("workflow_snapshot") if isinstance(compiled.get("workflow_snapshot"), dict) else {}
        workflow_id = str(compiled.get("workflow_id") or workflow_snapshot.get("id") or install.get("compiled_workflow_id") or "").strip()
        workflow_version_id = str(
            compiled.get("workflow_version_id")
            or workflow_snapshot.get("workflowVersionId")
            or install.get("compiled_workflow_version_id")
            or ""
        ).strip()
        if not workflow_id or not workflow_version_id:
            raise HTTPException(status_code=409, detail="Installed agent is missing a compiled workflow artifact.")

        actor = _current_actor(current_user)
        thread_id = (
            str(body.thread_id or "").strip()
            or str(install.get("thread_id") or "").strip()
            or f"install-thread-{str(install.get('id') or install_id).strip()}"
        )
        session_id = str(body.session_id or "").strip() or thread_id
        compiled_run_metadata = compiled.get("run_metadata") if isinstance(compiled.get("run_metadata"), dict) else {}
        merged_metadata = {
            **compiled_run_metadata,
            **_coerce_dict(body.metadata),
            "source": "agent_install_run",
            "workspace_agent_install_id": str(install.get("id") or install_id).strip(),
            "active_agent_install_id": str(install.get("id") or install_id).strip(),
            "master_agent_install_id": str(install.get("id") or install_id).strip(),
            "agent_definition_id": install.get("agent_definition_id"),
            "agent_definition_version_id": install.get("agent_definition_version_id"),
            "runtime_profile_id": install.get("runtime_profile_id"),
            "runtime_profile_label": runtime_profile.get("label"),
            "runtime_id": runtime_profile.get("runtime_id"),
            "machine_id": runtime_profile.get("machine_id"),
            "compiled_workflow_id": workflow_id,
            "compiled_workflow_version_id": workflow_version_id,
            "workflow_snapshot": workflow_snapshot,
            "workflow_definition": workflow_snapshot.get("definition") if isinstance(workflow_snapshot.get("definition"), dict) else None,
            "owner_user_id": str((current_user or {}).get("user_id") or "").strip() or None,
            "owner_email": str((current_user or {}).get("email") or "").strip() or None,
        }
        message = str(body.message or "").strip() or str(install.get("label") or install.get("agent_definition", {}).get("name") or "Run installed agent").strip()
        machine_target = (
            str(body.machine_target or "").strip()
            or str(runtime_profile.get("machine_id") or "").strip()
            or None
        )
        turn_request = AgentTurnRequest(
            tenant_id=str(install.get("tenant_id") or "").strip() or "default",
            workspace_id=workspace_id,
            thread_id=thread_id,
            session_id=session_id,
            channel=str(body.channel or "web").strip() or "web",
            actor=actor,
            message=message,
            attachments=[],
            context_hints={
                "engine": "orion",
                "workflow_id": workflow_id,
                "workflow_version_id": workflow_version_id,
                "agent_role": str(install.get("agent_definition", {}).get("slug") or "").strip() or None,
                "metadata": {key: value for key, value in merged_metadata.items() if value not in ("", [], {})},
            },
            execution_mode=body.execution_mode,
            response_mode=body.response_mode,
            machine_target=machine_target,
            policy_context={key: value for key, value in body.policy_context.items() if value not in ("", [], {})},
        )
        result = await execute_canonical_agent_turn(
            turn_request=turn_request,
            current_user=current_user,
            run_execution_services=_run_execution_services(),
        )
        return normalize_agent_turn_result(result, turn_request=turn_request)
