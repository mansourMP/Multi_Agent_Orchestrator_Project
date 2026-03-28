import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from server_modules import runtime_config as runtime_config
from server_modules import shared as shared
from server_modules import runtime_common as runtime_common
from server_modules import runs_core as runs_core
from server_modules import runs_history as runs_history
from server_modules import runs_execution as runs_execution
from server_modules import runs_output as runs_output
from server_modules import runs_delegation as runs_delegation
from server_modules import runs_engine as runs_engine
from server_modules import health_core as health_core
from server_modules import health_diagnostics as health_diagnostics
from server_modules import connectors_core as connectors_core
from server_modules import connectors_actions as connectors_actions

for module in (
    runtime_config,
    shared,
    runtime_common,
    runs_core,
    runs_history,
    runs_execution,
    runs_output,
    runs_delegation,
    runs_engine,
    health_core,
    health_diagnostics,
    connectors_core,
    connectors_actions,
):
    globals().update({key: value for key, value in vars(module).items() if not key.startswith("__")})

configure_runtime_memory(
    memory_enabled=ORION_MEMORY_ENABLED,
    memory_lancedb_uri=ORION_MEMORY_LANCEDB_URI,
    memory_db_path=str(ORION_MEMORY_DB_PATH),
    memory_read_k=ORION_MEMORY_READ_K,
    memory_retention_days_default=ORION_MEMORY_RETENTION_DAYS_DEFAULT,
    memory_max_text_chars=ORION_MEMORY_MAX_TEXT_CHARS,
    memory_buckets=shared.MEMORY_BUCKETS,
    runtime_memory_manager=RuntimeMemoryManager,
    utc_now=runtime_common._utc_now,
    utc_now_iso=runtime_common._utc_now_iso,
    parse_utc_ts=runtime_common._parse_utc_ts,
    normalize_workspace_id=runtime_common._normalize_workspace_id,
    json_safe=runs_output._json_safe,
    compact_event_text=runs_output._compact_event_text,
    emit_log=runs_core.emit_log,
    refresh_archived_run_snapshot=runs_output._refresh_archived_run_snapshot,
)

configure_runtime_events(
    channel_events=shared.CHANNEL_EVENTS,
    channel_events_lock=shared.CHANNEL_EVENTS_LOCK,
    channel_events_limit=ORION_CHANNEL_EVENTS_LIMIT,
    channel_sessions_limit=ORION_CHANNEL_SESSIONS_LIMIT,
    channel_events_file=ORION_CHANNEL_EVENTS_FILE,
    runtime_state_db=str(ORION_RUNTIME_STATE_DB),
    list_channel_events_fn=list_channel_events,
    replace_channel_events_fn=replace_channel_events,
    append_channel_event_fn=append_channel_event,
    utc_now_iso=runtime_common._utc_now_iso,
    parse_utc_ts=runtime_common._parse_utc_ts,
    normalize_workspace_id=runtime_common._normalize_workspace_id,
    compact_event_text=runs_output._compact_event_text,
    json_safe=runs_output._json_safe,
    safe_read_json=runtime_common._safe_read_json,
)

from server_modules.routes_agents import router as agents_router
from server_modules.routes_auth import router as auth_router
from server_modules.routes_builder import router as builder_router
from server_modules.routes_connectors import router as connectors_router
from server_modules.routes_health import router as health_router
from server_modules.routes_runs import router as runs_router
from server_modules.routes_workflows import router as workflows_router


docs_url = "/docs" if os.getenv("ENV") == "development" else None
redoc_url = "/redoc" if os.getenv("ENV") == "development" else None
openapi_url = "/openapi.json" if os.getenv("ENV") == "development" else None


@asynccontextmanager
async def runtime_app_lifespan(app_instance: FastAPI):
    runs_core.initialize_runtime_services()
    async with shared.app_lifespan(app_instance):
        yield

app = FastAPI(
    title="Empyralis Runtime API",
    lifespan=runtime_app_lifespan,
    docs_url=docs_url,
    redoc_url=redoc_url,
    openapi_url=openapi_url,
)
shared.app = app

app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in FRONTEND_ORIGINS.split(",") if origin.strip()],
    allow_methods=["*"],
    allow_headers=["*"],
)
mount_empyralist_mcp(app)


@app.middleware("http")
async def control_plane_guard(request: Request, call_next):
    return await control_plane_guard_middleware(request, call_next)


app.include_router(workflows_router)
app.include_router(agents_router)
app.include_router(runs_router)
app.include_router(auth_router)
app.include_router(health_router)
app.include_router(connectors_router)
app.include_router(builder_router)
