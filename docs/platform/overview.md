# Platform Overview

Status: Active
Owner: Platform
Last verified: 2026-06-06
Source of truth: code plus active decisions

Empyralis is currently a workspace product with these major surfaces:

- Sage: the main workspace agent and chat surface.
- Studio: specialist/deployed agents and external-agent configuration.
- Agent Computer: selected customer hardware reached through gateway and
  supervisor code.
- Channels: personal and business message ingress/egress.
- Apps: hosted mini-apps, app registry entries, and app bridge contracts.
- Discover/Marketplace: listing and discovery UI for apps and agents.
- Runtime: cloud/local/self-hosted execution sessions, queues, leases, and
  worker lifecycle.
- Billing/Credits: hosted AI access, BYOK/provider selection, credit ledger, and
  entitlement checks.

Related code roots:

- `frontend/app/(account)/w/[workspaceId]/**`
- `frontend/lib/workspace/**`
- `server_modules/**`
- `empyralis-gateway/src/**`
- `empyralis-supervisor/src/**`
- `scripts/orion_local_worker_runtime.py`
