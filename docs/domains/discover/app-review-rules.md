# App Review Rules

Status: Active
Owner: Platform
Last verified: 2026-06-06
Source of truth: registry, marketplace, and review enforcement code

## Implemented Review Rules

Review statuses are normalized to `pending`, `approved`, `rejected`, or `restricted`. Verification statuses are `unverified`, `partner`, or `verified`. Health states are `healthy`, `degraded`, or `setup_required`. Policy postures are `governed` or `restricted`. Source: `server_modules/marketplace_distribution_service.py`.

Who can publish or review:

- Member role can register provider packages and submit community app packages through workspace marketplace routes.
- Owner role is required to list the app-submission queue and review app submissions.
- Viewer role can list public marketplace packages; owner role is required for `include_review_queue=true`.

Source: `server_modules/routes_marketplace.py`.

Package validation:

- Package kind must be one of `agent_template`, `app`, `connector`, `mini_app`, `provider`, or `skill`.
- Package id, label, and description are required after normalization.
- Provider packages require a provider id, at least one model, and cannot reuse a built-in provider id.
- App packages require app id and runtime-specific URLs/routes; community/link URLs and icon URLs are validated as public HTTPS where applicable.
- Connector packages require connector id.
- Skill packages require skill id.
- Agent-template packages require template id.

Source: `server_modules/marketplace_distribution_service.py`.

Community app submissions have extra requirements: app name, short description, category, public HTTPS hosted URL, and icon URL. Submission forces kind `app`, verification `unverified`, review `pending`, health `setup_required`, policy `governed`, and runtime type `community`. Source: `server_modules/marketplace_distribution_service.py`.

Review findings are computed from marketplace contract and app identity data. Findings include excessive permission count, excessive permission markers, owner resource boundary violation, excessive domain scope, unsafe local runtime permission combo, missing app icon, missing destination URL, missing hosted URL, and missing platform route. Source: `server_modules/marketplace_distribution_service.py`.

Install blockers include preview only, review not approved, verification required for non-app/non-mini-app packages, restricted policy, manual approval required, excessive permissions, excessive domain scope, unsafe local runtime permission combo, owner resource boundary violation, and missing app identity fields. Source: `server_modules/marketplace_distribution_service.py`.

Review action only applies to app packages. It sets review state to `approved` or `rejected`, sets health to `healthy` when approved or `setup_required` when rejected, records reviewer metadata, reason, and optional verification status. Source: `server_modules/marketplace_distribution_service.py`.

Migration debt: package registration allows members to set initial review/verification fields for non-app provider packages, and only app submissions have an explicit owner review route in the inspected code. Source: `server_modules/routes_marketplace.py`.
