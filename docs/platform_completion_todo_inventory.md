# Platform Completion TODO And Stub Inventory

Generated: 2026-06-03

Scope: server_modules, frontend, mobile, empyralis-gateway, empyralis-supervisor, apps/empyralis-tray. Dependency/build directories excluded.

Note: generic UI placeholder attributes are included because the requested inventory asked for placeholder matches. Treat product/dead-end placeholders separately from ordinary input placeholders during cleanup.

```text
server_modules/browser_engine.py:622:                placeholder: (el.getAttribute('placeholder') || '').trim(),
mobile/src/lib/api.ts:601:    throw new Error(`Could not ${purpose} because your Sage workspace is not ready yet.`);
frontend/lib/workspace/workstation-hardware-pane.tsx:1159:                      <input className="app-field" type="text" value={sshHost} onChange={(event) => setSshHost(event.target.value)} placeholder="server.example.com" />
frontend/lib/workspace/workstation-hardware-pane.tsx:1167:                      <input className="app-field" type="text" value={sshUsername} onChange={(event) => setSshUsername(event.target.value)} placeholder="ubuntu" />
frontend/lib/workspace/workstation-hardware-pane.tsx:1216:                    <div className="workstation-hardware-qr-placeholder">
mobile/src/components/InputBar.tsx:28:  placeholder?: string;
mobile/src/components/InputBar.tsx:43:  placeholder,
mobile/src/components/InputBar.tsx:169:          placeholder={placeholder || "Message"}
mobile/src/components/InputBar.tsx:170:          placeholderTextColor={theme.colors.textMuted}
frontend/lib/workspace/workstation-runs-pane.tsx:955:                    placeholder="Search by trace ID"
mobile/src/screens/LoginScreen.tsx:305:            placeholder="Email"
mobile/src/screens/LoginScreen.tsx:306:            placeholderTextColor={theme.colors.textMuted}
mobile/src/screens/LoginScreen.tsx:327:            placeholder="Password"
mobile/src/screens/LoginScreen.tsx:328:            placeholderTextColor={theme.colors.textMuted}
frontend/lib/workspace/workstation-kernel-shell.tsx:1891:              <div className="workstation-shell-panel__placeholder">
frontend/lib/workspace/workstation-activity-pane.tsx:1322:                placeholder={displayNameHint}
frontend/lib/workspace/workstation-activity-pane.tsx:1331:                placeholder="Example: Keep my inbox triaged."
frontend/lib/workspace/workstation-activity-pane.tsx:1343:                placeholder="Example: I run product and engineering for Empyralis."
frontend/lib/workspace/workstation-activity-pane.tsx:1353:                placeholder="Example: Be direct, concise, and lead with the answer."
frontend/lib/workspace/workstation-activity-pane.tsx:1363:                placeholder="Example: Never send external messages without approval."
frontend/lib/workspace/workstation-activity-pane.tsx:1418:                placeholder="SHOP_PLAYBOOK"
frontend/lib/workspace/workstation-activity-pane.tsx:1499:                placeholder="Example: Preferred working style"
frontend/lib/workspace/workstation-activity-pane.tsx:1509:                placeholder="Example: Prefers concise updates with clear next actions."
mobile/app/memory.tsx:216:      setStatus({ kind: "error", message: "Sage is not ready yet." });
mobile/app/memory.tsx:351:                  placeholder={`Write ${layer.title.toLowerCase()} here`}
mobile/app/memory.tsx:352:                  placeholderTextColor={theme.colors.textSecondary}
mobile/ios/Empyralis/SplashScreen.storyboard:28:                <placeholder placeholderIdentifier="IBFirstResponder" id="EXPO-PLACEHOLDER-1" userLabel="First Responder" sceneMemberID="firstResponder"/>
mobile/src/screens/ChatScreen.tsx:912:    const placeholderIndex = nextUserMessageIndex + 1;
mobile/src/screens/ChatScreen.tsx:935:      removeMessage(currentSessionId, placeholderIndex);
mobile/src/screens/ChatScreen.tsx:944:      let nextStreamCardIndex = placeholderIndex + 1;
mobile/src/screens/ChatScreen.tsx:981:            updateMessage(currentSessionId, placeholderIndex, {
mobile/src/screens/ChatScreen.tsx:996:      updateMessage(currentSessionId, placeholderIndex, {
mobile/src/screens/ChatScreen.tsx:1044:        removeMessage(currentSessionId, placeholderIndex);
mobile/src/screens/ChatScreen.tsx:1052:      removeMessage(currentSessionId, placeholderIndex);
mobile/src/screens/ChatScreen.tsx:1080:        const placeholderIndex = messages.length;
mobile/src/screens/ChatScreen.tsx:1088:        let nextStreamCardIndex = placeholderIndex + 1;
mobile/src/screens/ChatScreen.tsx:1126:              updateMessage(activeSession.id, placeholderIndex, {
mobile/src/screens/ChatScreen.tsx:1133:        updateMessage(activeSession.id, placeholderIndex, {
mobile/src/screens/ChatScreen.tsx:1779:            placeholder={requestedAgentId ? `Message ${activeAgent.label}` : "Ask Sage anything"}
frontend/lib/workspace/workstation-gateway-operator-pane.tsx:2056:                placeholder="My MacBook"
frontend/lib/workspace/workstation-gateway-operator-pane.tsx:2137:                    placeholder="/Users/mansur/Work"
frontend/lib/workspace/workstation-gateway-operator-pane.tsx:2146:                    placeholder="/Users/mansur/Work/secrets"
frontend/lib/workspace/workstation-gateway-operator-pane.tsx:2155:                    placeholder="example.com"
frontend/lib/workspace/workstation-gateway-operator-pane.tsx:2733:                  placeholder="8618657105303"
frontend/lib/workspace/workstation-gateway-operator-pane.tsx:2740:                  placeholder="8618657105303"
frontend/lib/workspace/workstation-gateway-operator-pane.tsx:2786:                  placeholder="123456"
frontend/lib/workspace/workstation-gateway-operator-pane.tsx:2794:                  placeholder="Telegram app secret"
frontend/lib/workspace/workstation-gateway-operator-pane.tsx:2801:                  placeholder="+8618657105303"
frontend/lib/workspace/workstation-gateway-operator-pane.tsx:2821:                  placeholder="123456789"
mobile/app/gateway.tsx:497:              placeholder="My MacBook"
mobile/app/gateway.tsx:498:              placeholderTextColor={theme.colors.textSecondary}
frontend/lib/workspace/workstation-client.ts:209:  placeholder?: string | null;
frontend/lib/workspace/workstation-chat-pane-model.ts:2530:          placeholder: readString(currentQuestionRecord.placeholder),
mobile/app/apps/[id]/home.tsx:301:          <LabeledInput label="Set name" value={setName} onChangeText={setSetName} placeholder="Biology set" />
mobile/app/apps/[id]/home.tsx:306:            placeholder="Paste the notes you want turned into flashcards."
mobile/app/apps/[id]/home.tsx:966:  placeholder,
mobile/app/apps/[id]/home.tsx:973:  placeholder: string;
mobile/app/apps/[id]/home.tsx:985:        placeholder={placeholder}
mobile/app/apps/[id]/home.tsx:986:        placeholderTextColor={theme.colors.textSecondary}
mobile/app/apps/register.tsx:95:        <Field label="App name" value={name} onChangeText={setName} placeholder="Inventory Helper" />
mobile/app/apps/register.tsx:96:        <Field label="App id" value={slug} onChangeText={setSlug} placeholder={slugify(name) || "inventory_helper"} />
mobile/app/apps/register.tsx:97:        <Field label="App source URL" value={hostedUrl} onChangeText={setHostedUrl} placeholder="https://example.com/app" />
mobile/app/apps/register.tsx:102:          placeholder="What this app helps with."
mobile/app/apps/register.tsx:160:  placeholder,
mobile/app/apps/register.tsx:166:  placeholder: string;
mobile/app/apps/register.tsx:176:        placeholder={placeholder}
mobile/app/apps/register.tsx:177:        placeholderTextColor={theme.colors.textSecondary}
frontend/lib/workspace/workstation-chat-pane.tsx:3616:                        placeholder={bootstrapQuestion?.placeholder || 'Add the next answer for Sage'}
frontend/lib/workspace/workstation-chat-pane.tsx:3764:        placeholder="Message Sage..."
frontend/lib/workspace/workstation-chat-pane.tsx:3955:                placeholder="Example: Preferred working style"
frontend/lib/workspace/workstation-chat-pane.tsx:3969:                placeholder="Example: Prefers concise status updates and direct next steps."
frontend/lib/workspace/deployed-agents/roster-sidebar.tsx:223:                    placeholder="Search agents"
frontend/lib/workspace/workstation-chat-pane-hooks.ts:91:      placeholder: string;
frontend/lib/workspace/workstation-sage-connectors-pane.tsx:1380:      detail: readString(browserAttachRecord.summary, 'Your browser is not ready yet.'),
frontend/lib/workspace/workstation-sage-connectors-pane.tsx:3135:                  placeholder={providerCredentialPlaceholder(record.provider)}
frontend/lib/workspace/workstation-sage-connectors-pane.tsx:3163:                  placeholder={providerBaseUrlPlaceholder(record.provider)}
frontend/lib/workspace/workstation-sage-connectors-pane.tsx:3239:                placeholder="8618657105303"
frontend/lib/workspace/workstation-sage-connectors-pane.tsx:3246:                placeholder="8618657105303"
frontend/lib/workspace/workstation-sage-connectors-pane.tsx:3256:                placeholder="123456"
frontend/lib/workspace/workstation-sage-connectors-pane.tsx:3263:                placeholder="Telegram app secret"
frontend/lib/workspace/workstation-sage-connectors-pane.tsx:3270:                placeholder="+8618657105303"
frontend/lib/workspace/workstation-sage-connectors-pane.tsx:3290:                placeholder="123456789"
frontend/lib/workspace/workstation-sage-connectors-pane.tsx:3712:                placeholder={providerCredentialPlaceholder(record.provider)}
frontend/lib/workspace/workstation-sage-connectors-pane.tsx:3733:                  placeholder={providerBaseUrlPlaceholder(record.provider)}
frontend/lib/workspace/workstation-sage-connectors-pane.tsx:4129:                placeholder="inventory-feed"
frontend/lib/workspace/workstation-sage-connectors-pane.tsx:4142:                placeholder="Inventory Feed"
frontend/lib/workspace/workstation-sage-connectors-pane.tsx:4153:                placeholder="https://example.com/mcp"
frontend/lib/workspace/workstation-sage-connectors-pane.tsx:4275:            <div className="sage-integrations-nav__placeholder">Loading apps and accounts…</div>
frontend/lib/workspace/workstation-deployed-agent-test-turn-pane.tsx:207:          placeholder="Message this agent privately..."
frontend/lib/workspace/workstation-artifacts-pane.tsx:245:                placeholder="Search"
frontend/lib/workspace/hosted-mini-apps-pane.tsx:611:                    placeholder="Budget Tracker"
frontend/lib/workspace/hosted-mini-apps-pane.tsx:625:                    placeholder="Optional website URL"
frontend/lib/workspace/hosted-mini-apps-pane.tsx:640:                  placeholder="Track daily expenses and monthly spending patterns."
frontend/lib/workspace/deployed-agents/ai-settings.tsx:286:                  placeholder={selectedProvider ? `Paste ${selectedProvider.label} API key` : 'Choose provider first'}
frontend/lib/workspace/workspace-setup-form.tsx:165:            placeholder="Acme Deal Room"
mobile/app/session.tsx:217:          placeholder="EMP2..."
mobile/app/session.tsx:229:        <Field label="Runtime URL" value={runtimeUrl} onChangeText={setRuntimeUrl} placeholder="http://192.168.1.10:8000" />
mobile/app/session.tsx:230:        <Field label="Runtime key" value={runtimeKey} onChangeText={setRuntimeKey} placeholder="Paste runtime key" secureTextEntry />
mobile/app/session.tsx:231:        <Field label="Workspace ID" value={workspaceId} onChangeText={setWorkspaceId} placeholder="workspace id" />
mobile/app/session.tsx:232:        <Field label="Platform URL" value={platformUrl} onChangeText={setPlatformUrl} placeholder="Optional" />
mobile/app/session.tsx:261:  placeholder,
mobile/app/session.tsx:268:  placeholder: string;
mobile/app/session.tsx:282:        placeholder={placeholder}
mobile/app/session.tsx:283:        placeholderTextColor={theme.colors.textMuted}
frontend/lib/workspace/chat-composer.tsx:235:  placeholder = '',
frontend/lib/workspace/chat-composer.tsx:258:  placeholder?: string;
frontend/lib/workspace/chat-composer.tsx:649:          placeholder={placeholder}
frontend/lib/workspace/workstation-billing-pane.tsx:521:              placeholder="Enter amount in USD"
mobile/app/spaces/new.tsx:80:            placeholder="Space name"
mobile/app/spaces/new.tsx:81:            placeholderTextColor={theme.colors.textMuted}
mobile/app/spaces/new.tsx:96:            placeholder="What this space is for"
mobile/app/spaces/new.tsx:97:            placeholderTextColor={theme.colors.textMuted}
frontend/lib/workspace/deployed-agents/external-agent-detail.tsx:1298:                          placeholder="Message this connected agent inside Studio..."
frontend/lib/ui/chrome.css:1232:.artifact-library-search input::placeholder {
frontend/lib/ui/chrome.css:1642:.app-field::placeholder,
frontend/lib/ui/chrome.css:1643:.app-textarea::placeholder {
frontend/lib/ui/chrome.css:5964:.app-chat-composer__textarea::placeholder {
frontend/lib/ui/chrome.css:10872:.workstation-shell-panel__build-roster .studio-agents-nav__placeholder {
frontend/lib/ui/chrome.css:10909:.workstation-shell-panel__build-roster .studio-agents-nav__placeholder strong {
frontend/lib/ui/chrome.css:11018:.workstation-shell-panel__placeholder {
frontend/lib/ui/chrome.css:11029:.workstation-shell-panel__placeholder svg {
frontend/lib/ui/chrome.css:11549:.studio-agents-nav__search input::placeholder {
frontend/lib/ui/chrome.css:11645:.studio-agents-nav__placeholder {
frontend/lib/ui/chrome.css:11716:.studio-agents-nav__placeholder {
frontend/lib/ui/chrome.css:11733:.studio-agents-nav__placeholder strong {
frontend/lib/ui/chrome.css:11771:.studio-agents-nav__placeholder span {
frontend/lib/ui/chrome.css:11781:.studio-agents-nav__placeholder {
frontend/lib/ui/chrome.css:11841:  .studio-agents-nav__placeholder {
frontend/lib/ui/chrome.css:12621:.studio-agent-overview__avatar-placeholder {
frontend/lib/ui/chrome.css:12627:.studio-agent-overview__avatar-placeholder {
frontend/lib/ui/chrome.css:16304:.app-studio-shell--agents .studio-agent-knowledge__source-form input::placeholder {
frontend/lib/ui/chrome.css:18294:.settings-provider-card--placeholder {
frontend/lib/ui/chrome.css:21306:.sage-integrations-nav__placeholder,
frontend/lib/ui/chrome.css:21313:.sage-integrations-nav__placeholder {
frontend/lib/ui/chrome.css:23700:.deployed-agent-chat__input::placeholder {
frontend/lib/ui/chrome.css:26291:.workstation-hardware-qr-placeholder {
frontend/lib/workspace/deployed-agents/detail-view.tsx:561:                        placeholder="Describe what this Business Agent should do, what it should answer, and when it should hand off to a human."
frontend/lib/workspace/deployed-agents/detail-view.tsx:570:                        placeholder="Describe the voice and style this Business Agent should use."
frontend/lib/workspace/deployed-agents/detail-view.tsx:633:                      placeholder="Add a website, Google Sheet, file URI, or source reference..."
frontend/lib/workspace/deployed-agents/detail-view.tsx:894:            <EmptyPanel title="Agent is not ready yet" body="Save the agent first, then chat with it here." />
frontend/lib/ui/form-controls.tsx:88:  placeholder = 'Add item',
frontend/lib/ui/form-controls.tsx:94:  placeholder?: string;
frontend/lib/ui/form-controls.tsx:145:          placeholder={placeholder}
frontend/lib/workspace/sage-chat/composer.tsx:47:      placeholder="Message Sage..."
frontend/lib/workspace/deployed-agents/wizard.tsx:932:                      placeholder="OpenClaw assistant"
frontend/lib/workspace/deployed-agents/wizard.tsx:985:                        placeholder="https://agent.example.com"
frontend/lib/workspace/deployed-agents/wizard.tsx:992:                        placeholder="https://agent.example.com/.well-known/agent-manifest.json"
frontend/lib/workspace/deployed-agents/wizard.tsx:1005:                          placeholder={externalAgentForm.providerKind === 'openclaw' ? 'Use default OpenClaw adapter' : 'Local adapter address'}
frontend/lib/workspace/deployed-agents/wizard.tsx:1014:                          placeholder="https://agent.example.com/chat"
frontend/lib/workspace/deployed-agents/wizard.tsx:1021:                          placeholder="https://agent.example.com/events"
frontend/lib/workspace/deployed-agents/wizard.tsx:1028:                          placeholder="https://agent.example.com/artifacts"
frontend/lib/workspace/deployed-agents/wizard.tsx:1036:                        placeholder="vault://external-agents/openclaw-prod"
frontend/lib/workspace/deployed-agents/wizard.tsx:1044:                        placeholder={'{\n  "capabilities": ["chat", "artifacts"],\n  "surface_sections": []\n}'}
frontend/lib/workspace/deployed-agents/wizard.tsx:1056:                  placeholder="New agent"
frontend/lib/workspace/deployed-agents/wizard.tsx:1064:                  placeholder={selectedStudioTemplate.systemPrompt}
frontend/lib/workspace/deployed-agents/wizard.tsx:1078:                    placeholder="Bluebird Cafe"
frontend/lib/workspace/deployed-agents/wizard.tsx:1085:                    placeholder="https://example.com/avatar.png"
frontend/lib/workspace/deployed-agents/wizard.tsx:1093:                    placeholder="Friendly, concise, formal, warm, luxury, clinic front desk..."
frontend/lib/workspace/deployed-agents/wizard.tsx:1116:                    placeholder="Answer menu questions, check specials and availability, confirm orders clearly, and escalate edge cases to a human."
frontend/lib/workspace/deployed-agents/wizard.tsx:1124:                    placeholder={'kb://menu\nsheet://daily-menu'}
frontend/lib/workspace/deployed-agents/wizard.tsx:1141:                  placeholder={selectedStudioTemplate.knowledgePlaceholder}
frontend/lib/workspace/deployed-agents/wizard.tsx:1150:                  placeholder={selectedStudioTemplate.systemPrompt}
frontend/lib/workspace/deployed-agents/wizard.tsx:1159:                    placeholder="Quickly ask questions, check availability, and get help."
frontend/lib/workspace/deployed-agents/wizard.tsx:1167:                    placeholder={selectedStudioTemplate.outcome}
frontend/lib/workspace/deployed-agents/wizard.tsx:1372:                    placeholder="owner@example.com"
frontend/lib/workspace/deployed-agents/wizard.tsx:1379:                    placeholder="A human will follow up shortly."
frontend/lib/workspace/deployed-agents/wizard.tsx:1397:                    placeholder="Safety reviewer"
frontend/lib/workspace/deployed-agents/wizard.tsx:1631:                      placeholder="supplier.example.com, portal.example.com"
frontend/lib/workspace/deployed-agents/wizard.tsx:1742:                    placeholder="250"
frontend/lib/workspace/deployed-agents/wizard.tsx:1750:                    placeholder="25"
frontend/lib/workspace/deployed-agents/wizard.tsx:1759:                    placeholder="Continue on Empyralis"
frontend/lib/workspace/deployed-agents/wizard.tsx:1766:                    placeholder="https://app.empyralis.com/help"
frontend/lib/workspace/codex-chat/timeline-reducer.ts:93:  const placeholders = new Set(['thinking...']);
frontend/lib/workspace/codex-chat/timeline-reducer.ts:96:  if (placeholders.has(incomingLower)) {
frontend/lib/workspace/codex-chat/timeline-reducer.ts:99:  if (placeholders.has(existingLower)) {
frontend/lib/workspace/workstation-sage-profile-pane.tsx:329:  const activePlaceholder = activeFieldIsCurrent && bootstrapQuestion?.placeholder
frontend/lib/workspace/workstation-sage-profile-pane.tsx:330:    ? readString(bootstrapQuestion.placeholder)
frontend/lib/workspace/workstation-sage-profile-pane.tsx:413:                        placeholder={activeField === 'user_name' ? displayNameHint : activePlaceholder}
frontend/lib/workspace/workstation-sage-profile-pane.tsx:423:                        placeholder={activePlaceholder}
frontend/lib/workspace/workstation-sage-profile-pane.tsx:484:                      placeholder={displayNameHint}
frontend/lib/workspace/workstation-sage-profile-pane.tsx:493:                      placeholder="Example: Keep my inbox triaged."
frontend/lib/workspace/workstation-sage-profile-pane.tsx:505:                      placeholder="Example: I run product and engineering for Empyralis."
frontend/lib/workspace/workstation-sage-profile-pane.tsx:515:                      placeholder="Example: Be direct, concise, and lead with the answer."
frontend/lib/workspace/workstation-sage-profile-pane.tsx:525:                      placeholder="Example: Never send external messages without approval."
server_modules/runtime_config.py:424:    placeholders = {
server_modules/runtime_config.py:434:        if len(value) < 32 or value.lower() in placeholders:
server_modules/runtime_config.py:435:            raise RuntimeError(f"{name} must be explicitly set to a non-placeholder 32+ character secret in staging/production.")
server_modules/runtime_config.py:437:    if len(mini_app_share_secret) < 32 or mini_app_share_secret.lower() in placeholders:
server_modules/auth.py:1820:    placeholders = ",".join("?" for _ in clean_session_ids)
server_modules/auth.py:1827:        WHERE session_id IN ({placeholders}) AND revoked_at IS NULL
server_modules/memory_service.py:800:        raise ValueError("Consolidation proposal must include durable context, not a short placeholder.")
frontend/tests/e2e/account-shell-bootstrap-resilience.spec.ts:11:    placeholder: 'Example: Mansur',
frontend/tests/e2e/account-shell-bootstrap-resilience.spec.ts:17:    placeholder: 'Example: I run product and engineering for a mobile-first agent platform.',
frontend/tests/e2e/account-shell-bootstrap-resilience.spec.ts:23:    placeholder: 'Example: Be direct, concise, and lead with the answer.',
frontend/tests/e2e/account-shell-bootstrap-resilience.spec.ts:29:    placeholder: 'Example: Keep my inbox triaged and surface urgent replies.',
frontend/tests/e2e/account-shell-bootstrap-resilience.spec.ts:35:    placeholder: 'Example: Never send external messages without approval.',
frontend/tests/e2e/account-shell-bootstrap-resilience.spec.ts:304:    await expect(page.locator('[data-workstation-chat-composer="root"] textarea')).toHaveAttribute('placeholder', 'Sage setup is temporarily unavailable.');
frontend/tests/e2e/account-shell-bootstrap-resilience.spec.ts:369:    await expect(page.locator('[data-workstation-chat-composer="root"] textarea')).toHaveAttribute('placeholder', 'Message Sage...');
frontend/app/login/page.tsx:221:                placeholder="Enter your email"
frontend/app/login/page.tsx:237:                placeholder="Enter your password"
server_modules/channel_lane_contract_service.py:147:        "stage": "out_of_scope",
server_modules/channel_lane_contract_service.py:148:        "status": "out_of_scope",
server_modules/sage_transparency_service.py:73:    Only stages with real data are emitted — no fake / placeholder events.
server_modules/connectors/telegram_menu_service.py:119:            "input_field_placeholder": "Message Empyralis...",
server_modules/artifact_service.py:39:    "policy_status": "placeholder",
server_modules/artifact_service.py:168:def retention_placeholder(retention_days: Optional[int] = None, expires_at: Optional[str] = None) -> Dict[str, Any]:
server_modules/artifact_service.py:529:        retention=retention_placeholder(retention_days, retention_expires_at),
server_modules/jwt_secret.py:57:            "ORION_JWT_SECRET or JWT_SECRET must be explicitly set to a non-placeholder "
server_modules/notification_service.py:446:        placeholders = ", ".join("?" for _ in normalized_allowed)
server_modules/notification_service.py:447:        clauses.append(f"workspace_id IN ({placeholders})")
server_modules/notification_service.py:570:        placeholders = ", ".join("?" for _ in normalized_allowed)
server_modules/notification_service.py:571:        clauses.append(f"workspace_id IN ({placeholders})")
server_modules/deployed_agent_service.py:109:    "status": "out_of_scope",
server_modules/deployed_agent_service.py:2173:            "Primary customer traffic enters through Telegram bot; WhatsApp Business stays optional and out of scope by default."
frontend/app/signup/page.tsx:262:                placeholder="Enter your name"
frontend/app/signup/page.tsx:278:                placeholder="Enter your email"
frontend/app/signup/page.tsx:295:                placeholder="Enter your password"
server_modules/doctor_report.py:290:            "Runtime API key is using the default placeholder value.",
server_modules/runtime_events.py:320:        placeholders = ", ".join("?" for _ in normalized_allowed)
server_modules/runtime_events.py:321:        clauses.append(f"workspace_id IN ({placeholders})")
server_modules/runtime_events.py:418:        placeholders = ", ".join("?" for _ in normalized_allowed)
server_modules/runtime_events.py:419:        clauses.append(f"workspace_id IN ({placeholders})")
server_modules/tests/test_browser_engine.py:47:            {"index": 0, "tag": "a", "text": "More information", "type": "", "href": "https://www.iana.org/domains/example", "name": "", "placeholder": "", "id": ""},
server_modules/tests/test_browser_engine.py:48:            {"index": 1, "tag": "h1", "text": "Example Domain", "type": "", "href": "", "name": "", "placeholder": "", "id": "heading"},
server_modules/runtime_state_store.py:664:        placeholders = ", ".join("?" for _ in normalized_statuses)
server_modules/runtime_state_store.py:665:        query += f"\nWHERE status IN ({placeholders})"
server_modules/runtime_state_store.py:787:        placeholders = ", ".join("?" for _ in normalized_statuses)
server_modules/runtime_state_store.py:788:        clauses.append(f"status IN ({placeholders})")
server_modules/runtime_state_store.py:921:        placeholders = ", ".join("?" for _ in normalized_statuses)
server_modules/runtime_state_store.py:922:        query += f"\nWHERE status IN ({placeholders})"
server_modules/runtime_state_store.py:1726:    placeholders = ", ".join("?" for _ in normalized)
server_modules/runtime_state_store.py:1736:        WHERE n.id IN ({placeholders})
server_modules/tests/test_channel_lane_contract_service.py:81:        self.assertEqual(by_key["whatsapp_twilio"]["status"], "out_of_scope")
server_modules/tests/test_jwt_secret_resolution.py:37:    def test_production_requires_explicit_non_placeholder_secret(self):
server_modules/tests/test_jwt_secret_resolution.py:43:    def test_production_rejects_short_or_placeholder_secret(self):
server_modules/tests/test_workspace_context_memory_adapter.py:84:    def test_load_workspace_context_payload_skips_default_placeholder_files(self):
server_modules/tests/test_artifact_service.py:73:    def test_store_artifact_bytes_records_retention_placeholder(self) -> None:
server_modules/tests/test_artifact_service.py:94:                self.assertEqual(metadata["retention"]["policy_status"], "placeholder")
server_modules/demo_workflows.py:179:    return "Empyralis started the demo, but the screenshot artifact is not ready yet."
server_modules/sage_profile_service.py:18:        "placeholder": "Example: Mansur",
server_modules/sage_profile_service.py:24:        "placeholder": "Example: I run product and engineering for a mobile-first agent platform.",
server_modules/sage_profile_service.py:30:        "placeholder": "Example: Be direct, concise, and lead with the answer.",
server_modules/sage_profile_service.py:36:        "placeholder": "Example: Keep my inbox triaged and surface urgent replies.",
server_modules/sage_profile_service.py:42:        "placeholder": "Example: Never send external messages without approval.",
server_modules/direct_chat_handoff_service.py:299:            return f"waiting_for_runtime:{run_id}", {"type": "step", "id": f"run-handoff:waiting-runtime:{run_id}", "label": "Waiting for your laptop", "detail": _detail(preferred_runtime_label, estimated_wait_band, "Local machine not ready yet"), "status": "active", "kind": "thinking"}
server_modules/tests/test_operator_chat.py:671:    @patch("operator_chat_under_test.generate_chat_reply_with_provider_fallback", return_value=("placeholder", {"provider": "codex_cli", "model": "gpt-5.4"}, "codex_cli", ""))
server_modules/tests/test_operator_chat.py:683:        self.assertEqual(payload["reply"], "placeholder")
server_modules/routes_builder.py:75:If details are unknown, leave explicit placeholders inside config rather than inventing fake IDs.
server_modules/tests/test_sage_agent_runtime_service.py:60:    def test_load_context_files_skips_default_placeholders(self):
server_modules/tests/test_deployed_agent_routes.py:244:        "whatsapp": {"available": False, "status": "out_of_scope"},
```
