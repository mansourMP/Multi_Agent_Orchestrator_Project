# Gemini Onboarding Certification Report - 2026-05-17

## Executive Summary
Successfully completed the "Onboarding Certification" phase for Gemini's product experience domain. The focus was on simplifying the Studio Agent creation flow for non-technical business users, clarifying AI route choices (Credits vs. BYOK), and polishing the private test chat environment.

## Files Changed
- `frontend/lib/workspace/deployed-agents/constants.ts`: Simplified wizard step labels and descriptions.
- `frontend/lib/workspace/deployed-agents/wizard.tsx`: Refactored wizard UI to remove step numbers and technical metadata.
- `frontend/lib/workspace/deployed-agents/ai-settings.tsx`: Refactored AI settings to prioritize Credits/BYOK choices and hide the model catalog by default.
- `frontend/lib/workspace/deployed-agents/utils.ts`: Removed "tokens" wording and simplified model capacity readouts.
- `frontend/lib/workspace/workstation-runs-pane.tsx`: Simplified Activity pane and removed internal "Pilot proof" section.
- `frontend/lib/workspace/workstation-gateway-operator-pane.tsx`: Updated Computer/Gateway setup descriptions to feel optional.
- `frontend/lib/workspace/workstation-deployed-agent-test-turn-pane.tsx`: Polished private test chat and hid technical trace IDs behind a "System proof" details tag.
- `frontend/lib/ui/chrome.css`: Added styles for the new AI route choices, polished the chat composer, and fixed unreadable input fields in light mode.

## Onboarding Flow Improvements
- **Simplified Steps**: Removed "Step 1, Step 2..." numbering in favor of a clean progress bar and descriptive titles (e.g., "Basics", "Knowledge", "Actions").
- **Business Language**: Replaced technical jargon like "Context preset" with "Knowledge depth" and "Retention" with "Customer memory".
- **Review Clarity**: The final review step now focuses on launch readiness rather than raw infrastructure stats.

## Model/Provider Clarity Improvements
- **Route Summary**: The Model tab now shows the currently selected route and quality tier as a high-signal "Route Card" first.
- **Two Choices**: Users are presented with two clear paths: "Empyralis Credits" (recommended) or "Connect Your Own Provider" (BYOK).
- **Hiding Complexity**: The raw model catalog and technical metrics (pricing, context windows) are hidden behind a "Change route" action.

## Chat Improvements
- **Real Conversation Feel**: The private test chat now behaves more like a production messaging surface.
- **Subtle Metadata**: System proof (trace IDs, tools used, memory checks) is now collapsed under a "System proof" summary to avoid dominating the conversation.
- **Composer Polish**: Improved focus states and shadow patterns for the test chat input.

## Activity/Computers IA Changes
- **Activity as Audit**: Refocused the Activity pane on "proof and outcomes". Removed internal pilot-tracking stats that were confusing for business users.
- **Optional Computers**: Updated all copy in the Computers view to emphasize that connecting a machine is optional and runtime-specific. Replaced "Advanced" access mode with "Autonomous".

## Light Mode Fixes
- **Readable Inputs**: Kept the auth inputs explicitly white in light mode so typed and autofilled values remain readable.
- **Autofill Polish**: Ensured that browser autofill and password manager overlays do not result in unreadable white-on-white or black-on-black text.

## Codex Review Adjustments
- Restored the tested `Create agent` wording in the wizard so existing launch-path tests and user expectations stay intact.
- Changed the Studio Model route cards from clickable articles to keyboard-accessible buttons.
- Treated Empyralis Credits as the default ready route in the Model tab and launch checklist.
- Restored Overview command-center signals for messages, open outcome, and budget burn after E2E caught that they were missing.
- Kept generated Next and Playwright result files out of the commit.

## Verification Commands and Results
- `git diff --check`: **Passed** (No trailing whitespace or conflict markers).
- `npm run typecheck --prefix frontend`: **Passed**.
- `npm run build --prefix frontend`: **Passed** (Next.js production build successful).
- `npm run test:e2e:deployed-agents --prefix frontend`: **Passed** (3 tests).

## Remaining Gaps
- **Playground API Bridge**: While the UI is polished, the "Search Test" input in the Knowledge tab still redirects to Chat. A direct inline search preview would further improve the "Command Center" feel.
- **Provider One-Click**: The BYOK path still requires users to select providers from a list; a true "One-Click" OAuth connection for major providers would be the ideal next step.
