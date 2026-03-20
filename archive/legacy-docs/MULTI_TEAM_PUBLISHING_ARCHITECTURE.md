# 🚀 AgentForge Multi-Team Publishing Platform - Complete Architecture

## 📋 Table of Contents
1. [Vision & Overview](#vision--overview)
2. [System Architecture](#system-architecture)
3. [Team Structures](#team-structures)
4. [Database Schema](#database-schema)
5. [Platform Integrations](#platform-integrations)
6. [Implementation Guide](#implementation-guide)
7. [Workflow Examples](#workflow-examples)
8. [API Reference](#api-reference)

---

## 🎯 Vision & Overview

### The Big Idea
Transform AgentForge into an **AI-powered marketing agency** where specialized agent teams collaborate to create and publish content across multiple social platforms (Instagram, TikTok, YouTube, Telegram, etc.).

### Key Concepts
- **Multi-Team Organization**: Separate teams for CEO, Design, Content, Marketing, and Research
- **Inter-Team Communication**: Teams hand off work to each other via workflows
- **Platform Publishing**: Direct API integrations to social media platforms
- **Autonomous Collaboration**: AI agents work together without human intervention (except approval nodes)

### Architecture Diagram
```
┌─────────────────────────────────────────────────────────────────────┐
│                     AgentForge Platform                             │
│                                                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐            │
│  │   CEO Team   │→ │  Design Team │→ │ Content Team │            │
│  │              │  │              │  │              │            │
│  │ • Strategy   │  │ • Art Dir    │  │ • Copywriter │            │
│  │ • Decision   │  │ • Image Gen  │  │ • Scripter   │            │
│  │ • KPI Track  │  │ • Video Edit │  │ • Hashtags   │            │
│  └──────────────┘  └──────────────┘  └──────────────┘            │
│         ↓                  ↓                  ↓                    │
│  ┌──────────────┐  ┌──────────────────────────────────────┐      │
│  │Marketing Team│  │     Research & Intelligence           │      │
│  │              │  │                                        │      │
│  │ • Scheduler  │  │ • Trend Scanner • Competitor Analysis │      │
│  │ • A/B Test   │  │ • Platform Watcher • Audience Insights│      │
│  │ • Publisher  │  └──────────────────────────────────────┘      │
│  └──────────────┘                                                 │
│         ↓                                                          │
│  ┌────────────────────────────────────────────────────────┐      │
│  │           Social Media Publishing Layer                │      │
│  │  Instagram | TikTok | YouTube | Telegram | Twitter    │      │
│  └────────────────────────────────────────────────────────┘      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 🏢 Team Structures

### 1. CEO/Strategy Team
**Purpose**: High-level decisions, campaign direction, performance monitoring

**Agents**:
- **Strategy Director** - Market analysis, objective setting
  - Model: GPT-4
  - Prompt: "You are a strategic marketing director. Analyze performance data and set campaign objectives."
  
- **Decision Router** - Routes work to appropriate teams
  - Model: GPT-4
  - Prompt: "Route incoming requests to the correct team based on task type."
  
- **KPI Monitor** - Tracks metrics across platforms
  - Model: GPT-3.5
  - Prompt: "Monitor KPIs and alert when thresholds are breached."

**Workflow Example**:
```
Trigger (Weekly Review - Schedule: Mon 9AM)
  ↓
Agent (KPI Monitor): "Pull metrics from all platforms"
  ↓
Agent (Strategy Director): "Analyze performance, identify trends"
  ↓
Logic: Overall performance > target?
  ├─ TRUE → Agent: "Scale successful campaigns"
  └─ FALSE → Agent: "Recommend pivots"
  ↓
Handoff to Design Team (for new creative direction)
```

---

### 2. Design/Vision Team
**Purpose**: Visual content creation, brand consistency

**Agents**:
- **Art Director** - Visual concepts and themes
- **Image Generator** - DALL-E/Midjourney integration
- **Video Editor** - Video assembly and effects
- **Brand Guardian** - Ensures visual consistency

**Tools Integration**:
- OpenAI DALL-E 3 API
- Midjourney API (webhook)
- Runway Gen-2 (video)
- Canva API (templates)

**Workflow Example**:
```
Input from CEO: "Create engaging visuals for fitness niche"
  ↓
Agent (Art Director): "Design 3 concept variations for Instagram carousel"
  ↓
Parallel Split
  ├─ Tool (DALL-E): Generate Concept 1 (motivational quote + gym)
  ├─ Tool (DALL-E): Generate Concept 2 (before/after transformation)
  └─ Tool (DALL-E): Generate Concept 3 (workout routine infographic)
  ↓ (Auto-merge results)
Approval Node: Human selects best design
  ↓
Agent (Brand Guardian): "Apply brand colors and logo"
  ↓
Handoff to Content Team
```

---

### 3. Content Creation Team
**Purpose**: Writing, scripting, captions, hashtags

**Agents**:
- **Copywriter** - Engaging captions and hooks
  - Prompt: "Write viral Instagram captions with strong hooks"
  
- **Script Writer** - Video scripts and voiceovers
  - Prompt: "Create TikTok scripts with 3-second hooks"
  
- **Hashtag Researcher** - Trending tags per platform
  - Prompt: "Find 30 trending hashtags for [niche]"
  
- **Localization Agent** - Adapt content for regions
  - Prompt: "Adapt this content for Spanish-speaking audiences"

**Workflow Example**:
```
Input from Design: [3 Instagram carousel images]
  ↓
Agent (Copywriter): "Write 5 caption variations optimized for engagement"
  ↓
Agent (Hashtag Researcher): "Find 30 trending fitness hashtags"
  ↓
Logic: Platform = TikTok?
  ├─ TRUE → Agent (Script Writer): "Create 15-second hook script"
  └─ FALSE → Pass through
  ↓
Tool (Combine Assets): Package image + caption + hashtags
  ↓
Handoff to Marketing Team
```

---

### 4. Marketing/Distribution Team
**Purpose**: Publishing, scheduling, A/B testing, engagement

**Agents**:
- **Scheduler** - Optimal posting times
  - Uses historical data to determine best times per platform
  
- **A/B Tester** - Tests multiple variations
  - Publishes 2-3 versions, tracks performance
  
- **Engagement Monitor** - AI comment responses
  - Monitors and replies to comments/DMs
  
- **Cross-Promoter** - Repurposes content
  - Adapts Instagram post → TikTok video → YouTube Short

**Platform APIs**:
- Instagram Graph API
- TikTok API for Business
- YouTube Data API v3
- Telegram Bot API
- Twitter/X API v2
- Facebook Graph API

**Workflow Example**:
```
Input from Content: [Final post package]
  ↓
Agent (Scheduler): "Determine best posting time for each platform"
  ↓
Parallel Split (Multi-Platform Publishing)
  ├─ Tool (Instagram API): POST carousel
  ├─ Tool (TikTok API): Upload video
  ├─ Tool (YouTube API): Publish short
  └─ Tool (Telegram API): Send to channel
  ↓ (Monitor for 24 hours)
Agent (Engagement Monitor): "Respond to first 100 comments with AI"
  ↓
Agent (Performance Tracker): "Log results to database"
  ↓
If engagement < threshold → Alert CEO Team
```

---

### 5. Research/Intelligence Team
**Purpose**: Competitive analysis, trend detection

**Agents**:
- **Trend Scanner** - Monitors trending topics
- **Competitor Analyst** - Tracks competitor strategies
- **Platform Watcher** - Detects algorithm changes
- **Audience Insights** - Demographic analysis

**Data Sources**:
- Google Trends API
- Social media scraping (via Apify/Bright Data)
- Platform analytics APIs
- Reddit/Twitter trend monitoring

**Workflow Example**:
```
Trigger (Daily at 6 AM)
  ↓
Parallel Split
  ├─ Agent (TikTok Scanner): Scrape trending hashtags
  ├─ Agent (Instagram Insights): Pull competitor engagement rates
  ├─ Agent (YouTube Analytics): Track viral video patterns
  └─ Agent (Reddit Monitor): Identify emerging topics
  ↓ (Merge insights)
Agent (Research Synthesizer): "Generate daily intelligence report"
  ↓
Tool (Email/Slack): Send report to CEO Team
```

---

## 💾 Database Schema

### Teams Table
```prisma
model Team {
  id          String   @id @default(cuid())
  name        String   // "Marketing Team"
  description String?
  color       String   // "#8b5cf6" for visual identification
  icon        String?  // "📢" emoji
  type        TeamType // CEO, DESIGN, CONTENT, MARKETING, RESEARCH
  
  agents      Agent[]
  workflows   Workflow[]
  
  organizationId String
  organization   Organization @relation(fields: [organizationId], references: [id])
  
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}

enum TeamType {
  CEO
  DESIGN
  CONTENT
  MARKETING
  RESEARCH
}
```

### Agents Table
```prisma
model Agent {
  id           String   @id @default(cuid())
  name         String   // "Art Director"
  role         String   // "design", "content", "marketing"
  systemPrompt String   @db.Text
  model        String   @default("gpt-4")
  temperature  Float    @default(0.7)
  
  teamId       String?
  team         Team?    @relation(fields: [teamId], references: [id])
  
  specialty    String?  // "social_media_captions", "image_generation"
  capabilities Json?    // {"can_generate_images": true, "max_tokens": 4000}
  
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
}
```

### Platform Credentials Table
```prisma
model PlatformCredential {
  id              String   @id @default(cuid())
  platform        Platform
  accessToken     String   @db.Text
  refreshToken    String?  @db.Text
  expiresAt       DateTime?
  
  accountId       String?  // Platform-specific account ID
  accountName     String?  // Display name
  
  organizationId  String
  organization    Organization @relation(fields: [organizationId], references: [id])
  
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
}

enum Platform {
  INSTAGRAM
  TIKTOK
  YOUTUBE
  TELEGRAM
  TWITTER
  FACEBOOK
  LINKEDIN
}
```

### Published Content Table
```prisma
model PublishedContent {
  id              String   @id @default(cuid())
  platform        Platform
  platformPostId  String   // ID from the platform
  
  contentType     String   // "image", "video", "carousel", "reel"
  caption         String?  @db.Text
  mediaUrls       Json     // Array of image/video URLs
  hashtags        Json     // Array of hashtags
  
  metrics         Json?    // {"likes": 1250, "comments": 43, "shares": 12}
  
  workflowId      String?
  workflow        Workflow? @relation(fields: [workflowId], references: [id])
  
  publishedAt     DateTime
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
}
```

---

## 🔌 Platform Integrations

### Instagram Integration

**Setup**:
```bash
# .env
INSTAGRAM_ACCESS_TOKEN=your_token_here
INSTAGRAM_ACCOUNT_ID=your_account_id
```

**Service Implementation**:
```typescript
// backend/src/platforms/instagram.service.ts
import { Injectable } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class InstagramService {
  private readonly graphApiUrl = 'https://graph.facebook.com/v18.0';
  
  async publishCarousel(data: {
    images: string[];   // URLs to images
    caption: string;
    hashtags: string[];
  }) {
    const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN;
    const accountId = process.env.INSTAGRAM_ACCOUNT_ID;
    
    // Step 1: Create media containers for each image
    const mediaIds: string[] = [];
    for (const imageUrl of data.images) {
      const response = await axios.post(
        `${this.graphApiUrl}/${accountId}/media`,
        {
          image_url: imageUrl,
          is_carousel_item: true,
          access_token: accessToken,
        }
      );
      mediaIds.push(response.data.id);
    }
    
    // Step 2: Create carousel container
    const carouselResponse = await axios.post(
      `${this.graphApiUrl}/${accountId}/media`,
      {
        media_type: 'CAROUSEL',
        children: mediaIds.join(','),
        caption: `${data.caption}\n\n${data.hashtags.join(' ')}`,
        access_token: accessToken,
      }
    );
    
    // Step 3: Publish the carousel
    const publishResponse = await axios.post(
      `${this.graphApiUrl}/${accountId}/media_publish`,
      {
        creation_id: carouselResponse.data.id,
        access_token: accessToken,
      }
    );
    
    return {
      postId: publishResponse.data.id,
      platform: 'instagram',
      publishedAt: new Date(),
    };
  }
  
  async getPostInsights(postId: string) {
    const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN;
    
    const response = await axios.get(
      `${this.graphApiUrl}/${postId}/insights`,
      {
        params: {
          metric: 'engagement,impressions,reach,saved',
          access_token: accessToken,
        },
      }
    );
    
    return response.data.data;
  }
}
```

### TikTok Integration
```typescript
// backend/src/platforms/tiktok.service.ts
@Injectable()
export class TikTokService {
  async uploadVideo(data: {
    videoUrl: string;
    caption: string;
    hashtags: string[];
  }) {
    const accessToken = process.env.TIKTOK_ACCESS_TOKEN;
    
    // TikTok Content Posting API
    const response = await axios.post(
      'https://open.tiktokapis.com/v2/post/publish/video/init/',
      {
        post_info: {
          title: data.caption,
          privacy_level: 'SELF_ONLY', // or 'PUBLIC_TO_EVERYONE'
          disable_duet: false,
          disable_comment: false,
          disable_stitch: false,
          video_cover_timestamp_ms: 1000,
        },
        source_info: {
          source: 'FILE_UPLOAD',
          video_url: data.videoUrl,
        },
      },
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );
    
    return response.data;
  }
}
```

### YouTube Integration
```typescript
// backend/src/platforms/youtube.service.ts
@Injectable()
export class YouTubeService {
  async uploadShort(data: {
    videoPath: string;
    title: string;
    description: string;
    tags: string[];
  }) {
    const oauth2Client = this.getOAuthClient();
    const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
    
    const response = await youtube.videos.insert({
      part: ['snippet', 'status'],
      requestBody: {
        snippet: {
          title: data.title,
          description: data.description,
          tags: data.tags,
          categoryId: '22', // People & Blogs
        },
        status: {
          privacyStatus: 'public',
          selfDeclaredMadeForKids: false,
        },
      },
      media: {
        body: fs.createReadStream(data.videoPath),
      },
    });
    
    return response.data;
  }
}
```

### Telegram Integration
```typescript
// backend/src/platforms/telegram.service.ts
@Injectable()
export class TelegramService {
  private bot: TelegramBot;
  
  constructor() {
    this.bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN);
  }
  
  async sendToChannel(data: {
    channelId: string;
    message: string;
    imageUrl?: string;
  }) {
    if (data.imageUrl) {
      return this.bot.sendPhoto(
        data.channelId,
        data.imageUrl,
        { caption: data.message, parse_mode: 'Markdown' }
      );
    } else {
      return this.bot.sendMessage(
        data.channelId,
        data.message,
        { parse_mode: 'Markdown' }
      );
    }
  }
}
```

---

## 🛠️ Implementation Guide

### Step 1: Add New Node Types

#### Team Handoff Node
```tsx
// frontend/components/nodes/HandoffNode.tsx
import React, { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { ArrowRightLeft } from 'lucide-react';

const HandoffNode = ({ data, selected }: NodeProps) => {
  const teamColors = {
    ceo: '#8b5cf6',
    design: '#06b6d4',
    content: '#10b981',
    marketing: '#f59e0b',
    research: '#ef4444',
  };
  
  const targetColor = teamColors[data.targetTeam] || '#6b7280';
  
  return (
    <div style={{
      padding: '12px',
      borderRadius: '12px',
      border: `2px solid ${targetColor}`,
      background: `${targetColor}15`,
      minWidth: '180px',
    }}>
      <Handle type="target" position={Position.Left} />
      
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <ArrowRightLeft size={16} color={targetColor} />
        <div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Handoff to
          </div>
          <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>
            {data.targetTeam} Team
          </div>
        </div>
      </div>
      
      <Handle type="source" position={Position.Right} />
    </div>
  );
};

export default memo(HandoffNode);
```

#### Platform Publisher Node
```tsx
// frontend/components/nodes/PublisherNode.tsx
import React, { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { Send } from 'lucide-react';

const PublisherNode = ({ data, selected }: NodeProps) => {
  const platformIcons = {
    instagram: '📷',
    tiktok: '🎵',
    youtube: '▶️',
    telegram: '📱',
    twitter: '🐦',
  };
  
  return (
    <div style={{
      padding: '12px',
      borderRadius: '12px',
      border: '2px solid #f59e0b',
      background: 'rgba(245, 158, 11, 0.1)',
      minWidth: '200px',
    }}>
      <Handle type="target" position={Position.Left} />
      
      <div style={{ marginBottom: '8px' }}>
        <Send size={16} color="#f59e0b" />
        <span style={{ marginLeft: '8px', fontWeight: 600 }}>
          Publish
        </span>
      </div>
      
      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
        {(data.platforms || []).map(platform => (
          <span key={platform} style={{
            fontSize: '1.2rem',
            padding: '4px',
          }}>
            {platformIcons[platform]}
          </span>
        ))}
      </div>
      
      <Handle type="source" position={Position.Right} />
    </div>
  );
};

export default memo(PublisherNode);
```

### Step 2: Update Backend Execution Engine

```typescript
// backend/src/executions/executions.service.ts
// Add to runExecutionLoop

else if (currentNode.type === 'handoff') {
  logs.push(`[${new Date().toISOString()}] 🤝 Handing off to ${currentNode.data.targetTeam} Team`);
  
  // Find the target team's workflow
  const targetTeam = await this.prisma.team.findFirst({
    where: { type: currentNode.data.targetTeam.toUpperCase() },
    include: { workflows: true },
  });
  
  if (targetTeam && targetTeam.workflows.length > 0) {
    // Trigger the target team's intake workflow
    const intakeWorkflow = targetTeam.workflows.find(w => w.name.includes('Intake'));
    if (intakeWorkflow) {
      await this.executeWorkflow(intakeWorkflow.id, { 
        context: currentContext,
        sourceTeam: 'current', 
      });
    }
  }
}

else if (currentNode.type === 'publisher') {
  logs.push(`[${new Date().toISOString()}] 📢 Publishing to platforms...`);
  
  const platforms = currentNode.data.platforms || [];
  const publishPromises = platforms.map(async (platform: string) => {
    switch (platform) {
      case 'instagram':
        return this.instagramService.publishCarousel({
          images: currentNode.data.images,
          caption: currentNode.data.caption,
          hashtags: currentNode.data.hashtags,
        });
      case 'tiktok':
        return this.tiktokService.uploadVideo({
          videoUrl: currentNode.data.videoUrl,
          caption: currentNode.data.caption,
          hashtags: currentNode.data.hashtags,
        });
      case 'youtube':
        return this.youtubeService.uploadShort({
          videoPath: currentNode.data.videoPath,
          title: currentNode.data.title,
          description: currentNode.data.description,
          tags: currentNode.data.hashtags,
        });
      default:
        return null;
    }
  });
  
  const results = await Promise.all(publishPromises);
  logs.push(`[${new Date().toISOString()}] ✅ Published to ${results.length} platforms`);
  
  // Save to database
  for (const result of results) {
    if (result) {
      await this.prisma.publishedContent.create({
        data: {
          platform: result.platform.toUpperCase(),
          platformPostId: result.postId,
          contentType: 'carousel',
          caption: currentNode.data.caption,
          mediaUrls: currentNode.data.images,
          hashtags: currentNode.data.hashtags,
          workflowId: execution.workflowId,
          publishedAt: result.publishedAt,
        },
      });
    }
  }
}
```

### Step 3: Create Team Management UI

```tsx
// frontend/app/teams/page.tsx
'use client';
import { useState, useEffect } from 'react';
import { Users } from 'lucide-react';

interface Team {
  id: string;
  name: string;
  type: string;
  color: string;
  icon: string;
  agents: number;
  activeWorkflows: number;
}

export default function TeamsPage() {
  const [teams, setTeams] = useState<Team[]>([]);
  
  useEffect(() => {
    fetchTeams();
  }, []);
  
  async function fetchTeams() {
    const response = await fetch('/api/v1/teams');
    const data = await response.json();
    setTeams(data);
  }
  
  return (
    <div style={{ padding: '2rem' }}>
      <h1 style={{ fontSize: '2rem', marginBottom: '2rem' }}>
        Team Management
      </h1>
      
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
        gap: '1.5rem',
      }}>
        {[
          { name: 'CEO Team', type: 'ceo', color: '#8b5cf6', icon: '🎯', agents: 3 },
          { name: 'Design Team', type: 'design', color: '#06b6d4', icon: '🎨', agents: 4 },
          { name: 'Content Team', type: 'content', color: '#10b981', icon: '✍️', agents: 5 },
          { name: 'Marketing Team', type: 'marketing', color: '#f59e0b', icon: '📢', agents: 6 },
          { name: 'Research Team', type: 'research', color: '#ef4444', icon: '🔬', agents: 4 },
        ].map(team => (
          <div key={team.type} 
            className="glass-panel"
            style={{
              padding: '1.5rem',
              borderRadius: 'var(--radius-lg)',
              borderLeft: `4px solid ${team.color}`,
              cursor: 'pointer',
              transition: 'transform 0.2s',
            }}
            onMouseOver={e => e.currentTarget.style.transform = 'translateY(-4px)'}
            onMouseOut={e => e.currentTarget.style.transform = 'translateY(0)'}
          >
            <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>
              {team.icon}
            </div>
            <h3 style={{ marginBottom: '0.5rem' }}>{team.name}</h3>
            <div style={{ 
              color: 'var(--text-secondary)', 
              fontSize: '0.85rem',
              display: 'flex',
              gap: '1rem',
            }}>
              <span><Users size={14} /> {team.agents} agents</span>
              <span>🔄 Active</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

---

## 🎬 Workflow Examples

### Example 1: Product Launch Campaign

```
[CEO TEAM WORKFLOW]
Name: "Product Launch Strategy"

Trigger (Manual: New Product)
  ↓
Agent (Strategy Director):
  Prompt: "Analyze market and define launch strategy for [product_name]"
  Input: { product_name, target_audience, budget }
  Output: { campaign_goals, target_platforms, timeline }
  ↓
Logic: Budget > $10,000?
  ├─ TRUE → Set priority = HIGH
  └─ FALSE → Set priority = MEDIUM
  ↓
Handoff Node:
  Target: DESIGN
  Context: { campaign_goals, visual_direction }

[DESIGN TEAM WORKFLOW]
Name: "Design Team Intake"

Trigger (Handoff from CEO)
  ↓
Agent (Art Director):
  Prompt: "Create visual concept for [campaign_goals]"
  Output: { design_brief, color_palette, style_guide }
  ↓
Parallel Split:
  ├─ Tool (DALL-E): Generate hero image
  ├─ Tool (DALL-E): Generate carousel images (3x)
  └─ Tool (Canva API): Create Instagram story templates
  ↓ (Merge)
Approval Node: "Review Designs"
  ↓
Handoff Node:
  Target: CONTENT
  Context: { approved_designs, brand_voice }

[CONTENT TEAM WORKFLOW]
Name: "Content Creation Pipeline"

Trigger (Handoff from Design)
  ↓
Parallel Split:
  ├─ Agent (Instagram Copywriter):
      Prompt: "Write engaging carousel captions"
      Output: { captions: [5 variations] }
  ├─ Agent (TikTok Scripter):
      Prompt: "Create 15-second hook scripts"
      Output: { scripts: [3 variations] }
  ├─ Agent (YouTube Writer):
      Prompt: "Write product review script"
      Output: { script, youtube_description }
  └─ Agent (Hashtag Researcher):
      Prompt: "Find 30 trending hashtags for [niche]"
      Output: { hashtags: [...] }
  ↓ (Merge all outputs)
Tool (Package Content):
  Combine: designs + captions + hashtags
  ↓
Handoff Node:
  Target: MARKETING
  Context: { complete_content_packages }

[MARKETING TEAM WORKFLOW]
Name: "Multi-Platform Publishing"

Trigger (Handoff from Content)
  ↓
Agent (Scheduler):
  Prompt: "Determine optimal posting schedule"
  Output: { 
    instagram_time: "2024-01-20T18:00:00Z",
    tiktok_time: "2024-01-20T19:00:00Z",
    youtube_time: "2024-01-20T20:00:00Z"
  }
  ↓
Parallel Split (Scheduled Publishing):
  ├─ Publisher Node:
      Platform: Instagram
      Type: Carousel
      Schedule: {{ instagram_time }}
      
  ├─ Publisher Node:
      Platform: TikTok
      Type: Video
      Schedule: {{ tiktok_time }}
      
  ├─ Publisher Node:
      Platform: YouTube
      Type: Short
      Schedule: {{ youtube_time }}
      
  └─ Publisher Node:
      Platform: Telegram
      Type: Message
      Schedule: {{ instagram_time }}
  ↓
Agent (Engagement Monitor):
  Loop for 24 hours:
    - Check comments every 15 minutes
    - Generate AI responses
    - Track metrics
  ↓
Tool (Analytics Report):
  Generate performance dashboard
  ↓
Send to CEO Team (via email/Slack)
```

### Example 2: Daily Trend Research

```
[RESEARCH TEAM WORKFLOW]
Name: "Daily Intelligence Gathering"

Trigger (Schedule: Daily at 6 AM)
  ↓
Parallel Split (Multi-Source Scraping):
  ├─ Agent (TikTok Trend Scanner):
      Tool: TikTok API
      Output: { trending_hashtags, viral_sounds }
      
  ├─ Agent (Instagram Explorer):
      Tool: Instagram Graph API
      Output: { trending_reels, popular_formats }
      
  ├─ Agent (YouTube Analyzer):
      Tool: YouTube Data API
      Output: { trending_topics, video_patterns }
      
  ├─ Agent (Reddit Monitor):
      Tool: Reddit API
      Output: { rising_posts, community_sentiment }
      
  └─ Agent (Google Trends):
      Tool: Google Trends API
      Output: { search_queries, breakout_topics }
  ↓ (Merge all data)
Agent (Research Synthesizer):
  Prompt: "Analyze all trend data and generate actionable insights"
  Output: {
    top_3_trends: [...],
    recommended_content_angles: [...],
    competitor_activity: [...],
    algorithm_changes: [...]
  }
  ↓
Tool (Generate Report):
  Format: Markdown + Charts
  ↓
Parallel Split (Distribute):
  ├─ Tool (Email): Send to CEO team
  ├─ Tool (Slack): Post in #intelligence channel
  └─ Tool (Database): Store in knowledge base
```

---

## 📡 API Reference

### Teams API

**Get All Teams**
```http
GET /api/v1/teams
Authorization: Bearer {token}

Response:
{
  "teams": [
    {
      "id": "team_abc123",
      "name": "Marketing Team",
      "type": "MARKETING",
      "color": "#f59e0b",
      "agents": [...]
    }
  ]
}
```

**Create Team**
```http
POST /api/v1/teams
Authorization: Bearer {token}
Content-Type: application/json

{
  "name": "Growth Team",
  "type": "MARKETING",
  "color": "#8b5cf6",
  "icon": "📈"
}
```

### Platform Publishing API

**Publish to Instagram**
```http
POST /api/v1/platforms/instagram/publish
Authorization: Bearer {token}
Content-Type: application/json

{
  "type": "carousel",
  "images": [
    "https://example.com/image1.jpg",
    "https://example.com/image2.jpg"
  ],
  "caption": "Check out our new product! 🚀",
  "hashtags": ["#product", "#launch", "#tech"]
}

Response:
{
  "success": true,
  "postId": "ig_post_123",
  "url": "https://instagram.com/p/ABC123"
}
```

**Publish to TikTok**
```http
POST /api/v1/platforms/tiktok/publish
Content-Type: application/json

{
  "videoUrl": "https://example.com/video.mp4",
  "caption": "Viral trend alert! 🔥",
  "hashtags": ["#fyp", "#viral", "#trending"]
}
```

### Analytics API

**Get Content Performance**
```http
GET /api/v1/analytics/content/{contentId}

Response:
{
  "contentId": "content_123",
  "platform": "INSTAGRAM",
  "metrics": {
    "likes": 1250,
    "comments": 43,
    "shares": 12,
    "saves": 89,
    "reach": 15234,
    "impressions": 18901
  },
  "performance": "above_average",
  "insights": [
    "Peak engagement at 6 PM",
    "Strong female 18-24 demographic",
    "Hashtag #fitness performed best"
  ]
}
```

---

## 🚀 Next Steps

### Phase 1: Foundation (Week 1-2)
- [ ] Add Team and Agent database tables
- [ ] Create Team Management UI
- [ ] Build Handoff Node component
- [ ] Implement basic team-to-team workflow

### Phase 2: Platform Integrations (Week 3-4)
- [ ] Instagram API integration
- [ ] TikTok API integration
- [ ] YouTube API integration
- [ ] Publisher Node component

### Phase 3: Intelligence Layer (Week 5-6)
- [ ] Research Team workflows
- [ ] Trend detection agents
- [ ] Analytics dashboard
- [ ] Performance tracking

### Phase 4: Production & Optimization (Week 7-8)
- [ ] A/B testing framework
- [ ] Automated scheduling
- [ ] Comment AI responses
- [ ] Cross-platform optimization

---

## 📚 Resources

### API Documentation
- [Instagram Graph API](https://developers.facebook.com/docs/instagram-api)
- [TikTok Content Posting API](https://developers.tiktok.com/doc/content-posting-api-get-started)
- [YouTube Data API](https://developers.google.com/youtube/v3)
- [Telegram Bot API](https://core.telegram.org/bots/api)

### Tools & Libraries
- OpenAI API (GPT-4, DALL-E 3)
- Prisma ORM
- React Flow
- Axios / Fetch API

---

**This architecture is 100% feasible with your current AgentForge platform!**
