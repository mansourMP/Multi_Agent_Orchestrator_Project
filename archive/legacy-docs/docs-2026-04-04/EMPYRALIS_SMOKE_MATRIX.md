# Empyralis Smoke Matrix

## Goal
Prove the platform's core control-plane and local-execution-plane loop works end-to-end before adding more orchestration complexity.

This matrix is split into:
- automated deterministic checks
- manual channel/UI checks

The automated checks avoid LLM variance where possible.

## Automated deterministic checks

| ID | Flow | Surface(s) Covered | Expected Result |
| --- | --- | --- | --- |
| A1 | Runtime health | Runtime, local stack | `/health` reachable, runtime OK, local companion enabled |
| A2 | Connector inventory | Integrations | `/connectors/vault` returns valid payload |
| A3 | Agent-owned local file run | Workbench, Agents, Runs, Artifacts | `local-execution-v1` run completes with explicit `agent_role`, result visible in history and agent workspace |
| A4 | Artifact preview | Artifacts, Run Inspect | file artifact preview endpoint returns valid preview payload |
| A5 | Approval-gated local shell run | Approvals, Runs, local companion | run starts in `waiting_for_input`, approval resumes execution, run completes |
| A6 | Approval audit trail | Approvals audit | audit contains the approved local run |
| A7 | Agent detail hydration | Agents | `/agents/workspace/agents/{agent_role}` reflects the recent run |

## Manual / conditional checks

| ID | Flow | Why Manual |
| --- | --- | --- |
| M1 | Direct agent chat in Workbench | UI-driven, backed by live model/runtime behavior |
| M2 | Connector-assigned inbound routing (Telegram/WhatsApp) | Requires external inbound message |
| M3 | Screenshot capture | Depends on host OS display/session permissions |
| M4 | Visual QA (`Workbench`, `Runs`, `Artifacts`, `Approvals`) | Screenshot/browser judgment, not API truth |

## Command

```bash
RUNTIME_KEY='replace-with-strong-key' bash scripts/empyralis_core_smoke.sh
```

Optional screenshot step:

```bash
RUNTIME_KEY='replace-with-strong-key' EMPYRALIS_SMOKE_SCREENSHOT=1 bash scripts/empyralis_core_smoke.sh
```

## Notes
- Automated smoke uses `local-execution-v1` because it is deterministic and exercises the real local companion path.
- Approval smoke intentionally overrides `action_policy.blocked_actions` so `execute_shell_command` becomes `approval_required` instead of permanently blocked.
- The matrix is green only when all automated checks pass. Manual checks are tracked separately.
