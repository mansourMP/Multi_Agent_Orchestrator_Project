# Phase 7: Closed Pilot Operations

## Pilot Workflow

Use one controlled workflow: WhatsApp/Telegram customer question handling.

The pilot proves that Empyralis can receive a known customer's question, build a safe response or draft, require approval for risky commitments, emit traceable activity and audit events, and give the owner/operator a daily report.

Excluded from this phase: public ads, marketplace, payment processing, public developer ecosystem, full multi-agent graph, and future runtime providers.

## Users And Roles

Owner/admin:
- Configure the pilot agent and channel.
- Approve risky actions.
- Pause or kill agent/runtime sessions.
- View full activity and audit logs.
- Run the daily review.

Operator:
- Monitor the daily pilot report.
- Triage failures and blocked actions.
- Record issues with trace IDs.
- Escalate safety events to the owner/admin.

Normal user:
- Ask internal questions.
- Receive drafts or summaries.
- Report usefulness.

External/customer user:
- Send WhatsApp or Telegram questions.
- Receive safe replies.
- Cannot trigger tools directly, inspect memory, or view audit logs.

## Safety Boundaries

Agent can read:
- Configured business knowledge.
- Current conversation context.
- Approved channel metadata.
- Non-restricted memory.

Agent can write:
- Draft replies.
- Activity and audit events.
- Operator-visible feedback and issue notes.

Requires approval:
- External sends that commit the business.
- Refunds, discounts, payment links, and order cancellations.
- Deleting data or changing permissions.
- Any action that enters credentials or expands access.

Forbidden:
- Payment processing.
- Credential entry.
- Mass messaging.
- Medical, legal, or financial commitments.
- Any action that bypasses audit.

Kill authority:
- Owner/admin can use per-agent, runtime-session, and workspace emergency stop controls.
- Operator escalates kill decisions unless explicitly granted admin authority.

Audit access:
- Owner/admin can view full pilot audit.
- Operator can view daily reports and trace IDs.
- Normal users can only submit feedback.

## Metrics

The pilot report tracks:
- Active users.
- Messages handled.
- Tasks completed.
- Tasks failed.
- Approval count.
- Blocked action count.
- Average response time.
- Manual intervention rate.
- Repeated usage by user.
- User-reported usefulness.

API:
- `GET /api/pilot/operations/contract`
- `GET /api/pilot/operations/report?workspace_id=...&days=1`
- `POST /api/pilot/operations/feedback`
- `POST /api/pilot/operations/issues`

## Daily Operating Procedure

Onboarding script:
- Confirm the pilot is closed to known users only.
- Explain that WhatsApp/Telegram replies may be drafted or approval-gated.
- Show where `trace_id` appears.
- Confirm who can pause or kill the agent.

First task script:
- Send one common customer question.
- Verify response quality and `trace_id`.
- Send one risky request and confirm approval or blocked behavior.
- Record usefulness score after the first session.

Failure escalation script:
- Capture user, channel, trace ID, expected behavior, and actual behavior.
- Pause the affected agent/session if the issue is safety-related.
- Assign severity before fixing.
- Review the audit trail before re-enabling.

Daily review script:
- Review daily summary before the next pilot window.
- Check failures, blocked actions, risky events, and usefulness feedback.
- Pick no more than three fixes for the next day.
- Keep the pilot closed until success/failure metrics are stable.

## Issue Template

```text
User:
Workflow: customer_question_handling
Expected behavior:
Actual behavior:
Logs/trace_id:
Severity: p0 | p1 | p2
Fix status: open | investigating | fixed | deferred
```

## Acceptance Criteria

- 10-20 known users can participate without public signup.
- One WhatsApp/Telegram workflow completes end to end.
- Risky actions require approval or are blocked.
- Owner/admin can find `trace_id` and audit events for every failure.
- Daily report shows metrics, failures, blocked actions, risky events, and feedback.
