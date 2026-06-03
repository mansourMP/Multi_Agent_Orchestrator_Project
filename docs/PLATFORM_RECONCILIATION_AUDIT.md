# Empyralis Platform Reconciliation Audit

This document is the current source of truth for the platform reset. The public product nouns are `Sage`, `Apps`, `Discover`, `Activity`, and `Settings`.

## Canonical route set

| Surface | Desktop route | Mobile route | Backend source of truth | Status | Notes |
| --- | --- | --- | --- | --- | --- |
| Sage | `/w/{workspace_id}` and Sage workspace panes | `/(tabs)/chats` | chat, approvals, runtime, and workspace services | canonical | Mobile may keep the old `kin` implementation internally, but the top-level user noun is `Sage`. |
| Apps | `/w/{workspace_id}/applications` | `/(tabs)/apps` | `GET /api/workspaces/{workspace_id}/apps` | canonical | Owned workspace launcher only. No store, updates, maintenance, or fake seeded rows. |
| Discover | `/w/{workspace_id}/marketplace` | `/(tabs)/discover` | `GET /api/workspaces/{workspace_id}/discovery/feed` | canonical | Clone/install surface for approved public blueprints and capabilities. |
| Activity | workspace approvals, inbox, and event panes | `/(tabs)/inbox` | approvals, notifications, events | canonical | Should eventually show approval and app activity from the same event source. |
| Settings | workspace/account settings | `/(tabs)/settings` | workspace/account settings APIs | canonical | Should not contain pricing claims until pricing is decided. |

## Stale or compatibility surfaces

| Surface/path | Current location | Status | Required treatment |
| --- | --- | --- | --- |
| `MobileSpace` / `DEFAULT_SPACES` | `mobile/src/lib/spaces.ts` | stale | Keep out of primary navigation unless promoted into real workspace objects. |
| `/apps/installed` | mobile app registry compatibility client | compatibility | Do not render as a user-facing Apps source. |
| `/apps/store` | mobile app registry compatibility client | compatibility | Do not render as Store in the owned workspace launcher. |
| `/apps/updates` | mobile app registry compatibility client | compatibility | Do not render as Updates or Maintenance in the owned workspace launcher. |
| Preview/catalog seeded apps | mobile catalog/preview helpers | fake | Use only for explicit demos or development fixtures, never as default user-facing Apps. |
| `mini_app` naming | backend internals and some route names | duplicated | May remain internal temporarily. Public UI should say `App` or `App Blueprint`. |

## User-facing rules

- Apps is the owned launcher. It reads real workspace apps and opens an app-owned surface.
- Discover is the clone/install surface. It shows approved public/discoverable blueprints and capabilities.
- Draft/proposed apps must be distinguishable from finished apps.
- App cards show icon, name, and optional blueprint status only.
- Permission, access, blueprint, review, and recent activity details belong in secondary settings or review surfaces.
- Provider, model, runtime, raw credits, paid-plan claims, and internal IDs do not belong on primary user-facing cards.

## Release checklist

- Desktop Apps and mobile Apps use the same workspace id and same owned app source.
- Mobile has no Store, Updates, Maintenance, or fake seeded app rows in user-facing Apps.
- Desktop and mobile Discovery use the same category grammar: Apps, Agent templates, Tools, MCP, Skills, Bundles.
- Discovery does not expose private workspace apps.
- Mobile boot states render visible loading or error UI, never a blank white screen.
- Native iOS rebuild is reserved for native config/dependency changes; JS-only UI work uses Metro.
