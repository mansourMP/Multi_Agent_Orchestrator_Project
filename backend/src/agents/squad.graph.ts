import { StateGraph, END, START } from '@langchain/langgraph';
import { BaseMessage } from '@langchain/core/messages';
import { AgentState, AgentProfile } from './agent.types';
import { AgentFactory } from './agent.factory';
import { Injectable } from '@nestjs/common';
import { RunnableConfig } from '@langchain/core/runnables';

@Injectable()
export class SquadGraph {
    constructor(private agentFactory: AgentFactory) { }

    public createGraph() {
        // Define the state channels
        const graphState = {
            messages: {
                value: (x: BaseMessage[], y: BaseMessage[]) => x.concat(y),
                default: () => [],
            },
            next: {
                value: (x: string, y: string) => y,
                default: () => 'CEO',
            },
            squadConfig: {
                value: (x: any, y: any) => y ?? x,
                default: () => ({ agents: [], userGoal: '' }),
            }
        };

        // Initialize StateGraph with the AgentState interface
        const workflow = new StateGraph<AgentState>({
            channels: graphState,
        });

        // --- NODES ---

        // 1. CEO NODE
        workflow.addNode('CEO', async (state: AgentState, config?: RunnableConfig) => {
            const ceoProfile = state.squadConfig?.agents.find(a => a.role === 'CEO');
            if (!ceoProfile) throw new Error('CEO Profile missing');

            const model = this.agentFactory.createAgentRunnable(ceoProfile);
            const systemPrompt = this.agentFactory.getSystemPrompt('CEO');

            // Logic: CEO reviews history and decides next step
            const response = await model.invoke([
                systemPrompt,
                ...(state.messages ?? [])
            ]);

            return {
                messages: [response],
                next: this.determineNextStep(response.content.toString())
            };
        });

        // 2. MARKETING NODE
        workflow.addNode('Marketing', async (state: AgentState) => {
            return this.runSpecialist(state, 'Marketing');
        });

        // 3. CODER NODE
        workflow.addNode('Coder', async (state: AgentState) => {
            return this.runSpecialist(state, 'Coder');
        });

        // 4. DESIGN NODE
        workflow.addNode('Designer', async (state: AgentState) => {
            return this.runSpecialist(state, 'Designer');
        });

        // --- EDGES ---

        // CEO acts as the router
        workflow.addConditionalEdges(
            'CEO' as any,
            (state: AgentState) => state.next,
            {
                'Marketing': 'Marketing',
                'Coder': 'Coder',
                'Designer': 'Designer',
                'FINISH': END
            } as any
        );

        // Specialists always report back to CEO
        workflow.addEdge('Marketing' as any, 'CEO' as any);
        workflow.addEdge('Coder' as any, 'CEO' as any);
        workflow.addEdge('Designer' as any, 'CEO' as any);

        // Entry point fix: Use START constant with casting
        workflow.addEdge(START, 'CEO' as any);

        return workflow.compile();
    }

    private async runSpecialist(state: AgentState, role: AgentProfile['role']) {
        const profile = state.squadConfig?.agents.find(a => a.role === role);
        if (!profile) throw new Error(`${role} Profile missing`);

        const model = this.agentFactory.createAgentRunnable(profile);
        const systemPrompt = this.agentFactory.getSystemPrompt(role);

        const response = await model.invoke([
            systemPrompt,
            ...(state.messages ?? [])
        ]);

        return {
            messages: [response],
            next: 'CEO' // Report back
        };
    }

    private determineNextStep(content: string): string {
        // Core routing
        if (content.includes('DELEGATE: MARKETING')) return 'Marketing';
        if (content.includes('DELEGATE: CODER')) return 'Coder';
        if (content.includes('DELEGATE: DESIGN')) return 'Designer';
        
        // Advanced Managerial routing (Currently halts for Human/System intervention)
        if (content.includes('HIRE:') || content.includes('REQUEST_RESOURCE:') || content.includes('ACTION:')) {
            // In Phase 2, this will route to a 'GraphManager' or 'HumanInbox' node.
            // For now, we treat it as a special stop so the frontend can detect the request.
            return 'FINISH'; 
        }

        if (content.includes('FINISHED')) return 'FINISH';

        return 'FINISH';
    }
}
