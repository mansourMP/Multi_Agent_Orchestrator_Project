import { Injectable } from '@nestjs/common';
import { LlmService } from '../ai/llm.service';

export interface ResearchResult {
    success: boolean;
    topic: string;
    summary: string;
    keyFindings: string[];
    sources: Array<{ title: string; url: string; relevance: string }>;
    trendAnalysis?: {
        trending: boolean;
        momentum: 'rising' | 'stable' | 'declining';
        signals: string[];
    };
    recommendations: string[];
    rawData?: any;
}

@Injectable()
export class ResearchAgentService {
    constructor(private llm: LlmService) { }

    /**
     * Research a topic using web search and LLM synthesis
     */
    async researchTopic(spec: {
        topic: string;
        depth: 'quick' | 'standard' | 'deep';
        focus?: 'general' | 'trends' | 'competitors' | 'technical';
        context?: string;
    }): Promise<ResearchResult> {
        const logs: string[] = [];

        logs.push(`[Research Agent] Topic: ${spec.topic}`);
        logs.push(`[Research Agent] Depth: ${spec.depth}`);
        logs.push(`[Research Agent] Focus: ${spec.focus || 'general'}`);

        try {
            // Step 1: Generate research queries
            const queries = await this.generateSearchQueries(spec);
            logs.push(`[Research Agent] Generated ${queries.length} search queries`);

            // Step 2: Simulate web search (in production, use real API)
            const searchResults = await this.simulateWebSearch(queries, spec.depth);
            logs.push(`[Research Agent] Found ${searchResults.length} relevant sources`);

            // Step 3: Synthesize findings
            const synthesis = await this.synthesizeFindings(searchResults, spec);
            logs.push(`[Research Agent] Synthesized ${synthesis.keyFindings.length} key findings`);

            // Step 4: Trend analysis (if applicable)
            let trendAnalysis;
            if (spec.focus === 'trends') {
                trendAnalysis = await this.analyzeTrends(searchResults, spec.topic);
                logs.push(`[Research Agent] Trend momentum: ${trendAnalysis.momentum}`);
            }

            return {
                success: true,
                topic: spec.topic,
                summary: synthesis.summary,
                keyFindings: synthesis.keyFindings,
                sources: searchResults.map(r => ({
                    title: r.title,
                    url: r.url,
                    relevance: r.relevance
                })),
                trendAnalysis,
                recommendations: synthesis.recommendations,
                rawData: { logs }
            };

        } catch (error) {
            return {
                success: false,
                topic: spec.topic,
                summary: `Research failed: ${error.message}`,
                keyFindings: [],
                sources: [],
                recommendations: ['Retry with different search terms', 'Check API availability'],
                rawData: { logs, error: error.message }
            };
        }
    }

    /**
     * Generate optimized search queries
     */
    private async generateSearchQueries(spec: {
        topic: string;
        depth: string;
        focus?: string;
    }): Promise<string[]> {
        const queryCount = {
            quick: 3,
            standard: 5,
            deep: 8
        };

        const systemPrompt = `You are a research strategist. Generate search queries.`;

        const userPrompt = `Topic: ${spec.topic}
Focus: ${spec.focus || 'general'}
Depth: ${spec.depth}

Generate ${queryCount[spec.depth as keyof typeof queryCount]} diverse search queries to research this topic thoroughly.

Return ONLY a JSON array of strings, no explanations.
Example: ["query 1", "query 2", "query 3"]`;

        const response = await this.llm.generateCompletion(userPrompt, systemPrompt, 'gpt-4') || '[]';

        try {
            // Extract JSON from response
            const jsonMatch = response.match(/\[[\s\S]*\]/);
            if (jsonMatch) {
                return JSON.parse(jsonMatch[0]);
            }
            return [spec.topic]; // Fallback
        } catch {
            return [spec.topic]; // Fallback
        }
    }

    /**
     * Simulate web search results (replace with real API in production)
     */
    private async simulateWebSearch(
        queries: string[],
        depth: string
    ): Promise<Array<{
        title: string;
        url: string;
        snippet: string;
        relevance: string;
        date?: string;
    }>> {
        // In production, call real search APIs:
        // - Google Custom Search API
        // - Bing Search API
        // - Perplexity API
        // - Tavily API

        const resultsPerQuery = {
            quick: 3,
            standard: 5,
            deep: 10
        };

        const count = resultsPerQuery[depth as keyof typeof resultsPerQuery];

        // Simulate diverse results
        const results = [];
        for (let i = 0; i < queries.length; i++) {
            for (let j = 0; j < count; j++) {
                results.push({
                    title: `Result ${j + 1} for: ${queries[i]}`,
                    url: `https://example.com/article-${i}-${j}`,
                    snippet: `This article discusses ${queries[i]} with insights on current trends, best practices, and future outlook. Key points include market analysis and expert opinions.`,
                    relevance: j < 2 ? 'high' : j < 4 ? 'medium' : 'low',
                    date: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString()
                });
            }
        }

        // Filter to high/medium relevance
        return results.filter(r => r.relevance !== 'low');
    }

    /**
     * Synthesize findings using LLM
     */
    private async synthesizeFindings(
        results: Array<{ title: string; snippet: string; url: string }>,
        spec: any
    ): Promise<{
        summary: string;
        keyFindings: string[];
        recommendations: string[];
    }> {
        const systemPrompt = `You are a research synthesizer. Analyze sources and extract insights.`;

        const userPrompt = `Topic: ${spec.topic}
${spec.context ? `Context: ${spec.context}\n` : ''}

Research Sources:
${results.map((r, i) => `${i + 1}. ${r.title}\n   ${r.snippet}\n   URL: ${r.url}`).join('\n\n')}

Provide:
1. A concise 2-3 sentence summary
2. 5-8 key findings (bullet points)
3. 3-5 actionable recommendations

Format as JSON:
{
  "summary": "...",
  "keyFindings": ["finding 1", "finding 2", ...],
  "recommendations": ["rec 1", "rec 2", ...]
}`;

        const response = await this.llm.generateCompletion(userPrompt, systemPrompt, 'gpt-4') || '{}';

        try {
            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                return JSON.parse(jsonMatch[0]);
            }
        } catch { }

        // Fallback
        return {
            summary: `Research on ${spec.topic} from ${results.length} sources`,
            keyFindings: results.slice(0, 5).map(r => r.title),
            recommendations: ['Review sources', 'Conduct deeper analysis']
        };
    }

    /**
     * Analyze trends in search results
     */
    private async analyzeTrends(
        results: Array<{ title: string; snippet: string; date?: string }>,
        topic: string
    ): Promise<{
        trending: boolean;
        momentum: 'rising' | 'stable' | 'declining';
        signals: string[];
    }> {
        const systemPrompt = `You are a trend analyst.`;

        const userPrompt = `Topic: ${topic}

Recent Articles:
${results.slice(0, 10).map((r, i) => `${i + 1}. [${r.date?.substring(0, 10) || 'recent'}] ${r.title}\n   ${r.snippet.substring(0, 150)}...`).join('\n\n')}

Analyze if this topic is trending:
1. Is it currently trending? (yes/no)
2. Momentum? (rising/stable/declining)
3. What are the trend signals? (3-5 points)

Format as JSON:
{
  "trending": true/false,
  "momentum": "rising" | "stable" | "declining",
  "signals": ["signal 1", "signal 2", ...]
}`;

        const response = await this.llm.generateCompletion(userPrompt, systemPrompt, 'gpt-4') || '{}';

        try {
            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                return JSON.parse(jsonMatch[0]);
            }
        } catch { }

        // Fallback
        return {
            trending: false,
            momentum: 'stable',
            signals: ['Insufficient data for trend analysis']
        };
    }

    /**
     * Competitor research (specialized research type)
     */
    async researchCompetitor(spec: {
        companyName: string;
        aspects: Array<'pricing' | 'features' | 'marketing' | 'technology' | 'reviews'>;
    }): Promise<ResearchResult> {
        const topic = `${spec.companyName} ${spec.aspects.join(' ')} analysis`;

        return this.researchTopic({
            topic,
            depth: 'deep',
            focus: 'competitors',
            context: `Researching competitor: ${spec.companyName}. Focus on: ${spec.aspects.join(', ')}`
        });
    }

    /**
     * Market research
     */
    async researchMarket(spec: {
        industry: string;
        region?: string;
        timeframe?: string;
    }): Promise<ResearchResult> {
        const topic = `${spec.industry} market ${spec.region || 'global'} ${spec.timeframe || 'current trends'}`;

        return this.researchTopic({
            topic,
            depth: 'deep',
            focus: 'trends',
            context: `Market research for ${spec.industry} industry`
        });
    }
}
