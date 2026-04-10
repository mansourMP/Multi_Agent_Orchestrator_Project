import AsyncStorage from "@react-native-async-storage/async-storage";
import { nanoid } from "nanoid/non-secure";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { AgentPayload } from "../components/Renderer";
import type { AgentThread } from "../lib/agents";

export type ChatSession = {
  id: string;
  title: string;
  agentId: string;
  agentName: string;
  runtimeRole?: string;
  avatarColor: string;
  icon: string;
  createdAt: number;
  updatedAt: number;
  messages: AgentPayload[];
};

type ChatState = {
  sessions: ChatSession[];
  activeSessionId: string | null;
  createSession: (agent: AgentThread) => string;
  ensureSessionForAgent: (agent: AgentThread) => string;
  setActiveSession: (id: string) => void;
  addMessage: (id: string, message: AgentPayload) => void;
  updateMessage: (id: string, index: number, patch: Partial<AgentPayload>) => void;
  setSessionTitle: (id: string, title: string) => void;
  clearAllSessions: () => void;
};

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      sessions: [],
      activeSessionId: null,
      clearAllSessions: () => set({ sessions: [], activeSessionId: null }),
      createSession: (agent) => {
        const id = nanoid();
        const now = Date.now();
        const session: ChatSession = {
          id,
          title: "New thread",
          agentId: agent.id,
          agentName: agent.label,
          runtimeRole: agent.runtimeRole,
          avatarColor: agent.avatarColor,
          icon: agent.icon,
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
      ensureSessionForAgent: (agent) => {
        const existing = get().sessions.find((session) => session.agentId === agent.id);
        if (existing) {
          set({ activeSessionId: existing.id });
          return existing.id;
        }
        return get().createSession(agent);
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
      updateMessage: (id, index, patch) => {
        set((state) => {
          let updatedSession: ChatSession | null = null;
          const others = state.sessions.filter((session) => {
            if (session.id !== id) return true;
            if (index < 0 || index >= session.messages.length) {
              updatedSession = session;
              return false;
            }
            updatedSession = {
              ...session,
              messages: session.messages.map((message, messageIndex) =>
                messageIndex === index ? { ...message, ...patch } : message
              ),
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
    }),
    {
      name: "empyralis.mobile.chat.v1",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        sessions: state.sessions,
        activeSessionId: state.activeSessionId,
      }),
    },
  ),
);
