# Empyralis Browser Automation V9

## Goal

Add browser download interception and file handoff to the existing local browser automation path.

This phase keeps the same system shape:

- Workbench configures browser actions
- runtime serializes them into `local-execution-v1`
- local worker executes them
- artifacts and Run Inspect show the results

No second browser subsystem is introduced.

## Scope

V9 adds:

- download interception from browser-driven actions
- deterministic save paths for downloaded files
- download artifacts in the same run result model
- report output that records downloaded files and states

## Supported action

New action:

- `download`

Example:

```json
{
  "action": "download",
  "selector": "#download-link",
  "ms": 8000
}
```

Behavior:

- clicks the selector
- waits for a browser download to start
- saves the file into the run download directory
- waits for the download to finish or timeout
- records the result in action metadata and artifacts

## Runtime behavior

### Electron helper

`desktop/browser_task.js` now:

- listens to `will-download`
- chooses a deterministic save path
- prevents collisions by suffixing duplicate filenames
- records:
  - tab
  - source URL
  - suggested filename
  - saved path
  - completion state

### Local worker

`scripts/orion_local_worker_execution.py` now:

- creates a per-step browser download directory
- passes `downloadDir` into the Electron helper
- records downloaded files in:
  - action payload
  - text report
  - artifact list

Artifact kind:

- `download`

## Frontend connection

This phase is connected to the platform UI.

Frontend surfaces:

- Workbench advanced browser JSON helper text includes `download`
- Run Inspect shows the resulting artifacts through the existing artifact path
- Artifacts page shows downloaded files as normal artifacts

## Outputs

Browser capture with downloads now produces:

- screenshot artifact
- report artifact
- one or more download artifacts

The action payload now includes:

- `downloads[]`

Each item contains:

- `tab`
- `url`
- `filename`
- `file_path`
- `state`

## Validation

Validation for this phase:

- `python3 -m py_compile scripts/orion_local_worker_execution.py`
- `node --check desktop/browser_task.js`
- targeted frontend lint on browser helper UI
- smoke matrix coverage

Smoke case:

- `A16 browser download handoff`

Expected result:

- run completes
- action payload includes at least one download
- artifact list includes at least one `download` artifact

## Current limits

V9 does not add:

- authenticated download session policies beyond existing browser session profiles
- popup/new-window download handling
- drag/drop upload flows

## Next phase

Recommended next step:

- popup and new-window handling
- then stronger authenticated browser controls
