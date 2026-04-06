from pathlib import Path
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
    transport = httpx.ASGITransport(app=_build_app())
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.get("/health/db")

    assert response.status_code == 200
    assert response.json() == {"postgres": "connected", "sqlite": "active"}
    mock_postgres.assert_awaited_once()
    mock_sqlite.assert_called_once()


def test_sqlite_health_status_reflects_runtime_state_file_presence(tmp_path: Path):
    db_path = tmp_path / "runtime.db"
    with patch("server_modules.db.os.getenv", side_effect=lambda key, default=None: str(db_path) if key == "ORION_RUNTIME_STATE_DB" else default):
        from server_modules import db as runtime_db

        assert runtime_db.sqlite_health_status() == "inactive"
        db_path.touch()
        assert runtime_db.sqlite_health_status() == "active"
