# Gemini UI Implementation Brief - 2026-05-17

## Mission

You are the UI implementation agent for Empyralis. Work only on the user interface and visual interaction layer unless you find a UI-blocking data contract bug that must be named in your report.

Do not push. Do not create a branch. Do not mix backend refactors into this pass.

Your job is to make the platform feel coherent, premium, understandable, and durable for a non-technical user creating and operating agents.

## Baseline

The current `main` already includes the pushed Studio stabilization and motion work:

- Studio readiness and chat surface polish.
- Studio motion polish.
- Workspace/account bootstrap recovery.
- Studio Model tab simplification and AI provider/credits strategy.

Start from current `main`.

Before editing, run:

```bash
git status --short
```

If the worktree is not clean, stop and report the exact files before editing.

## Files To Read First

Read these in this order:

1. `docs/frontend-map.md`
2. `docs/studio-agents-launch-readiness-2026-05-15.md`
3. `docs/studio-ai-provider-credits-strategy-2026-05-16.md`
4. `docs/DECISIONS.md`
5. `shared/design-system/tokens.ts`
6. `frontend/lib/ui/motion.tsx`
7. `frontend/lib/ui/chrome.css`
8. `frontend/lib/workspace/workstation-kernel-shell.tsx`
9. `frontend/lib/workspace/workstation-titlebar.tsx`
10. `frontend/lib/workspace/workstation-deployed-agents-pane.tsx`
11. `frontend/lib/workspace/deployed-agents/detail-view.tsx`
12. `frontend/lib/workspace/deployed-agents/roster-sidebar.tsx`
13. `frontend/lib/workspace/deployed-agents/playground-panel.tsx`
14. `frontend/lib/workspace/deployed-agents/ai-settings.tsx`
15. `frontend/lib/workspace/deployed-agents/action-settings.tsx`
16. `frontend/lib/workspace/deployed-agents/integration-settings.tsx`
17. `frontend/lib/workspace/deployed-agents/wizard.tsx`
18. `frontend/lib/workspace/workstation-chat-pane.tsx`
19. `frontend/lib/workspace/workstation-runs-pane.tsx`
20. `frontend/lib/workspace/workstation-gateway-operator-pane.tsx`
21. `frontend/app/login/page.tsx`

Connector image assets already exist here:

- `frontend/public/integrations/telegram.png`
- `frontend/public/integrations/whatsapp.png`
- `frontend/public/integrations/gmail.png`
- `frontend/public/integrations/microsoft365.png`
- `frontend/public/integrations/openai.png`
- `frontend/public/integrations/anthropic.png`
- `frontend/public/integrations/gemini.jpg`
- `frontend/public/integrations/deepseek.jpg`
- `frontend/public/integrations/mistral.png`
- `frontend/public/integrations/qwen.png`
- `frontend/public/integrations/ollama.png`
- `frontend/public/integrations/notion.png`
- `frontend/public/integrations/slack.png`
- `frontend/public/integrations/github.png`
- `frontend/public/integrations/webhook.png`

Do not generate new connector images in this pass unless specifically requested later. First reuse, normalize, and frame the existing assets.

## Product Direction

### Primary IA

The platform should feel like one serious workspace, not many unrelated dashboards.

Left rail:

- Sage
- Agents
- Computers
- Discover
- Activity
- Settings

Sage top tabs:

- Chat
- History
- Memory
- Integrations
- Tasks
- Library

Studio agent tabs:

| Tab | Meaning | UI Rule |
|---|---|---|
| Overview | Launch readiness and health | Command center, not raw settings |
| Chat | Private test conversation | Must feel like real chat |
| Knowledge | Instructions and trusted sources | Calm document/source builder |
| Model | AI route and quality | Selected route first, catalog hidden behind change action |
| Actions | What the agent may do | Playbooks and permissions only |
| Memory | Customer/session memory | Not source files, not instructions |
| Integrations | Accounts, channels, providers, MCP, custom APIs, runtime nodes | Setup lives here |
| Results | Conversations, outcomes, usage, cost | Real evidence, not decorative analytics |

### Studio Runtime Direction

Default Studio agents are text/API cloud agents. Do not make virtual machines or local CLI routes feel like the default customer-serving path.

Sage can remain more technical. Studio should be business-user clear.

## UX Problems To Inspect

Inspect the live UI for these likely problems:

1. Text overlapping or collapsing into one line in Studio tabs.
2. Loading states that look like broken blocks instead of intentional skeletons.
3. White/light mode controls with dark/black leftover styling.
4. Studio Overview looking empty or too sparse.
5. Studio Chat not feeling like a real conversation.
6. Model tab still feeling like a catalog/cloud console.
7. Actions tab mixing playbooks, tools, MCP, and integration setup.
8. Integrations tab looking like a list of settings rather than connected accounts/channels/providers.
9. Activity and Computers left-rail destinations duplicating other surfaces without clear purpose.
10. Login page contrast/autofill problems in light mode.
11. Composer focus states showing rectangular browser outlines instead of polished platform focus.
12. Motion being inconsistent across tabs, cards, selected rows, and loading states.
13. Empty states that explain too much or too little.
14. Header/top-tab wrapping at narrow desktop widths.
15. Floating buttons or badges that do not explain what they open.

## Implementation Scope

Make a UI pass across the following surfaces, in priority order.

### 1. Studio Agents

Primary files:

- `frontend/lib/workspace/workstation-deployed-agents-pane.tsx`
- `frontend/lib/workspace/deployed-agents/detail-view.tsx`
- `frontend/lib/workspace/deployed-agents/roster-sidebar.tsx`
- `frontend/lib/workspace/deployed-agents/playground-panel.tsx`
- `frontend/lib/workspace/deployed-agents/ai-settings.tsx`
- `frontend/lib/workspace/deployed-agents/action-settings.tsx`
- `frontend/lib/workspace/deployed-agents/integration-settings.tsx`
- `frontend/lib/workspace/deployed-agents/wizard.tsx`
- `frontend/lib/workspace/deployed-agents/components.tsx`
- `frontend/lib/workspace/deployed-agents/constants.ts`
- `frontend/lib/workspace/deployed-agents/types.ts`
- `frontend/lib/workspace/deployed-agents/utils.ts`

Target result:

- Left panel remains agent roster only.
- Right panel has consistent top alignment, section rhythm, width, and tab behavior.
- Overview becomes a true command center:
  - Launch readiness
  - Model/provider state
  - Channel state
  - Knowledge/source state
  - Memory state
  - Recent private test
  - Deploy blockers
  - Cost/usage signal
- Chat uses a real message transcript and composer.
- Knowledge separates instructions, sources, retrieval/test.
- Model shows selected AI route first, not the full model list.
- Actions separates playbooks from tool permissions.
- Integrations owns setup for providers, channels, MCP, custom APIs, runtime nodes.
- Results shows evidence and next useful action.

### 2. Sage Chat / Main Agent

Primary files:

- `frontend/lib/workspace/workstation-chat-pane.tsx`
- `frontend/lib/workspace/chat-message.tsx`
- `frontend/lib/workspace/sage-chat/*`
- `frontend/lib/workspace/workstation-titlebar.tsx`
- `frontend/lib/workspace/workstation-kernel-shell.tsx`

Target result:

- Composer focus state is polished in dark and light modes.
- Credits/model/tools indicators are clear but not noisy.
- No internal runtime state appears as assistant transcript copy.
- The floating new-chat button, credits state, and model route controls do not compete.

### 3. Integrations / Connectors

Primary files:

- `frontend/lib/workspace/workstation-split-workbench.tsx`
- `frontend/lib/workspace/workstation-gateway-operator-pane.tsx`
- `frontend/lib/workspace/deployed-agents/integration-settings.tsx`
- `frontend/public/integrations/*`

Target result:

- Apps, channels, model providers, computer, knowledge, skills, and developer tools feel like distinct groups.
- Connector cards use consistent image treatment and status.
- API provider setup does not look like the user must understand every model.
- MCP/custom APIs stay in Integrations, not Actions.
- Computer setup is not presented as required for ordinary Studio text agents.

### 4. Activity / Computers IA

Primary files:

- `frontend/lib/workspace/workstation-runs-pane.tsx`
- `frontend/lib/workspace/workstation-gateway-operator-pane.tsx`
- `frontend/lib/workspace/workstation-titlebar.tsx`
- `frontend/lib/workspace/workspace-shell.ts`

Research question:

- Should Activity remain a left-rail primary destination, or should it be a proof timeline inside Sage/Results?
- Should Computers remain primary, or should it live under Integrations until the user connects one?

Do not remove these destinations without a clear report and a separate approval. For this pass, make the current UI less confusing if the path is obvious.

### 5. Login / Auth Surface

Primary files:

- `frontend/app/login/page.tsx`
- `frontend/app/globals.css`
- `frontend/lib/ui/chrome.css`

Target result:

- Light mode inputs must not show dark unreadable fields.
- Browser autofill/password manager overlays should not make input text unreadable.
- The page should look premium and simple, not like a broken white mode.

## Motion Direction

Use existing motion primitives. Do not add a new animation library.

Primary files:

- `frontend/lib/ui/motion.tsx`
- `frontend/lib/ui/skeleton-block.tsx`
- `frontend/lib/ui/chrome.css`

Motion rules:

- Hover/press: 80-120ms.
- Tab/content transitions: 120-180ms.
- Panel/sheet transitions: 180-240ms.
- Loading shimmer/pulse: subtle, disabled or reduced under `prefers-reduced-motion`.
- Do not create decorative loops except loading/live indicators.
- Motion must clarify state changes. It must not hide broken layout.

High-value motion targets:

- Studio tab content transition.
- Selected roster row.
- Overview readiness cards.
- Launch status badge state changes.
- Chat message arrival.
- Composer focus lift.
- Provider refresh/loading.
- Connector card status changes.
- Empty/loading screens.

## Color And Visual Rules

- Fix light mode and dark mode together.
- Do not create one-off colors where tokens already exist.
- Avoid one-note palettes dominated by only one hue.
- Cards should be used for repeated items, modals, and framed tools, not nested inside other cards.
- Do not add decorative gradient orbs or bokeh blobs.
- Use connector/provider images as small anchored identity signals, not oversized decoration.
- Text must not overlap, truncate incoherently, or collapse into adjacent labels.

## Assets Plan

Do not generate images in this pass. Instead:

1. Audit existing images in `frontend/public/integrations`.
2. Normalize usage:
   - consistent square frame
   - consistent background
   - consistent size
   - no blurry upscaling
   - transparent/light/dark compatibility
3. Write a short asset gap list in your report:
   - which connector/provider images need replacement
   - desired style
   - exact target dimensions
   - where future generated images should be saved

Suggested future path if image generation is requested later:

- `frontend/public/integrations/generated/`

Do not create that folder unless you are adding real assets.

## What Not To Do

- Do not push.
- Do not create a branch.
- Do not rename product IA without reporting the impact.
- Do not touch backend runtime logic except to fix a UI-blocking type contract with a clear note.
- Do not add a visible `Advanced` button.
- Do not expose CLI/local/personal model routes in Studio Model.
- Do not put MCP setup in Actions.
- Do not make Studio agents require connected computers.
- Do not add hardcoded agent names or fixed business templates as if they are the product.

## Required Verification

Run at minimum:

```bash
npm run typecheck --prefix frontend
npm run build --prefix frontend
```

If touching E2E-covered deployed-agent behavior, also run:

```bash
npm run test:e2e:deployed-agents --prefix frontend
```

Browser QA:

- Studio Overview, Chat, Knowledge, Model, Actions, Memory, Integrations, Results in dark mode.
- Same surfaces in light mode.
- Sage Chat in dark and light mode.
- Login page in light mode.
- Integrations in dark and light mode.
- Loading state for slow/empty agents roster.
- Reduced motion emulation if available.

## Output Report

Write your report to:

`docs/reports/gemini-ui-pass-report-2026-05-17.md`

If `docs/reports` does not exist, create it.

Report format:

```md
# Gemini UI Pass Report - 2026-05-17

## Summary

## Files Changed

## Screens Inspected

## Problems Found

## Problems Fixed

## Still Risky Or Not Fixed

## Asset Gaps

## Verification

## Recommended Next Pass
```

Include exact file paths and exact commands run.
