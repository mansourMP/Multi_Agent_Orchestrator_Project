from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from server_modules import agent_approval_memory_service as memory


class AgentApprovalMemoryServiceTests(unittest.TestCase):
    def _patch_workspace(self, root: Path):
        return patch("server_modules.agent_approval_memory_service.workspace_context.workspace_scope_dir", return_value=root)

    def test_create_browser_rule_requires_domain_and_matches_subdomain(self) -> None:
        with tempfile.TemporaryDirectory() as tempdir:
            root = Path(tempdir) / "ws-1"
            with self._patch_workspace(root):
                rule = memory.create_approval_memory_rule(
                    workspace_id="ws-1",
                    owner_user_id="owner-1",
                    capability="browser.click",
                    target_domain="example.com",
                    policy_id="policy-1",
                    gateway_id="gw-1",
                )
                found = memory.find_matching_approval_memory_rule(
                    workspace_id="ws-1",
                    owner_user_id="owner-1",
                    capability="browser.click",
                    policy_id="policy-1",
                    gateway_id="gw-1",
                    target_domain="docs.example.com",
                )

            self.assertTrue(rule.rule_id.startswith(memory.APPROVAL_MEMORY_RULE_PREFIX))
            self.assertIsNotNone(found)
            self.assertEqual(found.rule_id, rule.rule_id)

    def test_rejects_broad_browser_rule(self) -> None:
        with self.assertRaises(memory.AgentApprovalMemoryError):
            memory.create_approval_memory_rule(
                workspace_id="ws-1",
                owner_user_id="owner-1",
                capability="browser.click",
            )

    def test_rejects_never_remember_capability(self) -> None:
        with self.assertRaises(memory.AgentApprovalMemoryError):
            memory.create_approval_memory_rule(
                workspace_id="ws-1",
                owner_user_id="owner-1",
                capability="terminal.command",
                target_path_prefix="/Users/mansur/Agent",
            )

    def test_file_rule_matches_only_path_prefix(self) -> None:
        with tempfile.TemporaryDirectory() as tempdir:
            root = Path(tempdir) / "ws-1"
            with self._patch_workspace(root):
                memory.create_approval_memory_rule(
                    workspace_id="ws-1",
                    owner_user_id="owner-1",
                    capability="file.write",
                    target_path_prefix="/Users/mansur/Agent",
                )
                allowed = memory.find_matching_approval_memory_rule(
                    workspace_id="ws-1",
                    owner_user_id="owner-1",
                    capability="file.write",
                    target_path="/Users/mansur/Agent/report.md",
                )
                denied = memory.find_matching_approval_memory_rule(
                    workspace_id="ws-1",
                    owner_user_id="owner-1",
                    capability="file.write",
                    target_path="/Users/mansur/Desktop/report.md",
                )

            self.assertIsNotNone(allowed)
            self.assertIsNone(denied)

    def test_communication_rule_requires_channel_and_recipient(self) -> None:
        with self.assertRaises(memory.AgentApprovalMemoryError):
            memory.create_approval_memory_rule(
                workspace_id="ws-1",
                owner_user_id="owner-1",
                capability="communication.send",
                target_channel="telegram",
            )

    def test_consume_increments_use_count_and_stops_after_max_uses(self) -> None:
        with tempfile.TemporaryDirectory() as tempdir:
            root = Path(tempdir) / "ws-1"
            with self._patch_workspace(root):
                memory.create_approval_memory_rule(
                    workspace_id="ws-1",
                    owner_user_id="owner-1",
                    capability="browser.click",
                    target_domain="example.com",
                    max_uses=1,
                )
                first = memory.consume_matching_approval_memory_rule(
                    workspace_id="ws-1",
                    owner_user_id="owner-1",
                    capability="browser.click",
                    target_domain="example.com",
                )
                second = memory.consume_matching_approval_memory_rule(
                    workspace_id="ws-1",
                    owner_user_id="owner-1",
                    capability="browser.click",
                    target_domain="example.com",
                )

            self.assertIsNotNone(first)
            self.assertEqual(first.use_count, 1)
            self.assertIsNone(second)

    def test_workspace_scope_is_enforced(self) -> None:
        with tempfile.TemporaryDirectory() as tempdir:
            root = Path(tempdir) / "ws-1"
            with self._patch_workspace(root):
                memory.create_approval_memory_rule(
                    workspace_id="ws-1",
                    owner_user_id="owner-1",
                    capability="browser.click",
                    target_domain="example.com",
                )
                found = memory.find_matching_approval_memory_rule(
                    workspace_id="ws-2",
                    owner_user_id="owner-1",
                    capability="browser.click",
                    target_domain="example.com",
                )

            self.assertIsNone(found)

    def test_payload_scope_derivation_uses_action_args_url(self) -> None:
        with tempfile.TemporaryDirectory() as tempdir:
            root = Path(tempdir) / "ws-1"
            with self._patch_workspace(root):
                rule = memory.create_approval_memory_rule_from_payload(
                    workspace_id="ws-1",
                    owner_user_id="owner-1",
                    capability="browser.click",
                    payload={"action_args": {"url": "https://example.com/send"}},
                    ttl_seconds=300,
                )

            self.assertEqual(rule.target_domain, "example.com")


if __name__ == "__main__":
    unittest.main()
