# Security

Status: Active index
Owner: Platform
Last verified: 2026-06-06
Source of truth: domain security docs, enforcement code, tests, and runbooks

This folder owns the unified platform security view. Domain-level details stay
inside `docs/domains/*/security.md`; this folder ties those details together
across authentication, workspace isolation, Agent Computer, runtime, channels,
apps, secrets, credits, and production launch checks.

## Folder Contract

- `platform-security-model.md`: cross-platform security model.
- `trust-boundaries.md`: boundaries between customer, cloud, local hardware,
  agents, apps, channels, runtimes, and secrets.
- `data-and-secret-boundaries.md`: where secrets and sensitive data must live.
- `threat-model.md`: active threat categories and existing source docs.
- `production-security-checklist.md`: launch gate checklist.
- `security-review-prompt.md`: prompt for future security-review agents.

## Placement Rule

- Put platform-wide security contracts here.
- Put domain-specific enforcement details in `docs/domains/<domain>/security.md`.
- Put incident response, rotations, and operational recovery in `docs/operations/`.
- Put one-time audits and reports in `docs/reports/`.
- Put choices that require owner approval in `docs/decisions/`.

## Existing Source Docs To Reconcile

- `docs/security/agent-computer-threat-model.md`
- `docs/domains/agent-computer/permission-secret-model.md`
- `docs/reports/transparency-runtime-audit.md`
- `docs/reports/web-chat-channel-audit.md`
- `docs/operations/hosted-provider-secret-governance.md`
- `docs/reports/deepseek-platform-audit-brief-2026-05-17.md`
- `docs/reports/platform-reconciliation-audit.md`

Do not delete these source docs until a dedicated migration pass verifies each
file against current code.
