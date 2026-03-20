# Empyralis Browser Automation V6

Browser Automation V6 extends the ordered `browser_actions` pipeline with richer DOM actions.

## What V6 adds

- `select`
  - choose a value on a `<select>`
- `upload`
  - attach one or more local files to a file input
- `extract`
  - read text/value/attribute data from a selector after interaction

These actions run on the same `browser_automation` `capture_page` path as V5.

## Supported action list

- `wait`
- `type`
- `click`
- `navigate`
- `sleep`
- `select`
- `upload`
- `extract`

## Example

```json
{
  "tool": "browser_automation",
  "mode": "capture_page",
  "url": "https://example.com/form",
  "browser_actions": [
    { "action": "wait", "selector": "#category" },
    { "action": "select", "selector": "#category", "value": "video" },
    { "action": "upload", "selector": "input[type='file']", "path": "temp_executions/demo.txt" },
    { "action": "sleep", "ms": 500 },
    { "action": "extract", "selector": "#upload-status" }
  ]
}
```

## Runtime behavior

- upload paths are validated against the local companion root
- uploads use Electron/Chromium, not raw HTTP fetch
- extract actions are stored in action results and report artifacts
- screenshots and reports are still generated at the end of the step

## Inspect

Local browser capture steps now preserve:

- `browser_actions`
- `action_results`
- screenshot artifact
- report artifact
- final URL
- session profile

## Current limits

V6 still does not include:

- drag/drop gestures
- iframe targeting helpers
- multi-tab control
- download interception
- advanced auth helpers

