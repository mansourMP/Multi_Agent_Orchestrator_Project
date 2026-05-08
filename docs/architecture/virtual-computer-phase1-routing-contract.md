# Virtual Computer Phase VC-1 Routing Contract

Status: active contract for VC-1 product-definition alignment.

## Runtime Choice Model

Empyralis runtime choice model for product and backend:

- `local`
- `virtual_browser`
- `virtual_desktop`
- `virtual_code_sandbox`

Execution-target mapping for current backend runtime:

- `local` -> `local_companion`
- `virtual_browser` -> `cloud`
- `virtual_desktop` -> `cloud`
- `virtual_code_sandbox` -> `cloud`

Notes:

- This is a product-level route class, not yet provider-specific provisioning.
- Provider-level VM/browser/sandbox allocation is handled in later phases.

## VC-1 Router Rules

Rule order is deterministic:

1. Personal apps/files/browser sessions -> `local`
2. Risky web automation -> `virtual_browser`
3. Code/data jobs -> `virtual_code_sandbox`
4. Enterprise/customer workflows -> `virtual_desktop`
5. Default fallback -> `local`

Routing can be explicitly overridden with metadata:

- `runtime_choice`
- `execution_runtime_choice`

## Metadata Evidence

Execution routing now records:

- `runtime_choice_requested`
- `runtime_choice_selected`
- `runtime_choice_reason`
- `runtime_choice_source`
- `runtime_choice_applied`

This allows product and backend to inspect exactly why local vs virtual was selected on each run.
