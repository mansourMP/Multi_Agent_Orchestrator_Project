# Orion Terminal Pre-Run & Onboarding UX Audit

Full audit of user-facing prompts, proposed preflight UX, patch plan, and risk analysis.

---

## Section A — Current Question Inventory

Every user-facing prompt extracted from `scripts/orion_terminal/core.py`, `scripts/orion_terminal/flows.py`, `scripts/orion_terminal/widgets.py`, and `scripts/orion_terminal/app.py`.

### A-1. App Bootstrap (app.py)

| # | Flow | Step | Prompt Text | Widget | Options / Input | Default | Conditional Trigger | Destination Fn | Payload/Side-Effect |
|---|------|------|-------------|--------|-----------------|---------|--------------------|----|-----|
| 1 | `app.main` | Pre-launch | `"Runtime API key (ORION_API_KEY / RUNTIME_KEY)"` | `ui.input(secret)` | free-text | None | `--runtime-key` empty AND `RUNTIME_KEY` / `ORION_API_KEY` env empty | Stored in `runtime_key` | Passed as `X-API-Key` header on every HTTP call |
| 2 | `app.main` | Pre-launch | `"What should Orion run now?"` | `ui.input(required)` | free-text | None | `--mode run` AND `--goal ""` | `run_once()` | `user_goal` field in `/runs/start` payload |

### A-2. Launcher Hub (flows.py:1189–1281)

| # | Flow | Step | Prompt Text | Widget | Options | Default | Trigger | Dest Fn | Payload/Side-Effect |
|---|------|------|-------------|--------|---------|---------|---------|---------|-----|
| 3 | `launcher_flow` | 1 | `"Choose action"` | `ui.choose` | Guided Run · Quick Start · Custom Goal · Specialist Template · Onboard · Configure · Connect Channels · Runtime Doctor · Live TUI · Exit | `Guided Run` (idx 0) | Always | Dispatches to sub-flow | Routes control flow |

### A-3. Guided Run (flows.py:461–548) — 7-step wizard

| # | Flow | Step | Prompt Text | Widget | Options | Default | Trigger | Dest Fn | Payload |
|---|------|------|-------------|--------|---------|---------|---------|---------|-----|
| 4 | `guided_run_flow` | 1/7 Goal | `"What do you want Orion to accomplish?"` | `ui.input(required)` | free-text | `DEFAULT_QUICK_GOAL` | Always | — | `user_goal` |
| 5 | `guided_run_flow` | 2/7 Work Mode | `"Choose operating mode"` | `ui.choose` | General Digital Worker · Specialist Template | `General` (idx 0) | Always | — | Determines if step 3 shows pack selector |
| 6 | `guided_run_flow` | 3/7 Specialist | `"Choose specialist template"` | `ui.choose` | Client Workflow Autopilot · Weekly Content Studio · Competitor Brief Digest | idx 0 | `mode.key == "specialist"` | — | `metadata.outcome_pack` |
| 7 | `guided_run_flow` | 4/7 Risk | `"Choose trust mode"` | `ui.choose` | Guarded · Auto · Strict · Cost Guard · Sensitive Guard | `Guarded` (idx 0) | Always | — | `metadata.trust_mode` |
| 8 | `guided_run_flow` | 5/7 Execution | `"Where should Orion execute this run?"` | `ui.choose` | Auto · Cloud · Local Companion | `Auto` (idx 0) | Always | — | `metadata.execution_target` |
| 9 | `guided_run_flow` | 6/7 Optional | `"Add optional run inputs/context now?"` | `ui.confirm` | Y / N | `No` | Always | `collect_pack_inputs()` | `metadata.pack_inputs` |
| 10 | `guided_run_flow` | 7/7 Channels | `"Connect channels/tools now (Google Workspace / Telegram / WhatsApp)?"` | `ui.confirm` | Y / N | `No` | Always | — | Sets `prompt_connectors` flag |
| 11 | `guided_run_flow` | Summary | `"Start run with this configuration?"` | `ui.confirm` | Y / N | `Yes` | Always | `run_once()` | Launches or cancels run |

### A-4. Custom Goal (launcher_flow "goal" branch, flows.py:1218–1237)

| # | Flow | Step | Prompt Text | Widget | Options | Default | Trigger | Dest Fn | Payload |
|---|------|------|-------------|--------|---------|---------|---------|---------|-----|
| 12 | `launcher/goal` | 1 | `"What do you want Orion to do?"` | `ui.input(required)` | free-text | None | `action == "goal"` | — | `user_goal` |
| 13 | `launcher/goal` | 2 | `"Choose trust mode"` | `ui.choose` | 5 trust modes | `Guarded` | Always | — | `metadata.trust_mode` |
| 14 | `launcher/goal` | 3 | `"Choose execution target"` | `ui.choose` | 3 targets | `Auto` | Always | — | `metadata.execution_target` |
| 15 | `launcher/goal` | 4 | `"Add optional context fields?"` | `ui.confirm` | Y / N | `No` | Always | `collect_pack_inputs("")` | `metadata.pack_inputs` |

### A-5. Specialist Template (launcher_flow "specialist" branch, flows.py:1239–1260)

| # | Flow | Step | Prompt Text | Widget | Options | Default | Trigger | Dest Fn | Payload |
|---|------|------|-------------|--------|---------|---------|---------|---------|-----|
| 16 | `launcher/specialist` | 1 | `"Choose specialist template"` | `ui.choose` | 3 packs | idx 0 | `action == "specialist"` | — | `metadata.outcome_pack` |
| 17 | `launcher/specialist` | 2 | `"Goal"` | `ui.input(required)` | free-text | `"Execute {pack.label} end-to-end…"` | Always | — | `user_goal` |
| 18 | `launcher/specialist` | 3 | `"Choose trust mode"` | `ui.choose` | 5 trust modes | `Guarded` | Always | — | `metadata.trust_mode` |
| 19 | `launcher/specialist` | 4 | `"Choose execution target"` | `ui.choose` | 3 targets | `Auto` | Always | — | `metadata.execution_target` |
| 20 | `launcher/specialist` | 5 | Pack-specific inputs (topics/channels/offers etc.) | `ui.input ×3` | free-text per pack | None | Always | `collect_pack_inputs(pack.key)` | `metadata.pack_inputs` |

### A-6. Onboard Flow (flows.py:912–968)

| # | Flow | Step | Prompt Text | Widget | Options | Default | Trigger | Dest Fn | Payload |
|---|------|------|-------------|--------|---------|---------|---------|---------|-----|
| 21 | `onboard_flow` | 1 | `"Orion Security"` message box | `ui.message` | — (OK) | — | Always | — | Displays risk warning text |
| 22 | `onboard_flow` | 2 | `"I understand the risks and want to continue onboarding."` | `ui.confirm` | Y / N | `No` | Always | Cancels if No | Gate |
| 23 | `onboard_flow` | 3 | `"Select model/auth provider"` | `ui.choose` | Dynamic providers + "Skip for now" | idx 0 | Always | `provider_and_credential_section()` | `session.select_provider` |
| 24 | `onboard_flow` | 3b | `"Credential handling"` | `ui.choose` | Use existing · Add new · Skip | Dynamic (idx 0 if existing) | Provider selected | — | Determines credential flow |
| 25 | `onboard_flow` | 3c | `"Select credential"` | `ui.choose` | Existing credential list | idx 0 | `credential_choice == "existing"` | — | `session.submit_credential` |
| 26 | `onboard_flow` | 3d | Sub-flow: credential creation (varies by provider) | `ui.input ×N` | Label + API key / token / JSON | Varies | `credential_choice == "new"` | `_create_provider_credential()` | `POST /credentials/vault` |
| 27 | `onboard_flow` | 4 | `"Connect channels/tools now?"` | `ui.confirm` | Y / N | `No` | Always | `choose_and_create_connectors()` | Opens connector wizard |
| 28 | `onboard_flow` | 5 | `"Next action"` | `ui.choose` | Open Live TUI · Open Web UI · Finish | `Finish` (idx 2) | Always | `run_tui_shell()` or exit | Terminal routing |

### A-7. Configure Flow (flows.py:971–1057)

| # | Flow | Step | Prompt Text | Widget | Options | Default | Trigger | Dest Fn | Payload |
|---|------|------|-------------|--------|---------|---------|---------|---------|-----|
| 29 | `configure_flow` | 1 | `"Select sections to configure"` | `ui.multi_select` | Provider/Auth · Provider Profiles · Connectors · Doctor · Launch | defaults: [0,2,3] | Always | — | Controls which sections run |
| 30 | `configure_flow` | Provider | Provider + credential sub-flow (same as #23–26) | `ui.choose` + `ui.input` | Same as onboard | Same | `"provider" in keys` | `provider_and_credential_section()` | `session` actions |
| 31 | `configure_flow` | Profiles | `"Create a new provider profile now?"` | `ui.confirm` | Y / N | `No` | `"profiles" in keys` AND no prior provider | `_create_or_update_profile()` | `/providers/profiles POST` |
| 32 | `configure_flow` | Profiles-2 | `"Provider for profile"` | `ui.choose` | Dynamic providers | idx 0 | User confirmed profile creation | — | Provider selection |
| 33 | `configure_flow` | Profiles-3 | `"Credential for profile"` | `ui.choose` | Dynamic credentials | idx 0 | Provider has credentials | — | `credential_id` |
| 34 | `configure_flow` | Connectors | Connector sub-flow (same as #27) | `ui.choose` + `ui.input` | Same | Same | `"connectors" in keys` | `choose_and_create_connectors()` | `/connectors/vault POST` |
| 35 | `configure_flow` | Launch | `"Launch target"` | `ui.choose` | Open Live TUI · Show Web URL · No launch | idx 0 | `"launch" in keys` | `run_tui_shell()` | Terminal routing |

### A-8. Live TUI Shell (flows.py:1060–1187)

| # | Flow | Step | Prompt Text | Widget | Options | Default | Trigger | Dest Fn | Payload |
|---|------|------|-------------|--------|---------|---------|---------|---------|-----|
| 36 | `run_tui_shell` | Loop | `"Choose Live TUI action"` | `ui.choose` | Run Goal · Change Mode · Change Trust · Change Target · Connect Channels · Run Doctor · Advanced Input · Exit | idx 0 | Always (loop) | — | Control flow |
| 37 | `run_tui_shell` | Trust | `"Choose trust mode"` | `ui.choose` | 5 trust modes | `Guarded` | `action == "trust"` | — | Session state |
| 38 | `run_tui_shell` | Target | `"Choose execution target"` | `ui.choose` | 3 targets | `Auto` | `action == "target"` | — | Session state |
| 39 | `run_tui_shell` | Mode | `"Choose active mode"` | `ui.choose` | General + 3 specialist packs | idx 0 | `action == "mode"` | — | Session state |
| 40 | `run_tui_shell` | Run-src | `"How do you want to run?"` | `ui.choose` | Quick default · Mode-aware default · Custom goal · Back | Dynamic | `action == "run"` | — | Goal source selection |
| 41 | `run_tui_shell` | Run-custom | `"What should Orion run now?"` | `ui.input(required)` | free-text | None | `goal_source == "custom"` | — | `user_goal` |
| 42 | `run_tui_shell` | Pack-inputs | `"Add pack inputs for this run?"` | `ui.confirm` | Y / N | `No` | `pack.key` set | `collect_pack_inputs()` | `metadata.pack_inputs` |
| 43 | `run_tui_shell` | Context | `"Add optional context fields?"` | `ui.confirm` | Y / N | `No` | General mode run | `collect_pack_inputs("")` | `metadata.pack_inputs` |
| 44 | `run_tui_shell` | Advanced | `"Type command or goal"` | `ui.input` | free-text | None | `action == "advanced"` | — | Goal or `/exit` |

### A-9. In-Run Prompts

| # | Flow | Step | Prompt Text | Widget | Options | Default | Trigger | Dest Fn | Payload |
|---|------|------|-------------|--------|---------|---------|---------|---------|-----|
| 45 | `run_once` | Pre-run | `"Connect channels/tools before this run?"` | `ui.confirm` | Y / N | `No` | `prompt_connectors=True` | `choose_and_create_connectors()` | Connector metadata |
| 46 | `stream_run` | HITL | `"Resolve approval"` | `ui.choose` | Proceed · Hold | `Proceed` | SSE `pause` event | `post_run_decision()` | `POST /runs/{id}/decision` |

### A-10. Connector Sub-Wizard (flows.py:185–291)

| # | Flow | Step | Prompt Text | Widget | Options | Default | Trigger | Dest Fn | Payload |
|---|------|------|-------------|--------|---------|---------|---------|---------|-----|
| 47 | `choose_and_create_connectors` | Loop-1 | `"Choose connector to add"` | `ui.choose` | Dynamic from `/connectors` API | idx 0 | Always | `create_connector_interactive()` | `connector_id` |
| 48 | `create_connector_interactive` | Google | `"Connector label"` / `"Google access_token"` / `"Calendar ID"` / `"Timezone"` | `ui.input ×4` | free-text, 1 secret | Defaults per field | `connector == google_workspace` | — | `POST /connectors/vault` |
| 49 | `create_connector_interactive` | Telegram | `"Connector label"` / `"Telegram bot token"` / `"Telegram chat_id"` | `ui.input ×3` | free-text, 1 secret | Defaults per field | `connector == telegram_bot` | — | `POST /connectors/vault` |
| 50 | `create_connector_interactive` | WhatsApp | `"Connector label"` / `"Twilio account SID"` / `"Twilio auth token"` / `"WhatsApp from number"` / `"WhatsApp to number"` | `ui.input ×5` | free-text, 1 secret | Defaults per field | `connector == whatsapp_twilio` | — | `POST /connectors/vault` |
| 51 | `choose_and_create_connectors` | Loop-end | `"Add another connector?"` | `ui.confirm` | Y / N | `No` | After each connector creation | — | Loop control |

### A-11. Credential + Profile Sub-Flows

| # | Flow | Step | Prompt Text | Widget | Options | Default | Trigger | Dest Fn | Payload |
|---|------|------|-------------|--------|---------|---------|---------|---------|-----|
| 52 | `_create_provider_credential` | All | `"Credential label"` | `ui.input(required)` | free-text | `"{provider}-credential"` | Always | — | `label` in vault payload |
| 53 | `_create_provider_credential` | OpenAI | `"OpenAI credential type"` | `ui.choose` | API Key · Codex OAuth Access Token | API Key (idx 0) | `provider == "openai"` | — | Auth method |
| 54 | `_create_provider_credential` | OpenAI | `"OpenAI API key"` or `"Codex OAuth access token"` | `ui.input(secret)` | free-text | None | Per auth choice | — | `credentials` dict |
| 55 | `_create_provider_credential` | Others | `"Anthropic API key"` / `"Google Gemini API key"` | `ui.input(secret)` | free-text | None | `provider in {anthropic,gemini}` | — | `credentials` dict |
| 56 | `_create_provider_credential` | Vertex | `"Vertex access token"` / `"project_id"` / `"location"` | `ui.input ×3` | free-text, 1 secret | `us-central1` for location | `provider == "vertex"` | — | `credentials` dict |
| 57 | `_create_provider_credential` | Generic | `"Credential JSON object"` | `ui.input(required)` | free-text JSON | None | Unrecognized provider | — | Raw JSON credentials |
| 58 | `_create_or_update_profile` | All | `"Profile label"` / `"Model override"` / `"Priority"` | `ui.input ×3` | free-text | `"{provider}-primary"`, `""`, `"100"` | Always | — | `POST /providers/profiles` |

> **Total: 58 distinct user-visible prompt touchpoints** across 8 flows (many conditional).

---

## Section B — Proposed "Professional Minimal Preflight" Flow

> **Design constraint**: ≤ 7 questions, Orion identity (not OpenClaw branding), preserves curses shape/spinner selector style. Must cover the security-critical surface area before any run starts.

### B-1. Flow Definition: `preflight_flow`

| Step | Title | Prompt Text | Widget | Options | Default | Maps To |
|------|-------|-------------|--------|---------|---------|---------|
| **1** | Execution Location | `"Where should Orion execute?"` | `ui.choose` | Auto (runtime picks best) · Cloud (server-side) · Local Companion (your machine) | `Auto` | `metadata.execution_target` |
| **2** | Trust Mode | `"How should Orion handle risky actions?"` | `ui.choose` | Guarded (approval on risk) · Auto (minimal approvals) · Strict (approval before sensitive ops) | `Guarded` | `metadata.trust_mode` |
| **3** | Model / Auth Provider | `"Select AI model provider"` | `ui.choose` | Dynamic from `/providers` + "Skip — use runtime default" | idx 0 (first provider) | `session.select_provider` |
| **4** | Credential Source | `"How should Orion authenticate?"` | `ui.choose` | Use saved credential · Add new credential (BYOK) · Skip (runtime default) | Dynamic (saved if exists) | `session.submit_credential` |
| **5** | Channels & Tools | `"Connect external channels now?"` | `ui.confirm` | Yes / No | `No` | Opens connector sub-wizard |
| **6** | File Access Scope | `"What file access should Orion have?"` | `ui.choose` | Workspace only (safest) · Restricted paths (allowlist) · Full (unrestricted) | `Workspace only` | `metadata.file_access_scope` |
| **7** | Acknowledge & Start | `"Orion will execute autonomous actions. Confirm and start?"` | `ui.confirm` | Yes / No | `No` | Gate → launch `run_once()` or `run_tui_shell()` |

### B-2. Behavioral Rules

- If `--goal` CLI flag is set, preflight runs but step 7 auto-confirms (skip confirmation for headless CI).
- On first-ever launch (`/health` returns `setup_complete: false`), redirect to this preflight instead of the launcher hub.
- Preflight results are cached per-workspace to `.orion/preflight.json` so repeat launches skip to step 7 (confirm-only).
- Credentials are never printed — use `_mask_credential_label()` for transcript.
- The flow logs a concise `[preflight]` transcript compatible with the existing `step_banner()`/`choice_log()`/`flag_log()` system.

### B-3. Condensed Trust Modes for Preflight

The full 5-mode trust list is overwhelming for first-run. Preflight shows 3 modes (Guarded, Auto, Strict). The remaining 2 (Cost Guard, Sensitive Guard) are available via `Configure > Provider/Auth` or `Live TUI > Change Trust Mode`.

---

## Section C — File-by-File Patch Plan

### C-1. core.py (`scripts/orion_terminal/core.py`)

#### New Constant: `FILE_ACCESS_SCOPES`

```diff
 EXECUTION_TARGETS: List[Choice] = [
     Choice("auto", "Auto", "Runtime picks best target"),
     Choice("cloud", "Cloud", "Server-side execution"),
     Choice("local_companion", "Local Companion", "Run on your machine via worker"),
 ]
+
+FILE_ACCESS_SCOPES: List[Choice] = [
+    Choice("workspace", "Workspace Only", "Safest: agent sees only current workspace files"),
+    Choice("restricted", "Restricted Paths", "Agent may access an allowlist of directories"),
+    Choice("full", "Full", "Unrestricted filesystem access (use with caution)"),
+]
```

**Insertion point**: `core.py` L74–L78, after `EXECUTION_TARGETS`.

#### Trimmed Trust Modes for Preflight

```diff
+PREFLIGHT_TRUST_MODES: List[Choice] = [
+    Choice("guarded", "Guarded", "Approval only when risk is detected"),
+    Choice("auto", "Auto", "Fastest execution, least approvals"),
+    Choice("strict", "Strict", "Approval before sensitive actions"),
+]
```

**Insertion point**: `core.py` L72, after `TRUST_MODES`.

#### New Launcher Action

```diff
 LAUNCHER_ACTIONS: List[Choice] = [
+    Choice("preflight", "Preflight Check", "Security, provider, scope — then start"),
     Choice("guided", "Guided Run", ...),
     ...
 ]
```

**Insertion point**: `core.py` L80–L91, as the new first item (index 0).

---

### C-2. flows.py (`scripts/orion_terminal/flows.py`)

#### New Function: `preflight_flow()`

Insert **after** `onboard_flow()` (~line 968) and **before** `configure_flow()` (line 971).

```python
def preflight_flow(
    ui: UI,
    api_url: str,
    api_key: str,
    workspace_id: str,
    engine: str,
    auto_confirm: bool = False,
) -> int:
```

**Steps** (maps to Section B):

1. `step_banner(1, 7, "Execution Location")` → `ui.choose(EXECUTION_TARGETS)`
2. `step_banner(2, 7, "Trust Mode")` → `ui.choose(PREFLIGHT_TRUST_MODES)`
3. `step_banner(3, 7, "Model Provider")` → `ui.choose(providers + skip)`
4. `step_banner(4, 7, "Credential Source")` → reuses `provider_and_credential_section()` logic, refactored to accept optional provider
5. `step_banner(5, 7, "Channels & Tools")` → `ui.confirm` → `choose_and_create_connectors()`
6. `step_banner(6, 7, "File Access Scope")` → `ui.choose(FILE_ACCESS_SCOPES)`
7. `step_banner(7, 7, "Confirm & Start")` → `ui.confirm` or `auto_confirm`

Returns the chosen config as a dict that can be passed to `run_once()` or `run_tui_shell()`.

#### Modify `launcher_flow()` — Add "Preflight" dispatch

**Location**: `flows.py` L1189–L1200

```diff
 while True:
     action = ui.choose("Choose action", LAUNCHER_ACTIONS, ...)
     ...
+    if action.key == "preflight":
+        return preflight_flow(ui, api_url, runtime_key, workspace_id, engine)
```

---

### C-3. app.py (`scripts/orion_terminal/app.py`)

#### Add `--mode preflight` entry

**Location**: `app.py` L38

```diff
     parser.add_argument(
         "--mode",
-        choices=["launcher", "run", "onboard", "configure", "tui"],
+        choices=["launcher", "run", "onboard", "configure", "tui", "preflight"],
         default="launcher",
         help="Entry mode (default: launcher)",
     )
```

#### Add preflight mode handler

**Location**: `app.py` L96–L109

```diff
+    if args.mode == "preflight":
+        print_launcher_header(api_url, args.workspace_id, health)
+        return preflight_flow(ui, api_url, runtime_key, args.workspace_id, args.engine)
+
     if args.mode == "onboard":
         ...
```

#### Auto-redirect on first run

After the health check block (~line 68):

```diff
+    if not health.get("setup_complete", True) and args.mode == "launcher":
+        ui.note(strong("First run detected — running preflight."))
+        print_launcher_header(api_url, args.workspace_id, health)
+        return preflight_flow(ui, api_url, runtime_key, args.workspace_id, args.engine)
```

---

### C-4. widgets.py (`scripts/orion_terminal/widgets.py`)

**No changes needed.** The existing `select_menu()` and `multi_select_menu()` plus the shape/spinner system are fully compatible. The new preflight flow only uses `ui.choose` and `ui.confirm` which already route through these widgets.

---

## Section D — Risks / Regressions Checklist

| # | Risk | Severity | Mitigation |
|---|------|----------|------------|
| 1 | **LAUNCHER_ACTIONS index shift** — adding Preflight at index 0 changes the default for all existing users who relied on `default_index=0` mapping to Guided Run | Medium | Set `default_index=0` for Preflight explicitly; update tests/docs referencing action indexes |
| 2 | **`setup_complete` field may not exist** in older backends — auto-redirect could misfire | High | Guard with `health.get("setup_complete", True)` — if field is absent, assume already set up (current default) |
| 3 | **Credential masking** — `_mask_credential_label()` is already applied in the onboard flow but must be applied consistently in the new preflight credential sub-flow | Medium | Reuse existing `value_log(ui, "Credential", _mask_credential_label(...))` pattern |
| 4 | **Connector re-entry loop** — `choose_and_create_connectors()` has its own Y/N loop; nesting it inside preflight step 5 could confuse users who cancel mid-wizard | Low | The existing `"Add another connector?"` confirm with `default_yes=False` naturally exits. No code change needed. |
| 5 | **FILE_ACCESS_SCOPES** — this is a new concept not yet supported by the backend `/runs/start` endpoint | High | The `metadata.file_access_scope` field must be added to the backend run schema. If backend doesn't support it yet, pass it as metadata and have the runtime ignore unknown keys gracefully. |
| 6 | **Curses fallback** — the preflight flow uses standard `ui.choose`/`ui.confirm` which already fall through to curses → text mode. No new widget types needed. | Low | Covered by existing `UI.__init__` cascade |
| 7 | **User muscle memory** — existing users who ran `--mode onboard` will now see a different flow when launching bare `orion`. The `onboard` command must still work. | Medium | Keep `onboard_flow()` intact. Preflight is additive, not a replacement. Users can still `--mode onboard`. |
| 8 | **PREFLIGHT_TRUST_MODES vs TRUST_MODES** — having two lists that overlap creates a maintenance burden | Low | `PREFLIGHT_TRUST_MODES` is a strict subset. Document that the full list is the canonical one. |
| 9 | **Headless CI** — `auto_confirm=True` must be wired correctly so `--goal "..."` skips step 7 confirmation | Medium | Pass `auto_confirm=bool(args.goal.strip())` from `app.main()` into `preflight_flow()` |
| 10 | **Transcript readability** — preflight must use the same `step_banner()`/`choice_log()`/`flag_log()` pattern so output is visually consistent with existing flows | Low | Enforced by design; no new print patterns introduced |

---

## Summary

The current Orion terminal has **58 prompt touchpoints** spread across 8 flows, with significant duplication (trust mode is asked in 5 places, execution target in 4 places). The proposed **7-step Preflight flow** consolidates the security-critical surface into a single pre-run gate while preserving full backwards compatibility with existing flows for power users.

> **IMPORTANT**: The `FILE_ACCESS_SCOPES` concept (step 6) requires backend coordination — the `/runs/start` endpoint must accept the new `metadata.file_access_scope` field. Without backend support, this field will be silently passed but not enforced.
