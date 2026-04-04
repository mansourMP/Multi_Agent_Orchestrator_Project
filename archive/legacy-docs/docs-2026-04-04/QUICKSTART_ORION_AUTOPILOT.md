# Empyralis Autopilot Quickstart (Current)

This is the current, working local setup for Empyralis Autopilot (simple user mode).

## 0) Terminal command center (optional but recommended)

```bash
cd /Users/mansur/Multi_Agent_Orchestrator_Project
pip install -r requirements.txt
empyralis
```

Useful terminal commands:

```bash
empyralis setup
empyralis onboard
empyralis configure
empyralis hatch
empyralis tui
empyralis status
empyralis doctor
empyralis connectors
empyralis gateway status
empyralis stack status
```

Architecture details:

- `/Users/mansur/Multi_Agent_Orchestrator_Project/docs/ORION_TERMINAL_ARCHITECTURE.md`

## 1) Start services

Use three terminals (plus an optional fourth for Local Worker mode).

### Fastest option: one command (starts runtime + backend + frontend + local worker)

```bash
cd /Users/mansur/Multi_Agent_Orchestrator_Project
RUNTIME_KEY='replace-with-strong-key' bash scripts/start_empyralis_local_stack.sh
```

Useful helpers:

```bash
# status
bash scripts/status_empyralis_local_stack.sh

# stream all 4 logs in one terminal
bash scripts/logs_empyralis_local_stack.sh

# stop all
bash scripts/stop_empyralis_local_stack.sh
```

Stable startup options (recommended):

```bash
# Default backend mode is now auto (prefers dist/main.js when available)
BACKEND_MODE=auto RUNTIME_KEY='replace-with-strong-key' bash scripts/start_empyralis_local_stack.sh

# Start only runtime + local worker (skip backend/frontend)
START_BACKEND=0 START_FRONTEND=0 RUNTIME_KEY='replace-with-strong-key' bash scripts/start_empyralis_local_stack.sh
```

If you prefer manual terminals, follow below.

### Terminal A: Empyralis runtime API (FastAPI, port 8001)

```bash
cd /Users/mansur/Multi_Agent_Orchestrator_Project
export ORION_AUTH_REQUIRED=1
export ORION_API_KEY='replace-with-strong-key'
export OPENAI_HEALTHCHECK=0
# Enable hybrid mode (local companion + cloud)
export ORION_LOCAL_COMPANION_ENABLED=1
uvicorn server:app --host 127.0.0.1 --port 8001
```

### Terminal B: Backend API (NestJS, port 4000)

```bash
cd /Users/mansur/Multi_Agent_Orchestrator_Project/backend
npm run start:dev
```

### Terminal C: Frontend (Next.js, port 3000)

```bash
cd /Users/mansur/Multi_Agent_Orchestrator_Project/frontend
npm run dev -- --hostname 127.0.0.1 --port 3000
```

### Terminal D (optional): Local Worker daemon

Use this when you want `execution_target=local_companion` to run immediately instead of staying queued.

```bash
cd /Users/mansur/Multi_Agent_Orchestrator_Project
RUNTIME_KEY='replace-with-strong-key' bash scripts/run_local_worker.sh
```

Tune worker polling to reduce rate-limit pressure:

```bash
ORION_LOCAL_WORKER_POLL_SECONDS=3 \
ORION_LOCAL_WORKER_IDLE_HEARTBEAT_SECONDS=15 \
RUNTIME_KEY='replace-with-strong-key' bash scripts/run_local_worker.sh
```

## 2) Frontend env

In `frontend/.env.local`:

```bash
NEXT_PUBLIC_ORION_API_URL=http://127.0.0.1:8001
NEXT_PUBLIC_API_URL=http://127.0.0.1:4000/api/v1
```

## 3) Run from UI

1. Open `http://127.0.0.1:3000`
2. In Setup step 1, enter Runtime access key: `replace-with-strong-key`
3. Run setup checks
4. Choose an outcome pack:
   - `Customer Ops Autopilot`
   - `Weekly Content Studio`
   - `Competitor Brief Digest`
5. Pick trust mode:
   - `Guarded` (recommended)
   - `Auto` (fastest)
   - `Strict` (approve everything)
6. Fill inputs and click `Start Autopilot`
7. Use result actions:
   - `Copy summary`
   - `Export JSON`
   - `Create follow-up`
8. Watch the KPI strip:
   - completion rate
   - average run time
   - time-to-first-value
   - average human wait

## 4) API smoke checks

```bash
curl -H "X-API-Key: replace-with-strong-key" http://127.0.0.1:8001/health
curl -H "X-API-Key: replace-with-strong-key" http://127.0.0.1:8001/doctor
curl -H "X-API-Key: replace-with-strong-key" http://127.0.0.1:8001/metrics
curl -H "X-API-Key: replace-with-strong-key" http://127.0.0.1:8001/probe
curl -H "X-API-Key: replace-with-strong-key" "http://127.0.0.1:8001/local/workers/status"
curl -H "X-API-Key: replace-with-strong-key" "http://127.0.0.1:8001/runs/queue/local?workspace_id=default"

# Route preview (before starting a run)
curl -X POST \
  -H "X-API-Key: replace-with-strong-key" \
  -H "Content-Type: application/json" \
  http://127.0.0.1:8001/routing/preview \
  -d '{"engine":"empyralis","metadata":{"execution_target":"local_companion","trust_mode":"guarded"}}'
```

## 5) Common errors

- `Invalid API key` in UI:
  - Runtime key mismatch. Setup step 1 key must match `ORION_API_KEY` in Terminal A.

- `Failed to start autopilot`:
  - Check runtime is on `127.0.0.1:8001`.
  - Check key passed in Setup step 1.

- `run_error` with `incorrect api key`:
  - Provider credential is invalid (BYOK key/managed key issue), not runtime key.

- Stream shows repeated `ping` and no completion:
  - Run is waiting for approval (`event: pause`) or worker failed before completion.
  - If using strict local LLM mode, set a real provider key or disable strict:
  - `ORION_LOCAL_WORKER_LLM_REQUIRED=0`

- `Unsupported trust_mode`:
  - Runtime accepts `auto`, `guarded`, or `strict`.
  - Legacy values like `ask` are normalized to `guarded`.

- `Local companion selected but run says cloud`:
  - Runtime falls back to cloud when local companion is disabled.
  - Enable local mode in Terminal A: `export ORION_LOCAL_COMPANION_ENABLED=1`.
  - Check `route` in run receipt/logs for `requested`, `selected`, and fallback reason.

- `zsh: no matches found` with URLs containing `?`:
  - Quote the full URL in zsh:
  - `curl -H "X-API-Key: ..." "http://127.0.0.1:8001/providers/profiles/health?workspace_id=default"`

## 6) Local companion protocol (Phase 2)

If a run is routed to local companion, a worker can claim and finish it:

```bash
# Claim next local run
curl -X POST \
  -H "X-API-Key: replace-with-strong-key" \
  -H "Content-Type: application/json" \
  http://127.0.0.1:8001/local/runs/claim \
  -d '{"worker_id":"my-local-worker"}'

# Heartbeat
curl -X POST \
  -H "X-API-Key: replace-with-strong-key" \
  -H "Content-Type: application/json" \
  http://127.0.0.1:8001/local/runs/<run_id>/heartbeat \
  -d '{"worker_id":"my-local-worker","note":"still executing"}'

# Complete
curl -X POST \
  -H "X-API-Key: replace-with-strong-key" \
  -H "Content-Type: application/json" \
  http://127.0.0.1:8001/local/runs/<run_id>/complete \
  -d '{"worker_id":"my-local-worker","result_text":"Local run finished successfully."}'

# Worker heartbeat (idle or busy)
curl -X POST \
  -H "X-API-Key: replace-with-strong-key" \
  -H "Content-Type: application/json" \
  http://127.0.0.1:8001/local/workers/my-local-worker/heartbeat \
  -d '{"note":"idle"}'
```

## 7) One-command local worker smoke test

This script starts a local-companion run, launches worker one-shot mode, and verifies completion.

```bash
cd /Users/mansur/Multi_Agent_Orchestrator_Project
RUNTIME_KEY='replace-with-strong-key' bash scripts/run_local_worker_smoke_test.sh
```

## 8) One-command local companion run (recommended)

Use this instead of long curl blocks. It validates runtime health, starts a run, and streams events.

```bash
cd /Users/mansur/Multi_Agent_Orchestrator_Project
RUNTIME_KEY='replace-with-strong-key' bash scripts/run_empyralis_local_companion.sh "$RUNTIME_KEY" "Create a short marketing plan"
```

Weekly content pack example:

```bash
cd /Users/mansur/Multi_Agent_Orchestrator_Project
RUNTIME_KEY='replace-with-strong-key' \
OUTCOME_PACK='weekly-content-studio' \
PACK_TOPICS='New arrivals' \
PACK_CHANNELS='Instagram' \
PACK_OFFERS='Book today' \
bash scripts/run_empyralis_local_companion.sh "$RUNTIME_KEY" "Build weekly content"
```

## 9) Optional: real LLM generation in local worker (OpenAI / Anthropic / Gemini)

By default, local worker produces deterministic safe outputs.  
To enable real model generation for `weekly-content-studio`, set one or more provider keys:

```bash
export OPENAI_API_KEY='your-real-openai-key'
export ANTHROPIC_API_KEY='your-real-anthropic-key'
export GEMINI_API_KEY='your-real-gemini-key'
export ORION_LOCAL_WORKER_USE_LLM=1
```

Provider model overrides:

```bash
export ORION_LOCAL_WORKER_OPENAI_MODEL='gpt-4.1'
export ORION_LOCAL_WORKER_ANTHROPIC_MODEL='claude-3-5-sonnet-20241022'
export ORION_LOCAL_WORKER_GEMINI_MODEL='gemini-2.0-flash'
```

Provider routing controls:

```bash
# Auto (default): uses requested/context provider first, then falls back
export ORION_LOCAL_WORKER_PROVIDER='auto'

# Force a provider first (fallback still enabled by default)
export ORION_LOCAL_WORKER_PROVIDER='anthropic'

# Optional explicit order
export ORION_LOCAL_WORKER_PROVIDER_ORDER='anthropic,openai,gemini'

# Disable fallback and use only ORION_LOCAL_WORKER_PROVIDER
export ORION_LOCAL_WORKER_PROVIDER_FALLBACK=0

# Optional strict mode: fail the run if LLM generation is unavailable
export ORION_LOCAL_WORKER_LLM_REQUIRED=1
```

## 10) Optional: local LLM via Ollama (no API keys)

If you do not want API keys, use Ollama on your machine.

```bash
# one-time model pull
ollama pull llama3.1:8b

# run Empyralis worker in local-LLM mode
export ORION_LOCAL_WORKER_USE_LLM=1
export ORION_LOCAL_WORKER_LLM_REQUIRED=0
export ORION_LOCAL_WORKER_OLLAMA_ENABLED=1
export ORION_LOCAL_WORKER_PROVIDER='ollama'
export ORION_LOCAL_WORKER_PROVIDER_FALLBACK=0
export ORION_LOCAL_WORKER_OLLAMA_MODEL='qwen2.5-coder:1.5b'
export ORION_LOCAL_WORKER_OLLAMA_TIMEOUT_SECONDS=25
export ORION_LOCAL_WORKER_OLLAMA_NUM_PREDICT=700
```

If Ollama is not on default port:

```bash
export ORION_LOCAL_WORKER_OLLAMA_URL='http://127.0.0.1:11434'
```

Optional telemetry cost tuning:

```bash
export ORION_LOCAL_WORKER_INPUT_COST_PER_TOKEN_USD=0.000002
export ORION_LOCAL_WORKER_OUTPUT_COST_PER_TOKEN_USD=0.000008
# Optional provider-specific overrides:
export ORION_LOCAL_WORKER_OPENAI_INPUT_COST_PER_TOKEN_USD=0.000003
export ORION_LOCAL_WORKER_ANTHROPIC_OUTPUT_COST_PER_TOKEN_USD=0.000015
```
