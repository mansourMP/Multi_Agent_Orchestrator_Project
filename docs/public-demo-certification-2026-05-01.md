# Public Demo Certification Handoff — 2026-05-01

## Current Verdict

The public Sage demo path is certified for web after the latest production DeepSeek smoke. The Marketplace preview seed patch is deployed and verified. The remaining hard line is one real-device visual/mobile sweep. Cloud Computer is contract-ready only; it is not a live demo feature.

## Certified In This Pass

- Production provider catalog: DeepSeek showed `configured=true`, `usable=true`, and default model `deepseek-chat`.
- Production Sage chat: 10 direct runtime turns and 10 public web turns returned trace, step, chunk, and final events with non-empty replies after one transient Render 502 retry.
- Fresh production workspace smoke after the billing/audit closeout created a session, streamed one DeepSeek hello turn with truthful final metadata, then passed ten exact `pong` replies with no stream failure.
- Production history persisted the fresh cert thread with 22 turns and alternating user/assistant roles.
- Production phone route-level smoke returned HTTP 200 for chat and integrations after onboarding completion.
- Production Marketplace deployment check returned six backend preview packages on a fresh workspace; all were `preview_only=true`.
- Frontend shell reliability: account-shell bootstrap now calls the runtime directly from SSR instead of proxying through the public web app.
- Mobile/public dead screens: account and onboarding degraded states now provide Reload and Sign in again actions.
- Memory runtime model: Sage memory categories are structured as Green, Yellow, Orange, and Red classes, with legacy category aliases preserved.
- Hosted AI credits surface: billing summary exposes hosted Sage AI policy, cap, usage, and remaining balance for BYOK-free users.
- Approval policy: local file delete/remove/unlink/trash now requires approval.
- Cloud Computer contract: `sage_cloud_computer` remains explicit, paid, non-default, metered, and separate from the personal gateway.
- Execution mode contract: Default, Approvals, Autopilot, and Full Access are now separated at runtime-target level; Full Access is local-companion-only.
- Screenshot transparency contract: screenshot/image artifact trace events now have first-class chat cells for phone/web audit visibility.
- MCP trust metadata: MCP tools now expose permission manifests with risk, scopes, allowed modes, cost class, and audit event type.

## Demo-Safe Surfaces

- Sage chat with provider/model/reasoning picker.
- Thinking/tool transparency cells, pending-message preservation, and stop-button behavior by source/test verification.
- Studio template grid and focused setup sheet.
- Marketplace as governed install/discovery surface with seed packages and hidden developer publishing.
- Marketplace backend preview packages for empty workspaces. Preview packages are display-only and marked `preview_only=true`.
- Gateway-offline status and local-tool availability by catalog contract.

## Do Not Demo Yet

- Full Cloud Computer/hosted desktop. The runtime contract exists, but there is no real provisioner, cloud browser session, sandbox lifecycle, spend meter enforcement, or artifact egress flow certified for users.
- Full native phone certification. Source-level mobile controls exist, but the final physical phone sweep must still be run against production after deploy.
- Video generation. It is intentionally out of scope.
- Marketplace developer publishing as a normal-user flow. It must stay behind explicit developer mode.

## Verification Run

- `npm run typecheck --prefix frontend`
- `npm run build --prefix frontend`
- `venv/bin/python -m compileall server_modules scripts`
- `venv/bin/python -m pytest server_modules/tests/test_sage_memory_service.py server_modules/tests/test_direct_tool_approval_service.py server_modules/tests/test_policy_service.py server_modules/tests/test_billing_service.py server_modules/tests/test_entitlements_service.py server_modules/tests/test_direct_chat_hosted_usage_service.py`
- `venv/bin/python -m pytest server_modules/tests/test_runtime_attachment_service.py server_modules/tests/test_workspace_bootstrap_service.py server_modules/tests/test_direct_chat_tool_catalog_service.py`

## Next Required Action

Run a final browser and phone sweep:

1. Production signup/login/account shell.
2. Production Sage with DeepSeek selected.
3. Send 10 messages.
4. Verify no 500/504 shell page, no disappearing messages, no false timeout banner, no raw service error.
5. Open Studio, Marketplace, History, Memory, and Integrations in light and dark mode.
6. Confirm Marketplace shows preview packages on an empty workspace and does not expose Marketplace publishing as a normal-user flow.
