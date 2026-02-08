import os
import uuid
import threading
import queue
import sys
import builtins
import json
import time
from datetime import datetime
from typing import List, Optional
from urllib import request as urlrequest
from urllib import error as urlerror
import ssl
import certifi
from fastapi import FastAPI, HTTPException, Header, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from sse_starlette.sse import EventSourceResponse
from pydantic import BaseModel
from dotenv import load_dotenv

# 1. Load Secrets
load_dotenv()

# Avoid interactive trace prompts and color issues in headless runtime
os.environ.setdefault("RICH_DISABLE_COLOR", "1")
os.environ.setdefault("RICH_NO_COLOR", "1")
os.environ.setdefault("NO_COLOR", "1")
os.environ.setdefault("TERM", "dumb")
os.environ.setdefault("CREWAI_DISABLE_TELEMETRY", "1")
os.environ.setdefault("CREWAI_DISABLE_TRACING", "1")

# 2. Import the existing Crew
# Ensure main.py is in the same directory and has 'conductor_crew' defined
try:
    from main import conductor_crew
except ImportError:
    print("⚠️ ERROR: Could not find 'main.py'. Ensure it contains 'conductor_crew'.")
    sys.exit(1)

app = FastAPI(title="Conductor Crew API")

# --- CONFIG ---
FRONTEND_ORIGIN = os.getenv("FRONTEND_ORIGIN", "http://127.0.0.1:3000")
CREW_API_KEY = os.getenv("CREW_API_KEY")
CREW_RUN_TIMEOUT_SECONDS = int(os.getenv("CREW_RUN_TIMEOUT_SECONDS", "300"))
CREW_MAX_RETRIES = int(os.getenv("CREW_MAX_RETRIES", "2"))
CREW_RETRY_BACKOFF_SECONDS = float(os.getenv("CREW_RETRY_BACKOFF_SECONDS", "1.5"))
OPENAI_API_URL = os.getenv("OPENAI_API_URL", "https://api.openai.com/v1/models")
OPENAI_ORG_ID = os.getenv("OPENAI_ORG_ID")
OPENAI_PROJECT_ID = os.getenv("OPENAI_PROJECT_ID")
OPENAI_HEALTHCHECK = os.getenv("OPENAI_HEALTHCHECK", "1") == "1"

app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_ORIGIN],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global State
runs = {}
CREW_VALIDATION_ERRORS: List[str] = []

# --- INPUT PATCHING (The Magic Glue) ---
original_input = builtins.input

def remote_input(prompt=""):
    thread_id = threading.get_ident()
    active_run_id = None

    # Auto-decline optional trace prompts in API mode
    if "execution traces" in prompt.lower():
        return "n"
    
    # Find the run associated with this thread
    for r_id, data in runs.items():
        if data["thread_id"] == thread_id:
            active_run_id = r_id
            break
    
    if active_run_id:
        # Pause and wait for API input
        runs[active_run_id]["status"] = "waiting_for_input"
        runs[active_run_id]["logs"].put("__PAUSE_REQUIRED__")
        return runs[active_run_id]["input_queue"].get()
    else:
        return original_input(prompt)

# Apply the patch
builtins.input = remote_input

# --- LOGGING UTILITY ---
def emit_log(log_queue, level: str, message: str, event: str = "runtime", data: Optional[dict] = None):
    payload = {
        "ts": datetime.utcnow().isoformat() + "Z",
        "level": level,
        "event": event,
        "message": message
    }
    if data:
        payload["data"] = data
    log_queue.put(payload)

class LogStreamer:
    def __init__(self, log_queue):
        self.log_queue = log_queue
    def write(self, text):
        cleaned = text.strip()
        if cleaned:
            emit_log(self.log_queue, "info", cleaned, event="stdout")
    def flush(self):
        pass

def validate_crew():
    errors = []
    try:
        agents = getattr(conductor_crew, "agents", None) or []
        tasks = getattr(conductor_crew, "tasks", None) or []
        if not agents:
            errors.append("Crew has no agents.")
        if not tasks:
            errors.append("Crew has no tasks.")
        for idx, task in enumerate(tasks):
            expected = getattr(task, "expected_output", None)
            if not expected:
                errors.append(f"Task[{idx}] missing expected_output.")
        manager_llm = getattr(conductor_crew, "manager_llm", None)
        if manager_llm is None:
            errors.append("manager_llm is not set for hierarchical process.")
    except Exception as exc:
        errors.append(f"Validation error: {exc}")
    return errors

CREW_VALIDATION_ERRORS = validate_crew()
if CREW_VALIDATION_ERRORS:
    print("⚠️ Crew validation failed:")
    for err in CREW_VALIDATION_ERRORS:
        print(f" - {err}")

def require_api_key(request: Request, x_api_key: str = Header(None)):
    api_key = x_api_key or request.query_params.get("api_key")
    if CREW_API_KEY and api_key != CREW_API_KEY:
        raise HTTPException(status_code=401, detail="Invalid API key")

def run_mission(run_id):
    runs[run_id]["thread_id"] = threading.get_ident()
    old_stdout = sys.stdout
    sys.stdout = LogStreamer(runs[run_id]["logs"])
    
    try:
        runs[run_id]["status"] = "running"
        emit_log(runs[run_id]["logs"], "info", "Crew run started.", event="run_start", data={"run_id": run_id})
        start_time = time.time()
        last_error = None

        for attempt in range(CREW_MAX_RETRIES + 1):
            result_holder = {"result": None, "error": None}

            def kickoff_worker():
                try:
                    result_holder["result"] = conductor_crew.kickoff()
                except Exception as exc:
                    result_holder["error"] = exc

            remaining = CREW_RUN_TIMEOUT_SECONDS - (time.time() - start_time)
            if remaining <= 0:
                break

            worker = threading.Thread(target=kickoff_worker)
            worker.start()
            worker.join(timeout=remaining)

            if worker.is_alive():
                last_error = RuntimeError(f"Crew run exceeded {CREW_RUN_TIMEOUT_SECONDS}s timeout.")
                break

            if result_holder["error"] is None:
                emit_log(
                    runs[run_id]["logs"],
                    "info",
                    "Crew run completed.",
                    event="run_complete",
                    data={"result": result_holder["result"], "attempt": attempt + 1}
                )
                runs[run_id]["status"] = "completed"
                return

            last_error = result_holder["error"]
            emit_log(
                runs[run_id]["logs"],
                "warn",
                f"Crew run failed on attempt {attempt + 1}.",
                event="run_retry",
                data={"attempt": attempt + 1, "error": str(last_error)}
            )

            if attempt < CREW_MAX_RETRIES:
                backoff = CREW_RETRY_BACKOFF_SECONDS * (2 ** attempt)
                time.sleep(backoff)

        if isinstance(last_error, RuntimeError) and "timeout" in str(last_error).lower():
            emit_log(
                runs[run_id]["logs"],
                "error",
                f"Crew run exceeded {CREW_RUN_TIMEOUT_SECONDS}s timeout. Aborting.",
                event="timeout",
                data={"timeout_seconds": CREW_RUN_TIMEOUT_SECONDS}
            )
        else:
            raise last_error or RuntimeError("Crew run failed with unknown error.")
    except Exception as e:
        emit_log(
            runs[run_id]["logs"],
            "error",
            str(e),
            event="run_error"
        )
        runs[run_id]["status"] = "failed"
    finally:
        sys.stdout = old_stdout
        runs[run_id]["logs"].put(None) # End stream

# --- ENDPOINTS ---
class Decision(BaseModel):
    run_id: str
    decision: str

    def validate_fields(self):
        if not self.run_id or len(self.run_id) < 8:
            raise HTTPException(status_code=400, detail="Invalid run_id")
        if not self.decision or len(self.decision.strip()) == 0:
            raise HTTPException(status_code=400, detail="Decision is required")
        if len(self.decision) > 256:
            raise HTTPException(status_code=400, detail="Decision too long")

@app.get("/health")
async def health():
    openai_key = os.getenv("OPENAI_API_KEY")
    key_valid = False
    openai_status = None
    openai_error = None
    if openai_key and OPENAI_HEALTHCHECK:
        headers = {
            "Authorization": f"Bearer {openai_key}",
        }
        if OPENAI_ORG_ID:
            headers["OpenAI-Organization"] = OPENAI_ORG_ID
        if OPENAI_PROJECT_ID:
            headers["OpenAI-Project"] = OPENAI_PROJECT_ID
        try:
            req = urlrequest.Request(OPENAI_API_URL, headers=headers, method="GET")
            context = ssl.create_default_context(cafile=certifi.where())
            with urlrequest.urlopen(req, timeout=3, context=context) as resp:
                key_valid = resp.status == 200
                openai_status = resp.status
        except urlerror.HTTPError as exc:
            openai_status = exc.code
            key_valid = False
            openai_error = str(exc)
        except Exception as exc:
            openai_status = "unreachable"
            key_valid = False
            openai_error = str(exc)
    elif openai_key and not OPENAI_HEALTHCHECK:
        key_valid = True
        openai_status = "skipped"

    ok = bool(openai_key) and key_valid and not CREW_VALIDATION_ERRORS
    return {
        "ok": ok,
        "openai_key_present": bool(openai_key),
        "openai_key_valid": key_valid,
        "openai_status": openai_status,
        "openai_error": openai_error,
        "crew_valid": not CREW_VALIDATION_ERRORS,
        "errors": CREW_VALIDATION_ERRORS
    }

@app.post("/start-mission", dependencies=[Depends(require_api_key)])
async def start_mission():
    if CREW_VALIDATION_ERRORS:
        raise HTTPException(status_code=503, detail="Crew validation failed.")
    run_id = str(uuid.uuid4())
    runs[run_id] = {
        "status": "starting",
        "logs": queue.Queue(),
        "input_queue": queue.Queue(),
        "thread_id": None
    }
    threading.Thread(target=run_mission, args=(run_id,)).start()
    return {"run_id": run_id}

@app.get("/stream-logs/{run_id}", dependencies=[Depends(require_api_key)])
async def stream_logs(run_id: str):
    if run_id not in runs:
        raise HTTPException(404, "Run ID not found")
    def iter_logs():
        run = runs.get(run_id)
        if not run:
            return
        q = run["logs"]
        while True:
            try:
                data = q.get(timeout=1)
                if data is None: break
                if data == "__PAUSE_REQUIRED__":
                    yield {"event": "pause", "data": "Human Input Needed"}
                else:
                    yield {"event": "log", "data": json.dumps(data)}
            except queue.Empty:
                if runs[run_id]["status"] == "completed": break
                continue
    return EventSourceResponse(iter_logs())

@app.post("/submit-decision", dependencies=[Depends(require_api_key)])
async def submit_decision(d: Decision):
    d.validate_fields()
    if d.run_id in runs:
        runs[d.run_id]["input_queue"].put(d.decision)
        return {"status": "ok"}
    raise HTTPException(404, "Run ID not found")
