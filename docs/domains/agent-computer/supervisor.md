# Supervisor

Status: Active
Owner: Platform
Last verified: 2026-06-06
Source of truth: Rust supervisor code

## Local Enforcement

`empyralis-supervisor/src/main.rs` receives signed capability requests and
executes only supported capability ids:

- `shell.execute`
- `filesystem.read_write`
- `screenshot.capture`
- `computer_control.ocr`
- `computer_control.move`
- `computer_control.click`
- `computer_control.type`
- `computer_control.key`
- `computer_control.clipboard_read`
- `computer_control.clipboard_write`
- `computer_control.list_windows`
- `computer_control.list_apps`
- `computer_control.launch`
- `computer_control.launch_app`
- `computer_control.notify`
- `computer_control.applescript`
- `computer_control.speak`

The supervisor builds an execution policy from request fields and policy
metadata. Full Access is true only when mode is `full_access` and agent scope is
`sage`; Full Access also requires `full_access_warning_acknowledged=true`.

Shell execution receives a `trusted` flag when the policy is Full Access or when
the request is system-approved. Filesystem execution receives the Full Access
boolean and allowed roots.

## Local Audit And Interrupt

The supervisor stores execution records with request id, capability id, run id,
trace id, workspace id, success/error state, and executed timestamp. It tracks
active executions so control events can interrupt matching work.
