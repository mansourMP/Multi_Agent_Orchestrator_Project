import asyncio
import time
import threading
import unittest
from unittest.mock import patch

from server_modules import run_state_repository


class _FakePool:
    def __init__(self, *, fetchrow_result=None, fetchrow_results=None, fetch_result=None, fetch_results=None, execute_error: Exception | None = None):
        self.fetchrow_result = fetchrow_result
        self.fetchrow_results = list(fetchrow_results or [])
        self.fetch_result = list(fetch_result or [])
        self.fetch_results = list(fetch_results or [])
        self.execute_error = execute_error
        self.execute_calls = []
        self.fetchrow_calls = []
        self.fetch_calls = []

    async def execute(self, query, *args):
        self.execute_calls.append((query, args))
        if self.execute_error is not None:
            raise self.execute_error
        return "OK"

    async def fetchrow(self, query, *args):
        self.fetchrow_calls.append((query, args))
        if self.execute_error is not None:
            raise self.execute_error
        if self.fetchrow_results:
            return self.fetchrow_results.pop(0)
        return self.fetchrow_result

    async def fetch(self, query, *args):
        self.fetch_calls.append((query, args))
        if self.execute_error is not None:
            raise self.execute_error
        if self.fetch_results:
            return list(self.fetch_results.pop(0))
        return list(self.fetch_result)


class RunStateRepositoryTests(unittest.IsolatedAsyncioTestCase):
    async def test_upsert_live_run_writes_to_postgres_pool(self):
        pool = _FakePool()
        with patch("server_modules.run_state_repository.runtime_db.get_pool", return_value=pool):
            result = await run_state_repository.upsert_live_run(
                "run-1",
                "workspace-1",
                "tenant-1",
                "queued",
                {"run_id": "run-1", "status": "queued"},
                "trace-1",
            )

        self.assertIsNone(result)
        self.assertEqual(len(pool.execute_calls), 1)
        _, args = pool.execute_calls[0]
        self.assertEqual(args[0], "run-1")
        self.assertEqual(args[1], "workspace-1")
        self.assertEqual(args[2], "tenant-1")
        self.assertEqual(args[3], "queued")

    async def test_get_live_run_prefers_postgres_payload(self):
        pool = _FakePool(fetchrow_result={"payload": {"run_id": "run-1", "status": "executing"}})
        with patch("server_modules.run_state_repository.runtime_db.get_pool", return_value=pool):
            result = await run_state_repository.get_live_run("run-1")

        self.assertEqual(result["run_id"], "run-1")
        self.assertEqual(result["status"], "executing")
        self.assertEqual(len(pool.fetchrow_calls), 1)

    async def test_get_live_run_returns_none_when_postgres_unavailable(self):
        with patch("server_modules.run_state_repository.runtime_db.get_pool", return_value=None):
            result = await run_state_repository.get_live_run("run-sqlite")

        self.assertIsNone(result)

    async def test_record_transition_raises_when_postgres_fails(self):
        pool = _FakePool(execute_error=RuntimeError("db down"))
        with patch("server_modules.run_state_repository.runtime_db.get_pool", return_value=pool):
            with self.assertRaises(run_state_repository.RunStatePersistenceError):
                await run_state_repository.record_transition(
                    "run-1",
                    "queued",
                    "executing",
                    "runtime",
                    "trace-1",
                )
        self.assertEqual(len(pool.execute_calls), 1)

    async def test_archive_run_claim_and_release_are_idempotent_calls(self):
        pool = _FakePool(fetchrow_result={"run_id": "run-1"})
        with patch("server_modules.run_state_repository.runtime_db.get_pool", return_value=pool):
            await run_state_repository.archive_run(
                "run-1",
                "completed",
                {
                    "run_id": "run-1",
                    "workspace_id": "workspace-1",
                    "tenant_id": "tenant-1",
                    "status": "completed",
                    "context": {"workspace_id": "workspace-1", "tenant_id": "tenant-1"},
                },
                "trace-1",
            )
            await run_state_repository.claim_run("run-1", "worker-1", 30, "trace-2")
            await run_state_repository.release_claim("run-1")

        self.assertTrue(any("run_archive" in query for query, _args in pool.execute_calls))
        self.assertTrue(any("local_queue_claims" in query for query, _args in pool.fetchrow_calls))
        self.assertTrue(any("DELETE FROM local_queue_claims" in query for query, _args in pool.execute_calls))

    async def test_claim_run_rejects_overwriting_an_active_claim(self):
        pool = _FakePool(fetchrow_result=None)
        with patch("server_modules.run_state_repository.runtime_db.get_pool", return_value=pool):
            with self.assertRaises(run_state_repository.RunClaimConflictError):
                await run_state_repository.claim_run("run-1", "worker-2", 30, "trace-2")

        self.assertEqual(len(pool.fetchrow_calls), 1)

    def test_sync_upsert_live_run_raises_when_postgres_write_fails(self):
        pool = _FakePool(execute_error=RuntimeError("db down"))
        with patch("server_modules.run_state_repository.runtime_db.get_pool", return_value=pool):
            with self.assertRaises(run_state_repository.RunStatePersistenceError):
                run_state_repository.sync_upsert_live_run(
                    "run-1",
                    "workspace-1",
                    "tenant-1",
                    "queued",
                    {"run_id": "run-1", "status": "queued"},
                    "trace-1",
                )

    async def test_persist_and_replay_outbox_events_round_trip_through_postgres(self):
        pool = _FakePool(
            fetch_result=[
                {
                    "event_id": "evt-1",
                    "event_type": "approval_resolved",
                    "tenant_id": "tenant-1",
                    "workspace_id": "ws-1",
                    "run_id": "run-1",
                    "machine_id": None,
                    "trace_id": "trace-1",
                    "idempotency_key": "approval_resolved:approval-1:approved",
                    "payload": {"approval_id": "approval-1"},
                    "created_at": "2026-04-07T00:00:00Z",
                    "delivered_at": None,
                    "last_replayed_at": None,
                    "retry_count": 0,
                    "last_delivery_error": None,
                    "last_attempted_at": None,
                    "next_attempt_at": None,
                    "poisoned_at": None,
                }
            ]
        )
        with patch("server_modules.run_state_repository.runtime_db.get_pool", return_value=pool):
            await run_state_repository.persist_outbox_event(
                event_id="evt-1",
                event_type="approval_resolved",
                tenant_id="tenant-1",
                workspace_id="ws-1",
                run_id="run-1",
                machine_id=None,
                trace_id="trace-1",
                idempotency_key="approval_resolved:approval-1:approved",
                payload={"approval_id": "approval-1"},
            )
            items = await run_state_repository.list_undelivered_outbox_events(older_than_seconds=30)
            await run_state_repository.mark_outbox_event_delivered("evt-1")

        self.assertEqual(items[0]["event_id"], "evt-1")
        self.assertGreaterEqual(len(pool.execute_calls), 3)
        self.assertIn("runtime_outbox", pool.execute_calls[0][0])
        self.assertIn("runtime_outbox", pool.execute_calls[1][0])
        self.assertEqual(len(pool.fetch_calls), 1)
        self.assertIn("UPDATE runtime_outbox", pool.execute_calls[-1][0])

    async def test_record_outbox_delivery_failure_and_status_snapshot_include_retry_fields(self):
        pool = _FakePool(
            fetchrow_results=[
                {
                    "undelivered_count": 2,
                    "poisoned_count": 1,
                    "repeated_failure_count": 1,
                    "stuck_count": 1,
                    "total_retry_count": 5,
                    "max_retry_count": 3,
                },
                {
                    "event_id": "evt-1",
                    "last_delivery_error": "boom",
                    "last_attempted_at": "2026-04-07T00:01:00Z",
                    "retry_count": 3,
                },
            ]
        )
        with patch("server_modules.run_state_repository.runtime_db.get_pool", return_value=pool):
            await run_state_repository.record_outbox_delivery_failure(
                "evt-1",
                error_text="boom",
                retry_delay_seconds=15,
                poison=False,
            )
            status = await run_state_repository.get_outbox_delivery_status()

        self.assertTrue(any("UPDATE runtime_outbox" in query for query, _args in pool.execute_calls))
        self.assertEqual(status["undelivered_count"], 2)
        self.assertEqual(status["poisoned_count"], 1)
        self.assertEqual(status["repeated_failure_count"], 1)
        self.assertEqual(status["stuck_count"], 1)
        self.assertEqual(status["last_delivery_error"]["event_id"], "evt-1")

    async def test_patch_outbox_event_payload_and_list_poisoned_events(self):
        pool = _FakePool(
            fetch_result=[
                {
                    "event_id": "evt-poison",
                    "event_type": "channel_run_delivery",
                    "tenant_id": "tenant-1",
                    "workspace_id": "ws-1",
                    "run_id": "run-1",
                    "machine_id": None,
                    "trace_id": "trace-1",
                    "idempotency_key": "channel_run_delivery:telegram:conn-1:run-1",
                    "payload": {"channel": "telegram", "delivery": {"status": "failed"}},
                    "created_at": "2026-04-07T00:00:00Z",
                    "delivered_at": None,
                    "last_replayed_at": None,
                    "retry_count": 5,
                    "last_delivery_error": "boom",
                    "last_attempted_at": "2026-04-07T00:05:00Z",
                    "next_attempt_at": None,
                    "poisoned_at": "2026-04-07T00:05:30Z",
                }
            ]
        )
        with patch("server_modules.run_state_repository.runtime_db.get_pool", return_value=pool):
            await run_state_repository.patch_outbox_event_payload(
                "evt-poison",
                {"delivery": {"status": "sent", "receipt": {"provider_message_id": "msg-1"}}},
            )
            items = await run_state_repository.list_poisoned_outbox_events(limit=50)

        self.assertTrue(any("payload = COALESCE(runtime_outbox.payload" in query for query, _args in pool.execute_calls))
        self.assertEqual(items[0]["event_id"], "evt-poison")
        self.assertEqual(items[0]["payload"]["delivery"]["status"], "failed")

    async def test_list_expired_local_claims_returns_joined_run_payloads(self):
        pool = _FakePool(
            fetch_result=[
                {
                    "run_id": "run-1",
                    "worker_id": "worker-1",
                    "claimed_at": "2026-04-07T00:00:00Z",
                    "last_heartbeat_at": "2026-04-07T00:00:10Z",
                    "last_progress_at": "2026-04-07T00:00:12Z",
                    "ttl": 30,
                    "trace_id": "trace-1",
                    "run_payload": {"run_id": "run-1", "status": "running_local"},
                }
            ]
        )
        with patch("server_modules.run_state_repository.runtime_db.get_pool", return_value=pool):
            items = await run_state_repository.list_expired_local_claims()

        self.assertEqual(items[0]["run_id"], "run-1")
        self.assertEqual(items[0]["worker_id"], "worker-1")
        self.assertEqual(items[0]["last_heartbeat_at"], "2026-04-07T00:00:10Z")
        self.assertEqual(items[0]["run_payload"]["status"], "running_local")

    async def test_touch_claim_heartbeat_updates_durable_claim_timestamps(self):
        pool = _FakePool()
        with patch("server_modules.run_state_repository.runtime_db.get_pool", return_value=pool):
            await run_state_repository.touch_claim_heartbeat(
                "run-1",
                "worker-1",
                note="still working",
                progress=True,
            )

        self.assertTrue(any("UPDATE local_queue_claims" in query for query, _args in pool.execute_calls))

    async def test_append_dead_letter_and_status_snapshot_round_trip(self):
        pool = _FakePool(
            fetchrow_results=[
                {
                    "dead_letter_count": 2,
                    "total_failure_count": 5,
                    "last_recorded_at": "2026-04-07T00:02:00Z",
                }
            ],
            fetch_results=[
                [{"workspace_id": "ws-1", "count": 2}],
                [{"specialist_key": "install-1", "count": 2}],
            ],
        )
        with patch("server_modules.run_state_repository.runtime_db.get_pool", return_value=pool):
            await run_state_repository.append_local_queue_dead_letter(
                run_id="run-1",
                tenant_id="tenant-1",
                workspace_id="ws-1",
                specialist_key="install-1",
                reason="worker_lost_retry_exhausted",
                trace_id="trace-1",
                failure_count=3,
                payload={"run_id": "run-1"},
            )
            status = await run_state_repository.get_local_queue_dead_letter_status()

        self.assertTrue(any("local_queue_dead_letters" in query for query, _args in pool.execute_calls))
        self.assertEqual(status["dead_letter_count"], 2)
        self.assertEqual(status["workspace_hotspots"][0]["workspace_id"], "ws-1")
        self.assertEqual(status["specialist_hotspots"][0]["specialist_key"], "install-1")

    async def test_upsert_and_list_fleet_workers_round_trip(self):
        pool = _FakePool(
            fetch_result=[
                {
                    "worker_id": "worker-1",
                    "tenant_id": "tenant-1",
                    "workspace_id": "ws-1",
                    "machine_id": "machine-1",
                    "runtime_type": "hosted_secure",
                    "status": "idle",
                    "control_state": "active",
                    "current_run_id": None,
                    "instance_id": "instance-1",
                    "shard_key": "tenant-1:ws-1:hosted_secure:hosted_secure",
                    "prewarm_state": "warm",
                    "warm_pool": "primary",
                    "lease_seconds": 45,
                    "registered_at": "2026-04-10T00:00:00Z",
                    "last_registered_at": "2026-04-10T00:00:10Z",
                    "last_heartbeat_at": "2026-04-10T00:00:12Z",
                    "updated_at": "2026-04-10T00:00:12Z",
                    "payload": {"display_name": "Hosted Worker"},
                }
            ]
        )
        with patch("server_modules.run_state_repository.runtime_db.get_pool", return_value=pool):
            await run_state_repository.upsert_fleet_worker(
                {
                    "worker_id": "worker-1",
                    "tenant_id": "tenant-1",
                    "workspace_id": "ws-1",
                    "machine_id": "machine-1",
                    "runtime_type": "hosted_secure",
                    "status": "idle",
                    "control_state": "active",
                    "execution_targets": ["hosted_secure"],
                    "prewarm_state": "warm",
                    "warm_pool": "primary",
                    "lease_seconds": 45,
                },
                heartbeat_seen=True,
            )
            items = await run_state_repository.list_fleet_workers(workspace_id="ws-1")

        self.assertTrue(any("fleet_worker_registrations" in query for query, _args in pool.execute_calls))
        self.assertEqual(items[0]["worker_id"], "worker-1")
        self.assertEqual(items[0]["prewarm_state"], "warm")
        self.assertEqual(items[0]["queue_shard"], "tenant-1:ws-1:hosted_secure:hosted_secure")

    async def test_upsert_and_list_fleet_queue_partitions_round_trip(self):
        pool = _FakePool(
            fetch_result=[
                {
                    "partition_id": "ws-1::install-1",
                    "tenant_id": "tenant-1",
                    "workspace_id": "ws-1",
                    "specialist_key": "install-1",
                    "pending_count": 3,
                    "claimed_count": 1,
                    "online_workers": 2,
                    "busy_workers": 1,
                    "idle_workers": 1,
                    "prewarmed_workers": 1,
                    "state": "strained",
                    "retry_after_seconds": 10,
                    "updated_at": "2026-04-10T00:00:30Z",
                    "payload": {"summary": "Partition backlog is elevated but progressing."},
                }
            ]
        )
        with patch("server_modules.run_state_repository.runtime_db.get_pool", return_value=pool):
            await run_state_repository.upsert_fleet_queue_partition(
                partition_id="ws-1::install-1",
                tenant_id="tenant-1",
                workspace_id="ws-1",
                specialist_key="install-1",
                pending_count=3,
                claimed_count=1,
                online_workers=2,
                busy_workers=1,
                idle_workers=1,
                prewarmed_workers=1,
                state="strained",
                retry_after_seconds=10,
                payload={"summary": "Partition backlog is elevated but progressing."},
            )
            items = await run_state_repository.list_fleet_queue_partitions(workspace_id="ws-1")

        self.assertTrue(any("fleet_queue_partitions" in query for query, _args in pool.execute_calls))
        self.assertEqual(items[0]["partition_id"], "ws-1::install-1")
        self.assertEqual(items[0]["pending_count"], 3)
        self.assertEqual(items[0]["prewarmed_workers"], 1)


class RunStateRepositorySyncDispatchTests(unittest.TestCase):
    def test_dispatch_repository_call_returns_without_waiting_for_completion(self):
        started = threading.Event()
        release = threading.Event()

        async def _blocking() -> None:
            started.set()
            await asyncio.to_thread(release.wait, 1.0)

        started_at = time.monotonic()
        run_state_repository.dispatch_repository_call(_blocking(), operation="test_dispatch_repository_call")
        elapsed = time.monotonic() - started_at

        self.assertLess(elapsed, 0.1)
        self.assertTrue(started.wait(timeout=1.0))
        release.set()
