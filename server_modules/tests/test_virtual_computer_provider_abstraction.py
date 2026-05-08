import asyncio
import unittest

from server_modules.virtual_computer_runtime import (
    InMemoryVirtualComputerRuntime,
    PROVIDER_CAPABILITY_KEYS,
    PROVIDER_ID_BROWSERBASE,
    PROVIDER_ID_DAYTONA,
    RUNTIME_CHOICE_VIRTUAL_BROWSER,
    RUNTIME_CHOICE_VIRTUAL_CODE_SANDBOX,
    VirtualComputerRuntimeRegistry,
    default_virtual_computer_provider_registry,
)


class VirtualComputerProviderAbstractionTests(unittest.TestCase):
    def test_default_provider_registry_exposes_capability_schema(self):
        registry = default_virtual_computer_provider_registry()
        specs = registry.list_provider_specs()

        self.assertTrue(specs)
        for spec in specs:
            capabilities = spec.get("capabilities") if isinstance(spec.get("capabilities"), dict) else {}
            for key in PROVIDER_CAPABILITY_KEYS:
                self.assertIn(key, capabilities)

    def test_virtual_browser_defaults_to_browserbase_provider(self):
        provider_registry = default_virtual_computer_provider_registry()
        runtime_registry = VirtualComputerRuntimeRegistry(
            local_runtime=InMemoryVirtualComputerRuntime(),
            virtual_runtime=InMemoryVirtualComputerRuntime(),
            provider_registry=provider_registry,
        )

        runtime = runtime_registry.resolve(RUNTIME_CHOICE_VIRTUAL_BROWSER)
        created = asyncio.run(runtime.create_session({"runtime_choice": RUNTIME_CHOICE_VIRTUAL_BROWSER}))

        self.assertEqual(created.get("provider_id"), PROVIDER_ID_BROWSERBASE)

    def test_provider_can_be_swapped_without_contract_change(self):
        provider_registry = default_virtual_computer_provider_registry()
        runtime_registry = VirtualComputerRuntimeRegistry(
            local_runtime=InMemoryVirtualComputerRuntime(),
            virtual_runtime=InMemoryVirtualComputerRuntime(),
            provider_registry=provider_registry,
        )

        runtime = runtime_registry.resolve(
            RUNTIME_CHOICE_VIRTUAL_CODE_SANDBOX,
            preferred_provider_id=PROVIDER_ID_DAYTONA,
        )
        created = asyncio.run(runtime.create_session({"runtime_choice": RUNTIME_CHOICE_VIRTUAL_CODE_SANDBOX}))
        action = asyncio.run(
            runtime.execute_action(
                {
                    "session_id": created.get("session_id"),
                    "action": "run_command",
                    "approval_id": "appr_provider_swap",
                    "risk_policy": {"red_policy": "owner_approval"},
                    "policy_metadata": {"owner_role": "owner", "owner_is_admin": True},
                    "action_args": {"command": "echo hello"},
                }
            )
        )

        self.assertEqual(created.get("provider_id"), PROVIDER_ID_DAYTONA)
        self.assertEqual(action.get("provider_id"), PROVIDER_ID_DAYTONA)
        self.assertEqual(action.get("runtime_contract_interface"), "virtual_computer_runtime.v1")


if __name__ == "__main__":
    unittest.main()
