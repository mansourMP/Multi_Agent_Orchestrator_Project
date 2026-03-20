import React from 'react';
import { TextBlock } from './blocks/TextBlock';
import { CaloriesCard } from './blocks/CaloriesCard';
import { SleepCard } from './blocks/SleepCard';
import { GoalCard } from './blocks/GoalCard';
import { StudyCard } from './blocks/StudyCard';
import { FinanceCard } from './blocks/FinanceCard';
import { ImageBlock } from './blocks/ImageBlock';
import { PDFBlock } from './blocks/PDFBlock';

export type BlockType = 
  | 'text' 
  | 'calories_card' 
  | 'sleep_card' 
  | 'goal_card' 
  | 'study_card' 
  | 'finance_card' 
  | 'image' 
  | 'pdf'
  | 'widget';

export interface Block {
  id: string;
  type: BlockType;
  timestamp: number;
  data: any;
}

interface CanvasProps {
  block: Block;
}

export const Canvas: React.FC<CanvasProps> = ({ block }) => {
  const { type, data } = block;

  switch (type) {
    case 'text':
      return <TextBlock role={data.role} message={data.message} />;
    
    case 'calories_card':
      return <CaloriesCard consumed={data.consumed} goal={data.goal} />;
    
    case 'sleep_card':
      return <SleepCard hours={data.hours} quality={data.quality} />;
    
    case 'goal_card':
      return <GoalCard title={data.title} progress={data.progress} target={data.target} />;
    
    case 'study_card':
      return <StudyCard subject={data.subject} streak={data.streak} nextTopic={data.nextTopic} />;
    
    case 'finance_card':
      return <FinanceCard spent={data.spent} budget={data.budget} period={data.period} />;
    
    case 'image':
      return <ImageBlock uri={data.uri} />;
    
    case 'pdf':
      return <PDFBlock uri={data.uri} title={data.title} />;
    
    default:
      return null;
  }
};
