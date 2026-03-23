import unittest
from unittest.mock import patch

from fastapi import HTTPException

from server_modules.routes_builder import BuilderGenerateRequest, _parse_workflow_payload, builder_generate


class BuilderRouteTests(unittest.IsolatedAsyncioTestCase):
    def test_parse_workflow_payload_normalizes_aliases(self):
        payload = _parse_workflow_payload(
            """
            {
              "nodes": [
                {"id": "1", "type": "start", "label": "Start", "x": 10, "y": 20},
                {"id": "2", "type": "tool", "label": "Lookup", "subtitle": "Tool step", "x": 220, "y": 20},
                {"id": "3", "type": "end", "label": "Done", "x": 430, "y": 20}
              ],
              "edges": [
                {"source": "1", "target": "2"},
                {"source": "2", "target": "3"}
              ]
            }
            """
        )

        self.assertEqual(
            [node["type"] for node in payload["nodes"]],
            ["trigger", "http_request", "action"],
        )
        self.assertEqual(payload["edges"], [{"source": "1", "target": "2"}, {"source": "2", "target": "3"}])

    def test_parse_workflow_payload_rejects_invalid_json(self):
        with self.assertRaises(HTTPException) as ctx:
            _parse_workflow_payload("not-json")
        self.assertEqual(ctx.exception.status_code, 502)

    async def test_builder_generate_returns_parsed_workflow(self):
        with (
            patch("server_modules.routes_builder.resolve_call_credentials") as resolve_mock,
            patch("server_modules.routes_builder.call_model") as call_model_mock,
        ):
            resolve_mock.return_value = {
                "provider": "openai",
                "model": "gpt-4o-mini",
                "credentials": {"api_key": "test-key"},
            }
            call_model_mock.return_value = {
                "content": """
                {
                  "nodes": [
                    {"id": "1", "type": "trigger", "label": "Start", "subtitle": "Manual", "x": 100, "y": 100},
                    {"id": "2", "type": "agent", "label": "Agent", "subtitle": "Worker", "x": 320, "y": 100}
                  ],
                  "edges": [{"source": "1", "target": "2"}]
                }
                """,
                "usage": {"prompt_tokens": 11, "completion_tokens": 22, "total_tokens": 33},
                "model": "gpt-4o-mini",
                "provider": "openai",
            }

            result = await builder_generate(
                BuilderGenerateRequest(prompt="Build me a workflow", model="gpt-4o-mini", workspace_id="default")
            )

        self.assertEqual(result["provider"], "openai")
        self.assertEqual(result["model"], "gpt-4o-mini")
        self.assertEqual(result["usage"]["total_tokens"], 33)
        self.assertEqual(len(result["workflow"]["nodes"]), 2)
        self.assertEqual(result["workflow"]["edges"], [{"source": "1", "target": "2"}])

    async def test_builder_generate_rejects_empty_prompt(self):
        with self.assertRaises(HTTPException) as ctx:
            await builder_generate(BuilderGenerateRequest(prompt="   "))
        self.assertEqual(ctx.exception.status_code, 400)

    async def test_builder_generate_rejects_invalid_model_output(self):
        with (
            patch("server_modules.routes_builder.resolve_call_credentials") as resolve_mock,
            patch("server_modules.routes_builder.call_model") as call_model_mock,
        ):
            resolve_mock.return_value = {
                "provider": "openai",
                "model": "gpt-4o-mini",
                "credentials": {"api_key": "test-key"},
            }
            call_model_mock.return_value = {
                "content": "not valid json",
                "usage": {"prompt_tokens": 1, "completion_tokens": 1, "total_tokens": 2},
                "model": "gpt-4o-mini",
                "provider": "openai",
            }

            with self.assertRaises(HTTPException) as ctx:
                await builder_generate(BuilderGenerateRequest(prompt="Build me a workflow"))

        self.assertEqual(ctx.exception.status_code, 502)


if __name__ == "__main__":
    unittest.main()
