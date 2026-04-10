from __future__ import annotations

from typing import Any, Dict, Literal, Optional

from fastapi import Depends, HTTPException
from pydantic import BaseModel, Field

from server_modules import agent_registry_repository
from server_modules import agent_specialist_repository
from server_modules.auth import enforce_workspace_access, workspace_tenant_id
from server_modules.agent_turn import AgentTurnRequest, TurnActor, agent_turn as execute_canonical_agent_turn
from server_modules.api_contract import ApiAgentTurnResponse, normalize_agent_turn_result
from server_modules.run_service import build_server_run_execution_services
from server_modules import runtime_run_access_service
from server_modules import template_compiler_service
from server_modules import thread_service
from server_modules.agent_manifest import AgentManifest, AgentManifestBible, AgentManifestIdentity, AgentManifestSkillBinding
from server_modules import universal_operator
from server_modules import agent_channel_router
from server_modules import execution_sandbox_service
from server_modules import tool_broker
from server_modules import file_bridge_service
from server_modules import personal_context_engine
from server_modules import bounded_scheduler_service
from server_modules import safe_mode_service
from server_modules import unified_memory_service
from server_modules import runtime_attachment_service
from server_modules import activity_ledger_service
from server_modules import specialist_service


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


class SpecialistCreateRequest(BaseModel):
    workspace_id: str
    label: Optional[str] = None
    manifest: AgentManifest
    runtime_profile_id: Optional[str] = None
    runtime_mode: Literal["hosted_secure", "local_secure", "privileged_device"] = "hosted_secure"
    connector_bindings: Dict[str, Any] = Field(default_factory=dict)
    channel_bindings: Dict[str, Any] = Field(default_factory=dict)
    metadata: Dict[str, Any] = Field(default_factory=dict)


class SpecialistManifestUpdateRequest(BaseModel):
    workspace_id: str
    manifest: AgentManifest
    runtime_profile_id: Optional[str] = None
    runtime_mode: Optional[Literal["hosted_secure", "local_secure", "privileged_device"]] = None
    connector_bindings: Dict[str, Any] = Field(default_factory=dict)
    channel_bindings: Dict[str, Any] = Field(default_factory=dict)
    metadata: Dict[str, Any] = Field(default_factory=dict)


class SpecialistBibleUpdateRequest(BaseModel):
    workspace_id: str
    bible: str


class SpecialistSkillBindingsUpdateRequest(BaseModel):
    workspace_id: str
    skill_ids: list[str] = Field(default_factory=list)


class SpecialistConnectorBindingsUpdateRequest(BaseModel):
    workspace_id: str
    connector_bindings: Dict[str, Any] = Field(default_factory=dict)


class SpecialistChannelBindingsUpdateRequest(BaseModel):
    workspace_id: str
    channel_bindings: Dict[str, Any] = Field(default_factory=dict)


class SpecialistRuntimeProfileUpdateRequest(BaseModel):
    workspace_id: str
    runtime_profile_id: Optional[str] = None
    runtime_mode: Literal["hosted_secure", "local_secure", "privileged_device"] = "hosted_secure"


class AgentCustomerInventoryPreviewRequest(BaseModel):
    workspace_id: str
    tenant_id: Optional[str] = None
    agent_label: Optional[str] = None
    customer_message: str
    hard_context: Optional[str] = None
    operational_policy: Optional[str] = None
    seed_demo_if_empty: bool = False


class AgentCustomerPreviewRequest(BaseModel):
    install_id: Optional[str] = None
    workspace_id: str
    tenant_id: Optional[str] = None
    customer_message: str
    manifest: AgentManifest
    policy_context: Dict[str, Any] = Field(default_factory=dict)
    seed_demo_if_empty: bool = False


class AgentArtifactExportRequest(BaseModel):
    workspace_id: str
    artifact_reference: str
    destination_path: Optional[str] = None
    file_name: Optional[str] = None
    sync_folder_id: Optional[str] = None
    policy_context: Dict[str, Any] = Field(default_factory=dict)


class AgentChannelInboundRequest(BaseModel):
    workspace_id: str
    tenant_id: Optional[str] = None
    channel_key: Literal["telegram", "whatsapp", "email", "phone", "web_chat"]
    endpoint_key: Optional[str] = None
    customer_message: str
    session_key: Optional[str] = None
    message_id: Optional[str] = None
    actor_id: Optional[str] = None
    actor_display_name: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)
    allow_master_fallback: bool = True
    privileged_runtime_approved: bool = False
    seed_demo_if_empty: bool = False


class PersonalContextEventPublishRequest(BaseModel):
    workspace_id: str
    source_app: str
    event_type: str
    entity_id: str
    summary: Optional[str] = None
    payload: Dict[str, Any] = Field(default_factory=dict)
    priority: Optional[int] = None
    scope: Dict[str, Any] = Field(default_factory=dict)
    metadata: Dict[str, Any] = Field(default_factory=dict)


class PersonalContextEventsSeenRequest(BaseModel):
    workspace_id: str
    event_ids: list[str] = Field(default_factory=list)
    mark_all: bool = False


class SchedulerSelfWakeupRequest(BaseModel):
    workspace_id: str
    summary: str
    reason: str
    due_at: Optional[str] = None
    payload: Dict[str, Any] = Field(default_factory=dict)
    policy_context: Dict[str, Any] = Field(default_factory=dict)


class SecurityKillSwitchRequest(BaseModel):
    workspace_id: str
    tenant_id: Optional[str] = None
    scope: Literal["workspace", "agent", "channel", "connector"]
    enabled: bool = True
    reason: Optional[str] = None
    agent_install_id: Optional[str] = None
    channel_key: Optional[str] = None
    endpoint_key: Optional[str] = None
    connector_id: Optional[str] = None
    credential_id: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)


class IncidentControlRequest(BaseModel):
    workspace_id: str
    tenant_id: Optional[str] = None
    scope: Literal["workspace", "channel", "connector"]
    mode: Literal["active", "pause", "drain", "reject"] = "pause"
    reason: Optional[str] = None
    channel_key: Optional[str] = None
    endpoint_key: Optional[str] = None
    connector_id: Optional[str] = None
    credential_id: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)


class ConnectorRevokeRequest(BaseModel):
    workspace_id: str
    tenant_id: Optional[str] = None
    connector_id: str
    credential_id: Optional[str] = None
    reason: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)


class ConnectorRotateRequest(BaseModel):
    workspace_id: str
    tenant_id: Optional[str] = None
    connector_id: str
    previous_credential_id: Optional[str] = None
    replacement_credential_id: Optional[str] = None
    reason: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)


def _workspace_id_from_query_or_body(
    *,
    query_workspace_id: Optional[str],
    body_workspace_id: Optional[str] = None,
) -> str:
    return str(body_workspace_id or query_workspace_id or "").strip()


def _tenant_id_for_request(current_user: Any, workspace_id: str) -> str:
    return workspace_tenant_id(current_user, workspace_id)


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


def _raise_specialist_write_error(error: Exception) -> None:
    if isinstance(error, agent_specialist_repository.ChannelOwnershipConflictError):
        raise HTTPException(status_code=409, detail=str(error)) from error
    if isinstance(error, agent_specialist_repository.ChannelBindingValidationError):
        raise HTTPException(status_code=400, detail=str(error)) from error
    if isinstance(error, agent_specialist_repository.RuntimeProfileValidationError):
        raise HTTPException(status_code=400, detail=str(error)) from error
    raise error


def _raise_channel_route_error(error: Exception) -> None:
    if isinstance(error, agent_channel_router.ChannelIngressValidationError):
        raise HTTPException(status_code=400, detail=str(error)) from error
    if isinstance(error, agent_channel_router.ChannelOwnerNotFoundError):
        raise HTTPException(status_code=404, detail=str(error)) from error
    if isinstance(error, agent_channel_router.ChannelSecurityDeniedError):
        raise HTTPException(status_code=403, detail=str(error)) from error
    raise error


def _raise_file_bridge_error(error: Exception) -> None:
    if isinstance(error, file_bridge_service.FileBridgeArtifactNotFoundError):
        raise HTTPException(status_code=404, detail=str(error)) from error
    if isinstance(error, file_bridge_service.FileBridgePermissionError):
        raise HTTPException(status_code=403, detail=str(error)) from error
    if isinstance(error, file_bridge_service.FileBridgeValidationError):
        raise HTTPException(status_code=400, detail=str(error)) from error
    raise error


def _raise_personal_context_error(error: Exception) -> None:
    if isinstance(error, personal_context_engine.PersonalContextValidationError):
        raise HTTPException(status_code=400, detail=str(error)) from error
    raise error


def _raise_scheduler_error(error: Exception) -> None:
    if isinstance(error, bounded_scheduler_service.SchedulerPolicyError):
        raise HTTPException(status_code=400, detail=str(error)) from error
    raise error


def _raise_runtime_attachment_error(error: Exception) -> None:
    if isinstance(error, runtime_attachment_service.RuntimeAttachmentSelectionError):
        raise HTTPException(status_code=409, detail=str(error)) from error
    raise error


def _normalized_runtime_mode(install: Dict[str, Any]) -> str:
    token = str(install.get("runtime_mode") or "").strip().lower()
    return token if token in {"hosted_secure", "local_secure", "privileged_device"} else "hosted_secure"


def _inventory_preview_manifest(*, agent_label: str, hard_context: str, operational_policy: str) -> AgentManifest:
    return AgentManifest(
        manifest_id="preview-inventory-tool",
        identity=AgentManifestIdentity(
            name=str(agent_label or "").strip() or "Agent",
            role="Inventory Specialist",
            archetype="support_specialist",
            summary="Preview manifest for scoped inventory access.",
        ),
        bible=AgentManifestBible(
            mission="Answer inventory questions using the workspace catalog only.",
            hard_context=str(hard_context or "").strip(),
            operational_policy=str(operational_policy or "").strip(),
            guardrails="Do not invent stock, fitment, or pricing details.",
            escalation_triggers="Escalate requests that require policy exceptions or approval.",
        ),
        skills=[AgentManifestSkillBinding(id="inventory-tool", enabled=True)],
        connectors={
            "requested": ["inventory"],
            "bound": ["inventory"],
        },
    )


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
        tenant_id = _tenant_id_for_request(current_user, resolved_workspace_id)
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
        tenant_id = _tenant_id_for_request(current_user, resolved_workspace_id)
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
        tenant_id = _tenant_id_for_request(current_user, resolved_workspace_id)
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
        tenant_id = _tenant_id_for_request(current_user, resolved_workspace_id)
        items = await agent_registry_repository.list_workspace_agent_installs(
            tenant_id=tenant_id,
            workspace_id=resolved_workspace_id,
            include_master=bool(include_master),
        )
        return {"items": items}

    @app.post("/agent-registry/specialists", dependencies=[Depends(member_dependency)])
    async def create_specialist(
        body: SpecialistCreateRequest,
        current_user=Depends(member_dependency),
    ):
        _refresh_server_exports()
        resolved_workspace_id = enforce_workspace_access(
            current_user,
            _workspace_id_from_query_or_body(query_workspace_id=None, body_workspace_id=body.workspace_id),
            minimum_role="member",
        )
        tenant_id = _tenant_id_for_request(current_user, resolved_workspace_id)
        try:
            install = await agent_specialist_repository.create_workspace_specialist(
                tenant_id=tenant_id,
                workspace_id=resolved_workspace_id,
                manifest=body.manifest,
                created_by_user_id=str((current_user or {}).get("user_id") or "").strip() or None,
                label=str(body.label or "").strip() or None,
                runtime_profile_id=str(body.runtime_profile_id or "").strip() or None,
                runtime_mode=str(body.runtime_mode or "hosted_secure").strip() or "hosted_secure",
                connector_bindings=_coerce_dict(body.connector_bindings),
                channel_bindings=_coerce_dict(body.channel_bindings),
                metadata=_coerce_dict(body.metadata),
            )
        except Exception as error:
            _raise_specialist_write_error(error)
        if not isinstance(install, dict):
            raise HTTPException(status_code=404, detail="Unable to create specialist.")
        return install

    @app.get("/agent-registry/specialists/{install_id}", dependencies=[Depends(member_dependency)])
    async def get_specialist(
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
        tenant_id = _tenant_id_for_request(current_user, resolved_workspace_id)
        record = await agent_specialist_repository.get_workspace_specialist(
            install_id,
            tenant_id=tenant_id,
            workspace_id=resolved_workspace_id,
        )
        if not isinstance(record, dict):
            raise HTTPException(status_code=404, detail="Specialist not found.")
        service_contract = await specialist_service.build_specialist_service_contract(
            tenant_id=tenant_id,
            workspace_id=resolved_workspace_id,
            install=record,
        )
        return {
            **record,
            "service_contract": service_contract,
        }

    @app.patch("/agent-registry/specialists/{install_id}", dependencies=[Depends(member_dependency)])
    async def update_specialist_manifest(
        install_id: str,
        body: SpecialistManifestUpdateRequest,
        current_user=Depends(member_dependency),
    ):
        _refresh_server_exports()
        resolved_workspace_id = enforce_workspace_access(
            current_user,
            _workspace_id_from_query_or_body(query_workspace_id=None, body_workspace_id=body.workspace_id),
            minimum_role="member",
        )
        tenant_id = _tenant_id_for_request(current_user, resolved_workspace_id)
        try:
            record = await agent_specialist_repository.update_workspace_specialist_manifest(
                install_id,
                tenant_id=tenant_id,
                workspace_id=resolved_workspace_id,
                manifest=body.manifest,
                updated_by_user_id=str((current_user or {}).get("user_id") or "").strip() or None,
                runtime_profile_id=str(body.runtime_profile_id or "").strip() or None,
                runtime_mode=str(body.runtime_mode or "").strip() or None,
                connector_bindings=_coerce_dict(body.connector_bindings),
                channel_bindings=_coerce_dict(body.channel_bindings),
                metadata=_coerce_dict(body.metadata),
            )
        except Exception as error:
            _raise_specialist_write_error(error)
        if not isinstance(record, dict):
            raise HTTPException(status_code=404, detail="Specialist not found.")
        return record

    @app.put("/agent-registry/specialists/{install_id}/bible", dependencies=[Depends(member_dependency)])
    async def save_specialist_bible(
        install_id: str,
        body: SpecialistBibleUpdateRequest,
        current_user=Depends(member_dependency),
    ):
        _refresh_server_exports()
        resolved_workspace_id = enforce_workspace_access(
            current_user,
            _workspace_id_from_query_or_body(query_workspace_id=None, body_workspace_id=body.workspace_id),
            minimum_role="member",
        )
        tenant_id = _tenant_id_for_request(current_user, resolved_workspace_id)
        record = await agent_specialist_repository.save_workspace_specialist_bible(
            install_id,
            tenant_id=tenant_id,
            workspace_id=resolved_workspace_id,
            bible=str(body.bible or ""),
            updated_by_user_id=str((current_user or {}).get("user_id") or "").strip() or None,
        )
        if not isinstance(record, dict):
            raise HTTPException(status_code=404, detail="Specialist not found.")
        return record

    @app.put("/agent-registry/specialists/{install_id}/skills", dependencies=[Depends(member_dependency)])
    async def save_specialist_skills(
        install_id: str,
        body: SpecialistSkillBindingsUpdateRequest,
        current_user=Depends(member_dependency),
    ):
        _refresh_server_exports()
        resolved_workspace_id = enforce_workspace_access(
            current_user,
            _workspace_id_from_query_or_body(query_workspace_id=None, body_workspace_id=body.workspace_id),
            minimum_role="member",
        )
        tenant_id = _tenant_id_for_request(current_user, resolved_workspace_id)
        record = await agent_specialist_repository.save_workspace_specialist_skill_bindings(
            install_id,
            tenant_id=tenant_id,
            workspace_id=resolved_workspace_id,
            skill_ids=list(body.skill_ids or []),
            updated_by_user_id=str((current_user or {}).get("user_id") or "").strip() or None,
        )
        if not isinstance(record, dict):
            raise HTTPException(status_code=404, detail="Specialist not found.")
        return record

    @app.put("/agent-registry/specialists/{install_id}/connectors", dependencies=[Depends(member_dependency)])
    async def save_specialist_connectors(
        install_id: str,
        body: SpecialistConnectorBindingsUpdateRequest,
        current_user=Depends(member_dependency),
    ):
        _refresh_server_exports()
        resolved_workspace_id = enforce_workspace_access(
            current_user,
            _workspace_id_from_query_or_body(query_workspace_id=None, body_workspace_id=body.workspace_id),
            minimum_role="member",
        )
        tenant_id = _tenant_id_for_request(current_user, resolved_workspace_id)
        record = await agent_specialist_repository.save_workspace_specialist_connector_bindings(
            install_id,
            tenant_id=tenant_id,
            workspace_id=resolved_workspace_id,
            connector_bindings=_coerce_dict(body.connector_bindings),
            updated_by_user_id=str((current_user or {}).get("user_id") or "").strip() or None,
        )
        if not isinstance(record, dict):
            raise HTTPException(status_code=404, detail="Specialist not found.")
        return record

    @app.put("/agent-registry/specialists/{install_id}/channels", dependencies=[Depends(member_dependency)])
    async def save_specialist_channels(
        install_id: str,
        body: SpecialistChannelBindingsUpdateRequest,
        current_user=Depends(member_dependency),
    ):
        _refresh_server_exports()
        resolved_workspace_id = enforce_workspace_access(
            current_user,
            _workspace_id_from_query_or_body(query_workspace_id=None, body_workspace_id=body.workspace_id),
            minimum_role="member",
        )
        tenant_id = _tenant_id_for_request(current_user, resolved_workspace_id)
        try:
            record = await agent_specialist_repository.save_workspace_specialist_channel_bindings(
                install_id,
                tenant_id=tenant_id,
                workspace_id=resolved_workspace_id,
                channel_bindings=_coerce_dict(body.channel_bindings),
                updated_by_user_id=str((current_user or {}).get("user_id") or "").strip() or None,
            )
        except Exception as error:
            _raise_specialist_write_error(error)
        if not isinstance(record, dict):
            raise HTTPException(status_code=404, detail="Specialist not found.")
        return record

    @app.put("/agent-registry/specialists/{install_id}/runtime", dependencies=[Depends(member_dependency)])
    async def save_specialist_runtime(
        install_id: str,
        body: SpecialistRuntimeProfileUpdateRequest,
        current_user=Depends(member_dependency),
    ):
        _refresh_server_exports()
        resolved_workspace_id = enforce_workspace_access(
            current_user,
            _workspace_id_from_query_or_body(query_workspace_id=None, body_workspace_id=body.workspace_id),
            minimum_role="member",
        )
        tenant_id = _tenant_id_for_request(current_user, resolved_workspace_id)
        try:
            record = await agent_specialist_repository.save_workspace_specialist_runtime_profile(
                install_id,
                tenant_id=tenant_id,
                workspace_id=resolved_workspace_id,
                runtime_profile_id=str(body.runtime_profile_id or "").strip() or None,
                runtime_mode=str(body.runtime_mode or "hosted_secure").strip() or "hosted_secure",
                updated_by_user_id=str((current_user or {}).get("user_id") or "").strip() or None,
            )
        except Exception as error:
            _raise_specialist_write_error(error)
        if not isinstance(record, dict):
            raise HTTPException(status_code=404, detail="Specialist not found.")
        return record

    @app.post("/agents/customer-preview/inventory", dependencies=[Depends(member_dependency)])
    async def preview_inventory_skill(
        body: AgentCustomerInventoryPreviewRequest,
        current_user=Depends(member_dependency),
    ):
        _refresh_server_exports()
        resolved_workspace_id = enforce_workspace_access(
            current_user,
            _workspace_id_from_query_or_body(query_workspace_id=None, body_workspace_id=body.workspace_id),
            tenant_id=str(body.tenant_id or "").strip() or None,
            minimum_role="viewer",
        )
        tenant_id = _tenant_id_for_request(current_user, resolved_workspace_id)
        preview_manifest = _inventory_preview_manifest(
            agent_label=str(body.agent_label or "").strip() or "Agent",
            hard_context=str(body.hard_context or "").strip(),
            operational_policy=str(body.operational_policy or "").strip(),
        )
        runtime_mode = "hosted_secure"
        runtime_scope = execution_sandbox_service.runtime_scope(runtime_mode=runtime_mode)
        capability_grant = tool_broker.issue_capability_token(
            manifest=preview_manifest,
            tenant_id=tenant_id,
            workspace_id=resolved_workspace_id,
            runtime_mode=runtime_mode,
            runtime_scope=runtime_scope,
            privileged_runtime_approved=False,
        )
        result = await tool_broker.execute_skill(
            capability_token=capability_grant.token,
            manifest_id=preview_manifest.manifest_id,
            tenant_id=tenant_id,
            workspace_id=resolved_workspace_id,
            runtime_mode=runtime_mode,
            skill_id="inventory-tool",
            goal=str(body.customer_message or "").strip(),
            agent_label=preview_manifest.identity.name,
            hard_context=preview_manifest.bible.hard_context,
            operational_policy=preview_manifest.bible.operational_policy,
            seed_demo_if_empty=bool(body.seed_demo_if_empty),
        )
        return {
            "workspace_id": resolved_workspace_id,
            "tenant_id": tenant_id,
            **result,
        }

    @app.post("/agents/customer-preview/respond", dependencies=[Depends(member_dependency)])
    async def preview_customer_mode_turn(
        body: AgentCustomerPreviewRequest,
        current_user=Depends(member_dependency),
    ):
        _refresh_server_exports()
        resolved_workspace_id = enforce_workspace_access(
            current_user,
            _workspace_id_from_query_or_body(query_workspace_id=None, body_workspace_id=body.workspace_id),
            tenant_id=str(body.tenant_id or "").strip() or None,
            minimum_role="viewer",
        )
        tenant_id = _tenant_id_for_request(current_user, resolved_workspace_id)
        runtime_mode = "hosted_secure"
        runtime_profile: Dict[str, Any] | None = None
        resolved_manifest = body.manifest
        install_id = str(body.install_id or "").strip()
        if install_id:
            install = await agent_registry_repository.get_workspace_agent_install_bundle(
                install_id,
                tenant_id=tenant_id,
                workspace_id=resolved_workspace_id,
            )
            if not isinstance(install, dict):
                raise HTTPException(status_code=404, detail="Specialist not found.")
            runtime_mode = _normalized_runtime_mode(install)
            runtime_profile = install.get("runtime_profile") if isinstance(install.get("runtime_profile"), dict) else None
            server_manifest = agent_specialist_repository.manifest_from_install_bundle(install)
            if isinstance(server_manifest, AgentManifest):
                resolved_manifest = server_manifest
        result = await universal_operator.execute_customer_turn(
            manifest=resolved_manifest,
            tenant_id=tenant_id,
            workspace_id=resolved_workspace_id,
            goal=str(body.customer_message or "").strip(),
            seed_demo_if_empty=bool(body.seed_demo_if_empty),
            runtime_mode=runtime_mode,
            runtime_profile=runtime_profile,
            privileged_runtime_approved=bool(_coerce_dict(body.policy_context).get("privileged_runtime_approved")),
            active_agent_install_id=install_id or None,
        )
        return {
            "workspace_id": resolved_workspace_id,
            "tenant_id": tenant_id,
            **result,
        }

    @app.post("/agent-registry/channels/inbound", dependencies=[Depends(member_dependency)])
    async def route_inbound_channel(
        body: AgentChannelInboundRequest,
        current_user=Depends(member_dependency),
    ):
        _refresh_server_exports()
        resolved_workspace_id = enforce_workspace_access(
            current_user,
            _workspace_id_from_query_or_body(query_workspace_id=None, body_workspace_id=body.workspace_id),
            tenant_id=str(body.tenant_id or "").strip() or None,
            minimum_role="viewer",
        )
        tenant_id = _tenant_id_for_request(current_user, resolved_workspace_id)
        try:
            result = await agent_channel_router.route_inbound_channel_message(
                tenant_id=tenant_id,
                workspace_id=resolved_workspace_id,
                channel_key=body.channel_key,
                endpoint_key=body.endpoint_key,
                customer_message=body.customer_message,
                session_key=body.session_key,
                message_id=body.message_id,
                actor_id=body.actor_id,
                actor_display_name=body.actor_display_name,
                metadata=_coerce_dict(body.metadata),
                allow_master_fallback=bool(body.allow_master_fallback),
                privileged_runtime_approved=bool(body.privileged_runtime_approved),
                seed_demo_if_empty=bool(body.seed_demo_if_empty),
            )
        except Exception as error:
            _raise_channel_route_error(error)
        return result

    @app.post("/agent-registry/personal-context/events", dependencies=[Depends(member_dependency)])
    async def publish_personal_context_event(
        body: PersonalContextEventPublishRequest,
        current_user=Depends(member_dependency),
    ):
        _refresh_server_exports()
        resolved_workspace_id = enforce_workspace_access(
            current_user,
            _workspace_id_from_query_or_body(query_workspace_id=None, body_workspace_id=body.workspace_id),
            minimum_role="member",
        )
        tenant_id = _tenant_id_for_request(current_user, resolved_workspace_id)
        try:
            event = await personal_context_engine.publish_event(
                tenant_id=tenant_id,
                workspace_id=resolved_workspace_id,
                source_app=body.source_app,
                event_type=body.event_type,
                entity_id=body.entity_id,
                summary=body.summary,
                payload=_coerce_dict(body.payload),
                priority=body.priority,
                scope=_coerce_dict(body.scope),
                metadata=_coerce_dict(body.metadata),
            )
        except Exception as error:
            _raise_personal_context_error(error)
        return {
            "workspace_id": resolved_workspace_id,
            "tenant_id": tenant_id,
            "event": event,
        }

    @app.get("/agent-registry/personal-context/events", dependencies=[Depends(member_dependency)])
    async def list_personal_context_events(
        workspace_id: Optional[str] = None,
        audience: Literal["sage", "specialist"] = "sage",
        agent_install_id: Optional[str] = None,
        limit: int = 40,
        unseen_only: bool = False,
        source_app: Optional[str] = None,
        event_type: Optional[str] = None,
        current_user=Depends(member_dependency),
    ):
        _refresh_server_exports()
        resolved_workspace_id = enforce_workspace_access(
            current_user,
            _workspace_id_from_query_or_body(query_workspace_id=workspace_id),
            minimum_role="viewer",
        )
        tenant_id = _tenant_id_for_request(current_user, resolved_workspace_id)
        resolved_install_id = str(agent_install_id or "").strip() or None
        if resolved_install_id:
            install = await agent_registry_repository.get_workspace_agent_install_bundle(
                resolved_install_id,
                tenant_id=tenant_id,
                workspace_id=resolved_workspace_id,
            )
            if not isinstance(install, dict):
                raise HTTPException(status_code=404, detail="Specialist install not found.")
        try:
            items = await personal_context_engine.list_events(
                tenant_id=tenant_id,
                workspace_id=resolved_workspace_id,
                audience=audience,
                agent_install_id=resolved_install_id,
                limit=limit,
                unseen_only=unseen_only,
                source_app=source_app,
                event_type=event_type,
            )
        except Exception as error:
            _raise_personal_context_error(error)
        return {
            "workspace_id": resolved_workspace_id,
            "tenant_id": tenant_id,
            "audience": audience,
            "agent_install_id": resolved_install_id,
            "items": items,
            "summary": personal_context_engine.summarize_context_feed(items),
            "count": len(items),
        }

    @app.post("/agent-registry/personal-context/events/seen", dependencies=[Depends(member_dependency)])
    async def mark_personal_context_events_seen(
        body: PersonalContextEventsSeenRequest,
        current_user=Depends(member_dependency),
    ):
        _refresh_server_exports()
        resolved_workspace_id = enforce_workspace_access(
            current_user,
            _workspace_id_from_query_or_body(query_workspace_id=None, body_workspace_id=body.workspace_id),
            minimum_role="member",
        )
        tenant_id = _tenant_id_for_request(current_user, resolved_workspace_id)
        result = await personal_context_engine.mark_seen_by_sage(
            tenant_id=tenant_id,
            workspace_id=resolved_workspace_id,
            event_ids=list(body.event_ids or []),
            mark_all=bool(body.mark_all),
        )
        return {
            "workspace_id": resolved_workspace_id,
            "tenant_id": tenant_id,
            **result,
        }

    @app.post("/agent-registry/scheduler/self-wakeups", dependencies=[Depends(member_dependency)])
    async def schedule_self_wakeup(
        body: SchedulerSelfWakeupRequest,
        current_user=Depends(member_dependency),
    ):
        _refresh_server_exports()
        resolved_workspace_id = enforce_workspace_access(
            current_user,
            _workspace_id_from_query_or_body(query_workspace_id=None, body_workspace_id=body.workspace_id),
            minimum_role="member",
        )
        tenant_id = _tenant_id_for_request(current_user, resolved_workspace_id)
        try:
            result = await bounded_scheduler_service.propose_self_wakeup(
                tenant_id=tenant_id,
                workspace_id=resolved_workspace_id,
                summary=body.summary,
                reason=body.reason,
                due_at=body.due_at,
                payload=_coerce_dict(body.payload),
                policy_context={
                    **_coerce_dict(body.policy_context),
                    "requested_via": "agent_registry_api",
                    "requested_by_user_id": str((current_user or {}).get("user_id") or "").strip() or None,
                },
                requested_by="sage",
            )
        except Exception as error:
            _raise_scheduler_error(error)
        return {
            "workspace_id": resolved_workspace_id,
            "tenant_id": tenant_id,
            **result,
        }

    @app.post("/agent-registry/security/kill-switches", dependencies=[Depends(member_dependency)])
    async def set_security_kill_switch(
        body: SecurityKillSwitchRequest,
        current_user=Depends(member_dependency),
    ):
        _refresh_server_exports()
        resolved_workspace_id = enforce_workspace_access(
            current_user,
            _workspace_id_from_query_or_body(query_workspace_id=None, body_workspace_id=body.workspace_id),
            tenant_id=str(body.tenant_id or "").strip() or None,
            minimum_role="owner",
        )
        tenant_id = _tenant_id_for_request(current_user, resolved_workspace_id)
        try:
            return safe_mode_service.set_kill_switch(
                scope=body.scope,
                enabled=bool(body.enabled),
                tenant_id=tenant_id,
                workspace_id=resolved_workspace_id,
                agent_install_id=str(body.agent_install_id or "").strip() or None,
                channel_key=str(body.channel_key or "").strip() or None,
                endpoint_key=str(body.endpoint_key or "").strip() or None,
                connector_id=str(body.connector_id or "").strip() or None,
                credential_id=str(body.credential_id or "").strip() or None,
                reason=str(body.reason or "").strip(),
                metadata={
                    **_coerce_dict(body.metadata),
                    "requested_via": "agent_registry_api",
                    "requested_by_user_id": str((current_user or {}).get("user_id") or "").strip() or None,
                    "requested_by_email": str((current_user or {}).get("email") or "").strip() or None,
                },
            )
        except ValueError as error:
            raise HTTPException(status_code=400, detail=str(error)) from error

    @app.post("/agent-registry/reliability/incident-controls", dependencies=[Depends(member_dependency)])
    async def set_reliability_incident_control(
        body: IncidentControlRequest,
        current_user=Depends(member_dependency),
    ):
        _refresh_server_exports()
        resolved_workspace_id = enforce_workspace_access(
            current_user,
            _workspace_id_from_query_or_body(query_workspace_id=None, body_workspace_id=body.workspace_id),
            tenant_id=str(body.tenant_id or "").strip() or None,
            minimum_role="owner",
        )
        tenant_id = _tenant_id_for_request(current_user, resolved_workspace_id)
        try:
            return safe_mode_service.set_incident_control(
                scope=body.scope,
                mode=body.mode,
                tenant_id=tenant_id,
                workspace_id=resolved_workspace_id,
                reason=str(body.reason or "").strip(),
                channel_key=str(body.channel_key or "").strip() or None,
                endpoint_key=str(body.endpoint_key or "").strip() or None,
                connector_id=str(body.connector_id or "").strip() or None,
                credential_id=str(body.credential_id or "").strip() or None,
                metadata={
                    **_coerce_dict(body.metadata),
                    "requested_via": "agent_registry_api",
                    "requested_by_user_id": str((current_user or {}).get("user_id") or "").strip() or None,
                    "requested_by_email": str((current_user or {}).get("email") or "").strip() or None,
                },
            )
        except ValueError as error:
            raise HTTPException(status_code=400, detail=str(error)) from error

    @app.post("/agent-registry/security/connectors/revoke", dependencies=[Depends(member_dependency)])
    async def revoke_connector_access(
        body: ConnectorRevokeRequest,
        current_user=Depends(member_dependency),
    ):
        _refresh_server_exports()
        resolved_workspace_id = enforce_workspace_access(
            current_user,
            _workspace_id_from_query_or_body(query_workspace_id=None, body_workspace_id=body.workspace_id),
            tenant_id=str(body.tenant_id or "").strip() or None,
            minimum_role="owner",
        )
        tenant_id = _tenant_id_for_request(current_user, resolved_workspace_id)
        return safe_mode_service.revoke_connector_access(
            tenant_id=tenant_id,
            workspace_id=resolved_workspace_id,
            connector_id=body.connector_id,
            credential_id=str(body.credential_id or "").strip() or None,
            reason=str(body.reason or "").strip(),
            metadata={
                **_coerce_dict(body.metadata),
                "requested_via": "agent_registry_api",
                "requested_by_user_id": str((current_user or {}).get("user_id") or "").strip() or None,
                "requested_by_email": str((current_user or {}).get("email") or "").strip() or None,
            },
        )

    @app.post("/agent-registry/security/connectors/rotate", dependencies=[Depends(member_dependency)])
    async def rotate_connector_access(
        body: ConnectorRotateRequest,
        current_user=Depends(member_dependency),
    ):
        _refresh_server_exports()
        resolved_workspace_id = enforce_workspace_access(
            current_user,
            _workspace_id_from_query_or_body(query_workspace_id=None, body_workspace_id=body.workspace_id),
            tenant_id=str(body.tenant_id or "").strip() or None,
            minimum_role="owner",
        )
        tenant_id = _tenant_id_for_request(current_user, resolved_workspace_id)
        return safe_mode_service.rotate_connector_access(
            tenant_id=tenant_id,
            workspace_id=resolved_workspace_id,
            connector_id=body.connector_id,
            previous_credential_id=str(body.previous_credential_id or "").strip() or None,
            replacement_credential_id=str(body.replacement_credential_id or "").strip() or None,
            reason=str(body.reason or "").strip(),
            metadata={
                **_coerce_dict(body.metadata),
                "requested_via": "agent_registry_api",
                "requested_by_user_id": str((current_user or {}).get("user_id") or "").strip() or None,
                "requested_by_email": str((current_user or {}).get("email") or "").strip() or None,
            },
        )

    @app.get("/agent-registry/scheduler/status", dependencies=[Depends(member_dependency)])
    async def get_scheduler_status(
        workspace_id: Optional[str] = None,
        current_user=Depends(member_dependency),
    ):
        _refresh_server_exports()
        resolved_workspace_id = enforce_workspace_access(
            current_user,
            _workspace_id_from_query_or_body(query_workspace_id=workspace_id),
            minimum_role="viewer",
        )
        tenant_id = _tenant_id_for_request(current_user, resolved_workspace_id)
        snapshot = await bounded_scheduler_service.scheduler_status_snapshot(
            tenant_id=tenant_id,
            workspace_id=resolved_workspace_id,
        )
        return {
            "workspace_id": resolved_workspace_id,
            "tenant_id": tenant_id,
            **snapshot,
        }

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
        tenant_id = _tenant_id_for_request(current_user, resolved_workspace_id)
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
        thread_record = await thread_service.get_thread(
            thread_id,
            tenant_id=tenant_id,
            workspace_id=resolved_workspace_id,
            include_turns=True,
        )
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
        personal_context = await personal_context_engine.build_sage_context_payload(
            tenant_id=tenant_id,
            workspace_id=resolved_workspace_id,
            limit=20,
        )
        unified_memory = await unified_memory_service.build_sage_memory_payload(
            tenant_id=tenant_id,
            workspace_id=resolved_workspace_id,
        )
        runtime_attachments = await runtime_attachment_service.list_workspace_runtime_attachments(
            tenant_id=tenant_id,
            workspace_id=resolved_workspace_id,
        )
        scheduler_status = await bounded_scheduler_service.scheduler_status_snapshot(
            tenant_id=tenant_id,
            workspace_id=resolved_workspace_id,
            limit=12,
        )
        recent_activity = await activity_ledger_service.list_sage_recent_activity_payload(
            tenant_id=tenant_id,
            workspace_id=resolved_workspace_id,
            limit=12,
        )
        specialist_services = await specialist_service.list_workspace_specialist_service_summaries(
            tenant_id=tenant_id,
            workspace_id=resolved_workspace_id,
            installs=active_specialists,
        )
        return {
            "workspace_id": resolved_workspace_id,
            "tenant_id": tenant_id,
            "thread_id": thread_id,
            "master_install": master_install,
            "specialist_installs": active_specialists,
            "specialist_services": specialist_services,
            "thread": thread_record,
            "personal_context": personal_context,
            "unified_memory": unified_memory,
            "runtime_attachments": runtime_attachments,
            "scheduler": scheduler_status,
            "recent_activity": recent_activity,
        }

    @app.get("/agent-registry/runtime-attachments", dependencies=[Depends(member_dependency)])
    async def list_runtime_attachments(
        workspace_id: Optional[str] = None,
        current_user=Depends(member_dependency),
    ):
        resolved_workspace_id = enforce_workspace_access(
            current_user,
            _workspace_id_from_query_or_body(query_workspace_id=workspace_id),
            minimum_role="viewer",
        )
        tenant_id = _tenant_id_for_request(current_user, resolved_workspace_id)
        return await runtime_attachment_service.list_workspace_runtime_attachments(
            tenant_id=tenant_id,
            workspace_id=resolved_workspace_id,
        )

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
        tenant_id = _tenant_id_for_request(current_user, resolved_workspace_id)
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
        tenant_id = _tenant_id_for_request(current_user, resolved_workspace_id)
        record = await agent_registry_repository.get_workspace_agent_install_bundle(
            install_id,
            tenant_id=tenant_id,
            workspace_id=resolved_workspace_id,
        )
        if not isinstance(record, dict):
            raise HTTPException(status_code=404, detail="Installed agent not found.")
        return record

    @app.post("/agent-registry/installs/{install_id}/artifacts/export", dependencies=[Depends(member_dependency)])
    async def export_install_artifact(
        install_id: str,
        body: AgentArtifactExportRequest,
        current_user=Depends(member_dependency),
    ):
        _refresh_server_exports()
        resolved_workspace_id = enforce_workspace_access(
            current_user,
            _workspace_id_from_query_or_body(query_workspace_id=None, body_workspace_id=body.workspace_id),
            minimum_role="member",
        )
        tenant_id = _tenant_id_for_request(current_user, resolved_workspace_id)
        install = await agent_registry_repository.get_workspace_agent_install_bundle(
            install_id,
            tenant_id=tenant_id,
            workspace_id=resolved_workspace_id,
        )
        if not isinstance(install, dict):
            raise HTTPException(status_code=404, detail="Installed agent not found.")
        try:
            result = file_bridge_service.export_artifact_for_install(
                install=install,
                tenant_id=tenant_id,
                workspace_id=resolved_workspace_id,
                artifact_reference=str(body.artifact_reference or "").strip(),
                destination_path=str(body.destination_path or "").strip() or None,
                file_name=str(body.file_name or "").strip() or None,
                sync_folder_id=str(body.sync_folder_id or "").strip() or None,
                policy_context=_coerce_dict(body.policy_context),
                actor={
                    "user_id": str((current_user or {}).get("user_id") or "").strip() or None,
                    "email": str((current_user or {}).get("email") or "").strip() or None,
                    "role": str((current_user or {}).get("role") or "").strip() or None,
                },
            )
        except Exception as error:
            _raise_file_bridge_error(error)
        return {
            "workspace_id": resolved_workspace_id,
            "tenant_id": tenant_id,
            **result,
        }

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
        tenant_id = _tenant_id_for_request(current_user, resolved_workspace_id)
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
            str(install.get("workspace_id") or "").strip(),
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
        runtime_scope = execution_sandbox_service.runtime_scope(
            runtime_mode=_normalized_runtime_mode(install),
            runtime_profile=runtime_profile,
            install=install,
        )
        try:
            runtime_selection = await runtime_attachment_service.resolve_install_runtime_plan(
                tenant_id=str(install.get("tenant_id") or "").strip(),
                workspace_id=workspace_id,
                install=install,
                requested_machine_target=str(body.machine_target or "").strip() or None,
                policy_context=_coerce_dict(body.policy_context),
            )
        except Exception as error:
            _raise_runtime_attachment_error(error)
            raise
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
            "runtime_mode": _normalized_runtime_mode(install),
            "runtime_profile_label": runtime_profile.get("label"),
            "runtime_id": runtime_profile.get("runtime_id"),
            "machine_id": runtime_profile.get("machine_id"),
            "runtime_scope": runtime_scope,
            "runtime_selection": runtime_selection,
            "runtime_attachment_id": runtime_selection.get("selected_attachment", {}).get("attachment_id"),
            "runtime_attachment_kind": runtime_selection.get("selected_attachment", {}).get("attachment_kind"),
            "workspace_runtime_deployment_mode": runtime_selection.get("deployment_mode"),
            "compiled_workflow_id": workflow_id,
            "compiled_workflow_version_id": workflow_version_id,
            "workflow_snapshot": workflow_snapshot,
            "workflow_definition": workflow_snapshot.get("definition") if isinstance(workflow_snapshot.get("definition"), dict) else None,
            "owner_user_id": str((current_user or {}).get("user_id") or "").strip() or None,
            "owner_email": str((current_user or {}).get("email") or "").strip() or None,
        }
        if _normalized_runtime_mode(install) == "hosted_secure":
            merged_metadata["root_folder_uri"] = None
            merged_metadata["folder_grants"] = []
            merged_metadata["file_mount_grants"] = []
            merged_metadata["machine_id"] = None
            merged_metadata["execution_target"] = str(runtime_selection.get("execution_target_selected") or "cloud")
            merged_metadata["execution_target_selected"] = str(runtime_selection.get("execution_target_selected") or "cloud")
        else:
            merged_metadata["root_folder_uri"] = str(install.get("root_folder_uri") or runtime_profile.get("root_folder_uri") or "").strip() or None
            merged_metadata["folder_grants"] = list(install.get("folder_grants") or []) if isinstance(install.get("folder_grants"), list) else []
            merged_metadata["execution_target_selected"] = str(runtime_selection.get("execution_target_selected") or "local_companion")
        message = str(body.message or "").strip() or str(install.get("label") or install.get("agent_definition", {}).get("name") or "Run installed agent").strip()
        machine_target = str(runtime_selection.get("machine_target") or "").strip() or None
        runtime_mode = _normalized_runtime_mode(install)
        if runtime_mode in {"local_secure", "privileged_device"} and str(runtime_profile.get("runtime_class") or "").strip() != "desktop_companion":
            raise HTTPException(status_code=409, detail="This specialist requires a desktop companion runtime profile.")
        if runtime_mode == "privileged_device" and not bool(body.policy_context.get("privileged_runtime_approved")):
            raise HTTPException(status_code=409, detail="Privileged device execution requires explicit owner approval.")
        turn_request = AgentTurnRequest(
            tenant_id=str(install.get("tenant_id") or "").strip(),
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
                "metadata": {
                    **{key: value for key, value in merged_metadata.items() if value not in ("", [], {})},
                    **{
                        key: merged_metadata.get(key)
                        for key in (
                            "root_folder_uri",
                            "folder_grants",
                            "file_mount_grants",
                            "runtime_scope",
                            "execution_target",
                            "execution_target_selected",
                        )
                        if key in merged_metadata
                    },
                },
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
