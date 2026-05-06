import asyncio
import json

import pytest

from server_modules import app_registry_api
from server_modules import marketplace_distribution_service
from server_modules import mini_apps_service
from server_modules import provider_catalog_service
from server_modules import workspace_context


def _patch_app_registry(monkeypatch, tmp_path):
    registry_path = tmp_path / "apps.json"

    def _safe_read_json(path, fallback):
        if not path.exists():
            return fallback
        return json.loads(path.read_text(encoding="utf-8"))

    def _safe_write_json(path, payload):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")

    monkeypatch.setattr(app_registry_api, "ORION_APP_REGISTRY_FILE", registry_path, raising=False)
    monkeypatch.setattr(app_registry_api, "_safe_read_json", _safe_read_json, raising=False)
    monkeypatch.setattr(app_registry_api, "_safe_write_json", _safe_write_json, raising=False)
    monkeypatch.setattr(app_registry_api, "_utc_now_iso", lambda: "2026-04-22T00:00:00Z", raising=False)


def test_empty_marketplace_returns_preview_packages(monkeypatch, tmp_path):
    monkeypatch.setattr(workspace_context, "_WORKSPACE_DIR", tmp_path / "workspace")

    payload = marketplace_distribution_service.list_marketplace_packages("ws-empty")
    provider_payload = marketplace_distribution_service.list_marketplace_packages("ws-empty", kind="provider")
    template_payload = marketplace_distribution_service.list_marketplace_packages("ws-empty", kind="agent_template")

    assert payload["count"] >= 9
    assert all(item["preview_only"] is True for item in payload["items"])
    package_ids = {item["package_id"] for item in payload["items"]}
    assert "preview-restaurant-orders" in package_ids
    assert "preview-deepseek-provider" in package_ids
    assert "studio-proof-shop-assistant" in package_ids
    assert provider_payload["count"] == 1
    assert provider_payload["items"][0]["package_id"] == "preview-deepseek-provider"
    assert template_payload["count"] == 3
    assert template_payload["items"][0]["kind"] == "agent_template"


def test_install_marketplace_app_syncs_app_registry_and_hosted_contract(monkeypatch, tmp_path):
    monkeypatch.setattr(workspace_context, "_WORKSPACE_DIR", tmp_path / "workspace")
    _patch_app_registry(monkeypatch, tmp_path)

    registered = marketplace_distribution_service.register_marketplace_package(
        "ws-1",
        actor_user_id="user-1",
        payload={
            "package_id": "weather-lab.console",
            "kind": "app",
            "label": "Weather Lab Console",
            "description": "Third-party weather intelligence app for the Empyralis shell.",
            "category": "Research",
            "verification_status": "verified",
            "review_state": "approved",
            "health_state": "healthy",
            "publisher": {
                "publisher_id": "weather-lab",
                "label": "Weather Lab",
                "website": "https://weather.example",
            },
            "billing": {
                "monetization_kind": "subscription",
                "billing_product_id": "weather-pro",
                "revenue_share_bps": 1500,
                "accounting_hook": {"ledger_key": "weather-lab.console.install"},
            },
            "app": {
                "app_id": "weather_console",
                "hosted_url": "https://apps.weather.example/embed",
                "allowed_origins": ["https://apps.weather.example"],
                "permissions": ["app_bridge.read"],
                "bridge_contracts": {"app_to_sage": ["summary_request"]},
                "context_envelope": {"user_selected_inputs": ["location"]},
            },
        },
    )

    assert registered["package_id"] == "weather-lab.console"
    listed = marketplace_distribution_service.list_marketplace_packages("ws-1")
    assert listed["count"] == 1
    assert listed["items"][0]["preview_only"] is False
    installed = marketplace_distribution_service.install_marketplace_package(
        "ws-1",
        package_id="weather-lab.console",
        actor_user_id="user-1",
    )

    assert installed["installed"] is True
    assert installed["runtime_truth"]["surface"] == "app_registry"
    assert installed["runtime_truth"]["open_href"] == "/w/ws-1/applications/weather_console"
    assert installed["billing"]["revenue_share_bps"] == 1500

    with app_registry_api.APP_REGISTRY_LOCK:
        data = app_registry_api._load_app_registry()
        app_item = app_registry_api._find_app(data, "weather_console")
    assert app_item is not None
    assert app_item["status"] == "installed"
    assert app_item["source"] == "third_party_marketplace"
    assert app_item["install_source"] == "marketplace_distribution"
    assert app_item["distribution_metadata"]["verification_status"] == "verified"

    hosted_contract = mini_apps_service.get_mini_app_contract("ws-1", "weather_console")
    assert hosted_contract["hosted_url"] == "https://apps.weather.example/embed"
    assert hosted_contract["delivery_mode"] == "hosted"
    assert "app_bridge.read" in hosted_contract["permissions"]


def test_install_marketplace_provider_projects_into_provider_catalog(monkeypatch, tmp_path):
    monkeypatch.setattr(workspace_context, "_WORKSPACE_DIR", tmp_path / "workspace")
    _patch_app_registry(monkeypatch, tmp_path)

    marketplace_distribution_service.register_marketplace_package(
        "ws-1",
        actor_user_id="user-1",
        payload={
            "package_id": "neural-cloud.models",
            "kind": "provider",
            "label": "Neural Cloud Models",
            "description": "Third-party reasoning and retrieval models distributed through Empyralis.",
            "category": "Models",
            "verification_status": "verified",
            "review_state": "approved",
            "health_state": "healthy",
            "publisher": {
                "publisher_id": "neural-cloud",
                "label": "Neural Cloud",
            },
            "billing": {
                "monetization_kind": "metered",
                "billing_product_id": "nc-metered",
                "revenue_share_bps": 1200,
                "accounting_hook": {"ledger_key": "neural-cloud.models.usage"},
            },
            "provider": {
                "provider_id": "neuralcloud",
                "default_model": "neuralcloud-reasoner",
                "auth_modes": ["api_key"],
                "privacy_posture": "Vendor-hosted third-party reasoning API.",
                "jurisdiction": "US",
                "residency": "Vendor-managed",
                "models": [
                    {
                        "id": "neuralcloud-reasoner",
                        "label": "Neural Cloud Reasoner",
                        "input_cost_per_1k_usd": 0.004,
                        "output_cost_per_1k_usd": 0.012,
                        "supports_tools": True,
                        "supports_reasoning": True,
                        "reasoning_levels": ["medium", "high"],
                        "capability_labels": ["Reasoning", "Hosted API"],
                    }
                ],
            },
        },
    )
    installed = marketplace_distribution_service.install_marketplace_package(
        "ws-1",
        package_id="neural-cloud.models",
        actor_user_id="user-1",
    )
    assert installed["installed"] is True

    runtime_event = marketplace_distribution_service.record_marketplace_runtime_event(
        "ws-1",
        package_id="neural-cloud.models",
        event_type="runtime_ok",
        health_state="healthy",
        metadata={"probe": "catalog_smoke"},
    )
    assert runtime_event["analytics"]["runtime_event_count"] == 1

    monkeypatch.setattr(
        provider_catalog_service.provider_profiles,
        "build_workspace_provider_connection_truth",
        lambda workspace_id: {
            "workspace_id": workspace_id,
            "summary": {"provider_total": 0},
            "providers": [],
        },
    )

    payload = asyncio.run(provider_catalog_service.list_workspace_provider_catalog(workspace_id="ws-1"))
    provider = next(item for item in payload["providers"] if item["id"] == "neuralcloud")

    assert provider["distribution_origin"] == "third_party_marketplace"
    assert provider["verification_status"] == "verified"
    assert provider["review_state"] == "approved"
    assert provider["billing_hooks"]["revenue_share_bps"] == 1200
    assert provider["analytics"]["runtime_event_count"] == 1
    assert provider["models"][0]["id"] == "neuralcloud-reasoner"


def test_governed_package_contracts_cover_templates_connectors_skills_and_mini_apps(monkeypatch, tmp_path):
    monkeypatch.setattr(workspace_context, "_WORKSPACE_DIR", tmp_path / "workspace")

    packages = [
        {
            "kind": "agent_template",
            "label": "Appointment Booking Template",
            "description": "Governed specialist template for appointment booking.",
            "verification_status": "verified",
            "review_state": "approved",
            "policy_posture": "governed",
            "billing": {
                "monetization_kind": "revenue_share",
                "revenue_share_bps": 1500,
                "accounting_hook": {"ledger_key": "template.appointment_booking.install"},
            },
            "agent_template": {
                "template_id": "appointment_booking",
                "required_connectors": ["calendar"],
                "suggested_tools": ["availability_lookup"],
                "launch_checklist": ["Configure calendar", "Review handoff policy"],
            },
        },
        {
            "kind": "connector",
            "label": "Calendar Connector",
            "description": "Governed calendar connector contract.",
            "verification_status": "partner",
            "review_state": "approved",
            "policy_posture": "governed",
            "billing": {
                "monetization_kind": "metered",
                "accounting_hook": {"ledger_key": "connector.calendar.usage"},
            },
            "connector": {
                "connector_id": "calendar",
                "connector_class": "api_connector",
                "auth_modes": ["oauth"],
                "scopes": ["calendar.read", "calendar.write"],
                "actions": ["availability.lookup", "booking.create"],
            },
        },
        {
            "kind": "skill",
            "label": "FAQ Answering Skill",
            "description": "Governed retrieval skill contract.",
            "verification_status": "verified",
            "review_state": "approved",
            "policy_posture": "governed",
            "billing": {
                "monetization_kind": "subscription",
                "billing_product_id": "faq-skill-pro",
                "accounting_hook": {"ledger_key": "skill.faq.install"},
            },
            "skill": {
                "skill_id": "faq_answering",
                "runtime": "hosted",
                "permissions": ["knowledge:read"],
                "tool_contracts": {"knowledge": ["retrieve"]},
            },
        },
        {
            "kind": "mini_app",
            "label": "Booking Board",
            "description": "Governed hosted mini-app package.",
            "verification_status": "verified",
            "review_state": "approved",
            "policy_posture": "governed",
            "billing": {
                "monetization_kind": "free",
                "accounting_hook": {"ledger_key": "mini_app.booking_board.install"},
            },
            "mini_app": {
                "app_id": "booking_board",
                "hosted_url": "https://apps.example/booking-board",
                "allowed_origins": ["https://apps.example"],
                "permissions": ["mini_app.read"],
                "bridge_contracts": {"bookings": ["read"]},
            },
        },
    ]

    package_ids = [
        marketplace_distribution_service.register_marketplace_package(
            "ws-1",
            actor_user_id="reviewer-1",
            payload=payload,
        )["package_id"]
        for payload in packages
    ]

    listed = marketplace_distribution_service.list_marketplace_packages("ws-1")
    listed_by_id = {item["package_id"]: item for item in listed["items"]}
    assert {listed_by_id[package_id]["kind"] for package_id in package_ids} == {
        "agent_template",
        "connector",
        "skill",
        "mini_app",
    }
    assert all(listed_by_id[package_id]["install_eligible"] is True for package_id in package_ids)
    assert listed_by_id["appointment_booking"]["billing"]["revenue_share_bps"] == 1500
    assert listed_by_id["calendar"]["runtime_truth"]["surface"] == "connector_catalog"
    assert listed_by_id["faq_answering"]["package"]["tool_contracts"] == {"knowledge": ["retrieve"]}

    installed_mini_app = marketplace_distribution_service.install_marketplace_package(
        "ws-1",
        package_id="booking_board",
        actor_user_id="user-1",
    )
    assert installed_mini_app["runtime_truth"]["surface"] == "mini_app_registry"
    assert installed_mini_app["runtime_truth"]["open_href"] == "/w/ws-1/mini-apps/booking_board"
    hosted_contract = mini_apps_service.get_mini_app_contract("ws-1", "booking_board")
    assert hosted_contract["hosted_url"] == "https://apps.example/booking-board"


def test_restricted_or_unverified_marketplace_packages_are_not_installable(monkeypatch, tmp_path):
    monkeypatch.setattr(workspace_context, "_WORKSPACE_DIR", tmp_path / "workspace")

    restricted = marketplace_distribution_service.register_marketplace_package(
        "ws-1",
        actor_user_id="reviewer-1",
        payload={
            "kind": "skill",
            "label": "Unreviewed Plugin Skill",
            "description": "Should remain a governed contract, not an open plugin install lane.",
            "verification_status": "unverified",
            "review_state": "restricted",
            "policy_posture": "restricted",
            "billing": {"monetization_kind": "metered"},
            "skill": {"skill_id": "unreviewed_plugin", "permissions": ["shell:execute"]},
        },
    )

    assert restricted["install_eligible"] is False
    assert restricted["review_state"] == "restricted"
    assert restricted["policy_posture"] == "restricted"
    assert "review_not_approved" in restricted["install_blockers"]
    assert "verification_required" in restricted["install_blockers"]
    assert "policy_restricted" in restricted["install_blockers"]

    with pytest.raises(ValueError, match="not installable"):
        marketplace_distribution_service.install_marketplace_package(
            "ws-1",
            package_id="unreviewed_plugin",
            actor_user_id="user-1",
        )
