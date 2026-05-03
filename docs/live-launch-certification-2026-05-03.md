# Live Launch Certification — 2026-05-03

## Scope
- Phase 1: Production Auth + Runtime Truth
- Target:
  - `https://empyralis-web.onrender.com`
  - `https://empyralis-runtime.onrender.com`

## Code changes in this pass
- Added Google env alias support to avoid runtime/web drift:
  - `server_modules/auth.py`
    - Google audiences now also accept `GOOGLE_AUTH_CLIENT_ID`.
  - `frontend/lib/server/google-oauth.ts`
    - Web OAuth client id now accepts:
      - `GOOGLE_AUTH_CLIENT_ID`
      - `GOOGLE_AUTH_WEB_CLIENT_ID`
      - existing OAuth env keys
    - Web OAuth client secret now accepts:
      - `GOOGLE_AUTH_CLIENT_SECRET`
      - `GOOGLE_AUTH_WEB_CLIENT_SECRET`
      - existing OAuth env keys

## Local validation
- `./node_modules/.bin/tsc --noEmit` (frontend): PASS
- `venv/bin/python -m compileall server_modules/auth.py`: PASS
- `venv/bin/python -m pytest server_modules/tests/test_auth.py -q`: PASS (41 passed)

## Live production certification run
Command used:
- `node /private/tmp/empyralis_live_launch_cert.mjs`

Result summary:
- PASS `prod_web_http`
- PASS `prod_runtime_health`
- FAIL `runtime_google_provider_enabled`
- PASS `web_google_redirect`
- PASS `fresh_signup`
- PASS `account_shell`
- PASS `workspace_onboarding_patch`
- PASS `mobile_route_chat`
- PASS `mobile_route_history`
- PASS `mobile_route_memory`
- PASS `mobile_route_integrations`
- PASS `mobile_route_studio`
- PASS `mobile_route_marketplace`
- PASS `provider_catalog`
- PASS `billing_summary`
- PASS `tool_policy`
- PASS `gateway_registrations`
- PASS `memory_storage_policy`
- PASS `marketplace_packages`
- PASS `channel_operations`
- PASS `sage_session_create`
- PASS `sage_stream`

## Notes
- The cert harness had a stale account-shell parser (`memberships` only). It was updated locally in `/private/tmp/empyralis_live_launch_cert.mjs` to also read `workspaceMemberships`, then Sage session/stream passed.
- Remaining blocker is runtime provider exposure:
  - Runtime `/api/v1/auth/providers` still returns `google.enabled=false`.
  - This indicates runtime env is still missing a Google audience/client id at boot, or has not redeployed with updated values.

## Runtime action required to close Phase 1
Set on `empyralis-runtime` and redeploy:
- `GOOGLE_OAUTH_CLIENT_ID=<web_client_id>`
- `GOOGLE_AUDIENCES=<web_client_id>`

Optional compatibility keys (now supported in code):
- `GOOGLE_AUTH_CLIENT_ID=<web_client_id>`

Exit gate status:
- **Partial** until runtime reports `google.enabled=true` and Google login is re-certified on production.
