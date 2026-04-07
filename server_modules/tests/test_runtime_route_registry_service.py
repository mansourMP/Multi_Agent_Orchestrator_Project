import types
import unittest

from server_modules import runtime_route_registry_service
from server_modules import runtime_route_run_handlers_service


class _FakeApp:
    def __init__(self) -> None:
        self.routes = {}

    def _register(self, method, path, **kwargs):
        def _decorator(fn):
            self.routes[(method, path)] = fn
            return fn

        return _decorator

    def post(self, path, **kwargs):
        return self._register("POST", path, **kwargs)

    def get(self, path, **kwargs):
        return self._register("GET", path, **kwargs)

    def delete(self, path, **kwargs):
        return self._register("DELETE", path, **kwargs)


class _RunStartRequest:
    def __init__(self) -> None:
        self.defaulted = True


class _RunDelegationRequest:
    pass


class _RunAutoDelegationRequest:
    pass


class _RunDelegationRetryRequest:
    pass


class _DecisionPayload:
    def validate_fields(self) -> None:
        return None


class _ApprovalResolvePayload:
    def validate_fields(self) -> None:
        return None


class RuntimeRouteRegistryServiceTests(unittest.TestCase):
    def test_register_runtime_run_routes_registers_expected_paths(self):
        app = _FakeApp()

        runtime_route_registry_service.register_runtime_run_routes(
            app,
            **self._registry_kwargs(),
        )

        self.assertNotIn(("POST", "/runs/start"), app.routes)
        self.assertIn(("POST", "/admin/kill-switch"), app.routes)
        self.assertIn(("POST", "/admin/safe-mode"), app.routes)
        self.assertIn(("POST", "/approvals/{approval_id}/resolve"), app.routes)
        self.assertIn(("POST", "/runs/{run_id}/resume"), app.routes)
        self.assertIn(("POST", "/runs/{run_id}/pause"), app.routes)

    def _registry_kwargs(self, **overrides):
        kwargs = dict(
            depends=lambda dependency: dependency,
            request_class=type("Request", (), {}),
            event_source_response_class=lambda events: events,
            require_api_key=object(),
            require_admin_api_key=object(),
            refresh_server_exports=lambda: None,
            heartbeat_scheduler=lambda: None,
            load_webhook_triggers=lambda: None,
            persist_webhook_triggers_locked=lambda: None,
            match_webhook_trigger_fn=lambda workspace_id, request_url: {},
            webhook_triggers={},
            webhook_trigger_lock=object(),
            run_start_request_class=_RunStartRequest,
            run_delegation_request_class=_RunDelegationRequest,
            run_auto_delegation_request_class=_RunAutoDelegationRequest,
            run_delegation_retry_request_class=_RunDelegationRetryRequest,
            decision_payload_class=_DecisionPayload,
            approval_resolve_payload_class=_ApprovalResolvePayload,
            workspace_memory_snapshot=lambda workspace_id: {},
            delete_memory=lambda workspace_id, key: {},
            read_workspace_context_files=lambda: [],
            write_workspace_context_file=lambda filename, content: {},
            single_agent_mode=False,
            runs={},
            serialize_run_snapshot=lambda run_id, run: {},
            iter_logs_for_run=lambda run_id: [],
            get_replay_payload=lambda run_id: {},
            runtime_workspace_service=types.SimpleNamespace(
                list_workspace_memory_payload=lambda *args, **kwargs: {},
                delete_workspace_memory_payload=lambda *args, **kwargs: {},
                workspace_context_files_payload=lambda *args, **kwargs: {},
                update_workspace_context_file_payload=lambda *args, **kwargs: {},
            ),
            runtime_heartbeat_service=types.SimpleNamespace(
                heartbeat_status_payload=lambda *args, **kwargs: {},
                trigger_heartbeat_payload=lambda *args, **kwargs: {},
            ),
            runtime_route_request_handlers_service=types.SimpleNamespace(
                respond_chat_response=lambda *args, **kwargs: {},
                update_workspace_context_file_response=lambda *args, **kwargs: {},
                trigger_heartbeat_response=lambda *args, **kwargs: {},
                register_webhook_trigger_response=lambda *args, **kwargs: {},
                ingest_webhook_response=lambda *args, **kwargs: {},
            ),
            runtime_route_run_handlers_service=runtime_route_run_handlers_service,
            runtime_request_service=types.SimpleNamespace(
                read_json_object_payload=lambda *args, **kwargs: {},
                require_authenticated_user=lambda current_user: current_user,
                read_json_payload=lambda *args, **kwargs: {},
            ),
            runtime_webhook_trigger_service=types.SimpleNamespace(
                register_webhook_trigger_payload=lambda *args, **kwargs: {},
                build_webhook_trigger=lambda *args, **kwargs: {},
                ingest_webhook_payload=lambda *args, **kwargs: {},
            ),
            runtime_run_delegation_service=types.SimpleNamespace(
                delegate_run_children=lambda *args, **kwargs: {},
                auto_delegate_run_children=lambda *args, **kwargs: {},
                retry_failed_delegation_runs=lambda *args, **kwargs: {},
            ),
            runtime_run_query_service=types.SimpleNamespace(
                build_run_detail_response=lambda *args, **kwargs: {},
            ),
            runtime_run_entry_service=types.SimpleNamespace(
                start_run_response=lambda *args, **kwargs: {},
                preview_routing_response=lambda *args, **kwargs: {},
                precheck_run_response=lambda *args, **kwargs: {},
                stream_run_response=lambda *args, **kwargs: {},
            ),
            runtime_run_replay_service=types.SimpleNamespace(
                replay_item_response_for_run=lambda *args, **kwargs: {},
                replay_run_from_run_id=lambda *args, **kwargs: {},
            ),
            runtime_run_approval_service=types.SimpleNamespace(
                submit_run_decision=lambda *args, **kwargs: {},
                resolve_run_approval=lambda *args, **kwargs: {},
            ),
            runtime_run_control_service=types.SimpleNamespace(
                resume_waiting_run=lambda *args, **kwargs: {},
                pause_run_for_takeover=lambda *args, **kwargs: {},
            ),
            runtime_history_service=types.SimpleNamespace(
                build_runs_history_payload=lambda *args, **kwargs: {},
            ),
            runtime_usage_service=types.SimpleNamespace(
                usage_summary_payload=lambda *args, **kwargs: {},
                usage_runs_payload=lambda *args, **kwargs: {},
            ),
            build_direct_chat_stream_response=lambda *args, **kwargs: {},
            direct_chat_stream_response_services=lambda: {},
            execute_run_start_request_via_turn_runtime=lambda *args, **kwargs: {},
            execute_system_run_start_request_via_turn_runtime=lambda *args, **kwargs: {},
            stamp_request_owner_fn=lambda *args, **kwargs: None,
            run_execution_services=lambda: {},
            build_run_routing_preview=lambda *args, **kwargs: {},
            build_run_precheck_result=lambda *args, **kwargs: {},
            run_routing_preview_services=lambda: {},
            delegate_run_children_callbacks={},
            auto_delegate_run_children_callbacks={},
            retry_failed_delegation_callbacks={},
            run_detail_callbacks={},
            runs_history_callbacks={},
            usage_snapshots_for_user_fn=lambda current_user: [],
            aggregate_usage_summary_fn=lambda snapshots: {},
            list_usage_runs_fn=lambda snapshots, **kwargs: {},
            submit_run_decision_callbacks={},
            resolve_run_approval_callbacks={},
            resume_waiting_run_callbacks={},
            pause_run_callbacks={},
            enforce_run_owner_access=lambda current_user, payload: None,
        )
        kwargs.update(overrides)
        return kwargs

    def _run_async(self, coroutine):
        import asyncio

        return asyncio.run(coroutine)


if __name__ == "__main__":
    unittest.main()
