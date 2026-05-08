# Virtual Computer Phase VC-2 Runtime Contract

Status: active contract for VC-2.

## Goal

Make virtual computer a first-class runtime contract so Sage sees local gateway and virtual runtime through one controlled interface.

## Contract Interface

Interface ID:

- `virtual_computer_runtime.v1`

Standard methods:

- `create_session`
- `resume_session`
- `pause_session`
- `terminate_session`
- `execute_action`
- `stream_screenshot`
- `collect_artifact`
- `snapshot_session`

Standard states:

- `provisioning`
- `ready`
- `running`
- `paused`
- `degraded`
- `expired`
- `terminated`
- `failed`

## Implementations

Current contract implementations in backend:

- `LocalGatewayVirtualComputerRuntime`
- `InMemoryVirtualComputerRuntime`

Registry:

- `VirtualComputerRuntimeRegistry.resolve(runtime_choice)`

Default runtime build:

- `build_default_runtime_registry()`

## Route Metadata for Sage

Runtime routing now exposes contract-level metadata:

- `runtime_contract_interface`
- `runtime_contract_kind`
- `runtime_contract_methods`
- `runtime_contract_states`

This metadata is attached to execution-route decisions so local gateway and virtual runtime present the same controlled runtime shape to Sage.
