import asyncio
import unittest
from unittest.mock import AsyncMock, patch

from fastapi import HTTPException

from server_modules.agent_turn import build_run_start_turn_request
from server_modules.run_service import (
    PreparedRunCreationServices,
    RunCreationServices,
    RunExecutionServices,
    build_run_start_request_from_turn,
    create_run_from_prepared_request,
    create_run_result_from_request,
    execute_durable_turn_request,
)
from server_modules.runtime_models import RunStartRequest


class RunServiceTests(unittest.TestCase):
    def test_build_run_start_request_from_turn_preserves_canonical_metadata(self):
        base_request = RunStartRequest(
            engine="orion",
            workspace_id="workspace-1",
            user_goal="Original goal",
            provider="openai",
            model="gpt-test",
            metadata={"owner_user_id": "user-1", "trust_mode": "guarded"},
        )
        turn_request = build_run_start_turn_request(base_request)

        converted = build_run_start_request_from_turn(turn_request, base_request=base_request)

        self.assertEqual(converted.workspace_id, "workspace-1")
        self.assertEqual(converted.user_goal, "Original goal")
        self.assertEqual(converted.provider, "openai")
        self.assertEqual(converted.metadata["agent_turn_request"]["workspace_id"], "workspace-1")
        self.assertEqual(converted.metadata["agent_turn_request"]["message"], "Original goal")
        self.assertEqual(converted.metadata["channel"], "web")

    def test_execute_durable_turn_request_returns_run_result(self):
        run_request = RunStartRequest(
            engine="orion",
            workspace_id="default",
            user_goal="Summarize inbox state",
            provider="openai",
            model="gpt-test",
            metadata={"owner_user_id": "user-1"},
        )
        turn_request = build_run_start_turn_request(run_request)
        services = RunExecutionServices(
            stamp_request_owner=lambda req, current_user: req,
            prepare_run_start_request=lambda req: {"metadata": dict(req.metadata or {})},
            create_run_from_request=lambda req: {"run_id": "run-1", "status": "starting"},
        )

        with patch("server_modules.run_service.decide_execution_target", return_value={"selected": "cloud"}), patch(
            "server_modules.run_service.apply_execution_route_metadata",
            side_effect=lambda metadata, route: {**metadata, "execution_target_selected": route["selected"]},
        ), patch(
            "server_modules.run_service.build_doctor_run_gate_live",
            new=AsyncMock(return_value={"blocking": False, "title": "ok"}),
        ):
            execution = asyncio.run(
                execute_durable_turn_request(
                    turn_request=turn_request,
                    current_user={"user_id": "user-1"},
                    services=services,
                    base_request=run_request,
                )
            )

        self.assertEqual(execution["kind"], "durable_run")
        self.assertEqual(execution["result"]["run_id"], "run-1")
        self.assertFalse(execution["result"]["doctor_preflight"]["blocking"])

    def test_execute_durable_turn_request_raises_on_doctor_block(self):
        run_request = RunStartRequest(
            engine="orion",
            workspace_id="default",
            user_goal="Summarize inbox state",
            provider="openai",
            model="gpt-test",
            metadata={"owner_user_id": "user-1"},
        )
        turn_request = build_run_start_turn_request(run_request)
        services = RunExecutionServices(
            stamp_request_owner=lambda req, current_user: req,
            prepare_run_start_request=lambda req: {"metadata": dict(req.metadata or {})},
            create_run_from_request=lambda req: {"run_id": "run-1", "status": "starting"},
        )

        with patch("server_modules.run_service.decide_execution_target", return_value={"selected": "cloud"}), patch(
            "server_modules.run_service.apply_execution_route_metadata",
            side_effect=lambda metadata, route: {**metadata, "execution_target_selected": route["selected"]},
        ), patch(
            "server_modules.run_service.build_doctor_run_gate_live",
            new=AsyncMock(return_value={"blocking": True, "detail": "blocked by doctor"}),
        ):
            with self.assertRaises(HTTPException) as error:
                asyncio.run(
                    execute_durable_turn_request(
                        turn_request=turn_request,
                        current_user={"user_id": "user-1"},
                        services=services,
                        base_request=run_request,
                    )
                )

        self.assertEqual(error.exception.status_code, 409)

    def test_create_run_result_from_request_normalizes_mapping_result(self):
        request = RunStartRequest(engine="orion", workspace_id="default", user_goal="hello")

        result = create_run_result_from_request(
            request,
            services=RunCreationServices(
                create_run_from_request=lambda req, schedule_id=None: {"run_id": "run-1", "schedule_id": schedule_id}
            ),
            schedule_id="sched-1",
        )

        self.assertEqual(result["run_id"], "run-1")
        self.assertEqual(result["schedule_id"], "sched-1")

    def test_create_run_from_prepared_request_returns_shared_creation_payload(self):
        request = RunStartRequest(
            engine="orion",
            workspace_id="default",
            user_goal="hello",
            provider="openai",
            model="gpt-test",
            metadata={"owner_user_id": "user-1"},
        )
        prepared = {
            "engine": "orion",
            "metadata": {"owner_user_id": "user-1", "agent_role": "orchestrator"},
            "workflow_snapshot": None,
        }

        result = create_run_from_prepared_request(
            request,
            prepared=prepared,
            services=PreparedRunCreationServices(
                decide_execution_target=lambda metadata, schedule_id=None: {"selected": "cloud"},
                apply_execution_route_metadata=lambda metadata, route: {**metadata, "execution_target_selected": route["selected"]},
                build_doctor_run_gate=lambda **kwargs: {"blocking": False},
                agent_machine_inherited_owner_user_id=lambda owner_user_id: owner_user_id,
                compute_tool_policy_precheck=lambda preview_context: {"blocked_count": 0},
                apply_browser_execution_metadata=lambda metadata: None,
                local_execution_block_prompt=lambda precheck: "blocked",
                resolve_runtime_policy_mode=lambda metadata, selected_target=None: {"policy_mode": "guarded"},
                agent_machine_full_trust_enabled=lambda owner_user_id: False,
                local_execution_requires_start_confirmation=lambda metadata, precheck: False,
                mark_local_execution_tools_approved=lambda metadata: None,
                precheck_human_action_labels=lambda precheck, decision="require_confirmation": [],
                local_execution_confirmation_prompt=lambda precheck: "confirm",
                begin_run_pending_confirmation=lambda *args, **kwargs: {"id": "approval-1"},
                create_run=lambda **kwargs: "run-1",
                load_created_run=lambda run_id: {"active_profile_id": "profile-1"},
                now_iso=lambda: "2026-04-04T00:00:00Z",
            ),
        )

        self.assertEqual(result["run_id"], "run-1")
        self.assertEqual(result["status"], "starting")
        self.assertEqual(result["route"]["selected"], "cloud")
        self.assertEqual(result["metadata"]["policy_mode"], "guarded")
        self.assertEqual(result["created_run"]["active_profile_id"], "profile-1")


if __name__ == "__main__":
    unittest.main()
