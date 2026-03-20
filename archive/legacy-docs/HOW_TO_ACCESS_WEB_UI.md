# 🌐 How to Access AgentForge Web UI

## ✅ Quick Start

### 1. **Make Sure Both Servers Are Running**

**Terminal 1 (Backend):**
```bash
cd backend
npm run start:dev
```
Wait for: `Application is running on: http://localhost:4000`

**Terminal 2 (Frontend):**
```bash
cd frontend
npm run dev
```
Wait for: `Ready on http://localhost:3000`

---

### 2. **Open in Your Browser**

**Option A: Click this URL**
```
http://localhost:3000
```

**Option B: Type in browser address bar**
```
localhost:3000
```

---

## 📍 Main Pages

| Page | URL | What You'll See |
|------|-----|----------------|
| **Home Dashboard** | http://localhost:3000 | Overview, recent workflows |
| **Workflows** | http://localhost:3000/workflows | List of all workflows |
| **Agents** | http://localhost:3000/agents | AI agent configurations |
| **Executions** | http://localhost:3000/executions | Workflow run history |
| **Settings** | http://localhost:3000/settings | Configuration |

---

## 🎯 Testing Your 3 New Agents

### Step 1: Create or Open a Workflow

1. Go to http://localhost:3000/workflows
2. Click on any existing workflow **OR** create a new one
3. The workflow canvas will open

### Step 2: See Your New Nodes

**On the left sidebar, you'll see:**
- 👁️ **Vision Analyzer** (Purple) - NEW!
- 💻 **Coding Agent** (Green) - NEW!
- 🔍 **Research Agent** (Blue) - NEW!

### Step 3: Drag & Drop to Canvas

1. **Drag** a node from the left panel
2. **Drop** it onto the canvas
3. **Click** the node to configure it in the right panel
4. **Connect** nodes by dragging from one node's handle to another

---

## 🧪 Quick Test Workflow

### Create This Simple Test:

```
[Trigger] → [Research Agent] → [Agent (Review)]
```

**Configure Research Node:**
- Topic: "AI trends 2024"
- Depth: Quick
- Focus: Trends

**Configure Agent Node:**
- System Prompt: "Summarize the research findings"

### Run It:
1. Click the **"Run"** button at the top
2. Watch the execution logs in real-time
3. See the Research Agent gather information!

---

## 🔧 Troubleshooting

### Backend Not Starting?
**Error:** Port 4000 already in use
**Fix:**
```bash
# Kill the process on port 4000
lsof -ti:4000 | xargs kill -9

# Restart
cd backend
npm run start:dev
```

### Frontend Not Starting?
**Error:** Port 3000 already in use
**Fix:**
```bash
# Kill the process on port 3000
lsof -ti:3000 | xargs kill -9

# Restart
cd frontend
npm run dev
```

### "Cannot connect to backend"
**Check:**
1. Backend is running on http://localhost:4000
2. Open http://localhost:4000 in browser - should see "Hello from AgentForge"
3. If not, restart backend

### Blank Page
**Fix:**
1. Clear browser cache (Cmd+Shift+R on Mac)
2. Check browser console for errors (F12 → Console tab)
3. Restart frontend

---

## 🎨 What You Should See

### Home Page
- Dashboard with statistics
- Recent executions
- Quick actions

### Workflows Page
- List of workflows
- Create new workflow button
- Each workflow shows node count and last run time

### Workflow Canvas (The Magic!)
- **Left Panel:** Node Library (with your 3 new agents!)
- **Center:** Visual canvas for building workflows
- **Right Panel:** Node properties when selected
- **Top:** Run button, Save button
- **Bottom:** Execution logs

---

## 🚀 Your 3 New Agents in Action

When you drag them to the canvas, you'll see:

### 👁️ Vision Agent (Purple)
- Eye icon
- Shows analysis type
- Displays image URL
- Depth badge

### 💻 Coding Agent (Green)
- Code icon
- Shows programming language emoji (�, 📙, 📘, 🐚)
- Displays task description
- Requirements count badge

### 🔍 Research Agent (Blue)
- Search icon
- Shows focus type (🌐, 📈, 🎯, ⚙️)
- Displays research topic
- Depth badge (⚡ Quick, 📊 Standard, 🔬 Deep)

---

## 💡 Pro Tips

1. **Use Chrome/Edge** for best compatibility
2. **Keep DevTools open** (F12) to see any errors
3. **Save frequently** - Click the Save button after changes
4. **Test with simple workflows first** before complex ones
5. **Check execution logs** - They show everything the agents are doing

---

## 🎯 Ready to Test!

1. Open: **http://localhost:3000/workflows**
2. Click any workflow (or create new)
3. Drag **Research Agent** to canvas
4. Click it, configure: "AI agents market trends"
5. Click **Run**
6. Watch the magic! ✨

**The web UI is at: http://localhost:3000** (not a terminal command!)
