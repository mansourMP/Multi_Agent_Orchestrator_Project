# Platform Security Model

Status: Active
Owner: Platform
Last verified: 2026-06-06
Source of truth: domain security docs and enforcement code

## Security Goal

Empyralis security must protect the customer account, workspace data, platform
secrets, customer BYOK secrets, hosted credits, local hardware access, and agent
execution surfaces without weakening the product promise. Full Access and local
hardware control can exist, but they must be authenticated, scoped, audited, and
revocable.

## Layers

- Account and workspace access: every customer-visible action must resolve the
  authenticated account and workspace before reading or mutating state.
- Sage: main customer agent. It can use cloud tools and selected Agent Computer
  capabilities only through exposed runtime/tool gates.
- Studio: deployed/specialist agents. They must not inherit Sage personal
  channels or Sage Agent Computer Full Access by default.
- Agent Computer: customer hardware lane through gateway and supervisor.
  Full Access remains powerful but requires Sage scope, selected hardware,
  setup-warning acknowledgement, live gateway readiness, policy checks, and
  audit.
- Runtime: local/cloud/self-hosted execution must use enrollment tokens,
  session tokens, workspace/machine binding, leases, quotas, and rate limits.
- Channels: inbound messages must be authenticated, normalized, deduplicated,
  routed to the correct Sage or Studio lane, and stored with workspace scope.
- Apps: app bridge metadata must not smuggle private owner resources, Sage
  memory, runtime session ids, shell/computer control, or raw tool calls.
- Billing/Credits: hosted AI usage must be attributable, priced, recorded in
  ledgers, and debited without exposing platform provider secrets.
- Secrets: platform-hosted provider secrets and customer BYOK secrets must be
  separate ownership lanes with explicit audit.

## Domain Security Sources

- `docs/domains/sage/security.md`
- `docs/domains/studio/security.md`
- `docs/domains/agent-computer/security.md`
- `docs/domains/runtime/security.md`
- `docs/domains/channels/security.md`
- `docs/domains/apps/security.md`
- `docs/domains/discover/security.md`
- `docs/domains/billing-credits/security.md`

## Non-Negotiable Rules

- Do not solve security by breaking the product contract.
- Do not remove Full Access to make security simpler.
- Do not let Studio, apps, or public channels inherit Sage personal resources.
- Do not expose raw provider keys, connector secrets, local session files, or
  platform secrets to frontend responses.
- Do not allow unauthenticated owner-mode or runtime-token minting paths.
- Do not let a gateway or runtime act outside its workspace/machine binding.
