import { Injectable } from '@nestjs/common';
import OpenAI from 'openai';

export interface VisionAnalysisResult {
    analysis: string;
    insights: string[];
    suggestions: string[];
    detectedElements?: {
        buttons: Array<{ text: string; position: string }>;
        forms: Array<{ type: string; fields: string[] }>;
        issues: string[];
    };
}

@Injectable()
export class VisionService {
    private openai: OpenAI;

    constructor() {
        this.openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY,
        });
    }

    /**
     * Analyze a screenshot using GPT-4 Vision
     */
    async analyzeScreenshot(
        imageUrl: string,
        task: string,
        analysisType: 'ui-audit' | 'competitor-analysis' | 'accessibility' | 'general' = 'general'
    ): Promise<VisionAnalysisResult> {
        const prompts = {
            'ui-audit': `You are a UI/UX expert. Analyze this screenshot and provide:
1. Design quality assessment (1-10)
2. Identified UI issues (alignment, spacing, colors, typography)
3. Accessibility problems
4. Conversion optimization suggestions
5. Mobile responsiveness concerns`,

            'competitor-analysis': `You are a competitive intelligence analyst. Analyze this competitor's website:
1. Main value propositions
2. Pricing strategy (if visible)
3. Key features highlighted
4. Target audience
5. Design strengths/weaknesses
6. Call-to-action effectiveness`,

            'accessibility': `You are an accessibility expert (WCAG 2.1). Review this interface:
1. Color contrast issues
2. Missing alt text or labels
3. Keyboard navigation problems
4. Screen reader compatibility issues
5. ARIA implementation gaps
6. Overall WCAG compliance score`,

            'general': task
        };

        const response = await this.openai.chat.completions.create({
            model: 'gpt-4-vision-preview',
            messages: [
                {
                    role: 'user',
                    content: [
                        {
                            type: 'text',
                            text: prompts[analysisType],
                        },
                        {
                            type: 'image_url',
                            image_url: {
                                url: imageUrl,
                                detail: 'high', // Use high detail for better analysis
                            },
                        },
                    ],
                },
            ],
            max_tokens: 2000,
            temperature: 0.7,
        });

        const analysisText = response.choices[0].message.content || '';

        // Parse the response into structured data
        return this.parseVisionResponse(analysisText);
    }

    /**
     * Analyze multiple screenshots in sequence (workflow analysis)
     */
    async analyzeWorkflow(
        screenshots: Array<{ url: string; step: string }>,
        goal: string
    ): Promise<{
        overallAssessment: string;
        stepAnalysis: Array<{ step: string; analysis: string; issues: string[] }>;
        recommendations: string[];
    }> {
        const stepAnalysis = [];

        for (const screenshot of screenshots) {
            const result = await this.analyzeScreenshot(
                screenshot.url,
                `Analyze this ${screenshot.step} in the context of: ${goal}`,
                'general'
            );

            stepAnalysis.push({
                step: screenshot.step,
                analysis: result.analysis,
                issues: result.insights,
            });

            // Rate limit: Wait 1 second between requests
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        // Generate overall assessment
        const overallPrompt = `Based on these workflow steps: ${stepAnalysis.map(s => s.step).join(' → ')}, provide an overall UX assessment and key recommendations.`;

        const overallResponse = await this.openai.chat.completions.create({
            model: 'gpt-4-turbo-preview',
            messages: [
                {
                    role: 'system',
                    content: 'You are a UX consultant providing strategic recommendations.',
                },
                {
                    role: 'user',
                    content: overallPrompt + '\n\nStep analysis:\n' + JSON.stringify(stepAnalysis, null, 2),
                },
            ],
            max_tokens: 1000,
        });

        return {
            overallAssessment: overallResponse.choices[0].message.content || '',
            stepAnalysis,
            recommendations: this.extractRecommendations(overallResponse.choices[0].message.content || ''),
        };
    }

    /**
     * Compare two screenshots (before/after, A/B testing)
     */
    async compareScreenshots(
        imageUrl1: string,
        imageUrl2: string,
        comparisonGoal: string
    ): Promise<{
        differences: string[];
        recommendation: string;
        winner?: 'A' | 'B' | 'tie';
    }> {
        const response = await this.openai.chat.completions.create({
            model: 'gpt-4-vision-preview',
            messages: [
                {
                    role: 'user',
                    content: [
                        {
                            type: 'text',
                            text: `Compare these two screenshots. Goal: ${comparisonGoal}
              
Identify:
1. Visual differences
2. Which version better achieves the goal
3. Specific improvements in version B
4. Any regressions in version B
5. Final recommendation (A, B, or tie)`,
                        },
                        {
                            type: 'image_url',
                            image_url: { url: imageUrl1, detail: 'high' },
                        },
                        {
                            type: 'image_url',
                            image_url: { url: imageUrl2, detail: 'high' },
                        },
                    ],
                },
            ],
            max_tokens: 1500,
        });

        const comparisonText = response.choices[0].message.content || '';

        return {
            differences: this.extractListItems(comparisonText, 'differences'),
            recommendation: comparisonText,
            winner: this.determineWinner(comparisonText),
        };
    }

    /**
     * Extract structured data from vision response
     */
    private parseVisionResponse(text: string): VisionAnalysisResult {
        const insights: string[] = [];
        const suggestions: string[] = [];

        // Extract numbered lists or bullet points
        const lines = text.split('\n');
        for (const line of lines) {
            if (line.match(/^\d+\.|^-|^•/)) {
                if (line.toLowerCase().includes('suggest') || line.toLowerCase().includes('recommend')) {
                    suggestions.push(line.replace(/^\d+\.|^-|^•/, '').trim());
                } else {
                    insights.push(line.replace(/^\d+\.|^-|^•/, '').trim());
                }
            }
        }

        return {
            analysis: text,
            insights: insights.length > 0 ? insights : [text],
            suggestions: suggestions.length > 0 ? suggestions : [],
        };
    }

    private extractRecommendations(text: string): string[] {
        const recommendations: string[] = [];
        const lines = text.split('\n');

        for (const line of lines) {
            if (line.match(/^\d+\.|^-|^•/) &&
                (line.toLowerCase().includes('recommend') ||
                    line.toLowerCase().includes('should') ||
                    line.toLowerCase().includes('consider'))) {
                recommendations.push(line.replace(/^\d+\.|^-|^•/, '').trim());
            }
        }

        return recommendations;
    }

    private extractListItems(text: string, section: string): string[] {
        const items: string[] = [];
        const lines = text.split('\n');
        let inSection = false;

        for (const line of lines) {
            if (line.toLowerCase().includes(section)) {
                inSection = true;
                continue;
            }

            if (inSection && line.match(/^\d+\.|^-|^•/)) {
                items.push(line.replace(/^\d+\.|^-|^•/, '').trim());
            } else if (inSection && line.trim() === '') {
                break;
            }
        }

        return items;
    }

    private determineWinner(text: string): 'A' | 'B' | 'tie' {
        const lowerText = text.toLowerCase();

        if (lowerText.includes('version b') && lowerText.includes('better')) {
            return 'B';
        } else if (lowerText.includes('version a') && lowerText.includes('better')) {
            return 'A';
        } else if (lowerText.includes('tie') || lowerText.includes('equal')) {
            return 'tie';
        }

        // Default to tie if unclear
        return 'tie';
    }
}
