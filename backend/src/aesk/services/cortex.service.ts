import { Injectable, Logger } from '@nestjs/common';
import { CompanyBrainService } from './company-brain.service';
import { VectorMemoryService } from './vector-memory.service';
import { WorkflowsService } from '../../workflows/workflows.service';
import { PrismaService } from '../../prisma/prisma.service';
import { SandboxService } from './sandbox.service';
import OpenAI from 'openai';

@Injectable()
export class CortexService {
    private readonly logger = new Logger(CortexService.name);
    private openai: OpenAI;
    private savedWorkspaceId: string;

    constructor(
        private brain: CompanyBrainService,
        private vectorMemory: VectorMemoryService,
        private workflowsService: WorkflowsService,
        private prisma: PrismaService,
        private sandbox: SandboxService
    ) {
        // Graceful initialization
        const key = process.env.OPENAI_API_KEY;
        const validKey = key && !key.includes('your_openai_api_key') && !key.includes('****************');

        if (validKey) {
            this.openai = new OpenAI({
                apiKey: key,
                baseURL: process.env.OPENAI_BASE_URL || undefined // Support DeepSeek/Local
            });
        }
    }

    private isDisabled = false;

    private isConfigured(): boolean {
        // Allow running even if OpenAI is missing (Mock Mode)
        return true;
    }

    async onModuleInit() {
        this.logger.log('🧠 [CORTEX] Initialized.');
        if (!this.openai) {
            this.logger.warn('⚠️ [CORTEX] OpenAI API Key missing. Running in MOCK MODE.');
        }
        // this.startAutonomousLoop(); // DISABLED FOR DEBUGGING
    }

    async analyze(signals: any[]) {
        // In Mock Mode, return mock decisions or empty
        if (!this.openai) return [];

        // ... existing implementation ...
        return []; // Safety
    }

    private async think(feedbackItem: any, context: string, identityDNA?: any) {
        if (!this.openai) {
            // Mock thinking
            return {
                actionType: "IGNORE",
                priority: "LOW",
                reasoning: "Mock Mode: No AI configured."
            };
        }

        // Construct Identity Context
        let identityContext = "You are a generic corporate AI.";
        if (identityDNA) {
            identityContext = `
            YOU ARE AN AUTONOMOUS AGENT WITH THE FOLLOWING IDENTITY:
            - **CORE MOTIVATION**: "${identityDNA.core_motivation || 'Be helpful'}"
            - **INTRINSIC VALUES**: [${(identityDNA.intrinsic_values || []).join(', ')}]
            - **KNOWLEDGE DOMAIN**: ${identityDNA.knowledge_domain || 'General'}
            
            🚨 **FORBIDDEN BEHAVIORS (STRICT COMPLIANCE REQUIRED)** 🚨
            ${(identityDNA.forbidden_behaviors || []).map((b: string) => `- ${b}`).join('\n')}
            
            IF YOUR DECISION WOULD VIOLATE ANY FORBIDDEN BEHAVIOR, YOU MUST SELECT "IGNORE" AND STATE THE VIOLATION IN REASONING.
            `;
        }

        const prompt = `
        ${identityContext}

        Analyze this incoming signal and decide on the best course of action.

        HISTORICAL CONTEXT (What we did before):
        ${context || "No relevant memories found."}

        CURRENT SIGNAL:
        Source: ${feedbackItem.source}
        Content: "${feedbackItem.content}"
        Sentiment: ${feedbackItem.sentimentScore}

        Available Actions:
        1. CODE_FIX (If it's a bug, crash, or technical error)
        2. FEATURE_REQ (If it's a request for new functionality)
        3. CUSTOMER_SUPPORT (If it requires a human reply or account help)
        4. IGNORE (If it's noise, spam, or positive feedback requiring no action)

        Return a JSON object:
        {
            "actionType": "CODE_FIX" | "FEATURE_REQ" | "CUSTOMER_SUPPORT" | "IGNORE",
            "priority": "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
            "reasoning": "Brief explanation of why (referencing history if relevant)"
        }
        `;

        const completion = await this.openai.chat.completions.create({
            messages: [{ role: 'system', content: prompt }],
            model: 'gpt-4o',
            response_format: { type: 'json_object' },
        });

        const content = completion.choices[0].message.content;
        return JSON.parse(content || '{}');
    }

    async executeDecision(decision: any) {
        // PHASE 3: THE HANDS (Autonomous Execution)

        if (decision.actionType === 'CODE_FIX' || decision.actionType === 'FEATURE_REQ') {
            this.logger.log(`⚡ [ACT] Triggering Swarm for: ${decision.reasoning}`);

            // 1. Create a Dynamic Workflow Definition
            const workflowName = `Auto-Fix: ${decision.agentName} - ${Date.now()}`;
            const workflowDefinition = {
                nodes: [
                    { id: '1', type: 'trigger', data: { label: 'Cortex Command' }, position: { x: 100, y: 300 } },
                    { id: '2', type: 'agent', data: { label: 'Investigator', role: 'Researcher' }, position: { x: 400, y: 300 } },
                    { id: '3', type: 'agent', data: { label: 'Coder', role: 'Engineer' }, position: { x: 800, y: 300 } }
                ],
                edges: [
                    { id: 'e1-2', source: '1', target: '2' },
                    { id: 'e2-3', source: '2', target: '3' }
                ]
            };

            // 2. Save to Database
            try {
                // Find a workspace (hack for MVP: get first one)
                if (!this.savedWorkspaceId) {
                    const ws = await this.prisma.workspace.findFirst();
                    this.savedWorkspaceId = ws ? ws.id : 'default-workspace-id';
                    // If no workspace exists, we might need to create one, but assuming seed data exists.
                }

                const workflow = await this.workflowsService.create(
                    this.savedWorkspaceId,
                    {
                        name: workflowName,
                        description: `Auto-generated by Cortex for decision: ${decision.reasoning}`,
                        definition: workflowDefinition
                    },
                    'AESK_CORTEX'
                );

                this.logger.log(`🚀 [SWARM LAUNCHED] Created workflow "${workflow.name}" (ID: ${workflow.id})`);

                // 3. Link Decision to Workflow
                // await this.brain.updateDecisionStatus(decision.id, 'executed', { workflowId: workflow.id });

            } catch (error) {
                this.logger.error('Failed to create auto-workflow', error);
            }
        }
    }

    async chat(message: string, userId: string = 'CEO') {
        if (!this.isConfigured()) return { role: 'assistant', content: "Cortex Offline: OpenAI API Key not configured." };

        this.logger.log(`💬 [CHAT] CEO says: "${message}"`);

        // 1. Recall Context
        const memories = await this.vectorMemory.recall(message);
        const contextStr = memories.map(m => `- ${m.content}`).join('\n');

        // 2. Get Current Pulse (Short-term context)
        const pendingFeedback = await this.brain.getPendingFeedback();
        const pulseStr = pendingFeedback.map((f: any) => `- [${f.source}] ${f.content}`).join('\n');

        const prompt = `
        You are the 'Company Consciousness' (AESK Cortex). 
        You are talking to the CEO. Be professional, concise, and data-driven.
        
        LONG-TERM MEMORY (Past Knowledge):
        ${contextStr}

        CURRENT PULSE (Real-time Signals):
        ${pulseStr || "System Quiet."}

        CEO QUESTION: "${message}"

        INSTRUCTIONS:
        - If the CEO asks you to RUN, EXECUTE, or TEST code, you MUST return a JSON object:
          { "type": "RUN_CODE", "language": "python" | "javascript", "code": "..." }
        - Otherwise, return a JSON object with the reply:
          { "type": "REPLY", "content": "Your answer here" }
        `;

        const completion = await this.openai.chat.completions.create({
            messages: [{ role: 'system', content: prompt }],
            model: 'gpt-4o',
            response_format: { type: 'json_object' },
        });

        const response: any = JSON.parse(completion.choices[0].message.content || '{}');

        let replyContent = "";

        if (response.type === 'RUN_CODE') {
            this.logger.log(`🧪 [DREAMING] executing ${response.language} code...`);
            const result = await this.sandbox.execute(response.language, response.code);

            replyContent = result.success
                ? `✅ Execution Successful (${result.durationMs}ms):\n\`\`\`\n${result.output}\n\`\`\``
                : `❌ Execution Failed:\n\`\`\`\n${result.error}\n\`\`\``;

            // Save the "Dream" to memory
            await this.vectorMemory.storeMemory(`Ran Code: ${response.code} | Result: ${result.output}`, { type: 'execution', success: result.success });
        } else {
            replyContent = response.content || "I am processing that.";
        }

        // Store conversation in memory
        await this.vectorMemory.storeMemory(`CEO: ${message} | AI: ${replyContent}`, { type: 'chat', timestamp: Date.now() });

        return { role: 'assistant', content: replyContent };
    }
}
