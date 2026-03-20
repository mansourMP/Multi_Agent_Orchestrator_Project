# Empyralis Browser Automation V10

## Scope
Browser Automation V10 adds popup and new-window handling on the existing local browser automation path.

This stays on the same system:
- Workbench configures the browser step
- runtime serializes it through `local-execution-v1`
- the local worker executes it through the Electron browser helper
- runs, artifacts, and inspect keep the results visible

## New action

### `open_popup`
Open a popup or new window from the current page and continue automation inside it.

Example:

```json
{
  "action": "open_popup",
  "selector": "#popup-link",
  "tab": "popup",
  "ms": 10000
}
```

Supported follow-up actions in the popup tab:
- `wait`
- `type`
- `click`
- `select`
- `extract`
- `switch_tab`
- `close_tab`

## Behavior
- The popup is captured as a named browser tab.
- If `tab` is omitted, the engine assigns `popup-N`.
- The popup becomes the current tab after it opens.
- The action result records:
  - `action`
  - `sourceTab`
  - `tab`
  - `selector`
  - `frame`

## Validation
Covered by smoke matrix case:
- `A17 browser popup flow`

Current matrix status after V10:
- `17 passed, 0 failed`

## Limits
- popup support is for the current Electron browser helper path only
- it does not yet add special popup approval policies beyond the existing browser execution controls
- popup download interception still relies on the same session-level download handler

## Next
Browser Automation V11 should focus on:
1. stronger authenticated browser controls
2. popup/download combinations
3. multi-window reporting improvements
