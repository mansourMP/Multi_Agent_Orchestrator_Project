# 🚀 Getting Started with AgentForge

Welcome! This guide will get you up and running with AgentForge in development mode.

## Prerequisites

Before you begin, ensure you have:

- ✅ **Node.js 18+** and npm
- ✅ **PostgreSQL 14+** running locally
- ✅ **Redis 6+** running locally
- ✅ **Git** installed

### Quick Install Prerequisites (macOS)

```bash
# Install Homebrew (if not installed)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install PostgreSQL
brew install postgresql@14
brew services start postgresql@14

# Install Redis
brew install redis
brew services start redis

# Verify installations
psql --version
redis-cli ping  # Should return "PONG"
node --version  # Should be 18+
```

---

## Step 1: Clone & Setup

```bash
cd /Users/mansur/Multi_Agent_Orchestrator_Project
```

The project is already initialized! You should see:
```
Multi_Agent_Orchestrator_Project/
├── backend/                 ✅ NestJS backend
├── frontend/                ✅ Next.js frontend  
├── docs/                    ✅ Full documentation
└── README.md               ✅ Main guide
```

---

## Step 2: Database Setup

### Create Database

```bash
# Connect to PostgreSQL
psql postgres

# Create database and user
CREATE DATABASE agentforge_dev;
CREATE USER agentforge WITH PASSWORD 'agentforge123';
GRANT ALL PRIVILEGES ON DATABASE agentforge_dev TO agentforge;

# Exit psql
\q
```

### Verify Connection

```bash
psql -U agentforge -d agentforge_dev -h localhost
# Enter password: agentforge123
# Should connect successfully
```

---

## Step 3: Backend Configuration

### Install Dependencies

```bash
cd backend
npm install
```

### Create Environment File

```bash
cp .env.example .env
```

### Edit `.env` File

Open `backend/.env` and update these **critical** values:

```env
# Database (update if you used different credentials)
DATABASE_URL="postgresql://agentforge:agentforge123@localhost:5432/agentforge_dev"

# JWT Secret (MUST CHANGE for security)
JWT_SECRET="your-super-secret-key-change-this-to-random-string"

# LLM Providers (add your API keys)
OPENAI_API_KEY="sk-..."
ANTHROPIC_API_KEY="sk-ant-..."
```

**Leave the rest as defaults for now.**

### Run Database Migrations

```bash
# Generate Prisma client
npm run prisma:generate

# Run migrations (creates all 16 tables)
npm run prisma:migrate

# Seed database with initial data
npm run prisma:seed
```

You should see:
```
✅ Created 3 billing plans
✅ Created 10 built-in tools
✅ Created sample workflows
✅ Database seeded successfully!
```

### Start Backend Server

```bash
npm run start:dev
```

You should see:
```
[Nest] 12345  - LOG [NestApplication] Nest application successfully started
✅ Database connected
🚀 AgentForge Backend running on http://localhost:4000
```

**Keep this terminal open!**

---

## Step 4: Frontend Configuration

Open a **new terminal window/tab**:

```bash
cd /Users/mansur/Multi_Agent_Orchestrator_Project/frontend
```

### Install Dependencies

```bash
npm install
```

### Create Environment File

```bash
cp .env.example .env.local
```

The defaults should work! But verify:

```env
NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1
NEXT_PUBLIC_WS_URL=http://localhost:4000
```

### Start Frontend Server

```bash
npm run dev
```

You should see:
```
  ▲ Next.js 14.x.x
  - Local:        http://localhost:3000
  - Ready in 2.5s
```

---

## Step 5: Verify Everything Works

### Check Backend API

Open browser or use curl:

```bash
curl http://localhost:4000/api/v1/health
```

Expected:
```json
{
  "status": "ok",
  "database": "connected",
  "redis": "connected"
}
```

### Check Frontend

Open browser: **http://localhost:3000**

You should see the AgentForge landing page (once we build it next!).

---

## Step 6: Explore the Database

### Open Prisma Studio

In a **new terminal**:

```bash
cd backend
npm run prisma:studio
```

Opens browser at **http://localhost:5555**

You can visually explore all tables:
- billing_plans (3 plans: Free, Pro, Enterprise)
- tools (10 built-in tools)
- users (empty, will populate on signup)
- workflows (sample workflows)

---

## 🎯 Quick Test Checklist

- [ ] PostgreSQL running: `brew services list | grep postgresql`
- [ ] Redis running: `redis-cli ping` returns `PONG`
- [ ] Backend running: `curl http://localhost:4000/api/v1/health`
- [ ] Frontend running: Open `http://localhost:3000`
- [ ] Prisma Studio: Open `http://localhost:5555`
- [ ] Database has data: Check Prisma Studio for billing_plans

---

## 🔧 Common Issues & Solutions

### Backend won't start

**Error:** `Cannot find module '@nestjs/common'`
```bash
cd backend
rm -rf node_modules package-lock.json
npm install
```

**Error:** `Error: connect ECONNREFUSED 127.0.0.1:5432`
- PostgreSQL isn't running
- Run: `brew services start postgresql@14`

**Error:** `P1001: Can't reach database server`
- Check DATABASE_URL in `.env`
- Verify postgres user/password
- Test: `psql -U agentforge -d agentforge_dev -h localhost`

### Frontend won't start

**Error:** `Module not found`
```bash
cd frontend
rm -rf node_modules package-lock.json .next
npm install
```

### Redis connection fails

**Error:** `Redis connection failed`
- Redis isn't running
- Run: `brew services start redis`
- Verify: `redis-cli ping`

### Port already in use

**Error:** `Port 4000 already in use`
```bash
# Find and kill process
lsof -ti:4000 | xargs kill -9
```

---

## 📚 Next Steps

Now that everything is running, you can:

### 1. **Test the API** (Postman/curl)
```bash
# Sign up a new user
curl -X POST http://localhost:4000/api/v1/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123","name":"Test User"}'
```

### 2. **Implement Features** (Development)

**Backend modules to implement:**
- `src/auth/` - Authentication (signup, login, JWT)
- `src/workflows/` - Workflow CRUD
- `src/executions/` - Execution engine
- `src/agents/` - LLM orchestration
- `src/chat/` - Real-time chat

**Frontend components to build:**
- `components/ui/` - Base components
- `components/workflow/` - Workflow editor (React Flow)
- `components/chat/` - Chat interface
- `app/(dashboard)/` - Dashboard pages

### 3. **Read the Documentation**
- [PRD.md](../docs/PRD.md) - Product requirements
- [SYSTEM_DESIGN.md](../docs/SYSTEM_DESIGN.md) - Architecture
- [DATA_MODEL.md](../docs/DATA_MODEL.md) - Database schema
- [API_SPEC.md](../docs/API_SPEC.md) - API documentation

---

## 🛠️ Development Workflow

### Terminal Setup (3 windows recommended)

**Terminal 1 - Backend:**
```bash
cd backend
npm run start:dev  # Auto-reloads on changes
```

**Terminal 2 - Frontend:**
```bash
cd frontend
npm run dev  # Auto-reloads on changes
```

**Terminal 3 - Database/Tools:**
```bash
cd backend
npm run prisma:studio  # Visual DB browser
```

### Making Changes

1. **Edit code** in VSCode or your editor
2. **See changes** automatically (hot reload)
3. **Check logs** in respective terminals
4. **Test in browser** at http://localhost:3000

### Useful Commands

```bash
# Backend
cd backend
npm run start:dev          # Start dev server
npm test                   # Run tests
npm run prisma:studio      # Open DB browser
npm run prisma:migrate     # Run new migrations
npm run lint                # Lint code

# Frontend  
cd frontend
npm run dev                # Start dev server
npm run build              # Production build
npm run lint               # Lint code
npm test                   # Run tests
```

---

## 🎉 You're All Set!

Your development environment is ready. The platform foundation is built.

### What's Working:
✅ Backend server with NestJS
✅ Frontend with Next.js 14
✅ PostgreSQL database with 16 tables
✅ Redis cache/session store
✅ Prisma ORM with migrations
✅ Environment configuration

### What's Next (Current Roadmap):
🔄 **Week 1-2:** Auth module + Workflows CRUD
🔄 **Week 3-4:** Workflow editor UI
🔄 **Week 5-6:** Agent execution engine
🔄 **Week 7-8:** Chat interface

---

## 📞 Need Help?

- **Docs:** Check `/docs` folder
- **Issues:** Create GitHub issue
- **Questions:** Read the code - it's well-documented!

**Happy building! 🚀**
