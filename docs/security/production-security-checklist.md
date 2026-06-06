# Production Security Checklist

Status: Active checklist
Owner: Platform
Last verified: 2026-06-06
Source of truth: platform security model and domain security docs

This is the launch gate checklist. A category is not done until code, tests, and
docs agree.

## P0 Launch Gates

- Authentication: no owner/customer/admin route works without authenticated
  account context.
- Workspace isolation: every route that accepts `workspace_id` enforces access
  before read or write.
- Sage owner mode: no unauthenticated route can invoke Sage with owner-mode
  privileges.
- Runtime registration: registration requires enrollment token binding and does
  not bypass mutation rate limits.
- Runtime sessions: task claim/heartbeat/complete/pause/fail require valid
  runtime session identity.
- Gateway execution: selected gateway must match workspace, be trusted, be live,
  have fresh heartbeat, and advertise required capability.
- Full Access: remains available but only for Sage scope with warning
  acknowledgement and audit.
- Supervisor: signed requests, capability allowlist, filesystem/shell policy,
  and interrupt behavior are tested.
- Secrets: platform hosted keys and customer BYOK keys are separate and never
  appear raw in frontend/app/agent payloads.
- Hosted AI credits: usage is priced, ledgered, idempotent, and debited; failure
  to ledger or debit fails closed.
- Apps: app bridge cannot include private context, runtime session ids, gateway
  ids, shell/computer control, or raw tool calls.
- Channels: inbound webhooks are authenticated or gateway-bound, idempotent, and
  routed to the correct Sage/Studio lane.
- Logs/audit: high-risk hardware, runtime, secret, channel, app, and credit
  actions emit useful audit records without secrets.

## P1 Before Wider Rollout

- Collapse/hide stale duplicate hardware registrations in UI.
- Add frontend response contract for provider/credit fields.
- Add hot-path runtime task abuse controls beyond generic mutation limits.
- Add dedicated app permission approval/revocation docs and tests.
- Add security E2E tests for personal channel inbound display in Sage chat.
- Add incident runbooks for gateway compromise, leaked BYOK credential, leaked
  platform provider key, credit-drain incident, and webhook replay incident.

## Verification Commands

Focused examples:

```bash
python -m pytest server_modules/tests/test_runtime_runtime_api.py
python -m pytest server_modules/tests/test_runtime_common.py
python -m pytest server_modules/tests/test_app_bridge_service.py
python -m pytest server_modules/tests/test_direct_chat_hosted_usage_service.py
cargo test --manifest-path empyralis-supervisor/Cargo.toml
```

Add domain-specific commands to the relevant `docs/domains/*/tests.md` files as
new test suites are created.
