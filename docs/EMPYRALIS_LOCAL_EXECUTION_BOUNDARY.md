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

### Python permanent exception boundary

- browser/session automation in [browser_engine.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/browser_engine.py)

This remains Python-owned because the active implementation depends on Playwright session management, authenticated profile persistence, downloads, PDFs, and DOM-aware browser operations. Live browser execution is authorized only through [execution_router.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/execution_router.py), which performs capability and policy gating before delegating to the browser adapter. This is the accepted permanent exception boundary for browser/session work.

### Future reconsideration

- Python remains responsible for orchestrating DOM-aware browser/session work through the authorized adapter
- Rust remains responsible for direct device control and local high-trust capability enforcement
- a future Rust browser path is allowed only if it preserves session persistence, downloads, PDFs, and DOM-aware interaction semantics without weakening the current policy chokepoint

### Non-goals

- Python must not grow new device-touching execution paths outside the Rust supervisor
- browser automation must not bypass [capability_registry.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/capability_registry.py) or [policy_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/policy_service.py)
