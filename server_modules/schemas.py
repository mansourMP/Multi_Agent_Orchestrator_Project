from __future__ import annotations

from typing import Any, Dict, Optional

from pydantic import BaseModel

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
