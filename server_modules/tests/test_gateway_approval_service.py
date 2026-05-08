import unittest

from server_modules import gateway_approval_service


class GatewayApprovalServiceTests(unittest.TestCase):
    def test_capability_requires_owner_approval_for_known_risky_local_capability(self) -> None:
        self.assertTrue(gateway_approval_service.capability_requires_owner_approval("computer_control.click"))

    def test_capability_requires_owner_approval_for_registry_requires_approval_contract(self) -> None:
        self.assertTrue(gateway_approval_service.capability_requires_owner_approval("shell.execute"))

    def test_capability_requires_owner_approval_allows_low_risk_read_capability(self) -> None:
        self.assertFalse(gateway_approval_service.capability_requires_owner_approval("connector.action.read"))

    def test_capability_requires_owner_approval_defaults_unknown_capability_to_true(self) -> None:
        self.assertTrue(gateway_approval_service.capability_requires_owner_approval("unknown.capability"))


if __name__ == "__main__":
    unittest.main()
