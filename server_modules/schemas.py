from __future__ import annotations

from typing import Any, Dict, Optional

from pydantic import BaseModel, Field

from server_modules.runtime_models import ConnectorUpsertRequest, RunStartRequest


class WorkflowCreate(BaseModel):
    app_id: str
    package_id: Optional[str] = None
    release_channel: Optional[str] = None
    install_source: Optional[str] = None


class WorkflowUpdate(WorkflowCreate):
    pass


class WorkflowDelete(BaseModel):
    app_id: str


class AppCaptainBridgeRequest(BaseModel):
    workspace_id: str
    app_id: str
    bridge_type: str
    context_envelope: Optional[Dict[str, Any]] = None
    metadata: Optional[Dict[str, Any]] = None
    request_text: Optional[str] = None


class AppSpecialistBridgeRequest(BaseModel):
    workspace_id: str
    app_id: str
    bridge_type: str
    target_install_id: Optional[str] = None
    target_capability: Optional[str] = None
    context_envelope: Optional[Dict[str, Any]] = None
    metadata: Optional[Dict[str, Any]] = None
    request_text: Optional[str] = None


class AppRuntimeBridgeRequest(BaseModel):
    workspace_id: str
    app_id: str
    bridge_type: str
    connector_id: Optional[str] = None
    workflow_id: Optional[str] = None
    route_key: Optional[str] = None
    context_envelope: Optional[Dict[str, Any]] = None
    metadata: Optional[Dict[str, Any]] = None


class SageAppBridgeRequest(BaseModel):
    workspace_id: str
    app_id: str
    bridge_type: str
    target_app_id: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None
    handoff_payload: Optional[Dict[str, Any]] = None


class SageServiceProfileUpdateRequest(BaseModel):
    workspace_id: str
    profile: Dict[str, Any]


class SageServiceEntryCreateRequest(BaseModel):
    workspace_id: str
    entry: Dict[str, Any]


class SageServiceEntryUpdateRequest(BaseModel):
    workspace_id: str
    entry: Dict[str, Any]


class SageServiceEntryPinRequest(BaseModel):
    workspace_id: str
    pinned: bool = True


class SageMemoryEntryCreateRequest(BaseModel):
    workspace_id: str
    category: str
    title: str
    content: str
    pinned: bool = False


class SageMemoryEntryUpdateRequest(SageMemoryEntryCreateRequest):
    pass


class SageMemoryEntryPinRequest(BaseModel):
    workspace_id: str
    pinned: bool = True


class AgentCreate(BaseModel):
    path: Optional[str] = None
    workspace_id: Optional[str] = None
    content: Optional[str] = None
    overwrite: bool = False


class AgentUpdate(AgentCreate):
    action: Optional[str] = None


class RunCreate(RunStartRequest):
    pass


class ConnectorCreate(ConnectorUpsertRequest):
    pass


class AuthLoginRequest(BaseModel):
    email: str
    password: str
    acquisition_token: Optional[str] = None
    channel: Optional[str] = None
    device_id: Optional[str] = None
    device_name: Optional[str] = None
    device_platform: Optional[str] = None
    workspace_id: Optional[str] = None
    session_ttl_seconds: Optional[int] = None


class AuthRegisterRequest(AuthLoginRequest):
    name: Optional[str] = None


class WorkspaceFileWriteRequest(BaseModel):
    path: str
    content: Optional[str] = None
    overwrite: bool = False
    workspace_id: Optional[str] = None


class WorkspaceFileDeleteRequest(BaseModel):
    path: str
    workspace_id: Optional[str] = None


class DeviceExecuteRequest(BaseModel):
    action: str
    workspace_id: Optional[str] = None


class ConnectorDocumentCreateRequest(BaseModel):
    title: Optional[str] = None


class ConnectorSpreadsheetCreateRequest(BaseModel):
    title: Optional[str] = None


class GenericObjectBody(BaseModel):
    class Config:
        extra = "allow"

    def as_dict(self) -> Dict[str, Any]:
        if hasattr(self, "model_dump"):
            return dict(self.model_dump())
        return dict(self.dict())


class DeployedAgentAdminDashboardMessage(BaseModel):
    id: Optional[str] = None
    role: str
    content: str = ""
    created_at: Optional[str] = None
    channel: Optional[str] = None


class DeployedAgentAdminDashboardUserRow(BaseModel):
    external_user_id: Optional[str] = None
    last_message_at: Optional[str] = None
    total_message_count: int = 0
    memory_entry_count: int = 0
    last_5_messages: list[DeployedAgentAdminDashboardMessage] = Field(default_factory=list)


class DeployedAgentAdminDashboardQuestion(BaseModel):
    question: str
    count: int = 0


class DeployedAgentCustomerEntry(BaseModel):
    entry_url: Optional[str] = None
    cta_label: Optional[str] = None
    telegram_deep_link: Optional[str] = None
    bot_username: Optional[str] = None
    qr_image_url: Optional[str] = None
    qr_target: Optional[str] = None


class DeployedAgentAdminDashboardResponse(BaseModel):
    deployed_agent_id: str
    total_users: int = 0
    messages_today: int = 0
    messages_this_calendar_month: int = 0
    orders_today: int = 0
    revenue_today_usd: float = 0.0
    users_at_limit_today: int = 0
    upgrade_clicks_this_month: int = 0
    common_questions: list[DeployedAgentAdminDashboardQuestion] = Field(default_factory=list)
    customer_entry: Optional[DeployedAgentCustomerEntry] = None
    specialist_profile: Dict[str, Any] = Field(default_factory=dict)
    user_rows: list[DeployedAgentAdminDashboardUserRow] = Field(default_factory=list)
    limit: int = 50
    offset: int = 0
    has_more: bool = False
    next_cursor_last_message_at: Optional[str] = None
    next_cursor_external_user_id: Optional[str] = None


class MarketplaceAgentCard(BaseModel):
    id: str
    name: str
    description: str = ""
    category: Optional[str] = None
    quality_stars: Optional[int] = None
    cost_tier: Optional[str] = None
    telegram_bot_username: Optional[str] = None


class MarketplaceAgentListResponse(BaseModel):
    items: list[MarketplaceAgentCard] = Field(default_factory=list)
    limit: int = 100
    offset: int = 0
    has_more: bool = False


class MarketplaceUpgradeClickRequest(BaseModel):
    channel_attribution: str
    source: str
    agent_id: Optional[str] = None


class MarketplaceUpgradeClickResponse(BaseModel):
    ok: bool = True
    recorded: bool = False
    duplicate: bool = False
    deployed_agent_id: Optional[str] = None
    clicked_at: Optional[str] = None
