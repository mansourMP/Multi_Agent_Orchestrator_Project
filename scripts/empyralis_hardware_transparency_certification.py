#!/usr/bin/env python3
from __future__ import annotations

import argparse
from dataclasses import dataclass
from datetime import datetime, timezone
import json
from pathlib import Path
import shlex
import subprocess
import sys
import time
from typing import Iterable
from urllib import request


ROOT_DIR = Path(__file__).resolve().parents[1]

BACKEND_TESTS = [
    "server_modules/tests/test_transcript_events_service.py",
    "server_modules/tests/test_agent_turn.py",
    "server_modules/tests/test_hardware_action_broker_service.py",
    "server_modules/tests/test_hardware_transcript_completion_certification.py",
    "server_modules/tests/test_runtime_runs_api_chat_stream.py",
    "server_modules/tests/test_thread_transcript_event_append.py",
    "server_modules/tests/test_virtual_computer_ephemeral_session.py",
]


@dataclass
class StepResult:
    name: str
    status: str
    command: list[str]
    duration_seconds: float
    summary: str
    log_path: str | None = None


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _command_text(command: Iterable[str]) -> str:
    return " ".join(shlex.quote(str(part)) for part in command)


def _tail(text: str, *, line_count: int = 16) -> str:
    lines = text.strip().splitlines()
    return "\n".join(lines[-line_count:])


def _write_log(log_dir: Path, name: str, content: str) -> str:
    log_dir.mkdir(parents=True, exist_ok=True)
    path = log_dir / f"{name}.log"
    path.write_text(content, encoding="utf-8")
    return str(path.relative_to(ROOT_DIR))


def _run_step(
    *,
    name: str,
    command: list[str],
    cwd: Path = ROOT_DIR,
    timeout: int | None = None,
    log_dir: Path,
) -> StepResult:
    start = time.monotonic()
    try:
        completed = subprocess.run(
            command,
            cwd=str(cwd),
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            timeout=timeout,
            check=False,
        )
        duration = time.monotonic() - start
        output = completed.stdout or ""
        log_path = _write_log(log_dir, name, output)
        if completed.returncode == 0:
            return StepResult(name, "PASS", command, duration, "ok", log_path)
        return StepResult(
            name,
            "FAIL",
            command,
            duration,
            _tail(output) or f"exit code {completed.returncode}",
            log_path,
        )
    except subprocess.TimeoutExpired as exc:
        duration = time.monotonic() - start
        output = (exc.stdout or "") if isinstance(exc.stdout, str) else ""
        log_path = _write_log(log_dir, name, output)
        return StepResult(name, "FAIL", command, duration, f"timed out after {timeout}s", log_path)


def _skip_step(name: str, command: list[str], reason: str) -> StepResult:
    return StepResult(name, "SKIP", command, 0.0, reason, None)


def _backend_url_healthy(backend_url: str, timeout: int) -> bool:
    try:
        with request.urlopen(f"{backend_url.rstrip('/')}/health", timeout=timeout) as response:
            return 200 <= int(response.status) < 300
    except Exception:
        return False


def run_certification(args: argparse.Namespace) -> int:
    log_dir = ROOT_DIR / ".tmp" / "hardware_transparency_cert"
    results: list[StepResult] = []

    python = sys.executable or "python3"
    results.append(
        _run_step(
            name="backend_runtime_transparency_tests",
            command=[python, "-m", "pytest", *BACKEND_TESTS, "-q"],
            timeout=args.backend_timeout,
            log_dir=log_dir,
        )
    )
    results.append(
        _run_step(
            name="frontend_typecheck",
            command=["npm", "run", "typecheck", "--prefix", "frontend"],
            timeout=args.frontend_timeout,
            log_dir=log_dir,
        )
    )
    results.append(
        _run_step(
            name="frontend_chat_transparency_e2e",
            command=[
                "npm",
                "run",
                "test:e2e",
                "--prefix",
                "frontend",
                "--",
                "tests/e2e/chat-transparency-timeline.spec.ts",
            ],
            timeout=args.e2e_timeout,
            log_dir=log_dir,
        )
    )
    results.append(
        _run_step(
            name="mobile_typecheck",
            command=["./node_modules/.bin/tsc", "--noEmit", "-p", "tsconfig.json"],
            cwd=ROOT_DIR / "mobile",
            timeout=args.mobile_timeout,
            log_dir=log_dir,
        )
    )
    results.append(
        _run_step(
            name="mobile_transcript_lint",
            command=[
                "npm",
                "run",
                "lint",
                "--",
                "--max-warnings=0",
                "src/lib/transcriptEvents.ts",
                "src/screens/ChatScreen.tsx",
                "app/(tabs)/_layout.tsx",
            ],
            cwd=ROOT_DIR / "mobile",
            timeout=args.mobile_timeout,
            log_dir=log_dir,
        )
    )
    results.append(
        _run_step(
            name="smoke_script_py_compile",
            command=[python, "-m", "py_compile", "scripts/empyralis_chat_transparency_live_smoke.py"],
            timeout=30,
            log_dir=log_dir,
        )
    )
    if args.include_live_smoke or args.require_live_smoke:
        if _backend_url_healthy(args.backend_url, args.health_timeout):
            results.append(
                _run_step(
                    name="live_chat_hardware_transparency_smoke",
                    command=[
                        "scripts/empyralis_chat_transparency_live_smoke.py",
                        "--backend-url",
                        args.backend_url,
                    ],
                    timeout=args.live_timeout,
                    log_dir=log_dir,
                )
            )
        else:
            status = "FAIL" if args.require_live_smoke else "SKIP"
            results.append(
                StepResult(
                    "live_chat_hardware_transparency_smoke",
                    status,
                    ["scripts/empyralis_chat_transparency_live_smoke.py", "--backend-url", args.backend_url],
                    0.0,
                    f"backend health check failed at {args.backend_url}/health",
                    None,
                )
            )
    results.append(
        _run_step(
            name="git_diff_check",
            command=["git", "diff", "--check"],
            timeout=30,
            log_dir=log_dir,
        )
    )

    failed = [item for item in results if item.status == "FAIL"]
    payload = {
        "generated_at": _utc_now(),
        "result": "FAIL" if failed else "PASS",
        "logs_dir": str(log_dir.relative_to(ROOT_DIR)),
        "steps": [
            {
                "name": item.name,
                "status": item.status,
                "command": _command_text(item.command),
                "duration_seconds": round(item.duration_seconds, 2),
                "summary": item.summary,
                "log_path": item.log_path,
            }
            for item in results
        ],
        "real_hardware_note": (
            "This command certifies the automated contract. Physical paired gateway and "
            "self-hosted-node certification still requires real enrolled hardware."
        ),
    }
    print(json.dumps(payload, indent=2, sort_keys=True))
    return 1 if failed else 0


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Run the hardware runtime + inline transparency certification gate.",
    )
    parser.add_argument("--backend-url", default="http://127.0.0.1:8001")
    parser.add_argument("--include-live-smoke", action="store_true")
    parser.add_argument("--require-live-smoke", action="store_true")
    parser.add_argument("--health-timeout", type=int, default=3)
    parser.add_argument("--backend-timeout", type=int, default=120)
    parser.add_argument("--frontend-timeout", type=int, default=120)
    parser.add_argument("--mobile-timeout", type=int, default=120)
    parser.add_argument("--e2e-timeout", type=int, default=180)
    parser.add_argument("--live-timeout", type=int, default=180)
    return run_certification(parser.parse_args())


if __name__ == "__main__":
    raise SystemExit(main())
