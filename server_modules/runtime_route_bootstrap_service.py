from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable


@dataclass(frozen=True)
class RuntimeRunRouteDependencies:
    run_start_request_class: Any
    build_inbound_agent_turn_request: Callable[..., Any]
    execute_system_agent_turn: Callable[..., Any]
    handle_telegram_send_message: Callable[..., Any]
    delete_memory: Callable[..., Any]
    workspace_memory_snapshot: Callable[..., Any]
    read_workspace_context_files: Callable[..., Any]
    write_workspace_context_file: Callable[..., Any]
    trigger_pending_heartbeat_schedules: Callable[[], Any]


@dataclass(frozen=True)
class RuntimeRunRouteBootstrapCallbacks:
    heartbeat_run_callback: Callable[..., Any]
    heartbeat_notify_callback: Callable[..., Any]


def import_runtime_run_route_dependencies(
    *,
    import_module: Callable[..., Any],
    module_globals: dict[str, Any],
    server_module: Any,
) -> RuntimeRunRouteDependencies:
    for key, value in server_module.__dict__.items():
        if key not in module_globals:
            module_globals[key] = value

    connectors = import_module(
        "server_modules.connectors.autopilot_runtime_exports",
        fromlist=["handle_telegram_send_message"],
    )
    memory_service = import_module(
        "server_modules.memory_service",
        fromlist=["delete_memory", "workspace_memory_snapshot"],
    )
    runtime_models = import_module(
        "server_modules.runtime_models",
        fromlist=["RunStartRequest"],
    )
    agent_turn = import_module(
        "server_modules.agent_turn",
        fromlist=["build_inbound_agent_turn_request", "execute_system_agent_turn"],
    )
    workspace_context = import_module(
        "server_modules.workspace_context",
        fromlist=["read_workspace_context_files", "write_workspace_context_file"],
    )
    runs_core = import_module(
        "server_modules.runs_core",
        fromlist=["trigger_pending_heartbeat_schedules"],
    )
    return RuntimeRunRouteDependencies(
        run_start_request_class=runtime_models.RunStartRequest,
        build_inbound_agent_turn_request=agent_turn.build_inbound_agent_turn_request,
        execute_system_agent_turn=agent_turn.execute_system_agent_turn,
        handle_telegram_send_message=connectors.handle_telegram_send_message,
        delete_memory=memory_service.delete_memory,
        workspace_memory_snapshot=memory_service.workspace_memory_snapshot,
        read_workspace_context_files=workspace_context.read_workspace_context_files,
        write_workspace_context_file=workspace_context.write_workspace_context_file,
        trigger_pending_heartbeat_schedules=runs_core.trigger_pending_heartbeat_schedules,
    )


def build_runtime_run_route_bootstrap_callbacks(
    *,
    run_start_request_class: Any,
    build_inbound_agent_turn_request: Callable[..., Any],
    trigger_pending_heartbeat_schedules: Callable[[], Any],
    execute_system_run_start_request_via_turn_runtime: Callable[..., Any],
    execute_system_agent_turn: Callable[..., Any],
    stamp_request_owner_fn: Callable[..., Any],
    run_execution_services: Callable[[], Any],
    build_heartbeat_run_callback: Callable[..., Any],
    handle_telegram_send_message: Callable[..., Any],
    build_heartbeat_notify_callback: Callable[..., Any],
) -> RuntimeRunRouteBootstrapCallbacks:
    return RuntimeRunRouteBootstrapCallbacks(
        heartbeat_run_callback=build_heartbeat_run_callback(
            build_inbound_agent_turn_request=build_inbound_agent_turn_request,
            trigger_pending_heartbeat_schedules=trigger_pending_heartbeat_schedules,
            execute_system_agent_turn=execute_system_agent_turn,
            run_execution_services=run_execution_services,
        ),
        heartbeat_notify_callback=build_heartbeat_notify_callback(
            handle_telegram_send_message=handle_telegram_send_message,
        ),
    )


def ensure_runtime_run_route_bootstrap(
    *,
    heartbeat_lock: Any,
    heartbeat_scheduler: Any,
    heartbeat_scheduler_factory: Callable[[], Any],
    ensure_heartbeat_scheduler_started: Callable[..., Any],
    load_webhook_triggers: Callable[[], None],
) -> Any:
    scheduler = ensure_heartbeat_scheduler_started(
        lock=heartbeat_lock,
        scheduler=heartbeat_scheduler,
        scheduler_factory=heartbeat_scheduler_factory,
    )
    load_webhook_triggers()
    return scheduler
