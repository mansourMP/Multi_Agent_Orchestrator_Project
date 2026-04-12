stage 12 

**Findings**

- `P0` Secret hardening is not fail-closed. Both broker layers fall back to hardcoded signing secrets if env is unset in [secrets_broker.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/secrets_broker.py#L79) and [tool_broker.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tool_broker.py#L87). JWT secret resolution can also seed from `ORION_API_KEY`/`RUNTIME_KEY` in [jwt_secret.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/jwt_secret.py#L27) and [jwt_secret.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/jwt_secret.py#L67).
- `P0` The production auth-disable guard is config-drift prone. Auth only treats `ENV=prod|production` as production in [auth.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/auth.py#L567), but the cloud blueprint sets `ORION_ENV=production`, not `ENV`, in [render.yaml](/Users/mansur/Multi_Agent_Orchestrator_Project/render.yaml#L19). If `ORION_AUTH_REQUIRED=0` is ever set, the guard in [auth.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/auth.py#L4433) depends on the wrong production variable.
- `P1` The repo does not describe one deployable system. The legacy compose stack still targets `./backend` and port `4000` in [docker-compose.yml](/Users/mansur/Multi_Agent_Orchestrator_Project/docker-compose.yml#L17), [docker-compose.yml](/Users/mansur/Multi_Agent_Orchestrator_Project/docker-compose.yml#L20), and [docker-compose.yml](/Users/mansur/Multi_Agent_Orchestrator_Project/docker-compose.yml#L24), while the current cloud path is FastAPI from [Dockerfile.runtime](/Users/mansur/Multi_Agent_Orchestrator_Project/Dockerfile.runtime#L1) and [render.yaml](/Users/mansur/Multi_Agent_Orchestrator_Project/render.yaml#L6).
- `P1` Config truth is decentralized and side-effectful. `runtime_config.py` auto-loads `.env` at import time in [runtime_config.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runtime_config.py#L359), `db.py` silently backfills `DATABASE_URL` from `backend/.env` in [db.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/db.py#L18) and [db.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/db.py#L41), and missing Postgres degrades to memory/SQLite in [db.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/db.py#L72).
- `P1` Local deployment scripts persist and expose secrets. The stack launcher writes runtime key, OpenAI key, JWT secret, and other env into `.orion-stack` files in [start_orion_local_stack.sh](/Users/mansur/Multi_Agent_Orchestrator_Project/scripts/start_orion_local_stack.sh#L147), [start_orion_local_stack.sh](/Users/mansur/Multi_Agent_Orchestrator_Project/scripts/start_orion_local_stack.sh#L151), and [start_orion_local_stack.sh](/Users/mansur/Multi_Agent_Orchestrator_Project/scripts/start_orion_local_stack.sh#L161), then prints the runtime key in [start_orion_local_stack.sh](/Users/mansur/Multi_Agent_Orchestrator_Project/scripts/start_orion_local_stack.sh#L879).
- `P1` CI and security automation do not cover the full shipped artifact set. Security audit covers Python plus `frontend` and `mobile` Node deps in [security-baseline.yml](/Users/mansur/Multi_Agent_Orchestrator_Project/.github/workflows/security-baseline.yml#L33) and [security-baseline.yml](/Users/mansur/Multi_Agent_Orchestrator_Project/.github/workflows/security-baseline.yml#L50), but not root Node deps, [bridge/package.json](/Users/mansur/Multi_Agent_Orchestrator_Project/bridge/package.json#L1), or Rust crates. CI also typechecks mobile in [ci.yml](/Users/mansur/Multi_Agent_Orchestrator_Project/.github/workflows/ci.yml#L58) even though [mobile/package.json](/Users/mansur/Multi_Agent_Orchestrator_Project/mobile/package.json#L1) declares no TypeScript toolchain at all.
- `P1` Desktop shipping is environment-dependent. Tauri prefers bundled backend assets, but falls back to `backend/dist`, `uvicorn`, virtualenv Python, or host Python paths in [src-tauri/src/lib.rs](/Users/mansur/Multi_Agent_Orchestrator_Project/src-tauri/src/lib.rs#L1010), [src-tauri/src/lib.rs](/Users/mansur/Multi_Agent_Orchestrator_Project/src-tauri/src/lib.rs#L1038), and [src-tauri/src/lib.rs](/Users/mansur/Multi_Agent_Orchestrator_Project/src-tauri/src/lib.rs#L1329). The desktop artifact can therefore run different backends on different machines.
- `P2` `self_host_runtime` is selectable in policy but not proven as a first-class deploy surface. It is defined in [runtime_attachment_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runtime_attachment_service.py#L70), yet it still maps to `execution_target="cloud"` and `connection_mode="workspace_hosted"` in [runtime_attachment_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runtime_attachment_service.py#L72). I did not find a distinct self-host bootstrap surface comparable to [render.yaml](/Users/mansur/Multi_Agent_Orchestrator_Project/render.yaml#L1) or the local companion APIs in [runtime_runtime_api.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runtime_runtime_api.py#L68).
- `P2` Supply-chain trust is mixed. Python requirements are partly floating in [requirements.txt](/Users/mansur/Multi_Agent_Orchestrator_Project/requirements.txt#L1), MCP dynamically imports local modules in [mcp_server.py](/Users/mansur/Multi_Agent_Orchestrator_Project/mcp_server.py#L39), and vault crypto can fall back to host `openssl` in [vault_store.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/vault_store.py#L81).

**Build/Deploy Surface Map**

- `Cloud runtime`: [render.yaml](/Users/mansur/Multi_Agent_Orchestrator_Project/render.yaml#L1), [Dockerfile.runtime](/Users/mansur/Multi_Agent_Orchestrator_Project/Dockerfile.runtime#L1), [frontend/Dockerfile](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/Dockerfile#L1), documented in [cloud-runtime-baseline.md](/Users/mansur/Multi_Agent_Orchestrator_Project/deployment/cloud-runtime-baseline.md#L1).
- `Desktop app`: root build scripts in [package.json](/Users/mansur/Multi_Agent_Orchestrator_Project/package.json#L4), Tauri crate in [src-tauri/Cargo.toml](/Users/mansur/Multi_Agent_Orchestrator_Project/src-tauri/Cargo.toml#L1), release workflow in [build.yml](/Users/mansur/Multi_Agent_Orchestrator_Project/.github/workflows/build.yml#L25).
- `Local/operator stack`: [start_orion_local_stack.sh](/Users/mansur/Multi_Agent_Orchestrator_Project/scripts/start_orion_local_stack.sh), [orion_environment_readiness.sh](/Users/mansur/Multi_Agent_Orchestrator_Project/scripts/orion_environment_readiness.sh#L1), [orion_release_gate.sh](/Users/mansur/Multi_Agent_Orchestrator_Project/scripts/orion_release_gate.sh#L1).
- `Legacy/stale surface`: [docker-compose.yml](/Users/mansur/Multi_Agent_Orchestrator_Project/docker-compose.yml#L1).
- `Not truly mounted`: mobile shell build surface is still skeletal in [mobile/package.json](/Users/mansur/Multi_Agent_Orchestrator_Project/mobile/package.json#L1).

**Config-Source Map**

- `Import-time global config`: [runtime_config.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runtime_config.py#L359).
- `Database DSN`: env first, then `backend/.env`, then runtime falls back to non-Postgres state in [db.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/db.py#L18) and [db.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/db.py#L72).
- `Auth mode`: [runtime_config.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runtime_config.py#L373), [auth.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/auth.py#L559), [auth.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/auth.py#L4433).
- `Frontend API targeting`: [control-plane-base-url.ts](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/lib/server/control-plane-base-url.ts#L4).
- `Cloud deploy env`: generated/manual values in [render.yaml](/Users/mansur/Multi_Agent_Orchestrator_Project/render.yaml#L15) and [cloud-runtime-baseline.md](/Users/mansur/Multi_Agent_Orchestrator_Project/deployment/cloud-runtime-baseline.md#L31).

**Secret-Flow Map**

- `Entry`: Render env vars in [render.yaml](/Users/mansur/Multi_Agent_Orchestrator_Project/render.yaml#L27), GitHub Action secrets materialized in [build.yml](/Users/mansur/Multi_Agent_Orchestrator_Project/.github/workflows/build.yml#L61) and [build.yml](/Users/mansur/Multi_Agent_Orchestrator_Project/.github/workflows/build.yml#L174), local stack env in [start_orion_local_stack.sh](/Users/mansur/Multi_Agent_Orchestrator_Project/scripts/start_orion_local_stack.sh#L147).
- `Storage`: JWT secret file in [jwt_secret.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/jwt_secret.py#L9), vault file and key file in [vault_store.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/vault_store.py#L30) and [vault_store.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/vault_store.py#L226), `.orion-stack` files in [start_orion_local_stack.sh](/Users/mansur/Multi_Agent_Orchestrator_Project/scripts/start_orion_local_stack.sh#L161).
- `Cross-process propagation`: ops daemon forwards runtime key in subprocess env in [orion_ops_daemon.py](/Users/mansur/Multi_Agent_Orchestrator_Project/scripts/orion_ops_daemon.py#L184).
- `Exposure points`: hardcoded dev broker secrets in [secrets_broker.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/secrets_broker.py#L79) and [tool_broker.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tool_broker.py#L87), runtime key echo in [start_orion_local_stack.sh](/Users/mansur/Multi_Agent_Orchestrator_Project/scripts/start_orion_local_stack.sh#L879), JWT seeding from runtime key in [jwt_secret.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/jwt_secret.py#L27).

**Supply-Chain Risk List**

- Partial Python pinning in [requirements.txt](/Users/mansur/Multi_Agent_Orchestrator_Project/requirements.txt#L1) and [requirements-worker.txt](/Users/mansur/Multi_Agent_Orchestrator_Project/requirements-worker.txt#L1).
- Mixed-runtime ship model: Node + Rust + Python + PyInstaller in [build.yml](/Users/mansur/Multi_Agent_Orchestrator_Project/.github/workflows/build.yml#L33) and [build.yml](/Users/mansur/Multi_Agent_Orchestrator_Project/.github/workflows/build.yml#L100).
- Dynamic module loading in [mcp_server.py](/Users/mansur/Multi_Agent_Orchestrator_Project/mcp_server.py#L39).
- Host binary dependency on `openssl` in [vault_store.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/vault_store.py#L81) and `jq` in [orion_environment_readiness.sh](/Users/mansur/Multi_Agent_Orchestrator_Project/scripts/orion_environment_readiness.sh#L24).
- Security automation does not audit all Node/Rust surfaces in [security-baseline.yml](/Users/mansur/Multi_Agent_Orchestrator_Project/.github/workflows/security-baseline.yml#L50).

**Environment-Drift Matrix**

- `Cloud doc vs compose`: current cloud path is Render + FastAPI + persistent disk in [cloud-runtime-baseline.md](/Users/mansur/Multi_Agent_Orchestrator_Project/deployment/cloud-runtime-baseline.md#L3), while compose still describes a different backend system in [docker-compose.yml](/Users/mansur/Multi_Agent_Orchestrator_Project/docker-compose.yml#L17).
- `Prod env naming`: deploy blueprint uses `ORION_ENV` in [render.yaml](/Users/mansur/Multi_Agent_Orchestrator_Project/render.yaml#L19), but auth production detection reads `ENV` in [auth.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/auth.py#L567).
- `DB durability`: cloud baseline requires Postgres and persistent disk in [cloud-runtime-baseline.md](/Users/mansur/Multi_Agent_Orchestrator_Project/deployment/cloud-runtime-baseline.md#L10), but runtime silently degrades without `DATABASE_URL` in [db.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/db.py#L72).
- `Desktop runtime`: release workflow builds one artifact in [build.yml](/Users/mansur/Multi_Agent_Orchestrator_Project/.github/workflows/build.yml#L100), but the shipped app can still resolve alternate backends from the host in [src-tauri/src/lib.rs](/Users/mansur/Multi_Agent_Orchestrator_Project/src-tauri/src/lib.rs#L1010).
- `Mobile`: CI pretends to typecheck/build a mobile package in [ci.yml](/Users/mansur/Multi_Agent_Orchestrator_Project/.github/workflows/ci.yml#L48), but the package surface is still minimal in [mobile/package.json](/Users/mansur/Multi_Agent_Orchestrator_Project/mobile/package.json#L1).

**Strongest Deployment-Integrity Failures**

- Build and deploy truth are not singular.
- Production safety depends on naming conventions and env discipline that code does not consistently enforce.
- Local scripts are still a real secret-management surface.
- CI/security automation does not cover the full set of shipped or selectable runtime surfaces.
- `self_host_runtime` is present in policy/UI language without an equally clear first-class deployment contract.

**Confirmed Findings**

- The repo can build at least three materially different shapes: Render cloud runtime, Tauri desktop, and local script-driven operator stack.
- `docker-compose.yml` is not aligned with the current documented/runtime cloud path.
- Broker signing secrets and JWT secret handling still include insecure fallback behavior.
- Auth-disable production guarding is variable-name fragile.
- Database durability can silently collapse to memory/SQLite.
- Deployment success still depends heavily on operator scripts and manual env injection.
- Supply-chain auditing is partial, not full-stack.

**Unproven Suspicions**

- Some enterprise/self-host deployment automation may exist outside this repository.
- `self_host_runtime` may have an operational bootstrap path in external infra repos or internal runbooks not audited here.
- The mobile CI path may pass only because of undeclared transitive tooling in the runner environment; I did not execute the workflow.

**Exact Next Files To Inspect**

- [server_modules/runtime_common.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runtime_common.py)
- [scripts/orion_ops_daemon.py](/Users/mansur/Multi_Agent_Orchestrator_Project/scripts/orion_ops_daemon.py)
- [scripts/start_empyralis_local_stack.sh](/Users/mansur/Multi_Agent_Orchestrator_Project/scripts/start_empyralis_local_stack.sh)
- [server_modules/runtime_attachment_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runtime_attachment_service.py)
- [render.yaml](/Users/mansur/Multi_Agent_Orchestrator_Project/render.yaml)
- [src-tauri/src/lib.rs](/Users/mansur/Multi_Agent_Orchestrator_Project/src-tauri/src/lib.rs)

**Verdict**

This audit category does **not** pass today.

What actually ships is not fully the same as what the repository claims. The biggest blockers are deploy-surface drift, insecure secret/config fallbacks, partial automation coverage, and a runtime model that still changes shape depending on host environment and operator scripts.



