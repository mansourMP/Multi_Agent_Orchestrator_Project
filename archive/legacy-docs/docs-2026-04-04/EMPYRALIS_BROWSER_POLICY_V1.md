# Empyralis Browser Policy V1

## Goal
Make high-trust browser runs explicit instead of treating all browser automation the same.

This phase keeps the existing browser execution system and adds clearer policy classification:
- public readonly
- public interactive
- public privileged
- authenticated readonly
- authenticated interactive
- authenticated privileged

## High-trust rule
Session-backed privileged browser work requires approval in guarded mode.

Privileged browser actions:
- `upload`
- `download`
- `open_popup`
- `open_tab`
- `close_tab`

## Why
These actions are materially closer to account-level work than passive page inspection.
They should not be hidden behind the same policy treatment as simple extraction or capture.

## Runtime behavior
Browser automation policy now derives:
- `profile`
- `interactive_actions`
- `privileged_actions`
- `requires_approval`
- `reason`

### Examples
- session profile + `type` + `click`
  - `authenticated_interactive`
  - approval required in guarded mode

- session profile + `upload`
  - `authenticated_privileged`
  - approval required in guarded mode

- no session profile + `upload`
  - `public_privileged`
  - visible as privileged, but not forced into authenticated approval logic

## UI visibility
Run Inspect shows:
- browser policy profile
- privileged browser actions
- browser approval reason

## Validation
Covered by smoke:
- `A18 authenticated browser approval`
- `A23 authenticated privileged browser approval`
