from __future__ import annotations

import unittest
from unittest.mock import AsyncMock, patch

from server_modules.transparency_event_store_service import persist_transparency_events


class TransparencyEventStoreServiceTests(unittest.IsolatedAsyncioTestCase):
    async def test_persist_transparency_events_awaits_activity_writer(self) -> None:
        event = {
            "event_id": "stevt-test",
            "event_type": "final_response_sent",
            "title": "Response sent",
            "summary": "Sage replied",
            "status": "completed",
        }

        with patch(
            "server_modules.transparency_event_store_service.activity_ledger_service.append_activity_event",
            new_callable=AsyncMock,
        ) as append_activity_event:
            stored = await persist_transparency_events(
                trace_id="trace-123",
                workspace_id="workspace-1",
                events=[event],
            )

        self.assertEqual(stored, 1)
        append_activity_event.assert_awaited_once()
        kwargs = append_activity_event.await_args.kwargs
        self.assertEqual(kwargs["trace_id"], "trace-123")
        self.assertEqual(kwargs["workspace_id"], "workspace-1")
        self.assertEqual(kwargs["event_class"], "transparency_event")


if __name__ == "__main__":
    unittest.main()
