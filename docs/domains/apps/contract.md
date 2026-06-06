# Apps Contract

Status: Active
Owner: Platform
Last verified: 2026-06-06
Source of truth: app registry and extension manifest code

## Registry Contract

The app registry is loaded and normalized by
`server_modules/app_registry_api.py`. Default registry entries include app
fields:

- `id`
- `name`
- `description`
- `icon`
- `category`
- `status`
- `version`
- `latest_version` when available
- `publisher`
- `entry_route`
- `permissions`
- `source`

Implemented default apps include Nutrition, Finance, Health, Study, Language
Coach, Travel, Home, Notes, Planner, Focus, Reading, Writing, and Habits.

Registry routes require `require_api_key` and expose:

- `GET /apps/registry`
- `GET /apps/installed`
- `GET /apps/store`
- `GET /apps/updates`
- `GET /apps/manifest/{app_id}`
- `POST /apps/install`
- `POST /apps/uninstall`
- `POST /apps/update`

Install/update flows require `app_id`, reject unknown apps, set install/update
metadata, and persist registry state.

## Status Behavior

Legacy seeded app ids that were marked `installed` without install metadata are
normalized back to `available`.
