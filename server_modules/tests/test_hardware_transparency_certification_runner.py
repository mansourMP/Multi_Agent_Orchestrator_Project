from __future__ import annotations

import argparse
import importlib.util
from pathlib import Path
import sys
import tempfile
import unittest


SCRIPT_PATH = Path(__file__).resolve().parents[2] / "scripts" / "empyralis_hardware_transparency_certification.py"
SPEC = importlib.util.spec_from_file_location("hardware_certification_runner", SCRIPT_PATH)
cert = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
sys.modules[SPEC.name] = cert
SPEC.loader.exec_module(cert)


class HardwareTransparencyCertificationRunnerTests(unittest.TestCase):
    def test_automated_backend_gate_includes_adapter_contract_tests(self) -> None:
        self.assertIn("server_modules/tests/test_hardware_cloud_computer_adapter.py", cert.BACKEND_TESTS)
        self.assertIn("server_modules/tests/test_hardware_gateway_adapter.py", cert.BACKEND_TESTS)
        self.assertIn("server_modules/tests/test_hardware_self_hosted_node_adapter.py", cert.BACKEND_TESTS)

    def test_agent_computer_suite_is_available_with_phase_tests(self) -> None:
        self.assertIn("agent-computer", cert.VALID_SUITES)
        self.assertIn("server_modules/tests/test_agent_computer_service_script.py", cert.AGENT_COMPUTER_BACKEND_TESTS)
        self.assertIn("server_modules/tests/test_gateway_browser_attach_policy.py", cert.AGENT_COMPUTER_BACKEND_TESTS)
        self.assertIn("dist/__tests__/system-service-mode.test.js", cert.AGENT_COMPUTER_GATEWAY_TESTS)

    def test_gateway_missing_inputs_fail_with_setup_details(self) -> None:
        args = argparse.Namespace(gateway_id="")
        with tempfile.TemporaryDirectory() as tmp:
            steps = cert.gateway_steps(args, Path(tmp))

        self.assertEqual(len(steps), 1)
        self.assertEqual(steps[0].status, "FAIL")
        self.assertIn("--gateway-id", steps[0].details["missing_flags"])
        self.assertEqual(steps[0].details["env_alternatives"]["gateway-id"], "EMPYRALIS_CERT_GATEWAY_ID")

    def test_self_hosted_missing_inputs_fail_with_setup_details(self) -> None:
        args = argparse.Namespace(self_hosted_profile_id="", self_hosted_node_token="", self_hosted_node_id="")
        with tempfile.TemporaryDirectory() as tmp:
            steps = cert.self_hosted_steps(args, Path(tmp))

        self.assertEqual(len(steps), 1)
        self.assertEqual(steps[0].status, "FAIL")
        self.assertIn("--self-hosted-profile-id", steps[0].details["missing_flags"])
        self.assertIn("--self-hosted-node-token", steps[0].details["missing_flags"])

    def test_runtime_session_assertion_enforces_request_correlation(self) -> None:
        with self.assertRaises(cert.CertificationError) as raised:
            cert._assert_runtime_session(
                {
                    "status": "completed",
                    "runtime_session": {
                        "canonical_runtime_target": "user_device_gateway",
                        "request_id": "wrong",
                        "runtime_access_mode": "full_access",
                        "state": "ready",
                    },
                },
                runtime_target="user_device_gateway",
                request_id="expected",
                access_mode="full_access",
                states={"ready"},
            )

        self.assertIn("request_id", str(raised.exception))

    def test_cert_ids_collects_runtime_artifact_and_session_ids(self) -> None:
        ids = cert._cert_ids(
            {
                "trace_id": "trace-1",
                "runtime_session": {
                    "session_id": "hrs-1",
                    "request_id": "req-1",
                    "runtime_node_id": "node-1",
                    "artifacts": ["artifact-1"],
                },
            }
        )

        self.assertEqual(ids["trace_id"], "trace-1")
        self.assertEqual(ids["runtime_session_id"], "hrs-1")
        self.assertEqual(ids["request_id"], "req-1")
        self.assertEqual(ids["runtime_node_id"], "node-1")
        self.assertEqual(ids["artifact_ids"], ["artifact-1"])
