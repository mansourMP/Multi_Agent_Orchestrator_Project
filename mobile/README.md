# Empyralis Mobile

This workspace is the dedicated Expo app for Empyralis Mobile V1.

## Scope

Mobile is the default daily-use product surface:

- direct chat with Sage and specialists
- notifications and approvals
- Applications as a first-class tab
- quick daily actions
- daily context
- pairing and device linking
- artifact previews

It should not become a squeezed desktop builder or admin console.

## What exists now

- Expo Router app shell
- bottom tabs:
  - `Home`
  - `Chat`
  - `Applications`
  - `Notifications`
  - `Profile`
- shared Empyralis theme tokens
- reusable mobile shell components
- secure session and pairing storage
- mobile engine and sync scaffolding
- notification and personal-context bridges

## Surface Role

Mobile owns:

- chat
- notifications
- approvals
- applications
- quick follow-up actions
- daily context
- pairing

Desktop-power surfaces own:

- specialist creation
- connector and MCP/server management
- runtime attachment management
- memory controls
- advanced automations
- policy/debug/admin depth

## Current Integration Assumptions

Key supported or expected contracts include:

1. `GET /agents/workspace/snapshot`
2. `GET /agent-registry/chat-context`
3. `GET /runs/history`
4. `GET /approvals`
5. `GET /artifacts`
6. `POST /turn`
7. `POST /runs/{run_id}/approvals/{approval_id}/resolve`
8. personal-context publish and scheduler self-wakeup routes

## Product Rule

The mobile app and desktop-power surfaces must share:

- same Sage
- same workspace
- same memory model
- same specialists
- same runtime attachments

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

Session, pairing, and mobile-engine storage are intentionally local to the mobile shell, but they still map to the same shared platform core.
