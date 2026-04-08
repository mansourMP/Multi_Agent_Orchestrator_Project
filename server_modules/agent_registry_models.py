from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, func
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
