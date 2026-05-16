# Master Implementation Plan - 2026-05-17

## Coordination Summary
This document is the **coordination plan** for agents working on Empyralis (Gemini CLI and DeepSeek). Codex remains the final reviewer and the only agent expected to commit or push reviewed chunks.

### Ownership Boundaries

| Agent | Domain | Focus Area |
|---|---|---|
| **DeepSeek** | **Platform Core & Safety** | Backend Schema, Security, Data Isolation, Provider Logic, Gateway Protocols. |
| **Gemini CLI** | **Product Experience & Motion** | Studio UI/UX, Motion Design, Customer Flows, Frontend Integration, Documentation. |

---

## Phase 1: Foundation & Safety Certification (Current)
**Goal:** Prove the platform is safe for real data and multi-tenant usage.

### Gemini (UX/Product)
- [x] **Mental Model Cleanup**: Rename "Fallback" to "Sample" across Studio.
- [x] **Command Center Refactor**: Overview and Knowledge tabs transformed for business clarity.
- [x] **Motion Polish**: Login Hero animations and workstation panel transitions.
- [ ] **Onboarding Certification**: Simplify the Provider/Channel setup flow for non-technical users.

### DeepSeek (Platform/Safety)
- [ ] **Data Isolation Audit**: Verify one workspace cannot leak into another during bootstrap or run.
- [ ] **Runtime Guard Certification**: Ensure Text Agents cannot trigger Computer/VM tool paths.
- [ ] **Provider Catalog Audit**: Ensure secrets are never logged or leaked during model list refreshes.
- [ ] **Durable Outbox Proof**: Verify Telegram/WhatsApp messages are idempotent and resilient to cloud disconnects.

---

## Phase 2: Pilot Readiness (Next)
**Goal:** Enable a controlled pilot with real business users.

### Gemini (UX/Product)
- **Playground Evolution**: Transform the "Chat" tab into a real-world test environment.
- **Results & Analytics**: Build the UI for the "Results" tab to show conversation outcomes and cost.
- **E2E Onboarding Flow**: Connect the dots from "Create Agent" to "Test in Channel."

### DeepSeek (Platform/Safety)
- **Billing & Quota Enforcement**: Finalize the credit ledger and monthly budget cap enforcement.
- **Search/RAG Validation**: Prove the Knowledge source retrieval path is accurate and cited.
- **Connector Certification**: Live environment smoke tests for real Telegram/WhatsApp credentials.

---

## Phase 3: Launch Scaling
**Goal:** Prepare for public launch and external developer supply.

- **Marketplace Publishing**: Enable governed package submission for developers.
- **Sage Cloud Computer**: Introduce the paid premium runtime for offline autonomous work.
- **Enterprise Controls**: Admin logs, workspace-wide policies, and secret rotation.

---

## Safety & Parallelism Rules
1. **Never mutate the same file in the same turn.** Gemini and DeepSeek must stay in their designated domains.
2. **Read before Write.** Always check `git status` and read the relevant `GEMINI.md` or `MEMORY.md` to see what the other agent just did.
3. **Fail Closed.** If a data contract is ambiguous, stop and ask the user for clarification before implementing a "guess."
4. **Validation Before Push.** A task is not done until a Playwright or frontend build proof for UI work, or Pytest proof for backend work, has been reported and reviewed by Codex.

---

## Active Status
- **Gemini CLI**: Completed onboarding UI pass. Under Codex review before push.
- **DeepSeek**: Platform hardening chunk reviewed and pushed; remaining audit gaps stay tracked for a later backend pass.
