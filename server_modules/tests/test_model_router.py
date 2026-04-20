import unittest
from unittest.mock import patch

from server_modules import model_router


class ModelRouterTests(unittest.TestCase):
    def test_resolve_model_aliases(self):
        self.assertEqual(model_router.resolve_model("claude-sonnet"), "anthropic/claude-3-7-sonnet-latest")
        self.assertEqual(model_router.resolve_model("gemini-flash"), "gemini/gemini-2.5-flash")
        self.assertEqual(model_router.resolve_model("gemini-pro"), "gemini/gemini-2.5-pro")
        self.assertEqual(model_router.resolve_model("gpt-4o-mini"), "gpt-4o-mini")
        self.assertEqual(model_router.resolve_model("vertex-gemini-pro"), "vertex_ai/gemini-1.5-pro")
        self.assertEqual(model_router.resolve_model("gemini-1.5-pro", provider="vertex"), "vertex_ai/gemini-1.5-pro")
        self.assertEqual(model_router.resolve_model("deepseek-chat", provider="deepseek"), "deepseek-chat")
        self.assertEqual(model_router.resolve_model("qwen-plus", provider="qwen"), "qwen-plus")
        self.assertEqual(model_router.resolve_model("mistral-large-latest", provider="mistral"), "mistral-large-latest")
        self.assertEqual(model_router.resolve_model("llama3.2", provider="ollama"), "llama3.2")

    def test_infer_provider_supports_openai_compatible_and_local_catalogs(self):
        self.assertEqual(model_router.infer_provider("deepseek-chat"), "deepseek")
        self.assertEqual(model_router.infer_provider("deepseek-reasoner"), "deepseek")
        self.assertEqual(model_router.infer_provider("qwen-plus"), "qwen")
        self.assertEqual(model_router.infer_provider("mistral-large-latest"), "mistral")
        self.assertEqual(model_router.infer_provider("llama3.2"), "ollama")

    def test_normalize_messages_filters_invalid_shapes(self):
        messages = model_router.normalize_messages(
            [
                {"role": "system", "content": "sys"},
                {"role": "invalid-role", "content": 12},
                "skip-me",
                {"content": None},
            ]
        )
        self.assertEqual(
            messages,
            [
                {"role": "system", "content": "sys"},
                {"role": "user", "content": "12"},
                {"role": "user", "content": ""},
            ],
        )

    def test_list_model_aliases_exposes_defaults_and_providers(self):
        models = model_router.list_model_aliases()
        by_alias = {item["alias"]: item for item in models}

        self.assertIn("gpt-4o-mini", by_alias)
        self.assertIn("claude-sonnet", by_alias)
        self.assertIn("gemini-flash", by_alias)
        self.assertIn("vertex-gemini-pro", by_alias)

        self.assertEqual(by_alias["gpt-4o-mini"]["provider"], "openai")
        self.assertEqual(by_alias["claude-sonnet"]["provider"], "anthropic")
        self.assertEqual(by_alias["gemini-flash"]["provider"], "gemini")
        self.assertEqual(by_alias["vertex-gemini-pro"]["provider"], "vertex")

        self.assertTrue(by_alias["gpt-4o"]["is_global_default"])
        self.assertFalse(by_alias["gpt-4o-mini"]["is_global_default"])
        self.assertTrue(by_alias["claude-sonnet"]["is_provider_default"])
        self.assertTrue(by_alias["gemini-flash"]["is_provider_default"])
        self.assertTrue(by_alias["vertex-gemini-pro"]["is_provider_default"])
        self.assertFalse(by_alias["gemini-flash"]["is_global_default"])

    @patch("server_modules.model_router.http_json_request")
    def test_call_model_sync_returns_normalized_shape(self, http_json_request_mock):
        http_json_request_mock.return_value = {
            "status": 200,
            "json": {
                "choices": [{"message": {"content": "hello"}}],
                "usage": {"prompt_tokens": 3, "completion_tokens": 5, "total_tokens": 8},
            },
            "text": "",
            "headers": {},
        }

        result = model_router.call_model_sync(
            messages=[{"role": "user", "content": "Say hello"}],
            model="gpt-4o-mini",
            provider="openai",
            credentials={"api_key": "test-key"},
            max_tokens=100,
            temperature=0.2,
        )

        self.assertEqual(result["content"], "hello")
        self.assertEqual(result["provider"], "openai")
        self.assertEqual(result["model"], "gpt-4o-mini")
        self.assertEqual(
            result["usage"],
            {"prompt_tokens": 3, "completion_tokens": 5, "total_tokens": 8},
        )
        _, kwargs = http_json_request_mock.call_args
        self.assertEqual(kwargs["payload"]["model"], "gpt-4o-mini")
        self.assertEqual(kwargs["payload"]["messages"], [{"role": "user", "content": "Say hello"}])
        self.assertEqual(kwargs["headers"]["Authorization"], "Bearer test-key")

    @patch("server_modules.model_router.resolve_provider_adapter")
    def test_vertex_current_credential_shape_uses_compatibility_fallback(self, resolve_provider_adapter_mock):
        class _FakeAdapter:
            def generate(self, system_prompt, user_input, model, credentials):
                self.last_call = {
                    "system_prompt": system_prompt,
                    "user_input": user_input,
                    "model": model,
                    "credentials": credentials,
                }
                return "vertex-ok"

        adapter = _FakeAdapter()
        resolve_provider_adapter_mock.return_value = ("vertex", "vertex", adapter)

        result = model_router.call_model_sync(
            messages=[
                {"role": "system", "content": "system prompt"},
                {"role": "user", "content": "user prompt"},
            ],
            model="gemini-1.5-pro",
            provider="vertex",
            credentials={"access_token": "token", "project_id": "proj", "location": "us-central1"},
        )

        self.assertEqual(result["content"], "vertex-ok")
        self.assertEqual(result["provider"], "vertex")
        self.assertEqual(result["model"], "vertex_ai/gemini-1.5-pro")
        self.assertEqual(result["usage"]["total_tokens"], 0)
        self.assertEqual(adapter.last_call["system_prompt"], "system prompt")
        self.assertEqual(adapter.last_call["user_input"], "user prompt")
        self.assertEqual(adapter.last_call["model"], "gemini-1.5-pro")


if __name__ == "__main__":
    unittest.main()
