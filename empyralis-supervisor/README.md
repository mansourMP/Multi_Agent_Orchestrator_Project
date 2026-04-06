# empyralis-supervisor

Privileged local device control sidecar for Empyralis. It runs as a standalone
binary, binds only to `127.0.0.1:7788`, and accepts signed local HTTP requests.

## Environment

- `EMPYRALIS_SUPERVISOR_SECRET` must be set before startup.

## Run

```bash
cargo run
```

## Python Call Example

```python
import hmac, hashlib, uuid, requests, json
from datetime import datetime, timedelta

secret = "your-secret"
request_id = str(uuid.uuid4())
capability_id = "screenshot.capture"
nonce = str(uuid.uuid4())
expires_at = (datetime.utcnow() + timedelta(seconds=30)).isoformat() + "Z"

sign_str = f"{request_id}:{capability_id}:{nonce}:{expires_at}"
signature = hmac.new(secret.encode(), sign_str.encode(), hashlib.sha256).hexdigest()

payload = {
    "request_id": request_id,
    "capability_id": capability_id,
    "run_id": "run-123",
    "trace_id": "trace-456",
    "workspace_id": "ws-789",
    "arguments": { "monitor": "primary", "region": None },
    "nonce": nonce,
    "expires_at": expires_at,
    "signature": signature
}

resp = requests.post("http://127.0.0.1:7788/execute", json=payload)
print(resp.json())
```
