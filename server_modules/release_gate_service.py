from __future__ import annotations

import re
import subprocess
import sys
import importlib.util
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, List, Mapping, Sequence


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
    "docs/PHASE_6_RUST_PLATFORM_KERNEL.md",
    "docs/PHASE_6_AGGRESSIVE_RUST_MIGRATION_ROADMAP.md",
    "empyralis-runtime-kernel/Cargo.toml",
    "empyralis-runtime-kernel/src/approvals.rs",
    "empyralis-runtime-kernel/src/artifacts.rs",
    "empyralis-runtime-kernel/src/authorization.rs",
    "empyralis-runtime-kernel/src/capabilities.rs",
    "empyralis-runtime-kernel/src/control_plane.rs",
    "empyralis-runtime-kernel/src/control_plane_service.rs",
    "empyralis-runtime-kernel/src/deployed_agent.rs",
    "empyralis-runtime-kernel/src/deployed_agent_service.rs",
    "empyralis-runtime-kernel/src/deployed_data.rs",
    "empyralis-runtime-kernel/src/deployed_readiness.rs",
    "empyralis-runtime-kernel/src/deployed_virtual_runtime.rs",
    "empyralis-runtime-kernel/src/deployed_virtual_runtime_service.rs",
    "empyralis-runtime-kernel/src/execution_authorization.rs",
    "empyralis-runtime-kernel/src/execution_outcome.rs",
    "empyralis-runtime-kernel/src/execution_plan.rs",
    "empyralis-runtime-kernel/src/execution_runtime.rs",
    "empyralis-runtime-kernel/src/gateway.rs",
    "empyralis-runtime-kernel/src/gateway_action.rs",
    "empyralis-runtime-kernel/src/gateway_frame.rs",
    "empyralis-runtime-kernel/src/gateway_service.rs",
    "empyralis-runtime-kernel/src/gateway_state.rs",
    "empyralis-runtime-kernel/src/heartbeat.rs",
    "empyralis-runtime-kernel/src/lease.rs",
    "empyralis-runtime-kernel/src/local_worker.rs",
    "empyralis-runtime-kernel/src/main.rs",
    "empyralis-runtime-kernel/src/outbox_delivery.rs",
    "empyralis-runtime-kernel/src/platform_orchestration.rs",
    "empyralis-runtime-kernel/src/process.rs",
    "empyralis-runtime-kernel/src/policy.rs",
    "empyralis-runtime-kernel/src/queue.rs",
    "empyralis-runtime-kernel/src/presets.rs",
    "empyralis-runtime-kernel/src/risk.rs",
    "empyralis-runtime-kernel/src/run_api.rs",
    "empyralis-runtime-kernel/src/run_approval.rs",
    "empyralis-runtime-kernel/src/run_preparation.rs",
    "empyralis-runtime-kernel/src/run_record.rs",
    "empyralis-runtime-kernel/src/run_routing.rs",
    "empyralis-runtime-kernel/src/run_service.rs",
    "empyralis-runtime-kernel/src/run_triggers.rs",
    "empyralis-runtime-kernel/src/runs.rs",
    "empyralis-runtime-kernel/src/runtime_action.rs",
    "empyralis-runtime-kernel/src/runtime_attachment.rs",
    "empyralis-runtime-kernel/src/runtime_binding.rs",
    "empyralis-runtime-kernel/src/runtime_health.rs",
    "empyralis-runtime-kernel/src/runtime_session_api.rs",
    "empyralis-runtime-kernel/src/runtime_state_store.rs",
    "empyralis-runtime-kernel/src/sandbox.rs",
    "empyralis-runtime-kernel/src/sandbox_execution.rs",
    "empyralis-runtime-kernel/src/safe_mode.rs",
    "empyralis-runtime-kernel/src/scheduler.rs",
    "empyralis-runtime-kernel/src/secrets.rs",
    "empyralis-runtime-kernel/src/session.rs",
    "empyralis-runtime-kernel/src/session_scheduler.rs",
    "empyralis-runtime-kernel/src/state.rs",
    "empyralis-runtime-kernel/src/thread_record.rs",
    "empyralis-runtime-kernel/src/virtual_computer.rs",
    "empyralis-runtime-kernel/src/path_guard.rs",
    "empyralis-runtime-kernel/src/redaction.rs",
    "empyralis-runtime-kernel/src/protocol.rs",
    "server_modules/rust_runtime_kernel_client.py",
    "server_modules/rust_authorization_shadow_service.py",
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
    "server_modules/rust_runtime_kernel_client.py",
    "server_modules/rust_authorization_shadow_service.py",
    "server_modules/release_gate_service.py",
    "server_modules/sage_heartbeat_service.py",
]

RUST_KERNEL_MANIFEST = "empyralis-runtime-kernel/Cargo.toml"

RUST_KERNEL_PYTEST_TARGETS = [
    "server_modules/tests/test_rust_runtime_kernel_client.py",
    "server_modules/tests/test_rust_diagnostics_redaction.py",
    "server_modules/tests/test_rust_kernel_heartbeat.py",
    "server_modules/tests/test_rust_authorization_shadow_service.py",
    "server_modules/tests/test_docker_execution_sandbox.py",
    "server_modules/tests/test_execution_sandbox_service.py",
    "server_modules/tests/test_runs_execution_rust_runtime.py",
    "server_modules/tests/test_runtime_session_api_rust_gate.py",
    "server_modules/tests/test_runtime_runtime_api_media_control_rust_gate.py",
    "server_modules/tests/test_sage_heartbeat_service.py",
    "server_modules/tests/test_hardware_action_broker_rust_runtime.py",
    "server_modules/tests/test_hardware_self_hosted_rust_runtime.py",
    "server_modules/tests/test_hardware_cloud_computer_rust_runtime.py",
    "server_modules/tests/test_runtime_attachment_rust_gate.py",
    "server_modules/tests/test_run_state_repository_rust_gate.py",
    "server_modules/tests/test_run_state_repository_approval_rust_gate.py",
    "server_modules/tests/test_runtime_state_store_rust_gate.py",
    "server_modules/tests/test_gateway_state_repository_rust_gate.py",
    "server_modules/tests/test_bounded_scheduler_rust_gate.py",
    "server_modules/tests/test_session_lifecycle_rust_gate.py",
    "server_modules/tests/test_sage_heartbeat_runtime_health.py",
    "server_modules/tests/test_local_queue_rust_gate.py",
    "server_modules/tests/test_local_runtime_health_rust_gate.py",
    "server_modules/tests/test_control_plane_scheduler_wake_rust_gate.py",
    "server_modules/tests/test_outbox_service_rust_gate.py",
    "server_modules/tests/test_run_state_repository_outbox_rust_gate.py",
    "server_modules/tests/test_run_state_repository_queue_claim_rust_gate.py",
    "server_modules/tests/test_connectors_core_process_lifecycle_rust_gate.py",
    "server_modules/tests/test_runtime_webhook_trigger_service.py",
    "server_modules/tests/test_deployed_runtime_binding_rust_gate.py",
    "server_modules/tests/test_worker_dispatch_local_worker_rust_gate.py",
    "server_modules/tests/test_thread_service_rust_gate.py",
    "server_modules/tests/test_run_execution_handle_run_record_rust_gate.py",
    "server_modules/tests/test_runtime_run_entry_service.py",
    "server_modules/tests/test_deployed_agent_admin_dashboard_service.py",
    "server_modules/tests/test_deployed_agent_test_turn_service.py",
    "server_modules/tests/test_runtime_route_run_handlers_service.py",
    "server_modules/tests/test_run_service_scheduler_rust_gate.py",
    "server_modules/tests/test_run_service_create_rust_gate.py",
    "server_modules/tests/test_bounded_scheduler_service.py",
    "server_modules/tests/test_gateway_execution_service.py",
    "server_modules/tests/test_workspace_admin_control_plane_rust_gate.py",
    "server_modules/tests/test_workspace_membership_invite_repository_rust_gate.py",
    "server_modules/tests/test_pilot_invite_repository_rust_gate.py",
    "server_modules/tests/test_identity_control_plane_repository_rust_gate.py",
    "server_modules/tests/test_agent_registry_workflow_rust_gate.py",
    "server_modules/tests/test_agent_registry_self_hosted_runtime_rust_gate.py",
    "server_modules/tests/test_workspace_ai_route_control_plane_rust_gate.py",
    "server_modules/tests/test_routes_workspaces_control_plane_rust_gate.py",
    "server_modules/tests/test_runtime_workspace_service_rust_gate.py",
    "server_modules/tests/test_agent_approval_memory_rust_gate.py",
    "server_modules/tests/test_deployed_agent_memory_rust_gate.py",
    "server_modules/tests/test_deployed_agent_business_insights_rust_gate.py",
    "server_modules/tests/test_external_user_privacy_control_plane_rust_gate.py",
    "server_modules/tests/test_billing_usage_control_plane_rust_gate.py",
    "server_modules/tests/test_workspace_billing_control_plane_rust_gate.py",
    "server_modules/tests/test_security_governance_control_plane_rust_gate.py",
    "server_modules/tests/test_sage_memory_service_rust_gate.py",
    "server_modules/tests/test_memory_service_rust_gate.py",
    "server_modules/tests/test_session_transcript_store_rust_gate.py",
    "server_modules/tests/test_shared_operational_board_rust_gate.py",
    "server_modules/tests/test_activity_ledger_service_rust_gate.py",
    "server_modules/tests/test_sage_approval_service_rust_gate.py",
    "server_modules/tests/test_sage_services_service_rust_gate.py",
    "server_modules/tests/test_kill_switch_gate_rust_gate.py",
    "server_modules/tests/test_runtime_policy_rust_gate.py",
    "server_modules/tests/test_capability_risk_classifier_service.py",
    "server_modules/tests/test_policy_service.py",
    "server_modules/tests/test_agent_computer_policy_service.py",
    "server_modules/tests/test_agent_computer_approval_decision_service.py",
    "server_modules/tests/test_agent_computer_policy_service_rust_gate.py",
    "server_modules/tests/test_safe_mode_service_rust_gate.py",
    "server_modules/tests/test_sage_profile_service_rust_gate.py",
    "server_modules/tests/test_mcp_registry_service_rust_gate.py",
    "server_modules/tests/test_installed_skills_rust_gate.py",
    "server_modules/tests/test_secrets_broker.py",
    "server_modules/tests/test_secret_material_rust_gate.py",
    "server_modules/tests/test_execution_artifact_state_rust_gate.py",
    "server_modules/tests/test_worker_marketplace_state_rust_gate.py",
    "server_modules/tests/test_sage_dreaming_pipeline_rust_gate.py",
    "server_modules/tests/test_mini_apps_service_rust_gate.py",
    "server_modules/tests/test_workspace_context_profile_rust_gate.py",
    "server_modules/tests/test_profile_api_rust_gate.py",
    "server_modules/tests/test_shared_output_state_rust_gate.py",
    "server_modules/tests/test_external_write_safety_rust_gate.py",
    "server_modules/tests/test_gateway_approval_service_rust_gate.py",
    "server_modules/tests/test_gateway_protocol_service_rust_gate.py",
    "server_modules/tests/test_channel_concurrency_rust_gate.py",
    "server_modules/tests/test_channel_user_acquisition_rust_gate.py",
    "server_modules/tests/test_deployed_agent_marketplace_rust_gate.py",
    "server_modules/tests/test_agent_channel_event_control_plane_rust_gate.py",
    "server_modules/tests/test_personal_context_control_plane_rust_gate.py",
    "server_modules/tests/test_agent_action_event_control_plane_rust_gate.py",
    "server_modules/tests/test_control_plane_audit_event_rust_gate.py",
    "server_modules/tests/test_agent_trace_control_plane_rust_gate.py",
    "server_modules/tests/test_agent_thread_session_turn_control_plane_rust_gate.py",
    "server_modules/tests/test_knowledge_control_plane_rust_gate.py",
    "server_modules/tests/test_machine_lease_rust_gate.py",
    "server_modules/tests/test_direct_tool_execution_rust_gate.py",
]

LANGUAGE_EXTENSIONS = {
    ".py": "Python",
    ".rs": "Rust",
    ".ts": "TypeScript",
    ".tsx": "TypeScript",
    ".css": "CSS",
    ".sh": "Shell",
    ".js": "JavaScript",
    ".jsx": "JavaScript",
}

LANGUAGE_EXCLUDED_DIRS = {
    ".git",
    ".next",
    ".pytest_cache",
    ".ruff_cache",
    ".venv",
    "node_modules",
    "target",
    "venv",
}


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


def _load_rust_kernel_client(root: Path):
    path = root / "server_modules" / "rust_runtime_kernel_client.py"
    spec = importlib.util.spec_from_file_location("_release_gate_rust_runtime_kernel_client", path)
    if spec is None or spec.loader is None:
        raise RuntimeError("unable to load rust_runtime_kernel_client.py")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def _rust_kernel_boundary_inventory(root: Path) -> ReleaseGateCheck:
    try:
        client = _load_rust_kernel_client(root)
    except Exception as exc:
        return ReleaseGateCheck(name="Rust kernel boundary inventory", ok=False, detail=str(exc))
    allowed = set(getattr(client, "ALLOWED_KERNEL_COMMANDS", set()) or set())
    wrappers = dict(getattr(client, "KERNEL_COMMAND_WRAPPERS", {}) or {})
    manifest = dict(getattr(client, "KERNEL_OWNERSHIP_MANIFEST", {}) or {})
    active = set(getattr(client, "ACTIVE_ENFORCEMENT_COMMANDS", set()) or set())
    missing_manifest = sorted(allowed - set(manifest))
    missing_wrappers = sorted(command for command in allowed if not hasattr(client, wrappers.get(command, "")))
    invalid_status = sorted(
        command
        for command, entry in manifest.items()
        if not isinstance(entry, Mapping)
        or entry.get("enforcement_status") not in {"active_enforcement", "shadow_only"}
    )
    missing_metadata = sorted(
        command
        for command in active
        if not isinstance(manifest.get(command), Mapping)
        or not str(manifest[command].get("rust_module") or "").strip()
        or not str(manifest[command].get("python_test_hint") or "").strip()
        or not str(manifest[command].get("rust_test_hint") or "").strip()
        or not str(manifest[command].get("parity_fixture_family") or "").strip()
    )
    active_without_marker = sorted(
        command
        for command in active
        if not isinstance(manifest.get(command), Mapping)
        or manifest[command].get("enforcement_status") != "active_enforcement"
    )
    failures = []
    if missing_manifest:
        failures.append("missing manifest: " + ", ".join(missing_manifest))
    if missing_wrappers:
        failures.append("missing wrappers: " + ", ".join(missing_wrappers))
    if invalid_status:
        failures.append("invalid status: " + ", ".join(invalid_status))
    if missing_metadata:
        failures.append("missing active metadata: " + ", ".join(missing_metadata))
    if active_without_marker:
        failures.append("active marker missing: " + ", ".join(active_without_marker))
    return ReleaseGateCheck(
        name="Rust kernel boundary inventory",
        ok=not failures,
        detail="; ".join(failures) if failures else f"{len(allowed)} commands inventoried; {len(active)} active enforcement commands",
    )


def _rust_kernel_python_test_inventory(root: Path) -> ReleaseGateCheck:
    try:
        client = _load_rust_kernel_client(root)
    except Exception as exc:
        return ReleaseGateCheck(name="Rust kernel Python test inventory", ok=False, detail=str(exc))
    active = set(getattr(client, "ACTIVE_ENFORCEMENT_COMMANDS", set()) or set())
    wrappers = dict(getattr(client, "KERNEL_COMMAND_WRAPPERS", {}) or {})
    manifest = dict(getattr(client, "KERNEL_OWNERSHIP_MANIFEST", {}) or {})
    failures = []
    for command in sorted(active):
        entry = manifest.get(command) or {}
        hint = str(entry.get("python_test_hint") or "").strip()
        test_path = root / hint if hint else None
        if test_path is None or not test_path.is_file():
            failures.append(f"{command}:missing_python_test_hint")
            continue
        try:
            source_text = test_path.read_text(encoding="utf-8", errors="replace")
        except OSError:
            failures.append(f"{command}:unreadable_python_test_hint")
            continue
        wrapper = str(wrappers.get(command, "") or "")
        if not (
            re.search(rf"['\"]{re.escape(command)}['\"]", source_text)
            or (wrapper and re.search(rf"\b{re.escape(wrapper)}\b", source_text))
        ):
            failures.append(f"{command}:unreferenced_python_test_hint")
    return ReleaseGateCheck(
        name="Rust kernel Python test inventory",
        ok=not failures,
        detail="; ".join(failures) if failures else f"{len(active)} active commands mapped to Python test evidence",
    )


def _rust_kernel_rust_test_inventory(root: Path) -> ReleaseGateCheck:
    try:
        client = _load_rust_kernel_client(root)
    except Exception as exc:
        return ReleaseGateCheck(name="Rust kernel Rust test inventory", ok=False, detail=str(exc))
    active = set(getattr(client, "ACTIVE_ENFORCEMENT_COMMANDS", set()) or set())
    manifest = dict(getattr(client, "KERNEL_OWNERSHIP_MANIFEST", {}) or {})
    failures = []
    for command in sorted(active):
        entry = manifest.get(command) or {}
        hint = str(entry.get("rust_test_hint") or "").strip()
        rust_path = root / hint if hint else None
        if rust_path is None or not rust_path.is_file():
            failures.append(f"{command}:missing_rust_test_hint")
            continue
        try:
            source_text = rust_path.read_text(encoding="utf-8", errors="replace")
        except OSError:
            failures.append(f"{command}:unreadable_rust_test_hint")
            continue
        if "#[test]" not in source_text:
            failures.append(f"{command}:missing_rust_unit_test")
    return ReleaseGateCheck(
        name="Rust kernel Rust test inventory",
        ok=not failures,
        detail="; ".join(failures) if failures else f"{len(active)} active commands mapped to Rust unit test evidence",
    )


def _active_rust_enforcement_call_inventory(root: Path) -> ReleaseGateCheck:
    try:
        client = _load_rust_kernel_client(root)
    except Exception as exc:
        return ReleaseGateCheck(name="active Rust enforcement calls", ok=False, detail=str(exc))
    active = set(getattr(client, "ACTIVE_ENFORCEMENT_COMMANDS", set()) or set())
    wrappers = dict(getattr(client, "KERNEL_COMMAND_WRAPPERS", {}) or {})
    source_text_parts = []
    for path in (root / "server_modules").rglob("*.py"):
        relative = path.relative_to(root)
        if "tests" in relative.parts:
            continue
        if path.name in {"rust_runtime_kernel_client.py", "release_gate_service.py"}:
            continue
        try:
            source_text_parts.append(path.read_text(encoding="utf-8", errors="replace"))
        except OSError:
            continue
    source_text = "\n".join(source_text_parts)

    def _command_referenced(command: str) -> bool:
        wrapper = str(wrappers.get(command, "") or "")
        wrapper_referenced = bool(wrapper and re.search(rf"\b{re.escape(wrapper)}\s*\(", source_text))
        enforced_referenced = bool(
            re.search(
                rf"\brun_runtime_kernel_enforced\s*\(\s*['\"]{re.escape(command)}['\"]",
                source_text,
            )
        )
        return wrapper_referenced or enforced_referenced

    missing = sorted(
        command
        for command in active
        if not _command_referenced(command)
    )
    return ReleaseGateCheck(
        name="active Rust enforcement calls",
        ok=not missing,
        detail="missing active calls: " + ", ".join(missing) if missing else f"{len(active)} active commands referenced outside tests",
    )


def _language_share_snapshot(root: Path) -> ReleaseGateCheck:
    totals: dict[str, int] = {}
    for path in root.rglob("*"):
        if not path.is_file():
            continue
        if any(part in LANGUAGE_EXCLUDED_DIRS for part in path.relative_to(root).parts):
            continue
        language = LANGUAGE_EXTENSIONS.get(path.suffix.lower())
        if language is None:
            continue
        try:
            size = path.stat().st_size
        except OSError:
            continue
        totals[language] = totals.get(language, 0) + int(size)
    total_bytes = sum(totals.values())
    if total_bytes <= 0:
        return ReleaseGateCheck(name="language share snapshot", ok=False, detail="no language bytes counted")
    rust_percent = (totals.get("Rust", 0) / total_bytes) * 100.0
    python_percent = (totals.get("Python", 0) / total_bytes) * 100.0
    detail = f"Rust {rust_percent:.1f}%, Python {python_percent:.1f}% across tracked source bytes"
    return ReleaseGateCheck(name="language share snapshot", ok=True, detail=detail)


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
            "server_modules/session_diagnostics_service.py",
            r"EMPYRALIS_USE_RUST_DIAGNOSTICS_REDACTION",
            "Rust diagnostics redaction opt-in",
        ),
        _pattern_exists(
            project_root,
            "server_modules/session_diagnostics_service.py",
            r"rust_runtime_kernel_client",
            "Rust diagnostics redaction adapter",
        ),
        _pattern_exists(
            project_root,
            "server_modules/sage_heartbeat_service.py",
            r"rust_kernel",
            "Rust kernel heartbeat status",
        ),
        _pattern_exists(
            project_root,
            "server_modules/sage_heartbeat_service.py",
            r"rust_runtime_kernel_client",
            "Rust kernel heartbeat adapter",
        ),
        _rust_kernel_boundary_inventory(project_root),
        _rust_kernel_python_test_inventory(project_root),
        _rust_kernel_rust_test_inventory(project_root),
        _active_rust_enforcement_call_inventory(project_root),
        _language_share_snapshot(project_root),
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
        _run(
            project_root,
            ["cargo", "fmt", "--manifest-path", RUST_KERNEL_MANIFEST, "--", "--check"],
            timeout_seconds=120,
        ),
        _run(project_root, ["cargo", "test", "--manifest-path", RUST_KERNEL_MANIFEST], timeout_seconds=180),
        _run(
            project_root,
            [sys.executable, "-m", "pytest", *RUST_KERNEL_PYTEST_TARGETS],
            timeout_seconds=120,
        ),
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
