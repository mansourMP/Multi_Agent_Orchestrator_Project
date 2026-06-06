# Connected External Agents Contract

Connected External Agents are provider-neutral Studio objects. The platform owns the connection, trust state, auth reference, proxying, and visibility. The external runtime owns the model, tools, memory, knowledge, nodes, channels, logs, artifacts, workflows, and any provider-specific behavior it declares.

## Studio Object Types

- `native_studio_agent`: platform-owned brain with writable native builder tabs.
- `connected_external_agent`: external-owned brain connected through a manifest and backend proxy.
- `agent_computer`: runtime or machine resource, not a chat agent by default.
- `agent_group_reserved`: future orchestration boundary.

Provider names such as OpenClaw, NemoClaw, Hermes, A2A, MCP, laptop-local agents, and custom HTTP are adapter or protocol presets behind `connected_external_agent`.

## Manifest Shape

```json
{
  "schema_version": "studio.external_agent.v1",
  "provider_kind": "custom",
  "protocols": [
    { "kind": "custom_http", "version": "1" }
  ],
  "capabilities": ["chat", "events", "artifacts", "sub_agents"],
  "endpoints": {
    "manifest": "https://agent.example.com/.well-known/agent-manifest.json",
    "chat": "https://agent.example.com/chat",
    "events": "https://agent.example.com/events",
    "artifacts": "https://agent.example.com/artifacts",
    "sub_agents": "https://agent.example.com/sub-agents"
  },
  "local_connector": {
    "required": false,
    "mode": "none",
    "reason": null,
    "agent_computer_id": null,
    "agent_computer_capability": null,
    "binding_state": "not_required",
    "bound": false,
    "proxy_available": false
  },
  "surface_sections": [
    {
      "id": "agent_logs",
      "title": "Agent Logs",
      "description": "Recent events from the external runtime.",
      "empty_state": "No events are reported yet.",
      "category": "activity",
      "priority": 50,
      "icon": "logs",
      "capability_required": "events",
      "data_endpoint_ref": "events",
      "actions_endpoint_ref": null,
      "display_kind": "logs"
    }
  ],
  "objects": ["external_agent_event", "external_agent_artifact", "external_agent_sub_agent"]
}
```

Provider-owned child agents can also be declared as a small manifest summary so
Studio can render the left trail before fetching the full `sub_agents` section.
This applies equally to OpenClaw, Hermes, NemoClaw, A2A, MCP, and custom HTTPS
connections:

```json
{
  "sub_agents": [
    {
      "id": "researcher",
      "name": "Research worker",
      "status": "ready",
      "summary": "Handles web research inside the external runtime.",
      "capabilities": ["chat", "knowledge_read"]
    }
  ]
}
```

These children remain external-owned. They are not native Studio agents and do
not inherit native Agent Computer execution. The connected-provider root can be
shown as `OpenClaw Agents`, `Hermes Agents`, `NemoClaw Agents`, or a custom
connection name, with child rows nested underneath.

## Security Rules

- The browser never calls external endpoints directly.
- Backend proxy resolves `secret_ref` only for outbound calls.
- Raw secrets are rejected from manifests and endpoint metadata.
- Raw localhost, private IP, and private DNS endpoints are blocked unless a future Agent Computer/local connector path is used.
- Manifest claims are untrusted until refresh and health verification succeed.
- Surface sections are schema-rendered by known Studio components. Arbitrary HTML or JavaScript is not allowed.
- Public/customer send remains disabled for connected external agents.

## Local Connector Binding

`local_connector` describes a future Agent Computer/private endpoint route. It is
binding metadata, not a direct browser or backend raw-localhost exception.

When `required` is `true`, the backend resolves `agent_computer_id` against the
workspace runtime attachment inventory and records a fail-closed `binding_state`.
Supported states are:

- `not_required`
- `missing_agent_computer`
- `not_found`
- `bound`
- `offline`
- `unhealthy`
- `revoked`
- `unapproved`
- `missing_capability`
- `scope_mismatch`
- `unsupported_attachment_kind`
- `unavailable`

`bound` means Studio found a matching verified local companion or self-hosted
Agent Computer. It does not mean private proxying is enabled. In this pass,
`proxy_available` remains `false`, and chat or section-data calls for
local-connector-required agents fail closed until the Agent Computer relay is
implemented.

## Surface Sections

`surface_sections` let providers expose safe Studio sections without custom frontend code.

Required fields:

- `id`
- `title`
- `display_kind`
- `data_endpoint_ref`

Optional fields:

- `icon`
- `capability_required`
- `description`
- `empty_state`
- `category`
- `priority`
- `actions_endpoint_ref`

Studio renders every declared section as read-only in this pass. `actions_endpoint_ref`
may be stored as future contract metadata, but the frontend does not call it and the
backend does not expose a section action route until approval, audit, and revoke
semantics are implemented.

Supported `category` values:

- `activity`
- `resources`
- `configuration`
- `outputs`
- `security`

Supported `display_kind` values:

- `table`
- `cards`
- `logs`
- `timeline`
- `key_value`
- `artifact_list`
- `approval_queue` (read-only queue display only)

Section endpoint responses must be JSON objects. List-like displays should return:

```json
{
  "display_kind": "timeline",
  "object_type": "external_agent_event",
  "items": [
    {
      "id": "evt-1",
      "title": "Run finished",
      "status": "ok",
      "summary": "The external agent completed the workflow."
    }
  ]
}
```

Studio normalizes returned records as external-owned objects. They do not become native Studio agents, native tools, native memory items, or native deployed-agent conversations.

## Provider-Owned Examples

External sub-agents:

```json
{
  "id": "sub_agents",
  "title": "Sub-agents",
  "description": "Workers managed by this external runtime.",
  "category": "resources",
  "capability_required": "sub_agents",
  "data_endpoint_ref": "sub_agents",
  "display_kind": "cards"
}
```

Hermes-style skills:

```json
{
  "id": "hermes_skills",
  "title": "Hermes Skills",
  "category": "configuration",
  "capability_required": "skills",
  "data_endpoint_ref": "skills",
  "display_kind": "table"
}
```

OpenClaw-style nodes:

```json
{
  "id": "openclaw_nodes",
  "title": "OpenClaw Nodes",
  "category": "resources",
  "capability_required": "nodes",
  "data_endpoint_ref": "nodes",
  "display_kind": "cards"
}
```

MCP tools:

```json
{
  "id": "mcp_tools",
  "title": "MCP Tools",
  "category": "configuration",
  "capability_required": "mcp",
  "data_endpoint_ref": "mcp",
  "display_kind": "table"
}
```

Generated artifacts and run history:

```json
[
  {
    "id": "generated_artifacts",
    "title": "Generated Artifacts",
    "category": "outputs",
    "capability_required": "artifacts",
    "data_endpoint_ref": "artifacts",
    "display_kind": "artifact_list"
  },
  {
    "id": "run_history",
    "title": "Run History",
    "category": "activity",
    "capability_required": "events",
    "data_endpoint_ref": "events",
    "display_kind": "timeline"
  }
]
```

All records returned by these sections remain external-owned display objects. They do not become native Studio agents, native tools, native memory items, or native deployed-agent conversations.
