# Studio Security

Status: Active
Owner: Platform
Last verified: 2026-06-06
Source of truth: deployed-agent auth and connector code

## Security Boundaries

Workspace access: deployed-agent admin operations require platform admin or workspace owner access; read/list detail helpers resolve tenant and workspace before accessing deployed-agent, conversation, memory, analytics, or activity records. Source: `server_modules/deployed_agent_service.py`.

Lifecycle and data operations are guarded twice: Python checks workspace role and state, then Rust decision gates are called for service operations and deployed-agent data operations. Source: `server_modules/deployed_agent_service.py`.

Runtime permissions: computer automation rejects inherited host environment, unsafe filesystem defaults, missing domain allowlists, missing time/budget limits, default software installs, unsafe terminal policies, missing sensitive-action confirmation, missing emergency stop, and missing owner-approval actions. Source: `server_modules/deployed_agent_runtime_contract_service.py`.

Privacy contracts: live deployment requires a complete privacy contract snapshot and acceptance. Computer runtime modes also require a complete computer safety contract snapshot. Source: `server_modules/deployed_agent_service.py`.

Kill switches: per-agent kill sets `suspended`, records kill-switch metadata, and can stop active runs. Workspace emergency stop iterates non-archived deployed agents and applies a Rust-gated stop plan. Runtime-session kill can terminate bound cloud or self-hosted sessions before terminating the session record. Source: `server_modules/deployed_agent_service.py`.

External customer data: deletion requires channel and external user id, runs service/data decisions, purges deployed-agent external-user data, and terminates affected sessions. Source: `server_modules/deployed_agent_service.py`.

Provider and external-agent secrets: connected external-agent manifests reject raw secret fields and store `secret_ref`; outbound calls resolve short-lived credential fields from the vault for a target domain. Public endpoints must be HTTPS and cannot target localhost/private-network hosts; Agent Computer proxy endpoints must stay on localhost/private-network hosts and route through the `external_agent_proxy` capability. Source: `server_modules/connected_external_agent_service.py`.

Quota abuse controls: deployment and updates enforce workspace quota policy for agent counts, live/running agents, message limits, tool availability, spend caps, runtime minutes, computer sessions, and memory storage. Source: `server_modules/deployed_agent_service.py`.

Migration debt: production secret-manager/KMS guarantees and live credential runbooks are called out as required in the AI provider strategy, but they are not proven by the inspected Studio files alone. Source: `docs/domains/studio/ai-provider-credits-strategy-2026-05-16.md`.
