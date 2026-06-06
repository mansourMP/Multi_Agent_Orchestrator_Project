# Marketplace Contract

Status: Active
Owner: Platform
Last verified: 2026-06-06
Source of truth: marketplace service and discovery UI code

## Discoverable Objects

Discoverable today:

- Public or cloneable mini-app/app blueprints from `mini_apps_service.list_apps(..., include_public_catalog=True)`.
- Marketplace agent templates, surfaced as `agent_template`.
- Marketplace connectors, surfaced in Discover as `mcp`.
- Marketplace skills, surfaced as `skill`.
- Marketplace bundles, surfaced as `bundle`.

Sources: `server_modules/discovery_feed_service.py`, `frontend/lib/discovery/discovery-pane.tsx`.

Marketplace package kinds are broader than the Discover feed: `agent_template`, `app`, `connector`, `mini_app`, `provider`, and `skill`. Install targets are `template_catalog`, `app_registry`, `connector_catalog`, `mini_app_registry`, `provider_catalog`, and `skill_catalog`. Source: `server_modules/marketplace_distribution_service.py`.

Marketplace list payloads include package id, kind, label, description, category, publisher, onboarding, verification status, review state, health state, policy posture, approval flag, preview flag, install target, install eligibility, install blockers, billing, marketplace contract, install permissions, review findings, proof, submission/review metadata, analytics, installed state, install record, runtime truth, package-specific payload, and updated timestamp. Source: `server_modules/marketplace_distribution_service.py`.

Discover feed item shape includes id, type, title, description, actor, summary, components, badges, blueprint/provenance for app blueprints, permission summary, installed flag, action, and updated timestamp. Private source fields are stripped before response. Source: `server_modules/discovery_feed_service.py`.

API endpoints:

- `GET /api/workspaces/{workspace_id}/discovery/feed`: viewer role; returns Discover feed.
- `POST /api/workspaces/{workspace_id}/discovery/items/{feed_item_id}/adopt`: member role; clones public app blueprints, opens already installed apps, opens agent templates in Studio, or installs eligible non-preview marketplace capabilities.
- `GET /api/workspaces/{workspace_id}/marketplace/packages`: viewer role by default; owner role when `include_review_queue=true`.
- `POST /api/workspaces/{workspace_id}/marketplace/providers`: member role; registers a provider package.
- `POST /api/workspaces/{workspace_id}/marketplace/apps`: member role; submits a community app.
- `POST /api/workspaces/{workspace_id}/marketplace/packages/{package_id}/review`: owner role; reviews app submissions.
- `POST /api/workspaces/{workspace_id}/marketplace/packages/{package_id}/install`: member role; installs an eligible package.

Sources: `server_modules/routes_discovery.py`, `server_modules/routes_marketplace.py`.

Install/open behavior:

- Agent templates do not create an install record through Discover adoption; they return `/w/{workspace_id}/studio?proof_agent={template_id}`.
- App packages install into the app registry and sync a mini-app contract.
- Mini-app packages sync a mini-app contract.
- Provider, connector, skill, and agent-template installs store package-specific target payloads in marketplace distribution state.
- Link apps open their destination URL; platform apps open a platform route; community/private app packages open `/w/{workspace_id}/applications/{app_id}`.

Source: `server_modules/marketplace_distribution_service.py`.

Not implemented in the inspected code: Discover feed adoption for marketplace app packages. Marketplace app packages exist in the marketplace package list, but `DISCOVERY_MARKETPLACE_KINDS` excludes `app` and `mini_app`. Source: `server_modules/discovery_feed_service.py`.
