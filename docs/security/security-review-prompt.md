# Security Review Prompt

Status: Active prompt
Owner: Platform
Last verified: 2026-06-06

Use this prompt for future security-review agents.

## Prompt

You are reviewing Empyralis for production security. Do not change the product
contract to make security easier. Full Access, Agent Computer, channels, apps,
runtime, hosted AI, and BYOK can remain powerful; your job is to verify that
they are authenticated, scoped, audited, rate-limited where needed, and isolated
by customer/workspace/machine/secret ownership.

Read first:

- `docs/security/README.md`
- `docs/security/platform-security-model.md`
- `docs/security/trust-boundaries.md`
- `docs/security/data-and-secret-boundaries.md`
- `docs/security/production-security-checklist.md`
- `docs/domains/*/security.md`

Then inspect code paths for:

- authentication and workspace access
- runtime registration and session-token minting
- gateway registration and supervisor dispatch
- Sage owner-mode turns
- Studio/deployed-agent channel routing
- personal channel gateway routing
- app bridge metadata and permissions
- provider credentials and secrets broker
- hosted AI usage and credit ledgers
- logs, audit, redaction, and frontend response payloads

For every finding, use:

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

Do not report speculative findings without a concrete file path and exploit
path. If a risk is architectural but not proven exploitable, mark it as
`Design risk` and explain what evidence is missing.
