# Empyralis Browser Automation V4

Browser Automation V4 adds persistent browser session profiles to the existing
`browser_automation` tool. This keeps the browser stack unified: the same local
execution tool, the same artifact model, and the same approval flow.

## What V4 adds

- `session_profile` on `browser_automation` operations with `mode: "capture_page"`
- persistent Electron partition reuse across runs
- inspectable session profile metadata in run outputs
- deterministic smoke coverage for session persistence

## Supported operation shape

```json
{
  "tool": "browser_automation",
  "mode": "capture_page",
  "url": "http://127.0.0.1:8123/index.html",
  "session_profile": "marketing-login",
  "wait_for_selector": "#ready",
  "type_selector": "#search",
  "type_text": "Empyralis",
  "click_selector": "#go"
}
```

## Behavior

- If `session_profile` is blank, the browser run is ephemeral.
- If `session_profile` is provided, Empyralis uses a persistent Electron
  partition:
  - `persist:empyralis-browser-<slug>`
- Cookies, local storage, and similar browser state can be reused by later
  `capture_page` runs on the same site with the same `session_profile`.

## Current limits

V4 still does not include:

- full multi-action browser scripts
- file upload
- robust login/MFA helpers
- shared authenticated sessions for the non-capture fetch modes

Session-backed state currently applies to `capture_page` because that path runs
through the real Electron browser.

## Output / inspect

Local execution step output now includes:

- `session_profile`
- screenshot artifact
- report artifact
- page title / final URL / text preview

## Validation target

The smoke test now proves session persistence by:

1. opening a local test page
2. storing a value in local storage during one browser run
3. opening the same page in a later run with the same `session_profile`
4. verifying the value persisted
