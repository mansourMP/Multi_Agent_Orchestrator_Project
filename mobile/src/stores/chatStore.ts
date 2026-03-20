import { create } from 'zustand';
import { nanoid } from 'nanoid/non-secure';
import { AgentPayload } from '../components/Renderer';

export type ChatSession = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: AgentPayload[];
};

type ChatState = {
  sessions: ChatSession[];
  activeSessionId: string | null;
  createSession: () => string;
  setActiveSession: (id: string) => void;
  addMessage: (id: string, message: AgentPayload) => void;
  setSessionTitle: (id: string, title: string) => void;
  clearAllSessions: () => void;
};

export const useChatStore = create<ChatState>((set, get) => ({
  sessions: [],
  activeSessionId: null,
  clearAllSessions: () => set({ sessions: [], activeSessionId: null }),
  createSession: () => {
    const id = nanoid();
    const now = Date.now();
    const session: ChatSession = {
      id,
      title: 'New Chat',
      createdAt: now,
      updatedAt: now,
      messages: [],
    };
    set((state) => ({
      sessions: [session, ...state.sessions],
      activeSessionId: id,
    }));
    return id;
  },
  setActiveSession: (id) => set({ activeSessionId: id }),
  addMessage: (id, message) => {
    set((state) => {
      let updatedSession: ChatSession | null = null;
      const others = state.sessions.filter((session) => {
        if (session.id !== id) return true;
        updatedSession = {
          ...session,
          messages: [...session.messages, message],
          updatedAt: Date.now(),
        };
        return false;
      });
      if (!updatedSession) return { sessions: state.sessions };
      return { sessions: [updatedSession, ...others] };
    });
  },
  setSessionTitle: (id, title) => {
    const trimmed = title.trim();
    if (!trimmed) return;
    set((state) => ({
      sessions: state.sessions.map((session) =>
        session.id === id ? { ...session, title: trimmed, updatedAt: Date.now() } : session
      ),
    }));
  },
}));
