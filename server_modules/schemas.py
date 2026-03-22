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
