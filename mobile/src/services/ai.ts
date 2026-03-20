import { getContextSummary } from './context';
import { queryAll } from './db';

interface AIConfig {
  USE_LOCAL: boolean;
  OLLAMA_URL: string;
  OLLAMA_MODEL: string;
  CLAUDE_API_KEY: string;
  CLAUDE_MODEL: string;
}

const loadAIConfig = async (): Promise<AIConfig> => {
  const config = {
    USE_LOCAL: true,
    OLLAMA_URL: 'http://127.0.0.1:11434',
    OLLAMA_MODEL: 'llama3.2',
    CLAUDE_API_KEY: '',
    CLAUDE_MODEL: 'claude-3-5-sonnet-20240620'
  };

  try {
    const settings = await queryAll<{key: string, value: string}>('SELECT * FROM settings');
    settings.forEach(s => {
      if (s.key === 'USE_LOCAL') config.USE_LOCAL = s.value === 'true';
      if (s.key === 'OLLAMA_URL') config.OLLAMA_URL = s.value;
      if (s.key === 'CLAUDE_API_KEY') config.CLAUDE_API_KEY = s.value;
    });
  } catch (error) {
    console.error('Failed to load AI settings, using defaults');
  }

  return config;
};

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export const getAIResponse = async (history: Message[]): Promise<string> => {
  const context = await getContextSummary();
  const config = await loadAIConfig();
  
  const systemPrompt = `
${context}

You are a personal AI assistant. Help the user with nutrition, sleep, study, goals, finances, work, and brainstorming. 
When the user logs data, include a BLOCK:: directive on its own line so the app can render a card. 
Format: BLOCK::{"type": "block_type", ...other_data}. 
Block types: text, calories_card, sleep_card, goal_card, study_card, finance_card, image, pdf.

Example: If user says "I ate a 500 calorie burger", you might respond:
"Logged that for you.
BLOCK::{"type": "calories_card", "consumed": 500, "goal": 2200}"

Be direct, helpful, and concise.
`.trim();

  const messages: Message[] = [
    { role: 'system', content: systemPrompt },
    ...history.slice(-20)
  ];

  if (config.USE_LOCAL) {
    try {
      const response = await fetch(`${config.OLLAMA_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: config.OLLAMA_MODEL,
          messages: messages,
          stream: false
        })
      });

      if (!response.ok) throw new Error('Ollama connection failed');
      
      const data = await response.json();
      return data.message.content;
    } catch (error) {
      console.warn('Local AI failed, attempting fallback...', error);
      if (config.CLAUDE_API_KEY) {
        return await callClaude(messages, config);
      }
      throw new Error('AI unavailable. Check connection or local server.');
    }
  } else {
    return await callClaude(messages, config);
  }
};

const callClaude = async (messages: Message[], config: AIConfig): Promise<string> => {
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.CLAUDE_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: config.CLAUDE_MODEL,
        max_tokens: 1024,
        messages: messages.filter(m => m.role !== 'system'),
        system: messages.find(m => m.role === 'system')?.content
      })
    });

    if (!response.ok) throw new Error('Claude API failed');
    
    const data = await response.json();
    return data.content[0].text;
  } catch (error) {
    console.error('Claude API Error:', error);
    throw error;
  }
};
