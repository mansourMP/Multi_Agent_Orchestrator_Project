# Runtime Credits And Quotas

Status: Active
Owner: Platform
Last verified: 2026-06-06
Source of truth: runtime policy, billing, and entitlement services

## Runtime Quotas And Limits

`server_modules/runtime_common.py` rate-limits control-plane mutation paths.
Canonical chat turn and thread-turn endpoints are exempt because they are
streaming/hot paths. Runtime registration under `/runtime/runtimes/{id}/register`
is rate-limited; runtime heartbeats and runtime task paths remain hot-path
exempt.

Runtime APIs use Pydantic bounds for several operational parameters:

- self-hosted command claim `max_commands`: 1 to 50
- self-hosted command claim `lease_seconds`: 15 to 600
- self-hosted command TTL: 30 to 3600 seconds
- hardware action timeout: 1 to 120 seconds

Hosted runtime access is entitlement-gated in
`server_modules/entitlements_service.py` by hosted runtime enablement, monthly
runtime minutes, and concurrent hosted executions.

Hosted AI credits are documented separately in
`docs/domains/billing-credits/`.

## Gaps

Migration debt: runtime task claim/heartbeat paths are intentionally exempt from
generic control-plane rate limits; abuse limits for those hot paths must be
documented from local queue/session-token enforcement before production signoff.
