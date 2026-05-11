# Web Chat Channel Audit

## Status

Web Chat (`channel_key = "web_chat"`) already exists in the Empyralis codebase.
It is not a new channel to implement — it is a formalization task.

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
| Sage support | YES | Via agent_channel_router (generic) |
| Studio Agent support | YES | Seeded with `default_enabled: True` |
| channel_key | YES | `web_chat` |
| trace_id | YES | Via agent_channel_router |
| memory policy | YES | Via deployed agent memory |
| quota | YES | Via daily limit checks |
| audit/activity | YES | Via channel_activity_service |
| kill switch | YES | Agent-level kill switch |
| approval | YES | Lightweight via channel_surface_contract_service |

## Recommendation

Web Chat needs no new implementation. Its channel_key is already recognized by:
- Agent routing
- Memory policy
- Quota enforcement
- Audit/activity
- Kill switch

The formalization task is metadata only: add `web_chat` to `PERSONAL_CHANNEL_SPECS`
or `STUDIO_CHANNEL_ROADMAP` depending on whether it should be a personal gateway
channel or a studio-only channel. Currently it appears to be studio-only (it uses
the deployed-agent route, not the gateway personal-channel route).

**Next phase:** Decide whether `web_chat` should also be available as a Sage
personal channel. If yes, add it to `PERSONAL_CHANNEL_SPECS`. If no, document it
as studio-only and close this task.
