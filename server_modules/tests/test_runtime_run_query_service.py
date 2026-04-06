import unittest

from fastapi import HTTPException

from server_modules import runtime_run_query_service


class RuntimeRunQueryServiceTests(unittest.TestCase):
    def test_build_default_run_detail_response_callbacks_imports_default_modules(self):
        modules = {
            "server_modules.runs_delegation": type(
                "RunsDelegationModule",
                (),
                {
                    "_build_delegation_summary": staticmethod(lambda snapshot, child_runs: {"count": len(child_runs)}),
                    "_find_run_relationships": staticmethod(lambda run_id, snapshot: (None, [])),
                },
            )(),
            "server_modules.runs_output": type(
                "RunsOutputModule",
                (),
                {
                    "_get_replay_payload": staticmethod(lambda run_id: {"run_id": run_id}),
                    "_limited_node_states_view": staticmethod(lambda value: {"trimmed": True}),
                    "_resolve_run_connector_binding": staticmethod(lambda snapshot: {"connector": "telegram"}),
                    "_serialize_run_snapshot": staticmethod(lambda run_id, run: {"run_id": run_id}),
                    "redact_sensitive": staticmethod(lambda context: {"redacted": True}),
                },
            )(),
            "server_modules.memory_service": type(
                "MemoryServiceModule",
                (),
                {
                    "trim_memory_trace": staticmethod(lambda value: {"trimmed": True}),
                },
            )(),
        }

        callbacks = runtime_run_query_service.build_default_run_detail_response_callbacks(
            import_module=lambda name, fromlist=(): modules[name],
            enforce_run_owner_access=lambda current_user, snapshot: None,
            can_view_sensitive_run_payload=lambda current_user: False,
            limited_run_context_view=lambda context: {},
            limited_result_data_view_fn=lambda value: {},
            get_pending_confirmation_fn=lambda run: None,
            build_archived_run_detail_response=lambda **kwargs: {},
            build_live_run_detail_response=lambda **kwargs: {},
        )

        self.assertIn("get_replay_payload", callbacks)
        self.assertIn("find_run_relationships", callbacks)
        self.assertIn("trim_memory_trace_fn", callbacks)

    def test_build_run_detail_response_callbacks_preserves_callables(self):
        get_replay_payload = lambda run_id: {"run_id": run_id}
        callbacks = runtime_run_query_service.build_run_detail_response_callbacks(
            get_replay_payload=get_replay_payload,
            serialize_run_snapshot=lambda run_id, run: {},
            enforce_run_owner_access=lambda current_user, snapshot: None,
            can_view_sensitive_run_payload=lambda current_user: False,
            limited_run_context_view=lambda context: {},
            build_delegation_summary=lambda snapshot, child_runs: {},
            find_run_relationships=lambda run_id, snapshot: (None, []),
            resolve_run_connector_binding=lambda snapshot: {},
            redact_sensitive=lambda context: {},
            limited_result_data_view_fn=lambda value: None,
            limited_node_states_view_fn=lambda value: None,
            trim_memory_trace_fn=lambda value: None,
            get_pending_confirmation_fn=lambda run: None,
            build_archived_run_detail_response=lambda **kwargs: {},
            build_live_run_detail_response=lambda **kwargs: {},
        )

        self.assertIs(callbacks["get_replay_payload"], get_replay_payload)
        self.assertIn("build_live_run_detail_response", callbacks)

    def test_build_run_detail_response_returns_archived_payload_when_live_run_missing(self):
        payload = runtime_run_query_service.build_run_detail_response(
            "run-1",
            current_user={"auth_type": "api_key"},
            runs={},
            get_replay_payload=lambda run_id: {
                "run_id": run_id,
                "context": {"metadata": {"agent_role": "researcher"}, "secret": True},
            },
            serialize_run_snapshot=lambda run_id, run: {},
            enforce_run_owner_access=lambda current_user, snapshot: None,
            can_view_sensitive_run_payload=lambda current_user: False,
            limited_run_context_view=lambda context: {"workspace_id": "default"},
            build_delegation_summary=lambda snapshot, child_runs: {"count": len(child_runs)},
            find_run_relationships=lambda run_id, snapshot: (None, [{"run_id": "child-1"}]),
            resolve_run_connector_binding=lambda snapshot: {"connector": "telegram"},
            redact_sensitive=lambda context: {"redacted": True},
            limited_result_data_view_fn=lambda value: {"summary": "trimmed"},
            limited_node_states_view_fn=lambda value: {"trimmed": True},
            trim_memory_trace_fn=lambda value: {"trimmed": True},
            get_pending_confirmation_fn=lambda run: None,
            build_archived_run_detail_response=lambda **kwargs: {
                "archived": True,
                "safe_context": kwargs["safe_context"],
                "delegation_summary": kwargs["delegation_summary"],
            },
            build_live_run_detail_response=lambda **kwargs: {"archived": False},
        )

        self.assertTrue(payload["archived"])
        self.assertEqual(payload["safe_context"], {"workspace_id": "default"})
        self.assertEqual(payload["delegation_summary"], {"count": 1})

    def test_build_run_detail_response_returns_live_payload_when_run_exists(self):
        payload = runtime_run_query_service.build_run_detail_response(
            "run-1",
            current_user={"auth_type": "api_key"},
            runs={
                "run-1": {
                    "context": {"metadata": {"owner_user_id": "user-1"}, "secret": True},
                    "memory_trace": {"raw": True},
                }
            },
            get_replay_payload=lambda run_id: {},
            serialize_run_snapshot=lambda run_id, run: {"run_id": run_id, "snapshot": True},
            enforce_run_owner_access=lambda current_user, snapshot: None,
            can_view_sensitive_run_payload=lambda current_user: True,
            limited_run_context_view=lambda context: {"workspace_id": "default"},
            build_delegation_summary=lambda snapshot, child_runs: {"count": len(child_runs)},
            find_run_relationships=lambda run_id, snapshot: ({"run_id": "parent-1"}, []),
            resolve_run_connector_binding=lambda snapshot: {"connector": "telegram"},
            redact_sensitive=lambda context: {"redacted": True},
            limited_result_data_view_fn=lambda value: {"summary": "trimmed"},
            limited_node_states_view_fn=lambda value: {"trimmed": True},
            trim_memory_trace_fn=lambda value: {"trimmed": bool(value)},
            get_pending_confirmation_fn=lambda run: {"approval_id": "approval-1"},
            build_archived_run_detail_response=lambda **kwargs: {"archived": True},
            build_live_run_detail_response=lambda **kwargs: {
                "archived": False,
                "safe_context": kwargs["safe_context"],
                "pending_confirmation": kwargs["get_pending_confirmation_fn"](kwargs["run"]),
            },
        )

        self.assertFalse(payload["archived"])
        self.assertEqual(payload["safe_context"], {"redacted": True})
        self.assertEqual(payload["pending_confirmation"], {"approval_id": "approval-1"})

    def test_build_run_detail_response_raises_not_found_when_no_live_or_archived_run_exists(self):
        with self.assertRaises(HTTPException):
            runtime_run_query_service.build_run_detail_response(
                "run-1",
                current_user={"auth_type": "api_key"},
                runs={},
                get_replay_payload=lambda run_id: (_ for _ in ()).throw(HTTPException(status_code=404)),
                serialize_run_snapshot=lambda run_id, run: {},
                enforce_run_owner_access=lambda current_user, snapshot: None,
                can_view_sensitive_run_payload=lambda current_user: False,
                limited_run_context_view=lambda context: {},
                build_delegation_summary=lambda snapshot, child_runs: {},
                find_run_relationships=lambda run_id, snapshot: (None, []),
                resolve_run_connector_binding=lambda snapshot: {},
                redact_sensitive=lambda context: {},
                limited_result_data_view_fn=lambda value: None,
                limited_node_states_view_fn=lambda value: None,
                trim_memory_trace_fn=lambda value: None,
                get_pending_confirmation_fn=lambda run: None,
                build_archived_run_detail_response=lambda **kwargs: {},
                build_live_run_detail_response=lambda **kwargs: {},
            )


if __name__ == "__main__":
    unittest.main()
