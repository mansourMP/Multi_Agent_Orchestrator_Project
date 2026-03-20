# Empyralis Browser Automation V8

## Scope
Browser Automation V8 adds named multi-page and tab-aware flows on top of the existing `browser_automation` tool path.

This phase does not create a second browser subsystem. It extends the existing Electron-backed `capture_page` path used by `local-execution-v1`.

## New concepts

### Named tabs
Browser action scripts can now target named tabs with:

- `tab`

The first loaded page is always the implicit `main` tab.

### New actions

- `open_tab`
- `switch_tab`
- `close_tab`

## Supported usage

### Open a second page

```json
{"action":"open_tab","tab":"secondary","url":"https://example.com/docs"}
```

### Switch back to main

```json
{"action":"switch_tab","tab":"main"}
```

### Run an action on a specific tab

```json
{"action":"extract","tab":"secondary","selector":"h1"}
```

## Rules

- If `tab` is omitted on an action, the current active tab is used.
- `main` is created automatically from the step URL.
- `switch_tab` and `close_tab` require `tab`.
- `open_tab` requires `url`.
- The last remaining tab cannot be closed.

## Result model

Browser action results now include:

- `tab`
- existing fields like `selector`, `frame`, `text`, `value`, `url`

Browser capture output also includes:

- `currentTab`
- `openTabs`

## Current limits

- No popup/window interception yet
- No iframe-targeted upload
- No cross-tab DOM sharing beyond persisted browser session state

## Validation

Smoke coverage:

- `A15 browser tab flow`

This validates:

1. open secondary tab
2. extract from the secondary page
3. switch back to `main`
4. extract from the main page
