# Data Model - Empyralis

## Entity Relationship Diagram

```
Organizations (1) ──< (N) OrganizationMembers >── (N) Users
      │
      └──< (N) Workspaces
              │
              ├──< (N) Workflows
              │       │
              │       ├──< (N) WorkflowVersions
              │       └──< (N) Executions
              │               │
              │               ├──< (N) ExecutionSteps
              │               └──< (N) ToolCalls
              │
              ├──< (N) Agents
              ├──< (N) Tools
              ├──< (N) ChatSessions
              │       └──< (N) ChatMessages
              └──< (N) ApiKeys

Users (1) ──< (N) AuditLogs
Organizations (1) ──< (1) Subscription ──> (1) BillingPlan
Organizations (1) ──< (N) UsageMeters
```

## Core Tables

### users
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255),
  avatar_url TEXT,
  email_verified BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_users_email ON users(email);
```

### organizations
```sql
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) UNIQUE NOT NULL,
  avatar_url TEXT,
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_organizations_slug ON organizations(slug);
```

### organization_members
```sql
CREATE TABLE organization_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(50) NOT NULL CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, user_id)
);
CREATE INDEX idx_org_members_org ON organization_members(organization_id);
CREATE INDEX idx_org_members_user ON organization_members(user_id);
```

### workspaces
```sql
CREATE TABLE workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_workspaces_org ON workspaces(organization_id);
```

### workflows
```sql
CREATE TABLE workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  status VARCHAR(50) DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  definition JSONB NOT NULL, -- React Flow nodes/edges
  n8n_workflow_id VARCHAR(255), -- Synced n8n workflow
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  published_at TIMESTAMPTZ
);
CREATE INDEX idx_workflows_workspace ON workflows(workspace_id);
CREATE INDEX idx_workflows_status ON workflows(status);
```

### executions
```sql
CREATE TABLE executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id),
  status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'success', 'failed', 'timeout')),
  input JSONB,
  output JSONB,
  error TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER,
  cost_usd DECIMAL(10,6),
  triggered_by VARCHAR(50), -- 'manual', 'webhook', 'schedule', 'api'
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_executions_workflow ON executions(workflow_id, created_at DESC);
CREATE INDEX idx_executions_org_status ON executions(organization_id, status);
CREATE INDEX idx_executions_created ON executions(created_at DESC);
```

### execution_steps
```sql
CREATE TABLE execution_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id UUID NOT NULL REFERENCES executions(id) ON DELETE CASCADE,
  node_id VARCHAR(255) NOT NULL,
  node_type VARCHAR(100) NOT NULL,
  status VARCHAR(50) NOT NULL,
  input JSONB,
  output JSONB,
  error TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER,
  step_order INTEGER NOT NULL
);
CREATE INDEX idx_execution_steps_execution ON execution_steps(execution_id, step_order);
```

### tool_calls
```sql
CREATE TABLE tool_calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_step_id UUID NOT NULL REFERENCES execution_steps(id) ON DELETE CASCADE,
  tool_name VARCHAR(255) NOT NULL,
  arguments JSONB NOT NULL,
  result JSONB,
  error TEXT,
  duration_ms INTEGER,
  cost_usd DECIMAL(10,6),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_tool_calls_step ON tool_calls(execution_step_id);
CREATE INDEX idx_tool_calls_tool ON tool_calls(tool_name, created_at DESC);
```

### agents
```sql
CREATE TABLE agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  model VARCHAR(100) NOT NULL, -- 'gpt-4', 'claude-3-opus', etc.
  system_prompt TEXT NOT NULL,
  temperature DECIMAL(3,2) DEFAULT 0.7,
  max_tokens INTEGER DEFAULT 2000,
  tools JSONB DEFAULT '[]', -- Array of tool IDs
  memory_config JSONB DEFAULT '{"type": "none"}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_agents_workspace ON agents(workspace_id);
```

### tools
```sql
CREATE TABLE tools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) UNIQUE NOT NULL,
  display_name VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  category VARCHAR(100), -- 'news', 'database', 'communication', 'custom'
  type VARCHAR(50) NOT NULL, -- 'http', 'database', 'function', 'builtin'
  configuration JSONB NOT NULL,
  parameters_schema JSONB NOT NULL, -- JSON Schema for tool params
  is_public BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_tools_category ON tools(category);
```

### tool_permissions
```sql
CREATE TABLE tool_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  tool_id UUID NOT NULL REFERENCES tools(id) ON DELETE CASCADE,
  allowed BOOLEAN DEFAULT true,
  config_overrides JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, tool_id)
);
```

### chat_sessions
```sql
CREATE TABLE chat_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_message_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_chat_sessions_workflow ON chat_sessions(workflow_id);
CREATE INDEX idx_chat_sessions_user ON chat_sessions(user_id);
```

### chat_messages
```sql
CREATE TABLE chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  role VARCHAR(50) NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}', -- sources, tool_calls, etc.
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_chat_messages_session ON chat_messages(session_id, created_at);
```

### audit_logs
```sql
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id),
  user_id UUID REFERENCES users(id),
  action VARCHAR(255) NOT NULL, -- 'workflow.created', 'user.invited', etc.
  resource_type VARCHAR(100),
  resource_id UUID,
  metadata JSONB DEFAULT '{}',
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_audit_logs_org ON audit_logs(organization_id, created_at DESC);
CREATE INDEX idx_audit_logs_user ON audit_logs(user_id, created_at DESC);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
```

### billing_plans
```sql
CREATE TABLE billing_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  display_name VARCHAR(255) NOT NULL,
  price_monthly_usd DECIMAL(10,2),
  limits JSONB NOT NULL, -- {executions: 10000, storage_gb: 10, ...}
  features JSONB DEFAULT '[]',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### subscriptions
```sql
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES billing_plans(id),
  status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('trial', 'active', 'past_due', 'cancelled')),
  stripe_subscription_id VARCHAR(255),
  current_period_start TIMESTAMPTZ NOT NULL,
  current_period_end TIMESTAMPTZ NOT NULL,
  cancel_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_subscriptions_org ON subscriptions(organization_id);
CREATE INDEX idx_subscriptions_status ON subscriptions(status);
```

### usage_meters
```sql
CREATE TABLE usage_meters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  metric VARCHAR(100) NOT NULL, -- 'executions', 'llm_tokens', 'storage_bytes'
  value BIGINT DEFAULT 0,
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, metric, period_start)
);
CREATE INDEX idx_usage_meters_org_period ON usage_meters(organization_id, period_start DESC);
```

## Row-Level Security (RLS)

```sql
-- Enable RLS on all tenant-scoped tables
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE executions ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only access their org's data
CREATE POLICY workspaces_tenant_isolation ON workspaces
  USING (organization_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = current_user_id()
  ));

CREATE POLICY workflows_tenant_isolation ON workflows
  USING (workspace_id IN (
    SELECT w.id FROM workspaces w
    JOIN organization_members om ON w.organization_id = om.organization_id
    WHERE om.user_id = current_user_id()
  ));
```

## Indexes for Performance

```sql
-- Composite indexes for common queries
CREATE INDEX idx_executions_org_created ON executions(organization_id, created_at DESC);
CREATE INDEX idx_workflows_workspace_status ON workflows(workspace_id, status);
CREATE INDEX idx_chat_messages_session_created ON chat_messages(session_id, created_at);

-- Partial indexes for active records
CREATE INDEX idx_executions_running ON executions(workflow_id) WHERE status = 'running';
CREATE INDEX idx_subscriptions_active ON subscriptions(organization_id) WHERE status = 'active';
```

## Seed Data

See `/prisma/seed.ts` for initial data including:
- Free/Pro/Enterprise billing plans
- Built-in tools (News APIs, HTTP, etc.)
- Sample workflows
