from __future__ import annotations

import unittest

from server_modules.kill_switch_gate import (
    KillSwitchBlockedError,
    set_kill_switch,
    clear_kill_switch,
    evaluate_kill_switch,
    assert_not_killed,
    GLOBAL_KILL_KEY,
    AGENT_KILL_PREFIX,
    GATEWAY_KILL_PREFIX,
)


class KillSwitchChannelTests(unittest.TestCase):
    def setUp(self):
        clear_kill_switch(GLOBAL_KILL_KEY)
        clear_kill_switch(f"{AGENT_KILL_PREFIX}a1")
        clear_kill_switch(f"{GATEWAY_KILL_PREFIX}gw1")
        clear_kill_switch(f"{GATEWAY_KILL_PREFIX}gw-test")
        clear_kill_switch(f"{GATEWAY_KILL_PREFIX}gw-channel-test")

    def test_kill_switch_active_blocks_channel_outbound(self):
        """When kill switch is active, channel outbound should raise KillSwitchBlockedError."""
        set_kill_switch(f"{GATEWAY_KILL_PREFIX}gw1")
        with self.assertRaises(KillSwitchBlockedError) as ctx:
            assert_not_killed(gateway_id="gw1")
        self.assertTrue(ctx.exception.decision.blocked)
        self.assertEqual(ctx.exception.decision.reason, "gateway_kill_active")
        self.assertIn("gw1", ctx.exception.decision.detail)

    def test_kill_switch_active_blocks_tool_invoke(self):
        """Kill switch should block tool invoke via gateway kill."""
        set_kill_switch(f"{GATEWAY_KILL_PREFIX}gw-test")
        with self.assertRaises(KillSwitchBlockedError) as ctx:
            assert_not_killed(gateway_id="gw-test")
        self.assertTrue(ctx.exception.decision.blocked)
        self.assertEqual(ctx.exception.decision.reason, "gateway_kill_active")

    def test_kill_switch_inactive_allows_operations(self):
        """When kill switch is inactive, operations should proceed normally."""
        assert_not_killed(gateway_id="gw1")

    def test_kill_switch_error_response_format(self):
        """Kill switch decision should have correct format fields."""
        set_kill_switch(f"{GATEWAY_KILL_PREFIX}gw1")
        decision = evaluate_kill_switch(gateway_id="gw1")
        self.assertTrue(decision.blocked)
        self.assertEqual(decision.reason, "gateway_kill_active")
        self.assertEqual(decision.scope, "gateway")
        self.assertIn("stopped", decision.detail)
        # Error response format for WS messages
        error_response = {
            "ok": False,
            "error": "gateway_killed",
            "detail": decision.detail,
        }
        self.assertFalse(error_response["ok"])
        self.assertEqual(error_response["error"], "gateway_killed")

    def test_trace_id_populated_in_decision(self):
        """Trace ID should be populated in kill switch decision."""
        set_kill_switch(f"{GATEWAY_KILL_PREFIX}gw1")
        decision = evaluate_kill_switch(gateway_id="gw1", trace_id="trace-123")
        self.assertTrue(decision.blocked)
        self.assertEqual(decision.trace_id, "trace-123")

    def test_trace_id_populated_in_blocked_error(self):
        """Trace ID should flow through to KillSwitchBlockedError."""
        set_kill_switch(f"{GATEWAY_KILL_PREFIX}gw1")
        with self.assertRaises(KillSwitchBlockedError) as ctx:
            assert_not_killed(gateway_id="gw1", trace_id="trace-456")
        self.assertEqual(ctx.exception.decision.trace_id, "trace-456")

    def test_trace_id_default_empty_string(self):
        """When trace_id is not provided, it should default to empty string."""
        decision = evaluate_kill_switch()
        self.assertEqual(decision.trace_id, "")

    def test_global_kill_blocks_gateway_operations(self):
        """Global kill switch should also block gateway operations."""
        set_kill_switch(GLOBAL_KILL_KEY)
        with self.assertRaises(KillSwitchBlockedError) as ctx:
            assert_not_killed(gateway_id="gw1")
        self.assertEqual(ctx.exception.decision.reason, "global_kill_active")

    def test_dispatch_tool_invoke_blocked_on_active_kill(self):
        """assert_not_killed with active kill and specific gateway_id blocks."""
        set_kill_switch(f"{GATEWAY_KILL_PREFIX}gw-dispatch")
        with self.assertRaises(KillSwitchBlockedError) as ctx:
            assert_not_killed(gateway_id="gw-dispatch")
        self.assertEqual(ctx.exception.decision.reason, "gateway_kill_active")
        self.assertEqual(ctx.exception.decision.scope, "gateway")

    def test_dispatch_channel_outbound_blocked_on_active_kill(self):
        """assert_not_killed with active kill blocks channel outbound path."""
        set_kill_switch(f"{GATEWAY_KILL_PREFIX}gw-channel")
        with self.assertRaises(KillSwitchBlockedError) as ctx:
            assert_not_killed(gateway_id="gw-channel")
        self.assertEqual(ctx.exception.decision.reason, "gateway_kill_active")

    def test_gateway_kill_only_blocks_specific_gateway(self):
        """Killing one gateway should not affect other gateways."""
        set_kill_switch(f"{GATEWAY_KILL_PREFIX}gw-specific")
        # This gateway should be blocked
        with self.assertRaises(KillSwitchBlockedError):
            assert_not_killed(gateway_id="gw-specific")
        # Another gateway should not be blocked
        assert_not_killed(gateway_id="gw-other")


if __name__ == "__main__":
    unittest.main()
