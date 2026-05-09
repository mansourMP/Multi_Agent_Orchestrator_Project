import json
import unittest

from server_modules import gateway_protocol_service


class GatewayProtocolServiceTests(unittest.TestCase):
    def test_parse_frame_accepts_valid_object_frame(self) -> None:
        frame = gateway_protocol_service._parse_frame(
            json.dumps(
                {
                    "kind": "request",
                    "id": "connect",
                    "type": "gateway.connect",
                    "payload": {"ok": True},
                }
            )
        )

        self.assertEqual(frame["type"], "gateway.connect")

    def test_parse_frame_rejects_oversized_frame_before_json_parse(self) -> None:
        oversized = "x" * (gateway_protocol_service.MAX_GATEWAY_FRAME_BYTES + 1)

        with self.assertRaises(gateway_protocol_service.GatewayFrameValidationError) as raised:
            gateway_protocol_service._parse_frame(oversized)

        self.assertEqual(raised.exception.error_code, "gateway_frame_too_large")
        self.assertEqual(raised.exception.close_code, 4409)

    def test_parse_frame_accepts_exact_size_boundary(self) -> None:
        base = {"kind": "request", "id": "a", "type": "gateway.heartbeat", "payload": {"padding": ""}}
        raw = json.dumps(base, separators=(",", ":"))
        remaining = gateway_protocol_service.MAX_GATEWAY_FRAME_BYTES - len(raw.encode("utf-8"))
        base["payload"]["padding"] = "x" * max(0, remaining)
        raw = json.dumps(base, separators=(",", ":"))
        while len(raw.encode("utf-8")) > gateway_protocol_service.MAX_GATEWAY_FRAME_BYTES:
            base["payload"]["padding"] = base["payload"]["padding"][:-1]
            raw = json.dumps(base, separators=(",", ":"))

        frame = gateway_protocol_service._parse_frame(raw)

        self.assertEqual(frame["type"], "gateway.heartbeat")

    def test_parse_frame_rejects_invalid_json(self) -> None:
        with self.assertRaises(gateway_protocol_service.GatewayFrameValidationError) as raised:
            gateway_protocol_service._parse_frame("{not-json")

        self.assertEqual(raised.exception.error_code, "gateway_frame_invalid_json")

    def test_parse_frame_rejects_deeply_nested_json(self) -> None:
        value = "leaf"
        for _ in range(gateway_protocol_service.MAX_GATEWAY_JSON_DEPTH + 2):
            value = {"nested": value}

        with self.assertRaises(gateway_protocol_service.GatewayFrameValidationError) as raised:
            gateway_protocol_service._parse_frame(json.dumps(value))

        self.assertEqual(raised.exception.error_code, "gateway_frame_too_deep")

    def test_parse_frame_rejects_non_object_json(self) -> None:
        with self.assertRaises(gateway_protocol_service.GatewayFrameValidationError) as raised:
            gateway_protocol_service._parse_frame(json.dumps(["not", "a", "frame"]))

        self.assertEqual(raised.exception.error_code, "gateway_frame_not_object")

    def test_scope_match_requires_all_scope_fields(self) -> None:
        registration = {
            "tenant_id": "tenant-1",
            "workspace_id": "default",
            "user_id": "owner-1",
            "device_id": "device-1",
            "gateway_id": "gateway-1",
        }
        matching_scope = {
            "tenant_id": "tenant-1",
            "workspace_id": "default",
            "user_id": "owner-1",
            "device_id": "device-1",
            "gateway_id": "gateway-1",
        }
        missing_scope = {
            "tenant_id": "tenant-1",
            "workspace_id": "default",
            "user_id": "owner-1",
            "device_id": "device-1",
        }

        self.assertTrue(gateway_protocol_service._scope_matches_registration(matching_scope, registration))
        self.assertFalse(gateway_protocol_service._scope_matches_registration(missing_scope, registration))

    def test_normalize_frame_seq_ack_rejects_invalid_sequence(self) -> None:
        with self.assertRaises(gateway_protocol_service.GatewayFrameValidationError) as raised:
            gateway_protocol_service._normalize_frame_seq_ack({"seq": "bad"})
        self.assertEqual(raised.exception.error_code, "gateway_frame_invalid_sequence")

        with self.assertRaises(gateway_protocol_service.GatewayFrameValidationError) as raised_negative:
            gateway_protocol_service._normalize_frame_seq_ack({"ack": -1})
        self.assertEqual(raised_negative.exception.error_code, "gateway_frame_invalid_sequence")

    def test_normalize_frame_seq_ack_accepts_positive_and_missing_values(self) -> None:
        seq, ack = gateway_protocol_service._normalize_frame_seq_ack({"seq": "7", "ack": 3})
        self.assertEqual(seq, 7)
        self.assertEqual(ack, 3)

        seq_missing, ack_missing = gateway_protocol_service._normalize_frame_seq_ack({})
        self.assertIsNone(seq_missing)
        self.assertIsNone(ack_missing)

    def test_live_connection_rejects_duplicate_inbound_frame_ids(self) -> None:
        connection = gateway_protocol_service._LiveGatewayConnection(
            websocket=object(),
            gateway_id="gateway-1",
            session_id="session-1",
            scope={"tenant_id": "tenant-1", "workspace_id": "workspace-1"},
        )

        self.assertTrue(connection.remember_inbound_frame_id("frame-1"))
        self.assertFalse(connection.remember_inbound_frame_id("frame-1"))
        self.assertTrue(connection.remember_inbound_frame_id("frame-2"))
        self.assertTrue(connection.remember_inbound_frame_id(""))

    def test_parse_frame_rejects_empty_frame(self) -> None:
        with self.assertRaises(gateway_protocol_service.GatewayFrameValidationError) as raised:
            gateway_protocol_service._parse_frame("")
        self.assertEqual(raised.exception.error_code, "gateway_frame_invalid_json")


if __name__ == "__main__":
    unittest.main()
