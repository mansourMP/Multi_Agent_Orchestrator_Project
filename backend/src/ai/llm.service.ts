import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';

interface LlmOptions {
    apiKey?: string;
    provider?: string;
}

type UsageInfo = {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    provider: string;
    model: string;
};

type CompletionResult = {
    text: string;
    usage?: UsageInfo;
};

@Injectable()
export class LlmService {
    private readonly logger = new Logger(LlmService.name);

    constructor(private configService: ConfigService) { }

    /**
     * Generate completion using any supported provider
     * Model format: "provider/model" (e.g., "openai/gpt-4", "anthropic/claude-3-opus")
     */
    async generateCompletion(
        prompt: string,
        systemPrompt?: string,
        model: string = 'gpt-4',
        options: LlmOptions = {}
    ): Promise<string> {
        const result = await this.generateCompletionWithUsage(prompt, systemPrompt, model, options);
        return result.text;
    }

    async generateCompletionWithUsage(
        prompt: string,
        systemPrompt?: string,
        model: string = 'gpt-4',
        options: LlmOptions = {}
    ): Promise<CompletionResult> {
        // Parse provider from model string (format: "provider/model" or just "model")
        let provider = options.provider || 'openai';
        let modelName = model;

        if (model.includes('/')) {
            const parts = model.split('/');
            provider = parts[0];
            modelName = parts.slice(1).join('/');
        }

        this.logger.log(`Generating completion with ${provider}/${modelName}`);

        // Route to appropriate provider
        switch (provider) {
            case 'openai':
                return this.generateOpenAICompletion(prompt, systemPrompt, modelName, options.apiKey);
            case 'anthropic':
                return this.generateClaudeCompletion(prompt, systemPrompt, modelName, options.apiKey);
            case 'google':
                return this.generateGoogleCompletion(prompt, systemPrompt, modelName, options.apiKey);
            case 'groq':
                return this.generateGroqCompletion(prompt, systemPrompt, modelName, options.apiKey);
            case 'together':
                return this.generateTogetherCompletion(prompt, systemPrompt, modelName, options.apiKey);
            case 'openrouter':
                return this.generateOpenRouterCompletion(prompt, systemPrompt, modelName, options.apiKey);
            default:
                // Fallback to OpenAI-compatible API
                return this.generateOpenAICompletion(prompt, systemPrompt, modelName, options.apiKey);
        }
    }

    private async generateOpenAICompletion(
        prompt: string,
        systemPrompt?: string,
        model: string = 'gpt-4',
        apiKey?: string
    ): Promise<CompletionResult> {
        const key = apiKey || this.configService.get('OPENAI_API_KEY');

        if (!key || key === 'your_openai_api_key_here') {
            this.logger.warn('OPENAI_API_KEY is missing. Returning simulated response.');
            return { text: this.simulateResponse(prompt, 'OpenAI') };
        }

        try {
            const openai = new OpenAI({
                apiKey: key,
                baseURL: this.configService.get('OPENAI_BASE_URL') || undefined
            });
            const response = await openai.chat.completions.create({
                model: model,
                messages: [
                    { role: 'system', content: systemPrompt || 'You are a helpful AI Agent.' },
                    { role: 'user', content: prompt }
                ],
                temperature: 0.7,
                max_tokens: 2000,
            });
            const usage = response.usage
                ? {
                    promptTokens: response.usage.prompt_tokens || 0,
                    completionTokens: response.usage.completion_tokens || 0,
                    totalTokens: response.usage.total_tokens || 0,
                    provider: 'openai',
                    model
                }
                : undefined;
            return {
                text: response.choices[0].message.content || '[No response]',
                usage
            };
        } catch (error: any) {
            this.logger.error(`OpenAI error: ${error.message}`);
            throw error;
        }
    }

    private async generateClaudeCompletion(
        prompt: string,
        systemPrompt?: string,
        model: string = 'claude-3-opus',
        apiKey?: string
    ): Promise<CompletionResult> {
        const key = apiKey || this.configService.get('ANTHROPIC_API_KEY');

        if (!key || key === 'your_anthropic_api_key_here') {
            this.logger.warn('ANTHROPIC_API_KEY is missing. Returning simulated response.');
            return { text: this.simulateResponse(prompt, 'Anthropic') };
        }

        try {
            const modelMap: Record<string, string> = {
                'claude-3-opus': 'claude-3-opus-20240229',
                'claude-3-sonnet': 'claude-3-sonnet-20240229',
                'claude-3-haiku': 'claude-3-haiku-20240307',
                'claude-3.5-sonnet': 'claude-3-5-sonnet-20241022',
            };
            const actualModel = modelMap[model] || model;

            const anthropic = new Anthropic({ apiKey: key }) as any;
            const response = await anthropic.messages.create({
                model: actualModel,
                max_tokens: 2000,
                system: systemPrompt || 'You are a helpful AI Agent.',
                messages: [{ role: 'user', content: prompt }],
            });

            const textContent = response.content?.find((c: any) => c.type === 'text');
            const usage = response.usage
                ? {
                    promptTokens: response.usage.input_tokens || 0,
                    completionTokens: response.usage.output_tokens || 0,
                    totalTokens: (response.usage.input_tokens || 0) + (response.usage.output_tokens || 0),
                    provider: 'anthropic',
                    model: actualModel
                }
                : undefined;
            return { text: textContent?.text || '[No response]', usage };
        } catch (error: any) {
            this.logger.error(`Anthropic error: ${error.message}`);
            throw error;
        }
    }

    private async generateGoogleCompletion(
        prompt: string,
        systemPrompt?: string,
        model: string = 'gemini-pro',
        apiKey?: string
    ): Promise<CompletionResult> {
        const key = apiKey || this.configService.get('GOOGLE_AI_API_KEY');

        if (!key) {
            return { text: this.simulateResponse(prompt, 'Google AI') };
        }

        try {
            // Google AI uses a REST API
            const response = await fetch(
                `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${key}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{
                            parts: [{ text: `${systemPrompt || ''}\n\n${prompt}` }]
                        }],
                        generationConfig: { temperature: 0.7, maxOutputTokens: 2000 }
                    })
                }
            );

            if (!response.ok) {
                throw new Error(`Google AI error: ${response.status}`);
            }

            const data = await response.json();
            return { text: data.candidates?.[0]?.content?.parts?.[0]?.text || '[No response]' };
        } catch (error: any) {
            this.logger.error(`Google AI error: ${error.message}`);
            throw error;
        }
    }

    private async generateGroqCompletion(
        prompt: string,
        systemPrompt?: string,
        model: string = 'llama-3-70b-8192',
        apiKey?: string
    ): Promise<CompletionResult> {
        const key = apiKey || this.configService.get('GROQ_API_KEY');

        if (!key) {
            return { text: this.simulateResponse(prompt, 'Groq') };
        }

        try {
            // Groq uses OpenAI-compatible API
            const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${key}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: model,
                    messages: [
                        { role: 'system', content: systemPrompt || 'You are a helpful AI Agent.' },
                        { role: 'user', content: prompt }
                    ],
                    temperature: 0.7,
                    max_tokens: 2000,
                })
            });

            if (!response.ok) {
                throw new Error(`Groq error: ${response.status}`);
            }

            const data = await response.json();
            return { text: data.choices?.[0]?.message?.content || '[No response]' };
        } catch (error: any) {
            this.logger.error(`Groq error: ${error.message}`);
            throw error;
        }
    }

    private async generateTogetherCompletion(
        prompt: string,
        systemPrompt?: string,
        model: string = 'meta-llama/Llama-3-70b-chat-hf',
        apiKey?: string
    ): Promise<CompletionResult> {
        const key = apiKey || this.configService.get('TOGETHER_API_KEY');

        if (!key) {
            return { text: this.simulateResponse(prompt, 'Together AI') };
        }

        try {
            const response = await fetch('https://api.together.xyz/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${key}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: model,
                    messages: [
                        { role: 'system', content: systemPrompt || 'You are a helpful AI Agent.' },
                        { role: 'user', content: prompt }
                    ],
                    temperature: 0.7,
                    max_tokens: 2000,
                })
            });

            if (!response.ok) {
                throw new Error(`Together error: ${response.status}`);
            }

            const data = await response.json();
            return { text: data.choices?.[0]?.message?.content || '[No response]' };
        } catch (error: any) {
            this.logger.error(`Together error: ${error.message}`);
            throw error;
        }
    }

    private async generateOpenRouterCompletion(
        prompt: string,
        systemPrompt?: string,
        model: string = 'auto',
        apiKey?: string
    ): Promise<CompletionResult> {
        const key = apiKey || this.configService.get('OPENROUTER_API_KEY');

        if (!key) {
            return { text: this.simulateResponse(prompt, 'OpenRouter') };
        }

        try {
            const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${key}`,
                    'Content-Type': 'application/json',
                    'HTTP-Referer': 'https://conductor.app',
                },
                body: JSON.stringify({
                    model: model,
                    messages: [
                        { role: 'system', content: systemPrompt || 'You are a helpful AI Agent.' },
                        { role: 'user', content: prompt }
                    ],
                })
            });

            if (!response.ok) {
                throw new Error(`OpenRouter error: ${response.status}`);
            }

            const data = await response.json();
            return { text: data.choices?.[0]?.message?.content || '[No response]' };
        } catch (error: any) {
            this.logger.error(`OpenRouter error: ${error.message}`);
            throw error;
        }
    }

    private simulateResponse(prompt: string, provider: string): string {
        const topic = prompt.substring(0, 50).replace(/[^a-zA-Z0-9 ]/g, '');
        return `[SIMULATED ${provider.toUpperCase()} RESPONSE]

Based on your request regarding "${topic}...", here is my analysis:

1. **Key Points**: I've analyzed the context and identified the main requirements.
2. **Recommendation**: Given the current information, I suggest proceeding with the outlined approach.
3. **Next Steps**: Please provide any additional context needed for a more detailed response.

Note: This is a simulated response. Configure your ${provider} API key in Settings to enable real AI responses.`;
    }
}
