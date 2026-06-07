# Gateway Protocol

Last verified: 2026-06-07
Status: Live protocol contract with implemented baseline message families

This document freezes the cloud `<->` local gateway control-plane protocol for
`empyralis-gateway`.

The goal is one explicit protocol for:
- pairing-backed session establishment
- heartbeat and presence
- local runtime control
- personal-channel routing

## Transport

The canonical transport is:
- one outbound `wss://` connection from `empyralis-gateway` to cloud
- initiated by the local gateway
- authenticated with a revocable gateway/device session token

The cloud does not open inbound sockets to the device.

## Scope And Identity

Every live gateway session is bound to this identity tuple:
- `tenant_id`
- `workspace_id`
- `user_id`
- `device_id`
- `gateway_id`

Every accepted frame is scoped to that tuple.
The protocol must not create a second runtime-only auth plane.

## Envelope

All control-plane frames are JSON objects.

### Request

```json
{
  "kind": "request",
  "id": "req_123",
  "type": "gateway.connect",
  "ts": "2026-04-22T12:00:00Z",
  "scope": {
    "tenant_id": "tenant_1",
    "workspace_id": "ws_1",
    "user_id": "user_1",
    "device_id": "device_1",
    "gateway_id": "gateway_1"
  },
  "payload": {}
}
```

### Response

```json
{
  "kind": "response",
  "id": "req_123",
  "ok": true,
  "ts": "2026-04-22T12:00:01Z",
  "payload": {}
}
```

### Event

```json
{
  "kind": "event",
  "type": "gateway.presence",
  "seq": 42,
  "ack": 41,
  "ts": "2026-04-22T12:00:02Z",
  "scope": {
    "tenant_id": "tenant_1",
    "workspace_id": "ws_1",
    "user_id": "user_1",
    "device_id": "device_1",
    "gateway_id": "gateway_1"
  },
  "payload": {}
}
```

## Implemented Baseline Message Types

The implemented baseline includes these types:
- `gateway.connect`
- `gateway.hello`
- `gateway.heartbeat`
- `gateway.presence`
- `gateway.disconnect`
- `gateway.state.update`

### `gateway.connect`

Direction:
- gateway -> cloud

Purpose:
- start a live gateway session after pairing/registration

Minimum payload:
- gateway version
- device metadata
- requested capabilities summary
- pairing/session token proof
- last known local journal/checkpoint cursor if present

### `gateway.hello`

Direction:
- cloud -> gateway

Purpose:
- acknowledge accepted session
- confirm canonical scope
- return cloud session metadata

Minimum payload:
- accepted identity tuple
- session id
- heartbeat interval
- server capability flags
- server time / protocol version

### `gateway.heartbeat`

Direction:
- gateway -> cloud

Purpose:
- keep session live
- report health

Minimum payload:
- health state (`online`, `degraded`, `draining`)
- last local journal cursor
- local queue depth summary
- capability readiness summary

### `gateway.presence`

Direction:
- either direction as an event

Purpose:
- broadcast material state changes that matter to routing

Examples:
- gateway online
- gateway degraded
- local supervisor unavailable
- personal channel connected/disconnected

### `gateway.disconnect`

Direction:
- either direction

Purpose:
- explicit shutdown, revoke, or session end signal

Minimum payload:
- reason code
- retryable vs non-retryable flag

### `gateway.state.update`

Direction:
- gateway -> cloud

Purpose:
- publish non-heartbeat state changes that should be durable

Examples:
- local capability inventory changed
- checkpoint advanced
- personal channel status changed
- journal/outbox recovery completed

## Implemented Extended Families

These families are already implemented on top of the same protocol instead of
using side channels:
- `tool.invoke`
- `tool.interrupt`
- `channel.inbound`
- `channel.outbound`

Current repo truth:
- gateway tool execution and interrupts flow through `tool.invoke` and
  `tool.interrupt`
- inbound personal-channel delivery flows through `channel.inbound`
- outbound personal-channel delivery flows through `channel.outbound`

## Reserved Extension Families

These still remain reserved so later phases reuse one protocol instead of
inventing side channels:
- `tool.result`
- `approval.request`
- `approval.result`
- `checkpoint.update`
- `channel.outbound.result`

These names remain reserved so future payload work extends the same transport
model instead of inventing side channels.

## Session And Pairing Model

The canonical flow is:

1. user authenticates through the normal Empyralis account/workspace flow
2. cloud issues a pairing grant for one `workspace_id` and one `user_id`
3. gateway registers `device_id` and `gateway_id`
4. gateway opens the outbound WSS connection
5. gateway sends `gateway.connect`
6. cloud validates token + scope + revocation state
7. cloud responds and emits `gateway.hello`

Revocation must invalidate future reconnects.

This flow is now backed by the live registration/session routes and the gateway
WSS client implementation in the repo.

## Ordering, Replay, And Idempotency

The protocol is durable but not magical.
It must assume disconnects and replay.

Frozen rules:
- every event after session establishment carries a monotonically increasing
  `seq`
- the peer may include `ack` for the highest durably processed sequence
- replay is allowed from the last durable ack point
- handlers must be idempotent
- duplicate delivery prevention belongs in the journal/outbox contract, not in
  wishful thinking

## Security Rules

- all sessions are tied to the primary tenant/workspace/user model
- gateway tokens are revocable and time-bounded
- the cloud must reject mismatched `tenant_id`, `workspace_id`, `user_id`,
  `device_id`, or `gateway_id`
- the protocol may not downgrade into anonymous local runtime trust
- sensitive personal channel auth material stays on the local device unless an
  explicit later policy says otherwise

## Explicit Non-Goals

This protocol document does **not** define:
- personal channel provider payload schemas
- mini-app bridge messages
- marketplace distribution messages
- internal supervisor HTTP schema

Those are separate contracts owned by their runtime surfaces.
