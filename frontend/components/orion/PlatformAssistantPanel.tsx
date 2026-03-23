'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Bot, ChevronLeft, MessageSquare, Send, Sparkles, X } from 'lucide-react';
import { SINGLE_AGENT_MODE } from '@/lib/appFlags';
import { safeNavigate } from '@/lib/safeNavigate';

type AssistantPanelMode = 'open' | 'collapsed' | 'hidden';
type AssistantAccessMode = 'default' | 'full';
type AssistantRole = 'assistant' | 'user';
type AssistantMessage = {
  id: string;
  role: AssistantRole;
  text: string;
  ts: string;
};

type PageGuide = {
  title: string;
  purpose: string;
  actions: string[];
  nextSteps: string[];
  sections: string[];
};

const PANEL_MODE_STORAGE_KEY = 'empyralis.platform.assistant.mode.v1';
const LEGACY_PANEL_MODE_STORAGE_KEY = 'orion.platform.assistant.mode.v1';
export const EMPYRALIS_ASSISTANT_OPEN_EVENT = 'empyralis:assistant-open';
export const LEGACY_ORION_ASSISTANT_OPEN_EVENT = 'orion:assistant-open';

const STARTER_PROMPTS = [
  'What should I do next?',
  'Explain this page',
  'Find a setting',
];

const QUICK_NAV_ITEMS = [
  { label: 'Home', path: '/home' },
  { label: 'Chat', path: '/' },
  { label: 'Builder', path: '/builder' },
  { label: 'Workflows', path: '/workflows' },
  { label: 'Runs', path: '/executions' },
  { label: 'Integrations', path: '/credentials' },
  { label: 'Assets', path: '/artifacts' },
  { label: 'Usage', path: '/usage' },
  { label: 'Settings', path: '/settings' },
];

function createMessage(role: AssistantRole, text: string): AssistantMessage {
  return {
    id: `${role}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`,
    role,
    text,
    ts: new Date().toISOString(),
  };
}

function resolvePageGuide(pathname: string): PageGuide {
  if (pathname === '/home') {
    return {
      title: 'Home',
      purpose: 'Review your workspace and jump into the next workflow or run.',
      actions: [
        'Review recent workflows.',
        'Start a new workflow.',
        'Jump into runs or integrations from quick actions.',
      ],
      nextSteps: ['Start from Home.', 'Open Builder when you need a new workflow.', 'Review recent workflows below.'],
      sections: ['Quick actions', 'Recent workflows'],
    };
  }
  if (pathname === '/') {
    return {
      title: 'Chat',
      purpose: 'Talk to the assistant directly and work through live requests.',
      actions: ['Start a conversation.', 'Ask for help with workflows or runs.', 'Use Home when you need a clearer starting point.'],
      nextSteps: ['State the goal clearly.', 'Ask for the next action.', 'Jump to Builder or Runs if needed.'],
      sections: ['Conversation', 'Context', 'Suggested actions'],
    };
  }
  if (pathname === '/builder') {
    return {
      title: 'Agent Builder',
      purpose: 'Browse drafts and templates before entering the workflow editor.',
      actions: [
        'Create a new workflow.',
        'Open an existing draft.',
        'Start from a template when you need a faster starting point.',
      ],
      nextSteps: ['Choose Create or open a draft.', 'Enter the editor only when you are ready to build.', 'Return here to manage drafts.'],
      sections: ['Create hero', 'Drafts', 'Templates'],
    };
  }
  if (pathname.startsWith('/builder/')) {
    return {
      title: 'Workflow Editor',
      purpose: 'Design a workflow visually and use AI guidance without cluttering the main assistant chat.',
      actions: [
        'Describe the workflow you want to build.',
        'Shape the graph on the canvas.',
        'Evaluate and publish when the workflow is ready.',
      ],
      nextSteps: ['Define the workflow goal.', 'Shape the graph.', 'Save or publish when ready.'],
      sections: ['Canvas', 'Builder AI', 'Node palette', 'Toolbar'],
    };
  }
  if (pathname.startsWith('/workflows/')) {
    return {
      title: 'Automation Editor',
      purpose: 'Design and run reusable automations.',
      actions: [
        'Edit flow logic and operator goal.',
        'Run and inspect live activity.',
        'Save and re-run as a reusable system.',
      ],
      nextSteps: ['Review mode.', 'Update goal.', 'Run and validate output.'],
      sections: ['Workflow canvas', 'Operator settings', 'Live activity', 'Run controls'],
    };
  }
  if (pathname === '/workflows') {
    return {
      title: 'Workflows',
      purpose: 'Manage reusable systems and open editors.',
      actions: ['Create a new automation.', 'Search and duplicate automations.', 'Open an automation to edit or run.'],
      nextSteps: ['Create or open automation.', 'Verify status.', 'Run from editor.'],
      sections: ['Metrics strip', 'Automation list', 'Create modal'],
    };
  }
  if (pathname === '/approvals') {
    return {
      title: 'Approvals',
      purpose: 'Review decisions before the platform takes sensitive actions.',
      actions: ['Approve or hold pending runs.', 'Filter by agent and channel.', 'Inspect related runs.'],
      nextSteps: ['Open pending tab.', 'Resolve high-priority items.', 'Review history for patterns.'],
      sections: ['Pending', 'History', 'Filters', 'Inspect links'],
    };
  }
  if (pathname === '/agents') {
    return {
      title: 'Agents',
      purpose: 'Inspect workers, live collaborations, and current workload when automation needs more visibility.',
      actions: ['Open a worker view.', 'Check active work and blockers.', 'Review runs, files, and channels when needed.'],
      nextSteps: ['Pick a worker.', 'Check current work.', 'Resolve blockers or approvals.'],
      sections: ['Collaboration view', 'Worker directory', 'Worker workspace tabs', 'Inspect drawer'],
    };
  }
  if (pathname === '/team') {
    return {
      title: 'Team',
      purpose: 'Manage people, roles, and who can access or change this platform.',
      actions: ['Review owners, admins, operators, and viewers.', 'Check who has access to the platform.', 'Open account or settings when identity changes are needed.'],
      nextSteps: ['Confirm who owns the platform.', 'Review admin access.', 'Adjust identity or settings if needed.'],
      sections: ['Role overview', 'Member list', 'Access notes', 'Platform identity'],
    };
  }
  if (pathname === '/executions') {
    return {
      title: 'Runs',
      purpose: 'Track execution history and inspect outcomes.',
      actions: ['Search and filter runs.', 'Open inspect view.', 'Review route, approvals, and artifacts.'],
      nextSteps: ['Find recent failed/waiting runs.', 'Open inspect.', 'Apply next action.'],
      sections: ['Run list', 'Filters', 'Inspect links', 'Status chips'],
    };
  }
  if (pathname.startsWith('/runs/')) {
    return {
      title: 'Run Inspect',
      purpose: 'Understand exactly what happened in one run.',
      actions: ['Read timeline and logs.', 'Review approvals and artifacts.', 'Copy receipt and follow-up actions.'],
      nextSteps: ['Check status.', 'Review evidence.', 'Apply follow-up action.'],
      sections: ['Summary', 'Timeline', 'Approvals', 'Outputs', 'Execution details'],
    };
  }
  if (pathname === '/artifacts') {
    return {
      title: 'Assets',
      purpose: 'Browse finished work, supporting evidence, and deeper traces produced by runs.',
      actions: ['Switch between deliverables, evidence, and system traces.', 'Open the related run inspect view.', 'Use outputs in follow-up work.'],
      nextSteps: ['Find the latest result.', 'Open the source run if you need more context.', 'Decide the next follow-up action.'],
      sections: ['File views', 'Result list', 'Preview rail', 'Filters'],
    };
  }
  if (pathname === '/credentials') {
    return {
      title: 'Integrations',
      purpose: 'Connect the tools and channels your platform can use.',
      actions: [
        'Link a native connector now.',
        'Review the recommended next channels like Discord and Instagram Business.',
        'Check what the assistant can access and who owns each connection.',
      ],
      nextSteps: ['Add a live connector.', 'Pick the next rollout path.', 'Test and confirm status.'],
      sections: ['Connected tools', 'Ship next', 'Connector catalog', 'Status'],
    };
  }
  if (pathname === '/setup') {
    return {
      title: 'Setup',
      purpose: 'Get the assistant ready with platform access, account mode, and optional tools.',
      actions: ['Check platform access.', 'Choose assistant account mode.', 'Connect tools only if needed.'],
      nextSteps: ['Finish all 3 onboarding steps.', 'Return to Home.', 'Start work.'],
      sections: ['Platform access', 'Account mode', 'Tools'],
    };
  }
  if (pathname === '/settings' || pathname === '/account') {
    return {
      title: 'Settings',
      purpose: 'Manage platform preferences and account details.',
      actions: ['Update platform preferences.', 'Review account configuration.', 'Adjust system behavior.'],
      nextSteps: ['Open relevant section.', 'Apply change.', 'Verify effect in Home.'],
      sections: ['Preferences', 'Account', 'System options'],
    };
  }
  return {
    title: 'Platform',
    purpose: 'Navigate and operate the platform with contextual help.',
    actions: ['Ask what this page is for.', 'Ask where to perform an action.', 'Ask for a step-by-step next move.'],
    nextSteps: ['Tell me your goal.', 'I will map the best page and actions.'],
    sections: ['Page context', 'Suggested actions'],
  };
}

function bullet(items: string[], max = 4): string {
  return items.slice(0, max).map((item) => `• ${item}`).join('\n');
}

function locationHint(question: string): string | null {
  const q = question.toLowerCase();
  if (q.includes('setting') || q.includes('theme') || q.includes('preference')) {
    return 'Open Settings for configuration changes.';
  }
  if (q.includes('approval') || q.includes('permission')) {
    return 'Open Approvals to resolve waiting decisions.';
  }
  if (q.includes('automation') || q.includes('workflow')) {
    return 'Open Automations to create or edit reusable systems.';
  }
  if (q.includes('run') || q.includes('history')) {
    return 'Open Activity to inspect execution history and details.';
  }
  if (q.includes('artifact') || q.includes('file') || q.includes('output')) {
    return 'Open Files to review finished work and traces from runs.';
  }
  if (q.includes('agent') || q.includes('worker') || q.includes('orchestrator')) {
    return SINGLE_AGENT_MODE
      ? 'Open Assistant to inspect inbox sessions, live channels, and the current assistant.'
      : 'Open Agents to inspect workers, collaborations, and blockers.';
  }
  if (q.includes('workspace') || q.includes('routing') || q.includes('inspect')) {
    return SINGLE_AGENT_MODE
      ? 'Open Admin or Chat when you need inspection detail, approvals, or tighter assistant controls.'
      : 'Open Chat when you need advanced routing, inspect detail, or deck controls.';
  }
  if (q.includes('team') || q.includes('owner') || q.includes('admin') || q.includes('viewer') || q.includes('role')) {
    return 'Open Team to manage people, roles, and platform access.';
  }
  if (q.includes('integration') || q.includes('telegram') || q.includes('whatsapp') || q.includes('google')) {
    return 'Open Connections to manage connected tools and accounts.';
  }
  if (q.includes('setup') || q.includes('runtime') || q.includes('api key')) {
    return 'Open Setup to finish platform access, account mode, and optional tools.';
  }
  return null;
}

function normalizePathForNav(pathname: string): string {
  if (pathname === '/control-center') return '/control-center';
  if (pathname === '/builder' || pathname.startsWith('/builder/')) return '/builder';
  if (pathname.startsWith('/workflows/')) return '/workflows';
  if (pathname === '/executions' || pathname.startsWith('/runs/')) return '/executions';
  if (pathname === '/account') return '/settings';
  if (pathname.startsWith('/team')) return '/team';
  if (pathname === '/usage') return '/usage';
  if (QUICK_NAV_ITEMS.some((item) => item.path === pathname)) return pathname;
  return '/home';
}

function buildReply(input: string, guide: PageGuide, accessMode: AssistantAccessMode): string {
  const q = input.trim().toLowerCase();
  const accessNote =
    accessMode === 'full'
      ? '\n\nFull access mode is enabled, so I can include settings, integrations, and admin-level paths.'
      : '\n\nDefault access mode is enabled, so I will keep guidance focused on normal user actions first.';
  if (!q) return `You are on ${guide.title}. Ask about this page, and I will guide the next step.`;

  if (q.includes('what can i do') || q.includes('this page')) {
    return `You are on ${guide.title}.\n${guide.purpose}\n\nYou can do:\n${bullet(guide.actions)}\n\nLikely next steps:\n${bullet(guide.nextSteps)}${accessNote}`;
  }

  if (q.includes('what should i do next') || q.includes('next step')) {
    return `Best next steps on ${guide.title}:\n${bullet(guide.nextSteps)}\n\nThen confirm in these sections:\n${bullet(guide.sections, 3)}${accessNote}`;
  }

  if (q.includes('explain this section') || q.includes('purpose of this section')) {
    return `Main sections here:\n${bullet(guide.sections)}\n\nTell me the section name and I will break it down step by step.`;
  }

  if (q.includes('where') || q.includes('find') || q.includes('change')) {
    const hint = locationHint(q);
    if (hint) return `${hint}\n\nCurrent page context: ${guide.title} — ${guide.purpose}`;
  }

  if (q.includes('not working') || q.includes('why is this not working') || q.includes('broken') || q.includes('error')) {
    return `Quick troubleshooting:\n• Confirm Setup is complete (platform access/account mode/tools).\n• Check Approvals for waiting decisions.\n• Open Activity and inspect the latest failed run.\n• Verify Connections if the task uses channel actions.`;
  }

  if (q.includes('button')) {
    return `I can explain any button here.\nShare the button label exactly, and I will tell you what it does and when to use it.`;
  }

  return `On ${guide.title}, here is the practical move:\n${bullet(guide.nextSteps, 3)}\n\nIf you want, I can guide one click at a time.${accessNote}`;
}

export default function PlatformAssistantPanel() {
  const pathname = usePathname();
  const hiddenOnRoute = pathname === '/credentials' || pathname === '/artifacts';
  const isChatRoute = pathname === '/';
  const guide = useMemo(() => resolvePageGuide(pathname || '/'), [pathname]);
  const [mode, setMode] = useState<AssistantPanelMode>('collapsed');
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [contextEnabled] = useState(true);
  const [accessMode] = useState<AssistantAccessMode>('default');
  const [targetPath, setTargetPath] = useState('');
  const listRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const currentNavPath = useMemo(() => normalizePathForNav(pathname || '/'), [pathname]);
  const navigationTarget = targetPath || currentNavPath;
  const effectiveMode: AssistantPanelMode = isChatRoute && mode === 'hidden' ? 'collapsed' : mode;

  useEffect(() => {
    const syncStoredMode = window.setTimeout(() => {
      try {
        const stored =
          window.localStorage.getItem(PANEL_MODE_STORAGE_KEY) ??
          window.localStorage.getItem(LEGACY_PANEL_MODE_STORAGE_KEY);
        if (stored === 'open' || stored === 'collapsed' || stored === 'hidden') {
          setMode(stored);
        }
      } catch {
        // ignore local storage read issues
      }
    }, 0);

    return () => {
      window.clearTimeout(syncStoredMode);
    };
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(PANEL_MODE_STORAGE_KEY, mode);
      window.localStorage.removeItem(LEGACY_PANEL_MODE_STORAGE_KEY);
    } catch {
      // ignore local storage write issues
    }
  }, [mode]);

  useEffect(() => {
    if (!listRef.current) return;
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [effectiveMode, messages]);

  useEffect(() => {
    const offset = hiddenOnRoute ? '0px' : effectiveMode === 'open' ? '352px' : '0px';
    document.documentElement.style.setProperty('--orion-assistant-offset', offset);
    return () => {
      document.documentElement.style.setProperty('--orion-assistant-offset', '0px');
    };
  }, [effectiveMode, hiddenOnRoute]);

  useEffect(() => {
    const openAssistant = () => {
      setMode('open');
      window.setTimeout(() => inputRef.current?.focus(), 60);
    };
    window.addEventListener(EMPYRALIS_ASSISTANT_OPEN_EVENT, openAssistant);
    window.addEventListener(LEGACY_ORION_ASSISTANT_OPEN_EVENT, openAssistant);
    return () => {
      window.removeEventListener(EMPYRALIS_ASSISTANT_OPEN_EVENT, openAssistant);
      window.removeEventListener(LEGACY_ORION_ASSISTANT_OPEN_EVENT, openAssistant);
    };
  }, []);

  const sendQuestion = (value: string) => {
    const text = value.trim();
    if (!text) return;
    const effectiveGuide = contextEnabled
      ? guide
      : {
          title: 'General Help',
          purpose: 'Context mode is off. Turn it on for page-specific guidance.',
          actions: ['Ask general questions about workflows, runs, approvals, agents, or settings.'],
          nextSteps: ['Turn Context on for precise page guidance.', 'Describe your goal in one line.'],
          sections: ['General help'],
        };
    const user = createMessage('user', text);
    const assistant = createMessage('assistant', buildReply(text, effectiveGuide, accessMode));
    setMessages((prev) => [...prev, user, assistant]);
    setInput('');
  };

  if (hiddenOnRoute) {
    return null;
  }

  if (effectiveMode === 'hidden') {
    return (
      <button
        type="button"
        onClick={() => setMode('open')}
        style={{
          position: 'fixed',
          right: 14,
          bottom: 14,
          zIndex: 95,
          borderRadius: 999,
          border: '1px solid var(--primary-border-soft)',
          background: 'var(--primary-soft)',
          color: 'var(--text-primary)',
          minHeight: 38,
          padding: '0 12px',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 7,
          fontSize: 12.5,
          fontWeight: 700,
          cursor: 'pointer',
        }}
      >
        <MessageSquare size={14} />
        AI
      </button>
    );
  }

  if (effectiveMode === 'collapsed') {
    return (
      <button
        type="button"
        onClick={() => setMode('open')}
        title="Open assistant"
        style={{
          position: 'fixed',
          top: 92,
          right: 12,
          zIndex: 95,
          width: 30,
          minHeight: 84,
          borderRadius: 15,
          border: '1px solid color-mix(in srgb, var(--border-default) 76%, transparent 24%)',
          background: 'color-mix(in srgb, var(--bg-surface) 94%, transparent 6%)',
          color: 'var(--text-secondary)',
          display: 'grid',
          gridTemplateRows: 'auto auto',
          alignContent: 'center',
          justifyItems: 'center',
          gap: 5,
          padding: '9px 0',
          cursor: 'pointer',
          boxShadow: '0 10px 24px rgba(0, 0, 0, 0.12)',
        }}
      >
        <Sparkles size={12} />
        <div style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', lineHeight: 1 }}>
          AI
        </div>
      </button>
    );
  }

  return (
    <aside
      style={{
        position: 'fixed',
        top: 12,
        right: 12,
        bottom: 12,
        width: 'min(296px, calc(100vw - 24px))',
        borderRadius: 14,
        border: '1px solid color-mix(in srgb, var(--border-default) 82%, transparent 18%)',
        background: 'color-mix(in srgb, var(--bg-surface) 96%, transparent 4%)',
        boxShadow: '0 16px 36px rgba(0, 0, 0, 0.16)',
        zIndex: 95,
        display: 'grid',
        gridTemplateRows: 'auto auto 1fr auto auto',
        overflow: 'hidden',
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          padding: '9px 10px',
          borderBottom: '1px solid var(--border-subtle)',
        }}
      >
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <span
            style={{
              width: 24,
              height: 24,
              borderRadius: 8,
              border: '1px solid color-mix(in srgb, var(--border-default) 78%, transparent 22%)',
              background: 'color-mix(in srgb, var(--bg-element) 74%, transparent 26%)',
              color: 'var(--text-secondary)',
              display: 'grid',
              placeItems: 'center',
            }}
          >
            <Bot size={13} />
          </span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 700 }}>AI Assistant</div>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{guide.title}</div>
          </div>
        </div>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <button
            type="button"
            onClick={() => setMode('collapsed')}
            style={{
              width: 28,
              height: 28,
              borderRadius: 8,
              border: '1px solid color-mix(in srgb, var(--border-default) 82%, transparent 18%)',
              background: 'transparent',
              color: 'var(--text-secondary)',
              display: 'grid',
              placeItems: 'center',
              cursor: 'pointer',
            }}
            aria-label="Collapse assistant"
          >
            <ChevronLeft size={14} />
          </button>
          <button
            type="button"
            onClick={() => setMode('hidden')}
            style={{
              width: 28,
              height: 28,
              borderRadius: 8,
              border: '1px solid color-mix(in srgb, var(--border-default) 82%, transparent 18%)',
              background: 'transparent',
              color: 'var(--text-secondary)',
              display: 'grid',
              placeItems: 'center',
              cursor: 'pointer',
            }}
            aria-label="Close assistant"
          >
            <X size={14} />
          </button>
        </div>
      </header>

      <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--border-subtle)', display: 'grid', gap: 6 }}>
        <div
          style={{
            minHeight: 22,
            width: 'fit-content',
            borderRadius: 999,
            border: '1px solid color-mix(in srgb, var(--border-default) 82%, transparent 18%)',
            background: 'color-mix(in srgb, var(--bg-element) 82%, transparent 18%)',
            color: 'var(--text-secondary)',
            display: 'inline-flex',
            alignItems: 'center',
            padding: '0 8px',
            fontSize: 10.5,
            fontWeight: 700,
          }}
        >
          On {guide.title}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 6 }}>
          <select
            value={navigationTarget}
            onChange={(event) => setTargetPath(event.target.value)}
            style={{
              minHeight: 30,
              borderRadius: 8,
              border: '1px solid color-mix(in srgb, var(--border-default) 82%, transparent 18%)',
              background: 'color-mix(in srgb, var(--bg-element) 82%, transparent 18%)',
              color: 'var(--text-primary)',
              padding: '0 8px',
              fontSize: 11.5,
              fontWeight: 600,
            }}
          >
            {QUICK_NAV_ITEMS.map((item) => (
              <option key={item.path} value={item.path}>
                Open {item.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => safeNavigate(navigationTarget)}
            style={{
              minHeight: 30,
              borderRadius: 8,
              border: '1px solid color-mix(in srgb, var(--border-default) 82%, transparent 18%)',
              background: 'color-mix(in srgb, var(--bg-element) 82%, transparent 18%)',
              color: 'var(--primary-base)',
              padding: '0 10px',
              fontSize: 11.5,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Open
          </button>
        </div>
      </div>

      <div
        ref={listRef}
        style={{
          overflowY: 'auto',
          padding: '10px 10px',
          display: 'grid',
          alignContent: 'start',
          gap: 7,
          minHeight: 0,
        }}
      >
        <div
          style={{
            justifySelf: 'start',
            maxWidth: '92%',
            borderRadius: 10,
            border: '1px solid var(--border-subtle)',
            background: 'color-mix(in srgb, var(--bg-element) 78%, transparent 22%)',
            color: 'var(--text-primary)',
            padding: '8px 9px',
            whiteSpace: 'pre-wrap',
            lineHeight: 1.45,
            fontSize: 12,
          }}
        >
          {contextEnabled
            ? `You are on ${guide.title}.\n${guide.purpose}\n\nAsk me what to do next and I will guide you.`
            : 'Context mode is off.\nTurn Context On at the top for page-specific guidance.'}
        </div>
        {messages.map((message) => {
          const isUser = message.role === 'user';
          return (
            <div
              key={message.id}
              style={{
                justifySelf: isUser ? 'end' : 'start',
                maxWidth: '92%',
                borderRadius: 10,
                border: isUser ? '1px solid color-mix(in srgb, var(--primary-border-soft) 52%, transparent 48%)' : '1px solid var(--border-subtle)',
                background: isUser ? 'color-mix(in srgb, var(--primary-soft) 48%, transparent 52%)' : 'color-mix(in srgb, var(--bg-element) 78%, transparent 22%)',
                color: 'var(--text-primary)',
                padding: '8px 9px',
                whiteSpace: 'pre-wrap',
                lineHeight: 1.45,
                fontSize: 12,
              }}
            >
              {message.text}
            </div>
          );
        })}
      </div>

      <div style={{ padding: '8px 10px', borderTop: '1px solid var(--border-subtle)', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {STARTER_PROMPTS.map((prompt) => (
          <button
            key={prompt}
            type="button"
            onClick={() => sendQuestion(prompt)}
            style={{
              minHeight: 24,
              borderRadius: 999,
              border: '1px solid color-mix(in srgb, var(--border-default) 82%, transparent 18%)',
              background: 'color-mix(in srgb, var(--bg-element) 82%, transparent 18%)',
              color: 'var(--text-secondary)',
              padding: '0 8px',
              fontSize: 10.5,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {prompt}
          </button>
        ))}
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          sendQuestion(input);
        }}
        style={{
          padding: '9px 10px',
          borderTop: '1px solid var(--border-subtle)',
          display: 'flex',
          alignItems: 'center',
          gap: 7,
          background: 'color-mix(in srgb, var(--bg-surface) 98%, transparent 2%)',
        }}
      >
        <input
          ref={inputRef}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Ask about this page, button, or workflow..."
          style={{
            flex: 1,
            minHeight: 32,
            borderRadius: 9,
            border: '1px solid color-mix(in srgb, var(--border-default) 82%, transparent 18%)',
            background: 'color-mix(in srgb, var(--bg-element) 82%, transparent 18%)',
            color: 'var(--text-primary)',
            padding: '0 10px',
            fontSize: 12,
            outline: 'none',
          }}
        />
        <button
          type="submit"
          style={{
            minHeight: 32,
            minWidth: 32,
            borderRadius: 9,
            border: '1px solid color-mix(in srgb, var(--primary-border-soft) 52%, transparent 48%)',
            background: 'color-mix(in srgb, var(--primary-soft) 44%, transparent 56%)',
            color: 'var(--primary-base)',
            display: 'grid',
            placeItems: 'center',
            cursor: 'pointer',
          }}
          aria-label="Send assistant message"
        >
          <Send size={14} />
        </button>
      </form>
    </aside>
  );
}
