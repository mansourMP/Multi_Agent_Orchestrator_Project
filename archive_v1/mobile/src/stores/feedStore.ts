import { create } from 'zustand';
import { Block } from '../components/Canvas';

interface FeedState {
  blocks: Block[];
  isLoading: boolean;
  setBlocks: (blocks: Block[]) => void;
  addBlock: (block: Block) => void;
  setLoading: (isLoading: boolean) => void;
}

export const useFeedStore = create<FeedState>((set) => ({
  blocks: [],
  isLoading: false,
  setBlocks: (blocks) => set({ blocks }),
  addBlock: (block) => set((state) => ({ blocks: [...state.blocks, block] })),
  setLoading: (isLoading) => set({ isLoading }),
}));
