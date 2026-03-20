export const getLocalVectorDBContext = async (userInput: string) => {
  // Placeholder for vector DB logic
  return { context: 'Local user preferences and past activity' };
};

export const handleRequest = async (userInput: string) => {
  const context = await getLocalVectorDBContext(userInput);
  const prompt = `User said: ${userInput}. Context: ${JSON.stringify(context)}. 
                  Return JSON with "intent", "speech", and optional "ui" props.`;

  // We are currently pointing to a generic node server on port 3000 locally, 
  // or exactly 11434 if hitting ollama directly. As per the blueprint:
  try {
    const ollamaResponse = await fetch('http://127.0.0.1:11434/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        model: 'llama3', 
        prompt, 
        format: 'json',
        stream: false 
      })
    });
    
    if (!ollamaResponse.ok) {
       return { intent: 'error', speech: 'Server returned ' + ollamaResponse.status };
    }
    
    const data = await ollamaResponse.json();
    return JSON.parse(data.response);
  } catch (error) {
    console.warn("Falling back! Couldn't reach Mac Mini Server API at 11434:", error);
    // Return a mocked AgentResponse matching the blueprint for graceful fallback during dev
    return {
      intent: 'offline',
      speech: ''
    };
  }
};
