# Studio Agents Launch Readiness Audit - 2026-05-15

## Verdict

Studio Agents are real enough to continue toward a controlled pilot, but not ready for broad public launch until the UI path is certified end to end.

The strongest part today is the backend contract for customer-facing text agents:

- Draft creation and deployment exist.
- Text/API cloud agents default to `managed_cloud` and `text_agent`.
- Telegram Bot API delivery works through durable outbox replay.
- Daily quota, monthly cap, privacy deletion, health-safety escalation, memory isolation, and runtime-mode guards have test coverage.
- Dynamic provider catalog work exists for cached live model lists and static fallback metadata.

The weak part is product readiness:

- The Studio UI has recently been changing quickly and still needs a full visual/interaction pass.
- The model provider setup path is not yet proven as a non-technical customer flow.
- Frontend tests cover the deployed-agent surface, but they do not yet prove the exact modern path: create agent -> instructions -> sources -> model provider -> channel -> test chat -> deploy -> customer message -> results.
- Real production provider/channel credentials still need live-environment certification.

## Product Rule

A user must be able to deploy a working text/API Studio agent without opening Launch Settings.

Default deployment contract:

1. Create agent.
2. Add instructions.
3. Add knowledge sources.
4. Connect model provider.
5. Connect customer channel.
6. Test privately in Chat.
7. Deploy.
8. Receive and answer a customer message.

No customer should need to understand raw context windows, VM runtime, local CLI models, or internal durable outbox behavior.

## Scope Boundary

This audit is for Studio Agents, not the main Sage agent.

| Area | Studio Agents Rule |
|---|---|
| Runtime | Default is text/API cloud agent, no virtual computer. |
| Model | Cloud API providers only. No CLI/local/personal subscription routes. |
| Knowledge | Instructions plus trusted source material. |
| Memory | Customer/session facts only. |
| Actions | What the agent may do through connected services. |
| Integrations | Accounts, channels, model providers, MCP, custom APIs, runtime nodes. |
| Results | Real usage, conversations, outcomes, and cost. |

## Current Tab Readiness

| Tab | Intended Meaning | Current Readiness | Notes |
|---|---|---:|---|
| Overview | Launch readiness and health | Partial | Backend launch readiness exists; UI still needs visual polish and final copy pass. |
| Chat | Private test conversation | Partial | Backend test-turn exists. UI must feel like a real chat, not a form/debug timeline. |
| Knowledge | Instructions and trusted sources | Partial | Multiple-source UI direction exists; retrieval/source proof still needs end-to-end validation. |
| Model | API model route for this agent | Partial | Dynamic provider catalog exists in backend; setup UX must be made non-technical. |
| Actions | What the agent may do | Partial | Tools/playbooks need clearer separation from integrations and MCP. |
| Memory | Remembered customer/session facts | Stronger backend, partial UI | Memory isolation and summaries are tested; UI vocabulary still needs certification. |
| Integrations | Accounts, channels, providers, MCP, custom APIs, runtime nodes | Partial | This should own setup. Needs provider/channel setup flow proof. |
| Results | Outcomes, conversations, usage, cost | Partial | Analytics endpoints exist; business outcome quality still needs pilot data. |

## What Is Already Proved

### Backend And Runtime

| Capability | Evidence |
|---|---|
| Studio text agents default to safe text/API runtime | `server_modules/tests/test_deployed_agent_service.py` covers `managed_cloud`, `text_agent`, runtime placement separation, and rejection of incompatible computer automation. |
| Deploy path exists and enforces live readiness | `test_deploy_deployed_agent_sets_live_and_customer_live`, privacy snapshot checks, monthly budget cap checks, Telegram binding checks. |
| Text agents cannot create computer runtime sessions | `server_modules/tests/test_deployed_agent_virtual_runtime_service.py::test_text_agent_cannot_create_runtime_session_from_crafted_payload`. |
| Customer-hosted and cloud-computer paths are guarded | Virtual runtime tests cover missing profiles, unhealthy nodes, capability mismatch, and no silent fallback. |
| Telegram customer message path works through durable delivery | `server_modules/tests/e2e/test_public_telegram_blackbox.py`. |
| Outbox delivery can be scoped to exact tenant/workspace/run/event | `server_modules/tests/test_run_state_repository.py` and `server_modules/tests/test_outbox_service.py`. |
| Policy behavior works on public channel flow | `server_modules/tests/e2e/test_public_policy_blackbox.py`. |
| Memory is isolated by deployment and user | `server_modules/tests/test_deployed_agent_memory_service.py`. |
| Provider catalog has dynamic cached-model support and static fallback | `server_modules/tests/test_provider_catalog_service.py` and `server_modules/tests/test_provider_credential_flows.py`. |

### Frontend Surface

| Capability | Evidence |
|---|---|
| Deployed Agents route mounts in workstation navigation | `frontend/tests/e2e/deployed-agents.spec.ts`. |
| Wizard, deploy, pause, inbox, and transcript render through APIs | `frontend/tests/e2e/deployed-agents.spec.ts`. |
| Canonical workspace surfaces avoid scaffold-only rendering | `frontend/tests/e2e/non-scaffold-surface-sweep.spec.ts`. |
| Account shell hydration covers Studio route load | `frontend/tests/e2e/account-shell-hydration.spec.ts`. |

## Launch Blockers

### P0 - Must Fix Before Any Real Business User

| Blocker | Why It Matters | Required Proof |
|---|---|---|
| Full Studio UI path is not certified after recent redesign work | The backend can work while the customer-facing builder still feels broken or confusing. | Playwright flow covering create -> knowledge -> model -> integrations -> chat -> deploy. |
| Model provider setup is still too technical | Ordinary users will not understand provider/model/API distinctions unless the UI leads them. | UI copy and flow where user connects OpenRouter/OpenAI/etc. and sees a recommended default model. |
| Production credential/channel certification is missing | Local blackbox Telegram tests do not prove production bot/webhook/secrets behavior. | Live environment runbook with a real bot/provider credential and rollback steps. |
| Results/cost story is not proven for a business operator | A deployed agent must show what happened and what it cost. | One end-to-end run where Results shows messages/outcome/cost after a public channel exchange. |

### P1 - Should Fix Before Wider Beta

| Risk | Why It Matters | Required Proof |
|---|---|---|
| Actions/skills/tools/MCP vocabulary can still mix concepts | Users need to know what they are enabling versus what they are connecting. | Actions tab only controls permissions/playbooks; Integrations owns MCP and external accounts. |
| Knowledge retrieval proof is incomplete | Users need confidence that sources affect answers. | Retrieval test shows matched source/citation for a customer-like question. |
| Runtime options may confuse customers | Studio should launch as text/API by default, with computer/self-hosted paths clearly secondary. | Overview/Integrations copy makes `managed_cloud` text agent the default and blocks unsafe runtime choices. |
| Billing/credits need one clear policy | BYOK, hosted credits, and Studio agent usage must not conflict. | Billing doc plus UI states for provider-connected, no-provider, hosted-provider, and cap-exceeded cases. |

## Test Map To Close The Loop

### Existing Tests To Keep Running

Run these before pushing backend/runtime changes:

```bash
PYTHONPATH=. venv/bin/python -m pytest -q \
  server_modules/tests/test_deployed_agent_service.py \
  server_modules/tests/test_deployed_agent_virtual_runtime_service.py \
  server_modules/tests/test_deployed_agent_memory_service.py \
  server_modules/tests/test_provider_catalog_service.py \
  server_modules/tests/test_provider_credential_flows.py \
  server_modules/tests/test_run_state_repository.py \
  server_modules/tests/test_outbox_service.py
```

Run these before claiming Studio public-channel readiness:

```bash
PYTHONPATH=. venv/bin/python -m pytest -q \
  server_modules/tests/e2e/test_public_telegram_blackbox.py \
  server_modules/tests/e2e/test_public_policy_blackbox.py
```

Run these before claiming frontend surface readiness:

```bash
cd frontend
npm run typecheck
npm run test:e2e:deployed-agents
```

### Missing Tests To Add

| Test | Layer | Purpose |
|---|---|---|
| `studio-agent-full-launch.spec.ts` | Frontend E2E | Create agent, set instructions, add source, connect provider/channel, private chat, deploy. |
| `studio-agent-model-provider.spec.ts` | Frontend E2E | Connect provider, refresh models, select recommended model, fallback manual model id. |
| `studio-agent-knowledge-retrieval.spec.ts` | Frontend E2E | Add multiple sources and verify retrieval/test state uses the right source. |
| `studio-agent-results-after-channel.spec.ts` | Frontend E2E + backend fixture | Public customer message appears in Results with usage/cost/activity. |
| `studio-agent-no-provider-deploy-block.py` | Backend/API | Deployment fails clearly when no hosted/provider route is available. |
| `studio-agent-production-runbook.md` | Operations | Live Telegram + real provider smoke with rollback and secret rotation checklist. |

## Recommended Next Engineering Order

1. Let the active UI agent finish its current Studio UI cleanup.
2. Review that UI diff strictly for concept separation: Model, Actions, Memory, Integrations, Runtime.
3. Add the missing frontend full-launch Playwright test.
4. Add no-provider deploy-block backend test if it is not already covered by provider route enforcement.
5. Run the backend blackbox suites and the frontend deployed-agent E2E together.
6. Do one live environment certification with a real Telegram bot and a real provider key.
7. Only then call Studio Agents controlled-pilot ready.

## Controlled Pilot Definition

Studio Agents can be considered controlled-pilot ready when all of these are true:

- A non-technical user can create and deploy a text/API agent without Launch Settings.
- No raw context/token/runtime jargon appears in the default path.
- Model setup uses connected provider accounts and a recommended default model.
- Customer message delivery works through a real channel and durable replay.
- Results shows the conversation and operational outcome.
- Costs/limits block safely and explain what happened.
- A failed provider/channel/outbox path degrades into a clear operator state, not silent failure.

Broad public launch requires production monitoring, live credential certification, billing/cost reconciliation, and support/rollback runbooks on top of this.
