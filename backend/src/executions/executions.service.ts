import { ForbiddenException, Injectable, NotFoundException, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LlmService } from '../ai/llm.service';
import { VectorService } from '../memory/vector.service';
import { VisionService } from '../vision/vision.service';
import { CodingAgentService } from '../coding-agent/coding-agent.service';
import { ResearchAgentService } from '../research-agent/research-agent.service';
import { ExecutionsGateway } from './executions.gateway';
import { TelegramService } from '../integrations/telegram.service';
import * as yaml from 'js-yaml';
import * as fs from 'fs';
import * as path from 'path';
import * as vm from 'node:vm';
import { normalizeWorkflowDefinition } from '../workflows/workflow-schema';
import { assertSafeOutboundUrl } from '../security/url-guards';

/**
 * AC-OS Execution Engine
 * Now integrated with Agent Identity and Niche Configuration.
 */
@Injectable()
export class ExecutionsService {
    constructor(
        private prisma: PrismaService,
        private llm: LlmService,
        private vectorMemory: VectorService,
        private visionService: VisionService,
        private codingAgent: CodingAgentService,
        private researchAgent: ResearchAgentService,
        private gateway: ExecutionsGateway,
        @Inject(forwardRef(() => TelegramService))
        private telegramService: TelegramService,
    ) { }

    private isSystemActor(userId?: string | null, isService = false): boolean {
        const normalized = String(userId || '').trim();
        return isService || !normalized || normalized === 'system' || normalized.startsWith('AESK_');
    }

    private async listAccessibleOrganizationIds(userId: string): Promise<string[]> {
        const memberships = await this.prisma.organizationMember.findMany({
            where: { userId },
            select: { organizationId: true },
        });
        return memberships.map((item) => item.organizationId);
    }

    private async getWorkflowForActor(workflowId: string, userId?: string, isService = false) {
        const workflow = await this.prisma.workflow.findUnique({
            where: { id: workflowId },
            include: {
                workspace: {
                    select: {
                        id: true,
                        organizationId: true,
                    },
                },
            },
        });
        if (!workflow) {
            throw new NotFoundException('Workflow not found');
        }
        if (this.isSystemActor(userId, isService)) {
            return workflow;
        }
        const organizationIds = await this.listAccessibleOrganizationIds(String(userId || '').trim());
        if (!organizationIds.includes(workflow.workspace.organizationId)) {
            throw new ForbiddenException('Workflow is not accessible for this user.');
        }
        return workflow;
    }

    private async getExecutionForActor(executionId: string, userId?: string, isService = false) {
        const execution = await this.prisma.execution.findUnique({
            where: { id: executionId },
            include: {
                workflow: {
                    include: {
                        workspace: {
                            select: {
                                id: true,
                                organizationId: true,
                            },
                        },
                    },
                },
                steps: { include: { toolCalls: true }, orderBy: { stepOrder: 'asc' } },
            },
        });
        if (!execution) {
            throw new NotFoundException('Execution not found');
        }
        if (this.isSystemActor(userId, isService)) {
            return execution;
        }
        const organizationIds = await this.listAccessibleOrganizationIds(String(userId || '').trim());
        if (!organizationIds.includes(execution.workflow.workspace.organizationId)) {
            throw new ForbiddenException('Execution is not accessible for this user.');
        }
        return execution;
    }

    // --- AC-OS HELPERS ---

    private loadNiches(): any {
        try {
            // Traverse up to project root to find config
            const configPath = path.join(process.cwd(), '..', 'config', 'niches.yaml');
            if (fs.existsSync(configPath)) {
                const fileContents = fs.readFileSync(configPath, 'utf8');
                return yaml.load(fileContents);
            } else {
                console.warn(`[AC-OS] Niches config not found at: ${configPath}`);
            }
        } catch (e) {
            console.warn("[AC-OS] Failed to load niches.yaml", e);
        }
        return {};
    }

    private getNodeData(node: any): Record<string, any> {
        return node && typeof node.data === 'object' && node.data !== null ? node.data : {};
    }

    private getNodeConfig(node: any): Record<string, any> {
        return node && typeof node.config === 'object' && node.config !== null ? node.config : {};
    }

    private getNodeLabel(node: any): string {
        const data = this.getNodeData(node);
        const config = this.getNodeConfig(node);
        const identity = typeof config.identity === 'object' && config.identity !== null ? config.identity : {};
        return String(
            data.label
            || config.title
            || identity.name
            || identity.role
            || node?.id
            || node?.type
            || 'Step',
        ).trim() || 'Step';
    }

    private hasUnsafeDecisionExpression(expression: string): boolean {
        if (!expression) return false;
        if (!/^[\w\s.$'"!=<>&|()+\-*/%,?:[\]]+$/.test(expression)) {
            return true;
        }
        return [
            /(?:^|[^\w])(constructor|prototype|__proto__|globalThis|global|process|require|import|Function|eval|window|document|this|new)(?:$|[^\w])/i,
            /__/,
            /[`;{}\\]/,
            /=>/,
        ].some((pattern) => pattern.test(expression));
    }

    private evaluateDecisionExpression(expression: string, currentContext: string, currentNodeData: Record<string, any>): boolean {
        if (this.hasUnsafeDecisionExpression(expression)) {
            throw new Error('Unsafe decision expression.');
        }
        const sandbox = Object.create(null) as Record<string, unknown>;
        sandbox.context = currentContext;
        sandbox.context_text = currentContext;
        sandbox.result_text = currentContext;
        sandbox.result_data = currentNodeData?.result_data && typeof currentNodeData.result_data === 'object'
            ? currentNodeData.result_data
            : {};
        sandbox.state = currentNodeData && typeof currentNodeData === 'object' ? currentNodeData : {};
        const context = vm.createContext(sandbox, {
            codeGeneration: {
                strings: false,
                wasm: false,
            },
        });
        const script = new vm.Script(`Boolean(${expression})`);
        return Boolean(script.runInContext(context, { timeout: 50 }));
    }

    private getAgentModel(node: any): string {
        const data = this.getNodeData(node);
        const config = this.getNodeConfig(node);
        const runtime = typeof config.runtime === 'object' && config.runtime !== null ? config.runtime : {};
        return String(data.model || data.modelId || runtime.model || 'gpt-4o-mini').trim() || 'gpt-4o-mini';
    }

    private getAgentSystemPrompt(node: any): string {
        const data = this.getNodeData(node);
        const config = this.getNodeConfig(node);
        const identity = typeof config.identity === 'object' && config.identity !== null ? config.identity : {};
        const goal = String(identity.goal || '').trim();
        const successCondition = String(identity.success_condition || '').trim();
        const outputContract = String(identity.output_contract || '').trim();
        const parts = [
            String(data.systemPrompt || '').trim(),
            goal ? `Goal: ${goal}` : '',
            successCondition ? `Success condition: ${successCondition}` : '',
            outputContract ? `Output contract: ${outputContract}` : '',
        ].filter(Boolean);
        return parts.join('\n\n').trim();
    }

    private getToolAction(node: any): string {
        const data = this.getNodeData(node);
        const config = this.getNodeConfig(node);
        const variant = String(node?.variant || '').trim().toLowerCase();
        const explicit = String(data.action || data.actionType || config.action_id || '').trim().toLowerCase();
        if (variant === 'http') return 'http';
        if (variant === 'shell') return 'execute_command';
        if (explicit === 'send_telegram' || explicit === 'telegram' || explicit === 'send_message') return 'telegram';
        if (explicit) return explicit;
        if (variant) return variant;
        return 'webhook';
    }

    // --- MAIN API ---

    async executeWorkflow(workflowId: string, input: any = {}, userId?: string, isService = false) {
        const workflow = await this.getWorkflowForActor(workflowId, userId, isService);

        const definition = normalizeWorkflowDefinition(
            typeof workflow.definition === 'string'
                ? JSON.parse(workflow.definition)
                : workflow.definition,
        );

        const nodes: any[] = definition.nodes || [];

        // Find Start Node
        let startNode: any = nodes.find((n: any) => n.type === 'trigger');
        if (!startNode && nodes.length > 0) startNode = nodes[0];

        const execution = await this.prisma.execution.create({
            data: {
                workflowId,
                organizationId: workflow.workspace.organizationId,
                status: 'running',
                triggeredBy: 'manual',
                startedAt: new Date(),
                input: JSON.stringify(input),
                currentNodeId: startNode?.id,
            } as any,
        });

        // AC-OS: Inject Niche Context
        const nicheConfig = this.loadNiches();
        const nicheList = Object.keys(nicheConfig.niches || {});
        let initialContext = input.initialPrompt || "Start exploration.";
        if (nicheList.length > 0) {
            initialContext += `\n\n[AC-OS SYSTEM]: Active Niches: ${nicheList.join(', ')}.`;
        }

        return this.runExecutionLoop(execution.id, initialContext, { userId, isService });
    }

    async resumeExecution(executionId: string, resumeData: any = {}, userId?: string, isService = false) {
        const execution = await this.getExecutionForActor(executionId, userId, isService);
        if (execution.status !== 'waiting') throw new Error('Only waiting executions can be resumed');

        const outputRaw = execution.output as string;
        const output = outputRaw ? JSON.parse(outputRaw) : { logs: [] };
        // Not using emitLog helper here since it's inside runExecutionLoop, so pushing directly
        output.logs = output.logs || [];
        output.logs.push(`[${new Date().toISOString()}] 👤 Human Approval Received: ${resumeData.decision || 'Approved'}`);

        await this.prisma.execution.update({
            where: { id: executionId },
            data: {
                status: 'running',
                output: JSON.stringify(output)
            },
        });

        return this.runExecutionLoop(executionId, resumeData.context || "Resuming after approval.", { userId, isService });
    }

    // --- EXECUTION CORE ---

    private async runExecutionLoop(
        executionId: string,
        initialContext: string,
        actor: { userId?: string; isService?: boolean } = {},
    ) {
        const execution = await this.prisma.execution.findUnique({
            where: { id: executionId },
            include: { workflow: true }
        }) as any;

        if (!execution) throw new NotFoundException('Execution not found');

        const workflow = execution.workflow;

        // Parse credentials from input
        let runCredentials: any[] = [];
        try {
            const inputData = typeof execution.input === 'string' ? JSON.parse(execution.input) : execution.input;
            runCredentials = inputData?.credentials || [];
        } catch (e) {
            // ignore parse error
        }

        const definition = normalizeWorkflowDefinition(
            typeof workflow.definition === 'string'
                ? JSON.parse(workflow.definition)
                : workflow.definition,
        );

        const nodes: any[] = definition.nodes || [];
        const edges: any[] = definition.edges || [];

        let currentContext = initialContext;
        const outputRaw = execution.output as string;
        const output = outputRaw ? JSON.parse(outputRaw) : { logs: [] };
        const logs: string[] = output.logs || [];

        // Helper to log AND emit via WebSocket
        const emitLog = (message: string) => {
            const log = `[${new Date().toISOString()}] ${message}`;
            logs.push(log);
            this.gateway.emitLog(executionId, log);
        };

        const emitNodeResult = (nodeId: string, output: any) => {
            if (this.gateway.emitStatus) {
                this.gateway.emitStatus(executionId, 'node_execution_result', {
                    nodeId,
                    output,
                    timestamp: new Date().toISOString()
                });
            }
        };

        let currentNode: any = nodes.find((n: any) => n.id === execution.currentNodeId);
        let safetyCounter = 0;

        while (currentNode && safetyCounter < 50) {
            safetyCounter++;
            const currentNodeData = this.getNodeData(currentNode);
            const currentNodeConfig = this.getNodeConfig(currentNode);
            emitLog(`⏳ Processing: ${this.getNodeLabel(currentNode)}...`);

            // 1. Handle Node Types
            if (currentNode.type === 'agent') {
                emitLog(`🤖 Agent "${this.getNodeLabel(currentNode)}" is thinking...`);
                try {
                    let augmentedContext = currentContext;
                    try {
                        const queryEmbedding = await this.vectorMemory.generateEmbedding(currentContext);
                        const memories = await this.vectorMemory.query(queryEmbedding, 2);
                        if (memories.length > 0) {
                            emitLog(`🧠 Memory retrieved: ${memories.length} relevant items found.`);
                            augmentedContext = `RELEVANT MEMORY:\n${memories.join('\n')}\n\nCURRENT TASK:\n${currentContext}`;
                        }
                    } catch (ragErr) { }

                    // --- AC-OS: IDENTITY INJECTION ---
                    let effectiveSystemPrompt = this.getAgentSystemPrompt(currentNode);
                    const dna = {
                        core_motivation: currentNodeData.core_motivation,
                        intrinsic_values: currentNodeData.intrinsic_values,
                        forbidden_behaviors: currentNodeData.forbidden_behaviors,
                        knowledge_domain: currentNodeData.knowledge_domain
                    };

                    if (dna.core_motivation || (dna.forbidden_behaviors && dna.forbidden_behaviors.length > 0)) {
                        emitLog(`🧬 Injecting Identity DNA...`);
                        const identityBlock = `
                        You are an Autonomous Agent within the Conductor OS.
                        
                        == IDENTITY DNA ==
                        ROLE: ${this.getNodeLabel(currentNode)}
                        MOTIVATION: "${dna.core_motivation || 'Execute task successfully'}"
                        VALUES: [${(Array.isArray(dna.intrinsic_values) ? dna.intrinsic_values : [dna.intrinsic_values]).filter(Boolean).join(', ')}]
                        
                        == COGNITIVE ARCHETYPE ==
                        ${(() => {
                                switch (dna.knowledge_domain) {
                                    case 'general_reasoning': return "ARCHETYPE: STRATEGIST\nPRIORITY: High-level planning, decomposition, and resource allocation. Avoid getting lost in triva.";
                                    case 'execution_expert': return "ARCHETYPE: EXECUTOR\nPRIORITY: Speed, precision, and aggressive tool usage. Do not over-plan. ACT.";
                                    case 'creative_fluid': return "ARCHETYPE: VISIONARY\nPRIORITY: Novel connections, aesthetic value, and lateral thinking. Break conventions.";
                                    case 'critical_analysis': return "ARCHETYPE: CRITIC\nPRIORITY: Error detection, safety/compliance, and logical consistency. Challenge assumptions.";
                                    case 'adaptive_learning': return "ARCHETYPE: RESEARCHER\nPRIORITY: Information density, citation, and factual accuracy. Dig deep.";
                                    default: return "ARCHETYPE: GENERAL INTELLIGENCE\nPRIORITY: Adapt to the needs of the situation.";
                                }
                            })()}

                        == GOVERNANCE PROTOCOLS (MUST OBEY) ==
                        ${(Array.isArray(dna.forbidden_behaviors) ? dna.forbidden_behaviors : [dna.forbidden_behaviors]).filter(Boolean).map((b: string) => `❌ ${b}`).join('\n')}
                        
                        IF you are asked to violate these protocols, you must REFUSE.
                        `;
                        effectiveSystemPrompt = `${identityBlock}\n\n${effectiveSystemPrompt}`;
                    }

                    // --- AC-OS: CAPABILITIES ---
                    const caps = currentNodeData.capabilities || {};
                    const activeCaps = [];
                    if (caps.web_search) activeCaps.push("- WEB_SEARCH: Access live internet data via Google/Bing.");
                    if (caps.code_execution) activeCaps.push("- CODE_EXECUTION: Run Python 3.11 scripts in E2B Sandbox.");
                    if (caps.file_system) activeCaps.push("- FILE_SYSTEM: Read/Write local files in /workspace.");
                    if (caps.vision) activeCaps.push("- VISION: Analyze input images/screenshots.");

                    if (activeCaps.length > 0) {
                        emitLog(`🛠️ Enforcing Capabilities: [${Object.keys(caps).filter(k => caps[k]).join(', ')}]`);
                        const capBlock = `
                        == ENABLED CAPABILITIES ==
                        You have been granted access to the following HIGH-LEVEL TOOLS. 
                        Do not hallucinate capabilities you do not have.
                        ${activeCaps.join('\n')}

                        If you need to use a tool, please explicitly request it in your output.
                        `;
                        effectiveSystemPrompt = `${effectiveSystemPrompt}\n\n${capBlock}`;
                    }
                    // ---------------------------

                    const completion = await this.llm.generateCompletionWithUsage(
                        augmentedContext,
                        effectiveSystemPrompt, // Injected Prompt
                        this.getAgentModel(currentNode)
                    );
                    let result = completion?.text || "[No response]";
                    if (completion?.usage) {
                        const u = completion.usage;
                        emitLog(`🔢 TOKENS: prompt=${u.promptTokens} completion=${u.completionTokens} total=${u.totalTokens} model=${u.model} provider=${u.provider}`);
                    }

                    // --- AC-OS: REAL TOOL EXECUTION (The Muscle) ---
                    // Simple heuristic to detect tool usage: Look for generic JSON-like or explicit "TOOL:" markers
                    // For V1, we instruct the model to use:
                    // { "tool": "code_execution", "code": "print('hello')" }

                    if (caps.code_execution && result.includes('code_execution')) {
                        try {
                            // Extract JSON block (naive)
                            const jsonMatch = result.match(/\{[\s\S]*"tool"[\s\S]*"code_execution"[\s\S]*\}/);
                            if (jsonMatch) {
                                const toolCall = JSON.parse(jsonMatch[0]);
                                emitLog(`⚡ Detecting Tool Call: CODE_EXECUTION`);
                                emitLog(`📦 Spinning up E2B Cloud Sandbox...`);

                                // Dynamic Import to avoid build errors if not installed yet
                                const e2bModule = await import('@e2b/code-interpreter') as any;
                                const CodeInterpreter = e2bModule.CodeInterpreter;
                                const sandbox = await CodeInterpreter.create();

                                emitLog(`▶️ Running Code in Cloud Environment...`);
                                const execution = await sandbox.notebook.execCell(toolCall.code || toolCall.params?.code);

                                const output = execution.text || execution.logs?.stdout || execution.logs?.stderr || "No output";
                                emitLog(`✅ Sandbox Output: ${output.substring(0, 100).replace(/\n/g, ' ')}...`);

                                await sandbox.close();

                                // Append result to context
                                result += `\n\n== SYSTEM: TOOL OUTPUT (E2B SANDBOX) ==\n${output}\n=======================================`;
                            }
                        } catch (toolErr) {
                            emitLog(`⚠️ Tool Execution Failed: ${toolErr.message}`);
                            result += `\n\n== SYSTEM: TOOL ERROR ==\n${toolErr.message}\n========================`;
                        }
                    }
                    // ------------------------------------------------

                    try {
                        const resultEmbedding = await this.vectorMemory.generateEmbedding(result);
                        await this.vectorMemory.upsert(
                            `${executionId}_${currentNode.id}`,
                            resultEmbedding,
                            { workflowId: workflow.id, nodeId: currentNode.id, type: 'agent_output' }
                        );
                    } catch (storeErr) { }

                    currentContext = result;
                    emitLog(`✅ Agent Output: ${result.substring(0, 150)}...`);
                } catch (err) {
                    emitLog(`❌ Agent Error: ${err.message}`);
                }
                emitNodeResult(currentNode.id, { output: currentContext });
            }
            else if (currentNode.type === 'logic' || currentNode.type === 'decision') {
                const expression = String(currentNodeData.condition || currentNodeConfig.expression || '').trim() || 'false';
                emitLog(`🔀 Evaluating: ${expression}`);
                let evaluation = false;
                try {
                    evaluation = this.evaluateDecisionExpression(expression, currentContext, currentNodeData);
                    emitLog(`ℹ️ Condition result: ${evaluation}`);
                } catch (err) {
                    emitLog(`⚠️ Logic Error: ${err.message}`);
                }
                emitNodeResult(currentNode.id, { output: evaluation });

                const handleId = evaluation ? 'true' : 'false';
                const branchEdge = edges.find((e: any) => e.source === currentNode.id && e.sourceHandle === handleId);
                if (branchEdge) {
                    currentNode = nodes.find((n: any) => n.id === branchEdge.target);
                    continue;
                }
            }
            else if (currentNode.type === 'approval' || currentNode.type === 'human') {
                const variant = String(currentNode.variant || '').trim().toLowerCase() || 'approval';
                emitLog(
                    variant === 'wait_for_reply'
                        ? '⏸️ Waiting for reply. Pausing...'
                        : variant === 'review'
                            ? '⏸️ Human review required. Pausing...'
                            : '⏸️ Human approval required. Pausing...',
                );
                await (this.prisma.execution.update as any)({
                    where: { id: executionId },
                    data: {
                        status: 'waiting',
                        currentNodeId: currentNode.id,
                        output: JSON.stringify({ logs, finalResult: currentContext })
                    },
                });
                return { executionId, status: 'waiting', logs, finalResult: currentContext };
            }
            else if (currentNode.type === 'data') {
                const variant = String(currentNode.variant || '').trim().toLowerCase() || 'transform';
                const transformSummary = String(
                    currentNodeConfig.mapping
                    || currentNodeConfig.template
                    || this.getNodeLabel(currentNode),
                ).trim() || 'Transform data';
                emitLog(`🧮 Data step (${variant}): ${transformSummary}`);
                currentContext = `DATA STEP (${variant}): ${transformSummary}\n\n${currentContext}`;
                emitNodeResult(currentNode.id, { output: currentContext });
            }
            else if (currentNode.type === 'subflow') {
                const childWorkflowId = String(currentNodeConfig.workflow_id || '').trim();
                if (!childWorkflowId) {
                    emitLog('⚠️ Subflow skipped: no workflow_id configured.');
                } else if (childWorkflowId === workflow.id) {
                    emitLog('⚠️ Subflow skipped: recursive call to the same workflow is not allowed.');
                } else {
                    emitLog(`↪️ Calling subflow ${childWorkflowId}...`);
                    const childResult = await this.executeWorkflow(
                        childWorkflowId,
                        {
                            initialPrompt: currentContext,
                            parentExecutionId: executionId,
                            parentWorkflowId: workflow.id,
                        },
                        actor.userId,
                        Boolean(actor.isService),
                    );
                    currentContext = typeof childResult?.finalResult === 'string' && childResult.finalResult.trim()
                        ? childResult.finalResult
                        : currentContext;
                    emitLog(`✅ Subflow ${childWorkflowId} completed.`);
                    emitNodeResult(currentNode.id, {
                        output: currentContext,
                        childExecutionId: childResult?.executionId,
                        childStatus: childResult?.status,
                    });
                }
            }
            else if (currentNode.type === 'parallel') {
                emitLog(`🔀 Parallel Split: Executing ${edges.filter((e: any) => e.source === currentNode.id).length} branches simultaneously...`);

                const parallelEdges = edges.filter((e: any) => e.source === currentNode.id);

                if (parallelEdges.length > 0) {
                    // Execute all branches in parallel
                    const branchPromises = parallelEdges.map(async (edge: any) => {
                        const branchNode: any = nodes.find((n: any) => n.id === edge.target);
                        if (!branchNode) return null;

                        const branchLogs: string[] = [];
                        let branchContext = currentContext;
                        let currentBranchNode: any = branchNode;
                        let branchSafety = 0;

                        // Execute this branch until it ends or merges
                        while (currentBranchNode && branchSafety < 20) {
                            branchSafety++;
                            branchLogs.push(`  ↳ Branch [${edge.sourceHandle || 'default'}]: Processing ${currentBranchNode.data?.label || currentBranchNode.type}`);

                            if (currentBranchNode.type === 'agent') {
                                try {
                                    const completion = await this.llm.generateCompletionWithUsage(
                                        branchContext,
                                        currentBranchNode.data.systemPrompt,
                                        currentBranchNode.data.model
                                    );
                                    const result = completion?.text || "[No response]";
                                    if (completion?.usage) {
                                        const u = completion.usage;
                                        branchLogs.push(`  ↳ TOKENS: prompt=${u.promptTokens} completion=${u.completionTokens} total=${u.totalTokens} model=${u.model} provider=${u.provider}`);
                                    }
                                    branchContext = result;
                                    branchLogs.push(`  ↳ Branch result: ${result.substring(0, 100)}...`);
                                } catch (err) {
                                    branchLogs.push(`  ↳ Branch error: ${err.message}`);
                                }
                            }

                            // Move to next node in this branch
                            const nextBranchEdge = edges.find((e: any) => e.source === currentBranchNode.id);
                            if (nextBranchEdge) {
                                currentBranchNode = nodes.find((n: any) => n.id === nextBranchEdge.target);
                            } else {
                                currentBranchNode = null;
                            }
                        }

                        return { branchLogs, branchContext };
                    });

                    const results = await Promise.all(branchPromises);

                    // Merge results
                    results.forEach((result, idx) => {
                        if (result) {
                            logs.push(...result.branchLogs);
                        }
                    });

                    // Combine all branch contexts
                    const combinedContext = results
                        .filter(r => r)
                        .map(r => r!.branchContext)
                        .join('\n---\n');

                    currentContext = combinedContext || currentContext;
                    (emitNodeResult as any)(currentNode.id, { output: currentContext });
                    emitLog(`✅ Parallel branches completed and merged.`);
                }

                // After parallel execution, workflow ends (or you could find a merge node)
                currentNode = null;
            }
            else if (currentNode.type === 'vision') {
                // (Existing Vision Logic - Abbreviated for consistency)
                emitLog(`👁️ Vision Analysis...`);
                try {
                    const imageUrl = currentNode.data.imageUrl || currentContext;
                    const task = currentNode.data.task || 'Analyze this screenshot';
                    const analysisType = currentNode.data.analysisType || 'general';
                    const visionResult = await this.visionService.analyzeScreenshot(imageUrl, task, analysisType as any);
                    emitLog(`✅ Vision Analysis Complete: ${visionResult.insights.length} findings`);
                    currentContext = visionResult.analysis;
                    emitNodeResult(currentNode.id, { output: currentContext, insights: visionResult.insights });
                } catch (error) {
                    emitLog(`❌ Vision Error: ${error.message}`);
                    currentContext = `Vision failed: ${error.message}`;
                }
            }
            else if (currentNode.type === 'coding') {
                // (Existing Coding Logic)
                emitLog(`💻 Coding Agent: Starting task...`);
                try {
                    const description = currentNode.data.description || currentContext;
                    const language = currentNode.data.language || 'python';
                    const requirements = currentNode.data.requirements || [];
                    const result = await this.codingAgent.executeTask({ description, language: language as any, requirements, context: currentContext });
                    result.executionLogs.forEach(log => emitLog(log));
                    currentContext = result.success ? (result.code || "") : (result.errorMessage || "Unknown Error");
                    emitNodeResult(currentNode.id, { output: currentContext, code: result.code });
                } catch (error) {
                    emitLog(`❌ Coding Agent Error: ${error.message}`);
                }
            }
            else if (currentNode.type === 'research') {
                // (Existing Research Logic)
                emitLog(`🔍 Research Agent...`);
                try {
                    const topic = currentNode.data.topic || currentContext;
                    const result = await this.researchAgent.researchTopic({ topic, depth: 'standard', focus: 'general', context: currentContext });
                    if (result.success) {
                        emitLog(`✅ Research complete: ${result.sources.length} sources`);
                        currentContext = result.summary;
                        emitNodeResult(currentNode.id, { output: currentContext, sources: result.sources });
                    }
                } catch (error) {
                    emitLog(`❌ Research Error: ${error.message}`);
                }
            }
            else if (currentNode.type === 'squad' || currentNode.type.startsWith('squad_')) {
                emitLog(`👥 Squad "${currentNode.data.label}" assembly...`);
                try {
                    const members = currentNode.data.members || [];
                    if (members.length === 0) throw new Error("No members in squad");

                    let squadContext = currentContext;
                    const contributions = [];

                    for (const member of members) {
                        emitLog(`👤 ${member.role} (${member.model}) is working...`);
                        const rolePrompt = `You are ${member.role}. ${member.systemPrompt || ''}. 
                        Review the current context and contribute your expertise.`;

                        const completion = await this.llm.generateCompletionWithUsage(
                            squadContext,
                            rolePrompt,
                            member.model
                        );
                        const result = completion?.text || "[No contribution]";
                        if (completion?.usage) {
                            const u = completion.usage;
                            emitLog(`🔢 TOKENS: prompt=${u.promptTokens} completion=${u.completionTokens} total=${u.totalTokens} model=${u.model} provider=${u.provider}`);
                        }

                        const contribution = `\n\n=== CONTRIBUTION: ${member.role} ===\n${result}`;
                        squadContext += contribution;
                        contributions.push({ role: member.role, content: result });

                        emitLog(`✅ ${member.role} finished.`);
                        (emitNodeResult as any)(currentNode.id, {
                            partial: true,
                            role: member.role,
                            contribution: result.substring(0, 50) + '...'
                        });
                    }
                    currentContext = squadContext;
                    emitLog(`🏁 Squad mission complete.`);
                    (emitNodeResult as any)(currentNode.id, {
                        output: currentContext,
                        contributions
                    });
                } catch (error) {
                    emitLog(`❌ Squad Error: ${error.message}`);
                }
            }
            else if (currentNode.type === 'tool') {
                const action = this.getToolAction(currentNode);
                emitLog(`🛠️ Executing Tool: ${action}`);

                try {
                    let toolResult: any = null;

                    switch (action) {
                        // === AC-OS DIAMOND FEATURES ===
                        case 'identity_action': {
                            // First-class wrapper for agent_identity.py
                            const actionType = currentNodeData.actionType || 'sign_publish';
                            const nicheId = currentNodeData.nicheId || 'default';

                            emitLog(`💎 AC-OS Identity Action: ${actionType} for ${nicheId}`);

                            const pyPath = path.join(process.cwd(), '..', 'python_engine', 'agency_logic.py');
                            let command = `python3 ${pyPath} ${nicheId} ${actionType}`;

                            if (currentNodeData.payload) {
                                // Create temp payload file
                                const payloadPath = `/tmp/acos_${executionId}_${Date.now()}.json`;
                                fs.writeFileSync(payloadPath, JSON.stringify({
                                    ...currentNodeData.payload,
                                    execution_id: executionId,
                                    node_id: currentNode.id
                                }));
                                command += ` --in "${payloadPath}"`;
                            }

                            emitLog(`💻 Executing: ${command}`);
                            toolResult = await this.gateway.executeOnBridge(executionId, command, process.cwd());

                            if (toolResult.exitCode !== 0) {
                                throw new Error(`Identity Action Failed: ${toolResult.stderr}`);
                            }

                            try {
                                const parsed = JSON.parse(toolResult.stdout);
                                toolResult = parsed;
                            } catch (e) {
                                toolResult = { raw: toolResult.stdout };
                            }

                            emitLog(`✅ Identity Action Complete`);
                            break;
                        }

                        case 'webhook':
                        case 'http': {
                            const url = currentNodeConfig.url || currentNodeData.url || currentNodeData.webhookUrl;
                            const method = currentNodeConfig.method || currentNodeData.method || 'POST';
                            const headers = currentNodeData.headers || { 'Content-Type': 'application/json' };
                            const body = currentNodeData.body || { context: currentContext };

                            if (!url) throw new Error('No URL configured');
                            await assertSafeOutboundUrl(url);
                            const response = await fetch(url, {
                                method,
                                headers,
                                body: method !== 'GET' ? JSON.stringify(body) : undefined,
                            });
                            if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                            toolResult = await response.text();
                            emitLog(`✅ HTTP Response received`);
                            break;
                        }

                        case 'telegram': {
                            const cred = runCredentials.find((c: any) => c.provider === 'telegram');
                            const token = cred?.apiKey;
                            if (!token) throw new Error('Telegram Bot Token not configured.');
                            const chatId = currentNodeData.chatId || currentNodeConfig.chat_id;
                            if (!chatId) throw new Error('Telegram Chat ID is required.');
                            const text = currentNodeData.message || currentNodeConfig.message || currentContext;

                            await this.telegramService.sendMessage(token, chatId, text);
                            emitLog(`✅ Telegram message sent!`);
                            if (currentNodeData.waitForReply) {
                                emitLog(`⏳ Waiting for reply...`);
                                this.telegramService.registerPendingReply(chatId, executionId);
                                await this.prisma.execution.update({
                                    where: { id: executionId },
                                    data: { status: 'waiting', currentNodeId: currentNode.id }
                                });
                                this.gateway.emitStatus(executionId, 'waiting');
                                return; // SUSPEND EXECUTION
                            }
                            toolResult = { success: true };
                            break;
                        }

                        case 'execute_command': {
                            const command = currentNodeConfig.command || currentNodeData.command || currentNodeData.text;
                            const cwd = currentNodeConfig.cwd || currentNodeData.cwd;
                            if (!command) throw new Error("No command configured");
                            emitLog(`💻 Executing on Bridge: ${command}`);
                            toolResult = await this.gateway.executeOnBridge(executionId, command, cwd);
                            emitLog(toolResult.exitCode === 0 ? `✅ Command success` : `❌ Command failed`);
                            break;
                        }

                        default:
                            emitLog(`⚠️ Unknown tool action: ${action}`);
                            toolResult = { action, status: 'unknown', context: currentContext };
                    }

                    // Format tool result for next node
                    currentContext = `TOOL RESULT (${action}):\n${JSON.stringify(toolResult, null, 2)}`;
                    emitNodeResult(currentNode.id, { output: toolResult });

                } catch (error) {
                    emitLog(`❌ Tool Error: ${error.message}`);
                    currentContext = `Tool execution failed: ${error.message}`;
                }
            }

            // Find Next Node
            if (currentNode && currentNode.type !== 'parallel') {
                const nextEdge = edges.find((e: any) => e.source === currentNode.id);
                if (nextEdge) {
                    currentNode = nodes.find((n: any) => n.id === nextEdge.target);
                } else {
                    currentNode = null;
                }
            }
        }

        emitLog(`🏁 Execution finished.`);
        await this.prisma.execution.update({
            where: { id: executionId },
            data: {
                status: 'success',
                completedAt: new Date(),
                output: JSON.stringify({ logs, finalResult: currentContext }),
                durationMs: 3000,
            },
        });

        this.gateway.emitComplete(executionId, {
            status: 'success',
            logs,
            finalResult: currentContext
        });

        return { executionId, status: 'success', logs, finalResult: currentContext };
    }

    async findAll(userId?: string, isService = false) {
        try {
            const organizationIds = this.isSystemActor(userId, isService)
                ? null
                : await this.listAccessibleOrganizationIds(String(userId || '').trim());
            if (organizationIds && organizationIds.length === 0) {
                return [];
            }
            const executions = await this.prisma.execution.findMany({
                where: organizationIds ? { organizationId: { in: organizationIds } } : undefined,
                include: { workflow: true },
                orderBy: { createdAt: 'desc' },
            });
            return executions.map((e: any) => this.deserializeExecution(e));
        } catch (e) {
            console.error("FindAll Failed:", e);
            return []; // Return empty array on failure to avoid frontend crash
        }
    }

    async findOne(id: string, userId?: string, isService = false) {
        const execution = await this.getExecutionForActor(id, userId, isService);
        return this.deserializeExecution(execution);
    }

    private deserializeExecution(execution: any) {
        if (execution.input && typeof execution.input === 'string') {
            try { execution.input = JSON.parse(execution.input); } catch (e) { execution.input = {}; }
        }
        if (execution.output && typeof execution.output === 'string') {
            try { execution.output = JSON.parse(execution.output); } catch (e) { execution.output = {}; }
        }
        return execution;
    }
}
