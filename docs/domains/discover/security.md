# Discover Security

Status: Active
Owner: Platform
Last verified: 2026-06-06
Source of truth: marketplace, app registry, and UI route code

## Security Controls

Public vs authenticated access:

- `/api/marketplace/agents` and `/api/marketplace/upgrade-click` are public routes in the inspected route module.
- Workspace Discover and Marketplace routes require authenticated current user and workspace access checks.
- Discovery feed requires viewer access; Discovery adopt requires member access.
- Marketplace package list requires viewer access by default and owner access for review queue inclusion; provider/app registration and package install require member access; app-submission review requires owner access.

Sources: `server_modules/routes_marketplace.py`, `server_modules/routes_discovery.py`.

Workspace isolation:

- Marketplace distribution state is stored per workspace under the workspace scope path and all list/register/install/review calls normalize the request workspace id before reading or writing state.
- App registry install/update is a process-wide registry file, but marketplace app installation also syncs a workspace mini-app contract for the installing workspace.

Sources: `server_modules/marketplace_distribution_service.py`, `server_modules/app_registry_api.py`.

Install authorization and trust:

- Package install fails when `_install_blockers` returns any blocker.
- Installing a package records installer user id, installed timestamp, status, open href, billing metadata, runtime truth, and package-specific target payload.
- Marketplace distribution state writes are gated by the Rust runtime-state-store decision before file write.

Source: `server_modules/marketplace_distribution_service.py`.

Metadata exposure:

- Discover strips private `_source` fields from feed responses, so package ids/public app ids used for adoption are not directly exposed in feed items.
- Marketplace package list intentionally exposes publisher, onboarding, review, trust, install, billing, install-permission, analytics, and package-specific metadata.

Sources: `server_modules/discovery_feed_service.py`, `server_modules/marketplace_distribution_service.py`.

CSRF protections have explicit route tests for workspace Discovery adoption and Marketplace mutation routes when cookie sessions are used. Sources: `server_modules/tests/test_routes_discovery.py`, `server_modules/tests/test_routes_marketplace.py`.

Not implemented in the inspected code: a full independent marketplace moderation system, signed publisher identity proof enforcement beyond normalized domain-proof metadata, or payment-processing enforcement. Billing metadata reports `payment_processing_live: False`. Source: `server_modules/marketplace_distribution_service.py`.
