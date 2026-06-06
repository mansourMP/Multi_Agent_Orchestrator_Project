# Apps Security

Status: Active
Owner: Platform
Last verified: 2026-06-06
Source of truth: app registry, app bridge, and security tests

## Security Controls

- Registry routes require API-key authentication.
- App bridge captain/specialist routes enforce workspace access with minimum
  viewer role.
- App bridge calls require installed apps when `installed_only=True`.
- Bridge kinds and bridge types must match the runtime contract map.
- Bridge targets are validated for required target ids or route keys.
- Forbidden metadata keys block implicit Sage/private memory, specialist memory,
  owner files, gateway/runtime session ids, shell, local companion, screenshots,
  computer control, MCP, skill execution, and raw tool calls.
- Bridge requests emit activity ledger audit events.

## Missing Or Needs Tightening

Migration debt: origin/frame controls for hosted mini-apps need a focused
frontend/browser inspection.

Migration debt: per-permission revocation and user approval behavior should be
documented once verified from UI and backend flows.
