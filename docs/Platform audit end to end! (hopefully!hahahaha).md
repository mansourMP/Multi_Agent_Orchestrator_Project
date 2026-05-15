• 1. Executive verdict:
     PARTIAL: P1 RISKS

  Closed-pilot core is working, but the full platform is not clean enough to call “ready” broadly. No new P0 closed-
  pilot blocker found. The biggest blockers to full-platform confidence are failing backend suites, channel/shop-agent
  tenant binding failures, stale Gateway test expectations, and visible IA label problems.

  2. P0 blockers table:
     | ID | Subsystem | Issue | Evidence | Impact | Fix |
     |---|---|---|---|---|---|
     | P0-1 | Closed pilot | None found for the Web Sage + Gateway smoke path | Smoke evidence persisted for trace
     0b41b5f6-08a3-4c53-ac6e-2f4b2e0eee8e; Activity and audit rows found | Closed pilot can proceed | Keep smoke
     runbook as release gate |
  3. P1 risks table:
     | ID | Subsystem | Issue | Evidence | Impact | Fix |
     |---|---|---|---|---|---|
     | P1-1 | Backend full suite | Full backend sweep stops at 30 failures | 3199 collected, 30 failed, 1626 passed,
     stopped by --maxfail=30 | Not safe to claim full platform readiness | Stabilize failing clusters before broad
     launch |
     | P1-2 | Channels / shop agent | Channel E2E falls back because workspace tenant binding fails |
     test_channel_execution_service.py: Workspace 'ws-1' is not bound to a tenant; status becomes completed not
     answered | Business workflow path is partial | Fix test/current-user tenant contract and verify durable approval/
     billing |
     | P1-3 | Studio billing/cost caps | Deployed-agent cost-cap tests failing |
     test_deployed_agent_cost_cap_service.py 5 failures | Spend controls not fully proven by full suite | Fix cost-cap
     settlement tests/logic |
     | P1-4 | Gateway test truth | Some Gateway tests still expect risky local tool execution with
     interactive_approvals=false | test_gateway_routes.py: expected 200, got 403 | Tests conflict with hardened safety
     policy | Update stale tests to approval-required behavior |
     | P1-5 | UI IA labels | Marketplace is labeled Memory; Settings is labeled Activity & Safety | shared/nav-
     manifest.js:19, shared/nav-manifest.js:35 | User navigation is misleading | Re-label without changing routes |
     | P1-6 | Gateway doctor | Gateway health/doctor focused suite has 4 failures | test_gateway_health_service.py
     failures | Operator diagnostics partial | Repair doctor payload expectations/state setup |
     | P1-7 | Local test env | Shell has no DATABASE_URL; some tests hit unwritable ~/.empyralis/state/auth/users.db |
     env output empty; failures show parent_writable: False | Full local verification noisy | Standardize test env
     state home/DB setup |
  4. P2 backlog table:
     | ID | Subsystem | Issue | Evidence | Impact | Fix |
     |---|---|---|---|---|---|
     | P2-1 | Mobile | Lint passes with warnings | 15 warnings, 0 errors | Cleanup only | Remove unused vars/types |
     | P2-2 | Marketplace | Mostly preview/install contract, not real payment marketplace | preview_only,
     billing_product_id, install blockers in marketplace service/UI | Not launch-critical | Keep excluded from pilot |
     | P2-3 | Mobile/Desktop breadth | Many mobile surfaces exist beyond pilot | mobile/app/* includes apps, memory,
     machines, automations | IA complexity | Audit after backend P1s |
  5. Fully implemented table:
     | Area | Status | Evidence |
     |---|---|---|
     | Sage runtime | PASS | server_modules/sage_agent_runtime_service.py:314, Sage focused tests 42 passed |
     | Sage safety/memory exclusion | PASS | server_modules/sage_memory_service.py:496, memory tests 110 passed |
     | Transparency model/store | PASS | transparency/activity focused tests 105 passed |
     | Runtime honesty for Cloud/My Computer/Self-hosted | PASS focused | runtime tests 42 passed; server_modules/
     virtual_computer_runtime.py:56 |
     | Gateway TS runtime | PASS | Gateway TS/node tests 100 passed |
     | Frontend typecheck | PASS | cd frontend && npm run typecheck exited 0 |
     | Security/auth/redaction focused | PASS | security focused tests 141 passed |
  6. Partially implemented table:
     | Area | Status | Evidence |
     |---|---|---|
     | Full backend platform | PARTIAL | 30 failed, stopped before full completion |
     | Studio business/shop workflow | PARTIAL | shop/channel tenant failures and cost-cap failures |
     | Gateway operator diagnostics | PARTIAL | doctor payload focused failures |
     | Personal Telegram/WhatsApp live | PARTIAL | code/tests exist, but runbook marks live channel smoke as follow-up
     |
     | Activity timeline at high volume | PARTIAL | filtered trace lookup works; unfiltered/noisy Gateway events can
     be slow |
  7. Fake/stubbed/in-memory table:
     | Area | Finding | Launch impact |
     |---|---|---|
     | Cloud computer in-memory | Dev/test only when explicit; production/staging fails closed | Safe for pilot |
     | Marketplace packages | Many preview-* packages and preview-only blockers | P2, not pilot |
     | Self-hosted | Provider/binding tests exist, but real Mac Mini live node smoke not proven in this audit | P1 for
     self-hosted launch, not current closed pilot |
  8. Unsafe table:
     | Area | Finding | Severity |
     |---|---|---|
     | Risky Gateway action without approvals | Hardened path blocks it; stale test still expects old unsafe behavior
     | P1 test debt |
     | Production localhost config | Guards exist for frontend/mobile/gateway; focused tests pass | No P0 |
     | Secret scan | No committed live secret proven; examples/tests contain expected placeholders and source
     identifiers | No P0 |
     | UI jargon | local_companion, runtime_class, runtime_choice, attachment_kind still appear in frontend internals
     | P1 if user-visible in Studio/details |
  9. UI information architecture issues:
     | Issue | Evidence | Fix |
     |---|---|---|
     | Marketplace mislabeled as Memory | shared/nav-manifest.js:19 | Label as Marketplace/Discover or remove from
     pilot nav |
     | Settings mislabeled as Activity & Safety | shared/nav-manifest.js:35 | Split Activity/Safety from Settings or
     label truthfully |
     | Sage Memory is valid | Sage group has memory child under Sage | Keep Sage Memory as Sage Memory |
     | Gateway channels should read Personal Channels | Gateway channel code is personal-channel scoped | Recheck copy
     only, not backend |
  10. Tests run:
     | Command | Result | Failure summary |
     |---|---|---|
     | PYTHONPATH=. venv/bin/python -m pytest server_modules/tests/test_*.py -v --maxfail=30 | FAIL | 30 failed, 1626
     passed, stopped early |
     | cd empyralis-gateway && ./node_modules/.bin/tsc -p tsconfig.json && node --test dist/__tests__/*.test.js | PASS
     | 100 passed |
     | cd frontend && npm run typecheck | PASS | no TS errors |
     | cd mobile && npm run lint | PASS with warnings | 15 warnings, 0 errors |
     | Sage focused tests | PASS | 42 passed |
     | Runtime mode tests | PASS | 42 passed |
     | Gateway focused Python tests | FAIL | 7 failed, 125 passed |
     | Channel tests | FAIL | 2 failed, 71 passed |
     | Memory/retention tests | PASS | 110 passed |
     | Transparency/activity tests | PASS | 105 passed |
     | Auth/security/redaction tests | PASS | 141 passed |
  11. Smoke result:

  - Status: PASSED for closed-pilot Web Sage + Gateway path.
  - Trace ID: 0b41b5f6-08a3-4c53-ac6e-2f4b2e0eee8e
  - Gateway ID: gateway_8c0fcd40-09cf-4554-8e6d-d59233854486
  - Activity evidence: aevt_54114b196c22404f Sage chat, plus Gateway approval/execution rows.
  - Audit evidence: 5 security_audit rows for the trace, including sage_chat.completed, approval.requested,
    approval.approved, approval.executed.
  - Provider/model from prior smoke: deepseek / deepseek-chat.

  12. What to do next:
     Next phase: P1 Backend Truth Stabilization.

  Scope should be only:

  - Fix tenant/local-identity setup in failing channel/shop/deployed-agent tests.
  - Update stale Gateway tests to match approval-required hardening.
  - Repair Gateway doctor payload tests.
  - Fix deployed-agent cost-cap settlement tests.
  - Re-run full backend sweep until it completes cleanly or leaves only documented non-pilot skips.

  13. Final recommendation:
     Fix P1 first.

  Do not start broad UI polish yet. The closed pilot path is good, but the full platform audit is still partial
  because backend truth is not clean. UI IA cleanup should come immediately after the P1 backend sweep i