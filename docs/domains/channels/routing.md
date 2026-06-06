# Channel Routing

Status: Active
Owner: Platform
Last verified: 2026-06-06
Source of truth: `server_modules/agent_channel_router.py`

## Business/Studio Router

`route_inbound_channel_message()` in `server_modules/agent_channel_router.py`
is the canonical public/deployed-agent ingress path. Its inputs are tenant id,
workspace id, `channel_key`, `endpoint_key`, customer message, optional session
key, message id, actor id/display name, metadata, and master-fallback flags.

The route performs these steps:

1. `assert_inbound_allowed()` validates channel, endpoint, and message before
   owner resolution.
2. `resolve_public_channel_owner()` resolves the deployed agent/specialist
   owner for the channel endpoint.
3. `_enforce_public_deployed_agent_route_decision()` calls the Rust runtime
   kernel and requires `next_action="route_public_deployed_agent"`.
4. `record_inbound_message()` stores the inbound event and computes the inbound
   event id.
5. Duplicate inbound events return `duplicate_ignored_result()` before turn
   execution.
6. Deployment pause, incident state, and daily quota can return branded blocked
   or limited results before execution.
7. The router applies pre-turn context, memory overlay, business plan overlay,
   executes the canonical turn, applies post-turn overlay, records outbound
   result, persists memory snapshot, records activity, and returns a route
   response.

## Outputs

The route response includes channel key, owner metadata, status, reply, run id
or error/limit state, audit ids for inbound/outbound channel events, quota
snapshot/notice where present, and degraded-operation notices when nonfatal
side effects fail. Sources: `server_modules/agent_channel_router.py` and
`server_modules/channel_turn_request_service.py`.

## Sage Versus Studio Selection

This router selects deployed Studio agents. Personal Sage messages do not enter
through `route_inbound_channel_message()`; they enter through
`personal_channels_service.handle_gateway_channel_inbound()` and the Sage
personal-channel bridge.

## Idempotency And Failure Behavior

Business inbound idempotency is based on the recorded inbound event and
`is_duplicate_inbound()`. Personal inbound idempotency is a separate SQLite
unique key on `gateway_id`, `channel_key`, and `external_message_id`. Sources:
`server_modules/channel_event_journal_service.py` and
`server_modules/personal_channels_repository.py`.

Tests in `server_modules/tests/test_agent_channel_router.py` cover successful
dispatch, thread-busy and runtime-cap graceful failures, degraded operations,
unbound endpoint rejection, disabled channel/agent rejection, duplicate inbound
ignore, draining/paused/suspended replies, rate-limited replies, memory overlay,
and health safety overlays.
