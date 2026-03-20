# Orion vs OpenClaw Strong Scan Report

Date: 2026-02-25

## Scope Scanned

- OpenClaw codebase scan in `reference/openclaw/openclaw-src/src`
- Targeted parity files you requested:
  - Core Question Flow (5 files)
  - Wizard Engine (5 files)
  - Terminal Shape/Styling (6 files)
  - TUI Runtime UI (5 files)
  - CLI Command Wiring (5 files)
- Orion implementation scan:
  - `scripts/orion_terminal/core.py`
  - `scripts/orion_terminal/flows.py`
  - `scripts/orion_terminal/widgets.py`
  - `scripts/orion_terminal/wizard_engine.py`
  - `scripts/orion_terminal/app.py`
  - `bin/orion`
  - `server.py`

## Hard Numbers

- OpenClaw files in high-impact CLI/wizard/terminal/tui/commands areas scanned: 633
- OpenClaw CLI command declarations (`.command(`, non-test): 325
- Orion launcher/terminal code files scanned: 6

## Executive Truth (Not 100% Yet)

Current parity for the requested OpenClaw terminal/wizard surface is approximately **64%**.

- Question flow parity: high
- Visual/prompt shape parity: medium
- Interactive selector behavior parity: medium-low (still inconsistent in some terminals)
- Full TUI parity: medium-low (Orion has live loop, not OpenClaw-grade full-screen app parity)
- CLI command/flags parity: low (Orion intentionally has far fewer commands/options)

## Category-by-Category Parity

### 1) Core Question Flow (Target: 5 OpenClaw files)

Status: **4.2 / 5 equivalent**

- `configure.wizard.ts` parity:
  - Present in Orion: gateway location, section select, web tools, workspace/model/gateway/channels/skills/health branches
  - Gap: fewer deep branch prompts than OpenClaw (for example gateway advanced details)
- `onboarding.ts` parity:
  - Present in Orion: security warning gate, onboarding mode, config handling, reset scope
  - Gap: OpenClaw has richer local/remote/hatch orchestration
- `auth-choice-prompt.ts` parity:
  - Present in Orion: grouped provider + auth method + back
- `model-picker.ts` parity:
  - Present in Orion: provider filter selection
  - Gap: OpenClaw has deeper catalog quality logic and fallback/allowlist behavior
- `onboard-channels.ts` parity:
  - Present in Orion: quickstart channel + manual multi-select + connector path
  - Gap: Orion only wires a subset of channel connectors today

### 2) Wizard Engine (Target: 5 OpenClaw files)

Status: **3.6 / 5 equivalent**

- Present:
  - Session recorder and persisted transcript (`wizard_engine.py`)
  - Wizard prompter abstraction used across setup flows
  - Setup summary + next-action routing
- Gaps vs OpenClaw:
  - Clack-grade prompt orchestration behavior is not fully mirrored
  - Onboarding finalize depth (daemon install/control UI/browser opening checks) is lighter
  - Gateway config branch depth (tailscale/custom bind/password nuances) is lighter

### 3) Terminal Shape/Styling (Target: 6 OpenClaw files)

Status: **3.8 / 6 equivalent**

- Present:
  - OpenClaw-like glyph shape (`┌ │ ◆ ● ○ └`)
  - Wrapped note rendering and copy-sensitive token wrapping
  - Compact selector with inline selected-item hint
- Gaps:
  - Behavior is still not as stable as OpenClaw across terminal themes/sizes
  - Spinner/progress polish still below OpenClaw prompt engine feel
  - Some terminals still fall back to line-input mode unexpectedly

### 4) TUI Runtime UI (Target: 5 OpenClaw files)

Status: **2.7 / 5 equivalent**

- Present:
  - Orion live TUI loop with dashboard/status/runs/approvals actions
  - Run detail and approval resolution helpers
- Gaps:
  - Not equivalent to OpenClaw `pi-tui` full-screen app architecture
  - Missing OpenClaw-style searchable select components and richer keybinding model
  - No full componentized render system equivalent

### 5) CLI Command Wiring (Target: 5 OpenClaw files)

Status: **2.4 / 5 equivalent**

- Present:
  - `orion onboard/configure/tui/preflight/status/...` command wiring
- Gaps:
  - OpenClaw has far broader command and flag surface
  - Orion intentionally has fewer flags and fewer non-interactive setup options

## Live Runtime Validation (Auth/Provider Reality)

Validated against running runtime endpoints:

- `/providers` includes:
  - OpenAI (`api_key`, `access_token`, `oauth_token`)
  - Anthropic (`api_key`)
  - Gemini (`api_key`)
  - Vertex (`access_token`, `project_id`, `location`)
- OpenAI models endpoint works with current credentials
- Anthropic/Gemini/Vertex currently return `No credential available for this provider` in this stack instance
- `codex_oauth_interactive_supported` is currently `false` (token-vault mode in this build)

## What Is Still Blocking “Clone-Level” Feel

1. Selector reliability in all terminals
- Some sessions still drop to line-input selector (`Selection [1-N]`) instead of true arrow-key interaction.

2. Prompt rhythm and spacing
- OpenClaw prompt engine behavior is tighter; Orion still has spacing/flow inconsistencies in some paths.

3. Deep gateway/onboarding options
- OpenClaw has more complete gateway, daemon, tailscale, and finalize branches.

4. Channel breadth
- Orion setup records many channels but only a subset is fully connector-wired in runtime today.

5. Full-screen TUI parity
- Orion has a command-loop TUI, not a true OpenClaw-level `pi-tui` equivalent architecture.

## Exact Next Implementation Order (Recommended)

### Phase 1 (P0): Interaction and Shape Stability

Files:
- `scripts/orion_terminal/core.py`
- `scripts/orion_terminal/widgets.py`

Work:
- Force deterministic arrow-key selector path for interactive TTY sessions
- Remove inconsistent line-input fallback in launcher/setup flows unless explicitly requested
- Tighten panel spacing and selected-hint placement directly under active option

### Phase 2 (P0): Question Flow Lockdown to OpenClaw Pattern

Files:
- `scripts/orion_terminal/flows.py`
- `scripts/orion_terminal/core.py`

Work:
- Keep exact high-signal order:
  - Gateway location
  - Sections
  - Onboarding mode
  - Config handling
  - Provider/auth
  - Model filter
  - Channel
  - Confirm/start
- Trim duplicate prompts and remove noisy transcript chatter

### Phase 3 (P1): Gateway/Finalize Depth

Files:
- `scripts/orion_terminal/flows.py`
- `server.py` (only if backend contract changes needed)

Work:
- Add missing gateway branches (custom bind/auth nuances)
- Improve finalize options and post-setup guidance

### Phase 4 (P1): Channel Wiring Expansion

Files:
- `scripts/orion_terminal/flows.py`
- `server.py`

Work:
- Expand quickstart connector coverage beyond current subset

### Phase 5 (P2): Full TUI Parity Track

Files:
- `scripts/orion_terminal/flows.py` (interim)
- Potential new module for full componentized TUI

Work:
- Move from command-loop style toward a true full-screen componentized TUI surface

## Bottom Line

- Not 100% complete.
- Core setup/onboarding question structure is largely in place.
- The biggest remaining issue is selector/interaction parity and stability, then deeper gateway/channel/TUI parity.
- The fastest path to “feels like OpenClaw” is Phase 1 + Phase 2 first.
