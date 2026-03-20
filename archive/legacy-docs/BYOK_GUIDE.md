# Bring Your Own Key (BYOK) Guide for AgentForge

Orion is designed as a secure orchestration platform that lets teams keep complete ownership over their AI footprints. Instead of shipping with a shared vendor key, each workspace provides its own credentials for the models/tools it wants to use. Here is how the BYOK flow should feel to your customers:

## Why BYOK?
- **Compliance** – keys never leave the tenant boundary, which is great for industries that need SOC2/HIPAA/ISO control.
- **Billing Transparency** – customers pay through their existing vendor contracts instead of the platform absorbing those charges.
- **Auditability** – every request is stamped with the requesting workspace and human approver because the CEO agent mediates the injection.

## How it works inside Orion
1. **Register a Provider** – In the Settings page, select a vendor (OpenAI, Claude, Gemini, DeepSeek) and paste the API key. The key is encrypted and stored per workspace.
2. **Assign to an Agent** – When you drag an Agent node onto the canvas, choose which credential it should use (OpenAI GPT-4, Claude 3.5, etc.). The interface shows a badge with the selected credential.
3. **CEO Validation** – When the worker needs to call the model, it sends an `ESCALATE_TO_CEO` message. The CEO checks if a credential is attached to that node, and only then invokes the key within the FastAPI worker (never exposed to the frontend).
4. **Audit Trail** – The Mission Log records which credential was used for each call and who authorized it, so you can prove where customer data flowed.

## UX Considerations
- **Masked Input** – The Settings form should hide keys with bullets and offer a “Reveal” toggle for trusted super admins.
- **Status Badges** – Credentials show `Bound`, `Missing`, or `Expired` next to each agent node.
- **Vault Sharing** – Allow workspace admins to pre-approve keys for teams so agents can bind them without re-entering secrets.
- **Tool Binding** – When an agent requests a tool (HTTP, Twilio, search), the CEO must approve a credential for that tool before execution.

## Recommended Next Steps
1. Build the Settings panel flow with `keyName`, `vendor`, `regional endpoint`, `key value`, and `scope` (which agents can use it).
2. Surface the attached key badge and `CeO approved` ribbon on agent cards.
3. Document the onboarding steps (maybe an in-app overlay) so customers know to paste their own keys before running Crew.

## Settings Panel Sketch
- **Top Bar**: “Credentials Vault” header with a CTA “Add Credential” and a toggle to show/hide only bound agents or deprecated keys.
- **Credential List**: Cards that show the vendor icon, the masked key, binding status badge (Bound / Missing / Expired), and tag chips for workspaces or agent types. Each card has a “Copy ID” and “Attach to Agent” menu.
- **Add Credential Form** (drawer or modal):
  * Vendor drop-down (OpenAI, Claude, Gemini, DeepSeek).
  * Region/Endpoint field (auto-fill based on vendor).
  * Key input (masked, show/reveal toggle with tooltip).
  * Scope tags (e.g., “Marketing Agent”, “System Tools”, “CEO Only”).
  * “Test Key” button that calls the backend to confirm validity and shows green/red badges.
- **Binding Preview**: Once a key is saved, show a mini list of agents that reference it with status chips (approved, pending CEO, missing).
- **Audit Trail**: Small timeline below the form showing the last actions taken with this key (who attached it, when it was used, if a CEO decision was required).

Want me to turn this into a UI sketch or integrate it directly into settings code next?
