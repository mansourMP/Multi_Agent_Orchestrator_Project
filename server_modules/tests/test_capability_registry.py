import unittest

from server_modules.capability_registry import resolve_capability


class CapabilityRegistryTests(unittest.TestCase):
    def test_resolve_capability_returns_contract(self) -> None:
        contract = resolve_capability("screenshot.capture")

        assert contract is not None
        self.assertEqual(contract.capability_id, "screenshot.capture")
        self.assertEqual(contract.display_name, "Capture Screenshot")

    def test_resolve_capability_returns_none_for_missing_capability(self) -> None:
        self.assertIsNone(resolve_capability("missing.capability"))

    def test_resolve_capability_exposes_risk_level(self) -> None:
        contract = resolve_capability("shell.execute")

        assert contract is not None
        self.assertEqual(contract.risk_level, "critical")
        self.assertTrue(contract.requires_approval)


if __name__ == "__main__":
    unittest.main()
