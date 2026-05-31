from __future__ import annotations

import re
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, List, Sequence


@dataclass
class ReleaseGateCheck:
    name: str
    ok: bool
    detail: str = ""


REQUIRED_PHASE_FILES = [
    "server_modules/sage_dreaming_pipeline.py",
    "server_modules/policy_presets.py",
    "server_modules/session_lifecycle_service.py",
    "server_modules/session_diagnostics_service.py",
    "server_modules/docker_execution_sandbox.py",
    "Dockerfile.sandbox",
    "server_modules/plugin_system/hook_points.py",
    "server_modules/plugin_system/hook_registry.py",
    "server_modules/plugin_system/plugin_base.py",
    "server_modules/cli_companion_service.py",
    "scripts/empyralis",
    "server_modules/acp_bridge_service.py",
]

PY_COMPILE_TARGETS = [
    "server_modules/sage_dreaming_pipeline.py",
    "server_modules/policy_presets.py",
    "server_modules/session_lifecycle_service.py",
    "server_modules/session_diagnostics_service.py",
    "server_modules/docker_execution_sandbox.py",
    "server_modules/execution_sandbox_service.py",
    "server_modules/bounded_scheduler_service.py",
    "server_modules/plugin_system/hook_points.py",
    "server_modules/plugin_system/hook_registry.py",
    "server_modules/plugin_system/plugin_base.py",
    "server_modules/cli_companion_service.py",
    "server_modules/acp_bridge_service.py",
    "server_modules/routes_gateway.py",
]


def _artifact_clean(root: Path) -> ReleaseGateCheck:
    status = _run(root, ["git", "status", "--porcelain=v1"], timeout_seconds=30)
    if not status.ok:
        return ReleaseGateCheck(name="generated test artifacts clean", ok=False, detail=status.detail)
    dirty_paths = []
    for line in status.detail.splitlines():
        path = line[3:].strip() if len(line) > 3 else ""
        if path.startswith("frontend/test-results/"):
            dirty_paths.append(path)
    return ReleaseGateCheck(
        name="generated test artifacts clean",
        ok=not dirty_paths,
        detail="dirty artifacts: " + ", ".join(dirty_paths) if dirty_paths else "no dirty frontend test artifacts",
    )


def _run(root: Path, command: Sequence[str], *, timeout_seconds: int = 120) -> ReleaseGateCheck:
    name = " ".join(command)
    try:
        completed = subprocess.run(
            list(command),
            cwd=str(root),
            capture_output=True,
            text=True,
            timeout=timeout_seconds,
            check=False,
        )
    except FileNotFoundError as exc:
        return ReleaseGateCheck(name=name, ok=False, detail=str(exc))
    except subprocess.TimeoutExpired:
        return ReleaseGateCheck(name=name, ok=False, detail=f"timed out after {timeout_seconds}s")
    output = "\n".join(part.strip() for part in (completed.stdout, completed.stderr) if part.strip())
    return ReleaseGateCheck(name=name, ok=completed.returncode == 0, detail=output[-2000:])


def _files_exist(root: Path, files: Iterable[str]) -> ReleaseGateCheck:
    missing = [path for path in files if not (root / path).exists()]
    return ReleaseGateCheck(
        name="required phase files",
        ok=not missing,
        detail="missing: " + ", ".join(missing) if missing else "all required phase files are present",
    )


def _pattern_exists(root: Path, file_path: str, pattern: str, label: str) -> ReleaseGateCheck:
    path = root / file_path
    if not path.exists():
        return ReleaseGateCheck(name=label, ok=False, detail=f"missing {file_path}")
    text = path.read_text(encoding="utf-8", errors="replace")
    matched = bool(re.search(pattern, text))
    return ReleaseGateCheck(
        name=label,
        ok=matched,
        detail=f"{file_path} contains expected pattern" if matched else f"{file_path} missing {pattern}",
    )


def run_release_gate(root: str | Path) -> List[ReleaseGateCheck]:
    project_root = Path(root).resolve()
    route_table_check = (
        "from server_modules.routes_gateway import router; "
        "paths={route.path for route in router.routes}; "
        "assert '/diagnostics/sessions/{session_id}/export' in paths; "
        "assert '/diagnostics/workspace/{workspace_id}/bundle' in paths; "
        "assert '/gateway/acp/turn' in paths"
    )
    docker_command_check = (
        "from server_modules.docker_execution_sandbox import docker_sandbox_command; "
        "cmd=docker_sandbox_command(sandbox_root='/tmp/empyralis-sandbox-proof'); "
        "joined=' '.join(cmd); "
        "assert 'python3 -m server_modules.hosted_secure_worker' in joined; "
        "assert 'PYTHONPATH=/app' in joined; "
        "assert '--network=none' in cmd; "
        "assert '--cap-drop=ALL' in cmd; "
        "assert '--security-opt=no-new-privileges:true' in cmd"
    )
    return [
        _files_exist(project_root, REQUIRED_PHASE_FILES),
        _pattern_exists(
            project_root,
            "server_modules/routes_gateway.py",
            r"/diagnostics/sessions/\{session_id\}/export",
            "diagnostics session export route",
        ),
        _pattern_exists(
            project_root,
            "server_modules/routes_gateway.py",
            r"/gateway/acp/turn",
            "ACP bridge route",
        ),
        _pattern_exists(
            project_root,
            "server_modules/direct_chat_generation_service.py",
            r"\.execute\(",
            "direct chat hook execution",
        ),
        _pattern_exists(
            project_root,
            "server_modules/execution_sandbox_service.py",
            r"run_docker_worker",
            "Docker sandbox integration",
        ),
        _pattern_exists(
            project_root,
            "frontend/app/page.tsx",
            r"loadAccountShellSession\(",
            "landing session-aware server route",
        ),
        _pattern_exists(
            project_root,
            "frontend/app/landing-client.tsx",
            r"Link href=\{accountHref\}",
            "landing auth navigation links",
        ),
        _run(project_root, [sys.executable, "-c", route_table_check], timeout_seconds=60),
        _run(project_root, [sys.executable, "-c", docker_command_check], timeout_seconds=60),
        _artifact_clean(project_root),
        _run(project_root, ["git", "diff", "--check"], timeout_seconds=30),
        _run(project_root, [sys.executable, "-m", "py_compile", *PY_COMPILE_TARGETS], timeout_seconds=120),
        _run(project_root, ["npm", "run", "typecheck", "--prefix", "frontend"], timeout_seconds=180),
    ]


def format_release_gate_report(checks: Sequence[ReleaseGateCheck]) -> str:
    lines = ["Empyralis release gate"]
    failed = 0
    for check in checks:
        if not check.ok:
            failed += 1
        status = "PASS" if check.ok else "FAIL"
        detail = f" - {check.detail}" if check.detail else ""
        lines.append(f"[{status}] {check.name}{detail}")
    lines.append(f"Result: {'PASS' if failed == 0 else 'FAIL'} ({len(checks) - failed}/{len(checks)} checks passed)")
    return "\n".join(lines)
