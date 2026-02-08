# Technical Spec: Viral Content Factory Workflow
**Version**: 1.0 (MVP)
**Architect**: Autonomous Company OS
**Target**: Fully autonomous "Web -> Draft -> Review -> Publish" pipeline for 10 niches.

---

## 1. Recommendation Summary
*   **Architecture**: Single Reusable Workflow Pattern instantiated for each Niche (Context Injection via Global Variables).
*   **Hierarchy**:
    *   **Researcher (Worker)**: `gemini-1.5-flash` (Fast/Cheap). Search & Summarize.
    *   **Creator (Worker)**: `gemini-1.5-flash` or `gpt-4o-mini`. Draft Copy + Media Prompts.
    *   **Chief Editor (Executive)**: `claude-3-5-sonnet` (Smart/Nuanced). Critic & Final Decision.
*   **Convergent Loop**: The **Creator <-> Editor** cycle runs max 3 times. If quality threshold isn't met, it escalates to Human Approval.
*   **Bridge Integration**: Final public actions run via `conductor-bridge` on local terminal (no risky API keys in cloud).

## 2. MVP Spec (Ship in 1-2 Weeks)
*   **Inputs**: `niche_profile` (JSON from Global Vars containing Identity/Values).
*   **Node Graph**:
    1.  **Trigger**: Schedule (Daily) or Webhook.
    2.  **Memory Check**: Query SQLite for last 5 topics (prevent duplicates).
    3.  **Research Node**: `web_research` tool (Trend hunting).
    4.  **Drafting Squad**: 
        *   `Writer` generates Text.
        *   `Diffuser` generates Image Prompts -> `generate_image` tool.
    5.  **Critic Node**: Rubric Evaluation.
    6.  **Logic Node**: Routing `score >= 4.0 ? Publish : (loops < 3 ? Revise : Escalate)`.
    7.  **Publish Node**: `terminal_publish` (Dangerous Tool).
*   **Artifacts**: 1 Markdown Draft, 1 PNG Image per run.

## 3. Runtime Spec
*   **State Machine**:
    *   `CHECKPOINT_RESEARCHED`: Context contains trend summary.
    *   `CHECKPOINT_DRAFTED`: Context contains `draft_text` and `image_path`.
    *   `CHECKPOINT_EVALUATED`: Context contains `rubric_score` and `critique_json`.
*   **Budgets**:
    *   Max Duration: 10 minutes.
    *   Max Cost: $0.10 per run (mostly Flash).
    *   Retry Policy: Deterministic replay from `Drafting` if `Publish` fails.
*   **Pause/Resume**: Critical at **Publish Node** if `terminal_publish` is flagged as DANGEROUS (requires `ApprovalNode`).

## 4. Data Model Implications
*   **Profile Entity**:
    *   `niche_id` (PK): string (e.g., "astronomy")
    *   `values`: JSON (e.g., `["hate_clickbait", "love_physics"]`)
    *   `tone`: string ("Academic yet witty")
*   **Artifact Entity**:
    *   `id`: UUID
    *   `execution_id`: FK
    *   `type`: "SOCIAL_POST_IMAGE"
    *   `uri`: "file://local/storage/..."
    *   `meta`: JSON `{ prompt: "...", model: "dall-e-3" }`
*   **Memory Entity** (`episodic_memory`):
    *   `niche_id`: index
    *   `timestamp`: datetime
    *   `action`: "PUBLISH"
    *   `content_hash`: string (dedupe)

## 5. Tool/Action Contracts (Registry)

### A. `web_research` (SAFE)
```typescript
{
  "name": "web_research",
  "description": "Scrapes and summarizes recent trends",
  "schema": {
    "query": { "type": "string", "description": "Search topic" },
    "domains": { "type": "array", "description": "Allowlist domains (e.g. nasa.gov)" }
  },
  "return_schema": {
    "summary": "string",
    "urls": "string[]"
  }
}
```

### B. `generate_media` (SAFE / COSTLY)
```typescript
{
  "name": "generate_media",
  "risk": "standard",
  "schema": {
    "prompt": "string",
    "aspect_ratio": "1:1"
  },
  "return_schema": {
    "artifact_id": "string",
    "local_path": "string"
  }
}
```

### C. `terminal_publish` (DANGEROUS)
```typescript
{
  "name": "terminal_publish",
  "risk": "critical",
  "approval_required": true, // Enforces Human Interface
  "schema": {
    "platform": "twitter | linkedin",
    "content": "string",
    "media_path": "string"
  },
  "idempotency_key": "content_hash" // Prevent double post
}
```

## 6. Loop + Eval Pattern (The "Self-Healing" Brain)

**Critic Rubric (JSON)**:
```json
{
  "clarity_score": "1-5",
  "brand_alignment_score": "1-5",
  "virality_score": "1-5",
  "blocking_issues": ["Too promotional", "Factual error"],
  "suggested_edits": ["Remove hashtags", "Cite source"],
  "decision": "REVISE" // or APPROVE
}
```

**Convergence Logic**:
1.  **Draft 1** -> Critic Score 2.5 -> `decision: REVISE`.
2.  **Context Update**: Inject `suggested_edits` into Writer Prompt.
3.  **Draft 2** -> Critic Score 3.8 -> `decision: REVISE`.
4.  **Draft 3** -> Critic Score 4.5 -> `decision: APPROVE`.
5.  **Exit**: Proceed to Publish.

## 7. Memory Policy
*   **Read-Before-Write**:
    *   Researcher MUST query `tools.memory_search({ queries: ["recent_topics"] })` before selecting a topic.
    *   If Topic Similarity > 0.8 with any post in last 48h -> **ABORT/RETRY**.
*   **Write-After-Success**:
    *   Only `terminal_publish` success triggers a write to `episodic_memory`.
    *   Failed runs do NOT write to long-term memory (prevent poisoning).

## 8. Command Center UI (Dashboard Spec)
*   **Grid Layout**: 10 Cards (one per Niche).
*   **Card State**:
    *   **Status**: `IDLE` (Grey) | `RESEARCHING` (Blue) | `EVALUATING` (Purple) | `WAITING_APPROVAL` (Amber) | `PUBLISHING` (Green).
    *   **Live Stream**: Last 3 log lines (e.g., "Critic: Tone too aggressive...").
    *   **Artifact Preview**: Small thumbnail of generated image if ready.
*   **Global Controls**:
    *   "Emergency Stop": Pauses all local bridge commands.
    *   "Approve All": Batch approve pending `terminal_publish` requests.

## 9. Risks & Mitigations
*   **Risk**: "Hallucination Loop" (Critic and Creator argue forever).
    *   **Mitigation**: Hard limit `max_loops = 3`. Fallback to "Human Review".
*   **Risk**: Bridge Disconnection.
    *   **Mitigation**: Queueing System in Backend. specific retry policy (Exp Backoff).
*   **Risk**: Brand Damage (Rogue post).
    *   **Mitigation**: `terminal_publish` is **DANGEROUS** by default. First 50 runs require explicit human click. Once trust is established, lower risk level for specific niches.

## 10. Acceptance Criteria
1.  **Traceability**: Can retrieve the exact Google Search used for "Post #103".
2.  **Convergence**: System auto-corrects a "Bot-like" draft into "Human-like" draft without user input within 3 cycles.
3.  **Safety**: Attempting to post without approval throws a blocking error in UI.
4.  **Artifacts**: The final image exists on local disk and is linked in the Execution Log.
5.  **Alignment**: The "Astronomy" agent refuses to post "Astrology" content (Values check).
