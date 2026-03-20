# Empyralis Browser Automation V1

## Goal
Add the first honest browser capability to the local companion without pretending we already have full browser control.

V1 is not click automation. It is:
- fetch a public page
- extract useful text
- extract links
- save raw HTML
- store artifacts and step status through the existing local execution path

## Product position
Browser Automation V1 lives inside:
- `local-execution-v1`
- `Workbench > Local Companion Tools`

It is one more local execution tool, alongside:
- `read_write_files`
- `capture_screenshot`
- `execute_shell_command`

## Supported modes
`browser_automation` supports:

1. `extract_text`
- fetch a page
- extract title
- extract text preview
- save HTML artifact
- save text report artifact

2. `extract_links`
- fetch a page
- extract title
- extract first links found
- save HTML artifact
- save links report artifact

3. `save_html`
- fetch a page
- save raw HTML artifact
- save a short report artifact

## Current limits
V1 does not:
- click buttons
- type into forms
- reuse logged-in browser sessions
- target tabs or windows
- run Playwright/CDP

That is Browser Automation V2.

## Runtime behavior
- only `http` and `https` URLs are allowed
- result artifacts are stored under the local execution artifact root
- step results flow through:
  - Workbench
  - Runs
  - Run Inspect
  - Artifacts

## Why this matters
This gives Empyralis the first real browser capability without adding a fake UI surface or an unstable dependency chain.

It also fits the launch strategy:
- capabilities first
- reliable execution path
- observable artifacts
- approval/policy model stays intact

## Next step
Browser Automation V2 should add:
- Playwright-backed navigation
- page screenshots
- click/type/extract actions
- session reuse
- approval-aware interactive browser runs
