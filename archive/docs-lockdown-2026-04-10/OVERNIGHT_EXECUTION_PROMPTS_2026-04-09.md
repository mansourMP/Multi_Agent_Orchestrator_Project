# Overnight Execution Prompts

Date: 2026-04-09  
Use these one by one tomorrow.  
Each prompt is intentionally narrow to reduce regression risk.

## Prompt 1

Refactor the global shell geometry only. Stabilize the left sidebar collapse behavior without changing product logic. Keep the content stage visually anchored while the sidebar changes state. Do not redesign any route content yet. Focus on [frontend/app/layout.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/layout.tsx) and [frontend/lib/useSidebarCollapsed.ts](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/lib/useSidebarCollapsed.ts). Remove whole-stage width and margin-left animation drift. The result should eliminate visible content shake when collapsing the sidebar or navigating between pages.

## Prompt 2

Refactor the top shell so it stops owning chat-local actions. Move `New Chat` and `History` out of the global top bar and into the chat-only surface. Preserve current functionality. Touch [frontend/components/orion/PlatformTopBar.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/components/orion/PlatformTopBar.tsx), [frontend/app/page.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/page.tsx), and [frontend/components/orion/chat/ChatSurface.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/components/orion/chat/ChatSurface.tsx). The top bar should only show platform navigation, status, and cross-platform notices.

## Prompt 3

Simplify the shell route model and remove stale workflow-era wording from route titles, breadcrumbs, and slot labels. Keep route behavior intact. Update [frontend/lib/productArchitecture.ts](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/lib/productArchitecture.ts) and [frontend/lib/shellRoutes.ts](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/lib/shellRoutes.ts). Replace internal-sounding “workflow/library/platform home” language with Sage-, agents-, runs-, approvals-, and integrations-oriented labels.

## Prompt 4

Clean the command palette language so it reflects the new product identity. Do not change navigation targets, only wording and grouping. Update [frontend/lib/commandRegistry.ts](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/lib/commandRegistry.ts) and any directly related command-palette presentation files. Remove stale “recent workflows,” “workflow-backed systems,” and similar pre-pivot copy.

## Prompt 5

Refactor the main chat page header to make Sage feel like the single central relationship. Keep backend behavior unchanged. Improve the visual hierarchy in [frontend/app/page.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/page.tsx) and [frontend/components/orion/chat/ChatSurface.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/components/orion/chat/ChatSurface.tsx). The result should feel calmer, denser, and less like a prototype workbench.

## Prompt 6

Upgrade the chat composer density and button hierarchy without changing any logic. Keep attachments, voice input, model selection, trust indicator, and send behavior exactly intact. Refine spacing, alignment, and button prominence in [frontend/components/orion/chat/ChatSurface.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/components/orion/chat/ChatSurface.tsx) so it feels closer to Linear and Claude than to a generic dashboard.

## Prompt 7

Refactor the model selector into a truthful model surface. Do not hardcode stale fallback aliases into the visible menu. Preserve existing backend contracts. Update [frontend/app/page.catalog.ts](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/page.api.ts) and [frontend/components/orion/chat/ChatSurface.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/components/orion/chat/ChatSurface.tsx). The UI should visibly separate provider, model, and reasoning effort.

## Prompt 8

Expose reasoning effort cleanly in the chat UI as `Low`, `Medium`, `High`, and `Extra High`, mapped to the existing underlying values. Do not change execution semantics. Update [frontend/app/page.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/page.tsx), [frontend/components/orion/chat/ChatSurface.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/components/orion/chat/ChatSurface.tsx), and any shared label logic. This must feel first-class, not hidden.

## Prompt 9

Refine the chat identity/context drawer so it feels like a useful operator context panel rather than a technical dump. Preserve content and actions. Work in [frontend/components/orion/chat/ChatSurface.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/components/orion/chat/ChatSurface.tsx). Reduce visual noise, tighten rows, and make sections easier to scan.

## Prompt 10

Polish the `ApprovalRequestCard` visual hierarchy only. Keep its behavior and API calls unchanged. Update [frontend/components/orion/chat/ApprovalRequestCard.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/components/orion/chat/ApprovalRequestCard.tsx) so it reads like a serious operator intervention card, not a generic panel.

## Prompt 11

Refine intervention cards so loop-detected, handoff, connect-required, and system-error states feel coherent with the approval card design language. Keep intervention logic unchanged. Update [frontend/components/orion/chat/InterventionCards.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/components/orion/chat/InterventionCards.tsx).

## Prompt 12

Compress message spacing and transcript density in the main chat. Do not change transcript behavior. Refine [frontend/components/orion/chat/ChatSurface.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/components/orion/chat/ChatSurface.tsx) so long sessions feel more like Notion/Linear information density and less like a loose prototype chat.

## Prompt 13

Simplify the sign-in page drastically. Keep auth logic and provider behavior unchanged. Work in [frontend/components/orion/auth/BrowserSignInPage.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/components/orion/auth/BrowserSignInPage.tsx). Cut explanatory copy aggressively, remove duplicated identity messaging, and make the page feel fast and premium.

## Prompt 14

Create a second-pass sign-in copy polish. After the layout simplification is done, rewrite all remaining text in [frontend/components/orion/auth/BrowserSignInPage.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/components/orion/auth/BrowserSignInPage.tsx) for word economy. Avoid repeated use of Empyralis, account boundary, provider linking, and recovery-safe phrasing.

## Prompt 15

Refactor the Home page so it no longer centers workflows as the hero narrative. Keep the route alive, but visually subordinate it to Sage and installed agents. Update [frontend/app/home/page.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/home/page.tsx). Replace workflow-dominant hero copy with cleaner workspace continuation framing.

## Prompt 16

Audit and redesign the AppSidebar visual density only. Preserve route targets. Use [frontend/components/ui/AppSidebar.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/components/ui/AppSidebar.tsx) and related style files. The sidebar should feel dimmer and calmer, with the main stage clearly dominant.

## Prompt 17

Refine the `/store` page into a premium first-party catalog. Do not change data loading or install logic. Update [frontend/app/store/page.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/store/page.tsx) and [frontend/components/orion/agents/AgentStoreCard.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/components/orion/agents/AgentStoreCard.tsx). Cards should look premium, concise, and trustworthy.

## Prompt 18

Refine the installed agents dashboard at `/agents` without changing behavior. Update [frontend/app/agents/page.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/agents/page.tsx) and [frontend/components/orion/agents/InstalledAgentCard.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/components/orion/agents/InstalledAgentCard.tsx). Emphasize placement, status, and primary action clarity.

## Prompt 19

Refine the agent switchboard configurator at `/agents/[id]/configure` into a clean Apple-like settings surface. Preserve toggles and save behavior. Update [frontend/app/agents/[id]/configure/page.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/agents/[id]/configure/page.tsx) and [frontend/components/orion/agents/AgentSwitchboardForm.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/components/orion/agents/AgentSwitchboardForm.tsx).

## Prompt 20

Refactor the Integrations surface for information density only. Keep all logic intact. Work in [frontend/app/connectors/page.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/connectors/page.tsx) and the relevant connector presentation components. Reduce explanatory noise and make the surface feel structured rather than sprawling.

## Prompt 21

Refine the AI accounts / provider connection panel visually, without changing provider logic. Update [frontend/components/orion/connections/AiAccountsPanel.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/components/orion/connections/AiAccountsPanel.tsx). The goal is tighter cards, clearer default/current state, and less visual overload.

## Prompt 22

Refactor the Usage page to be visually honest. Do not fix telemetry yet. Update [frontend/app/usage/page.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/usage/page.tsx) so the page no longer implies accounting-grade certainty if the data is estimated. Improve wording, hierarchy, and calmness.

## Prompt 23

Build a cleaner top-level empty state and loading state language system. Do not change logic. Audit [frontend/components/orion/page](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/components/orion/page) and the main route pages. Reduce robotic or repetitive messaging.

## Prompt 24

Refactor notification and shell notice visuals only. Keep interactions unchanged. Update the shared shell notice styling in the relevant top-bar and chat-shell components so notices feel more like Linear/OpenAI lightweight system feedback and less like intrusive banners.

## Prompt 25

Upgrade the run inspect page into a tighter Trigger.dev-style cockpit layout without changing data flow. Focus on [frontend/app/runs/[id]/inspect/page.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/runs/[id]/inspect/page.tsx), [frontend/components/orion/runs/RunLiveCockpitPanel.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/components/orion/runs/RunLiveCockpitPanel.tsx), and [frontend/components/orion/runs/RunLiveEventFeed.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/components/orion/runs/RunLiveEventFeed.tsx).

## Prompt 26

Do a second pass on the cockpit header only. Keep actions the same. Improve prominence and grouping for target machine, child-agent context, run status, and hard-kill controls in [frontend/app/runs/[id]/inspect/page.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/runs/[id]/inspect/page.tsx).

## Prompt 27

Refine the live event feed density and labeling in [frontend/components/orion/runs/RunLiveEventFeed.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/components/orion/runs/RunLiveEventFeed.tsx). Keep the same events. Make the feed easier to scan under operational stress.

## Prompt 28

Refine mobile and narrow-width breakpoints for the main Sage chat shell. Keep logic intact. Audit [frontend/components/orion/chat/ChatSurface.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/components/orion/chat/ChatSurface.tsx) and its layout classes so the experience remains premium on small screens.

## Prompt 29

Refine mobile and narrow-width breakpoints for the run cockpit. Keep all run logic intact. Update [frontend/app/runs/[id]/inspect/page.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/runs/[id]/inspect/page.tsx) and supporting components to keep hierarchy intact on smaller screens.

## Prompt 30

Perform a brand-economy pass across the shell. Remove redundant uses of the Empyralis name and over-explained platform copy. Touch only visible text. Prioritize [frontend/app/home/page.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/home/page.tsx), [frontend/components/orion/auth/BrowserSignInPage.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/components/orion/auth/BrowserSignInPage.tsx), [frontend/components/orion/PlatformTopBar.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/components/orion/PlatformTopBar.tsx), and major hero pages.

## Prompt 31

Audit all top-level route hero sections and compress them into a unified visual pattern. Preserve route logic. Use the existing premium component library. The goal is one consistent page-entry rhythm across Home, Store, Agents, Integrations, Usage, and Settings.

## Prompt 32

Refactor button styles across the premium component library to create a more rigorous hierarchy. Do not change button behavior. Primary should be rare, secondary should be quiet, ghost should be truly tertiary, and destructive should be unmistakable.

## Prompt 33

Refactor form inputs across auth, switchboard, integrations, and setup surfaces for a cleaner, more premium density. Preserve field logic. Make labels, helper text, and errors shorter and more consistent.

## Prompt 34

Refine page transition motion to be soft and trustworthy. Do not add flashy animation. Eliminate layout jump and use only subtle opacity or small-offset transitions where needed.

## Prompt 35

Run a cross-surface copy audit and remove leftover workflow-era language from user-facing pages. Keep backend naming untouched. Focus only on visible labels and descriptions in the frontend.

## Prompt 36

Do a final visual QA pass after all previous prompts are complete. Verify that Chat and Integrations logic are unchanged, no ghost models remain in visible primary menus, the sidebar no longer causes stage shake, and sign-in copy is short and humane.
