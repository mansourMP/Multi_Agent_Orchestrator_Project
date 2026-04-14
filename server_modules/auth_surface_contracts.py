from __future__ import annotations

from dataclasses import dataclass
from typing import Dict


WEB_WORKSPACE_SURFACE_MODE = "web_workspace"
WEB_ADMIN_SURFACE_MODE = "web_admin"
RUNTIME_API_SURFACE_MODE = "runtime_api"
CONNECTOR_ADMIN_SURFACE_MODE = "connector_admin"
DEPLOYED_AGENT_OWNER_SURFACE_MODE = "deployed_agent_owner"
PUBLIC_CONNECTOR_WEBHOOK_SURFACE_MODE = "public_connector_webhook"
PUBLIC_CHANNEL_INGRESS_SURFACE_MODE = "public_channel_ingress"


@dataclass(frozen=True)
class AuthSurfaceContract:
    mode: str
    description: str
    trust_boundary: str
    cookie_csrf_mutations: bool
    conceal_cross_owner_objects: bool
    allows_authenticated_user: bool
    allows_public_webhook: bool


SURFACE_CONTRACTS: Dict[str, AuthSurfaceContract] = {
    WEB_WORKSPACE_SURFACE_MODE: AuthSurfaceContract(
        mode=WEB_WORKSPACE_SURFACE_MODE,
        description="First-party authenticated workspace APIs.",
        trust_boundary="authenticated first-party user session",
        cookie_csrf_mutations=True,
        conceal_cross_owner_objects=False,
        allows_authenticated_user=True,
        allows_public_webhook=False,
    ),
    WEB_ADMIN_SURFACE_MODE: AuthSurfaceContract(
        mode=WEB_ADMIN_SURFACE_MODE,
        description="Platform operator and admin routes.",
        trust_boundary="platform operator boundary",
        cookie_csrf_mutations=True,
        conceal_cross_owner_objects=False,
        allows_authenticated_user=True,
        allows_public_webhook=False,
    ),
    RUNTIME_API_SURFACE_MODE: AuthSurfaceContract(
        mode=RUNTIME_API_SURFACE_MODE,
        description="Authenticated runtime and run APIs.",
        trust_boundary="authenticated runtime boundary",
        cookie_csrf_mutations=True,
        conceal_cross_owner_objects=True,
        allows_authenticated_user=True,
        allows_public_webhook=False,
    ),
    CONNECTOR_ADMIN_SURFACE_MODE: AuthSurfaceContract(
        mode=CONNECTOR_ADMIN_SURFACE_MODE,
        description="Workspace connector administration routes.",
        trust_boundary="workspace-owner connector administration boundary",
        cookie_csrf_mutations=True,
        conceal_cross_owner_objects=False,
        allows_authenticated_user=True,
        allows_public_webhook=False,
    ),
    DEPLOYED_AGENT_OWNER_SURFACE_MODE: AuthSurfaceContract(
        mode=DEPLOYED_AGENT_OWNER_SURFACE_MODE,
        description="Deployed-agent owner and platform-admin operations.",
        trust_boundary="owner/admin operational boundary",
        cookie_csrf_mutations=True,
        conceal_cross_owner_objects=False,
        allows_authenticated_user=True,
        allows_public_webhook=False,
    ),
    PUBLIC_CONNECTOR_WEBHOOK_SURFACE_MODE: AuthSurfaceContract(
        mode=PUBLIC_CONNECTOR_WEBHOOK_SURFACE_MODE,
        description="Signed public connector webhook ingress.",
        trust_boundary="provider-signed public ingress boundary",
        cookie_csrf_mutations=False,
        conceal_cross_owner_objects=False,
        allows_authenticated_user=False,
        allows_public_webhook=True,
    ),
    PUBLIC_CHANNEL_INGRESS_SURFACE_MODE: AuthSurfaceContract(
        mode=PUBLIC_CHANNEL_INGRESS_SURFACE_MODE,
        description="Public deployed-agent channel ingress.",
        trust_boundary="public channel ingress boundary",
        cookie_csrf_mutations=False,
        conceal_cross_owner_objects=False,
        allows_authenticated_user=False,
        allows_public_webhook=True,
    ),
}


def get_auth_surface_contract(surface_mode: str) -> AuthSurfaceContract:
    token = str(surface_mode or "").strip().lower()
    contract = SURFACE_CONTRACTS.get(token)
    if contract is None:
        raise KeyError(f"Unknown auth surface mode: {surface_mode}")
    return contract
