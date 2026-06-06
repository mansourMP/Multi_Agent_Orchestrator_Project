# Domain Docs

Status: Active
Owner: Platform
Last verified: 2026-06-06
Source of truth: code, tests, and active decisions

This folder owns factual documentation for each product/runtime domain.

## Domains

- `sage/`: main agent, chat, memory, tools, channels, runtime selection.
- `studio/`: specialist/deployed agents and business agents.
- `agent-computer/`: selected hardware, gateway, supervisor, access modes.
- `channels/`: personal and business channel lanes.
- `apps/`: user-owned apps, mini-apps, app bridge, permissions.
- `discover/`: marketplace and review rules.
- `runtime/`: runtime registration, enrollment, sessions, quotas, workers.
- `billing-credits/`: hosted AI credits, BYOK, usage ledger.

## Rule

Every domain should eventually have:

- `README.md`
- `contract.md`
- `rules.md`
- `security.md`
- `tests.md`

Additional files are allowed when the domain has a real sub-boundary.
