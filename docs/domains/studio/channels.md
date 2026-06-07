# Studio Channels

Status: Active
Owner: Platform
Last verified: 2026-06-06
Source of truth: connector and channel code

## Business Channel Boundary

Studio business/customer channels are stored on deployed-agent channel config and are evaluated separately from Sage personal local-gateway channels. Public routing is blocked for non-public states and only `live`, `paused`, or `suspended` are considered publicly routable. Source: `server_modules/deployed_agent_service.py`.

Telegram is the only inspected business channel with full launch-readiness logic. The readiness helper checks webhook status, enabled channel binding, selected Telegram connector, inbound ownership, endpoint key, and selected tool scope. Saving an enabled Telegram binding enriches it with connector id, credential id, endpoint key, inbound ownership, webhook path, bot username, and delivery mode. Source: `server_modules/deployed_agent_service.py`.

The integrations UI exposes Telegram as one channel card with Bot and Personal setup modes. Bot is the cloud/business connector lane; Personal is the selected Agent Computer lane. The same UI keeps personal WhatsApp on Agent Computer and keeps Signal, iMessage, and WeChat disabled until local bridge runtimes are certified. Source: `frontend/lib/workspace/workstation-sage-connectors-pane.tsx`.

WhatsApp for Studio is intentionally unavailable in the inspected code: `_STUDIO_WHATSAPP_STATUS` reports `available: false`, `status: out_of_scope`, and says the Studio beta launches Telegram specialists only. Source: `server_modules/deployed_agent_service.py`.

Not implemented in the inspected code: Slack, Discord, Twilio WhatsApp, email, and generic webhook live-readiness gates equivalent to Telegram.
