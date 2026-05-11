# Empyralis Supported Deploy Targets

This repository supports exactly two deploy shapes:

1. `Render cloud runtime`
2. `Repo-local Tauri desktop shell`

`docker-compose.yml` is retained only as an explicit unsupported legacy marker. It is not a supported deploy surface.

## Render cloud runtime

The supported cloud runtime is the Render blueprint in [render.yaml](/Users/mansur/Multi_Agent_Orchestrator_Project/render.yaml).

Target shape:

- `empyralis-runtime` from `Dockerfile.runtime`
- `empyralis-web` from `frontend/Dockerfile`
- managed Postgres from Render
- persistent disk mounted at `/var/data/empyralis`

Runtime contract:

- public health check is `GET /health`
- privileged diagnostics are `GET /health/internal`, `GET /health/internal/db`, and `GET /doctor`
- privileged diagnostics require `X-API-Key`
- production mode is explicit with `ORION_ENV=production`
- auth is explicit with `ORION_AUTH_REQUIRED=1`
- durable run state is explicit with `ORION_REQUIRE_DURABLE_RUN_STATE=1`
- runtime secrets are explicit with generated values for:
  - `ORION_API_KEY`
  - `ORION_JWT_SECRET`
  - `EMPYRALIS_SECRETS_BROKER_SECRET`
  - `EMPYRALIS_TOOL_BROKER_SECRET`

Persistent disk is still required because the runtime keeps explicit non-Postgres state under `EMPYRALIS_STATE_HOME`, including:

- auth SQLite state
- JWT secret file
- setup session/config JSON
- runtime checkpoint SQLite
- memory SQLite

Manual values after blueprint creation:

- runtime:
  - `EMPYRALIS_DEPLOY_ENV=production`
  - `CONTROL_PLANE_ORIGINS=https://<your-web-service>.onrender.com`
  - `EMPYRALIS_PUBLIC_API_URL=https://<your-runtime-service>.onrender.com`
  - `OPENAI_API_KEY`
  - `ANTHROPIC_API_KEY` if used
  - `GEMINI_API_KEY` if used
  - `SENTRY_DSN` if used
  - `FRONTEND_ORIGINS=https://<your-web-service>.onrender.com`
  - `ORION_WHATSAPP_AUTOPILOT_PUBLIC_BASE_URL=https://<your-runtime-service>.onrender.com`
- web:
  - `NEXT_PUBLIC_API_URL=https://<your-runtime-service>.onrender.com`
  - `NEXT_PUBLIC_ORION_API_URL=https://<your-runtime-service>.onrender.com`
  - `NEXT_PUBLIC_WS_URL=wss://<your-runtime-service>.onrender.com`
  - `NEXT_PUBLIC_EMPYRALIS_DEPLOY_ENV=production`
  - `NEXT_PUBLIC_SENTRY_DSN` if used
- mobile:
  - `EXPO_PUBLIC_EMPYRALIS_DEPLOY_ENV=production`
  - `EXPO_PUBLIC_RUNTIME_URL=https://<your-runtime-service>.onrender.com`
  - `EXPO_PUBLIC_EMPYRALIST_API_URL=https://<your-runtime-service>.onrender.com`
- gateway companion:
  - `EMPYRALIS_DEPLOY_ENV=production`
  - `EMPYRALIS_GATEWAY_API_URL=https://<your-runtime-service>.onrender.com/api`

Verification:

```bash
chmod +x scripts/phase70_cloud_smoke.sh
EMPYRALIS_PUBLIC_URL="https://<your-runtime-service>.onrender.com" \
EMPYRALIS_RUNTIME_API_KEY="<runtime-api-key>" \
bash scripts/phase70_cloud_smoke.sh
```

Passing smoke means:

- `/health` returns the public redacted contract
- `/health/internal/db` returns with `X-API-Key`
- `/doctor` returns with `X-API-Key`

## Public beta provider expectation

For the first public mobile beta, choose one primary hosted model provider and
configure it on the runtime. Do not treat provider selection as a client-side
or per-device concern.

Recommended beta posture:

- set exactly one of `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, or `GEMINI_API_KEY`
- leave the others unset unless they are intentionally part of a tested failover
  path
- keep provider credentials on the server only

## Render deploy checklist

1. Create the Render blueprint from [render.yaml](/Users/mansur/Multi_Agent_Orchestrator_Project/render.yaml).
2. Confirm the runtime service has:
   - `ORION_ENV=production`
   - `ORION_AUTH_REQUIRED=1`
   - `ORION_REQUIRE_DURABLE_RUN_STATE=1`
   - persistent disk mounted at `/var/data/empyralis`
   - Postgres attached through `DATABASE_URL`
3. Fill the runtime manual env values:
   - `FRONTEND_ORIGINS`
   - `CONTROL_PLANE_ORIGINS`
   - `ORION_WHATSAPP_AUTOPILOT_PUBLIC_BASE_URL` if WhatsApp is used
   - one chosen provider key
4. Fill the web manual env values:
   - `NEXT_PUBLIC_API_URL`
   - `NEXT_PUBLIC_ORION_API_URL`
   - `NEXT_PUBLIC_WS_URL`
5. Run the cloud smoke:

```bash
chmod +x scripts/phase70_cloud_smoke.sh
EMPYRALIS_PUBLIC_URL="https://<your-runtime-service>.onrender.com" \
EMPYRALIS_RUNTIME_API_KEY="<runtime-api-key>" \
bash scripts/phase70_cloud_smoke.sh
```

6. Verify the deploy is fail-closed:
   - if `DATABASE_URL` is missing or Postgres is unreachable, runtime startup
     must not silently degrade to memory/SQLite
   - if browser write surfaces are used, `CONTROL_PLANE_ORIGINS` must be set

## Remaining blockers outside phase 1

Phase 5 closes the localhost cutover class by adding production validation for
server, web, mobile, and gateway companion URLs. Development can still use
loopback URLs; staging and production cannot.

Production/staging fail-closed rules:

- [x] server startup rejects `FRONTEND_ORIGINS` if it is empty, non-HTTPS, or points
  at localhost  _(runtime_config.py:388-416, `_assert_frontend_origins_safe_for_environment`)_
- [x] server startup rejects the public API URL unless it is HTTPS
  _(control-plane-base-url.ts:18-36, `validateControlPlaneBaseUrl`)_
- [x] mobile Expo config rejects production/staging builds with missing, non-HTTPS,
  or localhost runtime URLs  _(mobile/src/lib/api.ts:33-80, `assertProductionRuntimeUrl`)_
- [x] frontend server routing rejects localhost control-plane URLs in
  staging/production  _(control-plane-base-url.ts:18-36, `validateControlPlaneBaseUrl`)_
- [x] gateway companion rejects localhost or non-HTTPS `EMPYRALIS_GATEWAY_API_URL`
  in staging/production  _(empyralis-gateway/src/config.ts:37-53, `assertCloudApiBaseUrl`)_
- [x] gateway websocket URLs, when configured, must use `wss://` in
  staging/production  _(empyralis-gateway/src/config.ts:80-91, `assertWebSocketUrl`; ws-client.ts:162)_
- [x] gateway supervisor URL rejects localhost in staging/production
  _(empyralis-gateway/src/config.ts:95-99, `assertCloudApiBaseUrl` applied to supervisorUrl)_

Development exceptions:

- local web can continue using `http://127.0.0.1:8001`
- local frontend can continue using `http://127.0.0.1:3000`
- local gateway supervisor can continue using `http://127.0.0.1:7788` because it
  is the local companion control socket, not the cloud API

Mobile staging setup:

```bash
EXPO_PUBLIC_EMPYRALIS_DEPLOY_ENV=staging \
EXPO_PUBLIC_RUNTIME_URL="https://<runtime-staging-host>" \
EXPO_PUBLIC_EMPYRALIST_API_URL="https://<runtime-staging-host>" \
npm --prefix mobile start
```

Gateway production pairing:

```bash
EMPYRALIS_DEPLOY_ENV=production \
EMPYRALIS_GATEWAY_API_URL="https://<runtime-service>/api" \
EMPYRALIS_GATEWAY_PAIRING_TOKEN="<one-time-token>" \
npm --prefix empyralis-gateway start
```

Troubleshooting:

- If mobile build fails with `Production mobile runtime URL cannot point at
  localhost`, replace the Expo public runtime URL with the HTTPS runtime host.
- If the server fails during startup, inspect `FRONTEND_ORIGINS` and
  `EMPYRALIS_PUBLIC_API_URL` first.
- If gateway pairing command says the API URL is unavailable, set
  `NEXT_PUBLIC_ORION_API_URL` or `NEXT_PUBLIC_API_URL` on the web service before
  generating the pairing command.

## Repo-local Tauri desktop shell

The supported desktop target is a repo-local checkout launched through the Tauri shell. It is not a generic packaged desktop artifact with host-dependent fallbacks.

Target shape:

- runtime sidecar from bundled `empyralis-backend` binary when available, otherwise repo-local `dist/empyralis-backend*`
- backend sidecar from `backend/dist/main.js`
- frontend sidecar from `frontend/.next` served by the repo-local Next CLI
- local worker bootstrapped against the same runtime sidecar

Required prerequisites for the supported desktop target:

- repo checkout present
- `frontend/node_modules/next` installed
- `frontend/.next` built
- `backend/dist/main.js` built
- desktop launched from the repo through the existing desktop scripts

Unsupported desktop shapes:

- packaged desktop app without repo-local frontend/backend build artifacts
- host `uvicorn` / host `python -m uvicorn` fallback
- backend `npm run start:dev` fallback
- frontend `next dev` fallback

## Unsupported legacy surface

`docker-compose.yml` is intentionally unsupported. Running it should not be treated as a valid Empyralis environment.
