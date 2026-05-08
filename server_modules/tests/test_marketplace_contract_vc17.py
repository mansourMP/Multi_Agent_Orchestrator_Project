import pytest

from server_modules import marketplace_distribution_service
from server_modules import workspace_context


def test_marketplace_contract_manifest_fields_are_normalized(monkeypatch, tmp_path):
    monkeypatch.setattr(workspace_context, "_WORKSPACE_DIR", tmp_path / "workspace")

    registered = marketplace_distribution_service.register_marketplace_package(
        "ws-vc17",
        actor_user_id="reviewer-1",
        payload={
            "kind": "app",
            "label": "Contract Demo App",
            "description": "VC-17 manifest contract coverage demo.",
            "verification_status": "verified",
            "review_state": "approved",
            "policy_posture": "governed",
                "app": {
                    "app_id": "contract_demo_app",
                    "hosted_url": "https://demo.example/app",
                    "permissions": ["app.summary.read"],
                    "allowed_origins": ["https://demo.example"],
                },
            "marketplace_contract": {
                "required_runtime": "virtual_browser",
                "required_permissions": ["app.summary.read", "browser.open_url"],
                "allowed_domains": ["supplier.example", "*.orders.example"],
                "artifact_types": ["screenshot", "pdf", "csv"],
                "max_runtime_seconds": 1800,
                "approval_policy": {"default_mode": "guarded", "requires_owner_approval": True},
                "data_retention": {"retention_class": "audit_plus_ephemeral", "artifact_ttl_seconds": 3600},
            },
        },
    )

    install_permissions = registered.get("install_permissions") or {}
    assert install_permissions["required_runtime"] == "virtual_browser"
    assert "browser.open_url" in install_permissions["required_permissions"]
    assert "supplier.example" in install_permissions["allowed_domains"]
    assert "screenshot" in install_permissions["artifact_types"]
    assert int(install_permissions["max_runtime_seconds"]) == 1800
    assert install_permissions["approval_policy"]["default_mode"] == "guarded"
    assert install_permissions["data_retention"]["retention_class"] == "audit_plus_ephemeral"


def test_marketplace_review_blocks_excessive_permissions(monkeypatch, tmp_path):
    monkeypatch.setattr(workspace_context, "_WORKSPACE_DIR", tmp_path / "workspace")

    restricted = marketplace_distribution_service.register_marketplace_package(
        "ws-vc17",
        actor_user_id="reviewer-1",
        payload={
            "kind": "skill",
            "label": "Overpowered Skill",
            "description": "Requests unsafe capability scope.",
            "verification_status": "verified",
            "review_state": "approved",
            "policy_posture": "governed",
            "skill": {
                "skill_id": "overpowered_skill",
                "permissions": ["shell:execute", "knowledge:read"],
            },
            "marketplace_contract": {
                "required_runtime": "local",
                "required_permissions": ["shell:execute", "knowledge:read"],
                "allowed_domains": ["*"],
                "max_runtime_seconds": 7200,
            },
        },
    )

    assert restricted["install_eligible"] is False
    assert "excessive_permissions_requested" in (restricted.get("install_blockers") or [])

    with pytest.raises(ValueError, match="not installable"):
        marketplace_distribution_service.install_marketplace_package(
            "ws-vc17",
            package_id="overpowered_skill",
            actor_user_id="user-1",
        )
