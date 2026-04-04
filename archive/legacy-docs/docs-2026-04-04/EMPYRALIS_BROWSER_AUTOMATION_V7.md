# Empyralis Browser Automation V7

Browser Automation V7 adds same-origin iframe targeting to the existing
`browser_automation` action pipeline.

## Scope

This version extends the current ordered browser action script without creating
a second browser execution system.

Supported iframe-targeted actions:
- `wait`
- `type`
- `click`
- `select`
- `extract`

Not supported yet:
- `upload` inside an iframe

## Action shape

Each browser action may include an optional `frame` selector:

```json
{
  "action": "type",
  "frame": "#embedded-panel",
  "selector": "#search",
  "text": "Empyralis"
}
```

`frame` is treated the same as `frameSelector`.

## Rules

- The frame must be reachable from the top document with `document.querySelector`.
- The frame must be a same-origin `HTMLIFrameElement`.
- If the frame is missing or inaccessible, the action fails with a clear error.
- `upload` with `frame` is rejected explicitly for now.

## Example script

```json
[
  { "action": "wait", "frame": "#panel", "selector": "#frame-go" },
  { "action": "type", "frame": "#panel", "selector": "#frame-search", "text": "Inside frame" },
  { "action": "click", "frame": "#panel", "selector": "#frame-go" },
  { "action": "extract", "frame": "#panel", "selector": "#frame-result" }
]
```

## Output behavior

Action results now preserve the `frame` field in step output metadata and
report artifacts, so iframe interactions remain inspectable in `Run Inspect`.
