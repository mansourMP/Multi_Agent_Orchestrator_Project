## Empyralis Local Execution Boundary

This note records the current local-execution ownership boundary after the Rust-first cutover.

### Rust owns now

- screen capture
- OCR-backed local coordinate resolution
- keyboard and mouse execution
- clipboard read/write
- application listing and launch
- local notifications
- text-to-speech
- AppleScript execution
- machine bootstrap helpers used by the Tauri shell

These capabilities execute through the Rust supervisor and are invoked from Python through [supervisor_client.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/supervisor_client.py) and [computer_control.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/computer_control.py).

### Python still owns temporarily

- browser/session automation in [browser_engine.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/browser_engine.py)

This remains Python-owned because the current implementation depends on Playwright session management and DOM-aware browser operations that have not yet been moved behind the Rust supervisor. Live browser execution is authorized only through [execution_router.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/execution_router.py), which performs capability and policy gating before delegating to the temporary adapter.

### Planned migration

- move authenticated browser/session automation behind the Rust local supervisor or an equivalent Rust-owned trusted boundary
- keep Python responsible for orchestration and planning, not raw local execution
- remove the temporary Python browser adapter once the Rust path can preserve session persistence, capture, downloads, and DOM-aware interaction semantics

### Non-goals

- Python must not grow new device-touching execution paths outside the Rust supervisor
- browser automation must not bypass [capability_registry.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/capability_registry.py) or [policy_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/policy_service.py)
