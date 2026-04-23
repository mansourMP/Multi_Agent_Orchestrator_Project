from __future__ import annotations

import tempfile
from pathlib import Path

import httpx
import pytest
from fastapi import FastAPI
from unittest.mock import AsyncMock

from server_modules import routes_mini_apps, workspace_context


def _build_app() -> FastAPI:
    app = FastAPI()
    app.include_router(routes_mini_apps.router, prefix="/api")
    return app


@pytest.mark.anyio
async def test_mini_app_routes_upsert_list_and_retrieve(monkeypatch: pytest.MonkeyPatch):
    app = _build_app()
    app.dependency_overrides[routes_mini_apps.get_current_user] = lambda: {"user_id": "user-1"}
    monkeypatch.setattr(routes_mini_apps.auth_module, "enforce_workspace_access", lambda current_user, workspace_id, minimum_role="viewer": workspace_id)

    with tempfile.TemporaryDirectory(prefix="mini-app-routes-") as tmpdir:
        monkeypatch.setattr(workspace_context, "_WORKSPACE_DIR", Path(tmpdir) / "workspace")

        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
            create_response = await client.put(
                "/api/workspaces/ws-1/mini-apps/calorie_tracking",
                json={
                    "label": "Calorie Tracking",
                    "current_state": {"today_calories": 2100},
                    "records": [
                        {"id": "meal-1", "kind": "meal", "summary": "Lunch", "tags": ["lunch"], "created_at": "2026-04-17T08:00:00Z"},
                        {"id": "meal-2", "kind": "meal", "summary": "Dinner", "tags": ["dinner"], "created_at": "2026-04-16T18:00:00Z"},
                    ],
                },
            )
            assert create_response.status_code == 200
            assert create_response.json()["app_id"] == "calorie_tracking"

            list_response = await client.get("/api/workspaces/ws-1/mini-apps")
            assert list_response.status_code == 200
            assert list_response.json()["count"] == 1

            retrieve_response = await client.post(
                "/api/workspaces/ws-1/mini-apps/calorie_tracking/records/retrieve",
                json={"tag": "lunch"},
            )
            assert retrieve_response.status_code == 200
            assert retrieve_response.json()["total_matches"] == 1
            assert retrieve_response.json()["items"][0]["id"] == "meal-1"


@pytest.mark.anyio
async def test_mini_app_routes_return_404_for_missing_app(monkeypatch: pytest.MonkeyPatch):
    app = _build_app()
    app.dependency_overrides[routes_mini_apps.get_current_user] = lambda: {"user_id": "user-1"}
    monkeypatch.setattr(routes_mini_apps.auth_module, "enforce_workspace_access", lambda current_user, workspace_id, minimum_role="viewer": workspace_id)

    with tempfile.TemporaryDirectory(prefix="mini-app-routes-") as tmpdir:
        monkeypatch.setattr(workspace_context, "_WORKSPACE_DIR", Path(tmpdir) / "workspace")

        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
            response = await client.get("/api/workspaces/ws-1/mini-apps/unknown")

        assert response.status_code == 404


@pytest.mark.anyio
async def test_mini_app_invoke_route_returns_thin_app_response(monkeypatch: pytest.MonkeyPatch):
    app = _build_app()
    app.dependency_overrides[routes_mini_apps.get_current_user] = lambda: {"user_id": "user-1"}
    monkeypatch.setattr(routes_mini_apps.auth_module, "enforce_workspace_access", lambda current_user, workspace_id, minimum_role="viewer": workspace_id)
    monkeypatch.setattr(
        routes_mini_apps.mini_app_invoke_service,
        "invoke_mini_app",
        lambda workspace_id, app_id, user_input, requested_provider="", requested_model="": {
            "app_id": app_id,
            "mode": "invoke",
            "memory_scope": "none",
            "reply": f"handled {user_input}",
            "provider": "deepseek",
            "model": "deepseek-chat",
            "attempted_providers": ["deepseek"],
            "usage": {"provider": "deepseek", "model": "deepseek-chat"},
        },
    )

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.post(
            "/api/workspaces/ws-1/mini-apps/writing/invoke",
            json={"input": "Rewrite this in a clearer tone."},
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["app_id"] == "writing"
    assert payload["mode"] == "invoke"
    assert payload["memory_scope"] == "none"
    assert payload["provider"] == "deepseek"
    assert payload["reply"] == "handled Rewrite this in a clearer tone."


@pytest.mark.anyio
async def test_calorie_routes_log_goal_overview_and_range_retrieval(monkeypatch: pytest.MonkeyPatch):
    app = _build_app()
    app.dependency_overrides[routes_mini_apps.get_current_user] = lambda: {"user_id": "user-1"}
    monkeypatch.setattr(routes_mini_apps.auth_module, "enforce_workspace_access", lambda current_user, workspace_id, minimum_role="viewer": workspace_id)

    with tempfile.TemporaryDirectory(prefix="mini-app-routes-") as tmpdir:
        monkeypatch.setattr(workspace_context, "_WORKSPACE_DIR", Path(tmpdir) / "workspace")

        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
            event_response = await client.post(
                "/api/workspaces/ws-1/mini-apps/calorie_tracking/events",
                json={
                    "id": "meal-1",
                    "meal_label": "Lunch",
                    "calories": 650,
                    "timestamp": "2026-04-17T12:00:00Z",
                },
            )
            assert event_response.status_code == 200
            assert event_response.json()["record"]["id"] == "meal-1"

            goal_response = await client.put(
                "/api/workspaces/ws-1/mini-apps/calorie_tracking/goals",
                json={"calorie_goal": 2200},
            )
            assert goal_response.status_code == 200
            assert goal_response.json()["goals"]["calories"] == 2200.0

            overview_response = await client.get(
                "/api/workspaces/ws-1/mini-apps/calorie_tracking/overview?date=2026-04-17",
            )
            assert overview_response.status_code == 200
            assert overview_response.json()["daily_summary"]["totals"]["calories"] == 650.0

            retrieve_response = await client.post(
                "/api/workspaces/ws-1/mini-apps/calorie_tracking/records/retrieve",
                json={"since": "2026-04-17T00:00:00Z", "until": "2026-04-17T23:59:59Z"},
            )
            assert retrieve_response.status_code == 200
            assert retrieve_response.json()["total_matches"] == 1


@pytest.mark.anyio
async def test_flashcards_routes_create_metadata_review_and_retrieve(monkeypatch: pytest.MonkeyPatch):
    app = _build_app()
    app.dependency_overrides[routes_mini_apps.get_current_user] = lambda: {"user_id": "user-1"}
    monkeypatch.setattr(routes_mini_apps.auth_module, "enforce_workspace_access", lambda current_user, workspace_id, minimum_role="viewer": workspace_id)

    with tempfile.TemporaryDirectory(prefix="mini-app-routes-") as tmpdir:
        monkeypatch.setattr(workspace_context, "_WORKSPACE_DIR", Path(tmpdir) / "workspace")

        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
            create_response = await client.post(
                "/api/workspaces/ws-1/mini-apps/flashcards/cards",
                json={
                    "deck": "Spanish A1",
                    "topic": "verbs",
                    "front": "Conjugate ir (yo)",
                    "back": "voy",
                },
            )
            assert create_response.status_code == 200
            assert create_response.json()["record"]["kind"] == "card_create"

            metadata_response = await client.put(
                "/api/workspaces/ws-1/mini-apps/flashcards/decks",
                json={
                    "deck": "Spanish A1",
                    "language": "Spanish",
                    "target_reviews_per_day": 60,
                },
            )
            assert metadata_response.status_code == 200
            assert metadata_response.json()["metadata"]["language"] == "Spanish"

            review_response = await client.post(
                "/api/workspaces/ws-1/mini-apps/flashcards/reviews",
                json={
                    "deck": "Spanish A1",
                    "topic": "verbs",
                    "correct": False,
                    "quality": 2,
                },
            )
            assert review_response.status_code == 200
            assert review_response.json()["record"]["kind"] == "review_result"

            overview_response = await client.get("/api/workspaces/ws-1/mini-apps/flashcards/overview")
            assert overview_response.status_code == 200
            assert overview_response.json()["current_state"]["deck_count"] == 1

            retrieve_response = await client.post(
                "/api/workspaces/ws-1/mini-apps/flashcards/records",
                json={"deck": "Spanish A1", "topic": "verbs"},
            )
            assert retrieve_response.status_code == 200
            assert retrieve_response.json()["total_matches"] >= 2


@pytest.mark.anyio
async def test_flashcards_generate_route(monkeypatch: pytest.MonkeyPatch):
    app = _build_app()
    app.dependency_overrides[routes_mini_apps.get_current_user] = lambda: {"user_id": "user-1"}
    monkeypatch.setattr(routes_mini_apps.auth_module, "enforce_workspace_access", lambda current_user, workspace_id, minimum_role="viewer": workspace_id)
    monkeypatch.setattr(
        routes_mini_apps.flashcards_tracking_service,
        "generate_flashcards",
        lambda workspace_id, **kwargs: {
            "workspace_id": workspace_id,
            "app_id": "flashcards",
            "deck": kwargs["deck"],
            "count": 2,
            "cards": [
                {"front": "Hola", "back": "Hello"},
                {"front": "Adios", "back": "Goodbye"},
            ],
            "provider": "deepseek",
        },
    )

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.post(
            "/api/workspaces/ws-1/mini-apps/flashcards/generate",
            json={
                "deck": "Spanish A1",
                "source_text": "hola = hello, adios = goodbye",
                "count": 2,
            },
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["app_id"] == "flashcards"
    assert payload["deck"] == "Spanish A1"
    assert payload["count"] == 2


@pytest.mark.anyio
async def test_hosted_mini_app_manifest_and_bridge_route(monkeypatch: pytest.MonkeyPatch):
    app = _build_app()
    app.dependency_overrides[routes_mini_apps.get_current_user] = lambda: {"user_id": "user-1", "tenant_id": "tenant-1"}
    monkeypatch.setattr(routes_mini_apps.auth_module, "enforce_workspace_access", lambda current_user, workspace_id, minimum_role="viewer": workspace_id)
    monkeypatch.setattr(routes_mini_apps.auth_module, "workspace_tenant_id", lambda current_user, workspace_id: "tenant-1")
    monkeypatch.setattr(
        routes_mini_apps.mini_app_host_service.app_bridge_service,
        "record_app_bridge_audit",
        AsyncMock(return_value={"id": "activity-1"}),
    )
    monkeypatch.setattr(
        routes_mini_apps.mini_app_host_service.app_bridge_service,
        "resolve_app_runtime_contract",
        lambda app_id, installed_only=False: {
            "app_id": app_id,
            "status": "external",
            "permissions": [],
            "bridge_contracts": {"app_to_sage": ["summary_request"]},
            "context_envelope": {
                "default_classes": ["user_selected_inputs", "app_owned_history"],
                "optional_classes": ["explicit_imports_from_sage"],
            },
            "denied_by_default": ["read_sage_memory"],
        },
    )
    monkeypatch.setattr(
        routes_mini_apps.mini_app_host_service.app_bridge_service,
        "normalize_bridge_contract",
        lambda **kwargs: {
            "app_id": kwargs["app_id"],
            "bridge_kind": kwargs["bridge_kind"],
            "bridge_type": kwargs["bridge_type"],
            "target": kwargs.get("target") or {},
            "context_envelope": {"classes": ["user_selected_inputs"], "payload": kwargs.get("context_envelope") or {}},
        },
    )
    monkeypatch.setattr(
        routes_mini_apps.mini_app_host_service,
        "process_hosted_bridge_request",
        AsyncMock(
            return_value={
                "status": "ok",
                "workspace_id": "ws-1",
                "tenant_id": "tenant-1",
                "origin": "https://miniapps.example.com",
                "bridge": {
                    "app_id": "travel_partner",
                    "bridge_kind": "app_to_sage",
                    "bridge_type": "summary_request",
                },
                "audit": {"activity_event_id": "activity-1"},
            }
        ),
    )

    with tempfile.TemporaryDirectory(prefix="mini-app-routes-") as tmpdir:
        monkeypatch.setattr(workspace_context, "_WORKSPACE_DIR", Path(tmpdir) / "workspace")

        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
            create_response = await client.put(
                "/api/workspaces/ws-1/mini-apps/travel_partner",
                json={
                    "label": "Travel Partner",
                    "description": "Hosted itinerary planner",
                    "delivery_mode": "hosted",
                    "hosted_url": "https://miniapps.example.com/travel",
                    "allowed_origins": ["https://miniapps.example.com"],
                    "bridge_contracts": {"app_to_sage": ["summary_request"]},
                    "permissions": ["bridge.app_to_sage.summary_request"],
                    "context_envelope": {"default_classes": ["user_selected_inputs"]},
                },
            )
            assert create_response.status_code == 200

            manifest_response = await client.get(
                "/api/workspaces/ws-1/mini-apps/travel_partner/hosted-manifest",
            )
            assert manifest_response.status_code == 200
            manifest = manifest_response.json()
            assert manifest["delivery_mode"] == "hosted"
            assert manifest["hosted_app"]["embed"]["kind"] == "iframe"
            assert manifest["hosted_app"]["bridge"]["allowed_contracts"]["app_to_sage"] == ["summary_request"]

            bridge_response = await client.post(
                "/api/workspaces/ws-1/mini-apps/travel_partner/bridge/messages",
                json={
                    "origin": "https://miniapps.example.com",
                    "bridge_kind": "app_to_sage",
                    "bridge_type": "summary_request",
                    "request_text": "Summarize this itinerary",
                    "context_envelope": {"user_selected_inputs": [{"id": "doc-1"}]},
                },
            )
            assert bridge_response.status_code == 200
            payload = bridge_response.json()
            assert payload["status"] == "ok"
            assert payload["bridge"]["bridge_kind"] == "app_to_sage"


@pytest.mark.anyio
async def test_hosted_mini_app_bridge_rejects_unapproved_origin(monkeypatch: pytest.MonkeyPatch):
    app = _build_app()
    app.dependency_overrides[routes_mini_apps.get_current_user] = lambda: {"user_id": "user-1", "tenant_id": "tenant-1"}
    monkeypatch.setattr(routes_mini_apps.auth_module, "enforce_workspace_access", lambda current_user, workspace_id, minimum_role="viewer": workspace_id)
    monkeypatch.setattr(routes_mini_apps.auth_module, "workspace_tenant_id", lambda current_user, workspace_id: "tenant-1")

    with tempfile.TemporaryDirectory(prefix="mini-app-routes-") as tmpdir:
        monkeypatch.setattr(workspace_context, "_WORKSPACE_DIR", Path(tmpdir) / "workspace")

        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
            await client.put(
                "/api/workspaces/ws-1/mini-apps/travel_partner",
                json={
                    "label": "Travel Partner",
                    "delivery_mode": "hosted",
                    "hosted_url": "https://miniapps.example.com/travel",
                    "allowed_origins": ["https://miniapps.example.com"],
                    "bridge_contracts": {"app_to_sage": ["summary_request"]},
                },
            )
            response = await client.post(
                "/api/workspaces/ws-1/mini-apps/travel_partner/bridge/messages",
                json={
                    "origin": "https://evil.example.com",
                    "bridge_kind": "app_to_sage",
                    "bridge_type": "summary_request",
                },
            )

        assert response.status_code == 403
