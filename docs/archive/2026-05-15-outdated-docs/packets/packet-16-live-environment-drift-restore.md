stage 16

**Findings**

- `P0` The live local runtime exposes far too much operational detail on unauthenticated `/health`. On April 12, 2026, `GET http://127.0.0.1:8001/health` returned provider-profile health, workspace IDs, absolute state-file paths, connector state, queue backlog, vault metadata, and runtime topology. The cloud blueprint also makes `/health` the public health check path in [render.yaml](/Users/mansur/Multi_Agent_Orchestrator_Project/render.yaml#L12). That means the deployed contract and the live payload do not meet a hardened public-health standard.
- `P1` The live local deployment is not the same system implied by the repo’s local wrapper paths. The runtime is live on `127.0.0.1:8001`, but ports `3000`, `4000`, and `8000` were down. The wrapper state under [.orion-stack](/Users/mansur/Multi_Agent_Orchestrator_Project/.orion-stack) contains zero-byte [auth.db](/Users/mansur/Multi_Agent_Orchestrator_Project/.orion-stack/auth.db) and [runtime-state.sqlite3](/Users/mansur/Multi_Agent_Orchestrator_Project/.orion-stack/runtime-state.sqlite3), while the actual live state sits under [/Users/mansur/.empyralis/state](/Users/mansur/.empyralis/state).
- `P1` Secret injection is fallback-driven and not singular in the live environment. [.orion-stack/stack.env](/Users/mansur/Multi_Agent_Orchestrator_Project/.orion-stack/stack.env) contains blank JWT secret vars, [backend/.env](/Users/mansur/Multi_Agent_Orchestrator_Project/backend/.env) contains `DATABASE_URL`, the project [.env](/Users/mansur/Multi_Agent_Orchestrator_Project/.env) contains secret env keys, and the live auth secret file exists at [/Users/mansur/.empyralis/state/auth/jwt_secret](/Users/mansur/.empyralis/state/auth/jwt_secret). That matches the repo fallback behavior in [db.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/db.py#L39) and the secret-file model in [jwt_secret.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/jwt_secret.py#L9), but it disproves a single controlled injection path.
- `P1` Local companion reality is drifted. The process table showed a live worker process and uvicorn runtime, but live `/health` reported `online_workers: 0`, `claimed_count: 0`, and `queued_count: 105` for the local queue. That is an active contradiction between process reality and runtime control-plane reality.
- `P1` Channel config and live runtime state are drifted. [.orion-stack/stack.env](/Users/mansur/Multi_Agent_Orchestrator_Project/.orion-stack/stack.env) has Telegram and WhatsApp autopilot enabled with `local_companion` targets, but live `/health` reported both autopilots disabled, Telegram thread not alive, and Telegram failure state caused by disk exhaustion plus legacy-table errors. The live Telegram state file exists at [/Users/mansur/.empyralis/state/channels/telegram/autopilot_state.json](/Users/mansur/.empyralis/state/channels/telegram/autopilot_state.json).
- `P1` Runtime-target truth is not aligned between repo and live runtime contract. Repo policy still includes `self_host_runtime` in [runtime_attachment_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runtime_attachment_service.py#L20), but the live `/health` contract only advertised `auto`, `cloud`, and `local_companion`.
- `P1` Restoreability is not proven in the real environment. I found live state files, but no backup artifacts in `~/.empyralis`, `~/.orion-stack`, or [.orion-stack](/Users/mansur/Multi_Agent_Orchestrator_Project/.orion-stack), and no live restore-success evidence. The cloud doc still gives deployment verification, not restore verification, in [cloud-runtime-baseline.md](/Users/mansur/Multi_Agent_Orchestrator_Project/deployment/cloud-runtime-baseline.md#L1).
- `P1` Observability is real but stale and partial in the live environment. The runtime log is active at [runtime.log](/Users/mansur/Multi_Agent_Orchestrator_Project/.orion-stack/logs/runtime.log), the worker log is active at [worker.log](/Users/mansur/Multi_Agent_Orchestrator_Project/.orion-stack/logs/worker.log), and a doctor snapshot exists at [/Users/mansur/.empyralis/state/diagnostics/doctor_latest.json](/Users/mansur/.empyralis/state/diagnostics/doctor_latest.json). But the ops daemon port `8787` was unreachable even though [ops-daemon.log](/Users/mansur/Multi_Agent_Orchestrator_Project/.orion-stack/logs/ops-daemon.log) says it was listening, and I found no live alerting/dashboard proof.

**Repo-Vs-Live Drift Matrix**

| Surface | Repo truth | Live proof | Verdict |
|---|---|---|---|
| Runtime API version | Defaults are `1.0.0` / `2026.2.0` in [runtime_config.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runtime_config.py#L586) | Local `/health` reported `runtime_api_version=1.0.0`, `runtime_api_min_cli_version=2026.2.0`, `runtime_contract_schema_version=2026.2.0` | `Match` |
| Public health contract | Cloud uses public `/health` in [render.yaml](/Users/mansur/Multi_Agent_Orchestrator_Project/render.yaml#L12) | Live `/health` exposed sensitive operational metadata without auth | `Contradiction` |
| Local state home | Scripts/wrappers emphasize [.orion-stack](/Users/mansur/Multi_Agent_Orchestrator_Project/.orion-stack) | Actual live state is under [/Users/mansur/.empyralis/state](/Users/mansur/.empyralis/state); `.orion-stack` DB files are zero-byte | `Drift` |
| Deploy shape | Cloud docs describe runtime + web + Postgres in [cloud-runtime-baseline.md](/Users/mansur/Multi_Agent_Orchestrator_Project/deployment/cloud-runtime-baseline.md#L1) | Only local runtime and worker were actually up; web/frontend were not live | `Drift` |
| Runtime targets | Repo still models `self_host_runtime` in [runtime_attachment_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runtime_attachment_service.py#L20) | Live contract did not advertise `self_host_runtime` | `Drift` |
| Channel execution flags | [.orion-stack/stack.env](/Users/mansur/Multi_Agent_Orchestrator_Project/.orion-stack/stack.env) enables Telegram/WhatsApp autopilot | Live `/health` reports both disabled and Telegram unhealthy | `Drift` |
| Ops daemon | Scripts/logs expect daemon on `8787` | Port `8787` was unreachable and no live daemon process was proven | `Drift` |
| Secret sources | Render/docs imply env-managed deployment; repo has multiple fallbacks in [db.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/db.py#L39) | Live runtime depends on `.env`, `backend/.env`, state files, and vaults | `Drift` |

**Schema / Config Drift List**

- Live SQLite stores do not expose a migration ledger. `/Users/mansur/.empyralis/state/runtime/state.db` had no migration/version tables, and `/Users/mansur/.empyralis/state/auth/users.db` had no schema-migration ledger either.
- The local wrapper DB files in [.orion-stack](/Users/mansur/Multi_Agent_Orchestrator_Project/.orion-stack) are stale placeholders, not the live state source.
- `DATABASE_URL` was not present in the shell env I inspected, but [backend/.env](/Users/mansur/Multi_Agent_Orchestrator_Project/backend/.env) contains it, which aligns with the hidden fallback path in [db.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/db.py#L39).
- [.orion-stack/stack.env](/Users/mansur/Multi_Agent_Orchestrator_Project/.orion-stack/stack.env) carries blank JWT secret vars while the live auth secret actually lives in [/Users/mansur/.empyralis/state/auth/jwt_secret](/Users/mansur/.empyralis/state/auth/jwt_secret).
- Live runtime health advertised only `auto`, `cloud`, and `local_companion`, so `self_host_runtime` is still repo-visible but not live-contract-visible.
- No live web build version or mobile build version could be verified because no local web surface was running and no live public deployment URL was available from this workspace.

**Backup / Restore Proof Summary**

- `Existence`: live data definitely exists in [/Users/mansur/.empyralis/state/runtime/state.db](/Users/mansur/.empyralis/state/runtime/state.db), [/Users/mansur/.empyralis/state/auth/users.db](/Users/mansur/.empyralis/state/auth/users.db), [/Users/mansur/.empyralis/state/providers/profiles.json](/Users/mansur/.empyralis/state/providers/profiles.json), [/Users/mansur/.empyralis/state/channels/dead_letters.json](/Users/mansur/.empyralis/state/channels/dead_letters.json), and [.orion-stack](/Users/mansur/Multi_Agent_Orchestrator_Project/.orion-stack) logs/session files.
- `Coverage`: I verified local runtime/auth/file state exists, but I did not have direct live Postgres access, Render access, or enterprise/self-host infrastructure access.
- `Restore procedure`: repo docs prove deployment verification, not restore verification, in [cloud-runtime-baseline.md](/Users/mansur/Multi_Agent_Orchestrator_Project/deployment/cloud-runtime-baseline.md#L1).
- `Restore success evidence`: none found in live state directories. No backup-like files were present under `~/.empyralis`, `~/.orion-stack`, or [.orion-stack](/Users/mansur/Multi_Agent_Orchestrator_Project/.orion-stack).
- `Workspace restore`: unproven.
- `Tenant restore`: unproven.
- `Local companion restore`: only partially inferable from live state presence; not proven by backup/restore evidence.
- `Enterprise/self-host restore`: completely unverified from this environment.

**Observability Proof Summary**

- `Active and proven locally`: runtime logs, worker logs, unauthenticated `/health`, doctor snapshot files, and local state files.
- `Incident signals observed live`: saturated local queue, zero online workers, Telegram autopilot dead, disk-space error, legacy approval-table error, and worker browser navigation failures.
- `Active alerts`: not proven.
- `Dashboards`: not proven.
- `External metrics backend`: not proven.
- `Ops daemon`: log artifact exists, but live health endpoint on `8787` was unreachable.
- `Signal freshness`: weak. [/Users/mansur/.empyralis/state/diagnostics/doctor_latest.json](/Users/mansur/.empyralis/state/diagnostics/doctor_latest.json) was stale relative to the current audit date and cannot be treated as a strong live-control surface.

**Strongest Live-Environment Contradictions**

- A public-health contract is configured, but the live health payload is operationally sensitive.
- A live worker process exists, but the runtime thinks no workers are online.
- Wrapper DB files exist locally, but the real state is elsewhere.
- Stack config enables channel autopilot, but the live runtime reports it disabled and broken.
- Ops-daemon logs imply a live watcher, but the port was dead.
- Repo policy still advertises `self_host_runtime`, but the live runtime contract does not.
- Secret/config injection is spread across `.env`, `backend/.env`, stack env, state files, and vault behavior instead of one operator-controlled path.
- The live runtime log records control-stream query strings in [runtime.log](/Users/mansur/Multi_Agent_Orchestrator_Project/.orion-stack/logs/runtime.log), which includes session-bearing parameters and should not be treated as clean audit-safe logging.

**Confirmed Findings**

- I could verify a live local runtime on this machine.
- I could not verify a live cloud Render deployment or enterprise/self-host deployment from the available access.
- The local live runtime does not fully match the repo’s advertised deployment shape.
- Live `/health` disclosure is too broad for a public health surface.
- Live local state is split between `~/.empyralis/state` and project-local wrapper directories.
- Backup/restore is not proven in the actual live environment.
- Observability is present, but not strong enough to claim trustworthy live recovery control.

**Unproven Suspicions**

- The live runtime may be using Postgres via hidden fallback rather than explicit operator env wiring, but I did not inspect the actual DSN value.
- A real cloud deployment may have additional private controls, alerts, or backups outside this machine, but they were not accessible here.
- Enterprise/self-host deployment automation may exist in external infra repos or operator systems not present in this workspace.

**Exact Next Files To Inspect**

- [render.yaml](/Users/mansur/Multi_Agent_Orchestrator_Project/render.yaml)
- [deployment/cloud-runtime-baseline.md](/Users/mansur/Multi_Agent_Orchestrator_Project/deployment/cloud-runtime-baseline.md)
- [server_modules/db.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/db.py)
- [server_modules/runtime_config.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runtime_config.py)
- [server_modules/runtime_attachment_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runtime_attachment_service.py)
- [.orion-stack/start.meta.json](/Users/mansur/Multi_Agent_Orchestrator_Project/.orion-stack/start.meta.json)
- [.orion-stack/stack.env](/Users/mansur/Multi_Agent_Orchestrator_Project/.orion-stack/stack.env)
- [.orion-stack/logs/runtime.log](/Users/mansur/Multi_Agent_Orchestrator_Project/.orion-stack/logs/runtime.log)
- [/Users/mansur/.empyralis/state/runtime/state.db](/Users/mansur/.empyralis/state/runtime/state.db)
- [/Users/mansur/.empyralis/state/auth/users.db](/Users/mansur/.empyralis/state/auth/users.db)

**Verdict**

This audit category does **not** pass.

