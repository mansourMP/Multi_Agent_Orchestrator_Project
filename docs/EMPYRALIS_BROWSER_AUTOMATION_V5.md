# Empyralis Browser Automation V5

Browser Automation V5 adds ordered browser action scripts to the existing
`browser_automation` tool for `capture_page`.

## What V5 adds

- `browser_actions` array on `capture_page`
- ordered action execution in the Electron browser helper
- backward compatibility for legacy:
  - `wait_for_selector`
  - `type_selector`
  - `type_text`
  - `click_selector`

## Supported actions

- `wait`
  - requires `selector`
- `type`
  - requires `selector`
  - requires `text`
- `click`
  - requires `selector`
- `navigate`
  - requires `url`
- `sleep`
  - optional `ms`
  - clamped to 10 seconds

## Example

```json
{
  "tool": "browser_automation",
  "mode": "capture_page",
  "url": "https://example.com",
  "session_profile": "marketing-login",
  "browser_actions": [
    { "action": "wait", "selector": "#search" },
    { "action": "type", "selector": "#search", "text": "Empyralis" },
    { "action": "click", "selector": "button[type='submit']" },
    { "action": "sleep", "ms": 500 }
  ]
}
```

## Runtime behavior

- The browser still loads the initial `url` first.
- Then the action list runs in order.
- Final screenshot and report are captured after the action sequence finishes.
- The same session-profile support from V4 still applies.

## Inspect / outputs

The run still records:

- screenshot artifact
- report artifact
- final URL
- text preview
- session profile

The browser action list is preserved in step output metadata.

## Current limits

V5 still does not include:

- file upload
- drag/drop
- tab management
- iframe targeting helpers
- rich authenticated flow helpers

This is still one ordered action list on a single page capture run.
