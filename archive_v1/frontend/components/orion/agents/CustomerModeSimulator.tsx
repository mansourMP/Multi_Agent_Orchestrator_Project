'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSearchParams } from 'next/navigation';
import { ChatSurface, type ChatDepthOption, type ChatIdentityAction, type ChatIdentitySection } from '@/components/orion/chat/ChatSurface';
import {
  buildChatSessionTitle,
  createChatId,
  createEmptyChatSession,
  type ChatMessageRecord,
  type ChatSessionRecord,
  type ChatStepRecord,
} from '@/components/orion/chat/chatSchema';
import type { WorkspaceAgentInstallRecord } from '@/lib/api';
import { AgentQuickStartGrid } from './AgentQuickStartGrid';
import { useAgentsWorkspace } from './AgentsWorkspaceContext';
import {
  getAgentManifest,
  getBoundSkills,
} from './agentRuntime';

const DEPTH_OPTIONS: ChatDepthOption[] = [
  { value: 'low', label: 'Quick', description: 'Shortest pass' },
  { value: 'medium', label: 'Standard', description: 'Balanced' },
  { value: 'high', label: 'Deep', description: 'More context' },
];

function labelOf(install: WorkspaceAgentInstallRecord): string {
  return String(install.label || install.agent_definition?.name || 'Agent').trim() || 'Agent';
}

type CustomerPreviewPayload = {
  status?: string;
  reply?: string;
  artifact?: Record<string, unknown> | null;
  system_prompt?: string;
  needed_skill_id?: string | null;
  critic?: {
    mode?: string;
    violations?: string[];
  };
  steps?: Array<{
    label?: string;
    detail?: string | null;
    status?: 'active' | 'done' | 'error';
    kind?: 'file' | 'shell' | 'connector' | 'thinking' | 'screenshot';
  }>;
};

async function buildUniversalHarnessReply(
  install: WorkspaceAgentInstallRecord,
  goal: string,
): Promise<ChatMessageRecord> {
  const manifest = getAgentManifest(install);
  const response = await fetch('/api/agents/customer-preview/respond', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      install_id: install.id,
      workspace_id: String(install.workspace_id || '').trim(),
      tenant_id: String(install.tenant_id || '').trim() || undefined,
      customer_message: goal,
      manifest,
      seed_demo_if_empty: true,
    }),
  });

  const payload = await response.json().catch(() => ({})) as CustomerPreviewPayload;
  if (!response.ok) {
    throw new Error(typeof payload.reply === 'string' && payload.reply.trim()
      ? payload.reply.trim()
      : 'My inventory system is currently updating, one moment.');
  }

  return {
    id: createChatId('assistant'),
    role: 'assistant',
    ts: new Date().toISOString(),
    status: 'completed',
    steps: [
      {
        id: createChatId('step'),
        label: 'Loading universal manifest',
        detail: payload.system_prompt?.split('\n').slice(0, 3).join(' · ') || manifest.identity.name,
        status: 'done',
        kind: 'thinking',
      },
      {
        id: createChatId('step'),
        label: 'Binding runtime skills',
        detail: getBoundSkills(install).join(', ') || 'No bound skills',
        status: 'done',
        kind: 'thinking',
      },
      ...((Array.isArray(payload.steps) ? payload.steps : []).map((step) => ({
        id: createChatId('step'),
        label: String(step.label || 'Inventory tool'),
        detail: step.detail || null,
        status: step.status || 'done',
        kind: step.kind || 'connector',
      }))),
      {
        id: createChatId('step'),
        label: payload.critic?.mode === 'rewrite' || payload.critic?.mode === 'escalate'
          ? 'Reflection shield adjusted reply'
          : 'Preparing customer reply',
        detail: payload.critic?.violations?.length
          ? payload.critic.violations.join(', ')
          : payload.needed_skill_id
            ? `Handled through ${payload.needed_skill_id}`
            : 'Manifest-only response',
        status: 'done',
        kind: 'thinking',
      },
    ],
    artifacts: payload.artifact ? [payload.artifact] : [],
    content: String(payload.reply || 'My inventory system is currently updating, one moment.').trim(),
  };
}

function createSession(install: WorkspaceAgentInstallRecord): ChatSessionRecord {
  const now = new Date().toISOString();
  return {
    ...createEmptyChatSession(now, {
      masterAgentInstallId: install.id,
      metadata: {
        workspaceId: install.workspace_id || 'preview',
        surface: 'agent-customer-mode',
      },
    }),
    title: 'Customer mode',
    messages: [],
  };
}

export function CustomerModeSimulator({
  install,
  onRequestOwnerMode,
  isMobile = false,
}: {
  install: WorkspaceAgentInstallRecord;
  onRequestOwnerMode: () => void;
  isMobile?: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { draftAgents } = useAgentsWorkspace();
  const primaryGoalRef = useRef<HTMLTextAreaElement | null>(null);
  const [sessions, setSessions] = useState<ChatSessionRecord[]>(() => [createSession(install)]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [goal, setGoal] = useState('');
  const [selectedDepth, setSelectedDepth] = useState('medium');
  const [identityDrawerOpen, setIdentityDrawerOpen] = useState(false);
  const [chatBusy, setChatBusy] = useState(false);
  const resolvedInstall = useMemo(
    () => draftAgents.find((draft) => draft.id === install.id) || install,
    [draftAgents, install],
  );
  const seededGoal = String(searchParams.get('q') || '').trim();

  useEffect(() => {
    if (!selectedSessionId && sessions[0]?.id) {
      setSelectedSessionId(sessions[0].id);
    }
  }, [selectedSessionId, sessions]);

  useEffect(() => {
    if (seededGoal && !goal.trim()) {
      setGoal(seededGoal);
    }
  }, [goal, seededGoal]);

  const selectedSession = useMemo(
    () => sessions.find((session) => session.id === selectedSessionId) || sessions[0] || createSession(install),
    [install, selectedSessionId, sessions],
  );

  const identitySections = useMemo<ChatIdentitySection[]>(() => [
    {
      title: 'Agent profile',
      note: 'The customer lane should expose only the external-facing truth.',
      items: [
        { label: 'Name', value: labelOf(resolvedInstall), priority: 'high' },
        { label: 'Category', value: String(resolvedInstall.agent_definition?.category || 'Operations') },
        { label: 'Runtime', value: String(resolvedInstall.runtime_profile?.label || 'Web inbox') },
      ],
    },
    {
      title: 'Visibility',
      items: [
        { label: 'Mode', value: 'Customer preview', tone: 'warning' },
        { label: 'Owner oversight', value: 'Enabled', tone: 'success' },
        { label: 'Bound skills', value: String(getBoundSkills(resolvedInstall).length || 0) },
      ],
    },
  ], [resolvedInstall]);

  const identityActions = useMemo<ChatIdentityAction[]>(() => [
    {
      label: 'Open Sage',
      onClick: () => router.push('/'),
      priority: 'primary',
    },
  ], [router]);

  const handleNewChat = () => {
    const next = createSession(resolvedInstall);
    setSessions((current) => [next, ...current]);
    setSelectedSessionId(next.id);
    setGoal('');
  };

  const queueQuickStartPrompt = (value: string) => {
    setGoal(value);
    window.requestAnimationFrame(() => {
      primaryGoalRef.current?.focus();
    });
  };

  const handleSend = async () => {
    const nextGoal = goal.trim();
    if (!nextGoal || chatBusy) return;
    const now = new Date().toISOString();
    const sessionId = selectedSession.id;
    const userMessage: ChatMessageRecord = {
      id: createChatId('user'),
      role: 'user',
      content: nextGoal,
      ts: now,
      status: 'completed',
    };
    setSessions((current) => current.map((session) => {
      if (session.id !== sessionId) return session;
      const messages = [...session.messages, userMessage];
      return {
        ...session,
        title: buildChatSessionTitle(messages),
        updatedAt: now,
        messages,
      };
    }));
    setGoal('');
    setChatBusy(true);

    try {
      const assistantMessage = await buildUniversalHarnessReply(resolvedInstall, nextGoal);

      setSessions((current) => current.map((session) => {
        if (session.id !== sessionId) return session;
        const messages = [...session.messages, assistantMessage];
        return {
          ...session,
          title: buildChatSessionTitle(messages),
          updatedAt: new Date().toISOString(),
          messages,
        };
      }));
    } catch (error) {
      const fallbackMessage: ChatMessageRecord = {
        id: createChatId('assistant'),
        role: 'assistant',
        ts: new Date().toISOString(),
        status: 'completed',
        steps: [
          { id: createChatId('step'), label: 'Resolving inventory query', detail: nextGoal, status: 'done', kind: 'thinking' },
          { id: createChatId('step'), label: 'Inventory tool unavailable', detail: 'Database timeout or runtime failure', status: 'error', kind: 'connector' },
        ],
        content: error instanceof Error && error.message.trim()
          ? error.message.trim()
          : 'My inventory system is currently updating, one moment.',
      };
      setSessions((current) => current.map((session) => {
        if (session.id !== sessionId) return session;
        const messages = [...session.messages, fallbackMessage];
        return {
          ...session,
          title: buildChatSessionTitle(messages),
          updatedAt: new Date().toISOString(),
          messages,
        };
      }));
    } finally {
      setChatBusy(false);
    }
  };

  return (
    <ChatSurface
      isMobile={isMobile}
      sessions={sessions}
      selectedSessionId={selectedSession.id}
      onSelectSession={setSelectedSessionId}
      onNewChat={handleNewChat}
      historyEnabled={false}
      goal={goal}
      setGoal={setGoal}
      primaryGoalRef={primaryGoalRef}
      onSend={() => { void handleSend(); }}
      chatBusy={chatBusy}
      messages={selectedSession.messages}
      targetLabel={labelOf(resolvedInstall)}
      targetHref="/agents"
      selectedModel=""
      modelOptions={[]}
      onSelectModel={() => {}}
      trustLabel="Customer Mode · Preview transcript"
      selectedDepth={selectedDepth}
      depthLabel="Reasoning"
      depthOptions={DEPTH_OPTIONS}
      onSelectDepth={setSelectedDepth}
      identityDrawerOpen={identityDrawerOpen}
      onToggleIdentityDrawer={() => setIdentityDrawerOpen((current) => !current)}
      onCloseIdentityDrawer={() => setIdentityDrawerOpen(false)}
      identitySections={identitySections}
      identityActions={identityActions}
      emptyStateSupplemental={(
        <AgentQuickStartGrid
          onTestCustomerData={() => queueQuickStartPrompt('I need front brake pads and rotors for a 2019 Toyota Camry SE. Can you confirm fitment, stock, and price?')}
          onConfigureBible={onRequestOwnerMode}
          onViewInventoryTool={() => queueQuickStartPrompt('Do you have 2022 Tesla Model 3 wipers?')}
        />
      )}
      shellNotice={{
        id: 'customer-mode-preview',
        tone: 'accent',
        label: 'Customer Mode now runs through the Universal Harness',
        detail: 'The manifest, skill registry, and reflection shield decide whether the channel answers directly, invokes a skill, or escalates.',
      }}
    />
  );
}
