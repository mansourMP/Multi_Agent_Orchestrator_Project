import json
import os
import tempfile
import time
import unittest

from cognitive_daemon import (
    create_objective,
    build_dependency_plan,
    claim_next_event,
    complete_event,
    daemon_status,
    derive_event_priority,
    dispatch_objective_now,
    enqueue_event,
    fail_event,
    get_event,
    get_objective,
    get_event_digest,
    init_queue_db,
    ingest_due_objectives,
    list_objectives,
    list_event_digests,
    list_pending_approvals,
    list_recent_objective_reflections,
    list_skill_candidates,
    maybe_apply_skill_replay,
    _record_objective_skill_replay_policy,
    decay_skill_candidates,
    autotune_objective,
    simulate_objective_policy,
    tail_objective,
    queue_counts,
    read_daemon_state,
    requeue_stale_processing,
    update_objective,
    resolve_event_approval,
    wait_for_event,
    write_daemon_state,
)


class TestCognitiveDaemon(unittest.TestCase):
    def setUp(self):
        self.tmp_dir = tempfile.TemporaryDirectory()
        self.db_path = os.path.join(self.tmp_dir.name, "daemon_test.db")
        self.niche_id = "astronomy-agent-001"
        init_queue_db(self.db_path)

    def tearDown(self):
        self.tmp_dir.cleanup()

    def test_enqueue_claim_complete(self):
        first_id = enqueue_event(
            db_path=self.db_path,
            niche_id=self.niche_id,
            event={"text": "first event"},
            priority=50,
        )
        second_id = enqueue_event(
            db_path=self.db_path,
            niche_id=self.niche_id,
            event={"text": "second event"},
            priority=10,
        )
        self.assertNotEqual(first_id, second_id)

        claimed = claim_next_event(self.db_path, self.niche_id)
        self.assertIsNotNone(claimed)
        self.assertEqual(claimed["id"], second_id)
        self.assertEqual(claimed["status"], "processing")

        complete_event(self.db_path, second_id, {"ok": True, "result": "done"})
        counts = queue_counts(self.db_path, self.niche_id)
        self.assertEqual(counts["done"], 1)
        self.assertEqual(counts["pending"], 1)

    def test_requeue_stale_processing(self):
        event_id = enqueue_event(
            db_path=self.db_path,
            niche_id=self.niche_id,
            event={"text": "stale me"},
        )
        claimed = claim_next_event(self.db_path, self.niche_id)
        self.assertEqual(claimed["id"], event_id)

        # Force event to look stale.
        import sqlite3

        conn = sqlite3.connect(self.db_path)
        try:
            conn.execute(
                "UPDATE cognitive_event_queue SET started_at=?, updated_at=? WHERE id=?",
                (time.time() - 9999, time.time() - 9999, event_id),
            )
            conn.commit()
        finally:
            conn.close()

        changed = requeue_stale_processing(self.db_path, self.niche_id, stale_after_seconds=60)
        self.assertEqual(changed, 1)

        claimed_again = claim_next_event(self.db_path, self.niche_id)
        self.assertIsNotNone(claimed_again)
        self.assertEqual(claimed_again["id"], event_id)

    def test_status_model(self):
        write_daemon_state(
            db_path=self.db_path,
            niche_id=self.niche_id,
            status="running",
            pid=999999,
            poll_seconds=2.0,
        )
        state = read_daemon_state(self.db_path, self.niche_id)
        self.assertEqual(state["status"], "running")
        self.assertFalse(state["pid_alive"])

        status = daemon_status(self.niche_id, self.db_path)
        self.assertTrue(status["ok"])
        self.assertIn("state", status)
        self.assertIn("queue", status)

    def test_wait_for_event_done(self):
        event_id = enqueue_event(
            db_path=self.db_path,
            niche_id=self.niche_id,
            event={"text": "wait test"},
        )
        complete_event(self.db_path, event_id, {"ok": True, "action": "status_summary"})

        waited = wait_for_event(self.db_path, event_id, timeout_seconds=1.0, poll_seconds=0.1)
        self.assertTrue(waited["ok"])
        self.assertEqual(waited["status"], "done")
        self.assertEqual(waited["event"]["id"], event_id)
        self.assertIsNotNone(get_event(self.db_path, event_id))

    def test_wait_for_event_waiting_for_input(self):
        event_id = enqueue_event(
            db_path=self.db_path,
            niche_id=self.niche_id,
            event={"text": "/orion exec git diff"},
        )
        waiting_result = {
            "ok": True,
            "execution_id": "exec-wait",
            "tick": {
                "result": {
                    "status": "waiting_for_input",
                    "final_status": "waiting_for_input",
                    "action": "operator_exec",
                    "command": "git diff",
                    "risk_level": "medium",
                    "one_line_summary": "Approval required.",
                    "next_action": "resolve_approval",
                    "risk_flags": ["approval_required", "risk_medium"],
                }
            },
        }
        complete_event(self.db_path, event_id, waiting_result)

        waited = wait_for_event(self.db_path, event_id, timeout_seconds=1.0, poll_seconds=0.1)
        self.assertTrue(waited["ok"])
        self.assertEqual(waited["status"], "waiting_for_input")
        row = get_event(self.db_path, event_id)
        self.assertIsNotNone(row)
        self.assertEqual(row["status"], "waiting_for_input")
        pending = list_pending_approvals(self.db_path, self.niche_id, limit=10)
        self.assertGreaterEqual(len(pending), 1)
        self.assertEqual(pending[0]["event_id"], event_id)
        self.assertEqual(pending[0]["risk_level"], "medium")

    def test_pending_approvals_can_filter_by_objective(self):
        waiting_result = {
            "ok": True,
            "execution_id": "exec-objective-filter",
            "tick": {
                "result": {
                    "status": "waiting_for_input",
                    "final_status": "waiting_for_input",
                    "action": "run_goal",
                    "one_line_summary": "Approval required.",
                    "next_action": "resolve_approval",
                    "risk_flags": ["approval_required"],
                }
            },
        }
        e1 = enqueue_event(
            db_path=self.db_path,
            niche_id=self.niche_id,
            event={
                "text": "/orion run status A",
                "metadata": {"objective_id": "obj-A", "objective_title": "Objective A"},
            },
        )
        e2 = enqueue_event(
            db_path=self.db_path,
            niche_id=self.niche_id,
            event={
                "text": "/orion run status B",
                "metadata": {"objective_id": "obj-B", "objective_title": "Objective B"},
            },
        )
        complete_event(self.db_path, e1, waiting_result)
        complete_event(self.db_path, e2, waiting_result)

        only_a = list_pending_approvals(self.db_path, self.niche_id, limit=10, objective_id="obj-A")
        self.assertEqual(len(only_a), 1)
        self.assertEqual(only_a[0]["event_id"], e1)
        self.assertEqual(only_a[0]["objective_id"], "obj-A")
        self.assertEqual(only_a[0]["objective_title"], "Objective A")

        only_b = list_pending_approvals(self.db_path, self.niche_id, limit=10, objective_id="obj-B")
        self.assertEqual(len(only_b), 1)
        self.assertEqual(only_b[0]["event_id"], e2)
        self.assertEqual(only_b[0]["objective_id"], "obj-B")

    def test_priority_policy_default(self):
        self.assertLess(derive_event_priority("/orion status"), derive_event_priority("/orion run deep research"))

        event_status = enqueue_event(
            db_path=self.db_path,
            niche_id=self.niche_id,
            event={"text": "/orion status"},
            priority=None,
        )
        event_run = enqueue_event(
            db_path=self.db_path,
            niche_id=self.niche_id,
            event={"text": "/orion run deep research"},
            priority=None,
        )
        row_status = get_event(self.db_path, event_status)
        row_run = get_event(self.db_path, event_run)
        self.assertIsNotNone(row_status)
        self.assertIsNotNone(row_run)
        self.assertLess(int(row_status["priority"]), int(row_run["priority"]))

    def test_dependency_blocking_order(self):
        first = enqueue_event(
            db_path=self.db_path,
            niche_id=self.niche_id,
            event={"text": "/orion run first"},
            priority=40,
        )
        second = enqueue_event(
            db_path=self.db_path,
            niche_id=self.niche_id,
            event={"text": "/orion run second"},
            dependency_ids=[first],
            priority=20,  # better priority but should still wait for dependency
        )
        c1 = claim_next_event(self.db_path, self.niche_id)
        self.assertIsNotNone(c1)
        self.assertEqual(c1["id"], first)

        # second should stay blocked until first is done
        c2 = claim_next_event(self.db_path, self.niche_id)
        self.assertIsNone(c2)

        complete_event(self.db_path, first, {"ok": True})
        c3 = claim_next_event(self.db_path, self.niche_id)
        self.assertIsNotNone(c3)
        self.assertEqual(c3["id"], second)

    def test_failure_class_retry_policy(self):
        eid = enqueue_event(
            db_path=self.db_path,
            niche_id=self.niche_id,
            event={"text": "retry me"},
            max_attempts=3,
        )
        claimed = claim_next_event(self.db_path, self.niche_id)
        self.assertEqual(claimed["id"], eid)

        out = fail_event(self.db_path, eid, "AuthenticationError: invalid_api_key")
        self.assertEqual(out["failure_class"], "auth")
        self.assertEqual(out["status"], "failed")
        row = get_event(self.db_path, eid)
        self.assertEqual(row["status"], "failed")
        self.assertEqual(row["failure_class"], "auth")

        eid2 = enqueue_event(
            db_path=self.db_path,
            niche_id=self.niche_id,
            event={"text": "retry transient"},
            max_attempts=3,
        )
        claimed2 = claim_next_event(self.db_path, self.niche_id)
        self.assertEqual(claimed2["id"], eid2)
        out2 = fail_event(self.db_path, eid2, "connection timeout")
        self.assertEqual(out2["failure_class"], "transient")
        self.assertEqual(out2["status"], "pending")
        row2 = get_event(self.db_path, eid2)
        self.assertEqual(row2["status"], "pending")
        self.assertEqual(row2["failure_class"], "transient")

    def test_build_dependency_plan(self):
        plan = build_dependency_plan({"text": "/orion run task A and task B then task C", "source": "telegram"})
        self.assertGreaterEqual(len(plan), 3)
        self.assertTrue(all(str(item.get("text", "")).startswith("/orion run ") for item in plan))

    def test_digest_persisted_on_complete(self):
        eid = enqueue_event(
            db_path=self.db_path,
            niche_id=self.niche_id,
            event={"text": "/orion run digest smoke"},
        )
        result = {
            "ok": True,
            "execution_id": "exec-123",
            "tick": {
                "decision": {"action": "run_goal"},
                "result": {
                    "status": "completed",
                    "final_status": "completed",
                    "action": "run_goal",
                    "run_id": "run-abc",
                    "one_line_summary": "Run completed successfully.",
                    "next_action": "review_output",
                    "risk_flags": [],
                },
            },
        }
        complete_event(self.db_path, eid, result)
        digest = get_event_digest(self.db_path, eid)
        self.assertIsNotNone(digest)
        self.assertEqual(digest["run_id"], "run-abc")
        self.assertEqual(digest["final_status"], "completed")
        self.assertEqual(digest["one_line_summary"], "Run completed successfully.")
        self.assertEqual(digest["next_action"], "review_output")
        row = get_event(self.db_path, eid)
        self.assertIsNotNone(row)
        self.assertIn("digest", row)
        self.assertEqual(row["digest"]["run_id"], "run-abc")

    def test_digest_persisted_on_terminal_failure(self):
        eid = enqueue_event(
            db_path=self.db_path,
            niche_id=self.niche_id,
            event={"text": "/orion run failing task"},
        )
        claimed = claim_next_event(self.db_path, self.niche_id)
        self.assertEqual(claimed["id"], eid)
        fail_event(self.db_path, eid, "AuthenticationError: invalid_api_key")
        digest = get_event_digest(self.db_path, eid)
        self.assertIsNotNone(digest)
        self.assertEqual(digest["final_status"], "failed")
        self.assertEqual(digest["next_action"], "fix_auth")
        self.assertIn("auth", digest["risk_flags"])
        recent = list_event_digests(self.db_path, self.niche_id, limit=5)
        self.assertGreaterEqual(len(recent), 1)

    def test_approve_waiting_event_requeues(self):
        event_id = enqueue_event(
            db_path=self.db_path,
            niche_id=self.niche_id,
            event={"text": "/orion exec git diff"},
        )
        waiting_result = {
            "ok": True,
            "execution_id": "exec-approve",
            "tick": {
                "result": {
                    "status": "waiting_for_input",
                    "final_status": "waiting_for_input",
                    "action": "operator_exec",
                    "command": "git diff",
                    "risk_level": "medium",
                    "one_line_summary": "Approval required.",
                    "next_action": "resolve_approval",
                    "risk_flags": ["approval_required", "risk_medium"],
                }
            },
        }
        complete_event(self.db_path, event_id, waiting_result)
        out = resolve_event_approval(self.db_path, event_id, approved=True, note="approved for retry")
        self.assertTrue(out["ok"])
        self.assertEqual(out["status"], "pending")
        row = get_event(self.db_path, event_id)
        self.assertIsNotNone(row)
        self.assertEqual(row["status"], "pending")
        self.assertIsNone(row["result_json"])
        self.assertTrue(row["event_json"]["metadata"]["approval_granted"])

    def test_reject_waiting_event_marks_failed(self):
        event_id = enqueue_event(
            db_path=self.db_path,
            niche_id=self.niche_id,
            event={"text": "/orion exec git diff"},
        )
        waiting_result = {
            "ok": True,
            "execution_id": "exec-reject",
            "tick": {
                "result": {
                    "status": "waiting_for_input",
                    "final_status": "waiting_for_input",
                    "action": "operator_exec",
                    "command": "git diff",
                    "risk_level": "medium",
                    "one_line_summary": "Approval required.",
                    "next_action": "resolve_approval",
                    "risk_flags": ["approval_required", "risk_medium"],
                }
            },
        }
        complete_event(self.db_path, event_id, waiting_result)
        out = resolve_event_approval(self.db_path, event_id, approved=False, note="not allowed")
        self.assertTrue(out["ok"])
        self.assertEqual(out["status"], "failed")
        row = get_event(self.db_path, event_id)
        self.assertIsNotNone(row)
        self.assertEqual(row["status"], "failed")
        digest = get_event_digest(self.db_path, event_id)
        self.assertIsNotNone(digest)
        self.assertEqual(digest["final_status"], "failed")
        self.assertEqual(digest["next_action"], "revise_command")
        self.assertIn("approval_rejected", digest["risk_flags"])

    def test_skill_candidates_learn_and_promote_operator_exec(self):
        def _done_result(execution_id: str) -> dict:
            return {
                "ok": True,
                "execution_id": execution_id,
                "tick": {
                    "decision": {"action": "operator_exec"},
                    "reflection": {"lesson": "pwd succeeded", "confidence": 0.93},
                    "result": {
                        "status": "done",
                        "final_status": "done",
                        "action": "operator_exec",
                        "command": "pwd",
                        "one_line_summary": "/tmp/workspace",
                        "risk_flags": [],
                    },
                },
            }

        for idx in range(1, 4):
            event_id = enqueue_event(
                db_path=self.db_path,
                niche_id=self.niche_id,
                event={"text": "/orion exec pwd"},
            )
            complete_event(self.db_path, event_id, _done_result(f"exec-skill-{idx}"))

        skills = list_skill_candidates(
            db_path=self.db_path,
            niche_id=self.niche_id,
            action="operator_exec",
            limit=10,
        )
        self.assertGreaterEqual(len(skills), 1)
        first = skills[0]
        self.assertEqual(str(first.get("action") or ""), "operator_exec")
        self.assertIn("pwd", str(first.get("signature") or ""))
        self.assertEqual(int(first.get("total_count") or 0), 3)
        self.assertEqual(int(first.get("success_count") or 0), 3)
        self.assertEqual(int(first.get("fail_count") or 0), 0)
        self.assertTrue(bool(first.get("promoted")))
        self.assertGreater(float(first.get("success_rate") or 0.0), 0.9)

        promoted_only = list_skill_candidates(
            db_path=self.db_path,
            niche_id=self.niche_id,
            promoted_only=True,
            limit=10,
        )
        self.assertGreaterEqual(len(promoted_only), 1)
        self.assertEqual(str(promoted_only[0].get("signature") or ""), str(first.get("signature") or ""))

    def test_skill_candidates_track_objective_verification_failures(self):
        created = create_objective(
            db_path=self.db_path,
            niche_id=self.niche_id,
            title="Skill fail objective",
            goal_text="status",
            priority=45,
            cadence_seconds=0,
            constraints_json='{"require_action":"run_goal","require_run_id":true}',
        )
        objective_id = str(created["id"])
        tick = ingest_due_objectives(
            db_path=self.db_path,
            niche_id=self.niche_id,
            max_dispatch=1,
        )
        self.assertEqual(tick["dispatched_count"], 1)
        event_id = str(tick["dispatched_event_ids"][0])

        result = {
            "ok": True,
            "execution_id": "exec-skill-fail",
            "tick": {
                "decision": {"action": "run_goal"},
                "reflection": {"lesson": "missing run id", "confidence": 0.42},
                "result": {
                    "status": "planned",
                    "final_status": "planned",
                    "action": "run_goal",
                    "goal": "status",
                    "risk_flags": [],
                },
            },
        }
        complete_event(self.db_path, event_id, result)

        skills = list_skill_candidates(
            db_path=self.db_path,
            niche_id=self.niche_id,
            action="run_goal",
            objective_id=objective_id,
            limit=10,
        )
        self.assertEqual(len(skills), 1)
        first = skills[0]
        self.assertEqual(str(first.get("objective_id") or ""), objective_id)
        self.assertEqual(int(first.get("total_count") or 0), 1)
        self.assertEqual(int(first.get("success_count") or 0), 0)
        self.assertEqual(int(first.get("fail_count") or 0), 1)
        self.assertFalse(bool(first.get("promoted")))
        self.assertLess(float(first.get("success_rate") or 0.0), 0.1)

    def test_skill_replay_applies_promoted_candidate_with_confidence_gate(self):
        def _done_result(execution_id: str) -> dict:
            return {
                "ok": True,
                "execution_id": execution_id,
                "tick": {
                    "decision": {"action": "operator_exec"},
                    "reflection": {"lesson": "pwd worked", "confidence": 0.94},
                    "result": {
                        "status": "done",
                        "final_status": "done",
                        "action": "operator_exec",
                        "command": "pwd",
                        "one_line_summary": "pwd ok",
                        "risk_flags": [],
                    },
                },
            }

        for idx in range(1, 4):
            event_id = enqueue_event(
                db_path=self.db_path,
                niche_id=self.niche_id,
                event={"text": "/orion exec pwd"},
            )
            complete_event(self.db_path, event_id, _done_result(f"exec-replay-{idx}"))

        payload = {"text": "pwd", "source": "api", "metadata": {}}
        replay = maybe_apply_skill_replay(
            db_path=self.db_path,
            niche_id=self.niche_id,
            payload=payload,
            limit=20,
        )
        self.assertTrue(bool(replay.get("applied")))
        self.assertEqual(str(payload.get("text") or ""), "/orion exec pwd")
        meta = payload.get("metadata") if isinstance(payload.get("metadata"), dict) else {}
        replay_meta = meta.get("skill_replay") if isinstance(meta.get("skill_replay"), dict) else {}
        self.assertEqual(str(replay_meta.get("reason") or ""), "replay_applied")
        self.assertGreater(float(replay_meta.get("confidence") or 0.0), 0.7)

    def test_skill_decay_demotes_stale_promoted_candidates(self):
        def _done_result(execution_id: str) -> dict:
            return {
                "ok": True,
                "execution_id": execution_id,
                "tick": {
                    "decision": {"action": "operator_exec"},
                    "reflection": {"lesson": "pwd worked", "confidence": 0.93},
                    "result": {
                        "status": "done",
                        "final_status": "done",
                        "action": "operator_exec",
                        "command": "pwd",
                        "one_line_summary": "pwd ok",
                        "risk_flags": [],
                    },
                },
            }

        for idx in range(1, 4):
            event_id = enqueue_event(
                db_path=self.db_path,
                niche_id=self.niche_id,
                event={"text": "/orion exec pwd"},
            )
            complete_event(self.db_path, event_id, _done_result(f"exec-decay-{idx}"))

        skills_before = list_skill_candidates(
            db_path=self.db_path,
            niche_id=self.niche_id,
            action="operator_exec",
            limit=5,
        )
        self.assertEqual(len(skills_before), 1)
        self.assertTrue(bool(skills_before[0].get("promoted")))
        skill_id = str(skills_before[0].get("id") or "")
        self.assertTrue(bool(skill_id))

        import sqlite3

        stale_ts = time.time() - 10_000
        conn = sqlite3.connect(self.db_path)
        try:
            conn.execute(
                "UPDATE cognitive_skill_candidates SET updated_at=? WHERE id=?",
                (stale_ts, skill_id),
            )
            conn.commit()
        finally:
            conn.close()

        decay = decay_skill_candidates(
            db_path=self.db_path,
            niche_id=self.niche_id,
            max_age_seconds=3600,
            min_samples=2,
            min_success_rate=0.9,
            promoted_only=True,
        )
        self.assertTrue(bool(decay.get("ok")))
        self.assertGreaterEqual(int(decay.get("demoted_count") or 0), 1)

        skills_after = list_skill_candidates(
            db_path=self.db_path,
            niche_id=self.niche_id,
            action="operator_exec",
            limit=5,
        )
        self.assertEqual(len(skills_after), 1)
        self.assertFalse(bool(skills_after[0].get("promoted")))

    def test_record_objective_skill_replay_policy_updates_counters(self):
        created = create_objective(
            db_path=self.db_path,
            niche_id=self.niche_id,
            title="Replay policy objective",
            goal_text="status",
            priority=50,
            cadence_seconds=60,
        )
        objective_id = str(created["id"])

        first = _record_objective_skill_replay_policy(
            db_path=self.db_path,
            objective_id=objective_id,
            replay={
                "enabled": True,
                "applied": True,
                "reason": "replay_applied",
                "confidence": 0.88,
                "candidate_signature": "operator_exec:pwd",
                "candidate_action": "operator_exec",
                "match_score": 0.92,
                "model_score": 0.96,
                "text_before": "pwd",
                "text_after": "/orion exec pwd",
            },
        )
        self.assertTrue(bool(first.get("ok")))
        self.assertTrue(bool(first.get("updated")))

        second = _record_objective_skill_replay_policy(
            db_path=self.db_path,
            objective_id=objective_id,
            replay={
                "enabled": True,
                "applied": False,
                "reason": "below_threshold",
                "confidence": 0.41,
                "match_score": 0.80,
                "model_score": 0.52,
                "text_before": "random text",
                "text_after": "random text",
            },
        )
        self.assertTrue(bool(second.get("ok")))

        objective = get_objective(db_path=self.db_path, objective_id=objective_id)
        self.assertIsNotNone(objective)
        metadata = objective.get("metadata") if isinstance(objective.get("metadata"), dict) else {}
        policy = metadata.get("policy") if isinstance(metadata.get("policy"), dict) else {}
        self.assertEqual(int(policy.get("skill_replay_attempts") or 0), 2)
        self.assertEqual(int(policy.get("skill_replay_applied") or 0), 1)
        self.assertEqual(int(policy.get("skill_replay_fallbacks") or 0), 1)
        self.assertEqual(str(policy.get("skill_replay_last_reason") or ""), "below_threshold")
        self.assertEqual(str(policy.get("skill_replay_last_signature") or ""), "operator_exec:pwd")
        self.assertEqual(str(policy.get("skill_replay_last_action") or ""), "operator_exec")

    def test_objective_lifecycle_pause_resume_complete(self):
        created = create_objective(
            db_path=self.db_path,
            niche_id=self.niche_id,
            title="Daily status",
            goal_text="summarize current workspace state",
            priority=55,
            cadence_seconds=3600,
        )
        oid = str(created["id"])
        self.assertEqual(created["status"], "active")
        items = list_objectives(db_path=self.db_path, niche_id=self.niche_id, status="active", limit=10)
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["id"], oid)

        paused = update_objective(
            db_path=self.db_path,
            objective_id=oid,
            status="paused",
        )
        self.assertEqual(paused["status"], "paused")

        resumed = update_objective(
            db_path=self.db_path,
            objective_id=oid,
            status="active",
        )
        self.assertEqual(resumed["status"], "active")

        done = update_objective(
            db_path=self.db_path,
            objective_id=oid,
            status="completed",
        )
        self.assertEqual(done["status"], "completed")
        self.assertIsNotNone(done["completed_at"])

    def test_objective_tick_dispatches_event(self):
        created = create_objective(
            db_path=self.db_path,
            niche_id=self.niche_id,
            title="One-shot cleanup",
            goal_text="clean stale temp files",
            priority=40,
            cadence_seconds=0,
        )
        out = ingest_due_objectives(
            db_path=self.db_path,
            niche_id=self.niche_id,
            max_dispatch=2,
        )
        self.assertTrue(out["ok"])
        self.assertEqual(out["dispatched_count"], 1)
        event_id = out["dispatched_event_ids"][0]
        row = get_event(self.db_path, event_id)
        self.assertIsNotNone(row)
        event_json = row["event_json"]
        self.assertTrue(str(event_json.get("text") or "").startswith("/orion run "))
        metadata = event_json.get("metadata") if isinstance(event_json.get("metadata"), dict) else {}
        self.assertEqual(str(metadata.get("objective_id") or ""), str(created["id"]))

        # A second tick should not dispatch again while the first event is still in-flight.
        out2 = ingest_due_objectives(
            db_path=self.db_path,
            niche_id=self.niche_id,
            max_dispatch=2,
        )
        self.assertEqual(out2["dispatched_count"], 0)

    def test_objective_status_goal_normalizes_to_status_command(self):
        created = create_objective(
            db_path=self.db_path,
            niche_id=self.niche_id,
            title="Status objective",
            goal_text="status",
            priority=55,
            cadence_seconds=60,
            next_run_at=time.time() - 1,
        )
        out = ingest_due_objectives(
            db_path=self.db_path,
            niche_id=self.niche_id,
            max_dispatch=1,
        )
        self.assertEqual(out["dispatched_count"], 1)
        event_id = str(out["dispatched_event_ids"][0])
        row = get_event(self.db_path, event_id)
        self.assertIsNotNone(row)
        self.assertEqual(str(row["parent_event_id"]), str(created["id"]))
        event_json = row["event_json"]
        self.assertEqual(str(event_json.get("text") or ""), "/orion status")
        metadata = event_json.get("metadata") if isinstance(event_json.get("metadata"), dict) else {}
        self.assertEqual(str(metadata.get("execution_target") or ""), "local_companion")
        self.assertEqual(str(metadata.get("trust_mode") or ""), "guarded")
        self.assertEqual(list(metadata.get("operator_approval_levels") or []), ["high"])
        self.assertEqual(str(metadata.get("operator_safety_profile") or ""), "default")
        dispatch = metadata.get("objective_dispatch") if isinstance(metadata.get("objective_dispatch"), dict) else {}
        self.assertEqual(str(dispatch.get("reason") or ""), "status_low_risk")
        self.assertIn("status_route_local_companion", list(dispatch.get("flags") or []))
        self.assertIn("status_trust_guarded", list(dispatch.get("flags") or []))
        self.assertEqual(list(dispatch.get("operator_approval_levels") or []), ["high"])
        objective = get_objective(db_path=self.db_path, objective_id=str(created["id"]))
        self.assertIsNotNone(objective)
        policy = objective["metadata"].get("policy") if isinstance(objective.get("metadata"), dict) else {}
        self.assertEqual(str(policy.get("last_dispatch_operator_safety_profile") or ""), "default")
        self.assertEqual(list(policy.get("last_dispatch_operator_approval_levels") or []), ["high"])

    def test_objective_orion_run_status_normalizes_to_status_command(self):
        create_objective(
            db_path=self.db_path,
            niche_id=self.niche_id,
            title="Status objective explicit",
            goal_text="/orion run status",
            priority=55,
            cadence_seconds=60,
            next_run_at=time.time() - 1,
        )
        out = ingest_due_objectives(
            db_path=self.db_path,
            niche_id=self.niche_id,
            max_dispatch=1,
        )
        self.assertEqual(out["dispatched_count"], 1)
        event_id = str(out["dispatched_event_ids"][0])
        row = get_event(self.db_path, event_id)
        self.assertIsNotNone(row)
        event_json = row["event_json"]
        self.assertEqual(str(event_json.get("text") or ""), "/orion status")

    def test_status_objective_dispatch_respects_explicit_target_and_trust(self):
        created = create_objective(
            db_path=self.db_path,
            niche_id=self.niche_id,
            title="Status objective explicit route",
            goal_text="status",
            priority=55,
            cadence_seconds=60,
            next_run_at=time.time() - 1,
            constraints_json=json.dumps(
                {
                    "execution_target": "cloud",
                    "trust_mode": "strict",
                }
            ),
        )
        out = ingest_due_objectives(
            db_path=self.db_path,
            niche_id=self.niche_id,
            max_dispatch=1,
        )
        self.assertEqual(out["dispatched_count"], 1)
        event_id = str(out["dispatched_event_ids"][0])
        row = get_event(self.db_path, event_id)
        self.assertIsNotNone(row)
        event_json = row["event_json"]
        metadata = event_json.get("metadata") if isinstance(event_json.get("metadata"), dict) else {}
        self.assertEqual(str(metadata.get("execution_target") or ""), "cloud")
        self.assertEqual(str(metadata.get("trust_mode") or ""), "strict")
        self.assertEqual(list(metadata.get("operator_approval_levels") or []), ["medium", "high"])
        dispatch = metadata.get("objective_dispatch") if isinstance(metadata.get("objective_dispatch"), dict) else {}
        self.assertEqual(str(dispatch.get("execution_target") or ""), "cloud")
        self.assertEqual(str(dispatch.get("trust_mode") or ""), "strict")
        self.assertEqual(list(dispatch.get("operator_approval_levels") or []), ["medium", "high"])
        objective = get_objective(db_path=self.db_path, objective_id=str(created["id"]))
        self.assertIsNotNone(objective)
        policy = objective["metadata"].get("policy") if isinstance(objective.get("metadata"), dict) else {}
        self.assertEqual(str(policy.get("last_dispatch_operator_safety_profile") or ""), "default")
        self.assertEqual(list(policy.get("last_dispatch_operator_approval_levels") or []), ["medium", "high"])

    def test_status_objective_dispatch_supports_explicit_operator_approval_levels(self):
        created = create_objective(
            db_path=self.db_path,
            niche_id=self.niche_id,
            title="Status objective explicit operator levels",
            goal_text="status",
            priority=55,
            cadence_seconds=60,
            next_run_at=time.time() - 1,
            constraints_json=json.dumps(
                {
                    "execution_target": "cloud",
                    "trust_mode": "auto",
                    "operator_approval_levels": ["low", "high"],
                    "operator_safety_profile": "all",
                }
            ),
        )
        out = ingest_due_objectives(
            db_path=self.db_path,
            niche_id=self.niche_id,
            max_dispatch=1,
        )
        self.assertEqual(out["dispatched_count"], 1)
        event_id = str(out["dispatched_event_ids"][0])
        row = get_event(self.db_path, event_id)
        self.assertIsNotNone(row)
        event_json = row["event_json"]
        metadata = event_json.get("metadata") if isinstance(event_json.get("metadata"), dict) else {}
        self.assertEqual(str(metadata.get("trust_mode") or ""), "auto")
        self.assertEqual(list(metadata.get("operator_approval_levels") or []), ["low", "high"])
        self.assertEqual(str(metadata.get("operator_safety_profile") or ""), "all")
        dispatch = metadata.get("objective_dispatch") if isinstance(metadata.get("objective_dispatch"), dict) else {}
        self.assertEqual(list(dispatch.get("operator_approval_levels") or []), ["low", "high"])
        objective = get_objective(db_path=self.db_path, objective_id=str(created["id"]))
        self.assertIsNotNone(objective)
        policy = objective["metadata"].get("policy") if isinstance(objective.get("metadata"), dict) else {}
        self.assertEqual(str(policy.get("last_dispatch_operator_safety_profile") or ""), "all")
        self.assertEqual(list(policy.get("last_dispatch_operator_approval_levels") or []), ["low", "high"])

    def test_update_objective_resume_clears_open_escalation(self):
        created = create_objective(
            db_path=self.db_path,
            niche_id=self.niche_id,
            title="Escalated objective",
            goal_text="status",
            priority=65,
            cadence_seconds=60,
            metadata_json=json.dumps({"policy": {"escalation_state": "open"}}),
        )
        objective_id = str(created["id"])
        paused = update_objective(
            db_path=self.db_path,
            objective_id=objective_id,
            status="paused",
        )
        self.assertEqual(str(paused["status"]), "paused")
        resumed = update_objective(
            db_path=self.db_path,
            objective_id=objective_id,
            status="active",
        )
        self.assertEqual(str(resumed["status"]), "active")
        policy = resumed["metadata"].get("policy") if isinstance(resumed.get("metadata"), dict) else {}
        self.assertEqual(str(policy.get("escalation_state") or ""), "resolved")
        self.assertEqual(str(policy.get("escalation_resolution") or ""), "manual_resume")
        self.assertIsNone(policy.get("approval_hold_until"))

    def test_dispatch_objective_now_dispatches_specific_objective(self):
        created = create_objective(
            db_path=self.db_path,
            niche_id=self.niche_id,
            title="Dispatch objective",
            goal_text="status",
            priority=40,
            cadence_seconds=60,
            next_run_at=time.time() + 500,
        )
        objective_id = str(created["id"])
        out = dispatch_objective_now(
            db_path=self.db_path,
            niche_id=self.niche_id,
            objective_id=objective_id,
            resume_if_paused=True,
        )
        self.assertTrue(bool(out.get("ok")))
        event_id = str(out.get("event_id") or "")
        self.assertTrue(bool(event_id))
        row = get_event(self.db_path, event_id)
        self.assertIsNotNone(row)
        self.assertEqual(str(row["parent_event_id"]), objective_id)
        self.assertEqual(str(row["event_json"].get("text") or ""), "/orion status")
        objective = get_objective(db_path=self.db_path, objective_id=objective_id)
        self.assertIsNotNone(objective)
        policy = objective["metadata"].get("policy") if isinstance(objective.get("metadata"), dict) else {}
        self.assertEqual(str(policy.get("last_dispatch_operator_safety_profile") or ""), "default")
        self.assertEqual(list(policy.get("last_dispatch_operator_approval_levels") or []), ["high"])

    def test_objective_tail_includes_verification_and_reflection(self):
        created = create_objective(
            db_path=self.db_path,
            niche_id=self.niche_id,
            title="Run with strict contract",
            goal_text="prepare objective status report",
            priority=30,
            cadence_seconds=0,
            constraints_json='{"require_action":"run_goal","require_run_id":true}',
        )
        objective_id = str(created["id"])
        tick = ingest_due_objectives(
            db_path=self.db_path,
            niche_id=self.niche_id,
            max_dispatch=1,
        )
        self.assertEqual(tick["dispatched_count"], 1)
        event_id = str(tick["dispatched_event_ids"][0])

        # Missing run_id should fail the objective verifier contract.
        result = {
            "ok": True,
            "execution_id": "exec-objective-tail",
            "tick": {
                "decision": {"action": "run_goal"},
                "execution": {"duration_ms": 120},
                "reflection": {"lesson": "Ran objective once.", "confidence": 0.78},
                "result": {
                    "status": "planned",
                    "final_status": "planned",
                    "action": "run_goal",
                    "risk_flags": [],
                },
            },
        }
        complete_event(self.db_path, event_id, result)

        tail = tail_objective(db_path=self.db_path, objective_id=objective_id, limit=5)
        self.assertTrue(tail["ok"])
        self.assertEqual(str(tail["objective"]["id"]), objective_id)
        self.assertEqual(tail["count_events"], 1)
        self.assertEqual(tail["count_reflections"], 1)

        event_entry = tail["events"][0]
        self.assertEqual(str(event_entry["id"]), event_id)
        obj_verify = event_entry["result"].get("tick", {}).get("objective_verification", {})
        self.assertFalse(bool(obj_verify.get("passed")))
        self.assertGreaterEqual(int(obj_verify.get("constraint_count") or 0), 2)

        reflection = tail["reflections"][0]
        self.assertEqual(str(reflection["event_id"]), event_id)
        self.assertFalse(bool(reflection["passed"]))
        self.assertIn("run_id_present", [c.get("key") for c in reflection["verification"].get("checks", [])])

    def test_list_recent_objective_reflections_supports_niche_and_objective_filter(self):
        first = create_objective(
            db_path=self.db_path,
            niche_id=self.niche_id,
            title="Objective one",
            goal_text="status",
            priority=30,
            cadence_seconds=0,
        )
        second = create_objective(
            db_path=self.db_path,
            niche_id=self.niche_id,
            title="Objective two",
            goal_text="status",
            priority=30,
            cadence_seconds=0,
        )

        tick_first = ingest_due_objectives(
            db_path=self.db_path,
            niche_id=self.niche_id,
            max_dispatch=1,
        )
        event_one = str(tick_first["dispatched_event_ids"][0])
        complete_event(
            self.db_path,
            event_one,
            {
                "ok": True,
                "execution_id": "exec-reflect-one",
                "tick": {
                    "decision": {"action": "run_goal"},
                    "reflection": {"lesson": "First reflection lesson.", "confidence": 0.66},
                    "result": {"status": "planned", "final_status": "planned", "action": "run_goal"},
                },
            },
        )

        update_objective(db_path=self.db_path, objective_id=str(first["id"]), status="completed")

        tick_second = ingest_due_objectives(
            db_path=self.db_path,
            niche_id=self.niche_id,
            max_dispatch=1,
        )
        event_two = str(tick_second["dispatched_event_ids"][0])
        complete_event(
            self.db_path,
            event_two,
            {
                "ok": True,
                "execution_id": "exec-reflect-two",
                "tick": {
                    "decision": {"action": "run_goal"},
                    "reflection": {"lesson": "Second reflection lesson.", "confidence": 0.84},
                    "result": {"status": "planned", "final_status": "planned", "action": "run_goal"},
                },
            },
        )

        all_items = list_recent_objective_reflections(
            db_path=self.db_path,
            niche_id=self.niche_id,
            limit=10,
        )
        self.assertGreaterEqual(len(all_items), 2)
        self.assertTrue(any(str(item.get("objective_id")) == str(first["id"]) for item in all_items))
        self.assertTrue(any(str(item.get("objective_id")) == str(second["id"]) for item in all_items))

        second_only = list_recent_objective_reflections(
            db_path=self.db_path,
            niche_id=self.niche_id,
            objective_id=str(second["id"]),
            limit=10,
        )
        self.assertEqual(len(second_only), 1)
        self.assertEqual(str(second_only[0].get("objective_id")), str(second["id"]))
        self.assertIn("Second reflection lesson", str(second_only[0].get("lesson") or ""))

    def test_objective_priority_aging_promotes_overdue_work(self):
        now = time.time()
        older = create_objective(
            db_path=self.db_path,
            niche_id=self.niche_id,
            title="Older objective",
            goal_text="run older objective",
            priority=80,
            cadence_seconds=60,
            next_run_at=now - 3600,
            constraints_json='{"aging_window_seconds":60,"aging_max_boost":50}',
        )
        newer = create_objective(
            db_path=self.db_path,
            niche_id=self.niche_id,
            title="Newer objective",
            goal_text="run newer objective",
            priority=60,
            cadence_seconds=60,
            next_run_at=now - 10,
            constraints_json='{"aging_window_seconds":60,"aging_max_boost":50}',
        )

        out = ingest_due_objectives(
            db_path=self.db_path,
            niche_id=self.niche_id,
            max_dispatch=1,
        )
        self.assertEqual(out["dispatched_count"], 1)
        dispatched = get_event(self.db_path, out["dispatched_event_ids"][0])
        self.assertIsNotNone(dispatched)
        self.assertEqual(str(dispatched["parent_event_id"]), str(older["id"]))
        self.assertLessEqual(int(dispatched["priority"]), 60)
        metadata = dispatched["event_json"].get("metadata") if isinstance(dispatched["event_json"], dict) else {}
        policy = metadata.get("objective_policy") if isinstance(metadata, dict) and isinstance(metadata.get("objective_policy"), dict) else {}
        self.assertGreaterEqual(int(policy.get("aging_boost") or 0), 1)
        self.assertEqual(str(newer["status"]), "active")

    def test_objective_sla_dispatch_prefers_local_companion(self):
        now = time.time()
        created = create_objective(
            db_path=self.db_path,
            niche_id=self.niche_id,
            title="Tight SLA objective",
            goal_text="run tight sla check",
            priority=65,
            cadence_seconds=60,
            next_run_at=now - 2,
            constraints_json='{"sla_seconds":900}',
        )
        out = ingest_due_objectives(
            db_path=self.db_path,
            niche_id=self.niche_id,
            max_dispatch=1,
        )
        self.assertEqual(out["dispatched_count"], 1)
        event_id = str(out["dispatched_event_ids"][0])
        row = get_event(self.db_path, event_id)
        self.assertIsNotNone(row)
        self.assertEqual(str(row["parent_event_id"]), str(created["id"]))
        metadata = row["event_json"].get("metadata") if isinstance(row["event_json"], dict) else {}
        self.assertEqual(str(metadata.get("execution_target") or ""), "local_companion")
        dispatch_meta = metadata.get("objective_dispatch") if isinstance(metadata.get("objective_dispatch"), dict) else {}
        self.assertEqual(str(dispatch_meta.get("execution_target") or ""), "local_companion")
        self.assertEqual(str(dispatch_meta.get("reason") or ""), "sla_tight")
        self.assertIn("sla_route_local_companion", list(dispatch_meta.get("flags") or []))

    def test_objective_deadline_policy_can_pause_before_dispatch(self):
        now = time.time()
        created = create_objective(
            db_path=self.db_path,
            niche_id=self.niche_id,
            title="Deadline objective",
            goal_text="do deadline work",
            priority=70,
            cadence_seconds=60,
            next_run_at=now - 5,
            constraints_json=json.dumps(
                {
                    "deadline_at": now - 1,
                    "pause_on_deadline_miss": True,
                }
            ),
        )
        out = ingest_due_objectives(
            db_path=self.db_path,
            niche_id=self.niche_id,
            max_dispatch=2,
        )
        self.assertEqual(out["dispatched_count"], 0)
        self.assertEqual(int(out.get("skipped_deadline_paused") or 0), 1)
        obj = get_objective(db_path=self.db_path, objective_id=str(created["id"]))
        self.assertIsNotNone(obj)
        self.assertEqual(str(obj["status"]), "paused")
        policy = obj["metadata"].get("policy") if isinstance(obj.get("metadata"), dict) else {}
        self.assertGreaterEqual(int(policy.get("deadline_missed_count") or 0), 1)

    def test_objective_fail_streak_escalates_and_pauses(self):
        created = create_objective(
            db_path=self.db_path,
            niche_id=self.niche_id,
            title="Escalation objective",
            goal_text="run escalation checks",
            priority=50,
            cadence_seconds=60,
            constraints_json='{"require_action":"run_goal","require_run_id":true,"max_fail_streak":2}',
        )
        objective_id = str(created["id"])

        tick1 = ingest_due_objectives(
            db_path=self.db_path,
            niche_id=self.niche_id,
            max_dispatch=1,
        )
        self.assertEqual(tick1["dispatched_count"], 1)
        event1 = str(tick1["dispatched_event_ids"][0])

        failed_result = {
            "ok": True,
            "execution_id": "exec-streak-1",
            "tick": {
                "decision": {"action": "run_goal"},
                "execution": {"duration_ms": 90},
                "reflection": {"lesson": "no run id", "confidence": 0.6},
                "result": {
                    "status": "planned",
                    "final_status": "planned",
                    "action": "run_goal",
                    "risk_flags": [],
                },
            },
        }
        complete_event(self.db_path, event1, failed_result)
        obj_after_first = get_objective(db_path=self.db_path, objective_id=objective_id)
        self.assertIsNotNone(obj_after_first)
        self.assertEqual(str(obj_after_first["status"]), "active")
        policy_first = obj_after_first["metadata"].get("policy") if isinstance(obj_after_first.get("metadata"), dict) else {}
        self.assertEqual(int(policy_first.get("verification_fail_streak") or 0), 1)

        update_objective(
            db_path=self.db_path,
            objective_id=objective_id,
            next_run_at=time.time() - 1,
            status="active",
        )
        tick2 = ingest_due_objectives(
            db_path=self.db_path,
            niche_id=self.niche_id,
            max_dispatch=1,
        )
        self.assertEqual(tick2["dispatched_count"], 1)
        event2 = str(tick2["dispatched_event_ids"][0])
        complete_event(self.db_path, event2, failed_result)

        obj_after_second = get_objective(db_path=self.db_path, objective_id=objective_id)
        self.assertIsNotNone(obj_after_second)
        self.assertEqual(str(obj_after_second["status"]), "paused")
        policy_second = obj_after_second["metadata"].get("policy") if isinstance(obj_after_second.get("metadata"), dict) else {}
        self.assertEqual(str(policy_second.get("escalation_state") or ""), "open")
        self.assertGreaterEqual(int(policy_second.get("verification_fail_streak") or 0), 2)

        second_event = get_event(self.db_path, event2)
        self.assertIsNotNone(second_event)
        self.assertEqual(str(second_event["status"]), "waiting_for_input")
        verification = second_event["result_json"].get("tick", {}).get("objective_verification", {})
        self.assertTrue(bool(verification.get("escalated")))
        approvals = list_pending_approvals(self.db_path, self.niche_id, limit=10)
        self.assertGreaterEqual(len(approvals), 1)
        self.assertEqual(str(approvals[0]["event_id"]), event2)
        self.assertEqual(str(approvals[0]["objective_id"]), objective_id)

        approved = resolve_event_approval(self.db_path, event2, approved=True, note="resume objective")
        self.assertTrue(approved["ok"])
        self.assertEqual(str(approved["status"]), "pending")
        resumed_event = get_event(self.db_path, event2)
        self.assertIsNotNone(resumed_event)
        self.assertEqual(str(resumed_event["status"]), "pending")
        obj_after_approval = get_objective(db_path=self.db_path, objective_id=objective_id)
        self.assertIsNotNone(obj_after_approval)
        self.assertEqual(str(obj_after_approval["status"]), "active")
        policy_after_approval = obj_after_approval["metadata"].get("policy") if isinstance(obj_after_approval.get("metadata"), dict) else {}
        self.assertEqual(str(policy_after_approval.get("escalation_state") or ""), "resolved")

    def test_objective_auto_remediation_defers_escalation_and_slows_cadence(self):
        created = create_objective(
            db_path=self.db_path,
            niche_id=self.niche_id,
            title="Auto remediation objective",
            goal_text="run remediation checks",
            priority=50,
            cadence_seconds=60,
            constraints_json=json.dumps(
                {
                    "require_action": "run_goal",
                    "require_run_id": True,
                    "max_fail_streak": 3,
                    "pause_on_escalation": True,
                    "auto_remediation_enabled": True,
                    "auto_remediation_min_fail_streak": 2,
                    "auto_remediation_min_reflections": 2,
                    "auto_remediation_retry_window_seconds": 120,
                    "auto_remediation_slowdown_factor": 2.0,
                    "auto_remediation_conf_drop_threshold": 0.05,
                    "auto_remediation_pass_rate_max": 1.0,
                }
            ),
        )
        objective_id = str(created["id"])

        def _failed_result(execution_id: str, confidence: float) -> dict:
            return {
                "ok": True,
                "execution_id": execution_id,
                "tick": {
                    "decision": {"action": "run_goal"},
                    "execution": {"duration_ms": 80},
                    "reflection": {"lesson": "missing run id", "confidence": confidence},
                    "result": {
                        "status": "planned",
                        "final_status": "planned",
                        "action": "run_goal",
                        "risk_flags": [],
                    },
                },
            }

        def _passed_result(execution_id: str, run_id: str) -> dict:
            return {
                "ok": True,
                "execution_id": execution_id,
                "tick": {
                    "decision": {"action": "run_goal"},
                    "execution": {"duration_ms": 70},
                    "reflection": {"lesson": "run completed", "confidence": 0.92},
                    "result": {
                        "status": "done",
                        "final_status": "done",
                        "action": "run_goal",
                        "run_id": run_id,
                        "risk_flags": [],
                    },
                },
            }

        tick1 = ingest_due_objectives(
            db_path=self.db_path,
            niche_id=self.niche_id,
            max_dispatch=1,
        )
        self.assertEqual(tick1["dispatched_count"], 1)
        event1 = str(tick1["dispatched_event_ids"][0])
        complete_event(self.db_path, event1, _failed_result("exec-remed-1", 0.95))
        update_objective(db_path=self.db_path, objective_id=objective_id, next_run_at=time.time() - 1)

        tick2 = ingest_due_objectives(
            db_path=self.db_path,
            niche_id=self.niche_id,
            max_dispatch=1,
        )
        self.assertEqual(tick2["dispatched_count"], 1)
        event2 = str(tick2["dispatched_event_ids"][0])
        complete_event(self.db_path, event2, _failed_result("exec-remed-2", 0.75))
        update_objective(db_path=self.db_path, objective_id=objective_id, next_run_at=time.time() - 1)

        tick3 = ingest_due_objectives(
            db_path=self.db_path,
            niche_id=self.niche_id,
            max_dispatch=1,
        )
        self.assertEqual(tick3["dispatched_count"], 1)
        event3 = str(tick3["dispatched_event_ids"][0])
        complete_event(self.db_path, event3, _failed_result("exec-remed-3", 0.20))

        objective = get_objective(db_path=self.db_path, objective_id=objective_id)
        self.assertIsNotNone(objective)
        self.assertEqual(str(objective["status"]), "active")
        self.assertGreaterEqual(float(objective.get("cadence_seconds") or 0.0), 120.0)
        policy = objective["metadata"].get("policy") if isinstance(objective.get("metadata"), dict) else {}
        self.assertEqual(str(policy.get("escalation_state") or ""), "deferred")
        self.assertEqual(str(policy.get("remediation_state") or ""), "active")
        self.assertEqual(str(policy.get("dispatch_override_target") or ""), "local_companion")
        self.assertEqual(str(policy.get("dispatch_override_trust") or ""), "guarded")
        self.assertEqual(int(policy.get("verification_fail_streak") or 0), 3)
        self.assertEqual(str(policy.get("trend_direction") or ""), "down")

        row3 = get_event(self.db_path, event3)
        self.assertIsNotNone(row3)
        self.assertEqual(str(row3["status"]), "done")
        verification = row3["result_json"].get("tick", {}).get("objective_verification", {})
        self.assertTrue(bool(verification.get("remediation_applied")))
        self.assertFalse(bool(verification.get("escalated")))
        digest3 = get_event_digest(self.db_path, event3)
        self.assertIsNotNone(digest3)
        self.assertIn("auto_remediation", list(digest3.get("risk_flags") or []))

        update_objective(db_path=self.db_path, objective_id=objective_id, next_run_at=time.time() - 1)
        hold_tick = ingest_due_objectives(
            db_path=self.db_path,
            niche_id=self.niche_id,
            max_dispatch=1,
        )
        self.assertEqual(hold_tick["dispatched_count"], 0)
        self.assertGreaterEqual(int(hold_tick.get("skipped_approval_hold") or 0), 1)

        refreshed = get_objective(db_path=self.db_path, objective_id=objective_id)
        self.assertIsNotNone(refreshed)
        refreshed_meta = refreshed.get("metadata") if isinstance(refreshed.get("metadata"), dict) else {}
        refreshed_policy = refreshed_meta.get("policy") if isinstance(refreshed_meta.get("policy"), dict) else {}
        refreshed_policy["escalation_state"] = "deferred"
        refreshed_policy["approval_hold_until"] = time.time() - 1
        refreshed_policy["approval_hold_reason"] = "auto_remediation_window"
        refreshed_meta["policy"] = refreshed_policy
        update_objective(
            db_path=self.db_path,
            objective_id=objective_id,
            next_run_at=time.time() - 1,
            metadata_json=json.dumps(refreshed_meta),
        )
        resume_tick = ingest_due_objectives(
            db_path=self.db_path,
            niche_id=self.niche_id,
            max_dispatch=1,
        )
        self.assertEqual(resume_tick["dispatched_count"], 1)
        event4 = str(resume_tick["dispatched_event_ids"][0])
        complete_event(self.db_path, event4, _passed_result("exec-remed-4", "run-remed-4"))

        objective_after_first_pass = get_objective(db_path=self.db_path, objective_id=objective_id)
        self.assertIsNotNone(objective_after_first_pass)
        policy_after_first_pass = (
            objective_after_first_pass["metadata"].get("policy")
            if isinstance(objective_after_first_pass.get("metadata"), dict)
            else {}
        )
        self.assertEqual(str(policy_after_first_pass.get("remediation_state") or ""), "recovering")
        self.assertEqual(int(policy_after_first_pass.get("remediation_pass_streak") or 0), 1)
        self.assertGreaterEqual(float(objective_after_first_pass.get("cadence_seconds") or 0.0), 120.0)

        update_objective(db_path=self.db_path, objective_id=objective_id, next_run_at=time.time() - 1)
        tick5 = ingest_due_objectives(
            db_path=self.db_path,
            niche_id=self.niche_id,
            max_dispatch=1,
        )
        self.assertEqual(tick5["dispatched_count"], 1)
        event5 = str(tick5["dispatched_event_ids"][0])
        complete_event(self.db_path, event5, _passed_result("exec-remed-5", "run-remed-5"))

        objective_after_second_pass = get_objective(db_path=self.db_path, objective_id=objective_id)
        self.assertIsNotNone(objective_after_second_pass)
        self.assertAlmostEqual(float(objective_after_second_pass.get("cadence_seconds") or 0.0), 60.0, places=3)
        policy_after_second_pass = (
            objective_after_second_pass["metadata"].get("policy")
            if isinstance(objective_after_second_pass.get("metadata"), dict)
            else {}
        )
        self.assertEqual(str(policy_after_second_pass.get("remediation_state") or ""), "resolved")
        self.assertGreaterEqual(int(policy_after_second_pass.get("remediation_pass_streak") or 0), 2)
        self.assertLessEqual(float(policy_after_second_pass.get("dispatch_override_until") or time.time()), time.time() + 0.1)

    def test_objective_policy_simulation_is_non_mutating(self):
        created = create_objective(
            db_path=self.db_path,
            niche_id=self.niche_id,
            title="Simulation objective",
            goal_text="run simulation checks",
            priority=60,
            cadence_seconds=60,
            constraints_json='{"require_action":"run_goal","require_run_id":true,"max_fail_streak":2,"pause_on_escalation":true}',
        )
        objective_id = str(created["id"])

        tick = ingest_due_objectives(
            db_path=self.db_path,
            niche_id=self.niche_id,
            max_dispatch=1,
        )
        self.assertEqual(tick["dispatched_count"], 1)
        event_id = str(tick["dispatched_event_ids"][0])
        complete_event(
            self.db_path,
            event_id,
            {
                "ok": True,
                "execution_id": "exec-sim-base",
                "tick": {
                    "decision": {"action": "run_goal"},
                    "execution": {"duration_ms": 90},
                    "reflection": {"lesson": "missing run id", "confidence": 0.7},
                    "result": {
                        "status": "planned",
                        "final_status": "planned",
                        "action": "run_goal",
                        "risk_flags": [],
                    },
                },
            },
        )

        baseline = get_objective(db_path=self.db_path, objective_id=objective_id)
        self.assertIsNotNone(baseline)
        baseline_policy = baseline["metadata"].get("policy") if isinstance(baseline.get("metadata"), dict) else {}
        self.assertEqual(int(baseline_policy.get("verification_fail_streak") or 0), 1)
        self.assertEqual(str(baseline.get("status") or ""), "active")

        simulated = simulate_objective_policy(
            db_path=self.db_path,
            niche_id=self.niche_id,
            objective_id=objective_id,
            action="run_goal",
            final_status="planned",
            status="planned",
            run_id="",
            confidence=0.6,
            duration_ms=120,
            summary="Simulated objective check.",
        )
        self.assertTrue(simulated.get("ok"))
        self.assertTrue(simulated.get("rolled_back"))
        verification = simulated.get("objective_verification") if isinstance(simulated.get("objective_verification"), dict) else {}
        self.assertFalse(bool(verification.get("passed")))
        policy_state = simulated.get("policy_state") if isinstance(simulated.get("policy_state"), dict) else {}
        self.assertTrue(bool(policy_state.get("escalated")))
        self.assertEqual(str(policy_state.get("status_after") or ""), "paused")

        after = get_objective(db_path=self.db_path, objective_id=objective_id)
        self.assertIsNotNone(after)
        after_policy = after["metadata"].get("policy") if isinstance(after.get("metadata"), dict) else {}
        self.assertEqual(str(after.get("status") or ""), "active")
        self.assertEqual(int(after_policy.get("verification_fail_streak") or 0), 1)

    def test_objective_autotune_preview_and_apply(self):
        created = create_objective(
            db_path=self.db_path,
            niche_id=self.niche_id,
            title="Autotune objective",
            goal_text="run autotune checks",
            priority=60,
            cadence_seconds=60,
            constraints_json=json.dumps(
                {
                    "require_action": "run_goal",
                    "require_run_id": True,
                    "max_fail_streak": 5,
                    "pause_on_escalation": False,
                    "auto_remediation_enabled": False,
                    "auto_remediation_min_fail_streak": 4,
                    "auto_remediation_slowdown_factor": 1.2,
                }
            ),
        )
        objective_id = str(created["id"])

        def _failed_result(execution_id: str, confidence: float) -> dict:
            return {
                "ok": True,
                "execution_id": execution_id,
                "tick": {
                    "decision": {"action": "run_goal"},
                    "execution": {"duration_ms": 90},
                    "reflection": {"lesson": "missing run id", "confidence": confidence},
                    "result": {
                        "status": "planned",
                        "final_status": "planned",
                        "action": "run_goal",
                        "risk_flags": [],
                    },
                },
            }

        confidences = [0.95, 0.8, 0.65, 0.4]
        for idx, confidence in enumerate(confidences, start=1):
            update_objective(db_path=self.db_path, objective_id=objective_id, next_run_at=time.time() - 1, status="active")
            tick = ingest_due_objectives(
                db_path=self.db_path,
                niche_id=self.niche_id,
                max_dispatch=1,
            )
            self.assertEqual(tick["dispatched_count"], 1)
            event_id = str(tick["dispatched_event_ids"][0])
            complete_event(self.db_path, event_id, _failed_result(f"exec-autotune-{idx}", confidence))

        before = get_objective(db_path=self.db_path, objective_id=objective_id)
        self.assertIsNotNone(before)
        before_constraints = before["constraints"] if isinstance(before.get("constraints"), dict) else {}
        self.assertFalse(bool(before_constraints.get("auto_remediation_enabled")))

        preview = autotune_objective(
            db_path=self.db_path,
            niche_id=self.niche_id,
            objective_id=objective_id,
            sample_size=10,
            min_samples=4,
            apply=False,
        )
        self.assertTrue(preview.get("ok"))
        self.assertFalse(bool(preview.get("applied")))
        self.assertGreater(len(preview.get("changes") or []), 0)
        self.assertIn("auto_remediation_enabled", list(preview.get("changed_keys") or []))
        current_after_preview = get_objective(db_path=self.db_path, objective_id=objective_id)
        self.assertIsNotNone(current_after_preview)
        self.assertFalse(bool((current_after_preview.get("constraints") or {}).get("auto_remediation_enabled")))

        applied = autotune_objective(
            db_path=self.db_path,
            niche_id=self.niche_id,
            objective_id=objective_id,
            sample_size=10,
            min_samples=4,
            apply=True,
        )
        self.assertTrue(applied.get("ok"))
        self.assertTrue(bool(applied.get("applied")))
        updated = get_objective(db_path=self.db_path, objective_id=objective_id)
        self.assertIsNotNone(updated)
        updated_constraints = updated["constraints"] if isinstance(updated.get("constraints"), dict) else {}
        self.assertTrue(bool(updated_constraints.get("auto_remediation_enabled")))
        self.assertTrue(bool(updated_constraints.get("pause_on_escalation")))
        self.assertLessEqual(int(updated_constraints.get("max_fail_streak") or 100), 2)

    def test_ingest_due_objectives_runs_autotune_when_enabled(self):
        created = create_objective(
            db_path=self.db_path,
            niche_id=self.niche_id,
            title="Autotune scheduler objective",
            goal_text="run scheduler autotune checks",
            priority=60,
            cadence_seconds=60,
            constraints_json=json.dumps(
                {
                    "require_action": "run_goal",
                    "require_run_id": True,
                    "max_fail_streak": 8,
                    "pause_on_escalation": False,
                    "escalate_on_fail_streak": False,
                    "auto_remediation_enabled": False,
                    "autotune_enabled": False,
                }
            ),
        )
        objective_id = str(created["id"])

        def _failed_result(execution_id: str, confidence: float) -> dict:
            return {
                "ok": True,
                "execution_id": execution_id,
                "tick": {
                    "decision": {"action": "run_goal"},
                    "execution": {"duration_ms": 95},
                    "reflection": {"lesson": "missing run id", "confidence": confidence},
                    "result": {
                        "status": "planned",
                        "final_status": "planned",
                        "action": "run_goal",
                        "risk_flags": [],
                    },
                },
            }

        for idx, confidence in enumerate([0.95, 0.8, 0.6, 0.4], start=1):
            update_objective(db_path=self.db_path, objective_id=objective_id, next_run_at=time.time() - 1, status="active")
            tick = ingest_due_objectives(
                db_path=self.db_path,
                niche_id=self.niche_id,
                max_dispatch=1,
            )
            self.assertEqual(tick["dispatched_count"], 1)
            event_id = str(tick["dispatched_event_ids"][0])
            complete_event(self.db_path, event_id, _failed_result(f"exec-autotune-loop-{idx}", confidence))

        current = get_objective(db_path=self.db_path, objective_id=objective_id)
        self.assertIsNotNone(current)
        current_constraints = current["constraints"] if isinstance(current.get("constraints"), dict) else {}
        current_constraints["autotune_enabled"] = True
        current_constraints["autotune_apply"] = True
        current_constraints["autotune_interval_seconds"] = 0
        current_constraints["autotune_min_reflections"] = 4
        current_constraints["autotune_sample_size"] = 20
        update_objective(
            db_path=self.db_path,
            objective_id=objective_id,
            constraints_json=json.dumps(current_constraints),
            next_run_at=time.time() - 1,
            status="active",
        )

        tuned_tick = ingest_due_objectives(
            db_path=self.db_path,
            niche_id=self.niche_id,
            max_dispatch=1,
        )
        self.assertEqual(tuned_tick["dispatched_count"], 1)
        self.assertGreaterEqual(int(tuned_tick.get("autotuned_count") or 0), 1)
        self.assertGreaterEqual(int(tuned_tick.get("autotune_applied_count") or 0), 1)
        self.assertGreaterEqual(int(tuned_tick.get("autotune_changed_total") or 0), 1)

        updated_obj = get_objective(db_path=self.db_path, objective_id=objective_id)
        self.assertIsNotNone(updated_obj)
        updated_constraints = updated_obj["constraints"] if isinstance(updated_obj.get("constraints"), dict) else {}
        self.assertTrue(bool(updated_constraints.get("auto_remediation_enabled")))
        updated_metadata = updated_obj["metadata"] if isinstance(updated_obj.get("metadata"), dict) else {}
        autotune_meta = updated_metadata.get("autotune") if isinstance(updated_metadata.get("autotune"), dict) else {}
        self.assertGreater(float(autotune_meta.get("last_run_at") or 0.0), 0.0)

    def test_objective_waiting_for_input_escalates_and_pauses_immediately(self):
        created = create_objective(
            db_path=self.db_path,
            niche_id=self.niche_id,
            title="Immediate approval gate",
            goal_text="run guarded status",
            priority=60,
            cadence_seconds=60,
            constraints_json='{"max_fail_streak":5,"pause_on_escalation":true,"escalate_on_waiting_for_input":true}',
        )
        objective_id = str(created["id"])
        tick = ingest_due_objectives(
            db_path=self.db_path,
            niche_id=self.niche_id,
            max_dispatch=1,
        )
        self.assertEqual(tick["dispatched_count"], 1)
        event_id = str(tick["dispatched_event_ids"][0])

        waiting_result = {
            "ok": True,
            "execution_id": "exec-wfi-objective",
            "tick": {
                "decision": {"action": "run_goal"},
                "execution": {"duration_ms": 100},
                "reflection": {"lesson": "awaiting approval", "confidence": 0.7},
                "result": {
                    "status": "waiting_for_input",
                    "final_status": "waiting_for_input",
                    "action": "run_goal",
                    "goal": "status",
                    "risk_flags": ["approval_required"],
                },
            },
        }
        complete_event(self.db_path, event_id, waiting_result)

        obj = get_objective(db_path=self.db_path, objective_id=objective_id)
        self.assertIsNotNone(obj)
        self.assertEqual(str(obj["status"]), "paused")
        policy = obj["metadata"].get("policy") if isinstance(obj.get("metadata"), dict) else {}
        self.assertEqual(str(policy.get("escalation_state") or ""), "open")
        self.assertEqual(str(policy.get("escalation_reason") or ""), "waiting_for_input")
        self.assertEqual(int(policy.get("verification_fail_streak") or 0), 1)

        row = get_event(self.db_path, event_id)
        self.assertIsNotNone(row)
        self.assertEqual(str(row["status"]), "waiting_for_input")
        verification = row["result_json"].get("tick", {}).get("objective_verification", {})
        self.assertTrue(bool(verification.get("escalated")))
        self.assertEqual(str(verification.get("escalation_reason") or ""), "waiting_for_input")

        approvals = list_pending_approvals(self.db_path, self.niche_id, limit=10)
        self.assertGreaterEqual(len(approvals), 1)
        self.assertEqual(str(approvals[0]["event_id"]), event_id)
        self.assertEqual(str(approvals[0]["objective_id"]), objective_id)

    def test_status_objective_waiting_auto_approves_and_requeues(self):
        created = create_objective(
            db_path=self.db_path,
            niche_id=self.niche_id,
            title="Auto-approve status objective",
            goal_text="status",
            priority=60,
            cadence_seconds=60,
            constraints_json=json.dumps(
                {
                    "pause_on_escalation": True,
                    "escalate_on_waiting_for_input": True,
                    "auto_approve_status_waiting": True,
                    "auto_approve_max_per_event": 1,
                }
            ),
        )
        objective_id = str(created["id"])
        tick = ingest_due_objectives(
            db_path=self.db_path,
            niche_id=self.niche_id,
            max_dispatch=1,
        )
        self.assertEqual(tick["dispatched_count"], 1)
        event_id = str(tick["dispatched_event_ids"][0])

        waiting_result = {
            "ok": True,
            "execution_id": "exec-auto-approve-status",
            "tick": {
                "decision": {"action": "run_goal"},
                "execution": {"duration_ms": 120},
                "reflection": {"lesson": "waiting for approval", "confidence": 0.75},
                "result": {
                    "status": "waiting_for_input",
                    "final_status": "waiting_for_input",
                    "action": "run_goal",
                    "goal": "status",
                    "risk_flags": ["approval_required"],
                },
            },
        }
        complete_event(self.db_path, event_id, waiting_result)

        row = get_event(self.db_path, event_id)
        self.assertIsNotNone(row)
        self.assertEqual(str(row["status"]), "pending")
        self.assertIsNone(row.get("result_json"))
        metadata = row["event_json"].get("metadata") if isinstance(row["event_json"], dict) else {}
        approval = metadata.get("approval") if isinstance(metadata.get("approval"), dict) else {}
        self.assertTrue(bool(metadata.get("approval_granted")))
        self.assertTrue(bool(approval.get("approved")))
        self.assertTrue(bool(approval.get("auto")))
        self.assertEqual(str(approval.get("actor") or ""), "system_auto")

        obj = get_objective(db_path=self.db_path, objective_id=objective_id)
        self.assertIsNotNone(obj)
        self.assertEqual(str(obj["status"]), "active")
        policy = obj["metadata"].get("policy") if isinstance(obj.get("metadata"), dict) else {}
        self.assertEqual(str(policy.get("escalation_state") or ""), "resolved")
        self.assertEqual(str(policy.get("escalation_resolution") or ""), "auto_approved_low_risk")
        self.assertGreaterEqual(int(policy.get("auto_approval_count") or 0), 1)

        approvals = list_pending_approvals(self.db_path, self.niche_id, limit=10)
        event_ids = [str(item.get("event_id") or "") for item in approvals]
        self.assertNotIn(event_id, event_ids)

        digest = get_event_digest(self.db_path, event_id)
        self.assertIsNotNone(digest)
        self.assertEqual(str(digest.get("final_status") or ""), "pending")
        self.assertEqual(str(digest.get("next_action") or ""), "monitor")
        self.assertIn("auto_approved", list(digest.get("risk_flags") or []))

    def test_status_objective_auto_approval_can_be_disabled(self):
        created = create_objective(
            db_path=self.db_path,
            niche_id=self.niche_id,
            title="No auto-approve status objective",
            goal_text="status",
            priority=60,
            cadence_seconds=60,
            constraints_json=json.dumps(
                {
                    "pause_on_escalation": True,
                    "escalate_on_waiting_for_input": True,
                    "auto_approve_status_waiting": False,
                }
            ),
        )
        objective_id = str(created["id"])
        tick = ingest_due_objectives(
            db_path=self.db_path,
            niche_id=self.niche_id,
            max_dispatch=1,
        )
        self.assertEqual(tick["dispatched_count"], 1)
        event_id = str(tick["dispatched_event_ids"][0])

        waiting_result = {
            "ok": True,
            "execution_id": "exec-no-auto-approve-status",
            "tick": {
                "decision": {"action": "run_goal"},
                "execution": {"duration_ms": 90},
                "reflection": {"lesson": "waiting for approval", "confidence": 0.7},
                "result": {
                    "status": "waiting_for_input",
                    "final_status": "waiting_for_input",
                    "action": "run_goal",
                    "goal": "status",
                    "risk_flags": ["approval_required"],
                },
            },
        }
        complete_event(self.db_path, event_id, waiting_result)

        row = get_event(self.db_path, event_id)
        self.assertIsNotNone(row)
        self.assertEqual(str(row["status"]), "waiting_for_input")
        obj = get_objective(db_path=self.db_path, objective_id=objective_id)
        self.assertIsNotNone(obj)
        self.assertEqual(str(obj["status"]), "paused")
        approvals = list_pending_approvals(self.db_path, self.niche_id, limit=10)
        event_ids = [str(item.get("event_id") or "") for item in approvals]
        self.assertIn(event_id, event_ids)

    def test_objective_open_escalation_applies_retry_hold(self):
        created = create_objective(
            db_path=self.db_path,
            niche_id=self.niche_id,
            title="Escalation hold objective",
            goal_text="run escalation hold check",
            priority=70,
            cadence_seconds=60,
            next_run_at=time.time() - 1,
            constraints_json='{"pause_on_escalation":false,"approval_retry_cooldown_seconds":120}',
        )
        objective_id = str(created["id"])
        update_objective(
            db_path=self.db_path,
            objective_id=objective_id,
            status="active",
            next_run_at=time.time() - 1,
            metadata_json=json.dumps({"policy": {"escalation_state": "open"}}),
        )
        started = time.time()
        out = ingest_due_objectives(
            db_path=self.db_path,
            niche_id=self.niche_id,
            max_dispatch=1,
        )
        self.assertEqual(out["dispatched_count"], 0)
        self.assertEqual(int(out.get("skipped_approval_hold") or 0), 1)
        obj = get_objective(db_path=self.db_path, objective_id=objective_id)
        self.assertIsNotNone(obj)
        self.assertGreater(float(obj.get("next_run_at") or 0.0), started + 100.0)
        policy = obj["metadata"].get("policy") if isinstance(obj.get("metadata"), dict) else {}
        self.assertEqual(str(policy.get("approval_hold_reason") or ""), "escalation_open")
        self.assertGreater(float(policy.get("approval_hold_until") or 0.0), started + 100.0)


if __name__ == "__main__":
    unittest.main()
