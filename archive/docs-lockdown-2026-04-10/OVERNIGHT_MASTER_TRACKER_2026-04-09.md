# Overnight Master Tracker

Date: 2026-04-09  
Mode: research-only, no product code changes  
Operator: Codex acting as overnight research/architecture auditor

## Objective

Prepare a launch-ready UI strategy and stability report without modifying product code.  
Deliver:

- a full frontend audit
- a benchmark study against top-tier platforms
- a prioritized renewal strategy
- 30 to 40 execution prompts for tomorrow
- a backend chaos-engineering report

## Constraint Log

- No product code changes were made during this operation.
- Documentation only.
- All findings were recorded into new files under `/Users/mansur/Multi_Agent_Orchestrator_Project/docs`.

## Files Created Tonight

- [OVERNIGHT_FRONTEND_AUDIT_2026-04-09.md](/Users/mansur/Multi_Agent_Orchestrator_Project/docs/OVERNIGHT_FRONTEND_AUDIT_2026-04-09.md)
- [OVERNIGHT_BENCHMARK_STUDY_2026-04-09.md](/Users/mansur/Multi_Agent_Orchestrator_Project/docs/OVERNIGHT_BENCHMARK_STUDY_2026-04-09.md)
- [OVERNIGHT_RENEWAL_STRATEGY_2026-04-09.md](/Users/mansur/Multi_Agent_Orchestrator_Project/docs/OVERNIGHT_RENEWAL_STRATEGY_2026-04-09.md)
- [OVERNIGHT_EXECUTION_PROMPTS_2026-04-09.md](/Users/mansur/Multi_Agent_Orchestrator_Project/docs/OVERNIGHT_EXECUTION_PROMPTS_2026-04-09.md)
- [OVERNIGHT_BACKEND_CHAOS_ENGINEERING_2026-04-09.md](/Users/mansur/Multi_Agent_Orchestrator_Project/docs/OVERNIGHT_BACKEND_CHAOS_ENGINEERING_2026-04-09.md)

## Step Log

### Step 1: Complete Platform Frontend Audit

Inspected shell, auth, chat, model-selection, navigation, and usage surfaces.

Primary files reviewed:

- [frontend/app/layout.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/layout.tsx)
- [frontend/lib/useSidebarCollapsed.ts](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/lib/useSidebarCollapsed.ts)
- [frontend/components/orion/PlatformTopBar.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/components/orion/PlatformTopBar.tsx)
- [frontend/components/orion/PlatformShellContext.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/components/orion/PlatformShellContext.tsx)
- [frontend/components/orion/chat/ChatSurface.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/components/orion/chat/ChatSurface.tsx)
- [frontend/app/page.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/page.tsx)
- [frontend/app/page.api.ts](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/page.api.ts)
- [frontend/app/page.catalog.ts](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/page.catalog.ts)
- [frontend/app/usage/page.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/usage/page.tsx)
- [frontend/app/api/usage/summary/route.ts](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/api/usage/summary/route.ts)
- [frontend/app/api/usage/runs/route.ts](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/api/usage/runs/route.ts)
- [frontend/components/orion/auth/BrowserSignInPage.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/components/orion/auth/BrowserSignInPage.tsx)
- [frontend/lib/productArchitecture.ts](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/lib/productArchitecture.ts)
- [frontend/lib/shellRoutes.ts](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/lib/shellRoutes.ts)
- [frontend/lib/commandRegistry.ts](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/lib/commandRegistry.ts)
- [frontend/app/home/page.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/home/page.tsx)

Headline findings:

- The shell still encodes an older product architecture with `Home`, `Usage`, `Library`, and workflow-heavy language.
- The left sidebar width is driven by a root CSS variable and animated layout shifts, which likely causes the reported expansion bug and stage shake.
- `New Chat` and `History` are still surfaced from the global top bar instead of being contained strictly inside the chat mode.
- The model picker relies on hardcoded fallback catalogs, including stale aliases like `gpt-4.1`.
- The Usage page promises exact model and token intelligence, but the backend mostly reports masked estimates and partial telemetry.
- The sign-in page explains the identity model repeatedly and is much too verbose for a first-run surface.

Output:

- [OVERNIGHT_FRONTEND_AUDIT_2026-04-09.md](/Users/mansur/Multi_Agent_Orchestrator_Project/docs/OVERNIGHT_FRONTEND_AUDIT_2026-04-09.md)

### Step 2: Benchmark Study

Benchmarked the product surfaces and interaction patterns of:

- Notion
- Linear
- OpenAI Platform
- Google Material 3
- Anthropic
- ElevenLabs

Focus areas:

- primary vs. secondary button treatment
- information density
- sidebar behavior
- notification models
- motion and transitions
- page text economy
- command surfaces

Representative research links used:

- [Notion help and workspace/sidebar docs](https://www.notion.so/notion/Getting-Started-with-Notion-f0e1a6d326d84d6984d948da96965045)
- [Linear changelog](https://linear.app/changelog)
- [Linear inbox docs](https://linear.app/docs/inbox)
- [OpenAI API usage dashboard](https://help.openai.com/en/articles/10478918-api-usage-dashboard)
- [OpenAI prompt generation guide](https://platform.openai.com/docs/guides/prompt-generation/schemas)
- [Anthropic Projects](https://support.claude.com/en/articles/9517075-what-are-projects)
- [Anthropic Artifacts](https://support.claude.com/en/articles/9487310-what-are-artifacts-and-how-do-i-use-them)
- [ElevenLabs Agents dashboard](https://elevenlabs.io/docs/conversational-ai/dashboard)
- [ElevenLabs Studio overview](https://elevenlabs.io/docs/product/projects/overview)
- [Google Material 3 buttons](https://m3.material.io/components/buttons/overview)
- [Google Material 3 navigation drawer](https://m3.material.io/components/navigation-drawer/overview)
- [Google Material 3 snackbar](https://m3.material.io/components/snackbar/overview)

Output:

- [OVERNIGHT_BENCHMARK_STUDY_2026-04-09.md](/Users/mansur/Multi_Agent_Orchestrator_Project/docs/OVERNIGHT_BENCHMARK_STUDY_2026-04-09.md)

### Step 3: Compare and Prioritize

Compared the existing frontend against the benchmark set and converted that into a renewal plan.

Key rule enforced in the plan:

- Chat and Integrations logic stays intact.
- Their visual density, layout clarity, word economy, and control hierarchy must be upgraded.

Output:

- [OVERNIGHT_RENEWAL_STRATEGY_2026-04-09.md](/Users/mansur/Multi_Agent_Orchestrator_Project/docs/OVERNIGHT_RENEWAL_STRATEGY_2026-04-09.md)

### Step 4: Prompt Generation

Built a separated execution list for tomorrow’s UI overhaul.

Structure:

- 36 prompts
- each prompt scoped to one safe refactor zone
- ordered to minimize regression risk
- preserves backend contracts and existing chat/integrations logic

Output:

- [OVERNIGHT_EXECUTION_PROMPTS_2026-04-09.md](/Users/mansur/Multi_Agent_Orchestrator_Project/docs/OVERNIGHT_EXECUTION_PROMPTS_2026-04-09.md)

### Step 5: Backend Chaos Engineering

Performed a logical break analysis of the current backend/control-plane shape.

Primary areas examined:

- multi-tenant defaults and `default` fallback leakage
- control-plane/session boundaries
- template compiler failure modes
- install/version drift
- approval and intervention edge cases
- hard-kill reliability boundaries
- usage telemetry trustworthiness
- BFF drift from runtime/backend truth

Primary files reviewed:

- [server_modules/agent_turn.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/agent_turn.py)
- [server_modules/template_compiler_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/template_compiler_service.py)
- [server_modules/agent_registry_api.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/agent_registry_api.py)
- [server_modules/usage_reporting.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/usage_reporting.py)
- [server_modules/auth.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/auth.py)
- [server_modules/direct_chat_context_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/direct_chat_context_service.py)

Output:

- [OVERNIGHT_BACKEND_CHAOS_ENGINEERING_2026-04-09.md](/Users/mansur/Multi_Agent_Orchestrator_Project/docs/OVERNIGHT_BACKEND_CHAOS_ENGINEERING_2026-04-09.md)

## Summary of Conclusions

### What is already strong

- The backend substrate is much stronger than the current UI suggests.
- The approval/intervention architecture is on the right path.
- The Store + Toggle + Placement pivot is correct.
- Sage as the single visible relationship is correct.

### What is still hurting the product

- stale information architecture
- inconsistent navigation ownership
- hardcoded model/provider fallbacks
- over-explained auth surfaces
- usage telemetry over-claiming precision
- too much old workflow-era vocabulary surviving in shell/nav text

### Morning Priority

If only one thing gets acted on first, it should be:

1. shell/nav simplification
2. chat-mode containment
3. model picker de-hardcoding
4. sign-in simplification

## Final Deliverable Index

- [OVERNIGHT_FRONTEND_AUDIT_2026-04-09.md](/Users/mansur/Multi_Agent_Orchestrator_Project/docs/OVERNIGHT_FRONTEND_AUDIT_2026-04-09.md)
- [OVERNIGHT_BENCHMARK_STUDY_2026-04-09.md](/Users/mansur/Multi_Agent_Orchestrator_Project/docs/OVERNIGHT_BENCHMARK_STUDY_2026-04-09.md)
- [OVERNIGHT_RENEWAL_STRATEGY_2026-04-09.md](/Users/mansur/Multi_Agent_Orchestrator_Project/docs/OVERNIGHT_RENEWAL_STRATEGY_2026-04-09.md)
- [OVERNIGHT_EXECUTION_PROMPTS_2026-04-09.md](/Users/mansur/Multi_Agent_Orchestrator_Project/docs/OVERNIGHT_EXECUTION_PROMPTS_2026-04-09.md)
- [OVERNIGHT_BACKEND_CHAOS_ENGINEERING_2026-04-09.md](/Users/mansur/Multi_Agent_Orchestrator_Project/docs/OVERNIGHT_BACKEND_CHAOS_ENGINEERING_2026-04-09.md)
