# Studio Contract

Status: Active
Owner: Platform
Last verified: 2026-06-06
Source of truth: deployed-agent code

## Contract

Studio owns deployed specialist agents and their operational state. The public projection includes identity, persona, prompt, deployment state, channels, knowledge sources, runtime target, billing plan, marketplace fields, provider/model, privacy contract, computer safety contract, and agent workspace contract. Internal fields include tenant id, backing install id, creator, lifecycle timestamps, and metadata. Source: `server_modules/deployed_agent_service.py`.

Each deployed agent must stay linked to a backing specialist install before live deployment. `validate_can_deploy` requires matching backing install id, tenant id, workspace id, allowed live channels, specialist mode, privacy contract acceptance, and any required computer safety snapshot. Source: `server_modules/deployed_agent_service.py`.

Lifecycle states are constrained by `validate_state_transition`: draft agents can move toward private test, review, live, or archive; live agents can pause, suspend, or archive; archived agents stay archived. Direct updates cannot set `live`, `paused`, or `suspended`; those states use dedicated lifecycle controls. Source: `server_modules/deployed_agent_service.py`.

Live deployment does all of the following in code: verifies owner/admin workspace access, validates the state transition to `live`, checks configured live channel readiness when customer channels are enabled, lists runtime attachments and targets, enforces the mode/capability matrix, enforces entitlements and quotas, persists privacy acceptance metadata, mirrors to the backing specialist, validates deployability, runs the Rust control-plane service decision, then sets `deployment_state` to `live`. Source: `server_modules/deployed_agent_service.py`.

Studio agents must not inherit Sage personal channel or Agent Computer access by default. The integrations UI explicitly labels Telegram bot deployments as the Studio/business lane and personal Telegram/WhatsApp as Agent Computer personal channels. Sources: `frontend/lib/workspace/workstation-sage-connectors-pane.tsx`, `server_modules/deployed_agent_runtime_contract_service.py`.

Migration debt: broad business channels beyond Telegram are not proven by the inspected deployed-agent live-readiness code. The code has a channel map, but the explicit readiness helper and beta status focus on Telegram, and WhatsApp is marked out of scope for Studio beta. Source: `server_modules/deployed_agent_service.py`.
