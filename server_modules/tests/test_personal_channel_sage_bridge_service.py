import unittest
from unittest.mock import patch

from server_modules import personal_channel_sage_bridge_service


class PersonalChannelSageBridgeServiceTests(unittest.TestCase):
    def test_whatsapp_personal_reply_uses_direct_chat_runtime_lane_without_studio_install_context(self) -> None:
        with patch(
            "server_modules.direct_chat_runtime_exports.collect_direct_operator_reply",
            return_value={"reply": "hello from Sage"},
        ) as reply_mock:
            result = personal_channel_sage_bridge_service.build_whatsapp_personal_reply(
                workspace_id="workspace-1",
                gateway_id="gateway-1",
                remote_jid="15551234567",
                text="hey Sage",
                push_name="Mansur",
            )

        self.assertEqual(result["text"], "hello from Sage")
        kwargs = reply_mock.call_args.kwargs
        self.assertEqual(kwargs["thread_id"], "whatsapp_personal:gateway-1:15551234567")
        self.assertEqual(kwargs["availability"]["runtime_lane"], "personal_gateway")
        self.assertEqual(kwargs["availability"]["memory_surface"], "direct_chat")
        self.assertEqual(kwargs["session_ctx"]["surface_channel"], "whatsapp_personal")
        self.assertEqual(kwargs["session_ctx"]["runtime_lane"], "personal_gateway")
        self.assertEqual(kwargs["session_ctx"]["memory_surface"], "direct_chat")
        self.assertNotIn("responder_install_id", kwargs["session_ctx"])
        self.assertNotIn("deployed_agent_id", kwargs["session_ctx"])
        self.assertNotIn("connector_id", kwargs["session_ctx"])
        self.assertEqual(kwargs["requested_model"], "")
        self.assertEqual(kwargs["requested_provider"], "")


if __name__ == "__main__":
    unittest.main()
