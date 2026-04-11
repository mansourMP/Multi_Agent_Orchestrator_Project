# Empyralis Open-Core Boundary

## Purpose

This document defines the recommended product-distribution boundary for Empyralis.

It answers one question exactly: which parts of the platform should be open source, source-available, managed-cloud-only, or enterprise/self-host only.

This is a product boundary, not a runtime-security boundary. Runtime trust, sandboxing, approvals, scopes, secrets, and tenancy rules still apply regardless of distribution model.

## Distribution Classes

- `open_source`
  Redistributable local-first components that help adoption and developer trust without giving away the hosted moat.
- `source_available`
  Auditable and extensible components that should be visible to customers and developers, but should not become the public blueprint for a cloneable managed service.
- `managed_cloud_only`
  Operated services whose value is primarily reliability, coordination, sync, always-on execution, and commercial operations.
- `enterprise_self_host_only`
  Private commercial distributions for enterprise or self-host customers who need control-plane ownership, private runtime clusters, private vaulting, or enterprise identity and policy operations.

## Boundary Principles

1. Do not sell the core brain.
   Limits and monetization should land on hosted compute, sync, storage, autonomy, premium operations, and organizational controls.
2. Keep one platform model.
   Local, cloud, and hybrid must still use the same account, workspace, Sage, runtime-attachment, and memory model.
3. Preserve local-first credibility.
   A power user must be able to run Sage locally, bring their own model keys, extend the skill/plugin surface, and keep private context local.
4. Preserve the moat where operations matter.
   The moat is not the desktop shell or the local daemon. The moat is managed cloud reliability, mobile/cloud sync, hosted orchestration, premium connector operations, and enterprise service depth.
5. Keep self-host real, not fake.
   Enterprise and serious self-host customers need a coherent private deployment path, not a crippled developer sandbox pretending to be self-host.

## Recommended Boundary Map

### Open Source

- `local runtime daemon`
  This is the local-first adoption engine. It should stay open so users can run private local workflows, local memory, and BYO provider keys.
- `desktop app shell`
  The desktop power surface should be open because it is not the moat by itself; the value comes from attached runtimes, policy, and orchestration.
- `plugin/skill SDK`
  The extension surface should be open to maximize ecosystem growth and developer trust.
- `local-only packaging, pairing helpers, and BYO-provider adapters`
  These should remain inspectable and redistributable so local/self-host users are not forced into the managed cloud.

### Source-Available

- `mobile clients`
  Mobile is the main daily-use product surface. It should be inspectable and auditable, but not positioned as a free blueprint for a direct managed-service clone.
- `connector framework and secrets/vault framework`
  The brokered connector and vault framework can be visible, but the shared hosted operations around it remain proprietary.
- `workspace RBAC/admin primitives`
  Basic workspace roles, admin policy hooks, and install-scoped controls can be visible so private deployments remain coherent.

### Managed Cloud Only

- `hosted control plane`
  The multi-tenant hosted control plane, managed SaaS coordination, and cloud operations remain proprietary.
- `cloud Sage runtime`
  The always-on hosted Sage runtime and its fleet orchestration remain managed-cloud-only.
- `managed scheduler/background automation`
  Hosted ambient monitoring, background wakes, and scheduler operations remain managed-cloud-only.
- `managed memory sync`
  Cross-device sync, mobile/cloud context sync, and managed recall infrastructure remain managed-cloud-only.
- `shared secure vault and hosted connector operations`
  The shared hosted credential vault, managed connector execution, and platform-operated integrations remain managed-cloud-only.
- `billing, subscriptions, and SaaS organization operations`
  Commercial plan enforcement, billing, and managed SaaS organization operations remain managed-cloud-only.
- `mobile push and cloud notification infrastructure`
  The operated push infrastructure and cloud delivery services remain managed-cloud-only.

### Enterprise / Self-Host Only

- `private control-plane package`
  Enterprise/private-cloud customers can receive a private control-plane distribution instead of using the public managed control plane.
- `private Sage runtime cluster`
  Enterprise and serious self-host customers can run a private hosted-class Sage runtime on their own infrastructure.
- `private scheduler and sync services`
  Private background automation and private sync services belong in the enterprise/self-host package, not in public open-source releases.
- `private vault and connector runners`
  Enterprise customers can operate private credential vaulting and private hosted connector runners inside their own environment.
- `enterprise identity, SSO, SCIM, and tenant-admin pack`
  Advanced identity and tenant admin packages belong in enterprise/self-host commercial distribution.

## Subsystem Classification

| Subsystem | Recommended boundary | Why |
| --- | --- | --- |
| local runtime daemon | `open_source` | Drives local-first adoption, private use, and BYO model-key viability. |
| desktop app shell | `open_source` | Supports power users without giving away the cloud moat. |
| mobile clients | `source_available` | Main product surface should stay auditable without making the managed consumer product trivial to clone. |
| plugin/skill SDK | `open_source` | Ecosystem growth depends on a permissive extension surface. |
| hosted control plane | `managed_cloud_only` | The hosted coordination plane is core SaaS moat and operational value. |
| cloud Sage runtime | `managed_cloud_only` | Hosted orchestration quality and always-on reliability are paid service value. |
| managed scheduler/background automation | `managed_cloud_only` | Always-on automation is an operated service, not a repo giveaway. |
| managed memory sync | `managed_cloud_only` | Cross-device sync and durable cloud context are recurring-service value. |
| connector framework and secrets/vault framework | `source_available` | The framework can be inspectable, while shared hosted connector/vault ops remain proprietary. |
| shared secure vault and hosted connector operations | `managed_cloud_only` | Shared hosted credential custody and integration operations are part of the cloud moat. |
| workspace RBAC/admin primitives | `source_available` | Private deployments need inspectable policy and role semantics. |
| billing, subscriptions, and SaaS org operations | `managed_cloud_only` | Billing and SaaS seat/org operations are commercial service infrastructure. |
| private control-plane package | `enterprise_self_host_only` | Required for real enterprise/self-host deployment without exposing the public SaaS control plane. |
| private Sage runtime cluster | `enterprise_self_host_only` | Allows private hosted-class execution without public distribution of the full hosted stack. |
| private scheduler and sync services | `enterprise_self_host_only` | Keeps enterprise private deployments coherent without giving away the managed cloud service. |
| private vault and connector runners | `enterprise_self_host_only` | Supports regulated/private environments with customer-owned credential custody. |
| enterprise identity and admin pack | `enterprise_self_host_only` | Advanced SSO, SCIM, tenant admin, and governance belong in enterprise distribution. |

## Managed-Cloud Moat Definition

The company moat should remain concentrated in these areas:

- managed cloud reliability and SLO-backed operation
- hosted Sage orchestration and runtime fleet quality
- mobile/cloud sync and push infrastructure
- managed background automation and scheduler operations
- shared vault custody and hosted connector execution
- commercial billing, organization management, and premium operations
- enterprise deployment services and operational support

The moat should not depend on hiding:

- the local runtime daemon
- the desktop shell
- the plugin/skill SDK
- BYO provider mode
- local-only workflows

## Self-Host And Enterprise Carve-Out

The self-host and enterprise story should be explicit:

- hobbyist/self-host users get the open local stack, local daemon, desktop shell, SDK, and BYO providers
- enterprise/private-cloud customers get a commercial private deployment package for:
  - control plane
  - hosted-class Sage runtime
  - scheduler/sync
  - private vault/connectors
  - enterprise identity/admin pack

That means self-host remains real, but the public repo does not ship the full managed cloud moat.

## Recommended Distribution Model

The recommended model is:

1. `open core local stack`
   Open-source local daemon, desktop shell, SDK, and BYO-provider path.
2. `source-available client and framework layer`
   Source-available mobile clients plus inspectable connector/admin framework code.
3. `managed cloud service`
   Proprietary hosted control plane, hosted Sage, background automation, sync, shared vault/connectors, billing, and push infrastructure.
4. `enterprise/private deployment package`
   Commercial self-host/private-cloud distribution for customers who need the same platform model on their own infrastructure.

This keeps the developer story trustworthy, preserves local-first adoption, and protects the real operational moat.

## What This Document Deliberately Does Not Decide

This document does not assign exact public licenses yet.

It defines boundary classes and product ownership only. Specific legal text and license selection can come later, but they must follow this boundary map instead of inventing a new one.
