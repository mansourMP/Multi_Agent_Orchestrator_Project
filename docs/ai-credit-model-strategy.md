# Empyralis AI Credit And Model Strategy

Empyralis is a software and service platform. AI is the compute layer behind Sage, Studio agents, and mini-apps; it is not the product being resold as raw tokens.

## Operating Decisions

- Use hybrid accounting: keep exact provider cost and token classes internally, while showing users simple credits, actions, and usage history.
- Platform-paid usage must have known pricing before it can debit credits. Missing pricing is a launch blocker, not a best-effort warning.
- Do not silently fall back across different models. A selected model is part of the product contract; if it is unavailable, show a clear failure unless an explicit fallback policy exists.
- Same-model retries for transient provider/network errors are allowed.
- Free hosted AI targets about `$0.50` provider cost per free user per month. Public credit display is a product conversion, not a direct cents mapping.
- BYOK, local models, and subscription passthroughs are separate payer paths. They must not be mixed into platform-credit billing.
- Mini-apps default to no Sage memory, no connector bridge, and no hosted AI spend until the app contract grants those permissions explicitly.
- Runtime is infrastructure, not a fourth product surface. Sage, Studio, and trusted first-party mini-app flows may use runtime targets, but the usage event still belongs to the product surface that started it.
- Sage Cloud Computer is an explicit metered beta mode. It is never the default runtime target, and public/untrusted mini-apps cannot use it.

## Canonical Usage Event

Every billable AI path should be able to produce the same event shape:

```json
{
  "workspace_id": "workspace",
  "user_id": "user",
  "surface": "sage | studio | mini_app",
  "source_surface": "sage_direct_chat | deployed_agent_channel | mini_app_invoke",
  "app_id": "mini-app-id",
  "agent_id": "agent-id",
  "thread_id": "thread-id",
  "run_id": "run-id",
  "provider": "deepseek",
  "model": "deepseek-v4-flash",
  "input_tokens": 0,
  "cached_input_tokens": 0,
  "cache_write_tokens": 0,
  "cache_read_tokens": 0,
  "visible_output_tokens": 0,
  "reasoning_tokens": 0,
  "thinking_tokens": 0,
  "provider_cost_usd": 0.0,
  "retail_credits_charged": 0.0,
  "payer": "platform_credits | BYOK | local | subscription_passthrough",
  "estimation_mode": "provider_usage_exact",
  "fallback_attempt": false,
  "success": true,
  "error_code": null,
  "created_at": "2026-05-20T00:00:00Z"
}
```

`surface` is the canonical product-facing field for new usage events. `source_surface`
is retained as a lower-level compatibility field for existing ledgers, runtime call
sites, and historical reporting rows.

## Layer Defaults

- Sage: platform credits by default, with BYOK/local/subscription passthrough as explicit alternatives.
- Studio: each deployed agent stores its AI source. The request payload must not spoof payer/source.
- Mini-apps: AI invoke is denied unless the mini-app contract grants `app.ai.invoke`, a platform-credit AI budget policy, and an active open app session. BYOK/local mini-app routing remains a separate follow-up until its routing and history enforcement are real.

## Credit Types

Users see one credit balance, but internal ledger rows must preserve the credit type:

- `ai_tokens`
- `computer_runtime`
- `connector_read`
- `storage`
- `gateway_relay`
- `mini_app_action`

BYOK, local, and subscription passthrough usage can still produce transparency rows, but those rows must not debit Empyralis AI credits.

## Runtime Usage Event

Cloud Computer and other runtime minutes are metered separately from AI tokens:

```json
{
  "surface": "sage | studio | mini_app",
  "runtime_target": "sage_cloud_computer",
  "runtime_type": "cloud_computer",
  "session_id": "runtime-session-id",
  "started_at": "2026-05-20T00:00:00Z",
  "ended_at": "2026-05-20T00:05:00Z",
  "active_seconds": 300,
  "billable_seconds": 240,
  "estimated_cost_usd": 0.08,
  "credit_type": "computer_runtime",
  "thread_id": "thread-id",
  "run_id": "run-id",
  "agent_id": "agent-id",
  "app_id": "mini-app-id"
}
```

Cloud Computer sessions require isolation, max runtime, allowlists, a stop control, action history, and human confirmation for sensitive actions such as payments, login, file deletion, sending messages, purchases, and external posts.

## Mini-App Trust Tiers

- `user_private`: user-created app; platform AI only while active and only with consent/caps.
- `first_party`: Empyralis-built app; can request expanded grants, including background AI later.
- `reviewed_partner`: marketplace app after review; platform AI only through policy.
- `public_untrusted_url`: random URL or shared install; no platform AI, local hardware, CLI, or Cloud Computer access by default.

## Launch Gate

Before the next larger product phase, these checks must pass:

- DeepSeek V4 Flash/Pro have explicit pricing entries.
- Provider usage normalizers preserve cached, reasoning, and thinking token classes when returned.
- Platform-paid usage cannot debit against unknown pricing.
- Platform-paid usage must include provider/model, provider token usage, known pricing, provider cost, and no fallback attempt.
- Cross-model fallback is disabled unless explicitly configured.
- Mini-app AI invoke requires a contract, permission, consent, and budget policy.
- Mini-app platform AI requires an active open app session unless a first-party background grant exists.
- Runtime usage emits a `computer_runtime` credit event with session timing and target attribution.
- Activity/usage history can identify Sage, Studio, and mini-app spend separately.
