import importlib
import unittest
from unittest.mock import AsyncMock, patch

from server_modules import direct_chat_hosted_usage_service


class DirectChatHostedUsageServiceTests(unittest.TestCase):
    def setUp(self) -> None:
        global direct_chat_hosted_usage_service
        direct_chat_hosted_usage_service = importlib.import_module(
            "server_modules.direct_chat_hosted_usage_service"
        )

    def test_persist_direct_chat_hosted_usage_best_effort_records_platform_runtime_usage(self) -> None:
        with patch(
            "server_modules.direct_chat_hosted_usage_service.control_plane_repository.record_workspace_hosted_ai_monthly_cost_ledger_entry",
            new=AsyncMock(return_value={"id": "shost_1"}),
        ) as record_ledger:
            direct_chat_hosted_usage_service.persist_direct_chat_hosted_usage_best_effort(
                workspace_id="ws-1",
                thread_id="thread-1",
                session_ctx={"tenant_id": "tenant-1", "request_id": "req-1"},
                availability_payload={
                    "credential_plane": "platform_runtime",
                    "platform_runtime_allowed": True,
                },
                usage_masked={
                    "usage_accounting": {
                        "input_tokens": 10,
                        "output_tokens": 6,
                        "total_tokens": 16,
                        "estimated_cost_usd": 0.0011,
                        "effective_provider": "deepseek",
                        "effective_model": "deepseek-chat",
                    }
                },
                requested_provider="deepseek",
                effective_provider="deepseek",
                requested_model="deepseek-chat",
                effective_model="deepseek-chat",
            )

        record_ledger.assert_awaited_once()
        kwargs = record_ledger.await_args.kwargs
        self.assertEqual(kwargs["tenant_id"], "tenant-1")
        self.assertEqual(kwargs["workspace_id"], "ws-1")
        self.assertEqual(kwargs["request_id"], "req-1")
        self.assertEqual(kwargs["thread_id"], "thread-1")
        self.assertEqual(kwargs["provider"], "deepseek")
        self.assertEqual(kwargs["model"], "deepseek-chat")
        self.assertEqual(kwargs["prompt_tokens"], 10)
        self.assertEqual(kwargs["completion_tokens"], 6)
        self.assertEqual(kwargs["total_tokens"], 16)

    def test_persist_direct_chat_hosted_usage_best_effort_ignores_non_platform_runtime(self) -> None:
        with patch(
            "server_modules.direct_chat_hosted_usage_service.control_plane_repository.record_workspace_hosted_ai_monthly_cost_ledger_entry",
            new=AsyncMock(return_value={"id": "shost_1"}),
        ) as record_ledger:
            direct_chat_hosted_usage_service.persist_direct_chat_hosted_usage_best_effort(
                workspace_id="ws-1",
                thread_id="thread-1",
                session_ctx={"tenant_id": "tenant-1", "request_id": "req-1"},
                availability_payload={
                    "credential_plane": "workspace_connection",
                    "platform_runtime_allowed": True,
                },
                usage_masked={
                    "usage_accounting": {
                        "input_tokens": 10,
                        "output_tokens": 6,
                        "total_tokens": 16,
                        "estimated_cost_usd": 0.0011,
                        "effective_provider": "openai",
                        "effective_model": "gpt-4o",
                    }
                },
                requested_provider="openai",
                effective_provider="openai",
                requested_model="gpt-4o",
                effective_model="gpt-4o",
            )

        record_ledger.assert_not_awaited()
