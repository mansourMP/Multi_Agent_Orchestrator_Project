Based on the screenshots and the two design docs, the core product model is strong. The problem is not the IA. The problem is layer mixing: runtime/debug controls are leaking into first-class product screens, and each page is inventing its own header, toolbar, tab, and button logic.

That is why Empyralis currently reads more like a control plane on top of a dark admin dashboard than a calm operating system for agents.

## Review corrections

Two important corrections to earlier design feedback:

1. The main tonal issue is not simply "too black."
   In the current screenshots, light mode is already fairly close to the intended warm-neutral direction. The stronger issue is still layer mixing, overexposed inspect detail, and duplicated control surfaces.

2. `Automations` and `Settings` matter more than the earlier review gave them credit for.
   They are not the biggest offenders, but they still weaken the product story through duplicated create actions, over-explaining, and too much technical weight in default views.

## 1. Diagnosis

### Overall diagnosis

Empyralis already has the right nouns: Workbench, Runs, Approvals, Agents, Artifacts, Integrations. What is breaking trust is that the default UI keeps surfacing inspect-level information:

* slash-style command syntax
* raw runtime state
* auth/account fragments
* system-health pills
* IDs and lineage metadata
* file paths and logs
* too many persistent controls

That makes the product feel technical before it feels useful.

### Workbench — **Critical**

The Workbench screenshot is the clearest mismatch with the brief.

Exact problems:

* The hero input says `COMMAND /run <goal> /agents /runs`. That is developer-facing syntax, not plain-language operation.
* The page is split into three competing surfaces: `Next Operator`, `Session`, and `Control Deck`.
* `Session / Approvals / Runs` duplicates first-class navigation objects that already exist in the left rail.
* `Control Deck`, `Chat / Control / Inspect`, `Sending as Orchestrator`, and the `EMA ya29...` token-like chip are internal/control-plane concepts.
* `Run state`, `Workers`, `Progress`, `Last outcome`, and `Last decision approved 18:53:12` are default-surface diagnostics, not primary-task UI.
* The floating `Commands Cmd+K` button duplicates the command surface.

Why it hurts:

* The most important page in the product does not lead with intent. It leads with syntax and runtime.
* It asks normal users to think like an operator of the system rather than a person trying to get work done.
* It duplicates Agents, Approvals, and Runs instead of feeling like the clean entry point into them.

### Agents Workspace — **High**

This page is closest to becoming a dashboard.

Exact problems:

* The title is `Agents Workspace`, not `Agents`. That breaks the product model.
* `Fleet KPIs` is ops language.
* The top-right pill cluster (`Attention`, `auth -`, `memory degraded`, `updated -`, `stale Infinitys`) looks like raw internal state, and some strings look unfinished.
* The `Add` tile sits inside the agent list instead of living as the page action.
* `Global Operations` with `Live / Approvals / Tasks / Audit`, `Workers`, `Channels`, and `Scaling Policy` does not belong on the default Agents page.
* `Failed to fetch` is technically honest, but too raw and contextless.
* `Channels` duplicates Integrations. `Approvals` and `Audit` duplicate other pages.

Why it hurts:

* The page stops being about ownership and workload and turns into a runtime admin console.
* It makes the system feel fragile and technical.
* It violates the OS contract that Agents should show ownership, not transport-layer internals.

### Approvals — **Medium**

The object is right, but the structure is weak.

Exact problems:

* The header area is inconsistent with the other pages.
* `Pending 0 / Audit 30` sits on the left while filters stack on the right, and `Refresh` floats below them.
* There is huge empty space and almost no content hierarchy.
* `Audit` is probably the wrong default label for normal users unless this is explicitly compliance-focused.

Why it hurts:

* The page feels unfinished rather than calm.
* The empty state does not reassure the user; it just leaves a blank surface.

### Runs — **High**

Runs is conceptually closest to correct, but the default row content is too technical.

Exact problems:

* The giant search/filter container wastes a lot of space.
* The subtitle `200 visible 200 total` is noise when the values match.
* Rows expose raw IDs, child lineage, agent internals, and `Manual` route metadata.
* `Search by run ID or automation name` leads with IDs.
* Every row has an `Inspect` button even though inspection is the obvious row action.

Why it hurts:

* Runs should feel like execution truth. Right now it feels like a log table.
* The user sees implementation detail before task meaning.

### Integrations — **Medium**

The page is on the right object, but the action hierarchy is noisy.

Exact problems:

* The metric strip includes explanatory copy and an assignment chip, which is not what a metric strip is for.
* Rows repeat status and assignment in multiple places.
* `Test`, `Pause`, and `Remove` are all visible at once on each connected row.
* The routing dropdown is prominent, but the rest of the row reads like a control panel.
* `Connect` in the header and `Add` on every available integration can be fine, but only if they have distinct roles.

Why it hurts:

* The page feels operationally cluttered rather than dependable.
* It is not clear what the default row action is.

### Automations — **Medium**

This page is directionally correct, but it is over-explaining and over-duplicating for a mostly empty state.

Exact problems:

* The page exposes too many creation prompts at once:
  * top-right `New Automation`
  * hero `New Automation`
  * empty-state `Create Automation`
* It uses large explanatory blocks to restate the product model instead of helping the user act.
* `Filters` is visible even when there is effectively nothing to filter.

Why it hurts:

* The user already chose the page; the page should help them create or manage automations, not re-teach the product model every time.
* The structure is calm in color but noisy in action hierarchy.

### Artifacts — **Critical**

This is the strongest “developer tool” smell in the set.

Exact problems:

* The default artifact list is showing `.log` files, `server.py`, local shell artifacts, paths, and execution tags.
* `Copy path` is visible on every row.
* `Inspect run` is also promoted on every row.
* Rows are covered with chips like `files`, `Builder Ops`, `explicit`, `local-execution-v1`.
* The open filter uses warning orange as the active selection state for `All kinds`.

Why it hurts:

* `Artifacts` is supposed to mean outputs. Instead it currently means internal files and logs.
* This alone can make the whole product feel developer-only.
* Using warning orange for a neutral active filter violates the color rules and weakens semantic trust.

### Settings — **Medium-low**

Settings is not structurally broken, but it is giving too much visual weight to provider keys.

Exact problems:

* The root page gives prominent space to provider-key management:
  * top-right `Add Provider Key`
  * large empty-state panel for keys
  * extra `Add Key` inside the same surface
* The result feels more like provider-credential management than a settings hub.

Why it hurts:

* Settings is allowed to be more technical, but the root still needs to feel like a settings home, not a single advanced subsection.

### Cross-screen issues — **High**

Across all screenshots:

* The bigger visual issue is layer mixing, not just color. Dark mode should still stay charcoal/graphite rather than flat black, but color is not the first-order problem in the current screenshots.
* Too many large rounded containers.
* Too many pills and chips.
* Header logic is inconsistent page to page.
* Toolbar placement is inconsistent page to page.
* Tabs are being used to duplicate whole pages.
* Refresh appears as a default utility button everywhere.
* Global issues/status are scattered: top-right status text, warning pills, `Failed to fetch`, bottom-right `4 Issues`, floating Commands button.

## 2. Design direction

### What should stay

Keep the current object model and left-rail architecture. That part is right.

### What should change

The UI needs a strict layer cleanup:

* **Default pages** should show user-facing object state.
* **Inspect drawers** should hold advanced details.
* **Shell status** should hold global runtime/system health.
* **Settings** should hold system/runtime controls.
* **Buttons** should be reduced to one obvious home.

### Screen-by-screen direction

#### Workbench

Workbench should be the cleanest page in the product.

What to do:

* Make the task composer the primary surface.
* Replace the slash-syntax placeholder with plain language.
* Move agent ownership to one inline control: `Owner: Auto` or `Assign to`.
* Remove the `Next Operator` column from the default layout.
* Remove `Approvals` and `Runs` as Workbench tabs.
* Rename `Control Deck` to `Inspector` only if it remains, and show it contextually when a run is selected.
* Hide `Sending as Orchestrator`, token/account fragments, worker counts, queue counts, and raw progress state in default view.

Primary vs secondary:

* Primary action: run/send from the composer.
* Secondary: owner selector, maybe attach context.
* Contextual: inspect advanced run state.

#### Agents

This page should answer one question: who owns the work, and what needs attention?

What to do:

* Rename `Agents Workspace` to `Agents`.
* Put `Add agent` in the header top-right.
* Remove the `Add` tile from the list.
* Reduce the metric strip to the few counts that matter.
* Move `Global Operations` out of the default page and into inspect/settings.
* Reuse the same short descriptions already visible on Workbench: `route work and approvals`, `customer messages and feedback`, and so on.
* Keep one status indicator per agent: `Idle`, `Busy`, `Needs attention`, `Offline`.

#### Approvals

This page should feel simple and decisive.

What to do:

* Keep it as a clean list page.
* Use `Pending / History` as a segmented switch in the toolbar.
* Put channel/agent filters beside it in the same toolbar row.
* Keep `Refresh` as a ghost header action only if manual refresh is truly needed.
* Make the empty state explicit and reassuring.

#### Runs

This page should feel like operational truth, not logs.

What to do:

* Keep the top counts.
* Compress search and filters into a single toolbar row.
* Default row content should be task title, owner, status, started time, duration.
* Move raw IDs, child-run lineage, route type, and other internals into inspect.
* Make row click open the inspect drawer; remove the always-visible `Inspect` button column or reduce it to hover/context.

#### Integrations

This page should feel like connected channels, not a runtime console.

What to do:

* Keep `Connect` as the primary header action.
* Use one clean list for connected integrations and one clean list for available integrations.
* Let routing/assignment live in one obvious place in the row.
* Move `Test / Pause / Remove` into overflow or row detail.
* Remove repeated assignment/status chips if the row already shows the same information.

#### Automations

This page should feel like reusable systems, not another builder prompt stack.

What to do:

* Keep one clear creation home.
* Compress the model explanation into the subtitle and empty state.
* Hide filter/search UI when the list is empty.
* Make the page answer:
  * what automations exist
  * what state they are in
  * how to create one

#### Artifacts

This page must become user-facing.

What to do:

* Default the page to reports, data, screenshots, links, and user-visible files.
* Hide logs, code files, shell outputs, and system paths from the default view.
* Remove `Copy path` from the default row UI.
* Keep `Inspect run` inside preview or overflow, not as a primary row action.
* Reduce row metadata to what helps someone understand the artifact.

#### Settings

This page should feel like a settings hub.

What to do:

* Keep the root page focused on categories.
* Keep provider keys inside their own section, not as the page's dominant story.
* Remove duplicate key-creation actions from the same view.

## 3. Concrete recommendations

### Header structure

Use the same structure everywhere:

* left: icon + title + one-line subtitle
* right: one primary action if the page genuinely has one; otherwise only ghost utilities like refresh

Apply that consistently:

* Workbench: no extra runtime text in the header
* Agents: `Add agent`
* Integrations: `Connect`
* Runs / Approvals / Artifacts: likely no primary action, only refresh if needed

### Button placement

Buttons that do not deserve to exist in their current form:

* floating `Commands Cmd+K`
* `Add` tile inside Agents
* Workbench tabs for `Approvals` and `Runs`
* duplicate `New Automation / Create Automation` stack
* persistent `Inspect` buttons on every Runs row
* persistent `Copy path` on every Artifacts row
* always-visible `Test / Pause / Remove` on every Integration row
* duplicate `Add Provider Key / Add Key`
* top-right diagnostic pills as standalone UI objects

### Tab usage

Tabs should only switch one content region of the same object.

Good use:

* Approvals: `Pending / History`

Bad use:

* Workbench: `Session / Approvals / Runs`
* Agents: `Live / Approvals / Tasks / Audit`

Those are not one object changing views. They are multiple objects colliding on one page.

### Metric strip usage

Metric strips should contain only compact summary numbers.

Do not put these in a metric strip:

* paragraphs
* warning/debug pills
* nested chips
* assignment metadata
* explanatory system copy

Best candidates for metric strips:

* Runs
* Agents
* Integrations
* Artifacts

Likely unnecessary:

* Workbench
* Approvals

### Empty-state behavior

Each empty state should do three things:

* say what is empty
* say whether that is okay
* point to the next reasonable action

Examples:

* Approvals: “Nothing needs permission right now.”
* Workbench: “Ask Empyralis to do something.”
* Artifacts with no results: “No artifacts match these filters.”

### Spacing and density

The current UI has too much empty container space and too many wrappers.

Guidance:

* reduce the height of search/filter regions
* use one toolbar row instead of stacked controls
* use flatter panels and row dividers instead of giant rounded shells
* keep panel padding consistent
* let lists/tables carry more of the UI than cards
* cap metadata chips to one status and one secondary tag at most

## 4. Guardrails

Do not change:

* the left-rail object model
* the core page names: Workbench, Runs, Approvals, Agents, Artifacts, Integrations, Settings
* the truthfulness of system state
* the ability to inspect advanced details

Do change:

* where advanced details live
* how much raw system text shows by default
* the tonal layering

Tonal direction:

* yes, move toward charcoal/graphite surfaces in dark mode
* yes, move toward warm-neutral surfaces in light mode
* keep violet controlled and intentional
* reserve orange for real warnings only
* do not use warning color as a generic selected state

Patterns to reuse everywhere:

* one header pattern
* one stat-strip pattern
* one toolbar pattern
* one list/row pattern
* one inspect drawer pattern
* one shell-level issues/status pattern

## 5. Implementation order

1. **Hide internal/debug detail from default views.**
   This is the biggest trust win with the least IA churn. Remove slash syntax, raw tokens, IDs, file paths, logs, and runtime fragments from primary surfaces.

2. **Standardize page grammar.**
   Make every page follow header → metric strip when needed → toolbar → primary content.

3. **Collapse duplicate actions and duplicate objects.**
   Remove Workbench tabs that duplicate pages, remove the Add tile in Agents, remove floating Commands, reduce row-button clutter, and collapse duplicate creation surfaces in Automations and Settings.

4. **Refocus each page on its object.**
   Agents loses Global Operations. Artifacts defaults to outputs. Runs defaults to task meaning, not lineage internals. Automations becomes system-first instead of prompt-stack-first. Settings becomes category-first instead of provider-key-first.

5. **Unify system health into the shell.**
   One place for issues, attention, degraded state, stale data, and refresh status.

6. **Do the tonal and spacing pass last.**
   Shift from black to charcoal, reduce card soup, reduce chip noise, tighten toolbar density.

The right move here is not a broad redesign. It is a disciplined cleanup of layers, language, and control placement. The product model is already good enough. The UI just needs to stop showing the engine before it shows the work.
