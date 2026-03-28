import importlib.util
import sys
from pathlib import Path
from unittest import TestCase
from unittest.mock import patch


def _load_module():
    scripts_dir = Path(__file__).resolve().parents[2] / "scripts"
    module_path = scripts_dir / "orion_local_worker.py"
    sys.path.insert(0, str(scripts_dir))
    try:
        spec = importlib.util.spec_from_file_location("test_orion_local_worker_module", module_path)
        module = importlib.util.module_from_spec(spec)
        assert spec and spec.loader
        spec.loader.exec_module(module)
        return module
    finally:
        if sys.path and sys.path[0] == str(scripts_dir):
            sys.path.pop(0)


worker = _load_module()


class LocalWorkerChatFallbackTests(TestCase):
    @patch.object(worker, "generate_chat_reply_with_provider_fallback", return_value=(None, None, "openai,codex_cli", "llm unavailable"))
    def test_fallback_returns_minimal_model_error_message(self, _mock_generate):
        run = {
            "context": {
                "user_goal": "Give me the top 3 priorities for shipping this platform in 2 days.",
                "metadata": {},
            }
        }

        summary, data, usage = worker.build_pack_result(run, "worker-1")

        self.assertIn("I couldn’t get a model reply right now.", summary)
        self.assertIn("llm unavailable", summary)
        self.assertEqual(data["generation"]["mode"], "deterministic_fallback")
        self.assertEqual(usage, None)

    @patch.object(worker, "generate_chat_reply_with_provider_fallback", return_value=(None, None, "openai,codex_cli", "llm unavailable"))
    def test_generic_fallback_no_longer_uses_meta_phrase(self, _mock_generate):
        run = {
            "context": {
                "user_goal": "Tell me what to fix first.",
                "metadata": {},
            }
        }

        summary, _data, _usage = worker.build_pack_result(run, "worker-1")

        self.assertNotIn("I got this:", summary)
        self.assertNotIn("local fallback mode", summary.lower())
        self.assertNotIn("Top 3 priorities", summary)
