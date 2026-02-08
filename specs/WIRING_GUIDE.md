# Wiring Guide: Connecting the Brain to the Hands

**CRITICAL RULES:**
1.  **NEVER pass raw text via CLI args**.
2.  **ALWAYS use File-Based Payloads**.
3.  **Use UUIDs/Execution IDs for filenames**.
4.  **STDOUT is for JSON only**.

---

## 1. Network Effect Check (The Brain)

### Step A: Prepare Payload (Python Coding Node)
**Goal**: Create a safe JSON file containing the topic.
```python
import json
import uuid
import os
import hashlib

# Ensure platform injects specific variable for execution ID, or generate one
exec_id = "{{execution_id}}" # or uuid.uuid4().hex
run_dir = f"/tmp/agency_os/{exec_id}"
os.makedirs(run_dir, exist_ok=True)

# Platform injects variables like 'topic'
# Ensure 'topic' is escaped or injected safely by the platform!
payload = {
    "topic": "{{topic}}",
    "execution_id": exec_id,
    "node_id": "network_check_prep"
}

# Unique Path
file_path = f"{run_dir}/payload_network_{uuid.uuid4().hex}.json"
with open(file_path, "w") as f:
    json.dump(payload, f)

# Output path + preview with hash
topic_hash = hashlib.sha256(payload["topic"].encode()).hexdigest()
print(json.dumps({
    "payload_path": file_path,
    "preview": {"topic": payload["topic"], "topic_hash": topic_hash}
}))
```

### Step B: Execute Check (Coding Node / Bridge)
**Command**:
```bash
python3 python_engine/agency_logic.py astronomy check_network --in "{{payload_path}}"
```

---

## 2. Critic Eval (The Evaluation)

### Step A: Prepare Payload (Python Coding Node)
```python
import json
import uuid
import os

exec_id = "{{execution_id}}"
run_dir = f"/tmp/agency_os/{exec_id}"
os.makedirs(run_dir, exist_ok=True)

# STRICT ARTIFACT PATTERN: Read draft from file. NO templating large strings.
draft_path = "{{draft_file_path}}"
with open(draft_path, "r") as f:
    draft_content = f.read()

payload = {
    "draft": draft_content,
    "model": "gemini-1.5-flash",
    "execution_id": exec_id
}

file_path = f"{run_dir}/payload_critic_{uuid.uuid4().hex}.json"
with open(file_path, "w") as f:
    json.dump(payload, f)

print(json.dumps({
    "payload_path": file_path,
    "preview": {"len": len(draft_content)}
}))
```

### Step B: Execute Eval (Coding Node / Bridge)
**Command**:
```bash
python3 python_engine/agency_logic.py astronomy critic_eval --in "{{payload_path}}"
```

---

## 3. Terminal Publish (The Hands)

### Step A: Prepare & Sign Payload (Python Coding Node)
**Goal**: Create the full publishing package with **Strong Idempotency**.
```python
import json
import hashlib
import uuid
import os
import re

exec_id = "{{execution_id}}"
run_dir = f"/tmp/agency_os/{exec_id}"
os.makedirs(run_dir, exist_ok=True)

# STRICT ARTIFACT PATTERN
draft_path = "{{draft_file_path}}"
platform = "twitter"
media_path = "{{image_path}}"

with open(draft_path, "r") as f:
    content = f.read()

# 1. Normalize Content (Trim & Collapse Whitespace)
content_norm = re.sub(r'\s+', ' ', content).strip()

# 2. Hash Media Bytes (Streamed for Memory Safety)
media_hash = "no_media"
if os.path.exists(media_path):
    sha = hashlib.sha256()
    with open(media_path, "rb") as f:
        # Read 4KB chunks
        for chunk in iter(lambda: f.read(4096), b""):
            sha.update(chunk)
    media_hash = sha.hexdigest()

# 3. Compute Idempotency Key
key_seed = f"{platform}|{content_norm}|{media_hash}"
idem_key = hashlib.sha256(key_seed.encode()).hexdigest()

payload = {
    "platform": platform,
    "content": content,
    "media_path": media_path,
    "idempotency_key": idem_key,
    "execution_id": exec_id
}

# 4. Save to Temp File
file_path = f"{run_dir}/pub_{idem_key[:8]}_{uuid.uuid4().hex}.json"
with open(file_path, "w") as f:
    json.dump(payload, f)

# 5. Output for UI Approval
snippet = (content[:200] + "...") if len(content) > 200 else content
print(json.dumps({
    "payload_path": file_path,
    "preview": {
        "platform": platform,
        "content_full": content, # Full content for Approval Node
        "content_snippet": snippet,
        "media_hash": media_hash[:8],
        "idempotency_key": idem_key
    }
}))
```

### Step B: Execute Publish (Tool Node -> Local Command)
**Command**:
```bash
node bridge/tools/terminal_publish.js --in "{{payload_path}}"
```
**Safety**: Connect an **Approval Node** before this step. The Approval Node will display the `preview` object (Content + Keys), allowing for verified human review.

## 4. Agent Identity (Provenance & Safety)
*New in AC-OS v1.0*

### Step A: Sign & Verify Action (Python Coding Node)
**Goal**: Cryptographically sign a high-value action request.
```python
import json
import uuid
import os

exec_id = "{{execution_id}}"
run_dir = f"/tmp/agency_os/{exec_id}"
os.makedirs(run_dir, exist_ok=True)

# Define the action
payload = {
    "content": "{{content_text}}",
    "platform": "twitter",
    "media_path": "{{media_path}}",
    "execution_id": exec_id,
    "node_id": "signing_node"
}

file_path = f"{run_dir}/payload_sign_{uuid.uuid4().hex}.json"
with open(file_path, "w") as f:
    json.dump(payload, f)

print(json.dumps({
    "payload_path": file_path,
    "action": "sign_publish"
}))
```

### Step B: Execute Signing (Bridge Command)
**Command**:
```bash
python3 python_engine/agency_logic.py astronomy sign_publish --in "{{payload_path}}"
```
**Output Understanding**:
*   If `ok: false` and `blocked: true`, the flow should route to a **Human Approval Node**.
*   The `reason` field will specify why (e.g., "Rate limit exceeded").

---

## 5. Global Variables (The Context)
*   Go to the **Variables** page in the sidebar.
*   The `config/niches.yaml` file you generated works as a file source, but you can also define simple variables like `GLOBAL_CEO_NAME = "Mansur"` here to inject into every prompt.

---

**Summary of Data Flow**:
`Researcher (Agent)` -> `Topic (Variable)` -> `Network Check (Coding Node)` -> `Drafting (Squad)` -> `Critic Eval (Coding Node)` -> `Publish (Tool Node)`

## 5. Cleanup Strategy (Hygiene)
To prevent disk bloat:
1.  **System Policy**: Configure your orchestrator to delete `/tmp/agency_os/{{execution_id}}` after a successful run.
2.  **Debugging**: Keep folders for FAILED runs for 24 hours.
3.  **Artifacts**: For long-term retention, upload critical JSON payloads to an S3/Blob storage instead of leaving them in `/tmp`.

## Appendix: Gold Standard Payload Contract
Every internal JSON payload file MUST include:
*   `execution_id` (string): Unique ID for the current workflow run.
*   `node_id` (string, optional): Which node generated this.
*   `created_at` (timestamp, optional): ISO string.
*   `idempotency_key` (hash, required for side-effects): Deterministic hash of intent.

