# Personal Vs Studio Channel Model

Last verified: 2026-04-22
Phase: 0
Status: Frozen boundary with implemented lane split

This document freezes the boundary between:
- personal channels owned by the local gateway
- Studio/business channels owned by the cloud connector stack

This distinction is mandatory.
Without it, Empyralis will keep mixing personal local-runtime work with
business webhook infrastructure.

## Two Different Channel Families

| Dimension | Personal channel lane | Studio/business channel lane |
| --- | --- | --- |
| Primary owner | End user on their own device | Workspace/business deployment |
| Canonical process owner | `empyralis-gateway` | `server_modules/connectors/*` |
| Session location | Local device | Cloud control plane / provider-managed webhook integration |
| Auth material | Personal session files / local login state | API keys, bot tokens, webhook secrets, business connector credentials |
| Ingress model | Local session event enters gateway first | Public/provider webhook or cloud polling path |
| Example targets | WhatsApp personal, Telegram personal, Signal, iMessage, WeChat, local browser/app acting as the user | Telegram bot, Twilio WhatsApp, Slack, Discord, GitHub, Notion, Linear, email, phone |
| Delivery expectation | Feels like the user is acting from their own account | Business/deployed-agent messaging and support flows |
| Failure mode | Device offline or local gateway offline | Cloud connector/webhook/provider offline |

## Frozen Rules

### 1. Personal Channels Terminate At `empyralis-gateway`

If the channel is a personal account session, the first runtime owner must be
the local gateway.

That means:
- personal channel auth/session files live on the device
- reconnect logic lives in the local gateway
- inbound personal messages enter the cloud through the gateway protocol

### 2. Studio/Business Channels Stay In The Connector Stack

Business/API-managed channels remain in:
- `server_modules/connectors/*`
- `server_modules/routes_connectors.py`
- related webhook / poll / outbox services

The existing cloud connector lane remains the right place for:
- Telegram bot / webhook products
- Twilio WhatsApp
- Slack / Discord / GitHub / Notion / Linear / email / phone integrations
- Connected app integrations such as Dropbox, Amazon S3, SMTP / IMAP, WeChat Work, and Instagram Business

### 3. Shared Lower Engine Does Not Remove The Boundary

Both lanes may eventually converge on lower contracts such as:
- canonical run creation
- activity timeline
- approvals
- artifact delivery

That does **not** make them one ingress system.

They still differ in:
- session ownership
- auth material
- reconnect model
- operator expectations
- failure and privacy boundaries

### 4. Twilio WhatsApp Is Not Personal WhatsApp

Cloud webhook WhatsApp support is not a substitute for:
- personal WhatsApp session ownership
- local QR/session state
- local reconnect and device presence

The same warning applies to Telegram bot API vs Telegram personal MTProto.

### 5. Personal Channel Sessions Must Not Depend On The Studio Webhook Stack

Personal channels must not be implemented by stuffing more behavior into:
- `routes_connectors.py`
- existing Telegram/WhatsApp webhook bridge stacks
- business connector registries

They need a dedicated local lane behind `empyralis-gateway`.

## Current Repo Mapping

### What Already Exists

Cloud/business lane already exists through:
- `server_modules/routes_connectors.py`
- `server_modules/connectors/telegram_*`
- `server_modules/connectors/whatsapp_*`
- `server_modules/connectors/slack_*`
- `server_modules/connectors/discord_*`

Local capability execution already exists through:
- `empyralis-supervisor`
- `server_modules/supervisor_client.py`

Implemented personal-gateway lane now exists through:
- `empyralis-gateway/src/channels/whatsapp/*`
- `empyralis-gateway/src/channels/telegram/*`
- `empyralis-gateway/src/channels/local-bridge-runtime.ts`
- `empyralis-gateway/src/bridges/bluebubbles-bridge.ts`
- `server_modules/routes_personal_channels.py`
- `server_modules/channel_lane_contract_service.py`

Current implemented personal lane truth:
- personal WhatsApp uses the gateway lane with local session state and
  reconnect ownership
- personal Telegram uses the gateway lane with local session state and reconnect
  ownership
- Signal, iMessage, and WeChat use the Agent Computer local-bridge contract and
  are live when their selected gateway bridge is configured
- the gateway publishes inbound personal messages into cloud through the gateway
  protocol
- outbound personal replies route back through the same gateway control plane

### What Still Needs Productization

The repo still needs:
- richer operator UX for pairing, QR/login, doctor, approvals, and resume
- live certification against real personal accounts and reconnect scenarios
- stronger browser-session fidelity for “existing session attach” mode

The current `local_companion` concept is only a partial local-runtime substrate.
The implemented gateway is the forward path that should replace the remaining
`local_companion` assumptions rather than coexist as a second model.

## Memory, Approval, And Policy Boundary

### Personal lane

Default expectations:
- more local/privacy-sensitive
- device-aware availability
- stronger need for local approvals and checkpointing
- personal session data remains local unless policy explicitly allows otherwise

### Studio/business lane

Default expectations:
- cloud-managed availability
- workspace/business memory and deployment policy
- provider/API-managed auth and transport
- no assumption of one specific local device being online

## Migration Rule

Future work must follow this order:

1. freeze the architecture and protocol
2. build `empyralis-gateway`
3. route the supervisor behind the gateway
4. add personal channels to the gateway lane

Current repo truth:
- steps 1 through 4 now have implemented baseline code paths
- future work should focus on productization, live proof, and operator surfaces

Do **not** solve the absence of personal channels by adding more behavior to the
Studio connector stack.

## Frozen Rebuild Boundary

This Phase 0 document freezes only the channel-family boundary.
It does not implement:
- the gateway
- WhatsApp personal
- Telegram personal
- Studio connector rewrites

Those items were later implementation goals. The live repo now contains
baseline gateway and personal-channel implementations, but this document still
exists to freeze the boundary and prevent architecture drift.
