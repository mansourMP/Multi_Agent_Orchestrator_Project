from pathlib import Path
import os
from unittest.mock import AsyncMock, patch

import httpx
import pytest
from fastapi import FastAPI

from server_modules import routes_health


def _build_app() -> FastAPI:
    app = FastAPI()
    app.include_router(routes_health.router)
    return app


@pytest.mark.anyio
@patch("server_modules.routes_health.runtime_db.postgres_health_status", new_callable=AsyncMock, return_value="connected")
@patch("server_modules.routes_health.runtime_db.sqlite_health_status", return_value="active")
async def test_health_db_endpoint_reports_backend_state(mock_sqlite, mock_postgres):
    with patch.dict(os.environ, {"ORION_API_KEY": "secret"}, clear=False):
        transport = httpx.ASGITransport(app=_build_app())
        async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
            response = await client.get("/health/db", headers={"X-API-Key": "secret"})

    assert response.status_code == 200
    assert response.json() == {
        "postgres": "connected",
        "sqlite": "active",
        "durable_required": False,
        "durability_mode": "best_effort_local_dev",
        "sqlite_fallback_allowed": True,
    }
    mock_postgres.assert_awaited_once()
    mock_sqlite.assert_called_once()


@pytest.mark.anyio
async def test_public_health_endpoint_redacts_sensitive_runtime_fields():
    sensitive_payload = {
        "ok": True,
        "workspace_ids": ["workspace-1"],
        "queue_backlog": 42,
        "state_file": "/tmp/runtime-state.sqlite3",
        "provider_profile_health": {"providers_by_id": {"openai": {"state": "active"}}},
    }
    with patch("server_modules.routes_health.core.health", new=AsyncMock(return_value=sensitive_payload)):
        transport = httpx.ASGITransport(app=_build_app())
        async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
            response = await client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"ok": True}


@pytest.mark.anyio
@patch("server_modules.routes_health.core.health", new_callable=AsyncMock, return_value={"ok": True, "workspace_ids": ["workspace-1"]})
async def test_internal_health_endpoint_returns_full_payload(mock_health):
    with patch.dict(os.environ, {"ORION_API_KEY": "secret"}, clear=False):
        transport = httpx.ASGITransport(app=_build_app())
        async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
            response = await client.get(
                "/health/internal",
                headers={"X-API-Key": "secret"},
            )

    assert response.status_code == 200
    assert response.json() == {"ok": True, "workspace_ids": ["workspace-1"]}
    mock_health.assert_awaited_once()


def test_sqlite_health_status_reflects_runtime_state_file_presence(tmp_path: Path):
    db_path = tmp_path / "runtime.db"
    with patch("server_modules.db.os.getenv", side_effect=lambda key, default=None: str(db_path) if key == "ORION_RUNTIME_STATE_DB" else default):
        from server_modules import db as runtime_db

        assert runtime_db.sqlite_health_status() == "inactive"
        db_path.touch()
        assert runtime_db.sqlite_health_status() == "active"
