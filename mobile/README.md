# Empyralis Mobile V2

The previous mobile surface is quarantined in `archive_v1/mobile`.

Phase 95 establishes the non-visual mobile foundation on the same account/workspace model as the
new web shell.

Implemented in this phase:
- global account shell state for platform session + workspace memberships only
- the same workspace bootstrap payload contract used by web
- the same shell-profile and route-manifest derivation model used by web
- workspace-scoped mobile service bundles for transport, query, realtime, persistence, and teardown
- accountId + workspaceId namespacing for mobile persistence and cache state
- explicit cloud-first, platform-first session handling with no direct LAN/runtime-first dependency
- workspace-scoped surface controllers for:
  - account/session
  - tenant switching
  - chat
  - runs and approvals
  - notifications
  - artifacts
- degraded-mode honesty for cloud failure with cached workspace fallbacks where appropriate

Not rebuilt yet:
- React Native / Expo UI
- mobile visuals and layouts
- polished feature screens beyond the architecture proof tests
