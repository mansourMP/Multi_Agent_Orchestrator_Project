# Web Chat Channel Audit

## Status

Web Chat (`channel_key = "web_chat"`) has lower-level routing references in the
Empyralis codebase, but it is **not** a launch-ready first-class channel today.
The canonical connection catalog marks Web Chat as planned until widget setup,
runtime proof, ingress durability, and UI launch flow are complete.

## Evidence

| File | Evidence |
|------|----------|
| `channel_identity_service.py:7` | `SUPPORTED_CHANNEL_KEYS` includes `web_chat` |
| `channel_identity_service.py:15-17` | `"web"`, `"webchat"`, `"chat"` aliases map to `web_chat` |
| `channel_identity_service.py:24` | Special case: empty channel_key defaults to web_chat |
| `agent_registry_api.py:262` | `channel_key: Literal["telegram", "whatsapp", "email", "phone", "web_chat"]` |
| `agent_manifest.py:20` | `web_chat: bool = True` in agent manifest |
| `studio_proof_agent_seed_service.py` | Web Chat enabled by default for all seeded agents |
| `channel_surface_contract_service.py:46` | `web_chat` uses lightweight approvals |

## Coverage

| Gate | Status | Notes |
|------|--------|-------|
| Sage support | Planned | Lower-level generic routing references exist, but Sage launch flow is not first-class |
| Studio Agent support | Planned | Seeding/default references are not enough to mark the channel live |
| channel_key | Present | `web_chat` is recognized by lower-level code |
| trace_id | Partial | Generic routing can carry trace context, but widget ingress proof is missing |
| memory policy | Partial | Deployed-agent memory can apply after routing, but channel ingress is not launch-ready |
| quota | Partial | Generic quota paths exist after routing |
| audit/activity | Partial | Generic activity paths exist after routing |
| kill switch | Partial | Agent-level kill switch can apply after routing |
| approval | Partial | Lightweight approval references exist, but launch flow is not complete |

## Recommendation

Do not expose Web Chat as live from UI copy or catalog truth yet. Its
`channel_key` is recognized by some lower-level code, but the product channel
still needs:

- first-class widget setup
- signed/durable ingress
- idempotent inbound event handling
- outbox-backed delivery
- launch checklist and health state
- end-to-end tests from widget message to agent reply

**Next phase:** keep Web Chat in the Studio/business channel lane and implement
the missing launch proof before changing `launch_status` from planned.
