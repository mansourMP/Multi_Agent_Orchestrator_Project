export interface AgentProfile {
    role: string;
    provider: string;
    modelId: string; // e.g., 'gpt-4o', 'claude-3-5-sonnet'
    temperature?: number;
}

export interface SquadConfig {
    agents: AgentProfile[];
    userGoal: string;
}

export const DEFAULT_SQUAD: AgentProfile[] = [
    { role: 'Operator', provider: 'openai', modelId: 'gpt-4o', temperature: 0.2 },
];
