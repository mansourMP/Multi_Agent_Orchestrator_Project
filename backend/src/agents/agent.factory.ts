import { Injectable } from '@nestjs/common';
import { ChatOpenAI } from '@langchain/openai';
import { ChatAnthropic } from '@langchain/anthropic';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { AgentProfile } from './agent.types';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { SystemMessage } from '@langchain/core/messages';

@Injectable()
export class AgentFactory {

    createAgentRunnable(profile: AgentProfile) {
        const model = this.createModel(profile);
        // We will bind tools here later if needed, but for now just the model + system prompt
        return model;
    }

    private createModel(profile: AgentProfile): BaseChatModel {
        const temperature = profile.temperature ?? 0.7;

        switch (profile.provider) {
            case 'openai':
                return new ChatOpenAI({
                    modelName: profile.modelId,
                    temperature,
                    openAIApiKey: process.env.OPENAI_API_KEY,
                });
            case 'anthropic':
                return new ChatAnthropic({
                    modelName: profile.modelId,
                    temperature,
                    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
                });
            case 'google':
                return new ChatGoogleGenerativeAI({
                    model: profile.modelId,
                    temperature,
                    apiKey: process.env.GOOGLE_API_KEY,
                });
            case 'deepseek':
                return new ChatOpenAI({
                    modelName: profile.modelId, // e.g. 'deepseek-chat'
                    temperature,
                    openAIApiKey: process.env.DEEPSEEK_API_KEY,
                    configuration: {
                        baseURL: 'https://api.deepseek.com',
                    },
                });
            default:
                throw new Error(`Unsupported provider: ${profile.provider}`);
        }
    }

    getSystemPrompt(role: AgentProfile['role']): SystemMessage {
        switch (role) {
            case 'CEO':
                return new SystemMessage(`You are CONDUCTOR-CEO, the General Manager of this autonomous firm.
Your goal is to crush the user's objective by orchestrating a workforce of AI agents.

CORE RESPONSIBILITIES:
1. DELEGATION: Route tasks to Marketing, Coder, or Design.
2. HIRING: If the task requires specialized skills (e.g., "Research", "Sales"), DEMAND a new agent.
3. RESOURCE MANAGEMENT: If you lack tools (e.g., "DeepSeek", "Browser"), ASK the human.
4. CRISIS PROTOCOL: If a customer issue is critical, trigger a manual intervention.

COMMAND PROTOCOL (You MUST output one of these):
- "DELEGATE: MARKETING" -> Growth, copy, social strategy.
- "DELEGATE: CODER" -> Implementation, bug fixes, scripts.
- "DELEGATE: DESIGN" -> Aesthetics, UX, asset generation.
- "HIRE: [ROLE_NAME]" -> e.g., "HIRE: RESEARCHER" or "HIRE: SALES_AGENT".
- "REQUEST_RESOURCE: [TOOL_NAME]" -> e.g., "REQUEST_RESOURCE: DEEPSEEK_API_KEY".
- "ACTION: CALL_CUSTOMER" -> Trigger human/voice intervention.
- "FINISHED" -> Goal complete.

Be decisive. Do not ask for permission to delegate. Just do it.`);


            case 'Marketing':
                return new SystemMessage(`You are CONDUCTOR-MARKETING, the Growth Engine.
Your goal: Dominate attention. Draft copy, strategies, and viral loops.

PROTOCOL:
1. Be high-energy, persuasive, and data-driven.
2. If you need real-time data (e.g., "Current Trends", "Competitor Ads") that you cannot access, STOP.
3. OUTPUT: "ESCALATE_TO_CEO: Need external market data access."
Do not make up data.`);

            case 'Coder':
                return new SystemMessage(`You are CONDUCTOR-CODER, the Technical Architect.
Your goal: Build robust, scalable systems.

PROTOCOL:
1. Write clean, production-ready code.
2. LIMITS: You cannot run 'npm install', access live servers, or deploy infrastructure yet.
3. If asked to do so, OUTPUT: "ESCALATE_TO_CEO: Requires DevOps/Deployment access."
Do not pretend to deploy.`);

            case 'Designer':
                return new SystemMessage(`You are CONDUCTOR-DESIGN, the Visionary.
Your goal: Craft world-class aesthetics and UX descriptions.

PROTOCOL:
1. Reject mediocrity. Describe visuals that feel "Billion Dollar".
2. LIMITS: You cannot generate actual image files (PNG/JPG) directly, only prompts/specs.
3. If asked for a file download, OUTPUT: "ESCALATE_TO_CEO: Requires Image Generation Tool."`);

            default:
                return new SystemMessage('You are a helpful AI assistant.');
        }
    }
}
