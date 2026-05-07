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


if __name__ == "__main__":
    unittest.main()
