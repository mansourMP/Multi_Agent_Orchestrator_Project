# 🚀 Launch Day Manual: AC-OS Identity System

**Date**: 2026-01-20
**Status**: LIVE & CRITICAL SYSTEMS CONNECTED

Your platform is ready for launch. The **Python Brain** (Identity/Safety) is now hardwired to the **NestJS Body** (Execution Engine).

## 1. Verifying the Connection
To prove the system works "inside the workspace" immediately:

### Step 1: Start the Bridge (Terminal 1)
The bridge listens for commands from the backend.
```bash
cd bridge
npm install
npm run start
```

### Step 2: Start the Backend (Terminal 2)
```bash
cd backend
npm run start:dev
```

### Step 3: Run the "Identity Test" (Canvas)
1.  Open the Web UI (`localhost:3000`).
2.  Create a new Workflow.
3.  Add a **Tool Node**.
4.  Set **Action**: `identity_action`.
5.  Set **Data**: `{"actionType": "sign_publish", "nicheId": "astronomy", "payload": {"content": "Hello World"}}`
6.  **Run Workflow**.
7.  Check the logs: You will see `💎 AC-OS Identity Action: sign_publish` and a cryptographic signature.

## 2. Default Protections (Live Now)
*   **Safety Guard**: If you try to run that loop 100 times, the **backend will throw an error** automatically because the Python engine enforces rate limits.
*   **Niche Awareness**: Every agent now automatically gets the list of niches from `config/niches.yaml` injected into its context. You don't need to do anything.

## 3. Troubleshooting
If the connection fails:
*   **Error**: "No Bridge Connected" -> Ensure Terminal 1 is running.
*   **Error**: "python3 not found" -> Ensure `python_engine/venv` is active or python3 is in PATH.

**Your Platform is now a Sovereign Autonomous System.**
