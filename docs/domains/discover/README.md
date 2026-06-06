# Discover Domain

Status: Active
Owner: Platform
Last verified: 2026-06-06
Source of truth: discovery UI, marketplace services, and app/agent registry code

Use this folder for the customer-facing discovery surface: marketplace listings,
available agents, available apps, review rules, and publication boundaries.

## Implemented Surface

- Discover feed lists public/cloneable app blueprints plus marketplace-backed agent templates, skills, MCP connectors, and bundles. Source: `server_modules/discovery_feed_service.py`.
- Marketplace packages support kinds `agent_template`, `app`, `connector`, `mini_app`, `provider`, and `skill`, but the Discover feed intentionally maps only agent templates, skills, connectors as MCP, and bundles from marketplace packages. Sources: `server_modules/marketplace_distribution_service.py`, `server_modules/discovery_feed_service.py`.
- Applications and Marketplace are separate workspace routes rendered through the workspace surface page. Sources: `frontend/app/(account)/w/[workspaceId]/applications/page.tsx`, `frontend/app/(account)/w/[workspaceId]/marketplace/page.tsx`.
- App registry routes expose registry, installed, store, updates, manifest, install, uninstall, update, and app bridge endpoints. Source: `server_modules/app_registry_api.py`.

## Files

- `marketplace-contract.md`
- `app-review-rules.md`
- `security.md`
- `tests.md`
- `FILL_PROMPT.md`

## Existing Docs To Reconcile

- `PLATFORM.md`
- `docs/studio-marketplace-ux-boundary-2026-04-30.md`
- `docs/domains/apps/platform-inventory-and-user-owned-apps.md`
