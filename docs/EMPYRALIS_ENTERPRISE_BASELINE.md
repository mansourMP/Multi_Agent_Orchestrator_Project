# Empyralis Enterprise Baseline

This document records the minimum enterprise hardening baseline that now exists in the active repo.

It is intentionally strict about what is fully implemented versus what is only scaffolded.

## Fully Implemented Baseline

These items are materially present in the repo today:

- PR and `main` CI in [.github/workflows/ci.yml](/Users/mansur/Multi_Agent_Orchestrator_Project/.github/workflows/ci.yml)
  - Python server tests
  - frontend typecheck
  - mobile typecheck
  - Rust supervisor build
- dependency review and dependency-audit workflow coverage in [.github/workflows/security-baseline.yml](/Users/mansur/Multi_Agent_Orchestrator_Project/.github/workflows/security-baseline.yml)
  - GitHub dependency review on pull requests
  - `pip-audit` for Python requirements
  - `npm audit` for frontend and mobile dependencies
- secrets scanning in [.github/workflows/security-baseline.yml](/Users/mansur/Multi_Agent_Orchestrator_Project/.github/workflows/security-baseline.yml)
  - `gitleaks` runs against the repo history checkout
- SBOM generation in [.github/workflows/supply-chain.yml](/Users/mansur/Multi_Agent_Orchestrator_Project/.github/workflows/supply-chain.yml)
  - repository SBOM generation
  - artifact upload for inspection
- provenance and release attestation
  - supply-chain artifact provenance in [.github/workflows/supply-chain.yml](/Users/mansur/Multi_Agent_Orchestrator_Project/.github/workflows/supply-chain.yml)
  - signed desktop release provenance in [.github/workflows/build.yml](/Users/mansur/Multi_Agent_Orchestrator_Project/.github/workflows/build.yml)
- customer-facing incident and reliability docs
  - [docs/runbooks/INCIDENT_RESPONSE.md](/Users/mansur/Multi_Agent_Orchestrator_Project/docs/runbooks/INCIDENT_RESPONSE.md)
  - [docs/runbooks/RELIABILITY_OPERATIONS.md](/Users/mansur/Multi_Agent_Orchestrator_Project/docs/runbooks/RELIABILITY_OPERATIONS.md)

## Partially Scaffolded Baseline

These items now have real control-plane boundaries and stored configuration, but they are not full enterprise products yet:

- SSO hooks in [server_modules/auth.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/auth.py) and [server_modules/routes_auth.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/routes_auth.py)
  - tenant-scoped SSO configuration
  - provider metadata fields
  - tenant status visibility for authenticated users
- MFA hooks in [server_modules/auth.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/auth.py)
  - tenant-scoped MFA policy
  - per-user MFA enrollment state
  - visibility in authenticated enterprise status
- SCIM and admin provisioning boundary in [server_modules/auth.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/auth.py) and [server_modules/routes_auth.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/routes_auth.py)
  - tenant-scoped SCIM configuration
  - explicit admin provisioning API
  - external identity and provisioning-source tracking on user records

## Still Deferred

These are not implemented end to end yet and should not be described as complete:

- live OIDC or SAML browser handshakes
- IdP callback verification and session exchange
- MFA challenge generation and verification
- WebAuthn ceremonies
- a full SCIM server implementation with token rotation and lifecycle webhooks
- retention policy automation beyond the existing artifact placeholders
- customer-facing compliance program work such as SOC 2 controls, vendor review packages, and legal process artifacts

## Operational Use

Use this baseline as the truthful answer when describing current enterprise posture:

- release supply chain hardening is real
- CI and scanning baselines are real
- enterprise identity and provisioning are scaffolded with concrete boundaries
- full identity-provider depth is still future work
