# Virtual Computer Phase VC-3 Provider Abstraction

Status: active contract for VC-3.

## Goal

Avoid runtime lock-in by introducing a provider abstraction layer for virtual computer execution.

## Provider Interface

Provider abstraction is implemented in:

- `server_modules/virtual_computer_runtime.py`

Core concepts:

- `VirtualComputerProviderSpec`
- `VirtualComputerProviderAdapter`
- `VirtualComputerProviderRegistry`
- `ProviderTaggedVirtualComputerRuntime`

Registry factories:

- `default_virtual_computer_provider_registry()`
- `build_default_runtime_registry()`

## Provider Families in VC-3

- Browserbase-style browser sessions (`browserbase`)
- E2B-style sandboxes (`e2b`)
- Daytona-style snapshot/dev environments (`daytona`)
- AWS virtual desktop placeholder (`aws_workspaces`, later)
- Azure virtual desktop placeholder (`azure_virtual_desktop`, later)
- Self-hosted Docker/Kubernetes placeholder (`docker_kubernetes`, later)

## Stored Provider Capabilities

Each provider spec stores:

- `browser`
- `shell`
- `filesystem`
- `screenshot`
- `persistence`
- `snapshots`
- `public_url`
- `network_controls`
- `max_runtime`
- `cost_unit`

## Runtime Swap Guarantee

Sage continues to use one runtime contract:

- `virtual_computer_runtime.v1`

Provider selection happens behind the contract by runtime choice and optional preferred provider ID, so providers can be swapped without rewriting Sage-facing runtime methods.
