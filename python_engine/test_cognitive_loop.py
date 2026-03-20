import unittest
import os
from unittest.mock import patch

from cognitive_loop import CognitiveLoop


class FakeMemory:
    def __init__(self):
        self.upserts = []
        self.search_queries = []
        self._counter = 0

    def upsert_memory(self, text, metadata=None):
        self._counter += 1
        self.upserts.append({"id": f"m{self._counter}", "text": text, "metadata": metadata or {}})
        return f"m{self._counter}"

    def search_memory(self, query, k=5):
        self.search_queries.append({"query": query, "k": k})
        return [{"id": "ctx-1", "text": "prior memory", "metadata": {"source": "unit_test"}}]


class TestCognitiveLoop(unittest.TestCase):
    def setUp(self):
        self._env_patcher = patch.dict(os.environ, {"ORION_COGNITIVE_RUN_MODE": "plan"}, clear=False)
        self._env_patcher.start()

    def tearDown(self):
        self._env_patcher.stop()

    def test_tick_run_goal_default(self):
        memory = FakeMemory()
        loop = CognitiveLoop(memory=memory, niche_id="astronomy", execution_id="exec-test")

        out = loop.tick({"text": "Create a launch checklist", "source": "telegram"})

        self.assertEqual(out["decision"]["action"], "run_goal")
        self.assertEqual(out["result"]["status"], "planned")
        self.assertEqual(out["result"]["goal"], "Create a launch checklist")
        self.assertIn("plan", out)
        self.assertIn("verification", out)
        self.assertIn("reflection", out)
        self.assertTrue(out["verification"]["passed"])
        self.assertGreaterEqual(len(memory.upserts), 4)
        self.assertEqual(memory.search_queries[0]["query"], "Create a launch checklist")
        sources = [entry["metadata"].get("source") for entry in memory.upserts]
        self.assertIn("cognitive.reflect", sources)

    def test_tick_run_goal_runtime_path_records_run_id(self):
        memory = FakeMemory()
        with patch.dict(
            os.environ,
            {
                "ORION_COGNITIVE_RUN_MODE": "runtime",
                "ORION_API_KEY": "test-key",
                "ORION_API_URL": "http://127.0.0.1:8001",
            },
            clear=False,
        ):
            loop = CognitiveLoop(memory=memory, niche_id="astronomy", execution_id="exec-test")

            loop._start_runtime_run = lambda goal, config: {  # type: ignore[method-assign]
                "run_id": "run-123",
                "route": {"selected": "local_companion"},
            }
            loop._wait_for_runtime_run = lambda run_id, config: {  # type: ignore[method-assign]
                "run_id": run_id,
                "status": "completed",
                "result": "ok",
                "result_data": {"summary": "done"},
            }

            out = loop.tick({"text": "/orion run validate this", "source": "api"})
            self.assertEqual(out["result"]["status"], "completed")
            self.assertEqual(out["result"]["run_id"], "run-123")
            self.assertEqual(out["result"]["runtime_status"], "completed")
            self.assertTrue(out["verification"]["passed"])

    def test_tick_status_command(self):
        memory = FakeMemory()
        loop = CognitiveLoop(memory=memory)

        out = loop.tick("/orion status")

        self.assertEqual(out["decision"]["action"], "status_summary")
        self.assertEqual(out["result"]["status"], "ok")

    def test_run_status_goal_uses_status_fast_path(self):
        memory = FakeMemory()
        loop = CognitiveLoop(memory=memory)

        out = loop.tick("/orion run status")

        self.assertEqual(out["decision"]["action"], "status_summary")
        self.assertEqual(out["result"]["status"], "ok")

    def test_operator_exec_blocked_when_disabled(self):
        memory = FakeMemory()
        with patch.dict(
            os.environ,
            {
                "ORION_COGNITIVE_OPERATOR_ENABLED": "0",
            },
            clear=False,
        ):
            loop = CognitiveLoop(memory=memory)
            out = loop.tick("/orion exec pwd")
            self.assertEqual(out["decision"]["action"], "operator_exec")
            self.assertEqual(out["result"]["status"], "blocked")
            self.assertEqual(out["result"]["next_action"], "enable_operator_mode")
            self.assertIn("operator_mode_disabled", out["result"]["risk_flags"])

    def test_operator_exec_prefers_capability_payload_for_known_runtime_commands(self):
        memory = FakeMemory()
        loop = CognitiveLoop(memory=memory)
        expected_script = os.path.abspath(
            os.path.join(os.path.dirname(__file__), "..", "scripts", "status_empyralis_local_stack.sh")
        )

        out = loop.tick("/orion exec bash scripts/status_orion_local_stack.sh")

        self.assertEqual(out["decision"]["action"], "operator_exec")
        self.assertEqual(out["decision"]["payload"].get("capability"), "stack.status")
        self.assertEqual(
            out["decision"]["payload"].get("argv"),
            ["bash", expected_script],
        )
        self.assertNotIn("command", out["decision"]["payload"])

    def test_operator_exec_runs_when_enabled(self):
        memory = FakeMemory()
        with patch.dict(
            os.environ,
            {
                "ORION_COGNITIVE_OPERATOR_ENABLED": "1",
                "ORION_COGNITIVE_OPERATOR_ALLOW_PREFIXES": "pwd",
                "ORION_COGNITIVE_OPERATOR_TIMEOUT_SECONDS": "10",
            },
            clear=False,
        ):
            loop = CognitiveLoop(memory=memory)
            out = loop.tick("/orion exec pwd")
            self.assertEqual(out["decision"]["action"], "operator_exec")
            self.assertEqual(out["result"]["status"], "done")
            self.assertEqual(out["result"]["final_status"], "done")
            self.assertEqual(out["result"]["command"], "pwd")
            self.assertTrue("stdout_excerpt" in out["result"])

    def test_operator_exec_strict_requires_approval_for_medium_risk(self):
        memory = FakeMemory()
        with patch.dict(
            os.environ,
            {
                "ORION_COGNITIVE_OPERATOR_ENABLED": "1",
                "ORION_COGNITIVE_OPERATOR_ALLOW_PREFIXES": "git diff",
                "ORION_COGNITIVE_OPERATOR_TRUST_MODE": "strict",
            },
            clear=False,
        ):
            loop = CognitiveLoop(memory=memory)
            out = loop.tick("/orion exec git diff")
            self.assertEqual(out["decision"]["action"], "operator_exec")
            self.assertEqual(out["result"]["status"], "waiting_for_input")
            self.assertEqual(out["result"]["final_status"], "waiting_for_input")
            self.assertEqual(out["result"]["trust_mode"], "strict")
            self.assertEqual(out["result"]["risk_level"], "medium")
            self.assertEqual(out["result"]["next_action"], "resolve_approval")
            self.assertIn("approval_required", out["result"]["risk_flags"])
            self.assertIn("risk_medium", out["result"]["risk_flags"])

    def test_operator_exec_event_metadata_overrides_trust_mode(self):
        memory = FakeMemory()
        with patch.dict(
            os.environ,
            {
                "ORION_COGNITIVE_OPERATOR_ENABLED": "1",
                "ORION_COGNITIVE_OPERATOR_ALLOW_PREFIXES": "git diff",
                "ORION_COGNITIVE_OPERATOR_TRUST_MODE": "auto",
            },
            clear=False,
        ):
            loop = CognitiveLoop(memory=memory)
            out = loop.tick(
                {
                    "text": "/orion exec git diff",
                    "source": "telegram",
                    "metadata": {"trust_mode": "strict"},
                }
            )
            self.assertEqual(out["decision"]["payload"]["trust_mode"], "strict")
            self.assertEqual(out["result"]["status"], "waiting_for_input")
            self.assertEqual(out["result"]["trust_mode"], "strict")
            self.assertEqual(out["result"]["risk_level"], "medium")

    def test_operator_policy_command_returns_contract(self):
        memory = FakeMemory()
        with patch.dict(
            os.environ,
            {
                "ORION_COGNITIVE_OPERATOR_ENABLED": "1",
                "ORION_COGNITIVE_OPERATOR_ALLOW_PREFIXES": "pwd,git diff",
                "ORION_COGNITIVE_OPERATOR_TRUST_MODE": "strict",
            },
            clear=False,
        ):
            loop = CognitiveLoop(memory=memory)
            out = loop.tick("/orion exec policy")
            self.assertEqual(out["decision"]["action"], "operator_policy")
            self.assertEqual(out["result"]["status"], "ok")
            policy = out["result"].get("policy") or {}
            self.assertEqual(policy.get("trust_mode"), "strict")
            self.assertEqual(policy.get("approval_levels"), ["medium", "high"])
            self.assertEqual(policy.get("enabled"), True)
            self.assertIn("pwd", policy.get("allow_prefixes") or [])

    def test_operator_exec_strict_approval_all_requires_approval_for_low_risk(self):
        memory = FakeMemory()
        with patch.dict(
            os.environ,
            {
                "ORION_COGNITIVE_OPERATOR_ENABLED": "1",
                "ORION_COGNITIVE_OPERATOR_ALLOW_PREFIXES": "pwd",
                "ORION_COGNITIVE_OPERATOR_TRUST_MODE": "strict",
                "ORION_COGNITIVE_OPERATOR_STRICT_APPROVAL_ALL": "1",
            },
            clear=False,
        ):
            loop = CognitiveLoop(memory=memory)
            out = loop.tick("/orion exec pwd")
            self.assertEqual(out["decision"]["action"], "operator_exec")
            self.assertEqual(out["result"]["status"], "waiting_for_input")
            self.assertEqual(out["result"]["risk_level"], "low")
            self.assertEqual(out["result"]["approval_levels"], ["low", "medium", "high"])
            self.assertIn("approval_required", out["result"]["risk_flags"])
            policy = out["result"].get("policy") or {}
            self.assertEqual(policy.get("approval_levels"), ["low", "medium", "high"])

    def test_operator_exec_disabled_precedence_over_approval_gate(self):
        memory = FakeMemory()
        with patch.dict(
            os.environ,
            {
                "ORION_COGNITIVE_OPERATOR_ENABLED": "0",
                "ORION_COGNITIVE_OPERATOR_ALLOW_PREFIXES": "git diff",
                "ORION_COGNITIVE_OPERATOR_TRUST_MODE": "strict",
            },
            clear=False,
        ):
            loop = CognitiveLoop(memory=memory)
            out = loop.tick("/orion exec git diff")
            self.assertEqual(out["decision"]["action"], "operator_exec")
            self.assertEqual(out["result"]["status"], "blocked")
            self.assertEqual(out["result"]["next_action"], "enable_operator_mode")
            self.assertIn("operator_mode_disabled", out["result"]["risk_flags"])

    def test_operator_exec_approved_metadata_bypasses_gate(self):
        memory = FakeMemory()
        with patch.dict(
            os.environ,
            {
                "ORION_COGNITIVE_OPERATOR_ENABLED": "1",
                "ORION_COGNITIVE_OPERATOR_ALLOW_PREFIXES": "git diff",
                "ORION_COGNITIVE_OPERATOR_TRUST_MODE": "strict",
            },
            clear=False,
        ):
            loop = CognitiveLoop(memory=memory)
            out = loop.tick(
                {
                    "text": "/orion exec git diff",
                    "source": "api",
                    "metadata": {"approval_granted": True},
                }
            )
            self.assertEqual(out["decision"]["payload"]["approval_granted"], True)
            self.assertEqual(out["result"]["status"], "done")
            self.assertEqual(out["result"]["final_status"], "done")

    def test_custom_decider_actor(self):
        memory = FakeMemory()

        def custom_decider(oriented):
            return {"action": "custom_action", "payload": {"ok": True}, "rationale": "unit-test"}

        def custom_actor(decision):
            return {"status": "done", "action": decision["action"], "handled": True}

        loop = CognitiveLoop(memory=memory, decider=custom_decider, actor=custom_actor)
        out = loop.tick({"text": "anything"})

        self.assertEqual(out["decision"]["action"], "custom_action")
        self.assertEqual(out["result"]["status"], "done")
        self.assertTrue(out["result"]["handled"])

    def test_observe_validation(self):
        loop = CognitiveLoop(memory=FakeMemory())
        with self.assertRaises(ValueError):
            loop.observe({"source": "cli"})
        with self.assertRaises(ValueError):
            loop.observe(123)


if __name__ == "__main__":
    unittest.main()
