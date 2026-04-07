import unittest

from fastapi import HTTPException

from server_modules import runtime_run_entry_service


class RuntimeRunEntryServiceTests(unittest.TestCase):
    def test_preview_routing_response_shapes_preview_payload(self):
        payload = runtime_run_entry_service.preview_routing_response(
            {"engine": "orion"},
            build_run_routing_preview=lambda request_payload, services=None: {
                "engine": "orion",
                "metadata": {"agent_role": "researcher", "agent_role_source": "explicit"},
                "route": {"selected": "cloud"},
                "tool_policy_precheck": {"requires_approval": False},
            },
            run_routing_preview_services=lambda: object(),
        )

        self.assertEqual(payload["engine"], "orion")
        self.assertEqual(payload["agent_role"], "researcher")
        self.assertEqual(payload["route"], {"selected": "cloud"})

    def test_precheck_run_response_includes_doctor_preflight(self):
        async def _build(request_payload, services=None):
            return {
                "engine": "orion",
                "metadata": {"agent_role": "researcher", "agent_role_source": "explicit"},
                "route": {"selected": "cloud"},
                "tool_policy_precheck": {"requires_approval": False},
                "doctor_preflight": {"ok": True},
            }

        payload = self._run_async(
            runtime_run_entry_service.precheck_run_response(
                {"engine": "orion"},
                build_run_precheck_result=_build,
                run_routing_preview_services=lambda: object(),
            )
        )

        self.assertTrue(payload["ok"])
        self.assertEqual(payload["doctor_preflight"], {"ok": True})

    def test_stream_run_response_requires_existing_run(self):
        with self.assertRaises(HTTPException):
            runtime_run_entry_service.stream_run_response(
                "run-1",
                current_user={"user_id": "user-1"},
                runs={},
                get_live_run_fn=lambda run_id: None,
                serialize_run_snapshot=lambda run_id, run: {},
                enforce_run_owner_access=lambda current_user, snapshot: None,
                event_source_response_class=lambda events: events,
                iter_logs_for_run=lambda run_id: [],
            )

    def test_stream_run_response_enforces_access_and_wraps_event_source(self):
        seen = {}

        payload = runtime_run_entry_service.stream_run_response(
            "run-1",
            current_user={"user_id": "user-1"},
            runs={"run-1": {"status": "running"}},
            get_live_run_fn=lambda run_id: {"run_id": run_id, "status": "running"},
            serialize_run_snapshot=lambda run_id, run: {"run_id": run_id},
            enforce_run_owner_access=lambda current_user, snapshot: seen.setdefault("snapshot", snapshot),
            event_source_response_class=lambda events: {"events": events},
            iter_logs_for_run=lambda run_id: [f"log:{run_id}"],
        )

        self.assertEqual(seen["snapshot"], {"run_id": "run-1"})
        self.assertEqual(payload, {"events": ["log:run-1"]})

    def _run_async(self, coroutine):
        import asyncio

        return asyncio.run(coroutine)


if __name__ == "__main__":
    unittest.main()
