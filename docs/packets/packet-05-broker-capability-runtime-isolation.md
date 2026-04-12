stage 5 


**Findings**

- `P0` Direct chat is a real parallel tool engine outside the broker envelope. Approved actions go from [direct_chat_response_service.py#L178](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/direct_chat_response_service.py#L178) to [direct_tool_execution_service.py#L205](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/direct_tool_execution_service.py#L205) to [skills_service.py#L1138](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/skills_service.py#L1138), with no `capability_token`, no `manifest_id`, and no `tool_broker.authorize_connector_action(...)`. The brokered path exists at [connectors_actions.py#L352](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors_actions.py#L352), but direct chat never enters it.
- `P1` Direct chat provider access is workspace-scoped, not install/manifest-scoped. It chooses credentials with [direct_chat_provider_service.py#L59](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/direct_chat_provider_service.py#L59) through [direct_chat_provider_service.py#L86](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/direct_chat_provider_service.py#L86), which pull workspace provider candidates from [provider_profiles.py#L1255](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/provider_profiles.py#L1255) through [provider_profiles.py#L1310](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/provider_profiles.py#L1310). That is broader than a brokered install-specific connector-scope check.
- `P1` Direct connector actions in chat still use `secrets_broker`, but they bypass broker connector-scope enforcement. The execution path is [skills_service.py#L1331](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/skills_service.py#L1331) into [runs_execution.py#L1943](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runs_execution.py#L1943). Secret resolution goes through [runs_execution.py#L1705](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runs_execution.py#L1705) and [runtime_common.py#L397](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runtime_common.py#L397), but there is still no broker manifest/install scope check on that path.
- `P1` `llm__task` and direct HTTP are separate unbrokered execution paths. `llm__task` injects raw credentials at [skills_service.py#L1257](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/skills_service.py#L1257) and hands them to provider fallback at [llm_task.py#L67](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/llm_task.py#L67). Direct HTTP calls [skills_service.py#L1157](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/skills_service.py#L1157) through [skills_service.py#L1168](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/skills_service.py#L1168) without broker mediation.
- `P1` `local_companion` creates a second authentication plane. Enrollment is user/workspace-gated at [runtime_runtime_api.py#L724](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runtime_runtime_api.py#L724) through [runtime_runtime_api.py#L731](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runtime_runtime_api.py#L731), but post-bootstrap runtime operations trust only `runtime_id + session_token + instance_id` via [local_queue.py#L1170](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/local_queue.py#L1170) and runtime endpoints like [runtime_runtime_api.py#L1144](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runtime_runtime_api.py#L1144) and [runtime_runtime_api.py#L1310](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runtime_runtime_api.py#L1310). That is not the same identity model as normal user/workspace auth.
- `P1` Brokered specialist execution itself is real and materially stronger than the side paths. Capability grants bind manifest, tenant, workspace, runtime mode, skills, connector scopes, and action classes at [tool_broker.py#L136](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tool_broker.py#L136) through [tool_broker.py#L176](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tool_broker.py#L176); execution re-verifies them at [tool_broker.py#L360](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tool_broker.py#L360) through [tool_broker.py#L379](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tool_broker.py#L379); connector actions re-check broker scope at [tool_broker.py#L410](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tool_broker.py#L410) through [tool_broker.py#L444](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tool_broker.py#L444). Installed-agent runtime placement is also real at [agent_registry_api.py#L549](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/agent_registry_api.py#L549) through [agent_registry_api.py#L566](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/agent_registry_api.py#L566).
- `P2` Runtime target routing is enforced, not decorative. Placement filters attachment kind, capabilities, connectors, hosted/local mode, and privileged approval in [runtime_attachment_service.py#L703](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runtime_attachment_service.py#L703) through [runtime_attachment_service.py#L826](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runtime_attachment_service.py#L826). Dispatch then rejects mismatched target/mode/attachment state in [run_service.py#L3756](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/run_service.py#L3756) through [run_service.py#L3805](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/run_service.py#L3805).
- `P2` Web/mobile capability gating is backend-driven, not raw-role-driven, but UI enforcement is layered rather than single-point. Backend flags are projected at [entitlements_service.py#L323](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/entitlements_service.py#L323) through [entitlements_service.py#L346](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/entitlements_service.py#L346) and bootstrapped at [workspace_bootstrap_service.py#L254](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/workspace_bootstrap_service.py#L254) through [workspace_bootstrap_service.py#L280](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/workspace_bootstrap_service.py#L280). Web uses [workspace-shell.ts#L215](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/lib/workspace/workspace-shell.ts#L215) through [workspace-shell.ts#L270](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/lib/workspace/workspace-shell.ts#L270). Mobile uses [workspace-shell.js#L132](/Users/mansur/Multi_Agent_Orchestrator_Project/mobile/src/lib/workspace/workspace-shell.js#L132) through [workspace-shell.js#L200](/Users/mansur/Multi_Agent_Orchestrator_Project/mobile/src/lib/workspace/workspace-shell.js#L200). I found no raw-role gating in the audited surface slice.

**Capability Enforcement Map**

- Backend entitlement truth starts in [entitlements_service.py#L323](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/entitlements_service.py#L323) and is projected into bootstrap at [workspace_bootstrap_service.py#L254](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/workspace_bootstrap_service.py#L254).
- Web shell gates routes from bootstrap capabilities in [workspace-shell.ts#L215](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/lib/workspace/workspace-shell.ts#L215) and [workspace-shell.ts#L264](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/lib/workspace/workspace-shell.ts#L264).
- Mobile shell does the same in [workspace-shell.js#L132](/Users/mansur/Multi_Agent_Orchestrator_Project/mobile/src/lib/workspace/workspace-shell.js#L132) and [workspace-shell.js#L173](/Users/mansur/Multi_Agent_Orchestrator_Project/mobile/src/lib/workspace/workspace-shell.js#L173).
- Telegram re-checks workspace channel entitlement at [telegram_poll_dispatch_service.py#L93](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/telegram_poll_dispatch_service.py#L93) through [telegram_poll_dispatch_service.py#L99](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/telegram_poll_dispatch_service.py#L99).
- WhatsApp re-checks workspace channel entitlement at [whatsapp_webhook_service.py#L205](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/whatsapp_webhook_service.py#L205) through [whatsapp_webhook_service.py#L210](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/whatsapp_webhook_service.py#L210).
- Brokered specialist/tool execution enforces tokenized scope at [tool_broker.py#L136](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tool_broker.py#L136), [tool_broker.py#L335](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tool_broker.py#L335), and [tool_broker.py#L410](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tool_broker.py#L410).
- Secret resolution is strongly workspace-bound inside [secrets_broker.py#L105](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/secrets_broker.py#L105) through [secrets_broker.py#L233](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/secrets_broker.py#L233), and enforced on actual resolution at [secrets_broker.py#L322](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/secrets_broker.py#L322) through [secrets_broker.py#L450](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/secrets_broker.py#L450).

**Broker Bypass Candidates**

- Confirmed: direct-chat approved actions at [direct_chat_response_service.py#L178](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/direct_chat_response_service.py#L178).
- Confirmed: direct-chat connector execution at [skills_service.py#L1331](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/skills_service.py#L1331) -> [runs_execution.py#L1943](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runs_execution.py#L1943).
- Confirmed: direct local tools at [skills_service.py#L1315](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/skills_service.py#L1315) -> [runs_execution.py#L3863](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runs_execution.py#L3863). I did not prove full bypass of downstream local tool policy, but this path does bypass `tool_broker`.
- Confirmed: direct `llm__task` at [skills_service.py#L1246](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/skills_service.py#L1246).
- Confirmed: direct HTTP at [skills_service.py#L1157](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/skills_service.py#L1157).

**Runtime Target Isolation Verdict**

- `cloud_default` / hosted execution is real: hosted attachments only, hosted entitlement enforced, and dispatch consistency checked in [runtime_attachment_service.py#L717](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runtime_attachment_service.py#L717) through [runtime_attachment_service.py#L794](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runtime_attachment_service.py#L794), plus [entitlements_service.py#L519](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/entitlements_service.py#L519) through [entitlements_service.py#L545](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/entitlements_service.py#L545).
- `local_companion` is real but uses a second machine-session auth model after enrollment. Enrollment is workspace-scoped; runtime operations afterward trust runtime session, not end-user auth.
- `self_host_runtime` appears as a real attachment target in selection at [runtime_attachment_service.py#L717](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runtime_attachment_service.py#L717) and [workspace_bootstrap_service.py#L47](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/workspace_bootstrap_service.py#L47), but I found no separate self-host bridge/auth plane in [runtime_runtime_api.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runtime_runtime_api.py) or [local_queue.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/local_queue.py).

**Specialist Risk List**

- No confirmed brokered-specialist escape was found. The strongest specialist path I audited, [universal_operator.py#L394](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/universal_operator.py#L394) through [universal_operator.py#L450](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/universal_operator.py#L450), stays inside `tool_broker`, runtime scope, and egress policy.
- The confirmed overbroad path is not a specialist path. It is direct chat, which can use workspace provider credentials from [direct_chat_provider_service.py#L59](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/direct_chat_provider_service.py#L59) without install-manifest scoping.
- Runtime profiles do carry connector scope metadata at [agent_registry_repository.py#L203](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/agent_registry_repository.py#L203) through [agent_registry_repository.py#L216](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/agent_registry_repository.py#L216), but I did not prove that compiled workflow connector nodes enforce that metadata at execution time.

**Confirmed Findings**

- Brokered specialist/tool execution is real.
- Runtime target placement is real.
- Channel entitlement enforcement for Telegram and WhatsApp is real.
- Web/mobile shell gating is backend-capability-driven.
- Direct chat is still a separate, powerful execution system outside the broker envelope.
- `local_companion` still introduces a second auth plane.

**Unproven Suspicions**

- Compiled workflow connector nodes may also be broader than install-specific connector policy, because [runs_execution.py#L1702](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runs_execution.py#L1702) through [runs_execution.py#L1743](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runs_execution.py#L1743) select workspace credentials by connector, not obviously by install scope.
- Direct local tool execution may still hit strong downstream policy inside [run_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/run_service.py); I did not fully audit that internal branch in this stage.
- A stale or misbound local runtime record could remain trusted by runtime-session auth until re-registration, because runtime operational calls do not re-check workspace/tenant on every request.

**Exact Next Files To Inspect**

- [run_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/run_service.py)
- [no_provider_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/no_provider_service.py)
- [direct_tool_approval_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/direct_tool_approval_service.py)
- [runs_execution.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runs_execution.py)
- [runtime_runtime_api.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runtime_runtime_api.py)
- [local_queue.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/local_queue.py)

**Verdict**

This audit category does **not** pass today.

Capability and runtime isolation are real for brokered specialists, runtime placement, and channel entitlement checks. But they are not universal. The platform still has:
- a direct-chat sidecar engine that bypasses the broker envelope
- a separate machine-session auth plane for `local_companion`

So capability and runtime isolation are **partly real and partly performative**, depending on which execution surface the request enters through.





