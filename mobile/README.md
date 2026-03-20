# Empyralis Mobile

This workspace is the dedicated Expo app for Empyralis Mobile V1.

## Scope

Mobile is the remote cockpit, not the desktop builder:

- direct chat with agents
- approvals
- run monitoring
- artifact previews
- account/preferences

It should not become a second desktop UI in V1.

## What exists now

- Expo Router app shell
- bottom tabs:
  - `Home`
  - `Agents`
  - `Runs`
  - `Approvals`
  - `You`
- shared Empyralis theme tokens
- reusable mobile shell components
- secure session storage scaffold
- runtime API client scaffold

## Assumptions

This scaffold intentionally stops at shell level until mobile-safe runtime contracts are validated.

Assumed available or mostly available:

1. `GET /agents/workspace/snapshot`
2. `GET /runs/history`
3. `GET /approvals`
4. `GET /artifacts`
5. `POST /runs/start`
6. `POST /runs/{run_id}/approvals/{approval_id}/resolve`

## Known backend/API gaps

These should be reviewed before full data wiring:

1. Mobile-safe agent chat endpoint
   - current web chat flow is UI-local and agent-thread oriented
   - mobile needs a clean endpoint for sending a message directly to a selected agent and reading thread history

2. Mobile-safe run feed contract
   - runtime history payload shape may differ from what the mobile list wants
   - mobile should not receive heavy debug/runtime internals by default

3. Mobile artifact preview contract
   - mobile needs predictable preview-safe payloads for:
     - image preview
     - text preview
     - file open/download

4. Notifications
   - mobile push and deep-link routing are not wired yet

## Recommended setup

From `/Users/mansur/Multi_Agent_Orchestrator_Project/mobile`:

```bash
npm install
npm run start
```

Set runtime values with Expo public env if needed:

```bash
EXPO_PUBLIC_RUNTIME_URL=http://127.0.0.1:8001
EXPO_PUBLIC_WORKSPACE_ID=default
```

Session/API key storage is intentionally scaffolded, not fully wired in the UI yet.
