# Phase 8: Proof, Ads, and Investor Readiness

## Purpose

Phase 8 turns closed pilot evidence into a proof package. It does not launch ads, create campaigns, publish public claims, or invent results.

Valid proof must come from Phase 7 activity ledger events and reports.

## Valid Evidence

Accepted evidence:
- WhatsApp/Telegram pilot activity rows.
- `pilot_feedback.reported` rows.
- `pilot_issue.reported` rows.
- Approval and blocked-action rows.
- Trace IDs tied to the relevant workflow.
- Phase 7 report metrics derived from the same activity ledger schema.

Rejected evidence:
- Manually typed numbers without trace IDs.
- Demo-only or test-only claims presented as pilot results.
- Investor claims that hide open P0/P1 issues.
- Ads claims before the ads-readiness gate passes.

## Proof Readiness States

`insufficient_data`:
- Not enough real users, messages, completed tasks, feedback, or trace IDs.
- Open P0/P1 pilot issues block readiness.

`ready_for_case_study`:
- Enough real closed-pilot evidence exists for a narrow case study.
- Public launch and paid acquisition are still not proven.

`ready_for_investor_memo`:
- More complete pilot evidence exists.
- Still requires limitations and traceable evidence.

## API

Readiness package:

```text
GET /api/pilot/proof/readiness?workspace_id=...&days=30
```

Case study:

```text
GET /api/pilot/proof/case-study?workspace_id=...&days=30
```

Investor memo:

```text
GET /api/pilot/proof/investor-memo?workspace_id=...&days=30
```

Ads readiness:

```text
GET /api/pilot/proof/ads-readiness?workspace_id=...&days=30
```

## Case Study Template

Sections:
- Workflow tested.
- User type.
- Problem before Empyralis.
- What Empyralis did.
- Measured result.
- Failures and limitations.
- Approval and safety behavior.
- Evidence trace IDs.
- What is still not proven.

If evidence is insufficient, fields must show `not_enough_data`.

## Investor Memo Template

Sections:
- Product wedge.
- Workflow proven.
- Pilot usage.
- Safety model.
- Retention/repeat usage signal.
- Failure modes.
- Why now.
- What is not proven yet.
- Next milestone.
- Evidence trace IDs.

Investor memo drafts must include limitations and unresolved proof gaps.

## Ads Readiness Checklist

Ads are blocked until:
- Investor-memo proof status is reached.
- Failure rate is below the configured threshold.
- No open P0/P1 pilot issues remain.
- User usefulness feedback exists.
- Case study and investor memo can cite trace IDs.

Allowed before ads:
- Prepare case study.
- Prepare investor memo.
- Review proof gaps.

Forbidden before ads readiness:
- Launch campaign.
- Increase ad spend.
- Publish public claims.
- Use invented metrics.

## Acceptance Criteria

- Insufficient pilot data returns `insufficient_data`.
- Every metric is derived from Phase 7 report/activity rows.
- Case study and investor memo include trace IDs when ready.
- Open P0/P1 issues block proof and ads.
- Ads readiness is a gate, not an execution system.
