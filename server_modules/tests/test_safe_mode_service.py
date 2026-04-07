import unittest

from server_modules import safe_mode_service


class SafeModeServiceTests(unittest.TestCase):
    def tearDown(self) -> None:
        safe_mode_service.reset_state_for_tests()

    def test_safe_mode_blocks_only_unsafe_capability_families(self) -> None:
        safe_mode_service.set_safe_mode(enabled=True, reason="incident")

        self.assertTrue(safe_mode_service.is_capability_disabled("computer_control.click"))
        self.assertTrue(safe_mode_service.is_capability_disabled("computer_control.notify"))
        self.assertTrue(safe_mode_service.is_capability_disabled("browser_automation.interactive"))
        self.assertTrue(safe_mode_service.is_capability_disabled("shell.execute"))
        self.assertFalse(safe_mode_service.is_capability_disabled("screenshot.capture"))
        self.assertFalse(safe_mode_service.is_capability_disabled("filesystem.read_write"))

    def test_scoped_safe_mode_and_kill_switches_are_isolated(self) -> None:
        safe_mode_service.set_safe_mode(enabled=True, workspace_id="ws-1", reason="workspace incident")
        safe_mode_service.set_kill_switch(scope="machine", enabled=True, machine_id="machine-1", reason="host issue")
        safe_mode_service.set_kill_switch(scope="capability", enabled=True, capability_id="screenshot.capture", reason="capture freeze")

        self.assertTrue(safe_mode_service.is_capability_disabled("computer_control.click", workspace_id="ws-1"))
        self.assertFalse(safe_mode_service.is_capability_disabled("computer_control.click", workspace_id="ws-2"))
        self.assertTrue(safe_mode_service.is_capability_disabled("filesystem.read_write", machine_id="machine-1"))
        self.assertFalse(safe_mode_service.is_capability_disabled("filesystem.read_write", machine_id="machine-2"))
        self.assertTrue(safe_mode_service.is_capability_disabled("screenshot.capture"))


if __name__ == "__main__":
    unittest.main()
