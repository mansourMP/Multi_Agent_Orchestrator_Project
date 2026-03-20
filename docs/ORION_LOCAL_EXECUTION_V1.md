## Local Execution V1

### Purpose
Turn Empyralis into a real control plane plus execution plane system:

- `Platform`: agents, automations, approvals, runs, artifacts, integrations
- `Local companion`: executes trusted local-machine actions

V1 is intentionally narrow. It adds one explicit local execution pack on top of the existing local worker path instead of creating a second runtime.

### Current insertion point

Existing code already provides:

- run routing with `execution_target=local_companion`
- local queue + lease/heartbeat via `server_modules/local_queue.py`
- local worker claim/complete/fail loop via `scripts/orion_local_worker.py`
- tool policy contracts and risk evaluation via `server_modules/runtime_policy.py`

What is missing today:

- a real local execution contract behind the policy layer
- a supported pack for shell/files/screenshots
- explicit constraints for root scope, command allowlist, and artifact capture

### V1 scope

Add one new outcome pack:

- `local-execution-v1`

Supported tools in V1:

1. `execute_shell_command`
2. `read_write_files`
3. `capture_screenshot`

V1 is not:

- full desktop GUI automation
- arbitrary command execution without policy
- mid-run interactive approval orchestration
- a replacement for a native desktop app

### Execution path

1. UI or API starts a run with:
   - `metadata.outcome_pack = "local-execution-v1"`
   - `metadata.execution_target = "local_companion"`
2. Runtime computes `tool_policy_precheck`
3. Run is queued locally
4. Local worker claims run
5. Local worker executes requested operations under V1 guards
6. Worker returns:
   - summary
   - structured `outputs.actions`
   - file/screenshot artifacts
   - bounded previews
7. Existing `Runs`, `Artifacts`, `Agents`, and inspect views consume the result

### Tool contract

#### 1. `execute_shell_command`

Input:

```json
{
  "tool": "execute_shell_command",
  "command": "pwd",
  "cwd": ".",
  "timeout_seconds": 20
}
```

Rules:

- command is tokenized and executed without shell interpolation
- command must match an allowlisted prefix
- working directory must stay inside the configured local root
- stdout/stderr previews are bounded
- full command transcript is stored as a local artifact

#### 2. `read_write_files`

Input:

```json
{
  "tool": "read_write_files",
  "mode": "read",
  "path": "README.md"
}
```

or

```json
{
  "tool": "read_write_files",
  "mode": "write",
  "path": "notes/todo.txt",
  "content": "hello",
  "overwrite": true
}
```

Rules:

- all paths are resolved inside the configured local root
- V1 is text-file oriented
- previews are bounded
- writes create parent directories if needed

#### 3. `capture_screenshot`

Input:

```json
{
  "tool": "capture_screenshot",
  "path": ".orion-artifacts/local-execution/screenshots/manual-check.png"
}
```

Rules:

- screenshot path is resolved inside the configured local root
- if no path is provided, worker creates one under `.orion-artifacts/local-execution/screenshots/`
- success depends on OS support and active user/display permissions

### Pack input schema

Recommended input:

```json
{
  "operations": [
    { "tool": "execute_shell_command", "command": "pwd" },
    { "tool": "read_write_files", "mode": "read", "path": "README.md" },
    { "tool": "capture_screenshot" }
  ],
  "continue_on_error": false
}
```

Single-operation shorthand is allowed for V1, but `operations[]` is the primary contract.

### Safety model

#### Root confinement

- `ORION_LOCAL_COMPANION_ROOT` defines the execution root
- all file paths and command working directories must stay inside that root

Fallback root:

- `ORION_COGNITIVE_OPERATOR_ROOT`
- otherwise current repo root / process cwd

#### Command allowlist

Shell commands are only allowed if they match one of:

- `ORION_LOCAL_COMPANION_COMMAND_ALLOW_PREFIXES`
- or the default local companion allowlist

V1 does not support arbitrary shell execution.

#### Policy interaction

The runtime precheck remains the source of truth for allowed/blocked tools.

V1 rule:

- `blocked` tools do not execute
- `approval_required` tools are not auto-executed by the worker in V1

That means:

- shell execution is available only when policy explicitly permits it
- root-confined file operations and screenshots are allowed by default in guarded mode
- this is deliberate until an interactive approval loop is implemented on the local execution path

### Result contract

Expected result shape:

```json
{
  "pack_id": "local-execution-v1",
  "summary": "Executed 2 of 2 local operations.",
  "outputs": {
    "operations_requested": 2,
    "operations_executed": 2,
    "outbound_actions": 0,
    "urgent_count": 0,
    "actions": [
      {
        "action": "execute_shell_command",
        "command": "pwd",
        "exit_code": 0,
        "stdout_preview": "/path",
        "file_path": ".orion-artifacts/local-execution/run-1-command-1.log"
      },
      {
        "action": "capture_screenshot",
        "file_path": ".orion-artifacts/local-execution/screenshots/run-1-shot-1.png"
      }
    ],
    "artifacts": [
      {
        "kind": "report",
        "file_path": ".orion-artifacts/local-execution/run-1-command-1.log"
      },
      {
        "kind": "screenshot",
        "file_path": ".orion-artifacts/local-execution/screenshots/run-1-shot-1.png"
      }
    ],
    "errors": []
  }
}
```

### Explicit V1 limits

Not in V1:

- mouse/keyboard control
- arbitrary application automation
- background GUI automation on locked/headless machines
- interactive approval resume on the local worker path
- remote multi-host execution orchestration

### Immediate next steps after V1

1. Add approval-aware local execution resume
2. Add typed file read vs file write tool IDs
3. Add browser automation adapter
4. Add desktop/app control adapter
5. Package local companion as a real desktop/runtime service

### Example API flow

Preview:

```bash
curl -s -H "X-API-Key: replace-with-strong-key" -H "Content-Type: application/json" \
  -d '{
    "engine":"orion",
    "workspace_id":"default",
    "user_goal":"Run local execution test",
    "metadata":{
      "outcome_pack":"local-execution-v1",
      "execution_target":"local_companion",
      "trust_mode":"auto",
      "pack_inputs":{
        "operations":[
          {"tool":"read_write_files","mode":"read","path":"README.md"}
        ]
      }
    }
  }' \
  http://127.0.0.1:8001/runs/precheck | jq
```

Start:

```bash
curl -s -H "X-API-Key: replace-with-strong-key" -H "Content-Type: application/json" \
  -d '{
    "engine":"orion",
    "workspace_id":"default",
    "user_goal":"Run local execution test",
    "metadata":{
      "outcome_pack":"local-execution-v1",
      "execution_target":"local_companion",
      "trust_mode":"auto",
      "pack_inputs":{
        "operations":[
          {"tool":"read_write_files","mode":"read","path":"README.md"}
        ]
      }
    }
  }' \
  http://127.0.0.1:8001/runs/start | jq
```
