import unittest

from server_modules import downstream_resilience_service as resilience


class DownstreamResilienceServiceTests(unittest.TestCase):
    def setUp(self) -> None:
        resilience.reset_circuits_for_tests()

    def test_call_with_retries_retries_then_succeeds(self) -> None:
        calls = {"count": 0}

        def operation() -> str:
            calls["count"] += 1
            if calls["count"] == 1:
                raise RuntimeError("temporary")
            return "ok"

        result = resilience.call_with_retries(
            name="test",
            operation=operation,
            retry_policy=resilience.RetryPolicy(attempts=2, initial_delay_seconds=0),
        )

        self.assertEqual(result, "ok")
        self.assertEqual(calls["count"], 2)

    def test_circuit_opens_after_threshold(self) -> None:
        def operation() -> str:
            raise RuntimeError("down")

        policy = resilience.CircuitBreakerPolicy(failure_threshold=1, reset_after_seconds=60)
        with self.assertRaises(RuntimeError):
            resilience.call_with_retries(
                name="test-open",
                operation=operation,
                retry_policy=resilience.RetryPolicy(attempts=1, initial_delay_seconds=0),
                circuit_policy=policy,
            )
        with self.assertRaises(resilience.DownstreamCircuitOpenError):
            resilience.call_with_retries(
                name="test-open",
                operation=lambda: "never",
                retry_policy=resilience.RetryPolicy(attempts=1, initial_delay_seconds=0),
                circuit_policy=policy,
            )


if __name__ == "__main__":
    unittest.main()
