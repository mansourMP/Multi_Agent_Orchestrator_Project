from __future__ import annotations

from typing import Any, Dict, Optional

from server_modules import (
    agent_registry_repository,
    agent_specialist_repository,
    deployed_agent_service,
)
from server_modules.channel_errors import ChannelOwnerNotFoundError
from server_modules.channel_turn_request_service import (
    bind_deployed_agent_source_to_context,
    build_routing_context,
    coerce_dict,
    install_declares_deployed_agent_source,
    runtime_profile_id_from_install,
)


async def resolve_public_channel_owner(
    *,
    tenant_id: str,
    workspace_id: str,
    channel_key: str,
    endpoint_key: str,
    customer_message: str,
    session_key: Optional[str] = None,
    message_id: Optional[str] = None,
    actor_id: Optional[str] = None,
    actor_display_name: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None,
    allow_master_fallback: bool = False,
    privileged_runtime_approved: bool = False,
    seed_demo_if_empty: bool = False,
):
    owner_route = await agent_specialist_repository.resolve_active_inbound_channel_owner(
        tenant_id=tenant_id,
        workspace_id=workspace_id,
        channel_key=channel_key,
        endpoint_key=endpoint_key,
        allow_master_fallback=allow_master_fallback,
    )
    if not isinstance(owner_route, dict):
        raise ChannelOwnerNotFoundError("No active channel owner is configured for this endpoint.")

    install = coerce_dict(owner_route.get("install"))
    manifest = owner_route.get("manifest")
    owner_type = str(owner_route.get("owner_type") or "specialist").strip() or "specialist"
    if not install or manifest is None:
        raise ChannelOwnerNotFoundError("The configured channel owner could not be resolved.")

    responder_install_id = str(install.get("id") or "").strip() or None
    deployed_agent = None
    deployed_agent_id = None
    deployed_agent_state = None
    if (
        owner_type == "specialist"
        and responder_install_id
        and install_declares_deployed_agent_source(install)
    ):
        deployed_agent = await deployed_agent_service.resolve_deployed_agent_for_channel_owner(
            tenant_id=tenant_id,
            owner_workspace_id=workspace_id,
            backing_install_id=responder_install_id,
            channel_key=channel_key,
            endpoint_key=endpoint_key,
        )
        if not isinstance(deployed_agent, dict):
            raise ChannelOwnerNotFoundError("No active channel owner is configured for this endpoint.")
        deployed_agent_id = str(deployed_agent.get("id") or "").strip() or None
        deployed_agent_state = str(deployed_agent.get("deployment_state") or "").strip().lower() or None
        if deployed_agent_service.deployment_state_blocks_public_routing(deployed_agent_state):
            raise ChannelOwnerNotFoundError("No active channel owner is configured for this endpoint.")

    master_install = (
        install
        if owner_type == "master"
        else await agent_registry_repository.get_workspace_master_agent_install(
            tenant_id=tenant_id,
            workspace_id=workspace_id,
        )
    )
    master_install_id = str(coerce_dict(master_install).get("id") or install.get("id") or "").strip() or None
    runtime_mode = (
        str(
            install.get("runtime_mode")
            or getattr(getattr(manifest, "runtime", None), "mode", "hosted_secure")
            or "hosted_secure"
        )
        .strip()
        .lower()
        or "hosted_secure"
    )
    runtime_profile_id = runtime_profile_id_from_install(install)
    request_metadata = coerce_dict(metadata)
    if deployed_agent_id:
        request_metadata.update(
            {
                "deployed_agent_id": deployed_agent_id,
                "deployment_state": deployed_agent_state,
            }
        )

    context = build_routing_context(
        tenant_id=tenant_id,
        workspace_id=workspace_id,
        channel_key=channel_key,
        endpoint_key=endpoint_key,
        customer_message=customer_message,
        install=install,
        manifest=manifest,
        owner_type=owner_type,
        session_key=session_key,
        message_id=message_id,
        actor_id=actor_id,
        actor_display_name=actor_display_name,
        metadata=request_metadata,
        master_install_id=master_install_id,
        runtime_mode=runtime_mode,
        runtime_profile_id=runtime_profile_id,
        allow_master_fallback=allow_master_fallback,
        privileged_runtime_approved=privileged_runtime_approved,
        seed_demo_if_empty=seed_demo_if_empty,
        validate_preflight=False,
    )
    context.deployed_agent = deployed_agent
    context.deployed_agent_id = deployed_agent_id
    context.deployed_agent_state = deployed_agent_state
    if isinstance(deployed_agent, dict):
        context = bind_deployed_agent_source_to_context(
            context,
            deployed_agent=deployed_agent,
            request_id=str(request_metadata.get("request_id") or "").strip() or None,
        )
        context.deployed_agent = deployed_agent
        context.deployed_agent_id = deployed_agent_id
        context.deployed_agent_state = deployed_agent_state
    context.allow_master_fallback = allow_master_fallback
    return context
