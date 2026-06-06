# Studio Runtime

Status: Active
Owner: Platform
Last verified: 2026-06-06
Source of truth: runtime binding code

## Runtime Modes

Implemented Studio modes:

- `text_agent`: managed cloud, Empyralis supplier, no computer automation, deploy target `cloud_default`.
- `cloud_computer_agent`: hosted hardware pool, Empyralis supplier, allows isolated computer/browser/code/file capabilities, deploy target `sage_cloud_computer`.
- `my_computer_agent`: customer local placement, customer supplier, allows local companion/files/browser, deploy target `local_companion`.
- `self_hosted_agent`: customer-hosted placement, customer supplier, allows self-hosted runtime, remote files, and remote jobs, deploy target `self_host_runtime`.

Source: `server_modules/deployed_agent_runtime_contract_service.py`.

The mode/capability matrix rejects mismatched placement, runtime target, supplier, and computer automation class. Text agents cannot enable computer automation. Cloud-computer automation must use virtual browser, virtual desktop, or virtual code sandbox. My-computer automation must use local browser or local desktop. Any enabled computer automation requires a non-empty domain allowlist, session and budget limits, restricted filesystem default, no inherited host environment, no default software installs, a safe terminal policy, sensitive-action confirmation, emergency stop, and required owner-approval actions. Source: `server_modules/deployed_agent_runtime_contract_service.py`.

Deploy-time validation checks that the expected runtime target exists and, for computer/self-hosted modes, is online and healthy. Source: `server_modules/deployed_agent_runtime_contract_service.py`.

Self-hosted agents require an explicit `runtime_profile_id` and a registered self-hosted node matching that profile before binding metadata is persisted. The binding stores runtime node ids, allowed capabilities, filesystem scope, domain allowlist, approval policy, and quota policy. Source: `server_modules/deployed_agent_service.py`.

Cloud and self-hosted runtime sessions are terminated through bound-session helpers, and runtime action execution rejects forbidden policy override keys before routing actions. Runtime metering records a computer-runtime credit event when a bound cloud runtime session ends. Source: `server_modules/deployed_agent_virtual_runtime_service.py`.

## Separation From Sage

Studio runtime is not Sage runtime. A Studio/deployed agent may use shared
runtime infrastructure, but it must have its own deployed-agent runtime binding,
mode, quotas, approval policy, domain allowlist, and filesystem scope.

Studio Agent Computer access supports guarded behavior only:

- `default_guarded`
- `custom`

Studio must not send `full_access`. If `full_access` appears in Studio computer
automation config, `normalize_runtime_access_mode()` fails closed to
`default_guarded`, and deploy validation rejects the raw request with
`Studio agents cannot use Sage Full Access. Use default_guarded or custom.`
Source: `server_modules/deployed_agent_runtime_contract_service.py`.

That means the same physical computer can eventually host both Sage local work
and Studio local work, but they must remain separate identities:

- Sage: selected Sage Agent Computer, `agent_scope=sage`, personal channels,
  optional Sage Full Access.
- Studio: deployed-agent runtime binding, `agent_scope=studio_agent`, business
  channels, guarded Default or Custom access only in this launch slice.

Migration debt: the launch-readiness doc still treats text/API cloud agents as the default pilot lane and says computer/self-hosted runtime options should remain secondary until the UI and production runbooks are certified. Source: `docs/reports/studio-agents-launch-readiness-2026-05-15.md`.
