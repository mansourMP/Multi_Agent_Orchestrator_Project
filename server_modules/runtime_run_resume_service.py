from __future__ import annotations

from typing import Any, Callable


def run_thread_is_alive(
    run: dict,
    *,
    enumerate_threads: Callable[[], list[Any]],
) -> bool:
    thread_id = run.get("thread_id")
    if not isinstance(thread_id, int) or thread_id <= 0:
        return False
    for worker in enumerate_threads():
        try:
            if worker.ident == thread_id and worker.is_alive():
                return True
        except Exception:
            continue
    return False


def build_run_thread_is_alive_fn(
    *,
    enumerate_threads: Callable[[], list[Any]],
) -> Callable[[dict], bool]:
    return lambda run: run_thread_is_alive(run, enumerate_threads=enumerate_threads)


def schedule_restored_run_resume(
    run_id: str,
    run: dict,
    *,
    run_thread_is_alive_fn: Callable[[dict], bool],
    utc_now_iso: Callable[[], str],
    late_server_export: Callable[[str], Any],
    thread_class: Callable[..., Any],
) -> bool:
    if not isinstance(run, dict):
        return False
    if run_thread_is_alive_fn(run):
        return False
    if str(run.get("status") or "").strip().lower() != "waiting_for_input":
        return False
    if bool(run.get("_resume_after_confirmation_scheduled")):
        return True
    context = run.get("context") if isinstance(run.get("context"), dict) else {}
    metadata = context.get("metadata") if isinstance(context.get("metadata"), dict) else {}
    selected_target = str(
        metadata.get("execution_target_selected")
        or metadata.get("execution_target")
        or ""
    ).strip().lower()
    if selected_target == "local_companion":
        run["_resume_after_confirmation_scheduled"] = True
        run["thread_id"] = None
        run["updated_at"] = utc_now_iso()
        checkpoint = run.get("browser_checkpoint") if isinstance(run.get("browser_checkpoint"), dict) else {}
        metadata["browser_resume_supported"] = bool(checkpoint)
        context["metadata"] = metadata
        run["context"] = context
        late_server_export("_enqueue_local_companion_run")(
            run_id,
            message=(
                "Resuming local companion run from saved browser checkpoint."
                if checkpoint
                else "Resuming local companion run."
            ),
            event=("local_resumed_from_checkpoint" if checkpoint else "local_resumed"),
        )
        return True
    run["_resume_after_confirmation_scheduled"] = True
    run["thread_id"] = None
    run["updated_at"] = utc_now_iso()
    late_server_export("_persist_live_run_state")(run_id, run)
    worker = thread_class(
        target=late_server_export("run_mission"),
        args=(run_id,),
        daemon=True,
        name=f"run-resume-{run_id[:8]}",
    )
    worker.start()
    return True


def build_schedule_restored_run_resume_fn(
    *,
    run_thread_is_alive_fn: Callable[[dict], bool],
    utc_now_iso: Callable[[], str],
    late_server_export: Callable[[str], Any],
    thread_class: Callable[..., Any],
) -> Callable[[str, dict], bool]:
    return lambda run_id, run: schedule_restored_run_resume(
        run_id,
        run,
        run_thread_is_alive_fn=run_thread_is_alive_fn,
        utc_now_iso=utc_now_iso,
        late_server_export=late_server_export,
        thread_class=thread_class,
    )
