# AESK Integration Plan - Conductor + Autonomous Enterprise

## Architecture Overview

We're integrating the **Autonomic Enterprise System Kernel (AESK)** into Conductor to create a self-running AI company.

---

## 1. Database Schema (Company Brain)

### **New Tables (via Prisma):**

```prisma
// AESK Tables

model Feedback {
  id            String   @id @default(uuid())
  source        String   // 'twitter', 'email', 'appstore', 'support'
  content       String
  sentimentScore Float?
  status        String   @default("pending") // 'pending', 'analyzed', 'acted_on'
  metadata      Json?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  
  // Relations
  decisions     Decision[]
}

model Decision {
  id          String   @id @default(uuid())
  agentName   String   // 'cortex_strategist', 'dev_squad', etc.
  actionType  String   // 'CODE_FIX', 'MARKETING', 'SUPPORT_RESPONSE'
  reasoning   String
  priority    String   @default("MEDIUM") // 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'
  status      String   @default("pending") // 'pending', 'executing', 'completed', 'failed'
  result      Json?
  createdAt   DateTime @default(now())
  completedAt DateTime?
  
  // Relations
  feedbackId  String?
  feedback    Feedback? @relation(fields: [feedbackId], references: [id])
  workflowExecutionId String?
  workflowExecution Execution? @relation(fields: [workflowExecutionId], references: [id])
}

model Signal {
  id         String   @id @default(uuid())
  type       String   // 'error', 'metric', 'user_action', 'system_health'
  severity   String   // 'INFO', 'WARNING', 'ERROR', 'CRITICAL'
  payload    Json
  processed  Boolean  @default(false)
  createdAt  DateTime @default(now())
}

model CompanyMetric {
  id        String   @id @default(uuid())
  metricName String  // 'active_users', 'error_rate', 'revenue', 'api_cost'
  value     Float
  unit      String
  timestamp DateTime @default(now())
}
```

---

## 2. Backend Services (NestJS Modules)

### **A. AESK Module Structure:**

```
backend/src/aesk/
├── aesk.module.ts
├── aesk.controller.ts
├── services/
│   ├── company-brain.service.ts      # Database operations
│   ├── autonomous-orchestrator.service.ts  # Main loop
│   ├── pulse.service.ts              # Feedback monitoring
│   ├── cortex.service.ts             # Decision engine
│   └── dev-squad.service.ts          # Code execution (uses existing CodingAgentService)
└── dto/
    ├── feedback.dto.ts
    └── decision.dto.ts
```

---

## 3. Integration with Existing Conductor

### **How They Connect:**

```typescript
// AESK Autonomous Loop
PulseService (monitors) 
  → detects issue (e.g., "App crash reported")
  
CortexService (decides)
  → analyzes: "This needs a code fix"
  → creates Decision: { type: 'CODE_FIX', priority: 'HIGH' }
  
DevSquadService (executes)
  → triggers existing CodingAgentService
  → OR creates Workflow: Research → Design → Code → Test
  → executes via ExecutionsService
  
CompanyBrainService (remembers)
  → logs decision
  → tracks result
  → learns for future
```

---

## 4. Data Storage Strategy

### **Development (Your Laptop):**
```
✅ PostgreSQL (existing Prisma setup)
✅ Local Redis (for message queue)
✅ File system (for agent workspaces)
```

### **Production (Like n8n):**
```
✅ Supabase (managed PostgreSQL) - $25/month
✅ Upstash Redis (managed) - Free tier
✅ Cloudflare R2 (file storage) - Pay as you go
```

**Migration:** Just change DATABASE_URL in .env!

---

## 5. Autonomous Orchestrator (The Main Loop)

```typescript
// Runs every 10 seconds (configurable)
@Injectable()
export class AutonomousOrchestratorService implements OnModuleInit {
  
  async onModuleInit() {
    this.startAutonomousLoop();
  }
  
  private async startAutonomousLoop() {
    while (true) {
      try {
        // PHASE 1: LISTEN (Pulse)
        const signals = await this.pulseService.scanEnvironment();
        
        // PHASE 2: THINK (Cortex)
        if (signals.length > 0) {
          const decisions = await this.cortexService.analyze(signals);
          
          // PHASE 3: ACT (Dev Squad / Marketing / Support)
          for (const decision of decisions) {
            await this.executeDecision(decision);
          }
        }
        
        // Sleep interval (avoid burning API costs)
        await this.sleep(10000); // 10 seconds
        
      } catch (error) {
        this.logger.error('Orchestrator error:', error);
        await this.sleep(60000); // Wait 1 minute on error
      }
    }
  }
}
```

---

## 6. API Endpoints (REST + WebSocket)

### **REST API:**
```typescript
// Get company status
GET /api/v1/aesk/status
→ Returns: { agents: [...], decisions: [...], metrics: {...} }

// Get recent decisions
GET /api/v1/aesk/decisions?limit=50
→ Returns: Decision[]

// Get feedback queue
GET /api/v1/aesk/feedback?status=pending
→ Returns: Feedback[]

// Manual decision override
POST /api/v1/aesk/decisions
Body: { actionType: 'CODE_FIX', priority: 'HIGH', details: {...} }
→ Creates: Decision

// Emergency stop
POST /api/v1/aesk/emergency-stop
→ Pauses autonomous loop
```

### **WebSocket (Real-time):**
```typescript
// Live feed for dashboard
WS /api/v1/aesk/stream
→ Emits: { type: 'decision', data: {...} }
→ Emits: { type: 'signal', data: {...} }
→ Emits: { type: 'metric', data: {...} }
```

---

## 7. Frontend Dashboard (CEO Control Panel)

### **New Route:**
```
/aesk-dashboard
```

### **Features:**
- Live decision feed (WebSocket)
- Company metrics (charts)
- Manual override controls
- Feedback queue viewer
- Agent status monitoring

---

## 8. Implementation Phases

### **Phase 1: Foundation** (2 hours)
1. Create database schema (Prisma migrations)
2. Build CompanyBrainService (CRUD operations)
3. Build basic AutonomousOrchestratorService (mock loop)
4. Create REST API endpoints

### **Phase 2: Intelligence** (3 hours)
1. Build PulseService (monitors feedback sources)
2. Build CortexService (decision engine with LLM)
3. Integrate with existing agents (Coding, Research)
4. Add logging & error handling

### **Phase 3: Dashboard** (2 hours)
1. Create AESK dashboard page
2. Add WebSocket real-time updates
3. Build manual override controls
4. Add metrics visualization

### **Phase 4: Production** (1 hour)
1. Add environment config for Supabase
2. Add Redis message queue
3. Add deployment docs
4. Add monitoring/alerts

---

## 9. Security & Safety

### **Sandboxing:**
```typescript
// Dev Squad executes code in isolated workspace
const workspace = `/sandbox/${userId}/${taskId}/`;
// Limit file system access
// Set execution timeout (5 minutes max)
// Monitor API usage
```

### **Budget Controls:**
```typescript
// Track API costs per decision
// Alert if daily spend > $50
// Auto-pause if monthly spend > $500
```

---

## 10. Professional Features (Like n8n)

✅ **Webhook Triggers** - External services can trigger decisions
✅ **Scheduled Tasks** - Cron-based autonomous checks
✅ **Audit Logs** - Every decision is logged with reasoning
✅ **Version Control** - Workflows are versioned
✅ **Multi-tenancy** - Support multiple companies/users
✅ **API Rate Limiting** - Prevent abuse
✅ **Secrets Management** - Encrypted credentials vault

---

## Next Steps

**Should I start with Phase 1 (Foundation)?**
- Prisma schema updates
- CompanyBrainService implementation
- Basic orchestrator loop
- API endpoints

**This will take ~2 hours and gives you a working AESK foundation!** 🚀
