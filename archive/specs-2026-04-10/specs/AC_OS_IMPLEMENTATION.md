# AC-OS Identity System: Implementation Guide

**Version**: 1.0
**Status**: Implemented
**Module**: `python_engine/agent_identity.py`

---

## 1. Overview
The AC-OS Identity System implements the "Diamond" features of the Agency Operating System:
1.  **Cryptographic Identity (KYA)**: Every agent has a unique Ed25519 keypair.
2.  **Safety Guard (Dead Man's Switch)**: Rate limiting and emergency stops for dangerous actions.
3.  **Multiplayer Knowledge Graph**: Cross-niche learning and insight sharing.

## 2. CLI Interface
The system is integrated into `agency_logic.py` and exposed via CLI commands.

### 2.1 Sign & Publish (High Security)
Used for all public-facing actions (Twitter, LinkedIn, etc.).
```bash
python3 python_engine/agency_logic.py astronomy sign_publish --in "{{payload_path}}"
```
**Input Payload**:
```json
{
  "content": "My new post",
  "platform": "twitter",
  "media_path": "/path/to/image.png",
  "execution_id": "exec-123"
}
```
**Output**:
- **Success**: Returns `signed_action` with `signature` and `action_hash`.
- **Blocked**: Returns `blocked: true`, `reason: "Rate limit exceeded"`, and `requires_approval: true`.

### 2.2 Knowledge Graph (Network Effects)
#### Get Insights
Read learnings from *other* niches.
```bash
python3 python_engine/agency_logic.py astronomy get_insights --in "{{payload_path}}"
```
**Input**: `{"heuristic_type": "format", "limit": 5}`

#### Share Insight
Contribute a learning back to the network.
```bash
python3 python_engine/agency_logic.py astronomy share_insight --in "{{payload_path}}"
```
**Input**: `{"heuristic_type": "format", "insight": "Star emojis work best", "confidence": 0.8}`

### 2.3 Safety Status
Check system health.
```bash
python3 python_engine/agency_logic.py astronomy safety_status
```

## 3. Database Schema
New tables in `agency_memory.db`:

### `agent_identities`
Stores keypairs (PEM/Hex) and creation timestamps.
- `niche_id` (PK)
- `public_key_hex`

### `safety_action_log`
Audit trail of all dangerous actions.
- `action_hash`
- `signature`
- `approved` (0/1)

### `safety_tickets`
Queue for human review when actions are blocked.
- `id`
- `action_type`
- `status` ('PENDING', 'RESOLVED')

### `global_knowledge`
Shared insights between agents.
- `source_niche`
- `insight`
- `success_rate`

## 4. Emergency Procedures
If an agent goes rogue (e.g., spam loop), use the manual override:
```bash
# Freeze all dangerous actions immediately
python3 python_engine/agent_identity.py emergency-stop

# Restore normal operation
python3 python_engine/agent_identity.py emergency-release
```

## 5. Integration Pattern
1.  **Researcher** queries `get_insights` to learn what works.
2.  **Writer** drafts content.
3.  **Critic** evaluates.
4.  **Publisher** calls `sign_publish`.
    *   If blocked -> **Approval Node** triggers.
    *   If signed -> **Terminal Tool** executes.
5.  **Post-Process** calls `share_insight` if engagement checks pass.
