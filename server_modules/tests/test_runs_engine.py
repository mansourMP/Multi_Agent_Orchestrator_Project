import queue
import unittest
from unittest.mock import patch

from server_modules import runs_engine


class RunsEngineFailoverTests(unittest.TestCase):
    @patch("server_modules.runs_core.emit_log")
    @patch("server_modules.runs_engine._mark_profile_failure")
    @patch("server_modules.runs_engine._mark_profile_success")
    @patch("server_modules.runs_engine.resolve_provider_adapter")
    def test_openai_rate_limit_falls_back_to_lower_model(
        self,
        resolve_provider_adapter_mock,
        mark_profile_success_mock,
        mark_profile_failure_mock,
        emit_log_mock,
    ):
        class _FakeAdapter:
            def __init__(self):
                self.calls = []

            def generate(self, system_prompt, user_input, model, credentials):
                self.calls.append(model)
                if model == "gpt-4.1":
                    raise RuntimeError("Rate limit reached for 'gpt-4.1'. Try again shortly or switch models.")
                return "READY"

        adapter = _FakeAdapter()
        resolve_provider_adapter_mock.return_value = ("openai", "openai", adapter)

        state = {
            "provider": "openai",
            "selected_model": "gpt-4.1",
            "credential_candidates": [
                {
                    "credentials": {"access_token": "token"},
                    "profile_id": "profile-1",
                    "source": "env",
                }
            ],
        }

        result = runs_engine.generate_with_candidate_failover(
            state,
            {},
            queue.Queue(),
            "system",
            "user",
        )

        self.assertEqual(result, "READY")
        self.assertEqual(adapter.calls[:2], ["gpt-4.1", "gpt-4o-mini"])
        self.assertEqual(state["active_model"], "gpt-4o-mini")
        mark_profile_success_mock.assert_called_once_with("profile-1")
        mark_profile_failure_mock.assert_not_called()
        self.assertTrue(any(call.kwargs.get("event") == "profile_model_retry" for call in emit_log_mock.mock_calls))
        self.assertTrue(any(call.kwargs.get("event") == "profile_model_fallback" for call in emit_log_mock.mock_calls))

    @patch("server_modules.runs_core.emit_log")
    @patch("server_modules.runs_engine._mark_profile_failure")
    @patch("server_modules.runs_engine._mark_profile_success")
    @patch("server_modules.runs_engine.resolve_provider_adapter")
    def test_non_rate_limit_error_still_fails_candidate(
        self,
        resolve_provider_adapter_mock,
        mark_profile_success_mock,
        mark_profile_failure_mock,
        emit_log_mock,
    ):
        class _FakeAdapter:
            def generate(self, system_prompt, user_input, model, credentials):
                raise RuntimeError("Invalid API key.")

        resolve_provider_adapter_mock.return_value = ("openai", "openai", _FakeAdapter())

        state = {
            "provider": "openai",
            "selected_model": "gpt-4.1",
            "credential_candidates": [
                {
                    "credentials": {"access_token": "token"},
                    "profile_id": "profile-1",
                    "source": "env",
                }
            ],
        }

        with self.assertRaises(RuntimeError):
            runs_engine.generate_with_candidate_failover(
                state,
                {},
                queue.Queue(),
                "system",
                "user",
            )

        mark_profile_success_mock.assert_not_called()
        mark_profile_failure_mock.assert_called_once()
        self.assertFalse(any(call.kwargs.get("event") == "profile_model_retry" for call in emit_log_mock.mock_calls))


if __name__ == "__main__":
    unittest.main()
