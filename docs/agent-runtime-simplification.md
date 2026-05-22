# Agent Runtime Simplification

This document freezes the runtime vocabulary for new product and implementation work.

## Product Concepts

Normal users should see two concepts only:

- Runtime target: `Cloud`, `Agent Computer`
- Agent Computer source: `This Device`, `Dedicated Computer`, `Cloud Computer`, `Server/VPS`
- Access mode: `Default Guarded`, `Autonomous Agent`

`Autonomous Agent` means Empyralis does not ask action-by-action approval prompts for that dedicated runtime. It does not bypass owner binding, tenant/workspace isolation, revocation, offline/degraded state, quota, billing, audit, stop/cancel, provider limits, or OS boundaries.

## Canonical Runtime Targets

New execution logic should use these canonical runtime targets:

- `cloud_default`
- `user_device_gateway`
- `empyralis_cloud_computer`
- `self_hosted_node`

Legacy target IDs remain compatibility aliases at API boundaries:

- `local_companion` -> `user_device_gateway`
- `sage_cloud_computer` -> `empyralis_cloud_computer`
- `self_host_runtime` -> `self_hosted_node`

Do not create new public names for the same runtime concepts. In ordinary UI, group every non-cloud runtime under `Agent Computer`; use `Server/VPS` instead of `Self-hosted Node` in advanced/business setup copy.

## Architecture Direction

Keep the architecture, simplify the contracts:

- Cloud chat works by default without connected hardware.
- Hardware-capable actions bind to a runtime session.
- Runtime policy is split from execution adapters.
- Results correlate back to the same session, trace, assistant turn, and transcript proof snapshot.
- Chat is the normal-user transparency surface.
- `metadata.transcript_events` is the compact replay source for web and mobile.
- Full trace/audit remains internal/admin truth, not ordinary chat UI.

The long-term broker shape is a small orchestrator made of target resolver, session state machine, access/approval policy, per-target execution adapters, and result/artifact correlator.
