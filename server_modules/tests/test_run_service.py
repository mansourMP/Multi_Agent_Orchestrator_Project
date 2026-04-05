import asyncio
import unittest
from unittest.mock import AsyncMock, patch

from fastapi import HTTPException

from server_modules.agent_turn import build_run_start_turn_request
from server_modules.run_service import (
    apply_browser_execution_metadata,
    build_legacy_local_execution_creation_services,
    build_legacy_orion_preparation_services,
    build_prepared_run_creation_services,
    build_run_preparation_services,
    build_run_prepared_result_services,
    build_runs_core_creation_result,
    build_runs_delegation_creation_result,
    prepare_legacy_run_start_request,
    create_legacy_run_result_from_request,
    create_run_result_from_prepared_request,
    local_execution_block_prompt,
    local_execution_confirmation_prompt,
    local_execution_requires_start_confirmation,
    mark_local_execution_tools_approved,
    normalize_requested_max_iterations,
    precheck_human_action_labels,
    PreparedRunCreationServices,
    RunPreparationServices,
    RunCreationServices,
    RunExecutionServices,
    LegacyLocalExecutionCreationCallbacks,
    LegacyOrionPreparationCallbacks,
    LegacyRunPreparationServices,
    LegacyRunRequestServices,
    RunPreparedResultServices,
    safe_int,
    build_run_start_request_from_turn,
    create_run_from_prepared_request,
    create_run_result_from_request,
    execute_durable_turn_request,
    prepare_run_start_request,
)
from server_modules.runtime_models import RunStartRequest


class RunServiceTests(unittest.TestCase):
    def test_safe_int_and_normalize_requested_max_iterations(self):
        self.assertEqual(safe_int("7", 0), 7)
        self.assertEqual(safe_int("bad", 5), 5)
        self.assertEqual(normalize_requested_max_iterations("9"), 9)
        self.assertIsNone(normalize_requested_max_iterations(""))

    def test_build_service_bundles_preserve_shared_callbacks(self):
        preparation = build_run_preparation_services(
            engine_registry={"orion": object()},
            engine_validation_errors=[],
            supported_outcome_packs={"local_execution"},
            normalize_requested_max_iterations=normalize_requested_max_iterations,
            normalize_trust_mode=lambda value: str(value or ""),
            trust_mode_aliases={},
            valid_trust_modes={"guarded"},
            normalize_execution_target=lambda value: str(value or ""),
            valid_execution_targets={"cloud"},
            normalize_run_id_token=lambda value: str(value or "") or None,
            normalize_agent_role=lambda value: str(value or ""),
            detect_agent_role=lambda req, metadata: ("builder", "default"),
            resolve_app_permissions=lambda app_id: {},
            action_policy_from_app_permissions=lambda permissions: {},
            merge_action_policies=lambda existing, new: {},
            fetch_workflow_snapshot=lambda workflow_id: None,
        )
        creation = build_prepared_run_creation_services(
            decide_execution_target=lambda metadata, schedule_id=None: {"selected": "cloud"},
            apply_execution_route_metadata=lambda metadata, route: metadata,
            build_doctor_run_gate=lambda **kwargs: {"blocking": False},
            agent_machine_inherited_owner_user_id=lambda owner_user_id: owner_user_id,
            compute_tool_policy_precheck=lambda preview_context: {"blocked_count": 0},
            apply_browser_execution_metadata=apply_browser_execution_metadata,
            local_execution_block_prompt=local_execution_block_prompt,
            resolve_runtime_policy_mode=lambda metadata, selected_target=None: {"policy_mode": "guarded"},
            agent_machine_full_trust_enabled=lambda owner_user_id: False,
            local_execution_requires_start_confirmation=local_execution_requires_start_confirmation,
            mark_local_execution_tools_approved=mark_local_execution_tools_approved,
            precheck_human_action_labels=precheck_human_action_labels,
            local_execution_confirmation_prompt=local_execution_confirmation_prompt,
            begin_run_pending_confirmation=lambda *args, **kwargs: {"approval_id": "approval-1"},
            create_run=lambda **kwargs: "run-1",
        )

        self.assertIs(preparation.normalize_requested_max_iterations, normalize_requested_max_iterations)
        self.assertIs(creation.mark_local_execution_tools_approved, mark_local_execution_tools_approved)

    def test_prepare_legacy_run_start_request_uses_built_shared_services(self):
        request = RunStartRequest(engine="orion", workspace_id="default", user_goal="hello")

        prepared = prepare_legacy_run_start_request(
            request,
            services=LegacyRunPreparationServices(
                build_preparation_services=lambda: build_run_preparation_services(
                    engine_registry={"orion": object()},
                    engine_validation_errors=[],
                    supported_outcome_packs={"local_execution"},
                    normalize_requested_max_iterations=normalize_requested_max_iterations,
                    normalize_trust_mode=lambda value: str(value or ""),
                    trust_mode_aliases={},
                    valid_trust_modes={"guarded"},
                    normalize_execution_target=lambda value: str(value or ""),
                    valid_execution_targets={"cloud"},
                    normalize_run_id_token=lambda value: str(value or "") or None,
                    normalize_agent_role=lambda value: str(value or ""),
                    detect_agent_role=lambda req, metadata: ("builder", "default"),
                    resolve_app_permissions=lambda app_id: {},
                    action_policy_from_app_permissions=lambda permissions: {},
                    merge_action_policies=lambda existing, new: {},
                    fetch_workflow_snapshot=lambda workflow_id: None,
                )
            ),
        )

        self.assertEqual(prepared["engine"], "orion")
        self.assertEqual(prepared["metadata"]["agent_role"], "builder")

    def test_build_legacy_local_execution_creation_services_uses_shared_local_helpers(self):
        creation = build_legacy_local_execution_creation_services(
            callbacks=LegacyLocalExecutionCreationCallbacks(
                decide_execution_target=lambda metadata, schedule_id=None: {"selected": "cloud"},
                apply_execution_route_metadata=lambda metadata, route: metadata,
                build_doctor_run_gate=lambda **kwargs: {"blocking": False},
                agent_machine_inherited_owner_user_id=lambda owner_user_id: owner_user_id,
                compute_tool_policy_precheck=lambda preview_context: {"blocked_count": 0},
                resolve_runtime_policy_mode=lambda metadata, selected_target=None: {"policy_mode": "guarded"},
                agent_machine_full_trust_enabled=lambda owner_user_id: False,
                begin_run_pending_confirmation=lambda *args, **kwargs: {"approval_id": "approval-1"},
                create_run=lambda **kwargs: "run-1",
                local_execution_target="local_companion",
                local_execution_pack_id="local-execution-v1",
            )
        )

        self.assertIs(creation.apply_browser_execution_metadata, apply_browser_execution_metadata)
        self.assertIs(creation.mark_local_execution_tools_approved, mark_local_execution_tools_approved)

    def test_build_legacy_orion_preparation_services_preserves_postprocess_callback(self):
        services = build_legacy_orion_preparation_services(
            callbacks=LegacyOrionPreparationCallbacks(
                engine_registry={"orion": object()},
                engine_validation_errors=[],
                supported_outcome_packs={"local_execution"},
                normalize_requested_max_iterations=normalize_requested_max_iterations,
                normalize_trust_mode=lambda value: str(value or ""),
                trust_mode_aliases={},
                valid_trust_modes={"guarded"},
                normalize_execution_target=lambda value: str(value or ""),
                valid_execution_targets={"cloud"},
                normalize_run_id_token=lambda value: str(value or "") or None,
                normalize_agent_role=lambda value: str(value or ""),
                detect_agent_role=lambda req, metadata: ("builder", "default"),
                resolve_app_permissions=lambda app_id: {},
                action_policy_from_app_permissions=lambda permissions: {},
                merge_action_policies=lambda existing, new: {},
                fetch_workflow_snapshot=lambda workflow_id: None,
                postprocess_metadata=lambda req, metadata: {**metadata, "postprocessed": True},
            )
        )

        prepared = prepare_run_start_request(
            RunStartRequest(engine="orion", workspace_id="default", user_goal="hello"),
            services=services,
        )

        self.assertTrue(prepared["metadata"]["postprocessed"])

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

    def test_create_run_result_from_prepared_request_applies_legacy_result_builder(self):
        request = RunStartRequest(engine="orion", workspace_id="default", user_goal="hello")
        prepared = {"engine": "orion", "metadata": {"agent_role": "builder"}, "workflow_snapshot": None}

        result = create_run_result_from_prepared_request(
            request,
            prepared=prepared,
            services=build_prepared_run_creation_services(
                decide_execution_target=lambda metadata, schedule_id=None: {"selected": "cloud"},
                apply_execution_route_metadata=lambda metadata, route: metadata,
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
                create_run=lambda **kwargs: "run-2",
                load_created_run=lambda run_id: {"active_profile_id": "profile-2"},
                now_iso=lambda: "2026-04-05T00:00:00Z",
            ),
            result_services=RunPreparedResultServices(
                create_run_from_prepared_request=create_run_from_prepared_request,
                build_result=lambda req, *, created: build_runs_core_creation_result(req, created=created),
            ),
        )

        self.assertEqual(result["run_id"], "run-2")
        self.assertEqual(result["status"], "starting")
        self.assertEqual(result["route"]["selected"], "cloud")

    def test_create_legacy_run_result_from_request_delegates_shared_flow(self):
        request = RunStartRequest(engine="orion", workspace_id="default", user_goal="hello")

        result = create_legacy_run_result_from_request(
            request,
            services=LegacyRunRequestServices(
                prepare_run_start_request=lambda req: {"engine": "orion", "metadata": {}, "workflow_snapshot": None},
                build_creation_services=lambda: build_prepared_run_creation_services(
                    decide_execution_target=lambda metadata, schedule_id=None: {"selected": "cloud"},
                    apply_execution_route_metadata=lambda metadata, route: metadata,
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
                    create_run=lambda **kwargs: "run-3",
                    now_iso=lambda: "2026-04-05T00:00:00Z",
                ),
                result_services=build_run_prepared_result_services(
                    create_run_from_prepared_request=create_run_from_prepared_request,
                    build_result=lambda req, *, created: build_runs_delegation_creation_result(created=created),
                ),
            ),
        )

        self.assertEqual(result["run_id"], "run-3")
        self.assertEqual(result["status"], "starting")
        self.assertEqual(result["route"]["selected"], "cloud")

    def test_prepare_run_start_request_applies_shared_normalization_and_postprocess(self):
        request = RunStartRequest(
            engine="orion",
            workspace_id="default",
            user_goal="hello",
            workflow_id="wf-1",
            max_iterations=12,
            metadata={
                "trust_mode": "auto",
                "execution_target": "cloud",
                "delegated_by_role": "researcher",
                "app_id": "crm",
            },
        )

        prepared = prepare_run_start_request(
            request,
            services=RunPreparationServices(
                engine_registry={"orion": object()},
                engine_validation_errors=[],
                supported_outcome_packs={"local_execution"},
                normalize_requested_max_iterations=lambda value: 12,
                normalize_trust_mode=lambda value: "guarded" if value == "auto" else value,
                trust_mode_aliases={"auto": "guarded"},
                valid_trust_modes={"guarded", "strict"},
                normalize_execution_target=lambda value: str(value or "").strip().lower(),
                valid_execution_targets={"auto", "cloud", "local_companion"},
                normalize_run_id_token=lambda value: str(value or "").strip() or None,
                normalize_agent_role=lambda value: str(value or "").strip().lower(),
                detect_agent_role=lambda req, metadata: ("orchestrator", "detected"),
                resolve_app_permissions=lambda app_id: {"allow": ["read"]},
                action_policy_from_app_permissions=lambda permissions: {"allowed": permissions["allow"]},
                merge_action_policies=lambda existing, new: {"merged": [existing["action_policy"], new["action_policy"]]},
                fetch_workflow_snapshot=lambda workflow_id: {
                    "definition": {"version": "v1"},
                    "name": "Workflow",
                    "status": "active",
                },
                postprocess_metadata=lambda req, metadata: {**metadata, "postprocessed": True},
            ),
        )

        self.assertEqual(prepared["engine"], "orion")
        self.assertEqual(prepared["metadata"]["trust_mode"], "guarded")
        self.assertEqual(prepared["metadata"]["max_iterations"], 12)
        self.assertEqual(prepared["metadata"]["agent_role"], "orchestrator")
        self.assertEqual(prepared["metadata"]["agent_role_source"], "detected")
        self.assertEqual(prepared["metadata"]["workflow_name"], "Workflow")
        self.assertEqual(prepared["metadata"]["postprocessed"], True)

    def test_build_runs_core_creation_result_shapes_legacy_core_payload(self):
        request = RunStartRequest(
            engine="orion",
            workspace_id="default",
            user_goal="hello",
            provider="openai",
            model="gpt-test",
        )

        payload = build_runs_core_creation_result(
            request,
            created={
                "run_id": "run-1",
                "engine": "orion",
                "status": "starting",
                "route": {"selected": "cloud"},
                "doctor_preflight": {"blocking": False},
                "pending_confirmation": None,
                "created_run": {
                    "active_profile_id": "profile-1",
                    "active_profile_label": "Primary",
                    "active_provider": "openai",
                    "active_model": "gpt-test",
                },
                "metadata": {
                    "policy_mode": "guarded",
                    "agent_role": "orchestrator",
                    "agent_role_source": "detected",
                },
            },
        )

        self.assertEqual(payload["active_profile_id"], "profile-1")
        self.assertEqual(payload["requested_provider"], "openai")
        self.assertEqual(payload["requested_model"], "gpt-test")
        self.assertIsNone(payload["pending_approval"])

    def test_build_runs_delegation_creation_result_shapes_legacy_delegation_payload(self):
        payload = build_runs_delegation_creation_result(
            created={
                "run_id": "run-1",
                "engine": "orion",
                "status": "starting",
                "route": {"selected": "cloud"},
                "doctor_preflight": {"blocking": False},
                "pending_confirmation": {"approval_id": "approval-1"},
                "metadata": {
                    "agent_role": "researcher",
                    "agent_role_source": "delegated",
                },
            },
        )

        self.assertEqual(payload["agent_role"], "researcher")
        self.assertEqual(payload["pending_confirmation"]["approval_id"], "approval-1")
        self.assertEqual(payload["pending_approval"]["approval_id"], "approval-1")

    def test_local_execution_helper_block(self):
        precheck = {
            "require_confirmation_count": 1,
            "approval_required_count": 0,
            "require_confirmation": ["computer__click"],
            "allowed": ["file__read"],
            "items": [
                {
                    "tool_id": "computer__click",
                    "execution_decision": "require_confirmation",
                    "capabilities": [{"title": "Computer Click"}],
                }
            ],
            "browser_automation_policy": {
                "session_profiles": ["profile-1"],
                "immutable_plan_hash": "hash-1",
                "reviewed_approval_required": True,
            },
        }
        metadata = {
            "execution_target_selected": "local_companion",
            "outcome_pack": "local_execution",
            "tool_policy_precheck": precheck,
        }

        self.assertTrue(
            local_execution_requires_start_confirmation(
                metadata,
                precheck,
                local_execution_target="local_companion",
                local_execution_pack_id="local_execution",
            )
        )
        self.assertEqual(precheck_human_action_labels(precheck), ["Computer Click"])
        self.assertIn("Confirmation required", local_execution_confirmation_prompt(precheck))
        precheck["items"][0]["execution_decision"] = "deny"
        precheck["items"][0]["decision"] = "deny"
        self.assertIn("Run blocked", local_execution_block_prompt(precheck))
        precheck["items"][0]["execution_decision"] = "require_confirmation"
        precheck["items"][0]["decision"] = "require_confirmation"
        mark_local_execution_tools_approved(metadata)
        self.assertEqual(metadata["tool_policy_precheck"]["require_confirmation_count"], 0)
        self.assertIn("computer__click", metadata["tool_policy_precheck"]["allowed"])
        apply_browser_execution_metadata(metadata)
        self.assertEqual(metadata["browser_session_profile"], "profile-1")
        self.assertEqual(metadata["browser_immutable_plan_hash"], "hash-1")
        self.assertTrue(metadata["browser_reviewed_approval_required"])


if __name__ == "__main__":
    unittest.main()
