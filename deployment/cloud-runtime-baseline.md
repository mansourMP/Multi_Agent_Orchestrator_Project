# Phase 70 Cloud Runtime Baseline

This deploy contract makes the FastAPI runtime the public cloud source of truth for:

- auth
- runs
- approvals
- artifacts
- Telegram and WhatsApp channel ingress

## Target shape

- public runtime URL over HTTPS
- persistent Postgres for durable run/session state where supported by the runtime
- persistent disk mounted at `/var/data/empyralis` for state that still lives in SQLite/files
- frontend pointed at the same public runtime URL

## Why the persistent disk is required

The runtime still stores some production-critical state outside Postgres:

- auth SQLite database under `EMPYRALIS_STATE_HOME/auth`
- JWT secret file under `EMPYRALIS_STATE_HOME/auth`
- setup sessions JSON
- provider profiles JSON
- idempotency JSON
- runtime SQLite state and memory SQLite state

Until those are fully migrated, public deployment must preserve `EMPYRALIS_STATE_HOME`.

## Render blueprint

`render.yaml` provisions:

- `empyralis-runtime` web service from `Dockerfile.runtime`
- `empyralis-web` web service from `frontend/Dockerfile`
- `empyralis-postgres` managed Postgres
- `empyralis-state` persistent disk mounted into the runtime

## Required manual values after blueprint creation

Set these env vars in Render before production validation:

- runtime:
  - `OPENAI_API_KEY`
  - `ANTHROPIC_API_KEY` as needed
  - `GEMINI_API_KEY` as needed
  - `SENTRY_DSN`
  - `FRONTEND_ORIGINS=https://<your-web-service>.onrender.com`
  - `ORION_WHATSAPP_AUTOPILOT_PUBLIC_BASE_URL=https://<your-runtime-service>.onrender.com`
- frontend:
  - `NEXT_PUBLIC_API_URL=https://<your-runtime-service>.onrender.com`
  - `NEXT_PUBLIC_ORION_API_URL=https://<your-runtime-service>.onrender.com`
  - `NEXT_PUBLIC_WS_URL=wss://<your-runtime-service>.onrender.com`
  - `NEXT_PUBLIC_SENTRY_DSN`

## Verification

Run:

```bash
chmod +x scripts/phase70_cloud_smoke.sh
EMPYRALIS_PUBLIC_URL="https://<your-runtime-service>.onrender.com" \
EMPYRALIS_RUNTIME_API_KEY="<runtime-api-key>" \
bash scripts/phase70_cloud_smoke.sh
```

Then verify:

- web loads against the public runtime
- mobile login and chat work from a real phone
- Telegram/WhatsApp webhook status points at the public runtime URL
