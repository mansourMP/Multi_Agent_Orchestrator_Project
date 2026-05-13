from __future__ import annotations

import asyncio
import tempfile
import unittest
from pathlib import Path
from unittest.mock import ANY, AsyncMock, MagicMock, patch

from server_modules import sage_agent_runtime_service


def _run(coro):
    return asyncio.run(coro)


class SageAgentRuntimeGatingTests(unittest.TestCase):
    def test_rejects_empty_message(self):
        with self.assertRaises(ValueError) as ctx:
            _run(sage_agent_runtime_service.handle_sage_chat(
                workspace_id="ws-1",
                message="",
            ))
        self.assertIn("message", str(ctx.exception).lower())

    def test_rejects_empty_workspace_id(self):
        with self.assertRaises(ValueError) as ctx:
            _run(sage_agent_runtime_service.handle_sage_chat(
                workspace_id="",
                message="hello",
            ))
        self.assertIn("workspace_id", str(ctx.exception).lower())

    def test_rejects_non_owner_sage_mode(self):
        with self.assertRaises(ValueError) as ctx:
            _run(sage_agent_runtime_service.handle_sage_chat(
                workspace_id="ws-1",
                message="hello",
                mode="customer_live",
            ))
        self.assertIn("mode", str(ctx.exception).lower())


class SageAgentRuntimeContextLoadingTests(unittest.TestCase):
    def test_loads_profile_context(self):
        with (
            patch("server_modules.sage_agent_runtime_service.sage_profile_service.list_sage_profile") as mock_profile,
            patch("server_modules.sage_agent_runtime_service.workspace_context.read_workspace_context_files") as mock_files,
            patch("server_modules.sage_agent_runtime_service.sage_memory_service.build_sage_memory_context_block") as mock_mem,
            patch("server_modules.sage_agent_runtime_service.sage_heartbeat_service.build_sage_heartbeat_snapshot", new=AsyncMock(return_value={})),
            patch("server_modules.sage_agent_runtime_service.list_skill_definitions", return_value=[]),
            patch("server_modules.sage_agent_runtime_service._resolve_cloud_provider") as mock_provider,
            patch("server_modules.sage_agent_runtime_service.generate_chat_reply_with_provider_fallback") as mock_generate,
            patch("server_modules.sage_agent_runtime_service.persist_interaction"),
            patch("server_modules.sage_agent_runtime_service.activity_ledger_service.append_activity_event", new=AsyncMock()),
            patch("server_modules.sage_agent_runtime_service.security_audit_service.emit_security_audit_event"),
        ):
            mock_profile.return_value = {
                "profile": {
                    "user_name": "Mansur",
                    "identity_summary": "Lead developer",
                    "communication_style": "",
                    "recurring_responsibility": "",
                    "standing_rules": [],
                }
            }
            mock_files.return_value = {}
            mock_mem.return_value = ""
            mock_provider.return_value = ("deepseek", {"api_key": "test-key"})
            mock_generate.return_value = ("Reply", {"model": "d"}, "deepseek", "")

            result = _run(sage_agent_runtime_service.handle_sage_chat(
                workspace_id="ws-1", message="hello",
            ))

            self.assertIn("sage_profile", result["used_context"])

    def test_loads_memory_context(self):
        with (
            patch("server_modules.sage_agent_runtime_service.sage_profile_service.list_sage_profile") as mock_profile,
            patch("server_modules.sage_agent_runtime_service.workspace_context.read_workspace_context_files") as mock_files,
            patch("server_modules.sage_agent_runtime_service.sage_memory_service.build_sage_memory_context_block") as mock_mem,
            patch("server_modules.sage_agent_runtime_service.sage_heartbeat_service.build_sage_heartbeat_snapshot", new=AsyncMock(return_value={})),
            patch("server_modules.sage_agent_runtime_service.list_skill_definitions", return_value=[]),
            patch("server_modules.sage_agent_runtime_service._resolve_cloud_provider") as mock_provider,
            patch("server_modules.sage_agent_runtime_service.generate_chat_reply_with_provider_fallback") as mock_generate,
            patch("server_modules.sage_agent_runtime_service.persist_interaction"),
            patch("server_modules.sage_agent_runtime_service.activity_ledger_service.append_activity_event", new=AsyncMock()),
            patch("server_modules.sage_agent_runtime_service.security_audit_service.emit_security_audit_event"),
        ):
            mock_profile.return_value = {"profile": {"user_name": "", "identity_summary": "", "communication_style": "", "recurring_responsibility": "", "standing_rules": []}}
            mock_files.return_value = {}
            mock_mem.return_value = "Sage memory: remembers timezone."
            mock_provider.return_value = ("deepseek", {"api_key": "test-key"})
            mock_generate.return_value = ("Reply", {}, "deepseek", "")

            result = _run(sage_agent_runtime_service.handle_sage_chat(
                workspace_id="ws-1", message="hello",
            ))

            self.assertIn("sage_memory", result["used_context"])

    def test_loads_context_files(self):
        with (
            patch("server_modules.sage_agent_runtime_service.sage_profile_service.list_sage_profile") as mock_profile,
            patch("server_modules.sage_agent_runtime_service.workspace_context.read_workspace_context_files") as mock_files,
            patch("server_modules.sage_agent_runtime_service.sage_memory_service.build_sage_memory_context_block") as mock_mem,
            patch("server_modules.sage_agent_runtime_service.sage_heartbeat_service.build_sage_heartbeat_snapshot", new=AsyncMock(return_value={})),
            patch("server_modules.sage_agent_runtime_service.list_skill_definitions", return_value=[]),
            patch("server_modules.sage_agent_runtime_service._resolve_cloud_provider") as mock_provider,
            patch("server_modules.sage_agent_runtime_service.generate_chat_reply_with_provider_fallback") as mock_generate,
            patch("server_modules.sage_agent_runtime_service.persist_interaction"),
            patch("server_modules.sage_agent_runtime_service.activity_ledger_service.append_activity_event", new=AsyncMock()),
            patch("server_modules.sage_agent_runtime_service.security_audit_service.emit_security_audit_event"),
        ):
            mock_profile.return_value = {"profile": {"user_name": "", "identity_summary": "", "communication_style": "", "recurring_responsibility": "", "standing_rules": []}}
            mock_files.return_value = {"SOUL.md": "You are Sage.", "USER.md": "Name: Test"}
            mock_mem.return_value = ""
            mock_provider.return_value = ("deepseek", {"api_key": "test-key"})
            mock_generate.return_value = ("Reply", {}, "deepseek", "")

            result = _run(sage_agent_runtime_service.handle_sage_chat(
                workspace_id="ws-1", message="hello",
            ))

            self.assertIn("workspace_context_files", result["used_context"])

    def test_loads_heartbeat_context(self):
        heartbeat_data = {
            "bootstrap": {"complete": True},
            "queue_overview": {"running_now_count": 1, "queued_count": 0, "blocked_on_approval_count": 0, "pending_wakeup_count": 0},
            "reminders": {"count": 0},
        }
        with (
            patch("server_modules.sage_agent_runtime_service.sage_profile_service.list_sage_profile") as mock_profile,
            patch("server_modules.sage_agent_runtime_service.workspace_context.read_workspace_context_files") as mock_files,
            patch("server_modules.sage_agent_runtime_service.sage_memory_service.build_sage_memory_context_block") as mock_mem,
            patch("server_modules.sage_agent_runtime_service.sage_heartbeat_service.build_sage_heartbeat_snapshot", new=AsyncMock(return_value=heartbeat_data)),
            patch("server_modules.sage_agent_runtime_service.list_skill_definitions", return_value=[]),
            patch("server_modules.sage_agent_runtime_service._resolve_cloud_provider") as mock_provider,
            patch("server_modules.sage_agent_runtime_service.generate_chat_reply_with_provider_fallback") as mock_generate,
            patch("server_modules.sage_agent_runtime_service.persist_interaction"),
            patch("server_modules.sage_agent_runtime_service.activity_ledger_service.append_activity_event", new=AsyncMock()),
            patch("server_modules.sage_agent_runtime_service.security_audit_service.emit_security_audit_event"),
        ):
            mock_profile.return_value = {"profile": {"user_name": "", "identity_summary": "", "communication_style": "", "recurring_responsibility": "", "standing_rules": []}}
            mock_files.return_value = {}
            mock_mem.return_value = ""
            mock_provider.return_value = ("deepseek", {"api_key": "test-key"})
            mock_generate.return_value = ("Reply", {}, "deepseek", "")

            result = _run(sage_agent_runtime_service.handle_sage_chat(
                workspace_id="ws-1", message="hello",
            ))

            self.assertIn("sage_heartbeat", result["used_context"])

    def test_loads_safe_skill_catalog(self):
        from server_modules.skill_registry import SkillDefinition

        safe_skill = SkillDefinition(
            id="web-search", label="Web Search", description="Search the web",
            permission_label="web", execution_mode="live", action_class="read",
            connector_scopes=(), trigger_terms=("search",),
        )
        with (
            patch("server_modules.sage_agent_runtime_service.sage_profile_service.list_sage_profile") as mock_profile,
            patch("server_modules.sage_agent_runtime_service.workspace_context.read_workspace_context_files") as mock_files,
            patch("server_modules.sage_agent_runtime_service.sage_memory_service.build_sage_memory_context_block") as mock_mem,
            patch("server_modules.sage_agent_runtime_service.sage_heartbeat_service.build_sage_heartbeat_snapshot", new=AsyncMock(return_value={})),
            patch("server_modules.sage_agent_runtime_service.list_skill_definitions", return_value=[safe_skill]),
            patch("server_modules.sage_agent_runtime_service._resolve_cloud_provider") as mock_provider,
            patch("server_modules.sage_agent_runtime_service.generate_chat_reply_with_provider_fallback") as mock_generate,
            patch("server_modules.sage_agent_runtime_service.persist_interaction"),
            patch("server_modules.sage_agent_runtime_service.activity_ledger_service.append_activity_event", new=AsyncMock()),
            patch("server_modules.sage_agent_runtime_service.security_audit_service.emit_security_audit_event"),
        ):
            mock_profile.return_value = {"profile": {"user_name": "", "identity_summary": "", "communication_style": "", "recurring_responsibility": "", "standing_rules": []}}
            mock_files.return_value = {}
            mock_mem.return_value = ""
            mock_provider.return_value = ("deepseek", {"api_key": "test-key"})
            mock_generate.return_value = ("Reply", {}, "deepseek", "")

            result = _run(sage_agent_runtime_service.handle_sage_chat(
                workspace_id="ws-1", message="hello",
            ))

            self.assertIn("sage_skills", result["used_context"])
            self.assertTrue(any(t["id"] == "web-search" for t in result["available_tools"]))


class SageAgentRuntimeSafetyTests(unittest.TestCase):
    def _setup_mocks(self, *, profile_overrides=None, skills=None, memory_return="", files_return=None):
        mocks = {}
        defaults = {"user_name": "", "identity_summary": "", "communication_style": "", "recurring_responsibility": "", "standing_rules": []}
        if profile_overrides:
            defaults.update(profile_overrides)
        mocks["profile"] = patch("server_modules.sage_agent_runtime_service.sage_profile_service.list_sage_profile", return_value={"profile": defaults})
        mocks["files"] = patch("server_modules.sage_agent_runtime_service.workspace_context.read_workspace_context_files", return_value=files_return or {})
        mocks["memory"] = patch("server_modules.sage_agent_runtime_service.sage_memory_service.build_sage_memory_context_block", return_value=memory_return)
        mocks["heartbeat"] = patch("server_modules.sage_agent_runtime_service.sage_heartbeat_service.build_sage_heartbeat_snapshot", new=AsyncMock(return_value={}))
        mocks["skills"] = patch("server_modules.sage_agent_runtime_service.list_skill_definitions", return_value=skills or [])
        mocks["provider"] = patch("server_modules.sage_agent_runtime_service._resolve_cloud_provider", return_value=("deepseek", {"api_key": "test"}))
        mocks["generate"] = patch("server_modules.sage_agent_runtime_service.generate_chat_reply_with_provider_fallback", return_value=("Reply", {"model": "d"}, "deepseek", ""))
        mocks["persist"] = patch("server_modules.sage_agent_runtime_service.persist_interaction")
        mocks["activity"] = patch("server_modules.sage_agent_runtime_service.activity_ledger_service.append_activity_event", new=AsyncMock())
        mocks["audit"] = patch("server_modules.sage_agent_runtime_service.security_audit_service.emit_security_audit_event")
        mocks["approval"] = patch(
            "server_modules.sage_agent_runtime_service._create_approval_for_blocked_action",
            return_value={
                "type": "tool_action",
                "skill_id": "email-access",
                "label": "Email Access",
                "action_class": "write",
                "reason": "Requires explicit owner approval before write/execute action.",
                "approval_token": "sap_test_token_1234",
                "status": "pending",
                "action": "channel_send_draft",
                "description": "Approve a write action",
                "expires_at": "2026-05-11T12:00:00Z",
            },
        )
        return mocks

    def test_excludes_critical_restricted_memory(self):
        mocks = self._setup_mocks(memory_return="Safe facts only")
        with (
            mocks["profile"], mocks["files"], mocks["memory"] as mock_mem,
            mocks["heartbeat"], mocks["skills"], mocks["provider"],
            mocks["generate"], mocks["persist"], mocks["activity"], mocks["audit"],
        ):
            _run(sage_agent_runtime_service.handle_sage_chat(
                workspace_id="ws-1", message="hello",
            ))

            call_kwargs = mock_mem.call_args
            if call_kwargs[1]:
                self.assertFalse(call_kwargs[1].get("include_restricted", True))
            else:
                self.assertFalse(call_kwargs[0].get("include_restricted", True) if len(call_kwargs[0]) > 0 else True)

    def test_secret_redaction_applied_to_prompt(self):
        mocks = self._setup_mocks()
        with (
            mocks["profile"], mocks["files"], mocks["memory"], mocks["heartbeat"],
            mocks["skills"], mocks["provider"],
            mocks["generate"] as mock_gen,
            mocks["persist"], mocks["activity"], mocks["audit"],
        ):
            _run(sage_agent_runtime_service.handle_sage_chat(
                workspace_id="ws-1", message="hello",
            ))

            system_prompt = mock_gen.call_args[0][3]
            self.assertNotIn("sk-", system_prompt)

    def test_blocks_write_skill_triggers(self):
        from server_modules.skill_registry import SkillDefinition

        dangerous = SkillDefinition(
            id="email-access", label="Email Access", description="Send email",
            permission_label="email", execution_mode="manual", action_class="write",
            connector_scopes=("email",), trigger_terms=("send email", "email"),
            requires_approval=True,
        )
        mocks = self._setup_mocks(skills=[dangerous])
        with (
            mocks["profile"], mocks["files"], mocks["memory"], mocks["heartbeat"],
            mocks["skills"], mocks["provider"],
            mocks["generate"], mocks["persist"], mocks["activity"],
            mocks["audit"] as mock_audit, mocks["approval"],
        ):
            result = _run(sage_agent_runtime_service.handle_sage_chat(
                workspace_id="ws-1", message="send email to boss",
            ))

            self.assertTrue(any(b["skill_id"] == "email-access" for b in result["blocked_tools"]))
            self.assertEqual(len(result["available_tools"]), 0)
            self.assertTrue(any(a["skill_id"] == "email-access" for a in result["approvals_required"]))
            self.assertTrue(
                any(str(a.get("approval_token") or "").startswith("sap_") for a in result["approvals_required"])
            )

    def test_write_skill_includes_connected_computer_decision_card(self):
        from server_modules.skill_registry import SkillDefinition

        dangerous = SkillDefinition(
            id="email-access", label="Email Access", description="Send email",
            permission_label="email", execution_mode="manual", action_class="write",
            connector_scopes=("email",), trigger_terms=("send email",),
            requires_approval=True,
        )
        mocks = self._setup_mocks(skills=[dangerous])
        with (
            mocks["profile"], mocks["files"], mocks["memory"], mocks["heartbeat"],
            mocks["skills"], mocks["provider"],
            mocks["generate"], mocks["persist"], mocks["activity"], mocks["audit"], mocks["approval"],
        ):
            result = _run(sage_agent_runtime_service.handle_sage_chat(
                workspace_id="ws-1",
                message="send email to boss",
                current_user={"user_id": "owner-1"},
            ))

            approval = result["approvals_required"][0]
            decision = approval["agent_computer_decision"]
            self.assertEqual(decision["decision"], "approval_required")
            self.assertEqual(decision["agent_id"], "sage_main_agent")
            self.assertEqual(decision["risk_decision"]["capability"], "communication.send")
            self.assertEqual(approval["approval_card"]["action"], "communication.send")
            self.assertTrue(approval["approval_card"]["rememberable"])

    def test_kill_switch_blocks_connected_computer_decision_without_approval_token(self):
        from server_modules import kill_switch_gate
        from server_modules.skill_registry import SkillDefinition

        dangerous = SkillDefinition(
            id="email-access", label="Email Access", description="Send email",
            permission_label="email", execution_mode="manual", action_class="write",
            connector_scopes=("email",), trigger_terms=("send email",),
            requires_approval=True,
        )
        mocks = self._setup_mocks(skills=[dangerous])
        kill_switch_gate.set_kill_switch("agent:sage_main_agent", active=True)
        try:
            with (
                mocks["profile"], mocks["files"], mocks["memory"], mocks["heartbeat"],
                mocks["skills"], mocks["provider"],
                mocks["generate"], mocks["persist"], mocks["activity"], mocks["audit"],
                mocks["approval"] as mock_approval,
            ):
                result = _run(sage_agent_runtime_service.handle_sage_chat(
                    workspace_id="ws-1",
                    message="send email to boss",
                    current_user={"user_id": "owner-1"},
                ))

                approval = result["approvals_required"][0]
                decision = approval["agent_computer_decision"]
                self.assertEqual(decision["decision"], "block")
                self.assertTrue(decision["blocked"])
                self.assertEqual(decision["reason"], "kill_state:active")
                self.assertEqual(decision["risk_decision"]["blocked_reason"], "kill_state:active")
                self.assertIsNone(approval["approval_token"])
                self.assertEqual(approval["status"], "blocked")
                mock_approval.assert_not_called()
        finally:
            kill_switch_gate.clear_kill_switch("agent:sage_main_agent")

    def test_blocks_execute_skill_triggers(self):
        from server_modules.skill_registry import SkillDefinition

        dangerous = SkillDefinition(
            id="task-runner", label="Task Runner", description="Run tasks",
            permission_label="task", execution_mode="manual", action_class="execute",
            connector_scopes=(), trigger_terms=("run", "execute"),
            requires_approval=True,
        )
        mocks = self._setup_mocks(skills=[dangerous])
        with (
            mocks["profile"], mocks["files"], mocks["memory"], mocks["heartbeat"],
            mocks["skills"], mocks["provider"],
            mocks["generate"], mocks["persist"], mocks["activity"], mocks["audit"], mocks["approval"],
        ):
            result = _run(sage_agent_runtime_service.handle_sage_chat(
                workspace_id="ws-1", message="run the deployment script",
            ))

            self.assertTrue(any(b["skill_id"] == "task-runner" for b in result["blocked_tools"]))
            self.assertEqual(
                result["blocked_tools"][0]["agent_computer_decision"]["risk_decision"]["capability"],
                "terminal.command",
            )

    def test_connected_computer_decision_redacts_secret_like_payload(self):
        from server_modules.skill_registry import SkillDefinition

        dangerous = SkillDefinition(
            id="email-access", label="Email Access", description="Send email",
            permission_label="email", execution_mode="manual", action_class="write",
            connector_scopes=("email",), trigger_terms=("send email",),
            requires_approval=True,
        )
        mocks = self._setup_mocks(skills=[dangerous])
        with (
            mocks["profile"], mocks["files"], mocks["memory"], mocks["heartbeat"],
            mocks["skills"], mocks["provider"],
            mocks["generate"], mocks["persist"], mocks["activity"], mocks["audit"], mocks["approval"],
        ):
            result = _run(sage_agent_runtime_service.handle_sage_chat(
                workspace_id="ws-1",
                message="send email with sk-proj-this-should-not-leak",
            ))

            decision_text = str(result["approvals_required"][0]["agent_computer_decision"])
            self.assertNotIn("sk-proj-this-should-not-leak", decision_text)
            self.assertNotIn("sk-", decision_text)

    def test_approval_token_is_chat_surface_only(self):
        from server_modules.skill_registry import SkillDefinition

        dangerous = SkillDefinition(
            id="email-access", label="Email Access", description="Send email",
            permission_label="email", execution_mode="manual", action_class="write",
            connector_scopes=("email",), trigger_terms=("send email",),
            requires_approval=True,
        )
        mocks = self._setup_mocks(skills=[dangerous])
        with (
            mocks["profile"], mocks["files"], mocks["memory"], mocks["heartbeat"],
            mocks["skills"], mocks["provider"], mocks["generate"], mocks["persist"],
            mocks["activity"], mocks["audit"], mocks["approval"],
        ):
            chat_result = _run(
                sage_agent_runtime_service.handle_sage_chat(
                    workspace_id="ws-1",
                    message="send email now",
                    surface="chat",
                )
            )
            mobile_result = _run(
                sage_agent_runtime_service.handle_sage_chat(
                    workspace_id="ws-1",
                    message="send email now",
                    surface="mobile",
                )
            )

            self.assertTrue(any(a.get("approval_token") for a in chat_result["approvals_required"]))
            self.assertTrue(all("approval_token" not in a for a in mobile_result["approvals_required"]))


class SageAgentRuntimePersistenceTests(unittest.TestCase):
    def test_persist_interaction_called(self):
        with (
            patch("server_modules.sage_agent_runtime_service.sage_profile_service.list_sage_profile") as mock_profile,
            patch("server_modules.sage_agent_runtime_service.workspace_context.read_workspace_context_files") as mock_files,
            patch("server_modules.sage_agent_runtime_service.sage_memory_service.build_sage_memory_context_block") as mock_mem,
            patch("server_modules.sage_agent_runtime_service.sage_heartbeat_service.build_sage_heartbeat_snapshot", new=AsyncMock(return_value={})),
            patch("server_modules.sage_agent_runtime_service.list_skill_definitions", return_value=[]),
            patch("server_modules.sage_agent_runtime_service._resolve_cloud_provider") as mock_provider,
            patch("server_modules.sage_agent_runtime_service.generate_chat_reply_with_provider_fallback") as mock_generate,
            patch("server_modules.sage_agent_runtime_service.persist_interaction") as mock_persist,
            patch("server_modules.sage_agent_runtime_service.activity_ledger_service.append_activity_event", new=AsyncMock()),
            patch("server_modules.sage_agent_runtime_service.security_audit_service.emit_security_audit_event"),
        ):
            mock_profile.return_value = {"profile": {"user_name": "", "identity_summary": "", "communication_style": "", "recurring_responsibility": "", "standing_rules": []}}
            mock_files.return_value = {}
            mock_mem.return_value = ""
            mock_provider.return_value = ("deepseek", {"api_key": "test-key"})
            mock_generate.return_value = ("Reply", {}, "deepseek", "")

            _run(sage_agent_runtime_service.handle_sage_chat(
                workspace_id="ws-1", message="hello",
            ))

            mock_persist.assert_called_once()
            kwargs = mock_persist.call_args.kwargs
            subject = kwargs["subject"]
            self.assertEqual(subject.surface_kind, "direct_chat")
            self.assertEqual(kwargs["user_message"], "hello")
            self.assertEqual(kwargs["assistant_reply"], "Reply")


class SageAgentRuntimeAuditTests(unittest.TestCase):
    def test_activity_event_emitted(self):
        with (
            patch("server_modules.sage_agent_runtime_service.sage_profile_service.list_sage_profile") as mock_profile,
            patch("server_modules.sage_agent_runtime_service.workspace_context.read_workspace_context_files") as mock_files,
            patch("server_modules.sage_agent_runtime_service.sage_memory_service.build_sage_memory_context_block") as mock_mem,
            patch("server_modules.sage_agent_runtime_service.sage_heartbeat_service.build_sage_heartbeat_snapshot", new=AsyncMock(return_value={})),
            patch("server_modules.sage_agent_runtime_service.list_skill_definitions", return_value=[]),
            patch("server_modules.sage_agent_runtime_service._resolve_cloud_provider") as mock_provider,
            patch("server_modules.sage_agent_runtime_service.generate_chat_reply_with_provider_fallback") as mock_generate,
            patch("server_modules.sage_agent_runtime_service.persist_interaction"),
            patch("server_modules.sage_agent_runtime_service.activity_ledger_service.append_activity_event", new=AsyncMock()) as mock_activity,
            patch("server_modules.sage_agent_runtime_service.security_audit_service.emit_security_audit_event"),
        ):
            mock_profile.return_value = {"profile": {"user_name": "", "identity_summary": "", "communication_style": "", "recurring_responsibility": "", "standing_rules": []}}
            mock_files.return_value = {}
            mock_mem.return_value = ""
            mock_provider.return_value = ("deepseek", {"api_key": "test-key"})
            mock_generate.return_value = ("Reply", {}, "deepseek", "")

            _run(sage_agent_runtime_service.handle_sage_chat(
                workspace_id="ws-1", tenant_id="t-1", message="hello",
                current_user={"user_id": "u-1"},
            ))

            sage_activity_calls = [
                call
                for call in mock_activity.await_args_list
                if call.kwargs.get("event_class") == "sage_activity"
                and call.kwargs.get("action") == "sage_chat.completed"
            ]
            self.assertEqual(len(sage_activity_calls), 1)
            kwargs = sage_activity_calls[0].kwargs
            self.assertEqual(kwargs["event_class"], "sage_activity")
            self.assertEqual(kwargs["action"], "sage_chat.completed")
            self.assertEqual(kwargs["workspace_id"], "ws-1")
            self.assertEqual(kwargs["tenant_id"], "t-1")

    def test_security_audit_event_emitted(self):
        with (
            patch("server_modules.sage_agent_runtime_service.sage_profile_service.list_sage_profile") as mock_profile,
            patch("server_modules.sage_agent_runtime_service.workspace_context.read_workspace_context_files") as mock_files,
            patch("server_modules.sage_agent_runtime_service.sage_memory_service.build_sage_memory_context_block") as mock_mem,
            patch("server_modules.sage_agent_runtime_service.sage_heartbeat_service.build_sage_heartbeat_snapshot", new=AsyncMock(return_value={})),
            patch("server_modules.sage_agent_runtime_service.list_skill_definitions", return_value=[]),
            patch("server_modules.sage_agent_runtime_service._resolve_cloud_provider") as mock_provider,
            patch("server_modules.sage_agent_runtime_service.generate_chat_reply_with_provider_fallback") as mock_generate,
            patch("server_modules.sage_agent_runtime_service.persist_interaction"),
            patch("server_modules.sage_agent_runtime_service.activity_ledger_service.append_activity_event", new=AsyncMock()),
            patch("server_modules.sage_agent_runtime_service.security_audit_service.emit_security_audit_event") as mock_audit,
        ):
            mock_profile.return_value = {"profile": {"user_name": "", "identity_summary": "", "communication_style": "", "recurring_responsibility": "", "standing_rules": []}}
            mock_files.return_value = {}
            mock_mem.return_value = ""
            mock_provider.return_value = ("deepseek", {"api_key": "test-key"})
            mock_generate.return_value = ("Reply", {}, "deepseek", "")

            _run(sage_agent_runtime_service.handle_sage_chat(
                workspace_id="ws-1", tenant_id="t-1", message="hello",
                current_user={"user_id": "u-1", "email": "test@test.com"},
            ))

            self.assertTrue(mock_audit.called)
            audit_calls = [c for c in mock_audit.call_args_list
                           if c.kwargs.get("action") == "sage_chat.completed"]
            self.assertEqual(len(audit_calls), 1)
            self.assertEqual(audit_calls[0].kwargs["status"], "success")

    def test_audit_event_for_blocked_tool(self):
        from server_modules.skill_registry import SkillDefinition

        dangerous = SkillDefinition(
            id="email-access", label="Email", description="Send",
            permission_label="email", execution_mode="manual", action_class="write",
            connector_scopes=("email",), trigger_terms=("send email",),
            requires_approval=True,
        )
        with (
            patch("server_modules.sage_agent_runtime_service.sage_profile_service.list_sage_profile") as mock_profile,
            patch("server_modules.sage_agent_runtime_service.workspace_context.read_workspace_context_files") as mock_files,
            patch("server_modules.sage_agent_runtime_service.sage_memory_service.build_sage_memory_context_block") as mock_mem,
            patch("server_modules.sage_agent_runtime_service.sage_heartbeat_service.build_sage_heartbeat_snapshot", new=AsyncMock(return_value={})),
            patch("server_modules.sage_agent_runtime_service.list_skill_definitions", return_value=[dangerous]),
            patch("server_modules.sage_agent_runtime_service._resolve_cloud_provider") as mock_provider,
            patch("server_modules.sage_agent_runtime_service.generate_chat_reply_with_provider_fallback") as mock_generate,
            patch("server_modules.sage_agent_runtime_service.persist_interaction"),
            patch("server_modules.sage_agent_runtime_service.activity_ledger_service.append_activity_event", new=AsyncMock()),
            patch("server_modules.sage_agent_runtime_service.security_audit_service.emit_security_audit_event") as mock_audit,
        ):
            mock_profile.return_value = {"profile": {"user_name": "", "identity_summary": "", "communication_style": "", "recurring_responsibility": "", "standing_rules": []}}
            mock_files.return_value = {}
            mock_mem.return_value = ""
            mock_provider.return_value = ("deepseek", {"api_key": "test-key"})
            mock_generate.return_value = ("Reply", {}, "deepseek", "")

            _run(sage_agent_runtime_service.handle_sage_chat(
                workspace_id="ws-1", message="send email now",
            ))

            blocked_calls = [c for c in mock_audit.call_args_list
                             if c.kwargs.get("action") == "sage_chat.tool_blocked"]
            self.assertEqual(len(blocked_calls), 1)
            self.assertEqual(blocked_calls[0].kwargs["status"], "blocked")


class SageAgentRuntimeResultShapeTests(unittest.TestCase):
    def test_returns_full_contract(self):
        with (
            patch("server_modules.sage_agent_runtime_service.sage_profile_service.list_sage_profile") as mock_profile,
            patch("server_modules.sage_agent_runtime_service.workspace_context.read_workspace_context_files") as mock_files,
            patch("server_modules.sage_agent_runtime_service.sage_memory_service.build_sage_memory_context_block") as mock_mem,
            patch("server_modules.sage_agent_runtime_service.sage_heartbeat_service.build_sage_heartbeat_snapshot", new=AsyncMock(return_value={})),
            patch("server_modules.sage_agent_runtime_service.list_skill_definitions", return_value=[]),
            patch("server_modules.sage_agent_runtime_service._resolve_cloud_provider") as mock_provider,
            patch("server_modules.sage_agent_runtime_service.generate_chat_reply_with_provider_fallback") as mock_generate,
            patch("server_modules.sage_agent_runtime_service.persist_interaction"),
            patch("server_modules.sage_agent_runtime_service.activity_ledger_service.append_activity_event", new=AsyncMock()),
            patch("server_modules.sage_agent_runtime_service.security_audit_service.emit_security_audit_event"),
        ):
            mock_profile.return_value = {"profile": {"user_name": "", "identity_summary": "", "communication_style": "", "recurring_responsibility": "", "standing_rules": []}}
            mock_files.return_value = {}
            mock_mem.return_value = ""
            mock_provider.return_value = ("openai", {"api_key": "test-key"})
            mock_generate.return_value = ("Hello there", {"model": "gpt-4o"}, "openai", "")

            result = _run(sage_agent_runtime_service.handle_sage_chat(
                workspace_id="ws-1", message="hi",
            ))

            self.assertEqual(result["message"], "Hello there")
            self.assertIsNone(result["error"])
            self.assertIsInstance(result["used_context"], list)
            self.assertIsInstance(result["tool_calls"], list)
            self.assertIsInstance(result["available_tools"], list)
            self.assertIsInstance(result["blocked_tools"], list)
            self.assertIsInstance(result["approvals_required"], list)
            self.assertIsInstance(result["memory_updates"], list)
            self.assertIsNotNone(result["trace_id"])
            self.assertEqual(result["provider"], "openai")
            self.assertEqual(result["model"], "gpt-4o")

    def test_raises_on_provider_error(self):
        with (
            patch("server_modules.sage_agent_runtime_service.sage_profile_service.list_sage_profile") as mock_profile,
            patch("server_modules.sage_agent_runtime_service.workspace_context.read_workspace_context_files") as mock_files,
            patch("server_modules.sage_agent_runtime_service.sage_memory_service.build_sage_memory_context_block") as mock_mem,
            patch("server_modules.sage_agent_runtime_service.sage_heartbeat_service.build_sage_heartbeat_snapshot", new=AsyncMock(return_value={})),
            patch("server_modules.sage_agent_runtime_service.list_skill_definitions", return_value=[]),
            patch("server_modules.sage_agent_runtime_service._resolve_cloud_provider") as mock_provider,
            patch("server_modules.sage_agent_runtime_service.generate_chat_reply_with_provider_fallback") as mock_generate,
            patch("server_modules.sage_agent_runtime_service.persist_interaction"),
            patch("server_modules.sage_agent_runtime_service.activity_ledger_service.append_activity_event", new=AsyncMock()),
            patch("server_modules.sage_agent_runtime_service.security_audit_service.emit_security_audit_event"),
        ):
            mock_profile.return_value = {"profile": {"user_name": "", "identity_summary": "", "communication_style": "", "recurring_responsibility": "", "standing_rules": []}}
            mock_files.return_value = {}
            mock_mem.return_value = ""
            mock_provider.return_value = ("openai", {"api_key": "test-key"})
            mock_generate.return_value = ("", {}, "", "All providers failed")

            with self.assertRaises(RuntimeError):
                _run(sage_agent_runtime_service.handle_sage_chat(
                    workspace_id="ws-1", message="hi",
                ))

    def test_failed_turn_emits_failed_audit_with_trace_id(self):
        with (
            patch("server_modules.sage_agent_runtime_service.sage_profile_service.list_sage_profile") as mock_profile,
            patch("server_modules.sage_agent_runtime_service.workspace_context.read_workspace_context_files") as mock_files,
            patch("server_modules.sage_agent_runtime_service.sage_memory_service.build_sage_memory_context_block") as mock_mem,
            patch("server_modules.sage_agent_runtime_service.sage_heartbeat_service.build_sage_heartbeat_snapshot", new=AsyncMock(return_value={})),
            patch("server_modules.sage_agent_runtime_service.list_skill_definitions", return_value=[]),
            patch("server_modules.sage_agent_runtime_service._resolve_cloud_provider") as mock_provider,
            patch("server_modules.sage_agent_runtime_service.generate_chat_reply_with_provider_fallback", side_effect=RuntimeError("provider crashed")),
            patch("server_modules.sage_agent_runtime_service.persist_interaction"),
            patch("server_modules.sage_agent_runtime_service.activity_ledger_service.append_activity_event", new=AsyncMock()),
            patch("server_modules.sage_agent_runtime_service.security_audit_service.emit_security_audit_event") as mock_audit,
        ):
            mock_profile.return_value = {"profile": {"user_name": "", "identity_summary": "", "communication_style": "", "recurring_responsibility": "", "standing_rules": []}}
            mock_files.return_value = {}
            mock_mem.return_value = ""
            mock_provider.return_value = ("openai", {"api_key": "test-key"})

            with self.assertRaises(RuntimeError):
                _run(
                    sage_agent_runtime_service.handle_sage_chat(
                        workspace_id="ws-1",
                        tenant_id="t-1",
                        message="hi",
                        current_user={"user_id": "u-1"},
                    )
                )

            failed_calls = [c for c in mock_audit.call_args_list if c.kwargs.get("action") == "sage_chat.failed"]
            self.assertEqual(len(failed_calls), 1)
            self.assertEqual(failed_calls[0].kwargs.get("status"), "failed")
            self.assertTrue(str(failed_calls[0].kwargs.get("trace_id") or "").strip())


if __name__ == "__main__":
    unittest.main()
