# API Specification - AgentForge

**Base URL:** `https://api.agentforge.app/v1`  
**Auth:** Bearer token in `Authorization` header

## Authentication

### POST /auth/signup
Create new account
```json
Request:
{
  "email": "user@example.com",
  "password": "secure123",
  "name": "John Doe"
}

Response: 201
{
  "user": { "id": "usr_...", "email": "...", "name": "..." },
  "token": "eyJhbGc..."
}
```

### POST /auth/login
```json
Request:
{ "email": "user@example.com", "password": "secure123" }

Response: 200
{ "token": "eyJhbGc...", "user": {...} }
```

### GET /auth/me
Get current user

## Workflows

### GET /workflows
List workflows
```
Query: ?workspaceId=ws_123&status=published&page=1&limit=20
Response: 200
{
  "data": [
    {
      "id": "wf_123",
      "name": "News Chat Agent",
      "status": "published",
      "createdAt": "2026-01-18T12:00:00Z"
    }
  ],
  "pagination": { "page": 1, "limit": 20, "total": 45 }
}
```

### POST /workflows
Create workflow
```json
Request:
{
  "workspaceId": "ws_123",
  "name": "My Agent",
  "definition": {
    "nodes": [...],
    "edges": [...]
  }
}

Response: 201
{ "id": "wf_...", "name": "...", ... }
```

### GET /workflows/:id
Get workflow details

### PATCH /workflows/:id
Update workflow

### POST /workflows/:id/publish
Publish workflow (creates webhook URL)
```json
Response: 200
{
  "webhookUrl": "https://api.agentforge.app/webhooks/wf_123_abc"
}
```

### POST /workflows/:id/execute
Trigger execution
```json
Request:
{ "input": { "message": "Hello" } }

Response: 202
{
  "executionId": "exec_456",
  "status": "pending"
}
```

## Executions

### GET /executions
List executions
```
Query: ?workflowId=wf_123&status=success&from=2026-01-01&to=2026-01-18
```

### GET /executions/:id
Get execution details with steps and tool calls

### WebSocket /executions/:id/stream
Real-time execution updates
```json
Events:
{ "type": "started", "executionId": "exec_456" }
{ "type": "step", "nodeId": "agent_1", "status": "running" }
{ "type": "step_complete", "nodeId": "agent_1", "output": {...} }
{ "type": "completed", "status": "success", "output": {...} }
```

## Chat

### POST /chat/sessions
Create chat session
```json
Request:
{ "workflowId": "wf_123" }

Response: 201
{ "sessionId": "sess_789" }
```

### POST /chat/sessions/:id/messages
Send message (streaming response)
```json
Request:
{ "content": "What's new in AI?" }

Response: 200 (Server-Sent Events)
data: {"type":"start"}
data: {"type":"token","content":"Based"}
data: {"type":"token","content":" on"}
data: {"type":"token","content":" recent"}
...
data: {"type":"done","sources":[{"name":"BBC News","url":"..."}]}
```

### GET /chat/sessions/:id/messages
Get message history

## Tools

### GET /tools
List available tools
```
Query: ?category=news&available=true
```

### GET /tools/:id
Tool details including schema

## Organizations & Workspaces

### GET /organizations
List user's organizations

### POST /organizations
Create organization

### POST /organizations/:id/members
Invite member
```json
Request:
{ "email": "teammate@example.com", "role": "member" }
```

### GET /workspaces
List workspaces

### POST /workspaces
Create workspace
```json
Request:
{
  "organizationId": "org_123",
  "name": "Production",
  "settings": {}
}
```

## Billing

### GET /billing/plans
List available plans

### GET /billing/subscription
Get current subscription

### POST /billing/checkout
Create Stripe checkout session

### GET /billing/usage
Current period usage
```json
Response:
{
  "period": { "start": "...", "end": "..." },
  "metrics": {
    "executions": { "used": 1245, "limit": 10000 },
    "llmTokens": { "used": 450000, "limit": 1000000 }
  }
}
```

## Webhooks

### POST /webhooks/:workflowId
Public endpoint for triggering workflows
```json
Request:
{
  "data": { "message": "External trigger" }
}
Headers:
X-Webhook-Signature: sha256=...

Response: 200
{ "executionId": "exec_..." }
```

## Error Responses

```json
400 Bad Request:
{
  "error": "validation_error",
  "message": "Invalid input",
  "details": [
    { "field": "email", "message": "Invalid email format" }
  ]
}

401 Unauthorized:
{ "error": "unauthorized", "message": "Invalid token" }

403 Forbidden:
{ "error": "forbidden", "message": "Insufficient permissions" }

429 Too Many Requests:
{
  "error": "rate_limit_exceeded",
  "message": "Too many requests",
  "retryAfter": 60
}

500 Internal Server Error:
{
  "error": "internal_error",
  "message": "Something went wrong",
  "requestId": "req_abc123"
}
```

## Rate Limits

- API: 1000 requests/minute per user
- Webhooks: 10000 requests/day per workflow
- Chat: 100 messages/minute per session

Headers:
```
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 856
X-RateLimit-Reset: 1642531200
```
