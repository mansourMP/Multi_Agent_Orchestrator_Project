export interface AgentProfile {
    role: 'CEO' | 'Marketing' | 'Coder' | 'Designer';
    provider: 'openai' | 'anthropic' | 'google' | 'deepseek';
    modelId: string; // e.g., 'gpt-4o', 'claude-3-5-sonnet', 'deepseek-chat'
    temperature?: number;
}

export interface SquadConfig {
    agents: AgentProfile[];
    userGoal: string;
}

export interface AgentState {
    messages: any[]; // BaseMessage[]
    next: string;
    squadConfig?: SquadConfig;
}
