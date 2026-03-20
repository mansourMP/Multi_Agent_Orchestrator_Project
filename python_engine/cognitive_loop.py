"""
Cognitive Loop scaffold for Agency OS.

Implements a minimal Observe -> Orient -> Decide -> Act cycle that can be
extended with stronger planning policies later.
"""

import sys
import time
import uuid
import json
import os
import re
import subprocess
from typing import Any, Callable, Dict, List, Optional
from urllib import error as urlerror
from urllib import request as urlrequest

try:
    from scripts.platform_execution import (
        capability_command,
        capability_from_command,
        capability_metadata,
        default_local_companion_allow_prefixes,
        format_command,
        tokenize_command,
    )
except Exception:
    try:
        sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
        from scripts.platform_execution import (
            capability_command,
            capability_from_command,
            capability_metadata,
            default_local_companion_allow_prefixes,
            format_command,
            tokenize_command,
        )
    except Exception:
        try:
            from platform_execution import (  # type: ignore[no-redef]
                capability_command,
                capability_from_command,
                capability_metadata,
                default_local_companion_allow_prefixes,
                format_command,
                tokenize_command,
            )
        except Exception:
            def tokenize_command(command: str) -> List[str]:
                import shlex as _shlex
                return _shlex.split(str(command or "").strip())

            def capability_command(_capability: str, _project_root: str) -> Optional[List[str]]:
                return None

            def capability_from_command(_command: str, _project_root: str) -> Optional[str]:
                return None

            def capability_metadata(_capability: str, _project_root: str) -> Optional[Dict[str, Any]]:
                return None

            def format_command(argv: List[str]) -> str:
                return " ".join(str(part) for part in argv if str(part or "").strip())

            def default_local_companion_allow_prefixes(_root: str) -> List[str]:
                return [
                    "pwd",
                    "ls",
                    "ls -la",
                    "git status",
                    "git diff",
                    "git log --oneline",
                    "python3 -m unittest",
                    ".venv/bin/python -m unittest",
                    "bash scripts/status_empyralis_local_stack.sh",
                    "bash scripts/logs_empyralis_local_stack.sh",
                    "./bin/empyralis status",
                ]

try:
    from operator_skills import OperatorSkillRegistry
    OPERATOR_SKILLS_AVAILABLE = True
except Exception:
    OPERATOR_SKILLS_AVAILABLE = False
    OperatorSkillRegistry = None  # type: ignore[assignment]


def log(message: str) -> None:
    sys.stderr.write(f"[COGNITIVE_LOOP] {message}\n")
    sys.stderr.flush()


def _is_status_like_goal(goal: str) -> bool:
    text = re.sub(r"^/empyralis\b", "/orion", str(goal or "").strip(), flags=re.IGNORECASE).lower()
    if not text:
        return True
    if text in {
        "status",
        "/status",
        "runtime status",
        "status check",
        "quick status check",
        "health",
        "health check",
        "system status",
    }:
        return True
    if text.startswith("/orion status"):
        return True
    return False


def _build_operator_exec_payload(command: str, trust_mode: Optional[str], operator_approval_levels: Optional[List[str]], approval_granted: bool) -> Dict[str, Any]:
    clean_command = str(command or "").strip()
    root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    payload: Dict[str, Any] = {}
    capability = capability_from_command(clean_command, root)
    if capability:
        payload["capability"] = capability
        resolved_argv = capability_command(capability, root)
        if resolved_argv:
            payload["argv"] = list(resolved_argv)
    if clean_command and not payload.get("argv"):
        payload["command"] = clean_command
    if trust_mode:
        payload["trust_mode"] = trust_mode
    if operator_approval_levels:
        payload["operator_approval_levels"] = operator_approval_levels
    if approval_granted:
        payload["approval_granted"] = True
    return payload


def default_decider(oriented: Dict[str, Any]) -> Dict[str, Any]:
    observation = oriented.get("observation", {})
    text = re.sub(r"^/empyralis\b", "/orion", str(observation.get("text") or "").strip(), flags=re.IGNORECASE)
    lowered = text.lower()
    raw_meta = observation.get("metadata")
    metadata = raw_meta if isinstance(raw_meta, dict) else {}
    dispatch_meta = metadata.get("objective_dispatch") if isinstance(metadata.get("objective_dispatch"), dict) else {}
    trust_mode = str(metadata.get("trust_mode") or "").strip().lower()
    execution_target = str(metadata.get("execution_target") or "").strip().lower()
    if not trust_mode:
        trust_mode = str(dispatch_meta.get("trust_mode") or "").strip().lower()
    if not execution_target:
        execution_target = str(dispatch_meta.get("execution_target") or "").strip().lower()
    raw_approval = metadata.get("approval") if isinstance(metadata.get("approval"), dict) else {}
    approval_granted = bool(metadata.get("approval_granted") or raw_approval.get("approved"))
    operator_approval_levels = _normalize_risk_levels(
        metadata.get("operator_approval_levels") or dispatch_meta.get("operator_approval_levels")
    )

    if lowered.startswith("/orion run "):
        goal = text[len("/orion run ") :].strip()
        if _is_status_like_goal(goal):
            return {
                "action": "status_summary",
                "payload": {"requested_goal": goal or "status"},
                "rationale": "Status-like run goal normalized to status command.",
            }
        payload: Dict[str, Any] = {"goal": goal or "Run the default objective."}
        if trust_mode:
            payload["trust_mode"] = trust_mode
        if operator_approval_levels:
            payload["operator_approval_levels"] = operator_approval_levels
        if execution_target:
            payload["execution_target"] = execution_target
        return {
            "action": "run_goal",
            "payload": payload,
            "rationale": "Explicit run command requested.",
        }

    if lowered.startswith("/orion status") or lowered == "status":
        return {
            "action": "status_summary",
            "payload": {},
            "rationale": "Status command requested.",
        }

    if lowered.startswith("/orion help") or lowered == "help":
        return {
            "action": "help",
            "payload": {},
            "rationale": "Help command requested.",
        }

    if lowered == "/orion exec" or lowered.startswith("/orion exec "):
        command = text[len("/orion exec ") :].strip()
        if command.lower() in {"policy", "policy show", "show policy"}:
            payload: Dict[str, Any] = {}
            if trust_mode:
                payload["trust_mode"] = trust_mode
            return {
                "action": "operator_policy",
                "payload": payload,
                "rationale": "Operator policy contract requested.",
            }
        return {
            "action": "operator_exec",
            "payload": _build_operator_exec_payload(command, trust_mode, operator_approval_levels, approval_granted),
            "rationale": "Explicit local operator command requested.",
        }

    if lowered == "/orion computer" or lowered.startswith("/orion computer "):
        command = text[len("/orion computer ") :].strip()
        if command.lower() in {"policy", "policy show", "show policy"}:
            payload: Dict[str, Any] = {}
            if trust_mode:
                payload["trust_mode"] = trust_mode
            return {
                "action": "operator_policy",
                "payload": payload,
                "rationale": "Computer operator policy contract requested.",
            }
        return {
            "action": "operator_exec",
            "payload": _build_operator_exec_payload(command, trust_mode, operator_approval_levels, approval_granted),
            "rationale": "Computer operator command requested.",
        }

    if len(text) < 4:
        return {
            "action": "clarify",
            "payload": {
                "question": "Please provide a clear goal so Empyralis can execute it."
            },
            "rationale": "Input is too short to infer a reliable goal.",
        }

    return {
        "action": "run_goal",
        "payload": {
            "goal": text,
            **({"trust_mode": trust_mode} if trust_mode else {}),
            **({"operator_approval_levels": operator_approval_levels} if operator_approval_levels else {}),
            **({"execution_target": execution_target} if execution_target else {}),
        },
        "rationale": "Default to goal execution for free-text input.",
    }


TERMINAL_RUN_STATUSES = {"completed", "failed", "timeout", "waiting_for_input"}
DEFAULT_OPERATOR_ALLOW_PREFIXES = default_local_companion_allow_prefixes(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
DEFAULT_OPERATOR_BLOCKED_TOKENS = [
    "rm -rf",
    "shutdown",
    "reboot",
    "mkfs",
    "dd ",
    "sudo ",
    "launchctl",
    "kill -9",
    "chmod 777",
    "chown -r",
    "curl http://",
    "curl https://",
    "wget ",
    "scp ",
    "ssh ",
]


def _env_bool(name: str, default: bool = False) -> bool:
    raw = str(os.getenv(name, "1" if default else "0")).strip().lower()
    return raw in {"1", "true", "yes", "on"}


def _normalize_risk_levels(value: Any) -> List[str]:
    allowed = {"low", "medium", "high"}
    parsed: List[str] = []
    if isinstance(value, list):
        items = value
    elif isinstance(value, str):
        items = [part.strip() for part in value.split(",")]
    else:
        items = []
    for item in items:
        token = str(item or "").strip().lower()
        if token in allowed and token not in parsed:
            parsed.append(token)
    return parsed


class CognitiveLoop:
    def __init__(
        self,
        memory: Optional[Any] = None,
        decider: Optional[Callable[[Dict[str, Any]], Dict[str, Any]]] = None,
        actor: Optional[Callable[[Dict[str, Any]], Dict[str, Any]]] = None,
        niche_id: str = "default",
        execution_id: Optional[str] = None,
    ):
        self.memory = memory
        self.decider = decider or default_decider
        self.actor = actor
        self.niche_id = niche_id
        self.execution_id = execution_id or f"exec-{uuid.uuid4().hex[:8]}"
        self.tick_count = 0
        self.operator_skills = OperatorSkillRegistry() if OPERATOR_SKILLS_AVAILABLE else None

    def _runtime_run_mode(self) -> str:
        mode = str(os.getenv("ORION_COGNITIVE_RUN_MODE") or "auto").strip().lower()
        if mode in {"plan", "runtime", "auto"}:
            return mode
        return "auto"

    def _runtime_config(self) -> Dict[str, Any]:
        api_url = str(os.getenv("ORION_API_URL") or "http://127.0.0.1:8001").strip().rstrip("/")
        api_key = str(os.getenv("ORION_API_KEY") or os.getenv("RUNTIME_KEY") or "").strip()
        workspace_id = str(os.getenv("ORION_COGNITIVE_WORKSPACE_ID") or "default").strip() or "default"
        trust_mode = str(os.getenv("ORION_COGNITIVE_TRUST_MODE") or "").strip().lower()
        execution_target = str(os.getenv("ORION_COGNITIVE_EXECUTION_TARGET") or "").strip().lower()
        poll_seconds_raw = str(os.getenv("ORION_COGNITIVE_RUN_POLL_SECONDS") or "1.0").strip()
        wait_seconds_raw = str(os.getenv("ORION_COGNITIVE_RUN_WAIT_SECONDS") or "180").strip()
        try:
            poll_seconds = max(0.2, float(poll_seconds_raw))
        except Exception:
            poll_seconds = 1.0
        try:
            wait_seconds = max(5.0, float(wait_seconds_raw))
        except Exception:
            wait_seconds = 180.0
        return {
            "api_url": api_url,
            "api_key": api_key,
            "workspace_id": workspace_id,
            "trust_mode": trust_mode,
            "execution_target": execution_target,
            "poll_seconds": poll_seconds,
            "wait_seconds": wait_seconds,
        }

    def _runtime_request(
        self,
        config: Dict[str, Any],
        method: str,
        path: str,
        payload: Optional[Dict[str, Any]] = None,
        timeout: float = 60.0,
    ) -> Dict[str, Any]:
        headers = {
            "Accept": "application/json",
        }
        api_key = str(config.get("api_key") or "").strip()
        if api_key:
            headers["X-API-Key"] = api_key
        body: Optional[bytes] = None
        if payload is not None:
            headers["Content-Type"] = "application/json"
            body = json.dumps(payload).encode("utf-8")
        url = f"{config['api_url']}{path}"
        req = urlrequest.Request(url, data=body, headers=headers, method=method.upper())
        try:
            with urlrequest.urlopen(req, timeout=timeout) as resp:
                raw = resp.read().decode("utf-8", errors="replace")
            if not raw.strip():
                return {}
            data = json.loads(raw)
            if not isinstance(data, dict):
                raise RuntimeError("Runtime response is not an object.")
            return data
        except urlerror.HTTPError as exc:
            detail = ""
            try:
                detail = exc.read().decode("utf-8", errors="replace")
            except Exception:
                detail = ""
            msg = f"Runtime HTTP {exc.code} at {path}"
            if detail:
                msg += f": {detail}"
            raise RuntimeError(msg) from exc
        except urlerror.URLError as exc:
            raise RuntimeError(f"Runtime connection failed at {path}: {exc}") from exc

    def _start_runtime_run(self, goal: str, config: Dict[str, Any]) -> Dict[str, Any]:
        metadata: Dict[str, Any] = {}
        trust_mode = str(config.get("trust_mode") or "").strip()
        execution_target = str(config.get("execution_target") or "").strip()
        if trust_mode:
            metadata["trust_mode"] = trust_mode
        if execution_target:
            metadata["execution_target"] = execution_target
        payload: Dict[str, Any] = {
            "engine": "orion",
            "workspace_id": str(config.get("workspace_id") or "default"),
            "user_goal": goal,
        }
        if metadata:
            payload["metadata"] = metadata
        started = self._runtime_request(
            config=config,
            method="POST",
            path="/runs/start",
            payload=payload,
            timeout=30.0,
        )
        run_id = str(started.get("run_id") or "").strip()
        if not run_id:
            raise RuntimeError(f"Runtime did not return run_id: {json.dumps(started)}")
        return started

    def _wait_for_runtime_run(self, run_id: str, config: Dict[str, Any]) -> Dict[str, Any]:
        deadline = time.time() + float(config.get("wait_seconds") or 180.0)
        poll_seconds = float(config.get("poll_seconds") or 1.0)
        last_snapshot: Dict[str, Any] = {}
        while time.time() < deadline:
            snapshot = self._runtime_request(
                config=config,
                method="GET",
                path=f"/runs/{run_id}",
                payload=None,
                timeout=20.0,
            )
            status = str(snapshot.get("status") or "").strip().lower()
            last_snapshot = snapshot
            if status in TERMINAL_RUN_STATUSES:
                return snapshot
            time.sleep(poll_seconds)
        last_status = str(last_snapshot.get("status") or "unknown")
        raise RuntimeError(f"Run polling timeout for run_id={run_id} status={last_status}")

    def _operator_enabled(self) -> bool:
        raw = str(os.getenv("ORION_COGNITIVE_OPERATOR_ENABLED") or "0").strip().lower()
        return raw in {"1", "true", "yes", "on"}

    def _operator_root(self) -> str:
        override = str(os.getenv("ORION_COGNITIVE_OPERATOR_ROOT") or "").strip()
        if override:
            return os.path.abspath(override)
        return os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))

    def _operator_timeout_seconds(self) -> float:
        raw = str(os.getenv("ORION_COGNITIVE_OPERATOR_TIMEOUT_SECONDS") or "60").strip()
        try:
            return max(1.0, float(raw))
        except Exception:
            return 60.0

    def _operator_max_output_chars(self) -> int:
        raw = str(os.getenv("ORION_COGNITIVE_OPERATOR_MAX_OUTPUT_CHARS") or "1600").strip()
        try:
            return max(200, min(20000, int(raw)))
        except Exception:
            return 1600

    def _operator_allow_shell_fallback(self) -> bool:
        raw = str(os.getenv("ORION_COGNITIVE_OPERATOR_ALLOW_SHELL_FALLBACK") or "0").strip().lower()
        return raw in {"1", "true", "yes", "on"}

    def _operator_allow_prefixes(self) -> List[str]:
        raw = str(
            os.getenv("ORION_LOCAL_COMPANION_COMMAND_ALLOW_PREFIXES")
            or os.getenv("ORION_COGNITIVE_OPERATOR_ALLOW_PREFIXES")
            or ""
        ).strip()
        if raw:
            seen: set[str] = set()
            parsed: List[str] = []
            for item in raw.split(","):
                token = item.strip()
                if not token or token in seen:
                    continue
                seen.add(token)
                parsed.append(token)
            if parsed:
                return parsed
        return list(DEFAULT_OPERATOR_ALLOW_PREFIXES)

    @staticmethod
    def _operator_risk_levels_from_env(name: str, fallback: List[str]) -> List[str]:
        raw = str(os.getenv(name) or "").strip().lower()
        if not raw:
            return list(fallback)
        allowed = {"low", "medium", "high"}
        parsed: List[str] = []
        for item in raw.split(","):
            token = str(item or "").strip().lower()
            if token in allowed and token not in parsed:
                parsed.append(token)
        return parsed if parsed else list(fallback)

    def _operator_approval_levels(self, trust_mode: str, override_levels: Optional[Any] = None) -> List[str]:
        if override_levels is not None:
            normalized_override = _normalize_risk_levels(override_levels)
            if normalized_override or str(override_levels).strip() == "":
                return normalized_override
        mode = self._normalize_operator_trust_mode(trust_mode)
        if mode == "auto":
            return self._operator_risk_levels_from_env("ORION_COGNITIVE_OPERATOR_APPROVAL_LEVELS_AUTO", [])
        if mode == "strict":
            fallback = ["medium", "high"]
            levels = self._operator_risk_levels_from_env("ORION_COGNITIVE_OPERATOR_APPROVAL_LEVELS_STRICT", fallback)
            if _env_bool("ORION_COGNITIVE_OPERATOR_STRICT_APPROVAL_ALL", False):
                return ["low", "medium", "high"]
            return levels
        return self._operator_risk_levels_from_env("ORION_COGNITIVE_OPERATOR_APPROVAL_LEVELS_GUARDED", ["high"])

    def _operator_policy_contract(
        self,
        trust_mode: Optional[str] = None,
        override_levels: Optional[Any] = None,
    ) -> Dict[str, Any]:
        resolved_mode = self._operator_trust_mode(trust_mode)
        approval_levels = self._operator_approval_levels(resolved_mode, override_levels=override_levels)
        return {
            "enabled": self._operator_enabled(),
            "trust_mode": resolved_mode,
            "approval_levels": approval_levels,
            "allow_prefixes": self._operator_allow_prefixes(),
            "blocked_tokens": list(DEFAULT_OPERATOR_BLOCKED_TOKENS),
            "allow_shell_fallback": self._operator_allow_shell_fallback(),
            "root": self._operator_root(),
            "timeout_seconds": self._operator_timeout_seconds(),
            "max_output_chars": self._operator_max_output_chars(),
        }

    @staticmethod
    def _normalize_operator_trust_mode(raw: Any) -> str:
        value = str(raw or "").strip().lower()
        alias = {
            "default": "guarded",
            "safe": "guarded",
            "approve_on_risk": "guarded",
            "approval_on_risk": "guarded",
            "always_approve": "strict",
            "strict_approval": "strict",
            "no_approval": "auto",
        }
        normalized = alias.get(value, value)
        if normalized in {"auto", "guarded", "strict"}:
            return normalized
        return "guarded"

    def _operator_trust_mode(self, payload_trust_mode: Optional[str] = None) -> str:
        if payload_trust_mode:
            return self._normalize_operator_trust_mode(payload_trust_mode)
        env_value = os.getenv("ORION_COGNITIVE_OPERATOR_TRUST_MODE")
        return self._normalize_operator_trust_mode(env_value or "guarded")

    def _operator_risk_level(self, command: str) -> str:
        cleaned = str(command or "").strip()
        if not cleaned:
            return "high"
        try:
            command_tokens = [str(token or "").lower() for token in tokenize_command(cleaned)]
        except Exception:
            return "high"
        if not command_tokens:
            return "high"

        low_risk_prefixes = [
            ["pwd"],
            ["ls"],
            ["ls", "-la"],
            ["git", "status"],
            ["git", "log", "--oneline"],
        ]
        medium_risk_prefixes = [
            ["git", "diff"],
            ["python3", "-m", "unittest"],
            [".venv/bin/python", "-m", "unittest"],
        ]

        for prefix in low_risk_prefixes:
            if len(command_tokens) >= len(prefix) and command_tokens[: len(prefix)] == prefix:
                return "low"
        for prefix in medium_risk_prefixes:
            if len(command_tokens) >= len(prefix) and command_tokens[: len(prefix)] == prefix:
                return "medium"
        return "high"

    @staticmethod
    def _operator_requires_approval(approval_levels: List[str], risk_level: str) -> bool:
        normalized = str(risk_level or "").strip().lower()
        return normalized in set(str(item or "").strip().lower() for item in approval_levels if str(item or "").strip())

    def _operator_policy_check(
        self,
        command: str,
        capability: Optional[str] = None,
        argv: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        cleaned = str(command or "").strip()
        root = self._operator_root()
        resolved_capability = str(capability or capability_from_command(cleaned, root) or "").strip()
        resolved_argv = [str(part) for part in (argv or []) if str(part or "").strip()]
        if not resolved_argv and resolved_capability:
            resolved_argv = list(capability_command(resolved_capability, root) or [])
        if not cleaned and resolved_argv:
            cleaned = format_command(resolved_argv)
        if not cleaned:
            return {"ok": False, "reason": "empty command"}
        lowered = cleaned.lower()
        for token in DEFAULT_OPERATOR_BLOCKED_TOKENS:
            if token in lowered:
                return {"ok": False, "reason": f"blocked token '{token}'"}

        try:
            command_tokens = resolved_argv or tokenize_command(cleaned)
        except Exception:
            return {"ok": False, "reason": "invalid command syntax"}
        if not command_tokens:
            return {"ok": False, "reason": "empty command"}

        prefixes = self._operator_allow_prefixes()
        for prefix in prefixes:
            try:
                prefix_tokens = tokenize_command(prefix)
            except Exception:
                continue
            if not prefix_tokens:
                continue
            if len(command_tokens) >= len(prefix_tokens) and command_tokens[: len(prefix_tokens)] == prefix_tokens:
                return {
                    "ok": True,
                    "tokens": command_tokens,
                    "prefix": prefix,
                    "capability": resolved_capability,
                    "display_command": cleaned or format_command(command_tokens),
                }
        return {"ok": False, "reason": "command not in allowlist"}

    def _execute_operator_command(
        self,
        command: str,
        trust_mode: Optional[str] = None,
        approval_granted: bool = False,
        capability: Optional[str] = None,
        argv: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        root = self._operator_root()
        resolved_capability = str(capability or capability_from_command(command, root) or "").strip()
        resolved_argv = [str(part) for part in (argv or []) if str(part or "").strip()]
        if not resolved_argv and resolved_capability:
            resolved_argv = list(capability_command(resolved_capability, root) or [])
        display_command = str(command or "").strip() or (format_command(resolved_argv) if resolved_argv else "")
        resolved_trust_mode = self._operator_trust_mode(trust_mode)
        risk_level = self._operator_risk_level(display_command)
        policy_contract = self._operator_policy_contract(resolved_trust_mode)
        approval_levels = list(policy_contract.get("approval_levels") or [])
        capability_detail = capability_metadata(resolved_capability, root) if resolved_capability else None
        capability_title = str(capability_detail.get("title") or "").strip() if isinstance(capability_detail, dict) else ""
        if not bool(policy_contract.get("enabled")):
            return {
                "status": "blocked",
                "final_status": "blocked",
                "action": "operator_exec",
                "command": display_command,
                "argv": resolved_argv or None,
                "capability": resolved_capability or None,
                "trust_mode": resolved_trust_mode,
                "risk_level": risk_level,
                "policy": policy_contract,
                "one_line_summary": (
                    f"{capability_title} is disabled by operator mode."
                    if capability_title
                    else "Operator mode is disabled."
                ),
                "next_action": "enable_operator_mode",
                "risk_flags": ["operator_mode_disabled"],
            }
        requires_approval = self._operator_requires_approval(approval_levels, risk_level)
        if (not approval_granted) and requires_approval:
            return {
                "status": "waiting_for_input",
                "final_status": "waiting_for_input",
                "action": "operator_exec",
                "command": display_command,
                "argv": resolved_argv or None,
                "capability": resolved_capability or None,
                "trust_mode": resolved_trust_mode,
                "risk_level": risk_level,
                "approval_levels": approval_levels,
                "policy": policy_contract,
                "one_line_summary": (
                    f"Approval required for {capability_title or 'operator command'} "
                    f"({risk_level} risk, {resolved_trust_mode} mode)."
                ),
                "next_action": "resolve_approval",
                "risk_flags": ["approval_required", f"risk_{risk_level}"],
            }

        policy = self._operator_policy_check(display_command, capability=resolved_capability or None, argv=resolved_argv or None)
        if not bool(policy.get("ok")):
            return {
                "status": "blocked",
                "final_status": "blocked",
                "action": "operator_exec",
                "command": display_command,
                "argv": resolved_argv or None,
                "capability": resolved_capability or None,
                "trust_mode": resolved_trust_mode,
                "risk_level": risk_level,
                "approval_levels": approval_levels,
                "policy": policy_contract,
                "one_line_summary": f"{capability_title or 'Command'} blocked by policy: {policy.get('reason')}.",
                "next_action": "adjust_operator_policy",
                "risk_flags": ["operator_policy_blocked"],
                "policy_reason": str(policy.get("reason") or "blocked"),
            }

        tokens = list(policy.get("tokens") or [])
        timeout_seconds = self._operator_timeout_seconds()
        max_chars = self._operator_max_output_chars()
        allow_prefix = str(policy.get("prefix") or "")
        display_command = str(policy.get("display_command") or display_command).strip() or display_command
        resolved_capability = str(policy.get("capability") or resolved_capability or "").strip()
        capability_detail = capability_metadata(resolved_capability, root) if resolved_capability else None
        capability_title = str(capability_detail.get("title") or "").strip() if isinstance(capability_detail, dict) else ""

        if self.operator_skills is not None:
            skill_exec = self.operator_skills.execute(
                command=display_command,
                root=root,
                timeout_seconds=timeout_seconds,
                max_output_chars=max_chars,
            )
            if bool(skill_exec.get("handled")):
                result = skill_exec.get("result")
                if isinstance(result, dict):
                    if allow_prefix and not result.get("allow_prefix"):
                        result["allow_prefix"] = allow_prefix
                    return result

        if not self._operator_allow_shell_fallback():
            return {
                "status": "blocked",
                "final_status": "blocked",
                "action": "operator_exec",
                "command": display_command,
                "argv": tokens or None,
                "capability": resolved_capability or None,
                "capability_title": capability_title or None,
                "trust_mode": resolved_trust_mode,
                "risk_level": risk_level,
                "allow_prefix": allow_prefix,
                "approval_levels": approval_levels,
                "policy": policy_contract,
                "one_line_summary": f"No structured handler for {capability_title or 'this operator action'}.",
                "next_action": "add_operator_skill",
                "risk_flags": ["operator_skill_missing"],
            }

        started = time.time()
        try:
            proc = subprocess.run(
                tokens,
                cwd=root,
                capture_output=True,
                text=True,
                timeout=timeout_seconds,
            )
            elapsed_ms = int(max(0.0, (time.time() - started) * 1000))
            out = str(proc.stdout or "")
            err = str(proc.stderr or "")
            out_trim = out[:max_chars]
            err_trim = err[:max_chars]
            if proc.returncode == 0:
                summary = self._first_line(out_trim, fallback="Operator command completed.")
                status = "done"
                next_action = "monitor"
                flags: List[str] = []
            else:
                summary = self._first_line(err_trim or out_trim, fallback=f"Command failed with exit {proc.returncode}.")
                status = "failed"
                next_action = "inspect_error"
                flags = ["operator_exit_nonzero"]
            return {
                "status": status,
                "final_status": status,
                "action": "operator_exec",
                "command": display_command,
                "argv": tokens or None,
                "capability": resolved_capability or None,
                "capability_title": capability_title or None,
                "trust_mode": resolved_trust_mode,
                "risk_level": risk_level,
                "cwd": root,
                "allow_prefix": allow_prefix,
                "approval_levels": approval_levels,
                "policy": policy_contract,
                "exit_code": int(proc.returncode),
                "duration_ms": elapsed_ms,
                "stdout_excerpt": out_trim,
                "stderr_excerpt": err_trim,
                "one_line_summary": summary,
                "next_action": next_action,
                "risk_flags": flags,
            }
        except subprocess.TimeoutExpired:
            return {
                "status": "timeout",
                "final_status": "timeout",
                "action": "operator_exec",
                "command": display_command,
                "argv": tokens or None,
                "capability": resolved_capability or None,
                "capability_title": capability_title or None,
                "trust_mode": resolved_trust_mode,
                "risk_level": risk_level,
                "cwd": root,
                "approval_levels": approval_levels,
                "policy": policy_contract,
                "one_line_summary": f"Command timed out after {int(timeout_seconds)}s.",
                "next_action": "narrow_scope",
                "risk_flags": ["operator_timeout"],
            }
        except Exception as exc:
            return {
                "status": "failed",
                "final_status": "failed",
                "action": "operator_exec",
                "command": display_command,
                "argv": resolved_argv or None,
                "capability": resolved_capability or None,
                "trust_mode": resolved_trust_mode,
                "risk_level": risk_level,
                "cwd": root,
                "approval_levels": approval_levels,
                "policy": policy_contract,
                "one_line_summary": self._first_line(str(exc), fallback="Operator command failed."),
                "next_action": "inspect_error",
                "risk_flags": ["operator_exception"],
            }

    @staticmethod
    def _first_line(text: Any, fallback: str = "") -> str:
        raw = str(text or "").strip()
        if not raw:
            return fallback
        for line in raw.splitlines():
            cleaned = line.strip()
            if cleaned:
                return cleaned[:220]
        return fallback

    @staticmethod
    def _derive_next_action(status: str, has_approval: bool) -> str:
        if status == "completed":
            return "review_output"
        if status in {"failed", "timeout"}:
            return "inspect_run"
        if status == "waiting_for_input" or has_approval:
            return "resolve_approval"
        if status == "planned":
            return "start_runtime_run"
        if status == "needs_input":
            return "provide_clarification"
        return "monitor"

    @staticmethod
    def _derive_risk_flags(status: str, route: Any, has_approval: bool) -> List[str]:
        flags: List[str] = []
        if status in {"failed", "timeout"}:
            flags.append(status)
        if has_approval or status == "waiting_for_input":
            flags.append("approval_required")
        if isinstance(route, dict) and route.get("fallback"):
            flags.append("route_fallback")
        return flags

    def _remember(self, text: str, metadata: Dict[str, Any]) -> None:
        if not self.memory:
            return
        try:
            self.memory.upsert_memory(text, metadata)
        except Exception as exc:
            log(f"memory upsert skipped: {exc}")

    def observe(self, event: Any) -> Dict[str, Any]:
        if isinstance(event, str):
            text = event.strip()
            source = "cli"
            metadata = {}
        elif isinstance(event, dict):
            text = str(event.get("text") or "").strip()
            source = str(event.get("source") or "unknown")
            raw_meta = event.get("metadata")
            metadata = raw_meta if isinstance(raw_meta, dict) else {}
        else:
            raise ValueError("event must be a string or object")

        if not text:
            raise ValueError("event text is required")

        observation = {
            "id": uuid.uuid4().hex,
            "source": source,
            "text": text,
            "timestamp": time.time(),
            "metadata": metadata,
        }
        self._remember(
            text,
            {
                "source": "cognitive.observe",
                "event_source": source,
                "niche_id": self.niche_id,
                "execution_id": self.execution_id,
                "tags": ["observe"],
                "timestamp": observation["timestamp"],
            },
        )
        return observation

    def orient(self, observation: Dict[str, Any], k: int = 5) -> Dict[str, Any]:
        text = str(observation.get("text") or "")
        context: List[Dict[str, Any]] = []
        if self.memory and text:
            try:
                context = self.memory.search_memory(text, k=max(1, int(k)))
            except Exception as exc:
                log(f"memory search skipped: {exc}")

        intent = "status" if "status" in text.lower() else "run"
        oriented = {
            "observation": observation,
            "context": context,
            "hypothesis": {
                "intent": intent,
                "context_count": len(context),
            },
        }
        return oriented

    def decide(self, oriented: Dict[str, Any]) -> Dict[str, Any]:
        decision = self.decider(oriented)
        if not isinstance(decision, dict):
            raise RuntimeError("decider must return an object")
        if not decision.get("action"):
            raise RuntimeError("decision requires an action")
        if "payload" not in decision or not isinstance(decision.get("payload"), dict):
            decision["payload"] = {}
        if "rationale" not in decision:
            decision["rationale"] = "No rationale provided."

        self._remember(
            f"Decision: {decision['action']}",
            {
                "source": "cognitive.decide",
                "niche_id": self.niche_id,
                "execution_id": self.execution_id,
                "tags": ["decide", str(decision["action"])],
                "timestamp": time.time(),
            },
        )
        return decision

    def act(self, decision: Dict[str, Any]) -> Dict[str, Any]:
        if self.actor:
            result = self.actor(decision)
            if not isinstance(result, dict):
                raise RuntimeError("actor must return an object")
        else:
            action = str(decision.get("action"))
            payload = decision.get("payload", {})
            if action == "run_goal":
                goal = str(payload.get("goal") or "Run the default objective.").strip()
                run_mode = self._runtime_run_mode()
                config = self._runtime_config()
                payload_workspace = str(payload.get("workspace_id") or "").strip()
                if payload_workspace:
                    config["workspace_id"] = payload_workspace
                payload_trust = str(payload.get("trust_mode") or "").strip().lower()
                if payload_trust in {"auto", "guarded", "strict"}:
                    config["trust_mode"] = payload_trust
                payload_target = str(payload.get("execution_target") or "").strip().lower()
                if payload_target in {"auto", "cloud", "local_companion"}:
                    config["execution_target"] = payload_target
                api_key = str(config.get("api_key") or "").strip()
                if run_mode == "plan":
                    result = {
                        "status": "planned",
                        "final_status": "planned",
                        "action": action,
                        "goal": goal,
                        "execution_target_requested": str(config.get("execution_target") or ""),
                        "trust_mode_requested": str(config.get("trust_mode") or ""),
                        "one_line_summary": "Run planned locally; runtime execution skipped by mode.",
                        "next_action": "start_runtime_run",
                        "risk_flags": [],
                    }
                elif not api_key:
                    if run_mode == "runtime":
                        raise RuntimeError("Runtime run mode requires an Empyralis runtime key.")
                    result = {
                        "status": "planned",
                        "final_status": "planned",
                        "action": action,
                        "goal": goal,
                        "execution_target_requested": str(config.get("execution_target") or ""),
                        "trust_mode_requested": str(config.get("trust_mode") or ""),
                        "note": "Runtime key missing; stayed in plan mode.",
                        "one_line_summary": "Runtime key missing; run remains planned only.",
                        "next_action": "set_runtime_key",
                        "risk_flags": ["missing_runtime_key"],
                    }
                else:
                    started = self._start_runtime_run(goal, config)
                    run_id = str(started.get("run_id") or "").strip()
                    snapshot = self._wait_for_runtime_run(run_id, config)
                    runtime_status = str(snapshot.get("status") or "unknown").strip().lower()
                    normalized_status = "needs_input" if runtime_status == "waiting_for_input" else runtime_status
                    result_summary = snapshot.get("result")
                    pending_approval = snapshot.get("pending_approval")
                    next_action = self._derive_next_action(runtime_status, bool(pending_approval))
                    risk_flags = self._derive_risk_flags(runtime_status, started.get("route"), bool(pending_approval))
                    one_line_summary = self._first_line(
                        result_summary,
                        fallback=f"Run finished with status '{runtime_status}'.",
                    )
                    result = {
                        "status": normalized_status,
                        "final_status": runtime_status,
                        "action": action,
                        "goal": goal,
                        "execution_target_requested": str(config.get("execution_target") or ""),
                        "trust_mode_requested": str(config.get("trust_mode") or ""),
                        "run_id": run_id,
                        "runtime_status": runtime_status,
                        "run_url": f"/runs/{run_id}",
                        "route": started.get("route"),
                        "result_summary": result_summary,
                        "result_data": snapshot.get("result_data"),
                        "pending_approval": pending_approval,
                        "one_line_summary": one_line_summary,
                        "next_action": next_action,
                        "risk_flags": risk_flags,
                    }
            elif action == "status_summary":
                result = {
                    "status": "ok",
                    "action": action,
                    "message": "Status refresh requested.",
                    "final_status": "ok",
                    "one_line_summary": "Runtime status refresh requested.",
                    "next_action": "monitor",
                    "risk_flags": [],
                }
            elif action == "help":
                result = {
                    "status": "ok",
                    "action": action,
                    "message": "Use /empyralis run <goal>, /empyralis status, /empyralis exec <command>, or /empyralis exec policy.",
                    "final_status": "ok",
                    "one_line_summary": "Help prompt returned.",
                    "next_action": "monitor",
                    "risk_flags": [],
                }
            elif action == "operator_exec":
                result = self._execute_operator_command(
                    str(payload.get("command") or "").strip(),
                    trust_mode=str(payload.get("trust_mode") or "").strip(),
                    approval_granted=bool(payload.get("approval_granted")),
                    capability=str(payload.get("capability") or "").strip() or None,
                    argv=[str(part) for part in payload.get("argv")] if isinstance(payload.get("argv"), list) else None,
                )
            elif action == "operator_policy":
                contract = self._operator_policy_contract(str(payload.get("trust_mode") or "").strip())
                result = {
                    "status": "ok",
                    "final_status": "ok",
                    "action": action,
                    "policy": contract,
                    "one_line_summary": (
                        f"Operator policy mode={contract.get('trust_mode')} "
                        f"approval={','.join(contract.get('approval_levels') or []) or 'none'}."
                    ),
                    "next_action": "monitor",
                    "risk_flags": [],
                }
            elif action == "clarify":
                result = {
                    "status": "needs_input",
                    "action": action,
                    "question": payload.get("question", "Please provide more detail."),
                    "final_status": "needs_input",
                    "one_line_summary": "Need a clearer goal before execution.",
                    "next_action": "provide_clarification",
                    "risk_flags": [],
                }
            else:
                result = {
                    "status": "skipped",
                    "action": action,
                    "message": "No actor wired for this action yet.",
                    "final_status": "skipped",
                    "one_line_summary": "Action skipped; no actor available.",
                    "next_action": "monitor",
                    "risk_flags": [],
                }

        action_result_line = f"Action result: {result.get('action')}/{result.get('status')}"
        run_id = str(result.get("run_id") or "").strip()
        if run_id:
            action_result_line += f" run_id={run_id}"
        self._remember(
            action_result_line,
            {
                "source": "cognitive.act",
                "niche_id": self.niche_id,
                "execution_id": self.execution_id,
                "tags": ["act", str(result.get("action"))],
                "timestamp": time.time(),
            },
        )
        return result

    def plan(self, oriented: Dict[str, Any], decision: Dict[str, Any]) -> Dict[str, Any]:
        action = str(decision.get("action") or "unknown")
        hypothesis = oriented.get("hypothesis", {}) if isinstance(oriented, dict) else {}
        intent = str(hypothesis.get("intent") or "unknown")
        context_count = int(hypothesis.get("context_count") or 0)

        steps = [
            {
                "id": "plan_context",
                "name": "Gather context",
                "status": "ready",
                "detail": f"context_count={context_count}",
            },
            {
                "id": "plan_execute",
                "name": "Execute selected action",
                "status": "ready",
                "detail": action,
            },
            {
                "id": "plan_verify",
                "name": "Verify output",
                "status": "ready",
                "detail": "consistency and completion checks",
            },
        ]
        return {
            "intent": intent,
            "action": action,
            "steps": steps,
            "summary": f"Plan for action '{action}' with {context_count} memory items.",
        }

    def execute(self, decision: Dict[str, Any], plan: Dict[str, Any]) -> Dict[str, Any]:
        started_at = time.time()
        result = self.act(decision)
        ended_at = time.time()
        return {
            "result": result,
            "duration_ms": int(max(0.0, (ended_at - started_at) * 1000)),
            "steps_completed": [s.get("id") for s in plan.get("steps", []) if isinstance(s, dict)],
        }

    def verify(
        self, oriented: Dict[str, Any], decision: Dict[str, Any], execution: Dict[str, Any]
    ) -> Dict[str, Any]:
        result = execution.get("result", {}) if isinstance(execution, dict) else {}
        action = str(decision.get("action") or "")
        result_action = str(result.get("action") or action)
        status = str(result.get("status") or "")

        action_match = result_action == action
        status_ok = status in {
            "ok",
            "planned",
            "needs_input",
            "done",
            "skipped",
            "blocked",
            "completed",
            "failed",
            "timeout",
            "waiting_for_input",
        }
        context_ok = int((oriented.get("hypothesis") or {}).get("context_count") or 0) >= 0
        passed = action_match and status_ok and context_ok

        return {
            "passed": passed,
            "checks": {
                "action_match": action_match,
                "status_ok": status_ok,
                "context_ok": context_ok,
            },
            "status": status,
        }

    def reflect(
        self,
        oriented: Dict[str, Any],
        decision: Dict[str, Any],
        execution: Dict[str, Any],
        verification: Dict[str, Any],
    ) -> Dict[str, Any]:
        action = str(decision.get("action") or "unknown")
        status = str((execution.get("result") or {}).get("status") or "unknown")
        passed = bool(verification.get("passed"))
        context_count = int((oriented.get("hypothesis") or {}).get("context_count") or 0)
        lesson = (
            f"{'Passed' if passed else 'Failed'} verification for action '{action}' "
            f"with status '{status}' (context={context_count})."
        )
        confidence = 0.9 if passed else 0.3

        self._remember(
            lesson,
            {
                "source": "cognitive.reflect",
                "niche_id": self.niche_id,
                "execution_id": self.execution_id,
                "tags": ["reflect", "lesson", action],
                "confidence": confidence,
                "timestamp": time.time(),
            },
        )
        return {
            "lesson": lesson,
            "confidence": confidence,
        }

    def tick(self, event: Any, k: int = 5) -> Dict[str, Any]:
        self.tick_count += 1
        observation = self.observe(event)
        oriented = self.orient(observation, k=k)
        decision = self.decide(oriented)
        plan = self.plan(oriented, decision)
        execution = self.execute(decision, plan)
        verification = self.verify(oriented, decision, execution)
        reflection = self.reflect(oriented, decision, execution, verification)
        return {
            "tick_id": self.tick_count,
            "observation": observation,
            "oriented": oriented,
            "decision": decision,
            "plan": plan,
            "execution": execution,
            "verification": verification,
            "reflection": reflection,
            "result": execution.get("result", {}),
        }

    def run(self, events: List[Any], k: int = 5, max_steps: int = 50) -> Dict[str, Any]:
        if not isinstance(events, list):
            raise ValueError("events must be a list")
        if max_steps < 1:
            raise ValueError("max_steps must be >= 1")

        outputs: List[Dict[str, Any]] = []
        for event in events[:max_steps]:
            outputs.append(self.tick(event, k=k))
        return {
            "steps": len(outputs),
            "results": outputs,
        }
