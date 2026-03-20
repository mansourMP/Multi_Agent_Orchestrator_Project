# 🎯 Vision Node - Testing Guide

## What We Built

The **Vision Analyzer** node is now fully functional! It uses GPT-4 Vision to analyze screenshots and extract insights.

---

## ✅ What's Working

### Backend
- `VisionService` with GPT-4V integration ✅
- 4 analysis modes: UI Audit, Competitor Analysis, Accessibility, General ✅
- REST API endpoints ✅
- Integrated into execution engine ✅

### Frontend
- Purple Vision node in canvas ✅
- Node properties panel with 3 configurable fields ✅
- Real-time execution logs ✅

---

## 🚀 How to Test

### 1. **Create a Test Workflow**

Open http://localhost:3000/workflows/[id] and create this simple workflow:

```
[Trigger Node]
    ↓
[Vision Analyzer Node]
    ↓
[Agent Node]
```

###2. **Configure the Vision Node**

Click the Vision node and set:

**Image URL:**
```
https://screenshotone.com/api/screenshot?access_key=YOUR_KEY&url=https://stripe.com
```

Or use a public screenshot URL like:
```
https://www.apple.com/newsroom/images/product/iphone/standard/Apple-iPhone-14-Pro-iPhone-14-Pro-Max-hero-220907_Full-Bleed-Image.jpg.large.jpg
```

**Analysis Type:** `UI/UX Audit`

**Task Description:**
```
Analyze the design quality, identify UI issues, and suggest improvements for conversion optimization.
```

### 3. **Configure the Agent Node**

Set the Agent's system prompt to:
```
You are a product manager. Review the vision analysis and create an action plan based on the insights.
```

### 4. **Add Your OpenAI API Key**

Make sure `backend/.env` has:
```
OPENAI_API_KEY=sk-your-key-here
```

### 5. **Run the Workflow**

Click the **"Run"** button and watch the execution logs!

---

## 📊 Expected Output

You should see logs like:

```
[2026-01-19T05:55:12.000Z] 🚀 Starting workflow execution...
[2026-01-19T05:55:12.100Z] ⚡ Trigger activated
[2026-01-19T05:55:12.200Z] 👁️ Vision Analysis: Processing screenshot...
[2026-01-19T05:55:12.300Z] 📸 Image URL: https://example.com/screenshot.png
[2026-01-19T05:55:12.400Z] 🔍 Analysis Type: ui-audit
[2026-01-19T05:55:18.500Z] ✅ Vision Analysis Complete
[2026-01-19T05:55:18.600Z] 📊 Insights: 8 findings
[2026-01-19T05:55:18.700Z]   1. Design quality assessment: 7/10 - Professional layout with good use of white space
[2026-01-19T05:55:18.800Z]   2. Color contrast issues: Some text (#666666) on light backgrounds fails WCAG AA
[2026-01-19T05:55:18.900Z]   3. Call-to-action buttons are prominent but could be more visually distinct
[2026-01-19T05:55:19.000Z] 💾 Analysis stored in memory
[2026-01-19T05:55:19.100Z] 🤖 Agent "Product Manager" is thinking...
[2026-01-19T05:55:23.200Z] ✅ Agent Output: Based on the vision analysis, here's the action plan:

1. Immediate fixes:
   - Increase text contrast to meet WCAG AA standards
   - Add hover states to CTA buttons
   
2. Strategic improvements:
   - A/B test different CTA button colors
   - Add social proof elements above fold
   
3. Next steps:
   - Schedule design sprint for Q2
   - Implement analytics tracking
```

---

## 🎨 Analysis Types Explained

### 1. **General Analysis**
Generic screenshot analysis for any purpose.

**Use case:** "What's on this page?"

### 2. **UI/UX Audit** 
Comprehensive design review focused on:
- Design quality (1-10 score)
- UI issues (alignment, spacing, colors)
- Accessibility problems
- Conversion optimization
- Mobile responsiveness

**Use case:** Evaluate your own product's UI

### 3. **Competitor Analysis**
Business intelligence focused on:
- Value propositions
- Pricing strategy
- Key features
- Target audience-Design strengths/weaknesses
- CTA effectiveness

**Use case:** Research competitors

### 4. **Accessibility Check**
WCAG 2.1 compliance audit:
- Color contrast ratios
- Missing alt text
- Keyboard navigation
- Screen reader compatibility
- ARIA implementation

**Use case:** Ensure inclusive design

---

## 🔧 Advanced Usage

### Chaining Visions with Agents

**Workflow:**
```
Vision Node (UI Audit)
    ↓
Agent (Design Critic): "Prioritize the top 3 issues"
    ↓
Vision Node (Accessibility)
    ↓
Agent (Developer): "Generate CSS fixes for the accessibility issues"
```

### Using Previous Output as Image URL

**Workflow:**
```
Agent: "Generate a screenshot URL of Apple.com"
  Output: "https://screenshot-api.com/?url=apple.com"
    ↓
Vision Node (leave imageUrl empty)
  → Automatically uses Agent's output as the URL
```

---

## ⚠️ Troubleshooting

### Error: "Invalid image URL"
- **Fix:** Ensure URL starts with `http://` or `https://`
- URL must be publicly accessible (no localhost)

### Error: "API Error: 401"
- **Fix:** Check `OPENAI_API_KEY` in `.env`
- Restart backend: `npm run start:dev`

### No Vision logs appear
- **Fix:** Vision node must be connected to a Trigger
- Check console for errors: http://localhost:4000

### "Rate limit exceeded"
- **Fix:** OpenAI free tier has limits
- Add delays between workflow runs

---

## 💰 Cost Estimate

GPT-4 Vision pricing:
- **$0.01275 per image** (1024x1024, high detail)
- **$0.00765 per image** (512x512, low detail)

**Example monthly costs:**
- 100 analyses/month = **$1.28**
- 1,000 analyses/month = **$12.75**
- 10,000 analyses/month = **$127.50**

**Pro tip:** Use `analysisType: 'general'` with smaller images to reduce costs during development.

---

## 🚀 Next Steps

Now that Vision works, you can:

1. **Build a Competitor Monitoring Workflow**
   - Schedule: Daily at 9 AM
   - Vision: Analyze competitor homepage
   - Agent: Summarize changes
   - Tool: Send Slack notification

2. **Automate Design QA**
   - Trigger: New PR merged
   - Vision: Screenshot staging site
   - Agent: Compare to design spec
   - Approval: Designer reviews

3. **Create an Accessibility Scanner**
   - Vision: Screenshot each page
   - Agent: Aggregate issues
   - Tool: Create Jira tickets

---

**Vision is live! Start analyzing! 🎯**
