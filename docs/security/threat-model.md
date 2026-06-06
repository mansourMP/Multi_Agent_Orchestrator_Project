# Threat Model

Status: Active
Owner: Platform
Last verified: 2026-06-06
Source of truth: current security docs plus enforcement code

## Active Threat Categories

- Unauthenticated owner-mode Sage calls.
- Runtime registration minting session tokens without valid enrollment binding.
- Workspace isolation bypass by forged `workspace_id`, gateway id, runtime id,
  agent id, channel endpoint, app id, or billing request id.
- Credit drain through hosted AI usage or repeated runtime work.
- Platform provider secret leakage into user-visible payloads.
- Customer BYOK secret leakage into apps, Studio agents, logs, or frontend
  responses.
- Gateway hijack, stale duplicate gateway registrations, or cross-workspace
  gateway use.
- Full Access misuse outside Sage scope or without setup-warning acknowledgement.
- App bridge metadata smuggling private context or raw tool calls.
- Channel webhook forgery, replay, or routing into the wrong agent lane.
- Self-hosted runtime command injection or command claim by an untrusted node.
- Missing audit events for high-risk local, runtime, secret, or credit actions.

## Existing Threat Source Docs

- `docs/security/agent-computer-threat-model.md`
- `docs/domains/agent-computer/permission-secret-model.md`
- `docs/reports/transparency-runtime-audit.md`
- `docs/reports/web-chat-channel-audit.md`
- `docs/operations/hosted-provider-secret-governance.md`

## Current Highest-Risk Boundaries

- Gateway and supervisor: can control customer hardware.
- Runtime registration and task claim: can mint/consume execution capability.
- Provider and secrets path: can leak customer or platform keys.
- Hosted AI and billing: can spend platform/customer credits.
- Channels and app bridge: can inject external text/actions into agent paths.

## Review Rule

Every security review should produce findings in this shape:

```text
Severity:
Boundary:
Exploit path:
Current enforcement:
Missing enforcement:
Files:
Tests to add:
Fix without breaking product:
```
