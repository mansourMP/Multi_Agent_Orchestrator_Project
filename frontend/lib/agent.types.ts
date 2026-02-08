export interface AgentProfile {
    role: 'CEO' | 'Marketing' | 'Coder' | 'Designer';
    provider: 'openai' | 'anthropic' | 'google';
    modelId: string; // e.g., 'gpt-4o', 'claude-3-5-sonnet'
    temperature?: number;
}

export interface SquadConfig {
    agents: AgentProfile[];
    userGoal: string;
}

export const DEFAULT_SQUAD: AgentProfile[] = [
    { role: 'CEO', provider: 'google', modelId: 'gemini-1.5-pro', temperature: 0.7 },
    { role: 'Marketing', provider: 'openai', modelId: 'gpt-4o', temperature: 0.9 },
    { role: 'Coder', provider: 'anthropic', modelId: 'claude-3-5-sonnet-20240620', temperature: 0.2 },
    { role: 'Designer', provider: 'openai', modelId: 'dall-e-3', temperature: 1.0 }, // Special handling for image gen?
];
