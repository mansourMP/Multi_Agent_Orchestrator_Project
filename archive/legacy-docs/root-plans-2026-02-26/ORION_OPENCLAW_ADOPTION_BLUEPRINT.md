
• Section A: Current question inventory table

  | flow_name | step_order | exact_prompt_text | options | default | conditional_trigger | destination_function |
  payload_field_or_api_side_effect |
  |---|---:|---|---|---|---|---|---|
  | app.main | 1 | Runtime API key (ORION_API_KEY / RUNTIME_KEY) | free text (secret) | none | shown when CLI arg/env
  key missing | main() | runtime auth value for all API calls (X-API-Key) |
  | app.main | 2 | What should Orion run now? | free text | none | when --mode run and no --goal value | run_once()
  | /runs/start.user_goal |
  | launcher | 1 | Choose action | Guided Run, Quick Start, Custom Goal, Specialist Template, Onboard, Configure,
  Connect Channels, Runtime Doctor, Live TUI, Exit | Guided Run | always in launcher loop | launcher_flow() | routes
  to selected subflow |
  | guided_run | 1 | What do you want Orion to accomplish? | free text | DEFAULT_QUICK_GOAL | action=guided |
  guided_run_flow() | /runs/start.user_goal |
  | guided_run | 2 | Choose operating mode | General Digital Worker, Specialist Template | General Digital Worker |
  always | guided_run_flow() | sets pack / metadata outcome_pack |
  | guided_run | 3 | Choose specialist template | Client Workflow Autopilot, Weekly Content Studio, Competitor Brief
  Digest | first pack | only if mode=specialist | guided_run_flow() | metadata outcome_pack |
  | guided_run | 4 | Choose trust mode | Guarded, Auto, Strict, Cost Guard, Sensitive Guard | Guarded | always |
  guided_run_flow() | metadata trust_mode |
  | guided_run | 5 | Where should Orion execute this run? | Auto, Cloud, Local Companion | Auto | always |
  guided_run_flow() | metadata execution_target |
  | guided_run | 6 | Add optional run inputs/context now? | yes/no | No | always | guided_run_flow() +
  collect_pack_inputs() | metadata pack_inputs |
  | guided_run | 7 | Connect channels/tools now (Google Workspace / Telegram / WhatsApp)? | yes/no | No | always |
  guided_run_flow() | controls connector setup before run |
  | guided_run | 8 | Start run with this configuration? | yes/no | Yes | after summary | guided_run_flow() ->
  run_once() | starts /runs/start |
  | run_once | 1 | Connect channels/tools before this run (Google Workspace / Telegram / WhatsApp)? | yes/no | No |
  only when prompt_connectors=True | run_once() | may create connector vault entries; adds metadata connector ids |
  | stream_run | 1 | Resolve approval | Proceed, Hold | Proceed | on SSE pause event | stream_run() | POST /runs/{id}/
  decision with decision |
  | launcher.goal_path | 1 | What do you want Orion to do? | free text | none | action=goal | launcher_flow() ->
  run_once() | /runs/start.user_goal |
  | launcher.goal_path | 2 | Choose trust mode | trust mode set | Guarded | action=goal | launcher_flow() | metadata
  trust_mode |
  | launcher.goal_path | 3 | Choose execution target | execution target set | Auto | action=goal | launcher_flow() |
  metadata execution_target |
  | launcher.goal_path | 4 | Add optional context fields? | yes/no | No | action=goal | collect_pack_inputs() |
  metadata pack_inputs |
  | launcher.specialist_path | 1 | Choose specialist template | specialist packs | first pack | action=specialist |
  launcher_flow() | metadata outcome_pack |
  | launcher.specialist_path | 2 | Goal | free text | Execute {pack} end-to-end... | action=specialist |
  launcher_flow() | /runs/start.user_goal |
  | launcher.specialist_path | 3 | Choose trust mode | trust mode set | Guarded | action=specialist | launcher_flow()
  | metadata trust_mode |
  | launcher.specialist_path | 4 | Choose execution target | execution target set | Auto | action=specialist |
  launcher_flow() | metadata execution_target |
  | collect_pack_inputs.general | 1 | Extra context (domain, constraints, style) | free text | empty | when no pack id
  | collect_pack_inputs() | metadata pack_inputs.context |
  | collect_pack_inputs.general | 2 | Success criteria | free text | empty | when no pack id | collect_pack_inputs() |
  metadata pack_inputs.success_criteria |
  | collect_pack_inputs.weekly-content-studio | 1 | Topics (one line or use | separator) | free text | empty |
  pack=weekly-content-studio | collect_pack_inputs() | metadata pack_inputs.topics |
  | collect_pack_inputs.weekly-content-studio | 2 | Channels (example: Instagram|Email|LinkedIn) | free text | empty |
  pack=weekly-content-studio | collect_pack_inputs() | metadata pack_inputs.channels |
  | collect_pack_inputs.weekly-content-studio | 3 | Offers / CTAs | free text | empty | pack=weekly-content-studio |
  collect_pack_inputs() | metadata pack_inputs.offers |
  | collect_pack_inputs.competitor | 1 | Competitors | free text | empty | pack=competitor-brief-digest |
  collect_pack_inputs() | metadata pack_inputs.competitors |
  | collect_pack_inputs.competitor | 2 | Your positioning | free text | empty | pack=competitor-brief-digest |
  collect_pack_inputs() | metadata pack_inputs.positioning |
  | collect_pack_inputs.competitor | 3 | Objectives | free text | empty | pack=competitor-brief-digest |
  collect_pack_inputs() | metadata pack_inputs.objectives |
  | collect_pack_inputs.client-workflow | 1 | Inbox messages | free text | empty | pack=customer-ops-autopilot |
  collect_pack_inputs() | metadata pack_inputs.inbox |
  | collect_pack_inputs.client-workflow | 2 | Leads | free text | empty | pack=customer-ops-autopilot |
  collect_pack_inputs() | metadata pack_inputs.leads |
  | collect_pack_inputs.client-workflow | 3 | Booking slots | free text | empty | pack=customer-ops-autopilot |
  collect_pack_inputs() | metadata pack_inputs.slots |
  | onboard | 1 | I understand the risks and want to continue onboarding. | yes/no | No | action=onboard |
  onboard_flow() | gates setup session creation |
  | onboard | 2 | Select model/auth provider | provider catalog + Skip for now | first provider | onboarding provider
  section | provider_and_credential_section() | POST /setup/sessions/{id}/actions action=select_provider |
  | onboard | 3 | Credential handling | Use existing credential, Add new credential, Skip provider auth | existing if
  found, else new | provider chosen | provider_and_credential_section() | branch to existing/new/skip auth flow |
  | onboard | 4 | Select credential | existing workspace creds for provider | first credential | credential
  handling=existing and creds available | provider_and_credential_section() | action=submit_credential; verify request
  |
  | onboard | 5 | Connect channels/tools now? | yes/no | No | after provider section | onboard_flow() | optionally
  opens connector creation |
  | onboard | 6 | Next action | Open Live TUI, Open Web UI, Finish | Finish | end of onboarding | onboard_flow() | may
  launch TUI or print web URL |
  | credential.create | 1 | Credential label | free text | {provider}-credential | credential handling=new |
  _create_provider_credential() | POST /credentials/vault.label |
  | credential.create.openai | 2 | OpenAI credential type | API Key, Codex OAuth Access Token | API Key |
  provider=openai | _create_provider_credential() | sets credential payload shape |
  | credential.create.openai | 3 | Codex OAuth access token | free text (secret) | none | openai + oauth option |
  _create_provider_credential() | stores credentials.access_token |
  | credential.create.openai | 3 | OpenAI API key | free text (secret) | none | openai + api key option |
  _create_provider_credential() | stores credentials.api_key |
  | credential.create.anthropic | 2 | Anthropic API key | free text (secret) | none | provider=anthropic |
  _create_provider_credential() | stores credentials.api_key |
  | credential.create.gemini | 2 | Google Gemini API key | free text (secret) | none | provider=gemini |
  _create_provider_credential() | stores credentials.api_key |
  | credential.create.vertex | 2 | Vertex access token | free text (secret) | none | provider=vertex |
  _create_provider_credential() | stores credentials.access_token |
  | credential.create.vertex | 3 | Vertex project_id | free text | none | provider=vertex |
  _create_provider_credential() | stores credentials.project_id |
  | credential.create.vertex | 4 | Vertex location | free text | us-central1 | provider=vertex |
  _create_provider_credential() | stores credentials.location |
  | credential.create.generic | 2 | Credential JSON object (example: {"api_key":"..."}) | free text JSON | none |
  unknown provider | _create_provider_credential() | stores parsed credentials object |
  | connectors | 1 | Choose connector to add | runtime connector catalog | first connector | connector setup invoked |
  choose_and_create_connectors() | chooses connector type |
  | connectors.google | 2 | Connector label | free text | Google Workspace | selected connector=google_workspace |
  create_connector_interactive() | /connectors/vault.label |
  | connectors.google | 3 | Google access_token | free text (secret) | none | google connector |
  create_connector_interactive() | /connectors/vault.credentials.access_token |
  | connectors.google | 4 | Calendar ID | free text | primary | google connector | create_connector_interactive() | /
  connectors/vault.credentials.calendar_id |
  | connectors.google | 5 | Timezone | free text | UTC | google connector | create_connector_interactive() | /
  connectors/vault.credentials.timezone |
  | connectors.telegram | 2 | Connector label | free text | Telegram Bot | selected connector=telegram_bot |
  create_connector_interactive() | /connectors/vault.label |
  | connectors.telegram | 3 | Telegram bot token | free text (secret) | none | telegram connector |
  create_connector_interactive() | /connectors/vault.credentials.bot_token |
  | connectors.telegram | 4 | Telegram chat_id | free text | none | telegram connector |
  create_connector_interactive() | /connectors/vault.credentials.chat_id |
  | connectors.whatsapp | 2 | Connector label | free text | WhatsApp Twilio | selected connector=whatsapp_twilio |
  create_connector_interactive() | /connectors/vault.label |
  | connectors.whatsapp | 3 | Twilio account SID | free text | none | whatsapp connector |
  create_connector_interactive() | /connectors/vault.credentials.account_sid |
  | connectors.whatsapp | 4 | Twilio auth token | free text (secret) | none | whatsapp connector |
  create_connector_interactive() | /connectors/vault.credentials.auth_token |
  | connectors.whatsapp | 5 | WhatsApp from number | free text | whatsapp:+14155238886 | whatsapp connector |
  create_connector_interactive() | /connectors/vault.credentials.from_number |
  | connectors.whatsapp | 6 | WhatsApp to number | free text | none | whatsapp connector |
  create_connector_interactive() | /connectors/vault.credentials.to_number |
  | connectors | 7 | Add another connector? | yes/no | No | after each connector creation attempt |
  choose_and_create_connectors() | repeats connector loop |
  | live_tui | 1 | Choose Live TUI action | Run Goal, Change Mode, Change Trust Mode, Change Execution Target, Connect
  Channels/Tools, Run Doctor, Advanced Input, Exit | Run Goal | action=tui | run_tui_shell() | routes inside shell |
  | live_tui | 2 | Choose trust mode | trust mode set | Guarded | action=Change Trust Mode | run_tui_shell() | updates
  in-memory run defaults |
  | live_tui | 3 | Choose execution target | execution target set | Auto | action=Change Execution Target |
  run_tui_shell() | updates in-memory run defaults |
  | live_tui | 4 | Choose active mode | General Digital Worker + specialist packs | general | action=Change Mode |
  run_tui_shell() | updates in-memory mode |
  | live_tui | 5 | Type command or goal | free text | empty | action=Advanced Input | run_tui_shell() | may run goal
  directly |
  | live_tui | 6 | How do you want to run? | Use default digital coworker goal, Use mode-aware default goal, Type a
  custom goal, Back | template if specialist else quick | action=Run Goal | run_tui_shell() | picks goal source |
  | live_tui | 7 | What should Orion run now? | free text | none | run source=custom | run_tui_shell() | /runs/
  start.user_goal |
  | live_tui | 8 | Add pack inputs for this run? | yes/no | No | specialist mode | collect_pack_inputs() | metadata
  pack_inputs |
  | live_tui | 8 | Add optional context fields? | yes/no | No | general mode | collect_pack_inputs() | metadata
  pack_inputs |

  ———

  Section B: Proposed vNext question set (Professional Minimal Preflight, max 7)

  1. Execution location

  - Prompt: Where should Orion execute this run?
  - Options: Auto, Cloud, Local Companion
  - Default: Auto

  2. Trust mode

  - Prompt: How much autonomy should Orion have for this run?
  - Options: Guarded, Auto, Strict, Cost Guard, Sensitive Guard
  - Default: Guarded

  3. Model/auth provider

  - Prompt: Select provider for this run
  - Options: provider catalog + Use runtime default + Skip for now
  - Default: last successful provider, else first catalog item

  4. Credential source

  - Prompt: How should Orion authenticate to this provider?
  - Options: Use saved workspace credential, Use runtime/env credential, Set up later
  - Default: saved if available, else runtime/env

  5. Channels/tools connection decision

  - Prompt: Connect channels/tools before starting?
  - Options: Connect now, Later, No external channels
  - Default: Later

  6. File access scope

  - Prompt: Choose file access scope
  - Options: Workspace Only, Restricted Paths, Full Access
  - Default: Workspace Only

  7. Final risk acknowledgement + start

  - Prompt: I reviewed trust, provider, and file-access scope. Start now?
  - Options: Start, Cancel
  - Default: Cancel for first-time onboarding, Start for returning user

  Design notes:

  - Keep transcript concise using current [decision]/[detail] style.
  - Never echo raw credential values in logs; only masked labels or ids.
  - Keep selector UX through current UI.choose + widgets.py markers/spinner.

  ———

  Section C: File-by-file patch plan (no code executed)

  Per your instruction, I did not modify files. This is the exact diff plan.

  1. Add file-access scope constants

  - File: core.py (/Users/mansur/Multi_Agent_Orchestrator_Project/scripts/orion_terminal/core.py)
  - Anchor: around EXECUTION_TARGETS (~74-79)
  - Change:
      - Add FILE_ACCESS_SCOPES: List[Choice] with workspace_only, restricted_paths, full_access.

  2. Add shared preflight collector

  - File: flows.py (/Users/mansur/Multi_Agent_Orchestrator_Project/scripts/orion_terminal/flows.py)
  - Anchor: after value_log() and before collect_pack_inputs() (~155-159)
  - Function to add:
      - professional_minimal_preflight(...) -> Dict[str, Any]
  - Responsibilities:
      - Ask exactly 7 questions from Section B.
      - Resolve provider list from /providers.
      - Resolve credential-source choice from workspace vault availability.
      - Keep decisions in structured dict (trust_mode, execution_target, provider, credential_source,
        file_access_scope, connectors_decision, start_confirmed).

  3. Wire preflight into Guided Run

  - File: flows.py (/Users/mansur/Multi_Agent_Orchestrator_Project/scripts/orion_terminal/flows.py)
  - Anchor: guided_run_flow() (~461-548)
  - Change:
      - Replace current trust/target/connect/start confirmation block with shared preflight call.
      - Keep goal/mode/pack flow as-is to preserve Orion identity.
      - Pass preflight outputs into run_once().

  4. Wire preflight into Onboard

  - File: flows.py (/Users/mansur/Multi_Agent_Orchestrator_Project/scripts/orion_terminal/flows.py)
  - Anchor: onboard_flow() (~912-968)
  - Change:
      - Insert shared preflight right after setup session creation.
      - Use preflight provider/credential intent to reduce duplicate questioning.
      - Use preflight connector decision for immediate connector setup behavior.
      - Keep Next action selector unchanged.

  5. Support preflight metadata in run payload

  - File: flows.py (/Users/mansur/Multi_Agent_Orchestrator_Project/scripts/orion_terminal/flows.py)
  - Anchor: run_once() metadata block (~584-602)
  - Change:
      - Accept extra_metadata arg (optional).
      - Merge non-sensitive preflight fields into metadata:
          - file_access_scope
          - provider_selection
          - credential_source
          - connector_decision
      - Do not include secrets.

  6. Optional fast-path run mode alignment

  - File: app.py (/Users/mansur/Multi_Agent_Orchestrator_Project/scripts/orion_terminal/app.py)
  - Anchor: if args.goal.strip() or args.mode == "run": (~81-95)
  - Change:
      - Optional: call preflight before run_once() when mode is interactive and not fully scripted.
      - Skip preflight when --goal is used with non-interactive automation flags (future-ready behavior).

  ———

  Section D: Risks/regressions checklist

  1. Prompt duplication risk

  - If preflight is added but old provider/trust/target prompts remain, UX becomes repetitive.
  - Mitigation: single source of truth via shared preflight helper.

  2. Backward compatibility for scripted CLI usage

  - orion --mode run --goal "..." may break automation if preflight is forced.
  - Mitigation: bypass preflight in explicit non-interactive/scripted invocations.

  3. Credential selection ambiguity

  - If Use saved credential and multiple credentials exist, auto-picking can be surprising.
  - Mitigation: deterministic “last used” or explicit quick selector only when >1.

  4. Setup session action contract mismatch

  - New metadata/actions may not be recognized by /setup/sessions/{id}/actions.
  - Mitigation: keep unknown preference data local/UI-side unless backend contract is expanded.

  5. Sensitive data leakage in transcript

  - Existing logs are mostly safe, but new code must never print token/key values.
  - Mitigation: keep masking utility and log only labels/id fragments.

  6. Run-start payload drift

  - Added metadata keys must not override expected backend keys.
  - Mitigation: namespaced metadata fields and additive merge only.

  7. UX complexity creep

  - Adding too many optional branches can exceed “minimal” objective.
  - Mitigation: enforce hard cap of 7 preflight questions; push advanced setup to configure.

  8. Selector/spinner consistency

  - New prompts must use existing UI.choose/confirm/input to preserve marker/spinner style.
  - Mitigation: no custom rendering path; reuse current widget layer.

  If you want, next I can convert this directly into a single implementation patch set with exactly these anchors.

