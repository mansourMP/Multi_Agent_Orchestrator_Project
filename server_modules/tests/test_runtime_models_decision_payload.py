import unittest

from fastapi import HTTPException

from server_modules.runtime_models import DecisionPayload


class DecisionPayloadTests(unittest.TestCase):
    def test_accepts_scope_and_note(self):
        payload = DecisionPayload(decision="Proceed", scope="workflow", note="Allow for this workflow")
        payload.validate_fields()
        self.assertEqual(payload.scope, "workflow")
        self.assertEqual(payload.note, "Allow for this workflow")

    def test_normalizes_scope_case(self):
        payload = DecisionPayload(decision="Proceed", scope="Agent")
        payload.validate_fields()
        self.assertEqual(payload.scope, "agent")

    def test_rejects_invalid_scope(self):
        payload = DecisionPayload(decision="Proceed", scope="global")
        with self.assertRaises(HTTPException) as ctx:
            payload.validate_fields()
        self.assertEqual(ctx.exception.status_code, 400)


if __name__ == "__main__":
    unittest.main()
