# Studio AI Provider And Credits Strategy - 2026-05-16

## Verdict

Studio should not feel like a model catalog or a cloud console. It should feel like a business agent builder.

The right product model is:

1. Non-technical users use Empyralis credits.
2. Technical users can connect their own API key.
3. The Studio Model tab shows the selected AI route and answer quality, not every provider detail.
4. Integrations owns provider setup, API keys, MCP, channels, runtime nodes, and custom APIs.
5. Sage can expose more technical routes than Studio because Sage is the owner's personal workbench.

The current word `fallback` must be removed from Studio UI copy. In the current code it means static model metadata shown when live model discovery is unavailable. Users will read it as runtime failover to another model. That is a dangerous mismatch.

## Research Snapshot

| Platform | How Model Access Is Presented | What Users Configure | Cost/Limit Pattern | Lesson For Empyralis |
|---|---|---|---|---|
| OpenAI API | Projects, API keys, model permissions, rate limits, budgets | Project keys, service accounts, model access, budget/rate limits | Prepaid credits and project budgets | Keep provider keys server-side, support budgets, and use project/workspace scoping. |
| OpenAI GPTs | Instructions, knowledge, capabilities, actions, preview | Behavior, source files, tools/actions | ChatGPT plan entitlement, not raw API key flow | Studio agent builder should be configuration plus preview, not model-first. |
| Anthropic API | Organization/workspaces, API keys, workspace limits | Workspace keys, spend/rate limits, usage reporting | Spend limits and rate limits by workspace/org | Workspace-level cost controls are a core platform primitive. |
| Claude Projects | Project instructions, project knowledge, shared chats | Instructions and documents | Product-plan access, no raw context setting for normal users | Knowledge and instructions stay calm and document-like. |
| Google Gemini API | AI Studio API key, list models endpoint, usage tiers | API key and project billing | Usage tiers based on Google Cloud spending | Fetch model availability live; do not hardcode public model lists as truth. |
| Gemini Gems | Name, instructions, knowledge files, preview | Instructions and files | Consumer/Workspace entitlement | Normal builders hide raw API/catalog complexity. |
| Amazon Bedrock Agents | Agent details, model, instructions, action groups, knowledge bases, guardrails, memory | Model, action groups, KBs, memory retention, prepare/test/deploy | AWS account billing, IAM, quotas | Good separation of model, actions, knowledge, memory, but too console-heavy for Empyralis. |
| Cursor | Auto model route plus direct model choice and optional API keys | Auto route, model choice, BYOK in settings | Included usage plus usage-priced model consumption | Empyralis should copy the simple route idea, not expose every model by default. |
| Dify | System providers and custom providers | Managed providers or workspace API keys | Workspace provider setup, validated credentials | Good pattern: managed default for getting started, BYOK for production control. |
| OpenRouter | One OpenAI-compatible API for many models/providers | One key, model ID, optional routing/fallback | Pay as you go, model catalog pricing, BYOK tiers | Best developer escape hatch for many models without hardcoding every provider. |

Sources:

- OpenAI projects support project API keys, permissions, rate limits, and budgets: https://help.openai.com/en/articles/9186755-managing-projects-in-the-api-platform
- OpenAI prepaid billing sells API credits and halts usage when balance reaches zero: https://help.openai.com/en/articles/8264778-what-is-prepaid-billing
- OpenAI models endpoint lists currently available API models: https://platform.openai.com/docs/api-reference/models/list
- OpenAI GPTs use instructions, knowledge, capabilities, actions, and preview: https://help.openai.com/en/articles/8554407
- Anthropic workspaces have scoped API keys, spend limits, rate limits, and usage reporting: https://platform.claude.com/docs/en/manage-claude/workspaces
- Anthropic rate limits include spend limits and rate limits: https://docs.anthropic.com/en/api/rate-limits
- Claude Projects separate project knowledge and instructions: https://support.claude.com/en/articles/9519177-how-can-i-create-and-manage-projects
- Gemini API lists models from `https://generativelanguage.googleapis.com/v1beta/models`: https://ai.google.dev/api/models
- Gemini API tiers are tied to project usage and spending: https://ai.google.dev/gemini-api/docs/rate-limits
- Google API key best practices warn against client-side keys and recommend least privilege: https://cloud.google.com/docs/authentication/api-keys-best-practices
- Bedrock Agents separate model, action groups, knowledge bases, and prompt customization: https://docs.aws.amazon.com/bedrock/latest/userguide/agents.html
- Bedrock memory has explicit session summary and retention controls: https://docs.aws.amazon.com/bedrock/latest/userguide/agents-configure-memory.html
- Cursor presents Auto model selection and usage-priced model consumption: https://docs.cursor.com/get-started/usage
- Dify separates system managed providers from custom provider API keys: https://docs.dify.ai/en/use-dify/workspace/model-providers
- OpenRouter exposes OpenAI-compatible access, model pricing, and routing/fallback: https://openrouter.ai/pricing

## Current Empyralis State

| Area | Current Behavior | Status |
|---|---|---|
| Provider catalog | Backend merges static provider metadata, workspace live model cache, runtime truth, hosted AI policy, pricing, and marketplace providers. | Strong foundation, UI language needs work. |
| Live model discovery | Provider credential save and refresh can cache `cached_models`, source, sync time, expiry, error, and fingerprint. | Good foundation. Needs clearer UX and stricter readiness semantics. |
| Studio Model tab | Shows quality tiers, provider strip, search, model cards, manual model ID, and catalog status. Uses `Fallback catalog` copy. | Too much for ordinary users. |
| Integrations | Already owns provider connections and API key entry. | Correct ownership. Needs clearer provider grouping and post-connect model sync state. |
| Hosted credits | Billing summary includes hosted AI eligibility, caps, usage, and remaining credit-like state. | Direction is right, but product policy needs simplification. |
| BYOK credentials | Provider credentials are owner-scoped and stored through the vault path. | Good direction. Needs production KMS/secret-manager story and no-raw-key guarantees. |
| Secret broker | Hosted provider secrets resolve through brokered paths and audit events. | Good direction. Needs consistent priority and tests across providers. |
| Studio runtime | Text/API runtime is the default direction; computer runtimes exist but are guarded and should not be the default. | Correct. Keep computer-use separate and premium/metered. |

Important code locations:

- Studio model UI: `frontend/lib/workspace/deployed-agents/ai-settings.tsx`
- Provider catalog projection: `server_modules/provider_catalog_service.py`
- Provider catalog/profile adapters: `server_modules/provider_profiles.py`
- Provider credential save and model refresh: `server_modules/workspace_admin_service.py`
- Secrets broker: `server_modules/secrets_broker.py`
- Billing summary: `server_modules/billing_service.py`
- Credit ledger contract: `server_modules/credit_ledger_contract.py`

## Product Decision

Use two main AI routes:

| Route | Label | Target User | Default Visibility | Billing |
|---|---|---|---|---|
| Hosted | Empyralis credits | Normal business owners, teams, first-time users | Primary | Empyralis credits with caps |
| BYOK | Use my API key | Developers, technical operators, businesses with existing provider accounts | Secondary but visible | Provider bills the customer directly |

Use one developer escape hatch:

| Route | Label | Target User | Rule |
|---|---|---|---|
| Custom compatible API | Custom API-compatible provider | Developers and enterprise users | Requires HTTPS in production, SSRF protection, owner-only setup, manual model ID fallback |

Use OpenRouter as the practical broad-model path:

| Route | Why |
|---|---|
| OpenRouter | One API key, OpenAI-compatible endpoint, many providers/models, live pricing, useful when Empyralis cannot or should not integrate every provider directly |

Do not expose every model by default. The default Studio screen should show one compact selected route and one answer-quality control.

## Studio Model Tab Target

The Model tab should be reduced to a business-facing route card:

```txt
AI provider
Empyralis credits
500 credits remaining

Default answer quality
Balanced

Model
Automatically selected for customer support
Powered by DeepSeek / Gemini / OpenAI depending on route

[Change provider] [Change model]
```

The full model catalog belongs behind `Change model`, not on the default screen.

Recommended default hierarchy:

1. Empyralis credits available -> auto-select Balanced route.
2. No credits but connected provider exists -> auto-select best connected Balanced model.
3. No credits and no provider -> block deploy with `Connect AI before launch.`
4. Developer selects Custom compatible API -> allow manual model ID if live discovery fails.

## Rename Plan

Remove these words from normal Studio UI:

- `Fallback catalog`
- `fallback models`
- `fallback model`
- `static catalog`
- `provider fallback`

Use these instead:

| Current Copy | Replacement |
|---|---|
| Fallback catalog | Sample model list |
| fallback models | sample models |
| Fallback models are used only when discovery is unavailable | Connect a provider to see the live models available to your account |
| Catalog status: Fallback catalog | Model list: sample list |
| Manual model ID fallback | Enter model ID manually |

Runtime failover should only appear in developer or reliability contexts. If real failover exists, call it `Backup model route`, not `fallback catalog`.

## Pricing And Packaging Recommendation

Do not launch with many subscription plans. It will confuse users and make cost risk harder to control.

Launch with this:

| Package | What It Means | Why |
|---|---|---|
| Free trial | Small hosted credit grant, BYOK allowed, strict caps | Lets users test without understanding API keys. |
| Pay as you go credits | Buy credits and consume hosted AI, hosted computer, premium tools | Prevents Empyralis from eating unlimited model/runtime cost. |
| One Pro/Business plan later | Seats, workspaces, retention, team controls, higher limits, support | Subscription should sell platform value, not unlimited AI. |

Avoid:

- Unlimited hosted AI.
- Unlimited hosted computer/browser sessions.
- Making BYOK feel required for normal users.
- Showing raw model prices as the main buying decision for nontechnical users.

Credits should cover:

| Usage Type | Credit Policy |
|---|---|
| Hosted text model calls | Meter by token cost plus margin. |
| Hosted image/audio/video generation | Separate higher-cost credit rates. |
| Hosted cloud computer/browser sessions | Meter by minute plus any model/tool usage. |
| Web search/fetch with paid providers | Meter only if the provider cost is meaningful. |
| BYOK model calls | No Empyralis model credits, but still count messages/runs for analytics. |
| BYOK plus hosted tools | Charge credits only for Empyralis-hosted tools/runtime. |

Per-agent and workspace limits are mandatory:

| Limit | Required? | Reason |
|---|---:|---|
| Workspace monthly hosted AI cap | Yes | Prevents platform-level overspend. |
| Per-agent monthly budget | Yes | One broken deployed agent cannot drain the workspace. |
| Per-run max cost estimate | Yes | Stops runaway context/tool loops. |
| Daily message limit per deployed agent | Yes | Protects public channels from abuse. |
| Hosted computer minute cap | Yes | VM/browser cost is much higher than text. |
| Owner alert thresholds | Yes | Operators need warning before cutoff. |

## Security Model

The platform should assume API keys, hosted provider keys, channel tokens, and runtime credentials are high-value secrets.

Hard rules:

1. Raw provider keys never go to the frontend after save.
2. Raw provider keys are never stored in provider profile metadata.
3. API keys are encrypted at rest using a production secret manager or envelope encryption.
4. All key management actions are owner-only.
5. All secret reads are audited by workspace, provider, agent, run, actor, purpose, and allowed fields.
6. Runtime access to secrets uses short-lived scoped grants, not long-lived environment variables.
7. Custom API base URLs are denied unless they pass SSRF protection.
8. Hosted provider secrets and BYOK credentials must be separate ownership lanes.
9. Model prompts and tool logs must be redacted before persistence.
10. Deploy must fail closed if no usable hosted or BYOK model route exists.

Custom API-compatible provider SSRF rules:

| Rule | Requirement |
|---|---|
| Protocol | HTTPS required in production. |
| Host validation | Deny localhost, loopback, link-local, private IP ranges, metadata IPs, unix sockets, and non-public DNS results. |
| Redirects | Disable redirects or revalidate every redirect target. |
| Timeout | Short connect/read timeout. |
| Headers | Only controlled provider headers. |
| Logging | Never log key, full auth header, or full URL with credentials. |
| Egress | Prefer outbound allowlist for production. |

Computer-use security rules:

| Rule | Requirement |
|---|---|
| Default Studio text agents | No computer runtime. |
| Hosted cloud computer | Premium/metered and explicit. |
| Customer local computer | Owner-attached and approval-gated. |
| Customer hosted runtime | Explicit deployment profile with health checks. |
| Tool execution | Approval, allowlist, kill switch, session TTL, filesystem boundaries. |
| Secrets | No automatic browser/terminal access to model or provider keys. |

## Implementation Plan

### Phase 0 - Immediate Copy And Mental Model Cleanup

Goal: stop confusing users now.

- Rename `Fallback catalog` to `Sample model list`.
- Rename `fallback models` to `sample models`.
- Change the helper copy to: `Connect a provider to see the live models available to your account.`
- Keep backend field names unchanged.
- Add a small comment in the frontend explaining that sample list means static catalog, not runtime fallback.

Acceptance:

- No `fallback` word appears in normal Studio Model tab UI.
- Runtime failover terminology is not mixed with model-discovery fallback.

### Phase 1 - Compact Studio Model Tab

Goal: make Studio feel like a business agent builder.

- Replace default catalog grid with an `AI provider` route card.
- Show `Empyralis credits` first when hosted credits are available.
- Show `Use my API key` as a secondary route.
- Show selected answer quality: `Fast`, `Balanced`, `Best`.
- Show exact model only as secondary text.
- Move full model search/list behind `Change model`.
- Keep `Enter model ID manually` inside the model picker for connected/custom providers.

Acceptance:

- A nontechnical user sees one clear route, not a wall of model cards.
- A developer can still reach exact model selection.
- Studio hides CLI/local/personal subscription routes.

### Phase 2 - Integrations Provider Setup

Goal: make setup live in the right place.

- Add a `Model providers` group in Integrations.
- Provider cards:
  - Empyralis credits
  - OpenRouter
  - OpenAI
  - Anthropic
  - Google Gemini
  - Google Vertex AI
  - Groq
  - xAI
  - DeepSeek
  - Mistral
  - Qwen
  - Azure OpenAI
  - Custom API-compatible
- Paste key -> validate -> fetch models -> cache -> show connected state.
- Failed discovery keeps previous successful cache and offers manual model ID.

Acceptance:

- Provider setup does not happen inside Model tab.
- Newly released provider models appear after refresh without platform deployment.
- No raw API key is returned to the client after save.

### Phase 3 - Backend Readiness And Billing Correctness

Goal: deploy cannot lie.

- Backend deployment must hard-block when no usable hosted or BYOK route exists.
- Normalize readiness states so `configured`, `connected`, `ready`, and `active` do not disagree.
- Fix Studio runtime supply so BYOK routes do not report `billing_source: empyralis_credits`.
- Store selected model price snapshot for analytics.
- Distinguish:
  - `empyralis_credits`
  - `workspace_byok`
  - `openrouter_byok`
  - `custom_compatible_byok`
  - `local_or_cli` for Sage only

Acceptance:

- API clients cannot deploy a broken Studio agent by bypassing UI.
- Results can explain whether a run used credits or customer provider billing.

### Phase 4 - Credit Ledger And Cost Controls

Goal: keep the business from losing money.

- Use one hosted credit ledger for model/tool/runtime spend.
- Add per-workspace monthly cap, per-agent monthly cap, daily public-channel cap, and per-run max estimate.
- Show credit state in:
  - top workspace account surface
  - Integrations AI section
  - Studio Model route card
  - Results cost summary
- Add hard-stop states:
  - `Credits exhausted`
  - `Workspace cap reached`
  - `Agent budget reached`
  - `Provider key missing`
  - `Provider quota/rate limit`

Acceptance:

- Hosted usage stops before uncontrolled spend.
- Users know what to do next: add credits, connect provider, raise cap, or reduce usage.

### Phase 5 - Sage Reuse With Wider Provider Scope

Goal: share the provider system without confusing Studio.

- Sage can show:
  - Empyralis credits
  - BYOK API providers
  - connected computer/local models
  - CLI routes if available
  - OpenRouter/custom providers
- Studio shows:
  - Empyralis credits
  - BYOK API providers
  - OpenRouter/custom providers
  - explicit runtime options only under Integrations/Runtime

Acceptance:

- One backend catalog system.
- Different frontend scopes for Sage and Studio.
- Studio remains customer-serving and simple.

### Phase 6 - Security And Abuse Tests

Goal: prove the platform is not easy to exploit.

Add tests for:

- Saving provider key never exposes raw key in frontend payloads.
- Provider profile metadata never stores raw key.
- Custom base URL blocks localhost/private/metadata endpoints.
- Model refresh cache survives provider outage without lying about readiness.
- Deploy fails without hosted credits or connected BYOK route.
- Hosted credits stop when cap is reached.
- BYOK route is not charged as Empyralis credits.
- Studio hides CLI/local providers.
- Sage can still see CLI/local providers.
- Hosted computer requires explicit runtime selection, approval, and budget.
- Logs redact API keys, bearer tokens, webhook secrets, and channel tokens.

## UI States To Design

| State | Studio Model Tab Should Say |
|---|---|
| Hosted credits available | `Empyralis credits ready` |
| Hosted credits low | `Credits running low` |
| Hosted credits exhausted | `Add credits or connect an API key before launch` |
| BYOK connected | `Using your {Provider} API key` |
| BYOK connected but live model fetch failed | `Using saved provider. Model list could not refresh.` |
| No provider and no credits | `Connect AI before launch` |
| Custom provider connected | `Using custom API-compatible provider` |
| Manual model ID used | `Model entered manually` |

## What Not To Build Yet

- Do not build many pricing plans before live customer usage exists.
- Do not make Studio a full model marketplace.
- Do not offer unlimited hosted computer usage.
- Do not expose all CLI/local providers in Studio.
- Do not make raw model context, token windows, or provider internals the default UI.
- Do not call any normal user section `Advanced`.

## Open Decisions

| Decision | Recommended Default |
|---|---|
| Credit conversion | Start with a simple internal conversion, for example 1000 credits = 1 USD of hosted cost basis, then tune. |
| Hosted default provider | Use the cheapest reliable production route with strong monitoring; keep provider swappable behind Empyralis credits. |
| Free trial amount | Small enough to prevent abuse, enough for one full agent setup and testing. |
| Computer-use packaging | Premium/metered add-on, not included by default. |
| Provider markup | Keep BYOK unmarked except platform fees; hosted credits include margin. |
| OpenRouter role | Developer-friendly broad catalog route, not the default for every nontechnical user. |

## Next Engineering Step

The next implementation pass should be Phase 0 and Phase 1 together:

1. Remove `fallback` copy from Studio Model UI.
2. Replace the default grid-heavy Model tab with the compact AI route card.
3. Keep full model selection behind `Change model`.
4. Keep API key setup in Integrations.
5. Add tests proving Studio hides CLI/local routes and deploy blocks without usable AI.

That is the smallest pass that fixes the confusing user experience without changing backend schema.
