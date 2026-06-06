# Mobile Execution And Transparency Contract — 2026-05-01

## Current Contract

Sage is a cloud-first agent with optional runtime power from a paired physical device or a paid Sage Cloud Computer. The phone and web app must show the same truth: which runtime is active, which tools are available, which actions need approval, and what the agent did.

## Runtime Targets

- `cloud_default`: normal hosted Sage execution. It is the product default when available.
- `local_companion`: a paired user-owned physical computer through the gateway/supervisor path.
- `sage_cloud_computer`: optional paid hosted computer. It is metered, explicit, and never the default.
- `self_host_runtime`: a customer-controlled business runtime.

## Execution Modes

- `Default Guarded`: obvious low-risk tools can run; destructive actions, dangerous shell, file write/delete, connector side effects, and external sends require approval.
- `Autonomous Full Access`: only for explicitly selected dedicated Agent Computers. This means allowed computer actions can run without per-action Empyralis approval prompts after explicit owner approval.
- `Custom`: the owner defines allowed folders, terminal/network policy, app/browser access, approval memory, runtime/budget caps, and emergency stop behavior. Until a custom policy is saved, this remains approval-gated.

Autonomous Full Access still has hard guardrails: audit events, revocation, stop/abort, quotas, blocked actions, OS permissions, and secret redaction. Cloud Computer does not use physical-machine access semantics. It runs inside a metered sandbox with TTL cleanup, spend controls, artifacts, and audit events. This keeps the distinction clear: physical computer power is owner-approved; cloud computer power is sandboxed and billed.

## Transparency Requirements

- Tool calls render inline in the chat transcript.
- Shell, file, web search, and screenshot actions are typed cells, not generic trace cards.
- `browser.screenshot` and image `artifact.created` events must render as screenshot/artifact rows so phone users can see visual progress.
- Hidden chain-of-thought is never exposed. Sage shows activity summaries and tool events only.
- Stop/abort must preserve partial assistant output and the visible audit trail.

## Tool And MCP Trust Metadata

Every tool exposed from MCP or connectors must carry a permission manifest:

- action class: read, write, execute
- risk level
- permission scopes
- allowed runtime modes
- approval requirement
- cost class
- audit event type

This is what lets normal users understand why a tool is available, why it is disabled, and what it can touch before installing or running it.

## Phone Readiness Gate

Phone web/native is certified only when:

- signup/login reaches Sage without 500/504 shell failures;
- runtime pill shows Cloud, This Mac, or Gateway offline truthfully;
- provider/model picker is usable;
- tools palette reflects gateway status;
- approvals are visible and actionable;
- transcript shows thinking/tool/screenshot rows;
- chat history is cloud-canonical and appears across devices.

## Remaining External Cert

The source contract is in place. The remaining gate is a real phone sweep against production after deployment: create account, configure provider, send messages, open tools, verify gateway-offline state, and confirm no shell-unavailable dead screen.
