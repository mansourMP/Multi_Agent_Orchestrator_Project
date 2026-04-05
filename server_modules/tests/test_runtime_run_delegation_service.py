import unittest
from datetime import datetime, timezone

from fastapi import HTTPException

from server_modules import runtime_run_delegation_service


class _Child:
    def __init__(self, *, agent_role: str, user_goal: str, business_plan: str = "", metadata=None) -> None:
        self.agent_role = agent_role
        self.user_goal = user_goal
        self.business_plan = business_plan
        self.metadata = metadata if metadata is not None else {}


class _DelegationPayload:
    def __init__(self, children, note: str = "") -> None:
        self.children = children
        self.note = note

    def validate_fields(self) -> None:
        return None


class _AutoDelegationPayload:
    def __init__(self, *, max_children: int = 3, note: str = "") -> None:
        self.max_children = max_children
        self.note = note

    def validate_fields(self) -> None:
        return None


class _RetryPayload:
    def __init__(self, *, failed_run_ids=None, note: str = "") -> None:
        self.failed_run_ids = failed_run_ids
        self.note = note

    def validate_fields(self) -> None:
        return None


def _parent_snapshot(agent_role: str = "orchestrator") -> dict:
    return {
        "run_id": "parent-1",
        "agent_role": agent_role,
        "delegation_root_run_id": None,
        "context": {"metadata": {"agent_role": agent_role}},
    }


class RuntimeRunDelegationServiceTests(unittest.TestCase):
    def test_build_retry_failed_delegation_callbacks_includes_retry_specific_entries(self):
        callbacks = runtime_run_delegation_service.build_retry_failed_delegation_callbacks(
            lookup_run_snapshot=lambda run_id: _parent_snapshot(),
            enforce_run_owner_access=lambda current_user, snapshot: None,
            normalize_agent_role=lambda role: str(role or "").strip().lower(),
            find_run_relationships=lambda parent_run_id, snapshot: (snapshot, []),
            normalize_run_id_token=lambda value: str(value or "").strip() or None,
            parse_utc_ts=lambda value: None,
            build_retry_child_payload=lambda parent_snapshot, child, note=None: {},
            build_delegated_run_request=lambda *args, **kwargs: {},
            execute_system_run_start_request_via_turn_runtime=lambda *args, **kwargs: {},
            stamp_request_owner_fn=lambda payload: payload,
            run_execution_services=lambda: object(),
            refresh_parent_delegation_state=lambda run_id: None,
        )

        self.assertIn("find_run_relationships", callbacks)
        self.assertIn("build_retry_child_payload", callbacks)
        self.assertIn("build_delegated_run_request", callbacks)

    def test_delegate_run_children_rejects_orchestrator_target_role(self):
        with self.assertRaises(HTTPException):
            runtime_run_delegation_service.delegate_run_children(
                "parent-1",
                body=_DelegationPayload([_Child(agent_role="orchestrator", user_goal="bad")]),
                current_user={"user_id": "user-1"},
                lookup_run_snapshot=lambda run_id: _parent_snapshot(),
                enforce_run_owner_access=lambda current_user, snapshot: None,
                normalize_agent_role=lambda role: str(role or "").strip().lower(),
                build_delegated_run_request=lambda *args, **kwargs: {},
                execute_system_run_start_request_via_turn_runtime=lambda *args, **kwargs: {},
                stamp_request_owner_fn=lambda payload: payload,
                run_execution_services=lambda: object(),
                normalize_run_id_token=lambda value: str(value or "").strip() or None,
                refresh_parent_delegation_state=lambda run_id: None,
            )

    def test_auto_delegate_run_children_emits_routing_log_and_returns_created_items(self):
        routing_logs = []
        created_requests = []

        payload = runtime_run_delegation_service.auto_delegate_run_children(
            "parent-1",
            request_payload=_AutoDelegationPayload(note=""),
            current_user={"user_id": "user-1"},
            lookup_run_snapshot=lambda run_id: _parent_snapshot(),
            enforce_run_owner_access=lambda current_user, snapshot: None,
            normalize_agent_role=lambda role: str(role or "").strip().lower(),
            build_auto_delegation_plan=lambda snapshot, max_children=3: [
                {
                    "agent_role": "researcher",
                    "user_goal": "Inspect logs",
                    "metadata": {
                        "auto_delegation_rule": "logs",
                        "auto_delegation_source": "keyword",
                        "auto_delegation_reason": "contains log triage",
                    },
                }
            ],
            emit_auto_delegation_routing_log=lambda parent_run_id, plan, strategy, reason: routing_logs.append(
                (parent_run_id, strategy, reason, len(plan))
            ),
            build_delegated_run_request=lambda snapshot, child, note=None: {"child": child, "note": note},
            execute_system_run_start_request_via_turn_runtime=lambda delegated_req, **kwargs: created_requests.append(delegated_req) or {"run_id": "child-1"},
            stamp_request_owner_fn=lambda payload: payload,
            run_execution_services=lambda: object(),
            normalize_run_id_token=lambda value: str(value or "").strip() or None,
            refresh_parent_delegation_state=lambda run_id: None,
        )

        self.assertEqual(payload["count"], 1)
        self.assertEqual(payload["note"], "Auto-planned by orchestrator rules.")
        self.assertEqual(payload["items"][0]["auto_delegation_rule"], "logs")
        self.assertEqual(created_requests[0]["note"], "Auto-planned by orchestrator rules.")
        self.assertEqual(routing_logs, [("parent-1", "keyword", "contains log triage", 1)])

    def test_retry_failed_delegation_runs_retries_latest_failed_child_per_lineage(self):
        child_runs = [
            {
                "run_id": "child-1",
                "retry_root_run_id": "root-1",
                "status": "failed",
                "updated_at": "2026-04-05T00:00:00Z",
                "created_at": "2026-04-05T00:00:00Z",
            },
            {
                "run_id": "child-2",
                "retry_root_run_id": "root-1",
                "status": "completed",
                "updated_at": "2026-04-05T01:00:00Z",
                "created_at": "2026-04-05T01:00:00Z",
            },
            {
                "run_id": "child-3",
                "retry_root_run_id": "root-2",
                "status": "timeout",
                "updated_at": "2026-04-05T02:00:00Z",
                "created_at": "2026-04-05T02:00:00Z",
            },
        ]
        built_payloads = []

        payload = runtime_run_delegation_service.retry_failed_delegation_runs(
            "parent-1",
            request_payload=_RetryPayload(),
            current_user={"user_id": "user-1"},
            lookup_run_snapshot=lambda run_id: _parent_snapshot(),
            enforce_run_owner_access=lambda current_user, snapshot: None,
            normalize_agent_role=lambda role: str(role or "").strip().lower(),
            find_run_relationships=lambda parent_run_id, snapshot: (snapshot, child_runs),
            normalize_run_id_token=lambda value: str(value or "").strip() or None,
            parse_utc_ts=lambda value: datetime.fromisoformat(str(value).replace("Z", "+00:00")) if value else None,
            build_retry_child_payload=lambda parent_snapshot, child, note=None: built_payloads.append((child["run_id"], note)) or {
                "agent_role": "researcher",
                "user_goal": f"Retry {child['run_id']}",
                "metadata": {
                    "retry_of_run_id": child["run_id"],
                    "retry_root_run_id": child.get("retry_root_run_id") or child["run_id"],
                    "retry_sequence": 1,
                },
            },
            build_delegated_run_request=lambda snapshot, child, note=None: {"child": child, "note": note},
            execute_system_run_start_request_via_turn_runtime=lambda delegated_req, **kwargs: {"run_id": f"new-{delegated_req['child']['metadata']['retry_of_run_id']}"},
            stamp_request_owner_fn=lambda payload: payload,
            run_execution_services=lambda: object(),
            refresh_parent_delegation_state=lambda run_id: None,
        )

        self.assertEqual(payload["count"], 1)
        self.assertEqual(payload["items"][0]["retry_of_run_id"], "child-3")
        self.assertEqual(payload["items"][0]["run_id"], "new-child-3")
        self.assertEqual(built_payloads, [("child-3", "Retry requested from orchestration summary.")])


if __name__ == "__main__":
    unittest.main()
