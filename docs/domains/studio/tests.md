# Studio Tests

Status: Active
Owner: Platform
Last verified: 2026-06-06
Source of truth: test suite

## Focused Tests

Run backend Studio coverage:

```bash
PYTHONPATH=. venv/bin/python -m pytest -q \
  server_modules/tests/test_deployed_agent_service.py \
  server_modules/tests/test_deployed_agent_routes.py \
  server_modules/tests/test_deployed_agent_lifecycle_rust_gate.py \
  server_modules/tests/test_deployed_agent_service_rust_gate.py \
  server_modules/tests/test_deployed_agent_routes_rust_gate.py \
  server_modules/tests/test_deployed_agent_runtime_contract_service.py \
  server_modules/tests/test_deployed_agent_virtual_runtime_service.py \
  server_modules/tests/test_deployed_virtual_runtime_service_decision_rust_gate.py \
  server_modules/tests/test_deployed_agent_emergency_stop_rust_gate.py
```

Run connected external-agent coverage:

```bash
PYTHONPATH=. venv/bin/python -m pytest -q \
  server_modules/tests/test_connected_external_agents_service.py \
  server_modules/tests/test_connected_external_agents_routes.py
```

Run specialist/registry runtime coverage:

```bash
PYTHONPATH=. venv/bin/python -m pytest -q \
  server_modules/tests/test_agent_registry_api.py \
  server_modules/tests/test_agent_registry_repository.py \
  server_modules/tests/test_agent_registry_self_hosted_runtime_rust_gate.py \
  server_modules/tests/test_control_plane_agent_registry.py
```

Run memory, knowledge, analytics, cost, and transparency coverage:

```bash
PYTHONPATH=. venv/bin/python -m pytest -q \
  server_modules/tests/test_deployed_agent_memory_service.py \
  server_modules/tests/test_deployed_agent_memory_rust_gate.py \
  server_modules/tests/test_deployed_agent_knowledge_verification.py \
  server_modules/tests/test_deployed_agent_knowledge_file_rust_gate.py \
  server_modules/tests/test_deployed_agent_analytics_service.py \
  server_modules/tests/test_deployed_agent_cost_cap_service.py \
  server_modules/tests/test_deployed_agent_transparency_emission.py
```

Frontend coverage called out by the existing launch-readiness doc:

```bash
cd frontend
npm run typecheck
npm run test:e2e:deployed-agents
```

Missing coverage: a single full launch Playwright path that proves create, instructions, knowledge, model provider, channel, private chat, deploy, customer message, results, and cost in one flow. Source: `docs/reports/studio-agents-launch-readiness-2026-05-15.md`.
