"""
Structured operator skills for local computer actions.

Skills are deterministic handlers for safe, common workspace operations:
- fs.pwd
- fs.ls
- git.status / git.diff / git.log
- test.unittest
"""

from __future__ import annotations

import os
import subprocess
import time
from typing import Any, Dict, List, Optional, Tuple

try:
    from scripts.platform_execution import tokenize_command
except ImportError:
    from platform_execution import tokenize_command  # type: ignore[no-redef]


def _first_line(text: Any, fallback: str = "") -> str:
    raw = str(text or "").strip()
    if not raw:
        return fallback
    for line in raw.splitlines():
        line = line.strip()
        if line:
            return line[:220]
    return fallback


def _trim(text: str, limit: int) -> str:
    if limit <= 0:
        return ""
    return str(text or "")[:limit]


def _resolve_within_root(root: str, raw_path: str) -> Tuple[Optional[str], Optional[str]]:
    root_abs = os.path.abspath(root)
    if raw_path.strip():
        candidate = raw_path
        if not os.path.isabs(candidate):
            candidate = os.path.join(root_abs, candidate)
    else:
        candidate = root_abs
    resolved = os.path.abspath(candidate)
    try:
        common = os.path.commonpath([root_abs, resolved])
    except Exception:
        return None, "invalid path"
    if common != root_abs:
        return None, "path escapes operator root"
    return resolved, None


class OperatorSkillRegistry:
    def execute(
        self,
        command: str,
        root: str,
        timeout_seconds: float,
        max_output_chars: int,
    ) -> Dict[str, Any]:
        cleaned = str(command or "").strip()
        try:
            tokens = tokenize_command(cleaned)
        except Exception:
            return {"handled": True, "result": self._blocked(cleaned, "invalid command syntax")}
        if not tokens:
            return {"handled": True, "result": self._blocked(cleaned, "empty command")}

        # Filesystem skills
        if tokens == ["pwd"]:
            return {"handled": True, "result": self._pwd(cleaned, root)}
        if tokens[0] == "ls":
            return {"handled": True, "result": self._ls(cleaned, tokens, root, max_output_chars)}

        # Git skills
        if tokens[:2] == ["git", "status"]:
            return {
                "handled": True,
                "result": self._run_subprocess_skill(
                    skill="git.status",
                    command=cleaned,
                    tokens=tokens,
                    cwd=root,
                    timeout_seconds=timeout_seconds,
                    max_output_chars=max_output_chars,
                ),
            }
        if tokens[:2] == ["git", "diff"]:
            return {
                "handled": True,
                "result": self._run_subprocess_skill(
                    skill="git.diff",
                    command=cleaned,
                    tokens=tokens,
                    cwd=root,
                    timeout_seconds=timeout_seconds,
                    max_output_chars=max_output_chars,
                ),
            }
        if tokens[:3] == ["git", "log", "--oneline"]:
            return {
                "handled": True,
                "result": self._run_subprocess_skill(
                    skill="git.log",
                    command=cleaned,
                    tokens=tokens,
                    cwd=root,
                    timeout_seconds=timeout_seconds,
                    max_output_chars=max_output_chars,
                ),
            }

        # Test skills
        normalized_exec = tokens[0].replace("\\", "/").lower()
        unittest_args = tokens[1:3] == ["-m", "unittest"] or tokens[1:4] == ["-3", "-m", "unittest"]
        if unittest_args and normalized_exec in {
            "python3",
            "python",
            "py",
            ".venv/bin/python",
            ".venv/scripts/python.exe",
        }:
            return {
                "handled": True,
                "result": self._run_subprocess_skill(
                    skill="test.unittest",
                    command=cleaned,
                    tokens=tokens,
                    cwd=root,
                    timeout_seconds=timeout_seconds,
                    max_output_chars=max_output_chars,
                ),
            }

        return {"handled": False, "reason": "unsupported skill command"}

    def _base(self, command: str, skill: str, status: str, final_status: str) -> Dict[str, Any]:
        return {
            "status": status,
            "final_status": final_status,
            "action": "operator_exec",
            "command": command,
            "skill": skill,
        }

    def _blocked(self, command: str, reason: str) -> Dict[str, Any]:
        out = self._base(command=command, skill="operator.policy", status="blocked", final_status="blocked")
        out.update(
            {
                "one_line_summary": f"Command blocked: {reason}.",
                "next_action": "adjust_operator_policy",
                "risk_flags": ["operator_policy_blocked"],
                "policy_reason": reason,
            }
        )
        return out

    def _pwd(self, command: str, root: str) -> Dict[str, Any]:
        out = self._base(command=command, skill="fs.pwd", status="done", final_status="done")
        out.update(
            {
                "cwd": os.path.abspath(root),
                "stdout_excerpt": f"{os.path.abspath(root)}\n",
                "stderr_excerpt": "",
                "exit_code": 0,
                "duration_ms": 0,
                "one_line_summary": os.path.abspath(root),
                "next_action": "monitor",
                "risk_flags": [],
            }
        )
        return out

    def _ls(self, command: str, tokens: List[str], root: str, max_output_chars: int) -> Dict[str, Any]:
        show_all = False
        rel_path = ""
        if len(tokens) == 1:
            rel_path = "."
        elif len(tokens) == 2 and tokens[1] == "-la":
            show_all = True
            rel_path = "."
        elif len(tokens) == 2:
            rel_path = tokens[1]
        elif len(tokens) == 3 and tokens[1] == "-la":
            show_all = True
            rel_path = tokens[2]
        else:
            return self._blocked(command, "unsupported ls arguments")

        target, err = _resolve_within_root(root, rel_path)
        if err:
            return self._blocked(command, err)
        if not target or not os.path.exists(target):
            return self._blocked(command, "path not found")
        if not os.path.isdir(target):
            return self._blocked(command, "path is not a directory")

        entries: List[str] = []
        for name in sorted(os.listdir(target)):
            if not show_all and name.startswith("."):
                continue
            full = os.path.join(target, name)
            suffix = "/" if os.path.isdir(full) else ""
            entries.append(f"{name}{suffix}")

        if show_all:
            entries = [".", ".."] + entries

        rendered = "\n".join(entries)
        out = self._base(command=command, skill="fs.ls", status="done", final_status="done")
        out.update(
            {
                "cwd": os.path.abspath(root),
                "path": target,
                "entry_count": len(entries),
                "stdout_excerpt": _trim(rendered + ("\n" if rendered else ""), max_output_chars),
                "stderr_excerpt": "",
                "exit_code": 0,
                "duration_ms": 0,
                "one_line_summary": _first_line(rendered, fallback=f"{len(entries)} entries"),
                "next_action": "monitor",
                "risk_flags": [],
            }
        )
        return out

    def _run_subprocess_skill(
        self,
        skill: str,
        command: str,
        tokens: List[str],
        cwd: str,
        timeout_seconds: float,
        max_output_chars: int,
    ) -> Dict[str, Any]:
        started = time.time()
        try:
            proc = subprocess.run(
                tokens,
                cwd=os.path.abspath(cwd),
                capture_output=True,
                text=True,
                timeout=max(1.0, float(timeout_seconds)),
            )
            elapsed_ms = int(max(0.0, (time.time() - started) * 1000))
            out_raw = str(proc.stdout or "")
            err_raw = str(proc.stderr or "")
            out_trim = _trim(out_raw, max_output_chars)
            err_trim = _trim(err_raw, max_output_chars)
            if proc.returncode == 0:
                status = "done"
                next_action = "monitor"
                flags: List[str] = []
                summary = _first_line(out_trim, fallback=f"{skill} completed.")
            else:
                status = "failed"
                next_action = "inspect_error"
                flags = ["operator_exit_nonzero"]
                summary = _first_line(err_trim or out_trim, fallback=f"{skill} failed with exit {proc.returncode}.")

            out = self._base(command=command, skill=skill, status=status, final_status=status)
            out.update(
                {
                    "cwd": os.path.abspath(cwd),
                    "exit_code": int(proc.returncode),
                    "duration_ms": elapsed_ms,
                    "stdout_excerpt": out_trim,
                    "stderr_excerpt": err_trim,
                    "one_line_summary": summary,
                    "next_action": next_action,
                    "risk_flags": flags,
                }
            )
            return out
        except subprocess.TimeoutExpired:
            out = self._base(command=command, skill=skill, status="timeout", final_status="timeout")
            out.update(
                {
                    "cwd": os.path.abspath(cwd),
                    "one_line_summary": f"{skill} timed out after {int(timeout_seconds)}s.",
                    "next_action": "narrow_scope",
                    "risk_flags": ["operator_timeout"],
                }
            )
            return out
        except Exception as exc:
            out = self._base(command=command, skill=skill, status="failed", final_status="failed")
            out.update(
                {
                    "cwd": os.path.abspath(cwd),
                    "one_line_summary": _first_line(str(exc), fallback=f"{skill} failed."),
                    "next_action": "inspect_error",
                    "risk_flags": ["operator_exception"],
                }
            )
            return out
