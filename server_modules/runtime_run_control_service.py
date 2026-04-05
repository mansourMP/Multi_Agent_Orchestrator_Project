from __future__ import annotations

from typing import Any, Callable

from fastapi import HTTPException


def resume_waiting_run(
    run_id: str,
    *,
    run: dict[str, Any] | None,
    current_user: Any,
    serialize_run_snapshot: Callable[[str, dict[str, Any]], dict[str, Any]],
    enforce_run_owner_access: Callable[[Any, Any], None],
    get_pending_confirmation: Callable[[dict[str, Any]], Any],
    emit_log: Callable[..., None],
    schedule_restored_run_resume: Callable[[str, dict[str, Any]], bool],
) -> dict[str, Any]:
    if not isinstance(run, dict):
        raise HTTPException(status_code=404, detail="Run ID not found")
    snapshot = serialize_run_snapshot(run_id, run)
    enforce_run_owner_access(current_user, snapshot)
    if str(run.get("status") or "").strip().lower() != "waiting_for_input":
        raise HTTPException(status_code=409, detail="Run is not waiting for input.")
    pending_confirmation = get_pending_confirmation(run)
    if isinstance(pending_confirmation, dict) and pending_confirmation:
        raise HTTPException(status_code=409, detail="Run requires confirmation resolution, not direct resume.")
    checkpoint = run.get("browser_checkpoint") if isinstance(run.get("browser_checkpoint"), dict) else {}
    if not checkpoint:
        raise HTTPException(status_code=409, detail="Run does not have a resumable browser checkpoint.")
    emit_log(
        run["logs"],
        "info",
        "Resume requested for paused browser operator run.",
        event="browser_resume_requested",
        data={
            "run_id": run_id,
            "next_action_index": checkpoint.get("next_action_index"),
            "session_profile": checkpoint.get("session_profile"),
        },
    )
    if not schedule_restored_run_resume(run_id, run):
        raise HTTPException(status_code=409, detail="Run could not be resumed.")
    return {
        "status": "ok",
        "run_id": run_id,
        "resume_kind": "browser_checkpoint",
        "next_action_index": checkpoint.get("next_action_index"),
    }
