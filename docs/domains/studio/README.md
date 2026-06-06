# Studio Domain

Status: Active
Owner: Platform
Last verified: 2026-06-06
Source of truth: code and active decisions

Studio owns specialist/deployed agents, business agent configuration, templates,
deployments, and business-channel bindings. Studio agents do not automatically
inherit Sage Agent Computer access.

## Implemented Surface

- Deployed agents have explicit lifecycle states: `draft`, `private_test`, `ready_for_review`, `live`, `paused`, `suspended`, and `archived`; public channel routing is limited to `live`, `paused`, and `suspended`. Source: `server_modules/deployed_agent_service.py`.
- Studio runtime modes are implemented as `text_agent`, `cloud_computer_agent`, `my_computer_agent`, and `self_hosted_agent`, each with a runtime placement, supplier, allowed capabilities, and deploy target. Source: `server_modules/deployed_agent_runtime_contract_service.py`.
- Live deployment is owner/admin scoped, requires readiness checks, persists privacy acceptance, mirrors the deployed agent to a backing specialist install, and runs a Rust service-decision gate before setting state to `live`. Source: `server_modules/deployed_agent_service.py`.
- Connected external agents are represented as a separate Studio surface kind, `connected_external_agent`, with manifest validation, endpoint validation, secret references, and optional Agent Computer private proxy binding. Source: `server_modules/connected_external_agent_service.py`.

## Launch Boundary

Default public Studio should remain the text/API business-agent lane until the full UI and credential path is certified. The existing launch-readiness doc calls out backend readiness, but still requires end-to-end UI, provider, channel, and production credential proof before broad launch. Source: `docs/reports/studio-agents-launch-readiness-2026-05-15.md`.

## Files

- `contract.md`
- `rules.md`
- `channels.md`
- `runtime.md`
- `security.md`
- `tests.md`
- `FILL_PROMPT.md`
