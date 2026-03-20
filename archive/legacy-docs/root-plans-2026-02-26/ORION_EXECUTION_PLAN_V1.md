  Section A: Current Question Inventory



  ┌────────────┬──────┬───────────────────┬─────────────────────────┬─────────────────┬───────────────────────┐
  │ Flow       │ Step │ Prompt Text       │ Options / Input         │ Conditional     │ Destination / Side    │
  │            │      │                   │                         │                 │ Effect                │
  ├────────────┼──────┼───────────────────┼─────────────────────────┼─────────────────┼───────────────────────┤
  │ launcher │ 1    │ "Choose action"   │ Guided, Quick, Goal,    │ -               │ Routes to specific    │
  │            │      │                   │ Specialist, Onboard,    │                 │ flow function         │
  │            │      │                   │ Configure, Connectors,  │                 │                       │
  │            │      │                   │ Doctor, TUI, Exit       │                 │                       │
  │ guided   │ 2    │ "What do you want │ Text Input          │ -               │ goal                │
  │            │      │ Orion to          │                         │                 │                       │
  │            │      │ accomplish?"      │                         │                 │                       │
  │ guided   │ 3    │ "Choose operating │ General, Specialist     │ -               │ Logic branch for      │
  │            │      │ mode"             │                         │                 │ template              │
  │ guided   │ 4    │ "Choose           │ SPECIALIST_PACKS      │ If              │ pack                │
  │            │      │ specialist        │                         │ mode=Specialist │                       │
  │            │      │ template"         │                         │                 │                       │
  │ guided   │ 5    │ "Choose trust     │ TRUST_MODES (Guarded, │ -               │ trust               │
  │            │      │ mode"             │ Auto, Strict...)        │                 │                       │
  │ guided   │ 6    │ "Where should     │ EXECUTION_TARGETS     │ -               │ target              │
  │            │      │ Orion execute     │ (Auto, Cloud, Local)    │                 │                       │
  │            │      │ this run?"        │                         │                 │                       │
  │ guided   │ 7    │ "Add optional run │ Yes/No              │ -               │ If Yes ->             │
  │            │      │ inputs/context    │                         │                 │ collect_pack_inputs │
  │            │      │ now?"             │                         │                 │                       │
  │ guided   │ 8    │ "Connect          │ Yes/No              │ -               │ prompt_connectors   │
  │            │      │ channels/tools    │                         │                 │ flag                  │
  │            │      │ now...?"          │                         │                 │                       │
  │ guided   │ 9    │ "Start run with   │ Yes/No              │ -               │ Triggers run_once   │
  │            │      │ this              │                         │                 │                       │
  │            │      │ configuration?"   │                         │                 │                       │
  │ onboard  │ 1    │ "I understand the │ Yes/No              │ -               │ Security gate         │
  │            │      │ risks..."         │                         │                 │                       │
  │ onboard  │ 2    │ "Select           │ Dynamic List + Skip     │ -               │ provider            │
  │            │      │ model/auth        │                         │                 │                       │
  │            │      │ provider"         │                         │                 │                       │
  │ onboard  │ 3    │ "Credential       │ Existing, New, Skip     │ -               │ Logic branch for auth │
  │            │      │ handling"         │                         │                 │                       │
  │ onboard  │ 4    │ "Select           │ Existing Creds List     │ If Existing     │ credential_id       │
  │            │      │ credential"       │                         │                 │                       │
  │ onboard  │ 5    │ "Connect          │ Yes/No              │ -               │ If Yes ->             │
  │            │      │ channels/tools    │                         │                 │ choose_connectors   │
  │            │      │ now?"             │                         │                 │                       │
  │ onboard  │ 6    │ "Next action"     │ TUI, Web, Finish        │ -               │ Exit route            │
  └────────────┴──────┴───────────────────┴─────────────────────────┴─────────────────┴───────────────────────┘

  Section B: Proposed "Professional Minimal Preflight" Flow


  This flow replaces guided_run_flow with a strictly ordered, high-signal pre-flight check.

  Philosophy: defaults are safe, choices are explicit, "No" is a valid path.


   1. Execution Target (Critical for Resource Usage)
       * Prompt: "Execution Environment"
       * Options: Local Companion (Default), Cloud Container, Auto
   2. Trust & Safety (Critical for Control)
       * Prompt: "Supervision Level"
       * Options: Guarded (Ask before action), Strict (Ask always), Auto (Run until done)
   3. Intelligence Source (Critical for Cost/Quality)
       * Prompt: "Model Provider"
       * Options: [Detected Default] (e.g. GPT-4), Select New..., Local LLM
   4. Credential Strategy (Critical for Security)
       * Prompt: "Credential Source"
       * Options: Use Active Vault (Default), Enter Temporary Key, Environment Variables
   5. Connectivity Scope (Critical for Privacy)
       * Prompt: "Enable External Channels?"
       * Options: None (Sandbox), Messaging Only (Telegram/Slack), Full Suite (All Connectors)
   6. Filesystem Access (New - Critical for Safety)
       * Prompt: "File Access Scope"
       * Options: Workspace Only (Safe), Restricted Paths (project/src), Full System (Dangerous)
   7. Flight Plan (Risk Acknowledgement)
       * Prompt: "Confirm Flight Plan"
       * Display: Summary of above + "Risk: Agent may execute code."
       * Options: Launch, Abort

  Section C: File-by-File Patch Plan


  1. scripts/orion_terminal/core.py
  Additions: Define FILE_ACCESS_SCOPES and CONNECTIVITY_MODES.
  Location: Around line 99 (after EXECUTION_TARGETS).


    1 FILE_ACCESS_SCOPES: List[Choice] = [
    2     Choice("workspace", "Workspace Only", "Read/Write only within project root"),
    3     Choice("restricted", "Restricted", "Specific allowed paths only"),
    4     Choice("full", "Full System", "Unrestricted access (Use with caution)"),
    5 ]
    6
    7 CONNECTIVITY_MODES: List[Choice] = [
    8     Choice("none", "Sandbox", "No external network/messaging tools"),
    9     Choice("messaging", "Messaging Only", "Allow Telegram, Slack, Discord"),
   10     Choice("full", "Full Suite", "Allow all configured connectors"),
   11 ]


  2. scripts/orion_terminal/flows.py
  Modification: Rename guided_run_flow to preflight_check_flow and rewrite implementation.
  Location: Lines 461-548.


  Implementation Logic:
   * Step 1-6: Use ui.choose exclusively for speed (no free text typing unless "Select New" is hit).
   * Step 7: Use ui.message for the summary card + ui.confirm for the final launch button.
   * Payload: Map "Filesystem Access" and "Connectivity" to pack_inputs or runtime_options so the backend receives
     them (even if just for logging initially).


  3. scripts/orion_terminal/widgets.py
  Verification: Ensure step_banner (line 33) supports the new 7-step count without layout breaking. (It uses dynamic
  strings, so it is safe).

  Section D: Risks & Regressions Checklist


   * Risk: server.py may not yet support "File Access Scope" enforcement.
       * Mitigation: Pass as pack_inputs meta-data. The agent will "see" the instruction in its prompt, even if hard
         enforcement isn't in the runtime yet.
   * Risk: Users might get stuck in "Select New" provider loop if no API key is ready.
       * Mitigation: Add a "Back" or "Cancel" option in the sub-menu.
   * Regression: Removing the "Goal" free-text input from the start of the flow.
       * Fix: Move "Goal" input to after the environment checks (just before launch) OR keep it as Step 0 if the user
         entered via orion run. In preflight_check_flow, we will accept goal as an argument; if missing, we ask for it
         as Step 1.

  ---

  Implementation - Step 1: Core Definitions

  I will first update core.py to include the new safety constants.


    1 # Insert into scripts/orion_terminal/core.py
    2 FILE_ACCESS_SCOPES: List[Choice] = [
    3     Choice("workspace", "Workspace Only", "Safe: ./workspace access only"),
    4     Choice("restricted", "Restricted Paths", "Specific allowed directories"),
    5     Choice("full", "Full System", "Root access (Requires approval)"),
    6 ]
    7
    8 CONNECTIVITY_MODES: List[Choice] = [
    9     Choice("none", "Sandbox", "No external tools"),
   10     Choice("messaging", "Messaging", "Telegram/Slack/Discord only"),
   11     Choice("full", "Full Suite", "All active connectors"),
   12 ]


  Implementation - Step 2: Preflight Flow

  I will rewrite guided_run_flow in flows.py.


  Shall I proceed with applying these patches?
