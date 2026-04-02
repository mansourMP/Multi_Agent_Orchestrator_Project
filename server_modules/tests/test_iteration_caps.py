import importlib.util
import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch


ROOT_DIR = Path(__file__).resolve().parents[2]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

OPERATOR_CHAT_PATH = ROOT_DIR / "server_modules" / "operator_chat.py"
WORKER_EXECUTION_PATH = ROOT_DIR / "scripts" / "orion_local_worker_execution.py"


def _load_module(module_name: str, module_path: Path):
    spec = importlib.util.spec_from_file_location(module_name, module_path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    assert spec and spec.loader
    spec.loader.exec_module(module)
    return module


operator_chat = _load_module("iteration_caps_operator_chat_under_test", OPERATOR_CHAT_PATH)
worker_execution = _load_module("iteration_caps_worker_execution_under_test", WORKER_EXECUTION_PATH)


class IterationCapTests(unittest.TestCase):
    def setUp(self) -> None:
        self._workspace_context_patcher = patch(
            "iteration_caps_operator_chat_under_test._direct_chat_workspace_context_text",
            return_value="",
        )
        self._workspace_context_patcher.start()

    def tearDown(self) -> None:
        self._workspace_context_patcher.stop()

    def test_iteration_cap_reads_from_env(self):
        with patch.dict(os.environ, {"ORION_MAX_LOCAL_OPS": "60", "ORION_MAX_CHAT_ITERATIONS": "35"}, clear=False):
            self.assertEqual(worker_execution._resolved_local_operation_limit({}), 60)
            self.assertEqual(operator_chat._resolved_chat_iteration_limit(None), 35)

    def test_iteration_cap_respects_hard_ceiling(self):
        with patch.dict(os.environ, {"ORION_MAX_LOCAL_OPS": "999", "ORION_MAX_CHAT_ITERATIONS": "999"}, clear=False):
            self.assertEqual(worker_execution._resolved_local_operation_limit({}), 200)
            self.assertEqual(worker_execution._resolved_local_operation_limit({"max_iterations": 9999}), 200)
            self.assertEqual(operator_chat._resolved_chat_iteration_limit(9999), 100)

    @patch("iteration_caps_operator_chat_under_test._record_direct_tool_signature", return_value=False)
    @patch("iteration_caps_operator_chat_under_test._execute_single_direct_tool_call", return_value="ok")
    @patch("iteration_caps_operator_chat_under_test.resolve_workspace_tool_capabilities", return_value=[])
    @patch("iteration_caps_operator_chat_under_test._preferred_provider", return_value=("codex_cli", {}))
    @patch("iteration_caps_operator_chat_under_test._supports_direct_message_native_chat", return_value=True)
    @patch("iteration_caps_operator_chat_under_test.generate_chat_reply_stream_with_provider_fallback")
    def test_iteration_cap_emits_clear_message_on_hit(
        self,
        stream_mock,
        _supports,
        _preferred,
        _capabilities,
        _execute_tool,
        _record_signature,
    ):
        stream_mock.side_effect = lambda **kwargs: iter(
            [
                {
                    "type": "result",
                    "reply": "",
                    "usage_masked": {"provider": "codex_cli", "model": "gpt-5.4"},
                    "provider": "codex_cli",
                    "model": "gpt-5.4",
                    "attempted_providers": "codex_cli",
                    "error": "",
                    "tool_calls": [
                        {
                            "name": "web__fetch",
                            "arguments": "{\"url\":\"https://example.com\"}",
                        }
                    ],
                }
            ]
        )

        payload = operator_chat.collect_direct_operator_reply(
            message="Keep going until the task is done.",
            workspace_id="default",
            requested_model="gpt-5.4",
            requested_provider="openai",
            availability={"ai_ready": True},
            max_iterations=2,
        )

        self.assertEqual(payload["error"], "max_tool_iterations_reached:2")
        self.assertIn("Reached maximum steps (2).", payload["reply"])

        with self.assertRaises(RuntimeError) as ctx:
            worker_execution._parse_operations(
                {
                    "operations": [
                        {"tool": "read_write_files", "path": "a.txt"},
                        {"tool": "read_write_files", "path": "b.txt"},
                        {"tool": "read_write_files", "path": "c.txt"},
                    ]
                },
                {"max_iterations": 2},
            )

        self.assertIn("Reached maximum steps (2).", str(ctx.exception))


if __name__ == "__main__":
    unittest.main()
