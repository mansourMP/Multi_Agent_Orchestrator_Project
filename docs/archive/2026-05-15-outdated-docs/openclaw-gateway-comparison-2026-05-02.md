# OpenClaw Gateway Comparison And Empyralis Direction

Last reviewed: 2026-05-02
Reference checkout: `/private/tmp/openclaw-review-0502`

## Verdict

OpenClaw validates the Empyralis gateway direction. The winning pattern is not
official WhatsApp Cloud API as the default, and not pure visual remote desktop.
The winning pattern is:

1. A long-running local gateway owns user-local sessions and device tools.
2. The cloud brain owns identity, orchestration, policy, billing, memory, and UI.
3. The phone/web app is the command center.
4. Visual screenshots/artifacts are the transparency layer, not the primary
   execution mechanism.

Empyralis already has the foundation for this:

- `empyralis-gateway/src/index.ts`
- `empyralis-gateway/src/cloud/ws-client.ts`
- `empyralis-gateway/src/supervisor/capability-router.ts`
- `empyralis-gateway/src/channels/whatsapp/runtime.ts`
- `empyralis-gateway/src/channels/telegram/runtime.ts`
- `server_modules/routes_gateway.py`
- `server_modules/routes_personal_channels.py`
- `server_modules/personal_channels_service.py`
- `server_modules/gateway_execution_service.py`
- `server_modules/gateway_approval_service.py`

The remaining work is setup UX, channel hardening, visibility, and launch
certification.

## What OpenClaw Does That Matters

OpenClaw's docs and code show these useful patterns:

- One gateway per host owns channel connections and the WebSocket control plane.
- WhatsApp is implemented through WhatsApp Web/Baileys, with QR/pairing and a
  persistent linked session.
- Telegram is implemented as a bot channel with pairing/allowlist controls.
- Gateway methods are scoped by operator permissions, for example read, write,
  approvals, pairing, and admin.
- Local `system.run` cannot bypass approval by smuggling approval fields; the
  gateway validates approval records and strips unsafe control fields.
- Channel plugins expose pairing, outbound delivery, directory/status, group
  policy, approval capabilities, and heartbeat readiness.
- The gateway owns channel lifecycle and reconnect, not the app UI.
- Mobile is a command/control node; it does not host the gateway.
- Visual transparency is layered on top through status/events/screenshots, not
  by relying on pixel-click remote desktop as the only automation method.

## What Empyralis Should Copy Architecturally

Copy the architecture, not the code:

- Local gateway as the persistent device edge.
- Channel runtimes behind the gateway.
- Capability manifests for every exposed local/channel action.
- Pairing and revocation as cloud-owned control-plane actions.
- Scoped approvals for risky local actions.
- Idempotent outbound message delivery.
- Channel state surfaced in the cloud UI.
- Audit events for every local/channel action.
- Phone-visible progress rows and screenshots/artifacts.

## What Empyralis Should Not Copy

- Do not make the local gateway the product brain.
- Do not make users configure raw gateway/WSS concepts.
- Do not make official WhatsApp Cloud API the default personal path.
- Do not make pure remote desktop the primary execution layer.
- Do not store proprietary provider/billing logic in the local companion.
- Do not promise Windows/Linux parity until each companion build is certified.

## WhatsApp Strategy

Use two lanes:

### Personal WhatsApp

Default personal path:

- Gateway runs on the user's own Mac/PC.
- User links WhatsApp Web by QR/pairing.
- Gateway owns the local WhatsApp Web session.
- Sage can read/respond/send through that user-owned session.
- Every send is audited.
- External sends require approval unless the user explicitly enables Full Access
  for that local companion.

This avoids official WhatsApp Cloud API cost, but it is less operationally
stable than the official business API. Present it as "personal device channel",
not enterprise messaging infrastructure.

### Business WhatsApp

Paid B2B path:

- Official WhatsApp Business Cloud API.
- Business pays for reliability/compliance.
- Studio agents use this lane for customer service.

## Closed Source Reality

Empyralis can ship a closed-source local companion/gateway. Users do not receive
source code.

However, any shipped binary can be inspected or reverse engineered. Therefore:

- Keep crown-jewel orchestration, billing, marketplace, provider routing, and
  policy logic in the cloud.
- Keep the local gateway generic: execute declared tools, manage local channel
  sessions, stream audit events, and route supervisor calls.
- Sign the companion and enforce server-side revocation.
- Never embed platform provider keys or billing secrets in the companion.

## Permission Model For Launch

Keep only two visible modes:

1. `Default`
   - Safe tools and reads.
   - Risky writes/sends/shell/device-control require approval.

2. `Full Access`
   - Local companion only.
   - Broad local automation on the user's own paired device.
   - Still audited.
   - Still blocks or explicitly confirms irreversible/external high-risk
     actions such as purchases, mass deletion, or customer messaging.

Do not expose four modes in launch UI. Internally, keep richer policy states if
needed, but normal users should see two.

## Empyralis Next Build Order

### Phase 1: Gateway Connect UX

Add a clear `Connect this computer` path in Integrations:

- Show device status: Offline, Online, Degraded, Supervisor unhealthy.
- Show one terminal command first.
- Later: Tauri/tray app wrapper.
- Never expose WSS jargon to normal users.

Exit gate: a non-developer understands how to pair a Mac.

### Phase 2: Channel Setup UX

Expose gateway-backed channel setup:

- WhatsApp: QR/pairing state, linked account, reconnect state, revoke.
- Telegram: bot/local account setup, linked account, send test, revoke.
- Show whether the channel is local-gateway backed or cloud/business API backed.

Exit gate: user understands "this channel works through this computer".

### Phase 3: Capability Truth

Sage must answer capability questions from backend truth:

- Hosted cloud tools.
- Gateway local tools.
- Connected channels.
- Offline/degraded states.

Exit gate: "What can you do?" never hallucinates tools and never says "I can't"
when the real answer is "connect this computer first".

### Phase 4: Transparency Cells

Render inline cells for:

- Searching web.
- Reading file.
- Running shell.
- Using browser.
- Using WhatsApp.
- Sending Telegram.
- Waiting for approval.
- Screenshot/artifact.

Exit gate: user can see what Sage did without reading logs.

### Phase 5: Phone Control Surface

Phone web must show:

- Cloud / This Mac / Gateway offline.
- Connected device.
- Connected channels.
- Approvals.
- Tool rows.
- Screenshots/artifacts.
- Stop button.
- Revoke device.

Exit gate: user can command Sage from phone while the Mac gateway does the local
work.

### Phase 6: Local Channel Cert

Run real live checks:

- Phone -> Sage -> gateway -> list local file -> reply in phone chat.
- Phone -> Sage -> gateway -> send Telegram message -> audited result.
- Phone -> Sage -> gateway -> WhatsApp QR link/status -> audited result.
- Gateway offline -> local tools/channels disabled, cloud chat still works.

Exit gate: local gateway power is demonstrable and safe enough for beta.

## Final Product Positioning

Empyralis should ship as:

- Web/phone first.
- Hosted credits by default.
- BYOK for power users.
- Optional local gateway for personal device power.
- Studio agents for B2B specialists.
- Marketplace for governed templates/tools/providers/mini-apps.
- Cloud Computer later as paid hosted runtime when the user's Mac is offline.

The local gateway is the moat. The phone is the command center. The cloud brain
is the product.
