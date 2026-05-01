# Phase 7-10 Closeout

Date: 2026-05-01

This note records the current state of the remaining launch phases after the 2026-05-01 closeout pass.

## Phase 7 - Credits, Billing, Hosted AI

Launch-demo status: closed.

Implemented:

- Empyralis hosted credits are the normal-user path; BYOK remains available for power users.
- Provider catalog and hosted Sage AI entitlement use server-side policy, plan, and cap checks.
- Direct Sage hosted usage is persisted to the monthly hosted AI cost ledger when the credential plane is `platform_runtime`.
- Billing UI exposes hosted Sage AI policy, monthly cap, used amount, remaining amount, and plan controls.
- Billing summary now honors workspace admin-default `billing_plan` only when hosted Sage AI is explicitly enabled with cap, so provider catalog and Billing no longer drift while normal free workspaces remain free.

Paid-beta work still open:

- Live paid credit purchase/refill UX.
- Final plan packaging and Stripe production price confirmation.
- Customer-facing ledger export beyond the current billing pane summary.

## Phase 8 - Privacy, Security, Approvals

Launch-demo status: closed for Sage direct chat and local/cloud tool path.

Implemented:

- Direct tool actions emit audit events at the shared direct-tool execution boundary: started, completed, failed.
- Audit metadata includes tool, connector, action, provider, model, thread, argument keys, and a compact redacted summary.
- Common secret patterns are redacted from audit summaries.
- Existing approval policy covers risky direct tools, connector side effects, browser review, shell risk, and local tool gating.
- Runtime target contract keeps Full Access local-companion-only.

Paid-beta work still open:

- Dedicated end-user audit timeline UI for all audit events.
- Marketplace package review workflow.
- External security review and tenant-isolation test campaign.

## Phase 9 - Cloud Computer MVP

Launch-demo status: contract-ready only. Do not demo.

Implemented:

- Backend runtime target contract recognizes `sage_cloud_computer`.
- Cloud Computer is optional, metered, explicitly selected, never default.
- Full Access is unavailable on Cloud Computer; metered Autopilot is the intended mode.
- Runtime attachment tests verify Cloud Computer availability, trust tier, lifecycle metering, and local-device privacy boundary.

Not implemented:

- Live provisioner.
- Cloud browser session.
- Ephemeral Linux sandbox session.
- Artifact egress, spend meter, TTL cleanup, and audit timeline UI.

## Phase 10 - Final Launch Cert

Launch-demo status: web Sage path certified; production deployment must be rechecked after every pushed patch.

Certified on 2026-05-01:

- Production health.
- Production account shell and Sage route smoke.
- Production provider catalog with DeepSeek and Anthropic usable.
- Ten production Sage stream turns with non-empty assistant replies and truthful DeepSeek metadata.
- Frontend typecheck and build.
- Python compile and targeted backend tests.

Required before public sharing:

- Confirm the latest Render deployment includes the current closeout patches.
- Run one browser/phone visual sweep on the final public URL.
- Use the certified demo workspace/provider.
- Do not demo Cloud Computer, native mobile app, video generation, or Marketplace publishing.
