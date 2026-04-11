# UI Cruft Audit

Date: 2026-04-09
Scope: visual/textual cruft only
Constraint: no Empyralis source code modified

## 0. Methodology

This audit was performed without changing the product. I used:

- Rendered HTML from the live local app at `http://127.0.0.1:3000`
- Source inspection of the active Next.js routes and shared components
- Direct inspection of the main shell, chat, store, agents, settings, account, sign-in, and integrations surfaces

Important limitation:

- Headless browser tooling was not available locally tonight, so this report is based on rendered server HTML plus component source, not screenshots.
- For brand counts, I separate:
  - `Rendered HTML count`: every `Empyralis` token present in the live route response, including metadata and serialized client payloads
  - `Visible route copy`: the actual on-screen copy authored by the route/component

Audited surfaces:

- `/`
- `/home`
- `/store`
- `/agents`
- `/agents/[id]/configure`
- `/settings`
- `/account`
- `/sign-in`
- `/credentials`

---

## 1. The Button-in-Button Crime

These are the clearest nested or conflicting interactive-target problems currently in the codebase.

### 1.1 Invalid anchor-wrapping-button pattern

The app repeatedly renders `Link` around the shared `Button` component.

Why this is a problem:

- `Button` is implemented with `@base-ui/react/button` in [frontend/components/ui/button.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/components/ui/button.tsx), which renders a real button primitive.
- Wrapping a button inside a link produces invalid nested interactive markup and ambiguous click/focus behavior.

Confirmed offenders:

| Surface | File | Evidence | Problem |
|---|---|---|---|
| Store hero action | [frontend/app/store/page.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/store/page.tsx) | `Link` wraps `Button` at lines 62-64 | Anchor contains button |
| Agents hero action | [frontend/app/agents/page.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/agents/page.tsx) | `Link` wraps `Button` at lines 82-84 | Anchor contains button |
| Agents section action | [frontend/app/agents/page.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/agents/page.tsx) | `Link` wraps `Button` at lines 107-109 | Anchor contains button |
| Agents empty state | [frontend/app/agents/page.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/agents/page.tsx) | `Link` wraps `Button` at lines 125-127 | Anchor contains button |
| Configure page hero action | [frontend/app/agents/[id]/configure/ConfigureAgentPageClient.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/agents/[id]/configure/ConfigureAgentPageClient.tsx) | `Link` wraps `Button` at lines 73-75 | Anchor contains button |
| Installed agent card | [frontend/components/orion/agents/InstalledAgentCard.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/components/orion/agents/InstalledAgentCard.tsx) | lines 65-77 | Both `Configure` and `Chat` are link-wrapped buttons |
| Store card CTA | [frontend/components/orion/agents/AgentStoreCard.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/components/orion/agents/AgentStoreCard.tsx) | lines 58-63 | `Install` is a link-wrapped button |

Exact evidence:

- [frontend/components/orion/agents/InstalledAgentCard.tsx#L65](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/components/orion/agents/InstalledAgentCard.tsx#L65)
- [frontend/components/orion/agents/InstalledAgentCard.tsx#L72](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/components/orion/agents/InstalledAgentCard.tsx#L72)
- [frontend/components/orion/agents/AgentStoreCard.tsx#L58](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/components/orion/agents/AgentStoreCard.tsx#L58)

### 1.2 Clickable container with nested buttons

This pattern is not always invalid HTML, but it is still a UX smell because the whole card behaves like a button while also containing separate button targets.

Confirmed offenders:

| Surface | File | Evidence | Problem |
|---|---|---|---|
| Artifact cards | [frontend/components/orion/artifacts/ArtifactCard.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/components/orion/artifacts/ArtifactCard.tsx) | root `article` uses `role="button"` and `onClick` at lines 62-80; nested `Inspect`, reveal button, and `Source run` link at lines 187-223 | Card click competes with nested actions |
| Workflow list rows | [frontend/components/orion/workflows/WorkflowListRow.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/components/orion/workflows/WorkflowListRow.tsx) | root `ResourceListRow` acts as a button at lines 61-70; nested Open/Run/Duplicate/Delete buttons at lines 91-128 | Large click target with embedded secondary targets |
| Integrations catalog cards | [frontend/app/credentials/page.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/credentials/page.tsx) | connector card `article` has `role="button"` and `onClick` at lines 2046-2057; nested `Connect` / `Manage` button at lines 2092-2099 | Card focus/selection and CTA are stacked on top of each other |

Exact evidence:

- [frontend/components/orion/artifacts/ArtifactCard.tsx#L62](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/components/orion/artifacts/ArtifactCard.tsx#L62)
- [frontend/components/orion/artifacts/ArtifactCard.tsx#L187](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/components/orion/artifacts/ArtifactCard.tsx#L187)
- [frontend/components/orion/workflows/WorkflowListRow.tsx#L61](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/components/orion/workflows/WorkflowListRow.tsx#L61)
- [frontend/app/credentials/page.tsx#L2046](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/credentials/page.tsx#L2046)

### 1.3 Overall interaction verdict

The biggest interaction-taxonomy smell is not one single broken button. It is repeated uncertainty about what the primary target is:

- card as button
- action buttons inside card
- link wrapping button
- badge-like elements beside active buttons

The interface still has several prototype-era surfaces where “entire card is clickable” and “specific CTA is clickable” are both true at the same time.

---

## 2. Brand Fatigue

### 2.1 Global shell reality

On shell-based routes, the sidebar contributes one recurring brand stamp:

- expanded sidebar: `Empyralis`
- collapsed sidebar: single-letter `E` monogram

Source:

- [frontend/components/ui/AppSidebar.tsx#L209](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/components/ui/AppSidebar.tsx#L209)

This means every shell route already carries a permanent brand marker before any page copy adds more.

### 2.2 Route-by-route count table

Rendered HTML counts captured from the live app:

| Route | Rendered HTML `Empyralis` count | Page-local visible route copy | Notes |
|---|---:|---|---|
| `/` | 8 | `Empyralis Cloud` appears in Sage placement fallback | Most route-level brand repetition is metadata and runtime placement naming |
| `/home` | 8 | `Empyralis handles the rest.` | Hero copy adds a second brand moment on top of shell brand |
| `/store` | 7 | none in route body copy | Brand mostly comes from shell + metadata |
| `/agents` | 7 | none in route body copy | Brand mostly comes from shell + metadata |
| `/settings` | 9 | 2 explicit route-copy mentions | Brand repetition is user-visible here |
| `/account` | 9 | 2 explicit route-copy mentions | Brand repetition is user-visible here |
| `/sign-in` | 14 | 10+ possible route-copy mentions depending on state | Major hotspot |

Counts collected from live route responses:

- `/` -> `8`
- `/home` -> `8`
- `/store` -> `7`
- `/agents` -> `7`
- `/settings` -> `9`
- `/account` -> `9`
- `/sign-in` -> `14`

### 2.3 The real hotspot: sign-in

The sign-in experience is the worst brand-fatigue offender by far.

Confirmed visible `Empyralis` route copy in [frontend/components/orion/auth/BrowserSignInPage.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/components/orion/auth/BrowserSignInPage.tsx):

1. `Empyralis account access` at line 490
2. `Empyralis Account Access` at line 523
3. non-desktop hero copy includes `Your Empyralis account owns...`
4. provider boundary note includes `Empyralis account ownership`
5. access title can render `Empyralis account access`
6. `Sign in to Empyralis first...` at line 676
7. Google provider description includes `for Empyralis` at line 687
8. Apple provider description includes `for Empyralis` at line 699
9. fallback provider-disabled notice includes `Use your Empyralis credentials...` at lines 713-714
10. signup submit label can render `Create Empyralis account` at line 806
11. rail fact copy includes `Empyralis account` in the ownership explanation
12. shell note includes `Empyralis still owns the account boundary`

Exact file evidence:

- [frontend/components/orion/auth/BrowserSignInPage.tsx#L490](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/components/orion/auth/BrowserSignInPage.tsx#L490)
- [frontend/components/orion/auth/BrowserSignInPage.tsx#L523](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/components/orion/auth/BrowserSignInPage.tsx#L523)
- [frontend/components/orion/auth/BrowserSignInPage.tsx#L676](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/components/orion/auth/BrowserSignInPage.tsx#L676)
- [frontend/components/orion/auth/BrowserSignInPage.tsx#L687](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/components/orion/auth/BrowserSignInPage.tsx#L687)
- [frontend/components/orion/auth/BrowserSignInPage.tsx#L699](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/components/orion/auth/BrowserSignInPage.tsx#L699)
- [frontend/components/orion/auth/BrowserSignInPage.tsx#L713](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/components/orion/auth/BrowserSignInPage.tsx#L713)
- [frontend/components/orion/auth/BrowserSignInPage.tsx#L806](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/components/orion/auth/BrowserSignInPage.tsx#L806)
- [frontend/components/orion/auth/BrowserSignInPage.tsx#L861](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/components/orion/auth/BrowserSignInPage.tsx#L861)

### 2.4 Other visible redundancy

#### `/settings`

Route-level visible brand mentions:

- `Manage Empyralis sign-in methods here...`
- `...your Empyralis account`

Source:

- [frontend/app/settings/page.tsx#L309](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/settings/page.tsx#L309)
- [frontend/app/settings/page.tsx#L313](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/settings/page.tsx#L313)

#### `/account`

Route-level visible brand mentions:

- `Empyralis account vs AI providers`
- `Sign in to Empyralis with your account methods here...`

Source:

- [frontend/app/account/page.tsx#L167](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/account/page.tsx#L167)
- [frontend/app/account/page.tsx#L170](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/account/page.tsx#L170)

#### `/home`

Route-level visible brand mention:

- `Empyralis handles the rest.`

Source:

- [frontend/app/home/page.tsx#L155](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/home/page.tsx#L155)

#### `/`

Route-level visible brand mention:

- `Empyralis Cloud`

Source:

- [frontend/app/page.tsx#L2039](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/page.tsx#L2039)

### 2.5 Brand-fatigue verdict

The brand is not overused everywhere equally.

Current state:

- acceptable to low fatigue: `/store`, `/agents`
- moderate fatigue: `/home`, `/settings`, `/account`
- severe fatigue: `/sign-in`

The sign-in surface is the place where the user is most likely to feel like they are being repeatedly told the company name instead of being helped through one clear action.

---

## 3. Word Economy

This section flags labels and buttons where the wording is heavier than the action.

### 3.1 Wordy buttons and labels

| Text | Surface | File | Why it is verbose |
|---|---|---|---|
| `View installed agents` | Store hero action | [frontend/app/store/page.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/store/page.tsx) | The page already makes it clear the destination is agents |
| `Available templates` | Store section title | [frontend/app/store/page.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/store/page.tsx) | Section title is generic and long for a simple catalog |
| `Back to agents` | Configure hero action | [frontend/app/agents/[id]/configure/ConfigureAgentPageClient.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/agents/[id]/configure/ConfigureAgentPageClient.tsx) | “Back to” is navigation chrome, not product meaning |
| `Install label` | Switchboard | [frontend/components/orion/agents/AgentSwitchboardForm.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/components/orion/agents/AgentSwitchboardForm.tsx) | Internal phrasing; reads like schema language |
| `Execution placement` | Switchboard and chat facts | [frontend/components/orion/agents/AgentSwitchboardForm.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/components/orion/agents/AgentSwitchboardForm.tsx), [frontend/app/page.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/page.tsx) | Technical noun phrase rather than user language |
| `Trust Mode` | Switchboard | [frontend/components/orion/agents/AgentSwitchboardForm.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/components/orion/agents/AgentSwitchboardForm.tsx) | Product-internal naming exposed as headline |
| `Require Approval` | Switchboard | [frontend/components/orion/agents/AgentSwitchboardForm.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/components/orion/agents/AgentSwitchboardForm.tsx) | Clear enough, but still reads like policy control instead of user choice |
| `Autonomous Execution` | Switchboard | [frontend/components/orion/agents/AgentSwitchboardForm.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/components/orion/agents/AgentSwitchboardForm.tsx) | Heavy enterprise phrase for a binary mode switch |
| `Folder Scope` | Switchboard | [frontend/components/orion/agents/AgentSwitchboardForm.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/components/orion/agents/AgentSwitchboardForm.tsx) | More abstract than the actual user action |
| `Granted folders` | Switchboard field label | [frontend/components/orion/agents/AgentSwitchboardForm.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/components/orion/agents/AgentSwitchboardForm.tsx) | Permission jargon instead of simple path/folder wording |
| `Review sign-in methods` | Account page | [frontend/app/account/page.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/account/page.tsx) | More words than the action needs |
| `Connect or manage providers` | Settings helper link | [frontend/app/settings/page.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/settings/page.tsx) | Two verbs in one CTA |
| `Open profile` | Settings | [frontend/app/settings/page.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/settings/page.tsx) | “Open” is mostly UI chrome |
| `Open machines` | Settings | [frontend/app/settings/page.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/settings/page.tsx) | Same problem as above |
| `Browse store` | Agents hero | [frontend/app/agents/page.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/agents/page.tsx) | Verb + noun where one short noun would suffice in context |
| `Install another` | Agents section action | [frontend/app/agents/page.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/agents/page.tsx) | Slightly verbose relative to surrounding context |

### 3.2 Wordy explanatory copy that behaves like UI chrome

These are not buttons, but they are short enough to behave like interface labels and still carry too much product-internal phrasing:

| Copy | File | Issue |
|---|---|---|
| `Configure placement, trust mode, and skills before you install it.` | [frontend/components/orion/agents/AgentStoreCard.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/components/orion/agents/AgentStoreCard.tsx) | Reads like onboarding instructions inside a CTA area |
| `These templates compile into hidden, validated execution artifacts...` | [frontend/app/store/page.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/store/page.tsx) | Exposes internal machinery in a catalog page |
| `Reading published templates from the workspace catalog.` | [frontend/app/store/page.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/store/page.tsx) | Loading state is overly procedural |
| `Seed templates have not appeared in this workspace yet. Refresh after the registry sync finishes.` | [frontend/app/store/page.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/store/page.tsx) | “Seed”, “workspace”, and “registry sync” are internal system words |
| `Run specialist agents with clean placement and trust boundaries.` | [frontend/app/agents/page.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/agents/page.tsx) | Product framework language, not plain action language |

### 3.3 Word-economy verdict

The dominant issue is not long paragraphs. It is interface copy that sounds like backend documentation:

- placement
- trust mode
- execution artifact
- workspace catalog
- registry sync
- specialist
- boundary

The current UI often says three layers of product architecture when one layer of user intent would do.

---

## 4. Template UX Clutter

This is the main user-comprehension risk in the post-builder world.

### 4.1 Store page still speaks compiler language

Route:

- [frontend/app/store/page.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/store/page.tsx)

Confusing copy:

- `Install polished specialist agents without touching a graph.`
- `Choose a template, open its switchboard, and assign the exact trust mode and execution placement...`
- `These templates compile into hidden, validated execution artifacts...`
- `Seed templates have not appeared in this workspace yet. Refresh after the registry sync finishes.`

Why this is clutter:

- It references the old graph world even while trying to hide it.
- It uses backend nouns:
  - template
  - switchboard
  - trust mode
  - execution placement
  - validated execution artifacts
  - registry sync

For a non-technical user, the store is still a control-plane surface rather than a clean catalog.

### 4.2 Installed agents page still speaks platform architecture

Route:

- [frontend/app/agents/page.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/agents/page.tsx)

Confusing or overly technical copy:

- `Run specialist agents with clean placement and trust boundaries.`
- `Each install carries its own switchboard, placement profile, and trust mode.`
- `Pinned to local companion placement`

Card-level jargon:

- `Placement route: cloud_worker` in [frontend/components/orion/agents/InstalledAgentCard.tsx#L56](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/components/orion/agents/InstalledAgentCard.tsx#L56)

Why this is clutter:

- `specialist`, `switchboard`, `placement profile`, `trust mode`, and `cloud_worker` are system-design words.
- The page leaks runtime classification directly into customer-facing cards.

### 4.3 Configure screen is the highest template-clutter surface

Primary files:

- [frontend/app/agents/[id]/configure/ConfigureAgentPageClient.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/agents/[id]/configure/ConfigureAgentPageClient.tsx)
- [frontend/components/orion/agents/AgentSwitchboardForm.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/components/orion/agents/AgentSwitchboardForm.tsx)

Confusing route-level copy:

- `Switchboard`
- `This switchboard compiles into a pinned execution artifact`
- `Placement options`
- `Runtime profiles available in this workspace`
- `Preparing the agent definition, placement profiles, and current install state.`

Confusing form-level copy:

- `Identity`
- `Install label`
- `Execution placement`
- `Turn capabilities on or off without exposing the underlying execution graph.`
- `Trust Mode`
- `Autonomous execution requests the backend full-trust path. Owner-only checks still apply.`
- `Require approval keeps sensitive actions behind approval cards and runtime policy gates.`
- `Folder Scope`
- `Granted folders`
- `No folder grants set`

Why a non-technical user would struggle:

- The page asks the user to understand:
  - install vs agent vs definition
  - placement vs runtime profile
  - approval vs trust mode
  - folder scope vs granted folders
  - execution graph vs execution artifact
- It also leaks backend enforcement language:
  - backend full-trust path
  - owner-only checks
  - policy gates

That is system architecture surfacing directly into the configuration UI.

### 4.4 Integrations page still contains dense product-operator jargon

Route:

- [frontend/app/credentials/page.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/credentials/page.tsx)

Examples:

- connector cards behave like selectable panels and CTAs simultaneously
- tier labels, roadmap badges, provider-next, custom-build, and workspace phrasing all appear in one surface
- focused connector detail uses phrases like:
  - `When to connect this`
  - `provider_next`
  - `custom connection flow`
  - `approval rules`

This page is not the direct target of the template pivot, but it still shows the same pattern: dense internal taxonomy leaking into the customer surface.

---

## 5. Summary Verdict

### Highest-severity UI cruft

1. Invalid or conflicting interaction targets:
   - repeated `Link` wrapping `Button`
   - repeated clickable-card plus nested-button pattern

2. Brand fatigue:
   - especially severe on sign-in
   - moderate on account/settings
   - mostly controlled elsewhere

3. Word economy failure:
   - too many interface labels sound like product architecture instead of user action

4. Template UX clutter:
   - the store and switchboard still expose control-plane concepts
   - the builder is gone visually, but the language still assumes the user should think like a systems operator

### Most important objective conclusion

The current frontend is no longer suffering from visible graph-builder clutter. It is now suffering from language clutter and interaction-taxonomy drift.

The remaining cruft is:

- nested interactive structure
- repeated account-boundary branding
- labels that speak like internal docs
- configuration copy that leaks runtime/compiler concepts

That is the current surface area of visual and textual debt.
