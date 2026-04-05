import unittest

from server_modules import direct_chat_stream_transport_service


class DirectChatStreamTransportServiceTests(unittest.TestCase):
    def test_normalize_chat_stream_cursor_defaults_invalid_values_to_zero(self):
        self.assertEqual(direct_chat_stream_transport_service.normalize_chat_stream_cursor(None), 0)
        self.assertEqual(direct_chat_stream_transport_service.normalize_chat_stream_cursor(""), 0)
        self.assertEqual(direct_chat_stream_transport_service.normalize_chat_stream_cursor("abc"), 0)
        self.assertEqual(direct_chat_stream_transport_service.normalize_chat_stream_cursor("-5"), 0)
        self.assertEqual(direct_chat_stream_transport_service.normalize_chat_stream_cursor("7"), 7)


if __name__ == "__main__":
    unittest.main()
