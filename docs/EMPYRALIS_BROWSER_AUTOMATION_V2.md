# Empyralis Browser Automation V2

## Goal

Add one real browser-rendered action to the local companion path without introducing a second automation stack.

V2 adds:
- `browser_automation` mode: `capture_page`

This means Empyralis can:
- open a public page in a hidden Electron browser window
- wait for the page to render
- capture a real screenshot artifact
- save a small report artifact with title, final URL, text preview, and extracted links

## Why this version exists

V1 was honest but limited:
- fetch HTML over HTTP
- extract text or links
- save HTML

That works for static/public page fetches, but it does not validate the desktop/browser execution path.

V2 proves:
- browser-backed execution inside the local companion
- page rendering through Chromium/Electron
- screenshot artifacts from the browser itself

## Scope

### Supported
- public `http/https` URLs
- hidden browser window
- page screenshot capture
- screenshot artifact + report artifact
- run/approval/artifact plumbing through `local-execution-v1`

### Not supported yet
- clicking
- typing
- logged-in sessions
- cookie/session reuse
- multi-step browser workflows with DOM actions
- browser window targeting in the user-visible desktop shell

Those belong to the next phase.

## Runtime path

`Workbench` / API run -> `local-execution-v1` -> local worker -> Electron browser task -> artifacts -> Inspect / Artifacts / Runs

## Input shape

```json
{
  "tool": "browser_automation",
  "mode": "capture_page",
  "url": "https://example.com",
  "path": "optional-output.png"
}
```

Notes:
- `path` is optional
- if supplied, it must end with `.png`, `.jpg`, or `.jpeg`
- if omitted, Empyralis writes under `.orion-artifacts/local-execution/browser/`

## Output shape

### Action
- `tool: browser_automation`
- `mode: capture_page`
- `url`
- `title`
- `text_preview`
- `links_count`
- `file_path` (screenshot)
- `report_file_path`

### Artifacts
- screenshot artifact
- report artifact

## Implementation note

V2 uses the existing Electron runtime already present in this repo:
- `desktop/browser_task.js`

This avoids adding Playwright before the browser-backed execution path is proven useful and stable.

## Next phase

Browser Automation V3 should add:
- Playwright-backed or Electron-backed click/type actions
- page screenshots after interaction steps
- approval-aware interactive browser runs
- session reuse / authenticated flows
