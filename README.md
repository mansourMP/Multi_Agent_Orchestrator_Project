# AgentForge - AI Agent Orchestration Platform

![Phase 5: Human-Agent Collaboration](https://img.shields.io/badge/Phase-5%20Human--Agent%20Collaboration-brightgreen)
![Status](https://img.shields.io/badge/Status-70%25%20Complete-blue)
![License](https://img.shields.io/badge/License-MIT-yellow)

**AgentForge** is a production-grade visual orchestration platform for building, deploying, and managing multi-agent AI workflows. Think of it as "GitHub Actions meets LangChain" - a drag-and-drop canvas where you design complex agent swarms with conditional logic, human-in-the-loop approvals, and parallel execution.

---

## 🚀 Key Features

### ✨ **Visual Workflow Builder**
- **Drag-and-Drop Canvas**: Powered by React Flow, design complex agent workflows visually
- **5 Node Types**: Trigger, Agent, Tool, Logic (If/Else), Human Approval, Parallel Split
- **Real-time Validation**: Instant feedback on workflow structure and connections

### 🤖 **Intelligent Agent Execution**
- **Multi-LLM Support**: OpenAI GPT-4, Claude, or custom models
- **RAG Memory**: Retrieval-Augmented Generation for context-aware agents
- **Conditional Branching**: Dynamic workflow paths based on agent outputs
- **Parallel Execution**: Run multiple agent branches simultaneously

### 🧠 **Human-in-the-Loop**
- **Approval Nodes**: Pause workflows for manual review and intervention
- **Real-time Logs**: Live execution stream with Approve/Reject controls
- **Persistent State**: Resume workflows exactly where they paused

### 🎨 **Premium UI/UX**
- **Dual Themes**: Vibrant dark mode and sleek light mode
- **Glassmorphism Design**: Modern, professional interface
- **Responsive Layout**: Works on desktop, tablet, and mobile

### 🔧 **Production-Ready Infrastructure**
- **Docker Compose**: One-command deployment with PostgreSQL and Redis
- **Type-Safe Backend**: NestJS with Prisma ORM
- **n8n Integration**: Sync workflows to n8n for external automation
- **JWT Authentication**: Secure multi-tenant access control

---

## 📦 Tech Stack

**Frontend:**
- Next.js 14 (App Router)
- React Flow (Visual Canvas)
- TypeScript
- CSS Modules

**Backend:**
- NestJS (Node.js Framework)
- Prisma ORM (SQLite/PostgreSQL)
- OpenAI API
- n8n Integration

**Infrastructure:**
- Docker & Docker Compose
- PostgreSQL (Production DB)
- Redis (Caching)

---

## 🏃 Quick Start

### Prerequisites
- Node.js 20+
- Docker & Docker Compose (optional, for production)
- OpenAI API Key

### Local Development

1. **Clone the repository**
```bash
git clone https://github.com/yourusername/agentforge.git
cd agentforge
```

2. **Setup Backend**
```bash
cd backend
npm install
cp .env.example .env
# Edit .env and add your OPENAI_API_KEY
npx prisma generate
npx prisma migrate dev
npm run seed
npm run start:dev
```

3. **Setup Frontend**
```bash
cd ../frontend
npm install
npm run dev
```

4. **Access the Platform**
- Frontend: http://localhost:3000
- Backend API: http://localhost:4000/api/v1

### Docker Deployment

```bash
docker-compose up -d
```

This will start:
- PostgreSQL database
- Redis cache
- Backend API (port 4000)
- Frontend UI (port 3000)

---

## 🎯 Usage Guide

### Creating Your First Workflow

1. **Navigate to Workflows** (`/workflows`)
2. **Click "Create New"** and name your workflow
3. **Drag nodes** from the left palette onto the canvas:
   - **Trigger**: Start point (HTTP webhook, schedule, etc.)
   - **Agent**: AI reasoning node (configure model and system prompt)
   - **Logic**: If/Else conditional branching
   - **Tool**: External API calls or actions
   - **Approval**: Human review checkpoint
   - **Parallel**: Execute multiple paths simultaneously
4. **Connect nodes** by dragging from output handles to input handles
5. **Configure each node** by clicking to open the properties panel
6. **Save** and **Run** your workflow

### Example: Customer Support Swarm

```
Trigger (Webhook)
  ↓
Agent (Classify Intent)
  ↓
Logic (Is Complaint?)
  ├─ True → Agent (Escalation Handler) → Approval (Manager Review)
  └─ False → Agent (FAQ Responder) → Tool (Send Email)
```

---

## 🧪 Advanced Features

### Parallel Execution
Use the **Parallel Split** node to execute multiple agent branches concurrently:
```
Parallel Split
  ├─ Branch 1: Research Agent → Summarizer
  └─ Branch 2: Data Agent → Analyzer
  ↓ (Results merge automatically)
Final Output
```

### RAG Memory
Agents automatically:
1. **Retrieve** relevant context from past executions before thinking
2. **Store** their outputs as embeddings for future reference

### n8n Sync
Click **"Publish to n8n"** to export your workflow as an n8n-compatible JSON file for external automation.

---

## 📊 Project Status

**Phase 5: Human-Agent Collaboration** - 70% Complete

### ✅ Completed
- Visual workflow canvas with 6 node types
- Real-time LLM execution with OpenAI
- Conditional logic and branching
- Human approval with pause/resume
- Parallel execution engine
- RAG memory integration
- Dual theme support (dark/light)
- Production error handling
- Docker deployment setup

### 🚧 In Progress
- Advanced parallel merge strategies
- Custom tool connector UI
- Multi-user RBAC

### 🔮 Roadmap
- WebSocket live collaboration
- Workflow versioning and rollback
- Built-in observability dashboard
- Marketplace for pre-built agents

---

## 🤝 Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

---

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.

---

## 🙏 Acknowledgments

Built with:
- [React Flow](https://reactflow.dev/) - Visual workflow canvas
- [NestJS](https://nestjs.com/) - Backend framework
- [Prisma](https://www.prisma.io/) - Database ORM
- [OpenAI](https://openai.com/) - LLM API
- [n8n](https://n8n.io/) - Workflow automation

---

**Made with ❤️ by the AgentForge Team**
