# Empyralis Browser Automation V3

## Goal

Extend browser-backed local execution from passive page capture into minimal interaction.

V3 adds optional interaction parameters before artifact capture:
- `wait_for_selector`
- `type_selector`
- `type_text`
- `click_selector`

This keeps the execution model simple:
- still one local execution step
- still one browser tool
- still one report + artifact path

## Supported flow

For a single `browser_automation` operation with `mode: "capture_page"`:

1. load URL in hidden Electron browser window
2. wait for page settle
3. optionally wait for a selector
4. optionally type text into a selector
5. optionally click a selector
6. wait again
7. capture screenshot
8. save screenshot + report artifact

## Input shape

```json
{
  "tool": "browser_automation",
  "mode": "capture_page",
  "url": "https://example.com",
  "path": "optional-screenshot.png",
  "wait_for_selector": "#ready",
  "type_selector": "input[name='q']",
  "type_text": "Empyralis",
  "click_selector": "button[type='submit']"
}
```

## Validation rules

- URL must be `http` or `https`
- `capture_page` paths must end with `.png`, `.jpg`, or `.jpeg`
- `type_text` requires `type_selector`
- `type_selector` without text is rejected

## Output

### Action
- `tool: browser_automation`
- `mode: capture_page`
- `title`
- `finalUrl`
- `text_preview`
- `links_count`
- `file_path`
- `report_file_path`
- interaction metadata:
  - `wait_for_selector`
  - `click_selector`
  - `type_selector`

### Artifacts
- screenshot artifact
- report artifact

## Limits

V3 is still intentionally small.

It does **not** yet support:
- multi-click scripts
- browser session reuse
- authenticated browser profiles
- drag/drop
- file upload
- back/forward/tab management
- element-level screenshot capture

Those belong to the next browser phase.

## Why this version matters

V1 proved page fetch.

V2 proved browser-rendered capture.

V3 proves:
- minimal browser interaction
- deterministic artifact generation after interaction
- no new orchestration model required

This is enough to support many high-value flows:
- search-box entry + capture
- form fill + state capture
- click-to-expand + extract
- wait-for-ready dashboards
