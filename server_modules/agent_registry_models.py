from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, Numeric, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from server_modules.workflow_models import WorkflowControlPlaneBase


class RuntimeProfileModel(WorkflowControlPlaneBase):
    __tablename__ = "runtime_profiles"

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    tenant_id: Mapped[str] = mapped_column(Text, nullable=False, index=True)
    workspace_id: Mapped[str] = mapped_column(Text, nullable=False, index=True)
    slug: Mapped[str] = mapped_column(Text, nullable=False)
    label: Mapped[str] = mapped_column(Text, nullable=False)
    runtime_class: Mapped[str] = mapped_column(String(length=32), nullable=False, default="cloud_worker")
    placement_mode: Mapped[str] = mapped_column(String(length=32), nullable=False, default="auto")
    runtime_id: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    machine_id: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    default_execution_target: Mapped[str] = mapped_column(String(length=32), nullable=False, default="auto")
    supported_capabilities: Mapped[list[Any]] = mapped_column(JSONB, nullable=False, default=list)
    root_folder_uri: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    allowed_connector_scopes: Mapped[list[Any]] = mapped_column(JSONB, nullable=False, default=list)
    status: Mapped[str] = mapped_column(String(length=32), nullable=False, default="active")
    last_seen_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    runtime_profile_metadata: Mapped[dict[str, Any]] = mapped_column("metadata", JSONB, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())


class AgentDefinitionModel(WorkflowControlPlaneBase):
    __tablename__ = "agent_definitions"

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    tenant_id: Mapped[str] = mapped_column(Text, nullable=False, index=True)
    workspace_id: Mapped[str] = mapped_column(Text, nullable=False, index=True)
    slug: Mapped[str] = mapped_column(Text, nullable=False)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    agent_kind: Mapped[str] = mapped_column(String(length=32), nullable=False, default="specialist")
    visibility: Mapped[str] = mapped_column(String(length=32), nullable=False, default="workspace")
    status: Mapped[str] = mapped_column(String(length=32), nullable=False, default="draft")
    category: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    icon: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_by_user_id: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    current_version_id: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    published_version_id: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    source_workflow_definition_id: Mapped[Optional[str]] = mapped_column(
        Text,
        ForeignKey("workflow_definitions.id", ondelete="SET NULL"),
        nullable=True,
    )
    definition_metadata: Mapped[dict[str, Any]] = mapped_column("metadata", JSONB, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())


class AgentDefinitionVersionModel(WorkflowControlPlaneBase):
    __tablename__ = "agent_definition_versions"

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    tenant_id: Mapped[str] = mapped_column(Text, nullable=False, index=True)
    workspace_id: Mapped[str] = mapped_column(Text, nullable=False, index=True)
    agent_definition_id: Mapped[str] = mapped_column(Text, ForeignKey("agent_definitions.id", ondelete="CASCADE"), nullable=False, index=True)
    version_number: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(length=32), nullable=False, default="draft")
    manifest: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    compiled_workflow_version_id: Mapped[Optional[str]] = mapped_column(
        Text,
        ForeignKey("workflow_versions.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    capability_manifest: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    memory_scope_manifest: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    policy_manifest: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    placement_manifest: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    template_inputs_schema: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    version_metadata: Mapped[dict[str, Any]] = mapped_column("metadata", JSONB, nullable=False, default=dict)
    created_by_user_id: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class WorkspaceAgentInstallModel(WorkflowControlPlaneBase):
    __tablename__ = "workspace_agent_installs"

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    tenant_id: Mapped[str] = mapped_column(Text, nullable=False, index=True)
    workspace_id: Mapped[str] = mapped_column(Text, nullable=False, index=True)
    agent_definition_id: Mapped[str] = mapped_column(Text, ForeignKey("agent_definitions.id", ondelete="CASCADE"), nullable=False, index=True)
    agent_definition_version_id: Mapped[str] = mapped_column(
        Text,
        ForeignKey("agent_definition_versions.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    installed_by_user_id: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    install_scope: Mapped[str] = mapped_column(String(length=32), nullable=False, default="workspace")
    owner_user_id: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    thread_id: Mapped[Optional[str]] = mapped_column(Text, ForeignKey("agent_threads.id", ondelete="SET NULL"), nullable=True, index=True)
    label: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(length=32), nullable=False, default="active")
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    runtime_profile_id: Mapped[Optional[str]] = mapped_column(
        Text,
        ForeignKey("runtime_profiles.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    compiled_workflow_version_id: Mapped[Optional[str]] = mapped_column(
        Text,
        ForeignKey("workflow_versions.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    root_folder_uri: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    tool_toggles: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    folder_grants: Mapped[list[Any]] = mapped_column(JSONB, nullable=False, default=list)
    connector_bindings: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    memory_scope_overrides: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    policy_context_overrides: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    install_metadata: Mapped[dict[str, Any]] = mapped_column("metadata", JSONB, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())


class WorkspaceInventoryItemModel(WorkflowControlPlaneBase):
    __tablename__ = "workspace_inventory_items"

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    tenant_id: Mapped[str] = mapped_column(Text, nullable=False, index=True)
    workspace_id: Mapped[str] = mapped_column(Text, nullable=False, index=True)
    sku: Mapped[str] = mapped_column(Text, nullable=False)
    product_name: Mapped[str] = mapped_column(Text, nullable=False)
    manufacturer: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    make: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    model: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    category: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    year_start: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    year_end: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    quantity_available: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    unit_price: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    currency: Mapped[str] = mapped_column(String(length=8), nullable=False, default="USD")
    item_metadata: Mapped[dict[str, Any]] = mapped_column("metadata", JSONB, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())


class AgentManifestModel(WorkflowControlPlaneBase):
    __tablename__ = "agent_manifests"

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    tenant_id: Mapped[str] = mapped_column(Text, nullable=False, index=True)
    workspace_id: Mapped[str] = mapped_column(Text, nullable=False, index=True)
    agent_install_id: Mapped[str] = mapped_column(
        Text,
        ForeignKey("workspace_agent_installs.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )
    manifest_id: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(length=32), nullable=False, default="draft")
    manifest: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    manifest_metadata: Mapped[dict[str, Any]] = mapped_column("metadata", JSONB, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())


class AgentBibleVersionModel(WorkflowControlPlaneBase):
    __tablename__ = "agent_bible_versions"

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    tenant_id: Mapped[str] = mapped_column(Text, nullable=False, index=True)
    workspace_id: Mapped[str] = mapped_column(Text, nullable=False, index=True)
    agent_install_id: Mapped[str] = mapped_column(
        Text,
        ForeignKey("workspace_agent_installs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    version_number: Mapped[int] = mapped_column(Integer, nullable=False)
    bible_text: Mapped[str] = mapped_column(Text, nullable=False, default="")
    bible_sections: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    created_by_user_id: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class AgentSkillBindingModel(WorkflowControlPlaneBase):
    __tablename__ = "agent_skill_bindings"

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    tenant_id: Mapped[str] = mapped_column(Text, nullable=False, index=True)
    workspace_id: Mapped[str] = mapped_column(Text, nullable=False, index=True)
    agent_install_id: Mapped[str] = mapped_column(
        Text,
        ForeignKey("workspace_agent_installs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    skill_id: Mapped[str] = mapped_column(Text, nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    binding_metadata: Mapped[dict[str, Any]] = mapped_column("metadata", JSONB, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())


class AgentConnectorBindingModel(WorkflowControlPlaneBase):
    __tablename__ = "agent_connector_bindings"

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    tenant_id: Mapped[str] = mapped_column(Text, nullable=False, index=True)
    workspace_id: Mapped[str] = mapped_column(Text, nullable=False, index=True)
    agent_install_id: Mapped[str] = mapped_column(
        Text,
        ForeignKey("workspace_agent_installs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    connector_key: Mapped[str] = mapped_column(Text, nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    binding: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())


class AgentChannelBindingModel(WorkflowControlPlaneBase):
    __tablename__ = "agent_channel_bindings"

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    tenant_id: Mapped[str] = mapped_column(Text, nullable=False, index=True)
    workspace_id: Mapped[str] = mapped_column(Text, nullable=False, index=True)
    agent_install_id: Mapped[str] = mapped_column(
        Text,
        ForeignKey("workspace_agent_installs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    channel_key: Mapped[str] = mapped_column(Text, nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    binding: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())


class AgentRuntimeProfileBindingModel(WorkflowControlPlaneBase):
    __tablename__ = "agent_runtime_profiles"

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    tenant_id: Mapped[str] = mapped_column(Text, nullable=False, index=True)
    workspace_id: Mapped[str] = mapped_column(Text, nullable=False, index=True)
    agent_install_id: Mapped[str] = mapped_column(
        Text,
        ForeignKey("workspace_agent_installs.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )
    runtime_profile_id: Mapped[Optional[str]] = mapped_column(
        Text,
        ForeignKey("runtime_profiles.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    runtime_mode: Mapped[str] = mapped_column(String(length=32), nullable=False, default="hosted_secure")
    binding_metadata: Mapped[dict[str, Any]] = mapped_column("metadata", JSONB, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())


class PersonalContextEventModel(WorkflowControlPlaneBase):
    __tablename__ = "personal_context_events"

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    tenant_id: Mapped[str] = mapped_column(Text, nullable=False, index=True)
    workspace_id: Mapped[str] = mapped_column(Text, nullable=False, index=True)
    source_app: Mapped[str] = mapped_column(Text, nullable=False, index=True)
    event_type: Mapped[str] = mapped_column(Text, nullable=False, index=True)
    entity_id: Mapped[str] = mapped_column(Text, nullable=False, index=True)
    summary: Mapped[str] = mapped_column(Text, nullable=False, default="")
    payload: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    priority: Mapped[int] = mapped_column(Integer, nullable=False, default=50)
    event_scope: Mapped[dict[str, Any]] = mapped_column("scope", JSONB, nullable=False, default=dict)
    seen_by_sage_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    event_metadata: Mapped[dict[str, Any]] = mapped_column("metadata", JSONB, nullable=False, default=dict)
    status: Mapped[str] = mapped_column(String(length=32), nullable=False, default="active")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())


class AgentSchedulerWakeRequestModel(WorkflowControlPlaneBase):
    __tablename__ = "agent_scheduler_wake_requests"

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    tenant_id: Mapped[str] = mapped_column(Text, nullable=False, index=True)
    workspace_id: Mapped[str] = mapped_column(Text, nullable=False, index=True)
    master_agent_install_id: Mapped[Optional[str]] = mapped_column(
        Text,
        ForeignKey("workspace_agent_installs.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    trigger_kind: Mapped[str] = mapped_column(String(length=32), nullable=False, index=True)
    source: Mapped[str] = mapped_column(String(length=64), nullable=False, index=True)
    requested_by: Mapped[str] = mapped_column(String(length=64), nullable=False, default="system")
    reason: Mapped[str] = mapped_column(Text, nullable=False, default="")
    summary: Mapped[str] = mapped_column(Text, nullable=False, default="")
    payload: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    policy: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    approval_required: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    status: Mapped[str] = mapped_column(String(length=32), nullable=False, default="pending", index=True)
    denial_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    due_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    claimed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    executed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    wake_metadata: Mapped[dict[str, Any]] = mapped_column("metadata", JSONB, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())


class AgentChannelEventModel(WorkflowControlPlaneBase):
    __tablename__ = "agent_channel_events"

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    tenant_id: Mapped[str] = mapped_column(Text, nullable=False, index=True)
    workspace_id: Mapped[str] = mapped_column(Text, nullable=False, index=True)
    channel_key: Mapped[str] = mapped_column(Text, nullable=False, index=True)
    endpoint_key: Mapped[str] = mapped_column(Text, nullable=False, index=True)
    session_key: Mapped[str] = mapped_column(Text, nullable=False, index=True)
    thread_id: Mapped[Optional[str]] = mapped_column(
        Text,
        ForeignKey("agent_threads.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    responder_install_id: Mapped[Optional[str]] = mapped_column(
        Text,
        ForeignKey("workspace_agent_installs.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    direction: Mapped[str] = mapped_column(String(length=24), nullable=False)
    event_type: Mapped[str] = mapped_column(String(length=64), nullable=False)
    message_id: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    parent_event_id: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    run_id: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    actor: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    text: Mapped[str] = mapped_column(Text, nullable=False, default="")
    payload: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    event_metadata: Mapped[dict[str, Any]] = mapped_column("metadata", JSONB, nullable=False, default=dict)
    status: Mapped[str] = mapped_column(String(length=32), nullable=False, default="logged")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())


class AgentSecretAccessEventModel(WorkflowControlPlaneBase):
    __tablename__ = "agent_secret_access_events"

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    tenant_id: Mapped[str] = mapped_column(Text, nullable=False, index=True)
    workspace_id: Mapped[str] = mapped_column(Text, nullable=False, index=True)
    secret_kind: Mapped[str] = mapped_column(String(length=64), nullable=False)
    credential_id: Mapped[Optional[str]] = mapped_column(Text, nullable=True, index=True)
    provider_id: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    connector_id: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    action_id: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    tool_name: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    run_id: Mapped[Optional[str]] = mapped_column(Text, nullable=True, index=True)
    actor: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    allowed_fields: Mapped[list[str]] = mapped_column(JSONB, nullable=False, default=list)
    event_metadata: Mapped[dict[str, Any]] = mapped_column("metadata", JSONB, nullable=False, default=dict)
    status: Mapped[str] = mapped_column(String(length=32), nullable=False, default="allowed")
    denial_code: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())


class AgentEgressEventModel(WorkflowControlPlaneBase):
    __tablename__ = "agent_egress_events"

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    tenant_id: Mapped[str] = mapped_column(Text, nullable=False, index=True)
    workspace_id: Mapped[str] = mapped_column(Text, nullable=False, index=True)
    agent_install_id: Mapped[Optional[str]] = mapped_column(
        Text,
        ForeignKey("workspace_agent_installs.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    run_id: Mapped[Optional[str]] = mapped_column(Text, nullable=True, index=True)
    runtime_mode: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    tool_name: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    provider_id: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    connector_scope: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    action_class: Mapped[str] = mapped_column(String(length=32), nullable=False, default="read")
    request_method: Mapped[str] = mapped_column(String(length=16), nullable=False, default="GET")
    request_url: Mapped[str] = mapped_column(Text, nullable=False)
    request_host: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    event_metadata: Mapped[dict[str, Any]] = mapped_column("metadata", JSONB, nullable=False, default=dict)
    status: Mapped[str] = mapped_column(String(length=32), nullable=False, default="allowed")
    denial_code: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())


class AgentChannelExecutionLeaseModel(WorkflowControlPlaneBase):
    __tablename__ = "agent_channel_execution_leases"

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    tenant_id: Mapped[str] = mapped_column(Text, nullable=False, index=True)
    workspace_id: Mapped[str] = mapped_column(Text, nullable=False, index=True)
    responder_install_id: Mapped[Optional[str]] = mapped_column(
        Text,
        ForeignKey("workspace_agent_installs.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    thread_id: Mapped[str] = mapped_column(
        Text,
        ForeignKey("agent_threads.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    session_key: Mapped[str] = mapped_column(Text, nullable=False, index=True)
    channel_key: Mapped[str] = mapped_column(Text, nullable=False, index=True)
    endpoint_key: Mapped[str] = mapped_column(Text, nullable=False, index=True)
    lease_metadata: Mapped[dict[str, Any]] = mapped_column("metadata", JSONB, nullable=False, default=dict)
    acquired_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class SecurityControlStateModel(WorkflowControlPlaneBase):
    __tablename__ = "security_control_states"

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    tenant_id: Mapped[str] = mapped_column(Text, nullable=False, index=True)
    workspace_id: Mapped[str] = mapped_column(Text, nullable=False, index=True)
    scope_type: Mapped[str] = mapped_column(String(length=32), nullable=False, index=True)
    control_kind: Mapped[str] = mapped_column(String(length=32), nullable=False, default="kill_switch", index=True)
    scope_key: Mapped[str] = mapped_column(Text, nullable=False)
    agent_install_id: Mapped[Optional[str]] = mapped_column(
        Text,
        ForeignKey("workspace_agent_installs.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    channel_key: Mapped[Optional[str]] = mapped_column(Text, nullable=True, index=True)
    endpoint_key: Mapped[Optional[str]] = mapped_column(Text, nullable=True, index=True)
    connector_id: Mapped[Optional[str]] = mapped_column(Text, nullable=True, index=True)
    credential_id: Mapped[Optional[str]] = mapped_column(Text, nullable=True, index=True)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    status: Mapped[str] = mapped_column(String(length=32), nullable=False, default="active")
    reason: Mapped[str] = mapped_column(Text, nullable=False, default="")
    state_metadata: Mapped[dict[str, Any]] = mapped_column("metadata", JSONB, nullable=False, default=dict)
    created_by_user_id: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())


class SecurityControlEventModel(WorkflowControlPlaneBase):
    __tablename__ = "security_control_events"

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    tenant_id: Mapped[str] = mapped_column(Text, nullable=False, index=True)
    workspace_id: Mapped[str] = mapped_column(Text, nullable=False, index=True)
    control_state_id: Mapped[Optional[str]] = mapped_column(
        Text,
        ForeignKey("security_control_states.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    scope_type: Mapped[str] = mapped_column(String(length=32), nullable=False, index=True)
    control_kind: Mapped[str] = mapped_column(String(length=32), nullable=False, default="kill_switch", index=True)
    action: Mapped[str] = mapped_column(String(length=32), nullable=False, index=True)
    scope_key: Mapped[str] = mapped_column(Text, nullable=False)
    agent_install_id: Mapped[Optional[str]] = mapped_column(
        Text,
        ForeignKey("workspace_agent_installs.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    channel_key: Mapped[Optional[str]] = mapped_column(Text, nullable=True, index=True)
    endpoint_key: Mapped[Optional[str]] = mapped_column(Text, nullable=True, index=True)
    connector_id: Mapped[Optional[str]] = mapped_column(Text, nullable=True, index=True)
    credential_id: Mapped[Optional[str]] = mapped_column(Text, nullable=True, index=True)
    reason: Mapped[str] = mapped_column(Text, nullable=False, default="")
    actor_user_id: Mapped[Optional[str]] = mapped_column(Text, nullable=True, index=True)
    event_metadata: Mapped[dict[str, Any]] = mapped_column("metadata", JSONB, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class ActivityLedgerEventModel(WorkflowControlPlaneBase):
    __tablename__ = "activity_ledger_events"

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    tenant_id: Mapped[str] = mapped_column(Text, nullable=False, index=True)
    workspace_id: Mapped[str] = mapped_column(Text, nullable=False, index=True)
    actor_type: Mapped[str] = mapped_column(String(length=32), nullable=False, index=True)
    actor_id: Mapped[str] = mapped_column(Text, nullable=False, index=True)
    install_id: Mapped[Optional[str]] = mapped_column(
        Text,
        ForeignKey("workspace_agent_installs.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    app_id: Mapped[Optional[str]] = mapped_column(Text, nullable=True, index=True)
    run_id: Mapped[Optional[str]] = mapped_column(Text, nullable=True, index=True)
    thread_id: Mapped[Optional[str]] = mapped_column(
        Text,
        ForeignKey("agent_threads.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    session_key: Mapped[Optional[str]] = mapped_column(Text, nullable=True, index=True)
    channel: Mapped[Optional[str]] = mapped_column(Text, nullable=True, index=True)
    direction: Mapped[Optional[str]] = mapped_column(Text, nullable=True, index=True)
    event_class: Mapped[str] = mapped_column(String(length=64), nullable=False, index=True)
    detail_level: Mapped[str] = mapped_column(String(length=32), nullable=False, default="feed_summary", index=True)
    action: Mapped[Optional[str]] = mapped_column(Text, nullable=True, index=True)
    trace_id: Mapped[Optional[str]] = mapped_column(Text, nullable=True, index=True)
    title: Mapped[str] = mapped_column(Text, nullable=False, default="")
    summary: Mapped[str] = mapped_column(Text, nullable=False, default="")
    status: Mapped[str] = mapped_column(String(length=32), nullable=False, default="logged")
    review_required: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    artifacts: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, nullable=False, default=list)
    payload: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    event_metadata: Mapped[dict[str, Any]] = mapped_column("metadata", JSONB, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())
