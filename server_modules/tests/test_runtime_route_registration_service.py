import threading
import types
import unittest

from server_modules import runtime_route_registration_service


class _DummyScheduler:
    def __init__(self, **kwargs) -> None:
        self.kwargs = kwargs


class RuntimeRouteRegistrationServiceTests(unittest.TestCase):
    def test_register_runtime_run_routes_from_api_builds_bootstrap_bindings_and_registry(self):
        calls = {}
        scheduler_holder = {}
        deps = types.SimpleNamespace(
            run_start_request_class=type("RunStartRequest", (), {}),
            trigger_pending_heartbeat_schedules=lambda: {},
            handle_telegram_send_message=lambda *args, **kwargs: None,
            workspace_memory_snapshot=lambda workspace_id: {},
            delete_memory=lambda workspace_id, key: {},
            read_workspace_context_files=lambda: [],
            write_workspace_context_file=lambda filename, content: {},
        )
        route_bindings = types.SimpleNamespace(
            serialize_run_snapshot=lambda run_id, run: {},
            delegate_run_children_callbacks={"delegate": True},
            auto_delegate_run_children_callbacks={"auto": True},
            retry_failed_delegation_callbacks={"retry": True},
            run_detail_callbacks={"detail": True},
            runs_history_callbacks={"history": True},
            submit_run_decision_callbacks={"decision": True},
            resolve_run_approval_callbacks={"approval": True},
            resume_waiting_run_callbacks={"resume": True},
        )
        server_module = types.SimpleNamespace(
            RUN_HISTORY_LOCK=object(),
            RUN_HISTORY=[],
            _history_item_matches=lambda *args, **kwargs: True,
            _current_user_is_privileged=lambda current_user: False,
            _extract_run_owner_user_id=lambda payload: None,
            _summarize_history_item=lambda *args, **kwargs: {},
            build_archived_run_detail_response=lambda *args, **kwargs: {},
            build_live_run_detail_response=lambda *args, **kwargs: {},
            _persist_webhook_triggers_locked=lambda: None,
            RunDelegationRequest=type("RunDelegationRequest", (), {}),
            RunAutoDelegationRequest=type("RunAutoDelegationRequest", (), {}),
            RunDelegationRetryRequest=type("RunDelegationRetryRequest", (), {}),
            DecisionPayload=type("DecisionPayload", (), {}),
            ApprovalResolvePayload=type("ApprovalResolvePayload", (), {}),
            _serialize_run_snapshot=lambda run_id, run: {},
            _lookup_run_snapshot=lambda run_id: {},
            _build_delegated_run_request=lambda *args, **kwargs: {},
            _normalize_run_id_token=lambda value: value,
            _refresh_parent_delegation_state=lambda *args, **kwargs: {},
            _build_auto_delegation_plan=lambda *args, **kwargs: {},
            _emit_auto_delegation_routing_log=lambda *args, **kwargs: None,
            _find_run_relationships=lambda *args, **kwargs: [],
        )

        scheduler = runtime_route_registration_service.register_runtime_run_routes_from_api(
            object(),
            import_module=lambda name, fromlist=(): None,
            module_globals={},
            server_module=server_module,
            heartbeat_lock=threading.Lock(),
            heartbeat_scheduler=None,
            heartbeat_scheduler_refresher=lambda value: scheduler_holder.setdefault("value", value),
            load_webhook_triggers=lambda: calls.setdefault("load_webhooks", 0) or calls.__setitem__("load_webhooks", 1),
            heartbeat_scheduler_class=_DummyScheduler,
            runtime_heartbeat_service=types.SimpleNamespace(
                build_heartbeat_run_callback=lambda **kwargs: ("run", kwargs),
                build_heartbeat_notify_callback=lambda **kwargs: ("notify", kwargs),
                ensure_heartbeat_scheduler_started=lambda scheduler: scheduler,
                heartbeat_scheduler=lambda *, lock, scheduler: ("heartbeat", lock, scheduler),
            ),
            runtime_route_bootstrap_service=types.SimpleNamespace(
                import_runtime_run_route_dependencies=lambda **kwargs: deps,
                build_runtime_run_route_bootstrap_callbacks=lambda **kwargs: types.SimpleNamespace(
                    heartbeat_run_callback=("run", kwargs),
                    heartbeat_notify_callback=("notify", kwargs),
                ),
                ensure_runtime_run_route_bootstrap=lambda **kwargs: _DummyScheduler(
                    interval_seconds=kwargs["heartbeat_scheduler_factory"]().kwargs["interval_seconds"],
                    workspace_id=kwargs["heartbeat_scheduler_factory"]().kwargs["workspace_id"],
                ),
            ),
            runtime_route_binding_service=types.SimpleNamespace(
                build_runtime_route_bindings=lambda **kwargs: route_bindings,
            ),
            runtime_route_registry_service=types.SimpleNamespace(
                register_runtime_run_routes=lambda app, **kwargs: calls.setdefault("registry_kwargs", kwargs),
            ),
            depends=lambda dependency: dependency,
            request_class=object(),
            event_source_response_class=object(),
            require_api_key=object(),
            require_admin_api_key=object(),
            refresh_server_exports=lambda: None,
            match_webhook_trigger_fn=lambda workspace_id, request_url: {},
            webhook_triggers={},
            webhook_trigger_lock=object(),
            persist_webhook_triggers_locked=lambda: None,
            single_agent_mode=False,
            runs={},
            iter_logs_for_run=lambda run_id: [],
            get_replay_payload=lambda run_id: {},
            direct_chat_stream_response_services=lambda: {},
            execute_run_start_request_via_turn_runtime=lambda *args, **kwargs: {},
            execute_system_run_start_request_via_turn_runtime=lambda *args, **kwargs: {},
            stamp_request_owner_fn=lambda *args, **kwargs: None,
            run_execution_services=lambda: {},
            build_run_routing_preview=lambda *args, **kwargs: {},
            build_run_precheck_result=lambda *args, **kwargs: {},
            run_routing_preview_services=lambda: {},
            usage_snapshots_for_user_fn=lambda current_user: [],
            aggregate_usage_summary_fn=lambda snapshots: {},
            list_usage_runs_fn=lambda snapshots, **kwargs: [],
            enforce_run_owner_access=lambda current_user, payload: None,
            current_user_is_privileged=lambda current_user: False,
            extract_run_owner_user_id=lambda payload: payload.get("user_id"),
            summarize_history_item=lambda *args, **kwargs: {},
            normalize_agent_role=lambda value: str(value or ""),
            can_view_sensitive_run_payload=lambda current_user: True,
            limited_run_context_view=lambda payload: payload,
            limited_result_data_view_fn=lambda payload: payload,
            get_pending_confirmation_fn=lambda run: None,
            parse_utc_ts=lambda value: value,
            build_retry_child_payload=lambda child, relationship: {},
            approval_correlation_id=lambda *args, **kwargs: "corr",
            append_approval_audit=lambda *args, **kwargs: None,
            resolve_local_execution_start_approval=lambda *args, **kwargs: {},
            set_pending_confirmation=lambda run, pending: None,
            utc_now=lambda: "now",
            utc_now_iso=lambda: "now-iso",
            run_thread_is_alive=lambda run: False,
            emit_log=lambda *args, **kwargs: None,
            schedule_restored_run_resume=lambda run_id, run: True,
        )

        self.assertIsInstance(scheduler, _DummyScheduler)
        self.assertIs(scheduler_holder["value"], scheduler)
        self.assertIs(calls["registry_kwargs"]["run_start_request_class"], deps.run_start_request_class)
        self.assertEqual(calls["registry_kwargs"]["delegate_run_children_callbacks"], {"delegate": True})


if __name__ == "__main__":
    unittest.main()
