import unittest
from unittest import mock

from server_modules import agent_approval_memory_service
from server_modules.rust_runtime_kernel_client import RustKernelDecisionError


class AgentApprovalMemoryRustGateTests(unittest.TestCase):
    def test_create_approval_memory_rule_calls_rust_before_write(self):
        state = {"version": 1, "rules": {}}
        with mock.patch.object(
            agent_approval_memory_service,
            "_read_state",
            return_value=state,
        ), mock.patch.object(
            agent_approval_memory_service,
            "_write_state",
            return_value=state,
        ) as write_state, mock.patch.object(
            agent_approval_memory_service.rust_runtime_kernel_client,
            "run_runtime_kernel_enforced",
            return_value={
                "ok": True,
                "decision": "allow",
                "reason": "runtime_state_store_policy_satisfied",
                "operation": "upsert_approval_memory_rule",
            },
        ) as rust_gate:
            rule = agent_approval_memory_service.create_approval_memory_rule(
                workspace_id="ws-1",
                owner_user_id="owner-1",
                capability="browser.click",
                target_domain="example.com",
            )

        rust_gate.assert_called_once()
        command, payload = rust_gate.call_args.args
        self.assertEqual(command, "runtime-state-store-decision")
        self.assertEqual(payload["operation"], "upsert_approval_memory_rule")
        self.assertEqual(payload["state_class"], "agent_approval_memory")
        self.assertEqual(payload["workspace_id"], "ws-1")
        self.assertEqual(payload["actor_id"], "owner-1")
        write_state.assert_called_once()
        self.assertEqual(rule.workspace_id, "ws-1")

    def test_create_approval_memory_rule_rust_denial_blocks_write(self):
        denied = RustKernelDecisionError(
            {
                "ok": False,
                "decision": "block",
                "reason": "owner_access_denied",
                "operation": "upsert_approval_memory_rule",
            },
            command="runtime-state-store-decision",
        )
        with mock.patch.object(
            agent_approval_memory_service,
            "_read_state",
            return_value={"version": 1, "rules": {}},
        ), mock.patch.object(
            agent_approval_memory_service,
            "_write_state",
        ) as write_state, mock.patch.object(
            agent_approval_memory_service.rust_runtime_kernel_client,
            "run_runtime_kernel_enforced",
            side_effect=denied,
        ):
            with self.assertRaises(RuntimeError):
                agent_approval_memory_service.create_approval_memory_rule(
                    workspace_id="ws-1",
                    owner_user_id="owner-1",
                    capability="browser.click",
                    target_domain="example.com",
                )

        write_state.assert_not_called()

    def test_create_approval_memory_rule_unexpected_next_action_blocks_write(self):
        with mock.patch.object(
            agent_approval_memory_service,
            "_read_state",
            return_value={"version": 1, "rules": {}},
        ), mock.patch.object(
            agent_approval_memory_service,
            "_write_state",
        ) as write_state, mock.patch.object(
            agent_approval_memory_service.rust_runtime_kernel_client,
            "run_runtime_kernel_enforced",
            return_value={
                "ok": True,
                "decision": "allow",
                "reason": "runtime_state_store_policy_satisfied",
                "operation": "upsert_approval_memory_rule",
                "next_action": "write_state",
            },
        ):
            with self.assertRaises(RuntimeError) as raised:
                agent_approval_memory_service.create_approval_memory_rule(
                    workspace_id="ws-1",
                    owner_user_id="owner-1",
                    capability="browser.click",
                    target_domain="example.com",
                )

        self.assertIn("unexpected next_action", str(raised.exception))
        write_state.assert_not_called()
