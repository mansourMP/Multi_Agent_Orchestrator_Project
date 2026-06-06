# Trust Boundaries

Status: Active
Owner: Platform
Last verified: 2026-06-06
Source of truth: auth, gateway, runtime, app bridge, channel, and billing code

## Customer Account Boundary

The product model is one customer account owning its own workspace context.
Every API path that reads or mutates workspace state must prove the authenticated
customer can access that workspace.

Security question for every route:

```text
Can this caller read or mutate a workspace, agent, gateway, runtime, app,
channel, secret, or credit record that does not belong to them?
```

## Cloud Control Plane Boundary

The cloud backend owns account/workspace state, registry state, channel records,
app registry records, runtime registration state, billing ledger rows, and
hosted provider secret resolution. Cloud code must not trust client-supplied
workspace ids, machine ids, or owner-mode flags without authenticated
authorization checks.

## Agent Computer Boundary

Agent Computer is customer hardware. The backend may request actions, but local
execution happens through gateway and supervisor.

Required gates:

- selected/registered gateway
- workspace match
- device trust not revoked
- live websocket/session
- fresh heartbeat
- healthy capability state
- runtime access mode policy
- Sage-only Full Access scope
- setup-warning acknowledgement for Full Access
- screen/accessibility permission probes where required
- audit and interrupt/kill behavior

## Runtime Boundary

Runtime registration creates powerful session credentials. It must be bound to
an enrollment token, workspace, machine/runtime id, and session/lease checks.
Runtime task hot paths can be high volume, so they need session-token validation
and runtime-specific abuse controls even when exempt from generic mutation rate
limits.

## App Boundary

Apps can ask Sage or specialists for work through bridge contracts. Apps must
not smuggle owner resources by metadata. Forbidden bridge payloads include Sage
memory, specialist memory, runtime session ids, gateway ids, shell/computer
control, MCP/skill execution, raw tool calls, and private context.

## Channel Boundary

Personal channels belong to the Sage/Agent Computer lane. Business channels
belong to Studio/deployed-agent lane. Personal-channel session files and local
auth belong on the customer hardware side, not in public Studio connector state.

## Secret Boundary

Customer BYOK secrets are workspace-owned credentials. Platform-hosted provider
secrets are Empyralis-owned runtime credentials. These must never collapse into
one generic "provider key" lane.
