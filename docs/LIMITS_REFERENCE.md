# Limits Reference

Last updated: 2026-04-19

Purpose: operator and product reference for Studio specialist limits across context, per-user message quotas, upgrade flows, and transparency controls.

## 1. Context Limits Per Agent

### Recommended default

For a customer-facing Studio specialist, the right default is **not** “use the model’s full context window.” The right default is a **small working window plus summary memory**.

Recommended operator default:

- `context_budget_preset = balanced`
- Effective working memory target: about **1,100 prompt tokens**
- Preserve the **last 8 messages**
- Keep **summary compaction on**
- Keep **persistent memory on** for customer-facing specialists unless the use case is intentionally stateless

Why:

- Telegram and WhatsApp support bots are usually narrow-task agents, not research copilots.
- Large raw windows increase drift, latency, and cost faster than they improve answers.
- Public-channel conversations benefit more from a clean summary plus the most recent turns than from replaying the entire transcript.

### What should happen when the context fills up

The order should be:

1. **Rolling window**
   Keep only the most recent turns in active prompt context.
2. **Summary compaction**
   Collapse older turns into a stable memory summary.
3. **Hard reset / new session**
   Start a fresh session when the topic changes or the workflow is complete.
4. **Manual clear**
   Purge stored memory for a specific user when the operator or the user requests it.

This is the right operator model:

| Mechanic | Should exist | Default | Why |
|---|---|---:|---|
| Rolling window | Yes | On | Cheapest and most predictable first-line control |
| Summary compaction | Yes | On | Preserves continuity without replaying full transcript |
| Hard reset / new session | Yes | Available to operator | Best for topic changes, case closure, or handoff |
| Manual clear | Yes | Available to operator and user privacy flow | Required for privacy and for “start over” recovery |

### How Telegram and WhatsApp bots handle this in practice

The platforms themselves do **not** manage LLM context for you.

- **Telegram**
  - Telegram gives the bot message events and deep-link/start mechanics.
  - Most AI bots keep a short rolling transcript, then a server-side summary, then optional CRM/customer facts.
  - Operators often expose a `/start`, `/reset`, or “New chat” action because Telegram itself does not give you a built-in “fresh AI thread” concept.
- **WhatsApp**
  - WhatsApp also does not manage AI context.
  - Most businesses keep a short server-side working window and a summary/CRM record.
  - The important WhatsApp-specific constraint is the **24-hour customer service window** for free-form replies, not the LLM context limit itself. Outside that window, businesses usually resume via templates and a server-side customer summary, not a full raw transcript.

### What exists in Empyralis now

Backend:

- Specialist memory policy already exists in [`server_modules/deployed_agent_config_schema.py`](../server_modules/deployed_agent_config_schema.py):
  - `memory_enabled`
  - `context_budget_preset`
  - `retention_preset`
- External-channel memory profiles already exist in [`server_modules/conversation_memory_policy.py`](../server_modules/conversation_memory_policy.py):
  - `compact` = ~900 tokens / keep last 6
  - `balanced` = ~1100 tokens / keep last 8
  - `deep` = ~2200 tokens / keep last 12
- Summary compaction is already wired in [`server_modules/deployed_agent_memory_service.py`](../server_modules/deployed_agent_memory_service.py):
  - memory is loaded per `tenant_id + workspace_id + deployed_agent_id + channel_key + external_user_id`
  - the service compacts old history via `compact_conversation_history(...)`
  - older context becomes `summary_text`, and recent messages stay in the active prompt
- Memory storage already exists in `deployed_agent_conversation_memory` via [`server_modules/control_plane_repository.py`](../server_modules/control_plane_repository.py)

What this means:

- **Rolling window**: built
- **Summary compaction**: built
- **Persistent per-customer memory**: built
- **Retention presets**: built
- **Hard reset / new session**: partial
  - session termination exists in backend flows
  - there is no clear operator-facing “start fresh but keep account history” control for channel users
- **Manual clear**: partial but real
  - `POST /api/deployed-agents/{id}/external-users/{external_user_id}/delete` exists
  - it deletes channel events, conversation memory, daily usage, and acquisition touches for that user
  - this is closer to **full user purge** than a lightweight “clear active thread” control

### Recommendation for first launch

Use this as the default Studio policy:

- Public Telegram/WhatsApp specialists: `balanced`
- High-stakes or multi-step specialists: `deep`
- Very high-volume lead-gen bots: `compact`

Do **not** expose raw token counts first. Expose presets first:

- Compact
- Balanced
- Deep

Then add advanced numeric control later if needed.

## 2. Rate Limits Per User

### Product recommendation

For a public Telegram specialist, the best default is:

- **hard per-user daily cap**
- plus **one clear upgrade CTA**
- plus **reset time**

Do **not** use “slow responses” as the primary limit mechanic.

### Option evaluation

| Option | Recommendation | Why |
|---|---|---|
| Soft limit: slow responses | No | Feels broken, increases support load, weak conversion |
| Hard limit: “come back in X hours” | Yes | Clear, easy to reason about, predictable cost control |
| Upgrade prompt: link to app | Yes, paired with hard limit | Best conversion path when the specialist is genuinely useful |

### Recommended default quota for a public specialist

Reasonable starting default:

- **20 messages per user per UTC day**

Why 20:

- enough for a real trial
- low enough to protect spend
- high enough to avoid feeling like a toy

Better behavior than “limit with no warning”:

1. Warning at ~80% of quota
2. Hard stop at quota
3. Clear reset time
4. One-tap upgrade/install CTA

### Telegram transport limits vs product limits

These are different things:

- **Telegram transport limit**
  - official bot guidance says avoid sending more than about **1 message per second in a single chat**
  - bulk broadcast is about **30 messages per second** before 429s unless paid broadcasts are enabled
- **Empyralis product limit**
  - this is the specialist’s own free-tier or plan-based allowance per external user

Your Studio specialist should enforce the product limit even if Telegram transport is still available.

### Best conversion mechanic after a limit hit

The best mechanic is:

- limit hit
- immediate value statement
- one primary button
- signed attribution link
- land on a universal app/web page that knows:
  - channel
  - specialist
  - external user id or signed touch id
  - campaign source = `limit_hit`

This converts better than:

- a plain pasted URL
- “come back tomorrow”
- slowing responses

Why:

- the user already got value
- the intent is hot
- the CTA is tied to the exact moment of frustration

### What exists in Empyralis now

Built:

- Specialist config already supports:
  - `daily_message_limit`
  - `upgrade_cta_url`
  - `upgrade_cta_label`
  - in [`server_modules/deployed_agent_config_schema.py`](../server_modules/deployed_agent_config_schema.py)
- The backend already enforces the limit **per external user** in [`server_modules/deployed_agent_rate_limit_service.py`](../server_modules/deployed_agent_rate_limit_service.py)
- Usage is persisted in `deployed_agent_daily_message_usage` in [`server_modules/control_plane_repository.py`](../server_modules/control_plane_repository.py)
- Telegram / channel routing checks the quota **before the run starts** through:
  - [`server_modules/channel_quota_policy_service.py`](../server_modules/channel_quota_policy_service.py)
  - [`server_modules/quota_policy_service.py`](../server_modules/quota_policy_service.py)
  - [`server_modules/agent_channel_router.py`](../server_modules/agent_channel_router.py)
- The denial path already returns the specialist-specific reply string via [`server_modules/deployed_agent_service.py`](../server_modules/deployed_agent_service.py)
- There is already an end-to-end test for the Telegram limit CTA in [`server_modules/tests/e2e/test_public_telegram_blackbox.py`](../server_modules/tests/e2e/test_public_telegram_blackbox.py)

Current behavior:

- The current denial message is text-only:
  - `"{SpecialistName} has reached today's free message limit. {CTA label}: {CTA URL}"`
- This works, but it is weaker than a button-based conversion flow.

Missing:

- threshold warnings before hard cap
- per-user overrides or exemptions
- tiered quotas by segment
- in-channel upgrade button payload for the limit hit itself
- “grace message” handling after the first cap event

## 3. Upgrade Flow Design

### Recommended Telegram limit-hit message

Recommended copy:

> You’ve reached today’s free message limit with **{SpecialistName}**.  
> Continue in Empyralis to keep your history, unlock more messages, and move between Telegram, web, and mobile.

Primary CTA:

- **Continue in app**

Optional secondary CTA:

- **Tomorrow is fine**

### What the CTA should do

For Telegram:

- Use an **inline keyboard URL button**
- Send the user to a **universal HTTPS landing page**

Recommended link shape:

`https://app.empyralis.com/continue?source=telegram_limit_hit&agent={deployed_agent_id}&token={signed_attribution_token}`

Why not send users directly to the app store?

- you lose attribution
- you lose the exact specialist context
- you cannot detect whether the app is already installed

The landing page should:

1. detect whether the mobile app is installed
2. open the native app if available
3. otherwise send to App Store / Play Store / web signup
4. preserve the attribution token
5. bind that conversion back to the Telegram specialist

### Recommended WhatsApp variation

For WhatsApp:

- use a **website CTA button** that opens the same HTTPS landing page
- do **not** rely on app deep links inside the message button
- inside the 24-hour customer service window, quick replies and button flows are easier
- outside the 24-hour window, you need a template-compatible approach

### How Telegram and WhatsApp services handle this today

- **Telegram**
  - best practice is a button under the denial message
  - Telegram supports inline keyboards, URL buttons, and deep linking on bot startup
  - Telegram is friendly to “continue in app” flows because URL buttons can open external landing pages and `start` parameters can carry attribution
- **WhatsApp**
  - the reliable pattern is a website CTA button or approved template button
  - businesses often send users to a landing page, payment page, or account portal
  - WhatsApp button flows are stronger inside the 24-hour session; outside the session, template approval rules matter

### What Empyralis already has that can support this

Built:

- specialist config already stores:
  - `public_start_cta_label`
  - `public_start_cta_url`
- workspace defaults also store those values in [`server_modules/workspace_config_schema.py`](../server_modules/workspace_config_schema.py)
- acquisition and attribution plumbing already exists in [`server_modules/channel_user_acquisition_service.py`](../server_modules/channel_user_acquisition_service.py)
  - `prepare_public_start_response(...)`
  - signed attribution token issuance
  - binding a conversion back to the external channel user

Important current limitation:

- the **public start / acquisition CTA flow is richer than the daily-limit CTA flow**
- the daily-limit flow currently has:
  - quota enforcement
  - CTA label
  - CTA URL
  - logging
- but it does **not** currently emit a structured button payload for Telegram/WhatsApp in the limit-hit response

### Recommended exact product behavior

Telegram first version:

- message text:
  - `You’ve reached today’s free message limit with {SpecialistName}. Continue in Empyralis to keep your history and unlock more messages.`
- one button:
  - `Continue in app`
- destination:
  - universal HTTPS landing page with signed attribution

WhatsApp first version:

- inside 24h session:
  - same message
  - website CTA button
- outside 24h session:
  - approved template:
    - `Continue your conversation with {SpecialistName}`
    - button:
      - `Open Empyralis`

## 4. Transparency Controls

Operators should be able to both **configure** and **inspect** these controls.

### Recommended operator control set

| Control | Operators should be able to configure | Operators should be able to see |
|---|---|---|
| Per-user message limits | default limit, per-user override, exemptions, warning threshold | current usage, remaining quota, reset time |
| Context window size | preset or advanced token budget | current preset, last compaction status, summary presence |
| Memory on/off per user | allow, disable, clear, reset | whether memory exists, last updated, summary preview |
| Tool permissions per user | allow/deny risky tools for specific users or segments | current tool grants and denial history |
| Usage per user | limits, pricing tier, conversion routing | message count, sessions, escalations, spend, acquisition source |

### What exists in the backend already

| Control | Backend today | Status |
|---|---|---|
| Agent-wide daily message limit | `daily_message_limit` in specialist config | Built |
| Per-user daily enforcement | usage keyed by `external_user_id` in `deployed_agent_daily_message_usage` | Built |
| Upgrade CTA label + URL | specialist config supports both | Built |
| Agent-wide memory on/off | `memory_enabled` in specialist config | Built |
| Context window preset | `context_budget_preset` = compact / balanced / deep | Built |
| Retention preset | `retention_preset` = short / standard / extended | Built |
| Memory summary list | `/api/deployed-agents/{id}/memory` returns external user id + summary + updated_at | Built |
| External user purge | delete endpoint removes events, memory, daily usage, acquisition touches | Built |
| Agent-wide tool policy | `tool_policy.enabled_tools` | Built |
| Active users / session counts / message volume | analytics rollups exist | Built |
| Monthly burn and cap | specialist analytics expose burn and cap | Built |
| Per-user message-limit override | not found | Missing |
| Per-user memory enable/disable | not found | Missing |
| Per-user tool allow/deny | not found | Missing |
| Per-user spend view | not found | Missing |
| Structured quota warning threshold | not found | Missing |
| Quota-hit button payload for upgrade | not found on denial flow | Partial |

### Exact backend modules worth treating as source of truth

- Specialist config schema:
  - [`server_modules/deployed_agent_config_schema.py`](../server_modules/deployed_agent_config_schema.py)
- Quota enforcement:
  - [`server_modules/deployed_agent_rate_limit_service.py`](../server_modules/deployed_agent_rate_limit_service.py)
  - [`server_modules/quota_policy_service.py`](../server_modules/quota_policy_service.py)
  - [`server_modules/channel_quota_policy_service.py`](../server_modules/channel_quota_policy_service.py)
  - [`server_modules/quota_response_service.py`](../server_modules/quota_response_service.py)
- Specialist memory:
  - [`server_modules/deployed_agent_memory_service.py`](../server_modules/deployed_agent_memory_service.py)
  - [`server_modules/conversation_memory_policy.py`](../server_modules/conversation_memory_policy.py)
- Storage / analytics:
  - [`server_modules/control_plane_repository.py`](../server_modules/control_plane_repository.py)
  - [`server_modules/deployed_agent_analytics_service.py`](../server_modules/deployed_agent_analytics_service.py)
- Acquisition / conversion:
  - [`server_modules/channel_user_acquisition_service.py`](../server_modules/channel_user_acquisition_service.py)

## Practical First-Launch Policy

If Studio is launching public specialists now, the clean default is:

- **Context**
  - `balanced`
  - memory on
  - summary compaction on
- **Quota**
  - 20 messages per user per UTC day
  - warning at 16
  - hard stop at 20
- **Upgrade**
  - one button: `Continue in app`
  - universal HTTPS landing page with signed attribution
- **Transparency**
  - operator can see:
    - active users
    - message count
    - memory summaries
    - quota hits
    - current burn

Then add these next:

1. per-user override and exemption table
2. button-based limit-hit responses
3. operator “reset thread” action separate from full privacy purge
4. per-user usage detail page with messages, sessions, quota, and acquisition source

## External References

- Telegram Bot FAQ: [https://core.telegram.org/bots/faq](https://core.telegram.org/bots/faq)
- Telegram Bot Features: [https://core.telegram.org/bots/features](https://core.telegram.org/bots/features)
- Twilio WhatsApp Session Definitions: [https://www.twilio.com/docs/content/session-definitions](https://www.twilio.com/docs/content/session-definitions)
- Twilio WhatsApp Buttons: [https://www.twilio.com/docs/whatsapp/buttons](https://www.twilio.com/docs/whatsapp/buttons)
- Twilio WhatsApp Key Concepts: [https://www.twilio.com/docs/whatsapp/key-concepts](https://www.twilio.com/docs/whatsapp/key-concepts)
