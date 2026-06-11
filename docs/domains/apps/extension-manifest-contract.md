# Extension Manifest Contract

## Product Boundary

Extensions are installable adapter packages. They are not agents by default and
they are not allowed to inject arbitrary frontend code.

An extension may provide one or more of these surfaces:

- `messaging_channel`: a place where a person talks to an agent.
- `connected_app`: a work system the agent can read, write, or act inside.
- `tool_provider`: callable tools/actions.
- `runtime_capability`: Agent Computer capability such as a local bridge.
- `external_section`: schema-rendered external-agent section.

Messaging channels, connected apps, and Agent Computer bridges must stay visibly
separate in product UI and permission prompts.

## Manifest Shape

```json
{
  "schema_version": "empyralis.extension.v1",
  "id": "example.signal_cli_bridge",
  "name": "Signal CLI Bridge",
  "version": "0.1.0",
  "provider": "example",
  "extension_kinds": ["messaging_channel", "runtime_capability"],
  "supported_surfaces": ["sage", "agent_computer"],
  "permissions": [
    {
      "id": "channel.signal.personal.outbound",
      "label": "Send Signal messages",
      "risk": "external_send",
      "approval_default": "required"
    }
  ],
  "secrets": [
    {
      "id": "signal_cli_account",
      "storage": "secret_ref",
      "required": false
    }
  ],
  "runtime": {
    "requires_agent_computer": true,
    "local_bridge_contract": {
      "health": "GET /health",
      "send": "POST /messages",
      "events": "GET /events"
    }
  },
  "ui": {
    "sections": [
      {
        "id": "health",
        "title": "Bridge Health",
        "display_kind": "key_value",
        "data_endpoint_ref": "health"
      }
    ]
  }
}
```

## Hard Rules

- Browser never calls third-party or local bridge endpoints directly.
- Raw secrets are stored only as `secret_ref`.
- Extensions cannot grant native Studio-agent privileges.
- Extensions cannot add raw HTML or JavaScript to the product UI.
- Custom UI must use schema-rendered sections first. Rich UI later requires a
  sandboxed iframe with a strict allowlist.
- Messaging channels are audited as conversation ingress/egress.
- Connected apps are audited as work-system reads/writes/actions.
- Agent Computer runtime capabilities are selected explicitly and remain
  revocable.

## Current Implementation Status

- Signal, iMessage, and WeChat are modeled as planned/private Sage personal
  messaging bridge contracts through the selected Agent Computer.
- Signal, iMessage, and WeChat must remain locked until bridge certification
  proves real-account setup, durable inbound replay, outbound approval, health
  reporting, and account lifecycle. WeChat requires a user-owned private/local
  bridge URL and should not be represented as native WeChat automation shipped
  by Empyralis.
- GitHub, Linear, Notion, Dropbox, Amazon S3, SMTP / IMAP, WeChat Work,
  Instagram Business, Gmail, Calendar, Drive, and Microsoft 365 belong to
  Connected Apps, not Personal Messaging.
- Microsoft 365 is live-when-configured in the canonical connection catalog.
- Broad app cards without connector-module proof must not be treated as
  runtime-certified just because the catalog lists them as live-when-configured.
- Webhook remains planned until signed ingress and delivery are first-class.
