# 🤖 Coding Agent - Testing Guide

## What We Built

The **Coding Agent** is a Mini-Devin implementation with autonomous code generation, terminal execution, and self-correction loops!

---

## ✅ Features

### Backend
- **Self-Correction Loop**: 3-strike rule - tries to fix errors automatically ✅
- **Terminal Execution**: Runs Python, JavaScript, TypeScript, Bash ✅
- **Workspace Management**: Isolated file system for generated code ✅
- **Error Handling**: Graceful degradation with detailed logs ✅

### Frontend
- **Green Coding Node** with Code2 icon ✅
- **Language Selector**: Python, JavaScript, TypeScript, Bash ✅
- **Requirements Input**: Multi-line specification ✅
- **Real-time Execution Logs** ✅

---

## 🚀 Quick Test

### 1. **Create a Simple Workflow**

```
Trigger → Coding Agent → Agent (Review)
```

### 2. **Configure the Coding Node**

Click the Coding node and set:

**Language:** `Python`

**Task Description:**
```
Write a script that calculates the Fibonacci sequence up to the 10th number and prints each number.
```

**Requirements:**
```
Add error handling
Include helpful comments
Print results line by line
```

### 3. **Run the Workflow**

Click **RUN** and watch the magic! 🎯

---

## 📊 Expected Output

```
[2026-01-19T06:00:12.000Z] 🚀 Starting workflow execution...
[2026-01-19T06:00:12.100Z] ⚡ Trigger activated
[2026-01-19T06:00:12.200Z] 💻 Coding Agent: Starting task...
[2026-01-19T06:00:12.300Z] 🔧 Language: python
[2026-01-19T06:00:12.400Z] 📝 Task: Write a script that calculates the Fibonacci sequence...
[2026-01-19T06:00:12.500Z] 📋 Requirements: 3 specified
[2026-01-19T06:00:13.000Z] [Coding Agent] Starting task: Write a script that calculates...
[2026-01-19T06:00:13.100Z] [Coding Agent] Language: python
[2026-01-19T06:00:13.200Z] [Coding Agent] Generating code...
[2026-01-19T06:00:17.800Z] [Coding Agent] Code saved to: generated_1705656017800.py
[2026-01-19T06:00:17.900Z] [Coding Agent] Attempt 1/3: Running code...
[2026-01-19T06:00:18.100Z] [Executor] Running: python3 generated_1705656017800.py
[2026-01-19T06:00:18.500Z] [Output] 0
1
1
2
3
5
8
13
21
34
[2026-01-19T06:00:18.600Z] [Coding Agent] ✅ Code executed successfully!
[2026-01-19T06:00:18.700Z] ✅ Code executed successfully after 0 attempt(s)
[2026-01-19T06:00:18.800Z] 📦 Generated 15 lines of code
```

---

## 🧪 Advanced Tests

### Test 1: Self-Correction (Intentional Error)

**Task:**
```
Write a Python script that divides 100 by a number from user input
```

**What happens:**
1. First attempt: Code uses `input()` which fails in non-interactive mode
2. Agent detects error: "EOF when reading a line"
3. Self-corrects: Removes `input()`, uses hardcoded value
4. Second attempt: Success! ✅

### Test 2: JavaScript File Manipulation

**Language:** `JavaScript`

**Task:**
```
Create a JSON file with data about 5 programming languages and their file extensions. Then read it back and print each language.
```

**Requirements:**
```
Use async/await
Handle file system errors
Pretty-print the JSON
```

**Expected:** Creates `languages.json`, writes data, reads it back, prints each entry.

### Test 3: TypeScript Type Safety

**Language:** `TypeScript`

**Task:**
```
Create an interface for a User with name, email, and age. Then create a function that validates user data and returns true/false.
```

**Expected:** Generates TypeScript with proper types, compiles with `ts-node`, executes validation logic.

### Test 4: Bash Script

**Language:** `Bash`

**Task:**
```
Create a bash script that creates 3 directories named "test1", "test2", "test3" and echo a success message
```

**Expected:** Executes shell commands safely.

---

## 🎨 Example Workflows

### Workflow 1: Code → Review → Improve

```
Coding Agent (Python)
Task: "Generate a function to validate email addresses"
    ↓
Agent (Code Reviewer)
Prompt: "Review the code and suggest improvements"
    ↓
Coding Agent (Python)
Task: "Improve the email validator based on suggestions"
```

### Workflow 2: Vision → Coding

```
Vision Analyzer
Image: Screenshot of a UI
    ↓
Coding Agent (JavaScript)
Task: "Generate HTML/CSS to replicate this layout"
    ↓
Agent (QA)
Prompt: "Compare generated HTML to original design"
```

### Workflow 3: Full Autonomous Development

```
Agent (Product Manager)
"Define requirements for a todo list API"
    ↓
Coding Agent (Python)
"Generate Flask API with CRUD endpoints"
    ↓
Coding Agent (JavaScript)
"Generate frontend UI to consume the API"
    ↓
Agent (QA Engineer)
"Review and create test cases"
```

---

## ⚙️ How Self-Correction Works

### The 3-Strike Rule

```python
Attempt 1: Generate code → Run → Error?
    ↓ (if error)
Attempt 2: Self-correct → Run → Error?
    ↓ (if error)
Attempt 3: Self-correct again → Run → Error?
    ↓ (if still error)
Fail gracefully, provide partial code to user
```

### Example Self-Correction Cycle

**Attempt 1:**
```python
# Generated code
result = 10 / 0  # Division by zero!
```

**Error:**
```
ZeroDivisionError: division by zero
```

**Attempt 2 (Self-Corrected):**
```python
try:
    result = 10 / 0
except ZeroDivisionError:
    result = None
    print("Cannot divide by zero")
```

**Result:** ✅ Success!

---

## ⚠️ Limitations & Safeguards

### Security
- ✅ **10-second timeout** - No infinite loops
- ✅ **Isolated workspace** - Cannot access parent directories
- ✅ **1MB output limit** - Prevents memory exhaustion
- ⚠️ **No network access recommended** - Use Docker for full sandboxing (future)

### Language Support
| Language | Status | Notes |
|----------|--------|-------|
| Python | ✅ Full | Requires `python3` |
| JavaScript | ✅ Full | Requires `node` |
| TypeScript | ✅ Full | Requires `npx ts-node` |
| Bash | ✅ Full | Built-in |
| Go | ❌ Not yet | Add to `commands` map |
| Rust | ❌ Not yet | Add to `commands` map |

### Known Issues
1. **Interactive input doesn't work** (e.g., `input()` in Python)
   - **Solution:** Agent learns to avoid after first failure
   
2. **Large file operations may timeout**
   - **Solution:** Increase timeout for specific tasks
   
3. **External dependencies not installed**
   - **Solution:** Add `pip install`, `npm install` to task description

---

## 💡 Pro Tips

### Tip 1: Be Specific

**Bad:**
```
Write some Python code
```

**Good:**
```
Write a Python function that validates email addresses using regex. 
Include test cases for valid and invalid emails.
```

### Tip 2: Use Requirements Wisely

```
Handle all edge cases
Add type hints
Include docstrings
Log errors to stderr
Return exit code 0 on success
```

### Tip 3: Chain Coding Agents

```
Coding Agent 1 (Python): Generate data processing script
    ↓
Coding Agent 2 (Python): Generate unit tests for the script
    ↓
Coding Agent 3 (Bash): Generate deployment script
```

---

## 📁 Workspace Structure

```
coding-workspace/
├── generated_1705656017800.py
├── generated_1705656018900.js
├── generated_1705656019200.ts
└── generated_1705656020100.sh
```

**Auto-Cleanup:**
- Files older than 1 hour are automatically deleted
- Prevents disk space issues
- Call `/api/v1/coding-agent/clean-workspace` to manual cleanup

---

## 🔧 Troubleshooting

### Error: "Command not found: python3"
**Fix:** Install Python 3:
```bash
brew install python3  # macOS
```

### Error: "Command not found: ts-node"
**Fix:** Install globally:
```bash
npm install -g ts-node typescript
```

### Error: "Execution timeout"
**Fix:** Task is too complex. Break it into smaller steps or increase timeout in code.

### Code generates but doesn't run
**Check logs:** The agent provides detailed stderr output
**Common cause:** Syntax errors the LLM didn't catch

---

## 🎯 Next Steps

Now that Coding Agent works, combine it with Vision:

### Ultimate Workflow: "Clone a Website"

```
Vision Analyzer
Image: Competitor website screenshot
Analysis: UI Audit
    ↓
Coding Agent (HTML/CSS)
Task: "Generate HTML/CSS matching the analyzed design"
    ↓
Vision Analyzer  
Image: Screenshot of generated HTML
Analysis: Compare to original
    ↓
Agent (QA)
Prompt: "Are they visually identical? What's different?"
```

**Result:** Fully autonomous website cloning! 🚀

---

**The Coding Agent is live! Start building! 💻**
