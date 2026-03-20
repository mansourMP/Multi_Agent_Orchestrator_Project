import { nanoid } from 'nanoid';
import { Block, BlockType } from '../components/Canvas';

export const parseAIResponse = (text: string): Block[] => {
  const lines = text.split('\n');
  const blocks: Block[] = [];
  let currentTextMessage = '';

  const flushTextMessage = () => {
    if (currentTextMessage.trim()) {
      blocks.push({
        id: nanoid(),
        type: 'text',
        timestamp: Date.now(),
        data: { role: 'agent', message: currentTextMessage.trim() }
      });
      currentTextMessage = '';
    }
  };

  lines.forEach((line) => {
    if (line.startsWith('BLOCK::')) {
      // First flush any accumulated text
      flushTextMessage();

      try {
        const jsonStr = line.replace('BLOCK::', '').trim();
        const blockData = JSON.parse(jsonStr);
        
        blocks.push({
          id: nanoid(),
          type: blockData.type as BlockType,
          timestamp: Date.now(),
          data: blockData
        });
      } catch (error) {
        console.error('Error parsing BLOCK:: directive:', error);
        // If it fails to parse as JSON, treat it as regular text
        currentTextMessage += (currentTextMessage ? '\n' : '') + line;
      }
    } else {
      currentTextMessage += (currentTextMessage ? '\n' : '') + line;
    }
  });

  // Final flush
  flushTextMessage();

  return blocks;
};
