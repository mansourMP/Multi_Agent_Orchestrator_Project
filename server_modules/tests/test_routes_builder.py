import unittest
from unittest.mock import patch

from fastapi import HTTPException

from server_modules.routes_builder import (
    BuilderGenerateRequest,
    _parse_workflow_payload,
    builder_connector_manifests,
    builder_generate,
)


class BuilderRouteTests(unittest.IsolatedAsyncioTestCase):
    def test_parse_workflow_payload_returns_canonical_workflow(self):
        payload = _parse_workflow_payload(
            """
            {
              "version": "empyralist.workflow.v2",
              "nodes": [
                {
                  "id": "trigger_1",
                  "type": "trigger",
                  "variant": "manual",
                  "label": "Manual trigger",
                  "subtitle": "Test only",
                  "x": 10,
                  "y": 20
                },
                {
                  "id": "agent_1",
                  "type": "agent",
                  "label": "Triage agent",
                  "subtitle": "Classifies the request",
                  "x": 220,
                  "y": 20,
                  "config": {
                    "identity": {
                      "name": "Triage agent",
                      "goal": "Classify the request"
                    }
                  }
                }
              ],
              "edges": [
                {"source": "trigger_1", "target": "agent_1"}
              ]
            }
            """
        )

        self.assertEqual(payload["version"], "empyralist.workflow.v2")
        self.assertEqual([node["type"] for node in payload["nodes"]], ["trigger", "agent"])
        self.assertEqual(payload["nodes"][0]["variant"], "manual")
        self.assertEqual(payload["nodes"][1]["config"]["identity"]["name"], "Triage agent")
        self.assertEqual(payload["edges"][0]["source"], "trigger_1")

    def test_parse_workflow_payload_rejects_invalid_json(self):
        with self.assertRaises(HTTPException) as ctx:
            _parse_workflow_payload("not-json")
        self.assertEqual(ctx.exception.status_code, 502)

    def test_parse_workflow_payload_accepts_file_watch_as_draft_schema(self):
        payload = _parse_workflow_payload(
            """
            {
              "nodes": [
                {
                  "id": "trigger_1",
                  "type": "trigger",
                  "variant": "file_watch"
                }
              ],
              "edges": []
            }
            """
        )
        self.assertEqual(payload["nodes"][0]["variant"], "file_watch")
        self.assertTrue(
            any(issue.get("code") == "file_watch_not_executable_yet" for issue in payload.get("issues", []))
        )

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
                  "version": "empyralist.workflow.v2",
                  "nodes": [
                    {
                      "id": "trigger_1",
                      "type": "trigger",
                      "variant": "schedule",
                      "label": "Daily trigger",
                      "subtitle": "Runs each morning",
                      "x": 100,
                      "y": 100
                    },
                    {
                      "id": "agent_1",
                      "type": "agent",
                      "label": "Planner",
                      "subtitle": "Plans the next move",
                      "x": 320,
                      "y": 100,
                      "config": {
                        "identity": {
                          "name": "Planner",
                          "goal": "Plan the next move"
                        }
                      }
                    }
                  ],
                  "edges": [{"source": "trigger_1", "target": "agent_1"}]
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
        self.assertEqual(result["workflow"]["nodes"][0]["variant"], "schedule")
        self.assertEqual(result["workflow"]["nodes"][1]["config"]["identity"]["name"], "Planner")
        self.assertEqual(result["workflow"]["edges"][0]["source"], "trigger_1")

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

    async def test_builder_connector_manifests_returns_seed_connectors(self):
        payload = await builder_connector_manifests()
        self.assertIn("items", payload)
        manifest_ids = {item["id"] for item in payload["items"]}
        self.assertIn("google_workspace", manifest_ids)
        self.assertIn("telegram_bot", manifest_ids)
        self.assertIn("custom_api", manifest_ids)


if __name__ == "__main__":
    unittest.main()
