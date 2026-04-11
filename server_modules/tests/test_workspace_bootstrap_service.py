from __future__ import annotations

from typing import Any, Dict

import pytest
from fastapi import HTTPException

from server_modules import workspace_bootstrap_service


def _workspace_access_entry(*, workspace_id: str, tenant_id: str, role: str) -> Dict[str, Any]:
    return {
        "workspace_id": workspace_id,
        "tenant_id": tenant_id,
        "tenant_role": role,
        "role": role,
        "capabilities": {"allow": [], "deny": []},
        "tenant_capabilities": {"allow": [], "deny": []},
        "workspace_capabilities": {"allow": [], "deny": []},
        "dangerous_action_classes": {"allow": [], "deny": []},
        "tenant_dangerous_action_classes": {"allow": [], "deny": []},
        "workspace_dangerous_action_classes": {"allow": [], "deny": []},
        "connectors": {"allow": [], "deny": []},
        "tenant_connectors": {"allow": [], "deny": []},
        "workspace_connectors": {"allow": [], "deny": []},
        "machine_enrollment_scope": "workspace",
        "trusted_owner_machine_ids": [],
        "owner_user_id": "user-1",
        "owner_email": "user@example.com",
    }


def _current_user(*, workspace_id: str = "ws-1", tenant_id: str = "tenant-1", role: str = "member") -> Dict[str, Any]:
    return {
        "auth_type": "bearer",
        "user_id": "user-1",
        "email": "user@example.com",
        "role": role,
        "is_admin": role == "owner",
        "identity_versions": {"membership_version": 7},
        "workspace_access": {
            workspace_id: _workspace_access_entry(workspace_id=workspace_id, tenant_id=tenant_id, role=role),
        },
    }


@pytest.mark.anyio
async def test_build_workspace_bootstrap_composes_canonical_payload(monkeypatch: pytest.MonkeyPatch):
    async def fake_get_user_bundle_by_id(user_id: str):
        assert user_id == "user-1"
        return {
            "user": {
                "id": "user-1",
                "email": "user@example.com",
                "name": "Mansur",
            },
            "memberships": [
                {
                    "workspace_id": "ws-1",
                    "role": "member",
                    "updated_at": 1712000000,
                    "workspace_name": "Personal Workspace",
                }
            ],
        }

    async def fake_get_workspace_by_id(workspace_id: str):
        assert workspace_id == "ws-1"
        return {
            "workspace_id": "ws-1",
            "tenant_id": "tenant-1",
            "name": "Personal Workspace",
            "workspace_type": "personal",
            "metadata": {
                "billing": {
                    "plan_id": "personal",
                }
            },
        }

    async def fake_list_runtime_targets(*, tenant_id: str, workspace_id: str):
        assert tenant_id == "tenant-1"
        assert workspace_id == "ws-1"
        return {
            "deployment_mode": "hybrid",
            "targets": [
                {
                    "target_id": "cloud_default",
                    "label": "Cloud Default",
                    "online": True,
                    "default_for_workspace": True,
                },
                {
                    "target_id": "local_companion",
                    "label": "Local Companion",
                    "online": False,
                    "default_for_workspace": False,
                },
            ],
        }

    monkeypatch.setattr(
        workspace_bootstrap_service.control_plane_repository,
        "get_user_bundle_by_id",
        fake_get_user_bundle_by_id,
    )
    monkeypatch.setattr(
        workspace_bootstrap_service.control_plane_repository,
        "get_workspace_by_id",
        fake_get_workspace_by_id,
    )
    monkeypatch.setattr(
        workspace_bootstrap_service.runtime_attachment_service,
        "list_workspace_runtime_targets",
        fake_list_runtime_targets,
    )

    payload = await workspace_bootstrap_service.build_workspace_bootstrap(
        current_user=_current_user(),
        workspace_id="ws-1",
    )

    assert payload["account"]["id"] == "user-1"
    assert payload["workspace"] == {
        "id": "ws-1",
        "tenantId": "tenant-1",
        "label": "Personal Workspace",
        "kind": "personal",
    }
    assert payload["membership"]["role"] == "member"
    assert payload["membership"]["version"] == "7:1712000000"
    assert "chat.write" in payload["membership"]["permissions"]
    assert payload["entitlements"]["plan"] == "personal"
    assert payload["capabilities"]["mobile_app_enabled"] is True
    assert payload["runtime"]["deploymentMode"] == "hybrid"
    assert payload["runtime"]["runtimeTargets"][0]["id"] == "cloud_default"
    assert payload["shellHints"]["defaultRoute"] == "/w/ws-1/chat"
    assert payload["shellHints"]["preferredProfile"] == "personal_shell"


@pytest.mark.anyio
async def test_build_workspace_bootstrap_denies_unauthorized_workspace():
    with pytest.raises(HTTPException) as excinfo:
        await workspace_bootstrap_service.build_workspace_bootstrap(
            current_user=_current_user(workspace_id="ws-1"),
            workspace_id="ws-2",
        )

    assert excinfo.value.status_code == 403
    assert "Workspace is not accessible for this user." in str(excinfo.value.detail)
