# Platform Glossary

Status: Active
Owner: Platform
Last verified: 2026-06-06
Source of truth: product UI and code

## Terms

- Sage: the main workspace/customer agent. It can use cloud/server tools,
  connectors, and selected Agent Computer capabilities when exposed by runtime.
- Studio: specialist/deployed agents and business-agent configuration.
- Agent Computer: the customer-selected hardware target Sage uses for hardware
  and personal-channel work.
- Gateway: the local TypeScript process in `empyralis-gateway/src/` that pairs a
  machine to the backend and forwards supervisor requests.
- Supervisor: the Rust local executor in `empyralis-supervisor/src/` that runs
  signed capabilities such as shell, filesystem, screenshot, OCR, control,
  clipboard, launch, notification, AppleScript, and speech.
- Runtime: a cloud, local, or self-hosted execution lane that can register,
  receive session tokens, claim tasks, heartbeat, complete work, and receive
  control events.
- Channel: an inbound/outbound messaging lane for Sage or Studio agents.
- Connector: an OAuth/API integration or provider capability exposed to agents.
- App: a hosted mini-app or registry item exposed through app registry and app
  bridge contracts.
- Discover: marketplace/discovery UI for apps and agents.
- Full Access: Agent Computer runtime access mode that gives Sage broad local
  execution scope after Sage scope and setup-warning acknowledgement are present.
- BYOK: workspace/customer-provided provider credentials stored through the
  workspace credential/vault path.
- Platform runtime key: Empyralis-owned hosted provider secret resolved through
  `secrets_broker.resolve_hosted_provider_secret(...)` or
  `resolve_hosted_openai_bearer(...)`.
