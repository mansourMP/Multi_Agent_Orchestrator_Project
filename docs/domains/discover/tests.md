# Discover Tests

Status: Active
Owner: Platform
Last verified: 2026-06-06
Source of truth: marketplace and discovery tests

## Focused Tests

Run Discover route coverage:

```bash
PYTHONPATH=. venv/bin/python -m pytest -q \
  server_modules/tests/test_routes_discovery.py
```

Covered behavior: cookie-session Discovery adopt rejects missing CSRF; feed lists cloneable public apps without exposing source ids; adopting app blueprints clones into the target workspace; agent-template adoption opens Studio. Source: `server_modules/tests/test_routes_discovery.py`.

Run Marketplace server coverage:

```bash
PYTHONPATH=. venv/bin/python -m pytest -q \
  server_modules/tests/test_routes_marketplace.py \
  server_modules/tests/test_marketplace_distribution_service.py \
  server_modules/tests/test_marketplace_contract_vc17.py \
  server_modules/tests/test_worker_marketplace_state_rust_gate.py \
  server_modules/tests/test_deployed_agent_marketplace_rust_gate.py
```

Covered behavior: marketplace mutations reject missing CSRF for cookie sessions; provider/app package registration works; app submission stays out of public marketplace until review; app review approves community app; install records provider/app packages; app install syncs `app_registry`; runtime events increment analytics; backend seed templates list; Rust state-store gates block marketplace state writes; excessive permissions can block install. Sources: `server_modules/tests/test_routes_marketplace.py`, `server_modules/tests/test_worker_marketplace_state_rust_gate.py`, `server_modules/tests/test_marketplace_contract_vc17.py`.

Run app registry coverage:

```bash
PYTHONPATH=. venv/bin/python -m pytest -q \
  server_modules/tests/test_app_registry_api.py
```

Covered behavior: app registry exposes bridge endpoints and bridge requests are normalized and audited. Source: `server_modules/tests/test_app_registry_api.py`.

Run frontend identity coverage:

```bash
cd frontend
npm run test:e2e -- frontend/tests/e2e/app-marketplace-identity.spec.ts
```

Covered behavior: Applications launcher excludes old seeded web-link apps; Browse apps opens the app store; Discover navigation avoids old app categories; private app without icon renders initials and stays out of public marketplace; hosted app bridge is denied by default. Source: `frontend/tests/e2e/app-marketplace-identity.spec.ts`.

Missing coverage:

- Discover feed does not have a frontend E2E for adopting a marketplace skill, MCP connector, or bundle.
- Marketplace package UI composer is not covered by the listed Playwright spec.
- Public `/api/marketplace/agents` listing and `/api/marketplace/upgrade-click` are covered only by service-level Rust-gate tests for upgrade-click, not an end-to-end route test in the inspected files.
