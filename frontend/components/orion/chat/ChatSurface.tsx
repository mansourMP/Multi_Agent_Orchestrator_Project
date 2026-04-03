'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import type { ComponentPropsWithoutRef, PointerEvent as ReactPointerEvent } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowUp,
  Camera,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Copy,
  FileText,
  LoaderCircle,
  Mic,
  Plus,
  PlugZap,
  PanelLeft,
  Square,
  SlidersHorizontal,
  Sparkles,
  Terminal,
  Volume2,
  X,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { fmtTime } from '@/app/page.catalog';
import {
  CHAT_STORE_STORAGE_KEY,
  CHAT_STORE_UPDATED_EVENT,
  sanitizeChatStore,
  type ChatMessageActionRecord,
  type ChatMessageRecord,
  type ChatRunCardStatus,
  type ChatSessionRecord,
  type ChatStepRecord,
} from './chatSchema';
import { normalizeAssistantDisplayText, normalizeInlineErrorMessage } from './displayText';
import { resolveAssistantStreamState } from '@/lib/useStreamProcessor';
import { normalizeAssembledAssistantText } from '@/lib/StreamAssembler';
import { usePlatformShell } from '@/components/orion/PlatformShellContext';

export type ChatIdentityItem = {
  label: string;
  value: string;
  tone?: 'neutral' | 'success' | 'warning';
  priority?: 'high';
};

export type ChatIdentitySection = {
  title: string;
  note?: string;
  items: ChatIdentityItem[];
};

export type ChatIdentityAction = {
  label: string;
  onClick: () => void;
  priority?: 'primary' | 'default';
};

export type ChatDepthOption = {
  value: string;
  label: string;
  description?: string;
};

type ChatEmptyState = {
  title: string;
  suggestions: string[];
  onSelectSuggestion: (value: string) => void;
};

type ChatPermissionPrompt = {
  title: string;
  prompt: string;
  labels: string[];
  capabilities: string[];
  actions: string[];
  target?: string | null;
  scope: 'once';
  reusable: boolean;
  consequence?: string | null;
  busyKey: string | null;
  onAllowOnce: () => void;
  onDeny: () => void;
};

type ChatSurfaceProps = {
  isMobile: boolean;
  sessions: ChatSessionRecord[];
  selectedSessionId: string | null;
  onSelectSession: (sessionId: string) => void;
  onNewChat: () => void;
  goal: string;
  setGoal: (value: string) => void;
  primaryGoalRef: RefObject<HTMLTextAreaElement | null>;
  onSend: () => void;
  onMessageAction?: (messageId: string, action: ChatMessageActionRecord) => void;
  onRunApprovalDecision?: (scope: 'once' | 'deny') => void;
  chatBusy: boolean;
  messages: ChatMessageRecord[];
  emptyState?: ChatEmptyState | null;
  inlineStatus: string | null;
  inlineAction?: {
    label: string;
    href: string;
  } | null;
  emptyAction?: {
    label: string;
    href: string;
  } | null;
  permissionPrompt?: ChatPermissionPrompt | null;
  targetLabel: string;
  targetHref?: string;
  selectedModel: string;
  modelOptions: string[];
  modelsLoading?: boolean;
  onSelectModel: (value: string) => void;
  trustLabel: string;
  selectedDepth: string;
  depthLabel: string;
  depthOptions: ChatDepthOption[];
  onSelectDepth: (value: string) => void;
  identityDrawerOpen: boolean;
  onToggleIdentityDrawer: () => void;
  onCloseIdentityDrawer: () => void;
  identitySections: ChatIdentitySection[];
  identityActions: ChatIdentityAction[];
};

type BrowserSpeechRecognitionAlternative = {
  transcript: string;
  confidence: number;
};

type BrowserSpeechRecognitionResult = {
  isFinal: boolean;
  length: number;
  [index: number]: BrowserSpeechRecognitionAlternative;
};

type BrowserSpeechRecognitionEvent = {
  resultIndex: number;
  results: ArrayLike<BrowserSpeechRecognitionResult>;
};

type BrowserSpeechRecognitionErrorEvent = {
  error: string;
  message?: string;
};

type BrowserSpeechRecognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onstart: (() => void) | null;
  onresult: ((event: BrowserSpeechRecognitionEvent) => void) | null;
  onerror: ((event: BrowserSpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

type BrowserSpeechRecognitionConstructor = new () => BrowserSpeechRecognition;

declare global {
  interface Window {
    SpeechRecognition?: BrowserSpeechRecognitionConstructor;
    webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor;
  }
}

type ChatArtifactPreviewKind = 'markdown' | 'html' | null;
type ChatArtifactSource = 'code' | 'structured' | 'file';

type ChatArtifactRecord = {
  id: string;
  messageId: string;
  title: string;
  content: string;
  language: string;
  previewKind: ChatArtifactPreviewKind;
  source: ChatArtifactSource;
};

const ARTIFACT_PANEL_DEFAULT_WIDTH = 40;
const ARTIFACT_PANEL_MIN_WIDTH = 28;
const ARTIFACT_PANEL_MAX_WIDTH = 52;

const LANGUAGE_EXTENSION_MAP: Record<string, string> = {
  bash: 'sh',
  shell: 'sh',
  sh: 'sh',
  zsh: 'sh',
  md: 'md',
  markdown: 'md',
  html: 'html',
  htm: 'html',
  json: 'json',
  js: 'js',
  jsx: 'jsx',
  ts: 'ts',
  tsx: 'tsx',
  py: 'py',
  css: 'css',
  sql: 'sql',
  yaml: 'yml',
  yml: 'yml',
  xml: 'xml',
  text: 'txt',
  txt: 'txt',
};

function browserSpeechRecognitionConstructor(): BrowserSpeechRecognitionConstructor | null {
  if (typeof window === 'undefined') return null;
  const candidate = window.SpeechRecognition || window.webkitSpeechRecognition;
  return typeof candidate === 'function' ? candidate : null;
}

function normalizeTranscriptForComposer(transcript: string): string {
  return String(transcript || '').replace(/\s+/g, ' ').trim();
}

function speechTextForMessage(content: string): string {
  return String(content || '')
    .replace(/```[\s\S]*?```/g, ' Code block omitted. ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[>*_~]/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeArtifactLanguage(language: string): string {
  const normalized = String(language || '').trim().toLowerCase();
  if (!normalized) return 'text';
  if (normalized === 'plaintext') return 'text';
  if (normalized === 'shell') return 'bash';
  return normalized;
}

function inferArtifactPreviewKind(language: string, content: string): ChatArtifactPreviewKind {
  const normalized = normalizeArtifactLanguage(language);
  if (normalized === 'md' || normalized === 'markdown') return 'markdown';
  if (normalized === 'html' || normalized === 'htm') return 'html';
  const trimmed = String(content || '').trim().toLowerCase();
  if (trimmed.startsWith('<!doctype html') || (trimmed.startsWith('<html') && trimmed.includes('</html>'))) return 'html';
  return null;
}

function getArtifactBaseName(value: string): string {
  const normalized = String(value || '').trim();
  if (!normalized) return '';
  const parts = normalized.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] || normalized;
}

function inferLanguageFromFilename(filename: string): string {
  const baseName = getArtifactBaseName(filename);
  const extension = baseName.includes('.') ? baseName.split('.').pop() || '' : '';
  return normalizeArtifactLanguage(extension);
}

function deriveArtifactTitle(
  language: string,
  index: number,
  filenameHint?: string | null,
  prefix = 'snippet',
): string {
  const hint = getArtifactBaseName(String(filenameHint || '').trim());
  if (hint) return hint;
  const normalized = normalizeArtifactLanguage(language);
  const extension = LANGUAGE_EXTENSION_MAP[normalized] || normalized || 'txt';
  return `${prefix}-${index + 1}.${extension}`;
}

function parseFenceInfo(info: string): { language: string; filename: string | null } {
  const tokens = String(info || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const language = normalizeArtifactLanguage(tokens[0] || 'text');
  const filename = tokens.slice(1).find((token) => token.includes('.') || token.includes('/')) || null;
  return { language, filename };
}

function extractStructuredArtifactTitle(content: string): string {
  const heading = String(content || '').match(/^#{1,6}\s+(.+)$/m)?.[1]?.trim();
  if (heading) {
    const normalized = heading.replace(/[\\/:*?"<>|]+/g, ' ').trim();
    if (normalized) return `${normalized.slice(0, 48)}.md`;
  }
  return 'response.md';
}

function looksLikeMarkdownStructure(content: string): boolean {
  const normalized = String(content || '').trim();
  if (!normalized) return false;
  if (/^#{1,6}\s+/m.test(normalized)) return true;
  if (/^\s*(?:-|\*|\d+\.)\s+/m.test(normalized) && normalized.includes('\n')) return true;
  if (/\|.+\|\n\|(?:\s*:?-+:?\s*\|)+/m.test(normalized)) return true;
  if (/```[\s\S]+```/.test(normalized)) return true;
  return normalized.includes('\n\n') && normalized.length > 160;
}

function looksLikeHtmlDocument(content: string): boolean {
  const normalized = String(content || '').trim().toLowerCase();
  return normalized.startsWith('<!doctype html') || (normalized.startsWith('<html') && normalized.includes('</html>'));
}

function extractMessageArtifacts(message: ChatMessageRecord, displayContent: string): ChatArtifactRecord[] {
  if (message.role !== 'assistant') return [];
  const content = String(displayContent || '').trim();
  const fileHints = (Array.isArray(message.steps) ? message.steps : [])
    .filter((step) => step.kind === 'file' && step.detail)
    .map((step) => String(step.detail || '').trim())
    .filter(Boolean);
  const artifacts: ChatArtifactRecord[] = [];
  const fencePattern = /```([^\n`]*)\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null = null;
  let codeIndex = 0;
  while ((match = fencePattern.exec(content)) !== null) {
    const { language, filename } = parseFenceInfo(match[1] || '');
    const blockContent = String(match[2] || '').replace(/\n$/, '');
    const hint = filename || fileHints[codeIndex] || fileHints[0] || null;
    artifacts.push({
      id: `${message.id}:code:${codeIndex}`,
      messageId: message.id,
      title: deriveArtifactTitle(language, codeIndex, hint),
      content: blockContent,
      language,
      previewKind: inferArtifactPreviewKind(language, blockContent),
      source: 'code',
    });
    codeIndex += 1;
  }
  if (artifacts.length > 0) return artifacts;
  if (fileHints.length > 0) {
    const title = getArtifactBaseName(fileHints[0] || '') || 'generated-file.txt';
    const language = inferLanguageFromFilename(title);
    const fileContent = content || `Generated file: ${fileHints[0]}`;
    return [
      {
        id: `${message.id}:file:0`,
        messageId: message.id,
        title,
        content: fileContent,
        language,
        previewKind: inferArtifactPreviewKind(language, fileContent),
        source: 'file',
      },
    ];
  }
  if (!content) return [];
  if (looksLikeHtmlDocument(content)) {
    return [
      {
        id: `${message.id}:html:0`,
        messageId: message.id,
        title: 'response.html',
        content,
        language: 'html',
        previewKind: 'html',
        source: 'structured',
      },
    ];
  }
  if (looksLikeMarkdownStructure(content)) {
    return [
      {
        id: `${message.id}:markdown:0`,
        messageId: message.id,
        title: extractStructuredArtifactTitle(content),
        content,
        language: 'markdown',
        previewKind: 'markdown',
        source: 'structured',
      },
    ];
  }
  return [];
}

function previewLabelForArtifact(artifact: ChatArtifactRecord): string {
  if (artifact.previewKind === 'html') return 'Preview';
  if (artifact.previewKind === 'markdown') return 'Preview';
  return 'Preview';
}

function renderArtifactPreview(artifact: ChatArtifactRecord) {
  if (artifact.previewKind === 'html') {
    return (
      <iframe
        title={`Preview ${artifact.title}`}
        className="orion-chat-v2-artifact-frame"
        sandbox="allow-scripts allow-forms"
        srcDoc={artifact.content}
      />
    );
  }
  if (artifact.previewKind === 'markdown') {
    return (
      <div className="orion-chat-v2-artifact-preview markdown">
        <ReactMarkdown>{artifact.content}</ReactMarkdown>
      </div>
    );
  }
  return (
    <div className="orion-chat-v2-artifact-preview is-empty">
      Preview is not available for this artifact.
    </div>
  );
}

function renderArtifactCode(artifact: ChatArtifactRecord) {
  return (
    <SyntaxHighlighter
      language={normalizeArtifactLanguage(artifact.language)}
      style={oneDark}
      wrapLongLines
      customStyle={{
        margin: 0,
        borderRadius: 0,
        padding: '16px 18px',
        background: 'transparent',
        fontSize: '13px',
        lineHeight: 1.6,
      }}
      codeTagProps={{ style: { fontFamily: 'var(--font-mono, "SFMono-Regular", Consolas, monospace)' } }}
    >
      {artifact.content}
    </SyntaxHighlighter>
  );
}

function ChatArtifactPanel({
  artifact,
  artifacts,
  panelWidth,
  onClose,
  onResizeStart,
  onSelectArtifact,
}: {
  artifact: ChatArtifactRecord;
  artifacts: ChatArtifactRecord[];
  panelWidth: number;
  onClose: () => void;
  onResizeStart: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onSelectArtifact: (artifactId: string) => void;
}) {
  const [viewMode, setViewMode] = useState<'code' | 'preview'>(artifact.previewKind ? 'preview' : 'code');

  useEffect(() => {
    setViewMode(artifact.previewKind ? 'preview' : 'code');
  }, [artifact.id, artifact.previewKind]);

  return (
    <>
      <button
        type="button"
        className="orion-chat-v2-splitter"
        onPointerDown={onResizeStart}
        aria-label="Resize artifact panel"
        aria-valuenow={Math.round(panelWidth)}
        aria-valuemin={ARTIFACT_PANEL_MIN_WIDTH}
        aria-valuemax={ARTIFACT_PANEL_MAX_WIDTH}
      >
        <span className="orion-chat-v2-splitter-bar" aria-hidden />
      </button>
      <aside className="orion-chat-v2-artifact-panel" style={{ width: `${panelWidth}%` }} aria-label="Artifact panel">
        <div className="orion-chat-v2-artifact-header">
          <div className="orion-chat-v2-artifact-header-copy">
            <div className="orion-chat-v2-artifact-eyebrow">Artifact</div>
            <div className="orion-chat-v2-artifact-title" title={artifact.title}>{artifact.title}</div>
          </div>
          <div className="orion-chat-v2-artifact-actions">
            <div className="orion-chat-v2-artifact-toggle" role="tablist" aria-label="Artifact view mode">
              <button
                type="button"
                className={`orion-chat-v2-artifact-toggle-btn${viewMode === 'code' ? ' is-active' : ''}`}
                onClick={() => setViewMode('code')}
              >
                Code
              </button>
              <button
                type="button"
                className={`orion-chat-v2-artifact-toggle-btn${viewMode === 'preview' ? ' is-active' : ''}`}
                onClick={() => artifact.previewKind && setViewMode('preview')}
                disabled={!artifact.previewKind}
                title={artifact.previewKind ? previewLabelForArtifact(artifact) : 'Preview unavailable'}
              >
                Preview
              </button>
            </div>
            <button type="button" className="orion-chat-v2-artifact-close" onClick={onClose} aria-label="Close artifact panel">
              <X size={16} />
            </button>
          </div>
        </div>
        {artifacts.length > 1 ? (
          <div className="orion-chat-v2-artifact-tabs" role="tablist" aria-label="Artifacts">
            {artifacts.map((entry) => (
              <button
                key={entry.id}
                type="button"
                className={`orion-chat-v2-artifact-tab${entry.id === artifact.id ? ' is-active' : ''}`}
                onClick={() => onSelectArtifact(entry.id)}
              >
                {entry.title}
              </button>
            ))}
          </div>
        ) : null}
        <div className="orion-chat-v2-artifact-body">
          {viewMode === 'preview' && artifact.previewKind ? renderArtifactPreview(artifact) : renderArtifactCode(artifact)}
        </div>
      </aside>
    </>
  );
}

function ChatRenderableCodeBlock({
  artifact,
}: {
  artifact: ChatArtifactRecord;
}) {
  const [viewMode, setViewMode] = useState<'code' | 'preview'>(artifact.previewKind ? 'preview' : 'code');

  useEffect(() => {
    setViewMode(artifact.previewKind ? 'preview' : 'code');
  }, [artifact.id, artifact.previewKind]);

  return (
    <div className="orion-chat-v2-code-block">
      <div className="orion-chat-v2-code-block-header">
        <div className="orion-chat-v2-code-block-title" title={artifact.title}>{artifact.title}</div>
        <div className="orion-chat-v2-code-block-toggle" role="tablist" aria-label="Code block view">
          <button
            type="button"
            className={`orion-chat-v2-code-block-toggle-btn${viewMode === 'code' ? ' is-active' : ''}`}
            onClick={() => setViewMode('code')}
          >
            Code
          </button>
          <button
            type="button"
            className={`orion-chat-v2-code-block-toggle-btn${viewMode === 'preview' ? ' is-active' : ''}`}
            onClick={() => artifact.previewKind && setViewMode('preview')}
            disabled={!artifact.previewKind}
            title={artifact.previewKind ? previewLabelForArtifact(artifact) : 'Preview unavailable'}
          >
            Preview
          </button>
        </div>
      </div>
      <div className="orion-chat-v2-code-block-body">
        {viewMode === 'preview' && artifact.previewKind ? renderArtifactPreview(artifact) : renderArtifactCode(artifact)}
      </div>
    </div>
  );
}

function ChatMessageToolbar({
  copied,
  onCopy,
  onSpeak,
  speaking = false,
  onOpenArtifacts,
  artifactCount = 0,
  align = 'left',
}: {
  copied: boolean;
  onCopy: () => void;
  onSpeak?: (() => void) | null;
  speaking?: boolean;
  onOpenArtifacts?: (() => void) | null;
  artifactCount?: number;
  align?: 'left' | 'right';
}) {
  return (
    <div className={`orion-chat-v2-message-toolbar${align === 'right' ? ' is-right' : ''}`}>
      <button type="button" className="orion-chat-v2-message-toolbar-btn" onClick={onCopy}>
        {copied ? <Check size={13} /> : <Copy size={13} />}
        <span>{copied ? 'Copied' : 'Copy'}</span>
      </button>
      {onSpeak ? (
        <button type="button" className="orion-chat-v2-message-toolbar-btn" onClick={onSpeak}>
          {speaking ? <Square size={13} /> : <Volume2 size={13} />}
          <span>{speaking ? 'Stop' : 'Listen'}</span>
        </button>
      ) : null}
      {onOpenArtifacts && artifactCount > 0 ? (
        <button type="button" className="orion-chat-v2-message-toolbar-btn" onClick={onOpenArtifacts}>
          <FileText size={13} />
          <span>{artifactCount === 1 ? 'Artifact' : `Artifacts (${artifactCount})`}</span>
        </button>
      ) : null}
    </div>
  );
}

function resolveAssistantLifecycle(status: ChatMessageRecord['status']): {
  label: string;
  tone: 'thinking' | 'working' | 'confirmation' | 'failed' | 'done';
} | null {
  if (status === 'sending') return { label: 'Thinking', tone: 'thinking' };
  if (status === 'running') return { label: 'Working', tone: 'working' };
  if (status === 'waiting') return { label: 'Confirmation required', tone: 'confirmation' };
  if (status === 'error') return { label: 'Failed', tone: 'failed' };
  return null;
}

function shouldSuppressAssistantBody(content: string, status: ChatMessageRecord['status']): boolean {
  const normalized = content.trim().toLowerCase();
  if (!normalized) return true;
  return (status === 'sending' || status === 'running') && (normalized === 'working on it...' || normalized === 'working on it…');
}

function renderRunCardStatusLabel(status: ChatRunCardStatus): string {
  if (status === 'preparing') return 'Preparing';
  if (status === 'running') return 'Running';
  if (status === 'waiting') return 'Confirmation required';
  if (status === 'completed') return 'Completed';
  if (status === 'needs_attention') return 'Needs attention';
  return 'Failed';
}

function renderChatStepIcon(step: ChatStepRecord) {
  if (step.kind === 'thinking') return <Sparkles size={14} />;
  if (step.kind === 'shell') return <Terminal size={14} />;
  if (step.kind === 'connector') return <PlugZap size={14} />;
  if (step.kind === 'screenshot') return <Camera size={14} />;
  return <FileText size={14} />;
}

function formatChatHistoryTimestamp(value: string): string {
  const timestamp = String(value || '').trim();
  if (!timestamp) return 'No activity yet';
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) return 'No activity yet';
  return parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function buildChatHistoryPreview(session: ChatSessionRecord): string {
  const firstUserMessage = session.messages.find((message) => message.role === 'user' && String(message.content || '').trim());
  const lastMessage = [...session.messages].reverse().find((message) => String(message.content || '').trim());
  const previewSource = String(firstUserMessage?.content || lastMessage?.content || '').replace(/\s+/g, ' ').trim();
  if (!previewSource) return 'No messages yet.';
  return previewSource.length > 88 ? `${previewSource.slice(0, 85).trimEnd()}...` : previewSource;
}

export function ChatSurface({
  isMobile,
  sessions,
  selectedSessionId,
  onSelectSession,
  onNewChat,
  goal,
  setGoal,
  primaryGoalRef,
  onSend,
  onMessageAction,
  onRunApprovalDecision,
  chatBusy,
  messages,
  emptyState = null,
  inlineStatus,
  inlineAction = null,
  emptyAction = null,
  permissionPrompt = null,
  targetLabel,
  targetHref = '/agents',
  selectedModel,
  modelOptions,
  modelsLoading = false,
  onSelectModel,
  trustLabel,
  selectedDepth,
  depthLabel,
  depthOptions,
  onSelectDepth,
  identityDrawerOpen,
  onToggleIdentityDrawer,
  onCloseIdentityDrawer,
  identitySections,
  identityActions,
}: ChatSurfaceProps) {
  const router = useRouter();
  const { setChatTopControls } = usePlatformShell();
  const isLoading = chatBusy;
  const sendDisabled = chatBusy || goal.trim().length === 0;
  const threadRef = useRef<HTMLDivElement>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [controlsMenuOpen, setControlsMenuOpen] = useState(false);
  const [expandedStepMessages, setExpandedStepMessages] = useState<Record<string, boolean>>({});
  const [artifactPanelOpen, setArtifactPanelOpen] = useState(false);
  const [artifactPanelWidth, setArtifactPanelWidth] = useState(ARTIFACT_PANEL_DEFAULT_WIDTH);
  const [selectedArtifactId, setSelectedArtifactId] = useState<string | null>(null);
  const [latestArtifactId, setLatestArtifactId] = useState<string | null>(null);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [voicePhase, setVoicePhase] = useState<'idle' | 'listening' | 'processing'>('idle');
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);
  const [historyDrawerOpen, setHistoryDrawerOpen] = useState(false);
  const [historySessions, setHistorySessions] = useState<ChatSessionRecord[]>(sessions);
  const goalValueRef = useRef(goal);
  const speechRecognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const speechTranscriptRef = useRef('');
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const holdTimerRef = useRef<number | null>(null);
  const holdModeRef = useRef(false);
  const ignoreMicClickRef = useRef(false);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const audioPlayerUrlRef = useRef<string | null>(null);
  const speechUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const visibleMessages = useMemo(() => {
    const lastMessage = messages[messages.length - 1];
    const lastLifecycle = lastMessage?.role === 'assistant'
      ? resolveAssistantLifecycle(lastMessage.status)
      : null;
    if (lastLifecycle && (lastLifecycle.tone === 'thinking' || lastLifecycle.tone === 'working')) {
      return messages;
    }
    if (!chatBusy) return messages;
    const syntheticThinkingMessage: ChatMessageRecord = {
      id: 'synthetic:thinking',
      role: 'assistant',
      content: '',
      ts: lastMessage?.ts || '',
      status: 'sending',
      run_id: null,
    };
    return [...messages, syntheticThinkingMessage];
  }, [chatBusy, messages]);
  const hasMessages = visibleMessages.length > 0;
  const isFirstThread = visibleMessages.length > 0 && visibleMessages.length <= 2;
  const messageArtifacts = useMemo(() => {
    const byMessage = new Map<string, ChatArtifactRecord[]>();
    const allArtifacts: ChatArtifactRecord[] = [];
    for (const message of visibleMessages) {
      if (message.role !== 'assistant') continue;
      const displayContent = normalizeAssembledAssistantText(normalizeAssistantDisplayText(message.content));
      const artifacts = extractMessageArtifacts(message, displayContent);
      byMessage.set(message.id, artifacts);
      allArtifacts.push(...artifacts);
    }
    return { byMessage, allArtifacts };
  }, [visibleMessages]);
  const artifacts = messageArtifacts.allArtifacts;
  const selectedArtifact = useMemo(
    () => artifacts.find((artifact) => artifact.id === selectedArtifactId) || null,
    [artifacts, selectedArtifactId],
  );
  const artifactPanelVisible = artifactPanelOpen && Boolean(selectedArtifact) && !isMobile;

  const focusComposer = useCallback(() => {
    primaryGoalRef.current?.focus();
  }, [primaryGoalRef]);

  const releaseRecordedStream = useCallback(() => {
    const stream = mediaStreamRef.current;
    if (!stream) return;
    stream.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
  }, []);

  const stopPlayback = useCallback(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    speechUtteranceRef.current = null;
    const player = audioPlayerRef.current;
    if (player) {
      player.pause();
      audioPlayerRef.current = null;
    }
    if (audioPlayerUrlRef.current && typeof URL !== 'undefined') {
      URL.revokeObjectURL(audioPlayerUrlRef.current);
      audioPlayerUrlRef.current = null;
    }
    setSpeakingMessageId(null);
  }, []);

  const appendTranscriptToGoal = useCallback((transcript: string) => {
    const normalized = normalizeTranscriptForComposer(transcript);
    if (!normalized) return;
    const current = String(goalValueRef.current || '').trim();
    const nextValue = current ? `${current} ${normalized}` : normalized;
    goalValueRef.current = nextValue;
    setGoal(nextValue);
    requestAnimationFrame(() => {
      focusComposer();
    });
  }, [focusComposer, setGoal]);

  const submitRecordedAudio = useCallback(async (blob: Blob) => {
    setVoicePhase('processing');
    setVoiceError(null);
    try {
      const response = await fetch('/api/stt', {
        method: 'POST',
        body: blob,
        headers: {
          'Content-Type': blob.type || 'audio/webm',
        },
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        const detail = payload && typeof payload.detail === 'string' ? payload.detail : 'Speech transcription failed.';
        throw new Error(detail);
      }
      const transcript = payload && typeof payload.transcript === 'string' ? payload.transcript : '';
      appendTranscriptToGoal(transcript);
      setVoiceError(null);
    } catch (error) {
      setVoiceError(error instanceof Error ? error.message : 'Speech transcription failed.');
    } finally {
      setVoicePhase('idle');
    }
  }, [appendTranscriptToGoal]);

  const startFallbackRecording = useCallback(async () => {
    if (typeof window === 'undefined' || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      throw new Error('Voice capture is not supported in this browser.');
    }
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaStreamRef.current = stream;
    recordedChunksRef.current = [];
    const preferredMimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : (MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '');
    const recorder = preferredMimeType
      ? new MediaRecorder(stream, { mimeType: preferredMimeType })
      : new MediaRecorder(stream);
    mediaRecorderRef.current = recorder;
    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        recordedChunksRef.current.push(event.data);
      }
    };
    recorder.onstop = () => {
      const nextType = recordedChunksRef.current[0]?.type || recorder.mimeType || 'audio/webm';
      const blob = new Blob(recordedChunksRef.current, { type: nextType });
      mediaRecorderRef.current = null;
      releaseRecordedStream();
      if (blob.size > 0) {
        void submitRecordedAudio(blob);
      } else {
        setVoicePhase('idle');
      }
    };
    recorder.start();
    setVoicePhase('listening');
    setVoiceError(null);
    focusComposer();
  }, [focusComposer, releaseRecordedStream, submitRecordedAudio]);

  const startNativeRecognition = useCallback(async (): Promise<boolean> => {
    const SpeechRecognitionCtor = browserSpeechRecognitionConstructor();
    if (!SpeechRecognitionCtor || typeof window === 'undefined') return false;
    speechTranscriptRef.current = '';
    const recognition = new SpeechRecognitionCtor();
    speechRecognitionRef.current = recognition;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = navigator.language || 'en-US';
    recognition.onstart = () => {
      setVoicePhase('listening');
      setVoiceError(null);
      focusComposer();
    };
    recognition.onresult = (event) => {
      const nextParts: string[] = [];
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const alternative = result?.[0];
        if (result?.isFinal && alternative?.transcript) {
          nextParts.push(alternative.transcript);
        }
      }
      if (nextParts.length > 0) {
        speechTranscriptRef.current = `${speechTranscriptRef.current} ${nextParts.join(' ')}`.trim();
      }
    };
    recognition.onerror = (event) => {
      setVoiceError(event?.message || event?.error || 'Speech recognition failed.');
    };
    recognition.onend = () => {
      speechRecognitionRef.current = null;
      const transcript = speechTranscriptRef.current;
      speechTranscriptRef.current = '';
      setVoicePhase('idle');
      if (transcript) {
        appendTranscriptToGoal(transcript);
      }
    };
    recognition.start();
    return true;
  }, [appendTranscriptToGoal, focusComposer]);

  const stopVoiceCapture = useCallback(() => {
    if (holdTimerRef.current !== null) {
      window.clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    if (speechRecognitionRef.current) {
      speechRecognitionRef.current.stop();
      return;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      return;
    }
    setVoicePhase('idle');
  }, []);

  const startVoiceCapture = useCallback(async () => {
    setVoiceError(null);
    try {
      const startedNative = await startNativeRecognition();
      if (startedNative) return;
      await startFallbackRecording();
    } catch (error) {
      releaseRecordedStream();
      setVoicePhase('idle');
      setVoiceError(error instanceof Error ? error.message : 'Voice capture failed.');
    }
  }, [releaseRecordedStream, startFallbackRecording, startNativeRecognition]);

  const speakWithBackendAudio = useCallback(async (messageId: string, text: string) => {
    const response = await fetch('/api/tts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        voice: 'alloy',
        speed: 1,
      }),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      const detail = payload && typeof payload.detail === 'string' ? payload.detail : 'Text-to-speech failed.';
      throw new Error(detail);
    }
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    audioPlayerUrlRef.current = objectUrl;
    const player = new Audio(objectUrl);
    audioPlayerRef.current = player;
    setSpeakingMessageId(messageId);
    player.onended = () => {
      stopPlayback();
    };
    player.onerror = () => {
      stopPlayback();
      setVoiceError('Text-to-speech playback failed.');
    };
    await player.play();
  }, [stopPlayback]);

  const handleSpeakMessage = useCallback(async (messageId: string, content: string) => {
    if (speakingMessageId === messageId) {
      stopPlayback();
      return;
    }
    const speechText = speechTextForMessage(content);
    if (!speechText) return;
    stopPlayback();
    try {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined') {
        const utterance = new SpeechSynthesisUtterance(speechText);
        speechUtteranceRef.current = utterance;
        setSpeakingMessageId(messageId);
        utterance.onend = () => {
          if (speechUtteranceRef.current === utterance) {
            speechUtteranceRef.current = null;
            setSpeakingMessageId((current) => (current === messageId ? null : current));
          }
        };
        utterance.onerror = () => {
          if (speechUtteranceRef.current === utterance) {
            speechUtteranceRef.current = null;
          }
          setSpeakingMessageId(null);
          setVoiceError('Text-to-speech playback failed.');
        };
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(utterance);
        return;
      }
      await speakWithBackendAudio(messageId, speechText);
    } catch (error) {
      setSpeakingMessageId(null);
      setVoiceError(error instanceof Error ? error.message : 'Text-to-speech playback failed.');
    }
  }, [speakWithBackendAudio, speakingMessageId, stopPlayback]);

  const invokeSend = useCallback(() => {
    if (sendDisabled) return;
    onSend();
  }, [onSend, sendDisabled]);

  const handleMicPointerDown = useCallback(() => {
    if (voicePhase !== 'idle' || typeof window === 'undefined') return;
    if (holdTimerRef.current !== null) {
      window.clearTimeout(holdTimerRef.current);
    }
    holdTimerRef.current = window.setTimeout(() => {
      holdTimerRef.current = null;
      holdModeRef.current = true;
      ignoreMicClickRef.current = true;
      void startVoiceCapture();
    }, 180);
  }, [startVoiceCapture, voicePhase]);

  const handleMicPointerRelease = useCallback(() => {
    if (holdTimerRef.current !== null) {
      window.clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    if (holdModeRef.current) {
      holdModeRef.current = false;
      stopVoiceCapture();
    }
  }, [stopVoiceCapture]);

  const handleMicClick = useCallback(() => {
    if (ignoreMicClickRef.current) {
      ignoreMicClickRef.current = false;
      return;
    }
    if (voicePhase === 'processing') {
      return;
    }
    if (voicePhase === 'listening') {
      stopVoiceCapture();
      return;
    }
    void startVoiceCapture();
  }, [startVoiceCapture, stopVoiceCapture, voicePhase]);

  const handleSelectArtifact = useCallback((artifactId: string) => {
    setSelectedArtifactId(artifactId);
    if (!isMobile) {
      setArtifactPanelOpen(true);
    }
  }, [isMobile]);

  const handleResizeArtifactPanel = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!workspaceRef.current) return;
    const containerRect = workspaceRef.current.getBoundingClientRect();
    const startX = event.clientX;
    const startWidth = artifactPanelWidth;
    const handleMove = (moveEvent: PointerEvent) => {
      const delta = ((startX - moveEvent.clientX) / Math.max(containerRect.width, 1)) * 100;
      const nextWidth = Math.min(ARTIFACT_PANEL_MAX_WIDTH, Math.max(ARTIFACT_PANEL_MIN_WIDTH, startWidth + delta));
      setArtifactPanelWidth(nextWidth);
    };
    const handleUp = () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
  }, [artifactPanelWidth]);

  const handleCopyMessage = useCallback((messageId: string, content: string) => {
    const normalized = String(content || '').trim();
    if (!normalized) return;
    void navigator.clipboard.writeText(normalized).then(() => {
      setCopiedMessageId(messageId);
      window.setTimeout(() => {
        setCopiedMessageId((current) => (current === messageId ? null : current));
      }, 1600);
    }).catch(() => {
      setCopiedMessageId(null);
    });
  }, []);

  useEffect(() => {
    goalValueRef.current = goal;
  }, [goal]);

  useEffect(() => {
    setHistorySessions(sessions);
  }, [sessions]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const syncHistorySessions = () => {
      try {
        const raw = window.localStorage.getItem(CHAT_STORE_STORAGE_KEY);
        if (!raw) {
          setHistorySessions(sessions);
          return;
        }
        const parsed = sanitizeChatStore(JSON.parse(raw));
        setHistorySessions(parsed?.sessions ?? sessions);
      } catch {
        setHistorySessions(sessions);
      }
    };

    syncHistorySessions();
    window.addEventListener('storage', syncHistorySessions);
    window.addEventListener(CHAT_STORE_UPDATED_EVENT, syncHistorySessions);
    return () => {
      window.removeEventListener('storage', syncHistorySessions);
      window.removeEventListener(CHAT_STORE_UPDATED_EVENT, syncHistorySessions);
    };
  }, [sessions]);

  useEffect(() => {
    const element = primaryGoalRef.current;
    if (!element) return;
    const minHeight = 28;
    const maxHeight = 160;
    element.style.height = '0px';
    const nextHeight = Math.max(minHeight, Math.min(element.scrollHeight, maxHeight));
    element.style.height = `${nextHeight}px`;
    element.style.overflowY = element.scrollHeight > maxHeight ? 'auto' : 'hidden';
  }, [goal, primaryGoalRef]);

  useEffect(() => {
    if (!threadRef.current) return;
    const frame = requestAnimationFrame(() => {
      if (!threadRef.current) return;
      threadRef.current.scrollTop = threadRef.current.scrollHeight;
    });
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [messages, isLoading]);

  useEffect(() => {
    if (isMobile) {
      setArtifactPanelOpen(false);
      return;
    }
    if (artifacts.length === 0) {
      setArtifactPanelOpen(false);
      setSelectedArtifactId(null);
      setLatestArtifactId(null);
      return;
    }
    const latest = artifacts[artifacts.length - 1];
    if (!selectedArtifactId || !artifacts.some((artifact) => artifact.id === selectedArtifactId)) {
      setSelectedArtifactId(latest.id);
    }
    if (latest.id !== latestArtifactId) {
      setSelectedArtifactId(latest.id);
      setArtifactPanelOpen(true);
      setArtifactPanelWidth(ARTIFACT_PANEL_DEFAULT_WIDTH);
      setLatestArtifactId(latest.id);
    }
  }, [artifacts, isMobile, latestArtifactId, selectedArtifactId]);

  useEffect(() => {
    if (!attachMenuOpen && !modelMenuOpen && !controlsMenuOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (target.closest('[data-chat-menu-root]')) return;
      setAttachMenuOpen(false);
      setModelMenuOpen(false);
      setControlsMenuOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setAttachMenuOpen(false);
      setModelMenuOpen(false);
      setControlsMenuOpen(false);
    };
    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [attachMenuOpen, controlsMenuOpen, modelMenuOpen]);

  useEffect(() => {
    if (!identityDrawerOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseIdentityDrawer();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [identityDrawerOpen, onCloseIdentityDrawer]);

  const handleToggleArtifacts = useCallback(() => {
    if (artifacts.length === 0) return;
    if (!artifactPanelVisible) {
      setSelectedArtifactId((current) => current || artifacts[artifacts.length - 1]?.id || null);
    }
    setArtifactPanelOpen((current) => !current || !artifactPanelVisible);
  }, [artifactPanelVisible, artifacts]);

  const openContextActionRef = useRef(onToggleIdentityDrawer);
  const toggleArtifactsActionRef = useRef(handleToggleArtifacts);

  useEffect(() => {
    openContextActionRef.current = onToggleIdentityDrawer;
  }, [onToggleIdentityDrawer]);

  useEffect(() => {
    toggleArtifactsActionRef.current = handleToggleArtifacts;
  }, [handleToggleArtifacts]);

  const handleOpenContextFromTopBar = useCallback(() => {
    openContextActionRef.current();
  }, []);

  const handleToggleArtifactsFromTopBar = useCallback(() => {
    toggleArtifactsActionRef.current();
  }, []);

  useEffect(() => {
    setChatTopControls({
      assistantLabel: targetLabel,
      onOpenContext: handleOpenContextFromTopBar,
      artifactCount: artifacts.length,
      artifactsOpen: artifactPanelVisible,
      onToggleArtifacts: handleToggleArtifactsFromTopBar,
    });
  }, [
    artifactPanelVisible,
    artifacts.length,
    handleOpenContextFromTopBar,
    handleToggleArtifactsFromTopBar,
    setChatTopControls,
    targetLabel,
  ]);

  useEffect(() => {
    return () => {
      setChatTopControls(null);
    };
  }, [setChatTopControls]);

  useEffect(() => {
    return () => {
      if (holdTimerRef.current !== null) {
        window.clearTimeout(holdTimerRef.current);
      }
      if (speechRecognitionRef.current) {
        speechRecognitionRef.current.abort();
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      releaseRecordedStream();
      stopPlayback();
    };
  }, [releaseRecordedStream, stopPlayback]);

  const composerStatusText = voiceError
    ? `Voice unavailable: ${voiceError}`
    : (inlineStatus ? `⚠ ${inlineStatus}` : null);

  return (
    <section
      className={`orion-chat-v2 orion-chat-v2--deer${hasMessages ? ' has-history' : ' is-empty'}${isFirstThread ? ' is-first-thread' : ''}`}
      suppressHydrationWarning
    >
      <div className="orion-chat-v2-workspace" ref={workspaceRef}>
        {historyDrawerOpen ? (
          <>
            <button
              type="button"
              aria-label="Close chat history"
              onClick={() => setHistoryDrawerOpen(false)}
              style={{
                position: 'absolute',
                inset: 0,
                border: 0,
                background: 'rgba(15, 18, 24, 0.18)',
                zIndex: 14,
              }}
            />
            <aside
              aria-label="Chat history"
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                bottom: 0,
                width: isMobile ? 'min(100%, 320px)' : 320,
                zIndex: 15,
                display: 'flex',
                flexDirection: 'column',
                minHeight: 0,
                borderRight: '1px solid color-mix(in srgb, var(--border-default) 78%, transparent 22%)',
                background: 'color-mix(in srgb, var(--bg-surface) 96%, var(--bg-element) 4%)',
                boxShadow: '12px 0 32px rgba(0, 0, 0, 0.08)',
              }}
            >
              <div
                style={{
                  display: 'grid',
                  gap: 12,
                  padding: 18,
                  borderBottom: '1px solid color-mix(in srgb, var(--border-default) 82%, transparent 18%)',
                }}
              >
                <div>
                  <div style={{ fontSize: 15, fontWeight: 650, color: 'var(--text-primary)' }}>Chats</div>
                  <div style={{ fontSize: 12, lineHeight: 1.55, color: 'var(--text-secondary)' }}>
                    Previous sessions from the local chat store.
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" className="orion-btn orion-btn-primary" style={{ minHeight: 44, flex: 1 }} onClick={onNewChat}>
                    New chat
                  </button>
                  <button type="button" className="orion-btn orion-btn-ghost" style={{ minHeight: 44 }} onClick={() => setHistoryDrawerOpen(false)}>
                    Close
                  </button>
                </div>
              </div>
              <div style={{ flex: '1 1 auto', minHeight: 0, overflowY: 'auto', padding: 12, display: 'grid', gap: 8 }}>
                {historySessions.length === 0 ? (
                  <div
                    style={{
                      border: '1px dashed var(--border-subtle)',
                      borderRadius: 16,
                      padding: 16,
                      fontSize: 12,
                      lineHeight: 1.55,
                      color: 'var(--text-secondary)',
                      background: 'color-mix(in srgb, var(--bg-surface) 94%, transparent 6%)',
                    }}
                  >
                    No saved chats yet.
                  </div>
                ) : (
                  historySessions.map((session) => {
                    const active = session.id === selectedSessionId;
                    return (
                      <button
                        key={session.id}
                        type="button"
                        onClick={() => {
                          onSelectSession(session.id);
                          setHistoryDrawerOpen(false);
                        }}
                        aria-current={active ? 'page' : undefined}
                        style={{
                          width: '100%',
                          border: '1px solid var(--border-subtle)',
                          borderRadius: 16,
                          background: active
                            ? 'color-mix(in srgb, var(--bg-element) 88%, var(--bg-surface) 12%)'
                            : 'var(--bg-shell)',
                          padding: 12,
                          display: 'grid',
                          gap: 8,
                          textAlign: 'left',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                          <div
                            style={{
                              minWidth: 0,
                              fontSize: 13,
                              fontWeight: 650,
                              color: 'var(--text-primary)',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                          >
                            {buildChatHistoryPreview(session)}
                          </div>
                          <div style={{ flex: '0 0 auto', fontSize: 11, color: 'var(--text-tertiary)' }}>
                            {formatChatHistoryTimestamp(session.updatedAt)}
                          </div>
                        </div>
                        <div
                          style={{
                            fontSize: 12,
                            lineHeight: 1.55,
                            color: 'var(--text-secondary)',
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                          }}
                        >
                          {buildChatHistoryPreview(session)}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </aside>
          </>
        ) : null}
        <div
          className="orion-chat-v2-main"
          style={artifactPanelVisible ? { width: `${100 - artifactPanelWidth}%` } : undefined}
        >
          <div className="orion-chat-v2-thread-shell" ref={threadRef}>
            {!hasMessages && emptyState ? (
              <div className="orion-chat-v2-compact-empty" aria-live="polite">
                <h1 className="orion-chat-v2-compact-title">{emptyState.title}</h1>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
                  {emptyState.suggestions.slice(0, 3).map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      className="orion-chip orion-chip-action"
                      onClick={() => emptyState.onSelectSuggestion(suggestion)}
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {visibleMessages.length > 0 ? (
              <div className="orion-chat-v2-thread" aria-live="polite">
                {visibleMessages.map((message, index) => {
              const isUser = message.role === 'user';
              const isError = message.status === 'error';
              const previousMessage = index > 0 ? visibleMessages[index - 1] : null;
              const followsUser = !isUser && previousMessage?.role === 'user';
              const streamState = !isUser ? resolveAssistantStreamState(message) : null;
              const lifecycle = !isUser ? resolveAssistantLifecycle(streamState?.showLoading ? (message.status || 'running') : message.status) : null;
              const showLoadingIndicator = Boolean(streamState?.showLoading && lifecycle && (lifecycle.tone === 'thinking' || lifecycle.tone === 'working'));
              const displayContent = isUser ? message.content : normalizeAssembledAssistantText(normalizeAssistantDisplayText(message.content));
              const suppressBody = !isUser && shouldSuppressAssistantBody(displayContent, message.status);
              const inlineError = isError ? normalizeInlineErrorMessage(displayContent) : '';
              const isFirstAssistantEntry = !isUser && isFirstThread && index <= 1;
              const steps = !isUser && Array.isArray(message.steps) ? message.steps : [];
              const hasSteps = steps.length > 0;
              const activeStep = hasSteps ? steps.find((step) => step.status === 'active') || null : null;
              const stepsExpanded = hasSteps ? (expandedStepMessages[message.id] ?? !Boolean(streamState?.terminal)) : false;
              const artifactsForMessage = !isUser ? messageArtifacts.byMessage.get(message.id) || [] : [];
              const codeArtifacts = artifactsForMessage.filter((artifact) => artifact.source === 'code');
              let codeArtifactIndex = 0;
              return (
                <article
                  key={message.id}
                  className={`orion-chat-v2-turn${isUser ? ' is-user' : ' is-assistant'}${isError ? ' is-error' : ''}${isFirstAssistantEntry ? ' is-first-assistant-entry' : ''}${followsUser ? ' is-following-user' : ''}`}
                >
                  {isUser ? (
                    <div className="orion-chat-v2-user-stack">
                      <div className="orion-chat-v2-user-bubble">
                        <div className="orion-chat-v2-user-text">{displayContent}</div>
                      </div>
                      <ChatMessageToolbar
                        copied={copiedMessageId === message.id}
                        onCopy={() => handleCopyMessage(message.id, displayContent)}
                        align="right"
                      />
                      <div className="orion-chat-v2-meta">{fmtTime(message.ts)}</div>
                    </div>
                  ) : (
                    <div className="orion-chat-v2-assistant">
                      {showLoadingIndicator && lifecycle ? (
                        <div className={`orion-chat-v2-loading is-${lifecycle.tone}`} role="status" aria-live="polite">
                          <span className="orion-chat-v2-loading-orb" aria-hidden />
                          <span className="orion-chat-v2-loading-copy">
                            {lifecycle.tone === 'working' ? 'Working' : 'Thinking'}
                          </span>
                          <span className="orion-chat-v2-state-dots" aria-hidden>
                            <span />
                            <span />
                            <span />
                          </span>
                        </div>
                      ) : null}
                      {lifecycle && !showLoadingIndicator ? (
                        <div className={`orion-chat-v2-state is-${lifecycle.tone}`}>
                          <span className="orion-chat-v2-state-label">{lifecycle.label}</span>
                          {(lifecycle.tone === 'thinking' || lifecycle.tone === 'working') ? (
                            <span className="orion-chat-v2-state-dots" aria-hidden>
                              <span />
                              <span />
                              <span />
                            </span>
                          ) : null}
                        </div>
                      ) : null}
                      {hasSteps ? (
                        <div className={`orion-chat-v2-steps${stepsExpanded ? ' is-expanded' : ''}`}>
                          <button
                            type="button"
                            className="orion-chat-v2-steps-toggle"
                            onClick={() => {
                              setExpandedStepMessages((current) => ({
                                ...current,
                                [message.id]: !stepsExpanded,
                              }));
                            }}
                            aria-expanded={stepsExpanded}
                          >
                            <div className="orion-chat-v2-steps-toggle-copy">
                              <span className="orion-chat-v2-steps-toggle-title">
                                {activeStep ? activeStep.label : `${steps.length} step${steps.length === 1 ? '' : 's'}`}
                              </span>
                              <span className="orion-chat-v2-steps-toggle-detail">
                                {activeStep?.detail || (message.status === 'completed' ? 'Completed' : 'Click to inspect')}
                              </span>
                            </div>
                            <span className="orion-chat-v2-steps-toggle-meta">
                              <span>{stepsExpanded ? 'Hide' : 'Show'}</span>
                              {stepsExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                            </span>
                          </button>
                          {stepsExpanded ? (
                            <div className="orion-chat-v2-step-list">
                              {steps.map((step) => (
                                <div key={step.id} className={`orion-chat-v2-step is-${step.status}`}>
                                  <div className="orion-chat-v2-step-icon" aria-hidden>
                                    {renderChatStepIcon(step)}
                                  </div>
                                  <div className="orion-chat-v2-step-copy">
                                    <div className="orion-chat-v2-step-label">{step.label}</div>
                                    {step.detail ? (
                                      <div className="orion-chat-v2-step-detail">{step.detail}</div>
                                    ) : null}
                                  </div>
                                  <div className="orion-chat-v2-step-state" aria-hidden>
                                    {step.status === 'done' ? (
                                      <CheckCircle2 size={14} />
                                    ) : step.status === 'active' ? (
                                      <LoaderCircle size={14} className="spin" />
                                    ) : (
                                      <X size={14} />
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                      {isError && inlineError ? (
                        <div className="orion-chat-v2-inline-error">⚠ {inlineError}</div>
                      ) : !suppressBody ? (
                        <div className="orion-chat-v2-markdown">
                          <ReactMarkdown
                            components={{
                              code: ({ className, children, ...props }: ComponentPropsWithoutRef<'code'> & { inline?: boolean }) => {
                                const match = /language-([\w-]+)/.exec(className || '');
                                const rawCode = String(children || '').replace(/\n$/, '');
                                const isInlineCode = !String(rawCode || '').includes('\n') && !match;
                                if (isInlineCode) {
                                  return (
                                    <code className={className} {...props}>
                                      {children}
                                    </code>
                                  );
                                }
                                const fallbackArtifact: ChatArtifactRecord = {
                                  id: `${message.id}:code-fallback:${codeArtifactIndex}`,
                                  messageId: message.id,
                                  title: deriveArtifactTitle(match?.[1] || 'text', codeArtifactIndex),
                                  content: rawCode,
                                  language: normalizeArtifactLanguage(match?.[1] || 'text'),
                                  previewKind: inferArtifactPreviewKind(match?.[1] || 'text', rawCode),
                                  source: 'code',
                                };
                                const artifact = codeArtifacts[codeArtifactIndex] || fallbackArtifact;
                                codeArtifactIndex += 1;
                                return <ChatRenderableCodeBlock artifact={artifact} />;
                              },
                            }}
                          >
                            {displayContent}
                          </ReactMarkdown>
                        </div>
                      ) : null}
                      {message.runCard ? (
                        <div className={`orion-chat-v2-run-card is-${message.runCard.status}`}>
                          <div className="orion-chat-v2-run-card-header">
                            <div className="orion-chat-v2-run-card-title">{message.runCard.title}</div>
                            <div className={`orion-chat-v2-run-card-status is-${message.runCard.status}`}>
                              {renderRunCardStatusLabel(message.runCard.status)}
                            </div>
                          </div>
                          {message.runCard.meta && message.runCard.meta.length > 0 ? (
                            <div className="orion-chat-v2-run-card-meta">
                              {message.runCard.meta.map((entry) => (
                                <div key={entry.id} className="orion-chat-v2-run-card-meta-item">
                                  <span className="orion-chat-v2-run-card-meta-label">{entry.label}</span>
                                  <span className="orion-chat-v2-run-card-meta-value">{entry.value}</span>
                                </div>
                              ))}
                            </div>
                          ) : null}
                          {message.runCard.summary ? (
                            <div className="orion-chat-v2-run-card-summary">{message.runCard.summary}</div>
                          ) : null}
                          {message.runCard.evidence && message.runCard.evidence.length > 0 ? (
                            <div className="orion-chat-v2-run-card-evidence">
                              {message.runCard.evidence.map((entry) => (
                                <div key={entry.id} className="orion-chat-v2-run-card-evidence-item">
                                  <span className="orion-chat-v2-run-card-evidence-label">{entry.label}</span>
                                  <span className="orion-chat-v2-run-card-evidence-value">{entry.value}</span>
                                </div>
                              ))}
                            </div>
                          ) : null}
                          {message.runCard.approval ? (
                            <div className="orion-chat-v2-run-card-approval">
                              <div className="orion-chat-v2-run-card-approval-copy">{message.runCard.approval.prompt}</div>
                              {message.runCard.approval.labels.length > 0 ? (
                                <div className="orion-chat-v2-run-card-approval-tags">
                                  {message.runCard.approval.labels.map((label) => (
                                    <div key={label} className="orion-chat-v2-run-card-approval-tag">
                                      <span className="orion-chat-v2-run-card-evidence-value">{label}</span>
                                    </div>
                                  ))}
                                </div>
                              ) : null}
                              <div className="orion-chat-v2-run-card-evidence">
                                <div className="orion-chat-v2-run-card-evidence-item">
                                  <span className="orion-chat-v2-run-card-evidence-label">Action</span>
                                  <span className="orion-chat-v2-run-card-evidence-value">{message.runCard.approval.actions.join(', ') || 'Not recorded'}</span>
                                </div>
                                <div className="orion-chat-v2-run-card-evidence-item">
                                  <span className="orion-chat-v2-run-card-evidence-label">Target</span>
                                  <span className="orion-chat-v2-run-card-evidence-value">{message.runCard.approval.target || 'Not recorded'}</span>
                                </div>
                                <div className="orion-chat-v2-run-card-evidence-item">
                                  <span className="orion-chat-v2-run-card-evidence-label">Scope</span>
                                  <span className="orion-chat-v2-run-card-evidence-value">One-time for this pending step</span>
                                </div>
                                <div className="orion-chat-v2-run-card-evidence-item">
                                  <span className="orion-chat-v2-run-card-evidence-label">Consequence</span>
                                  <span className="orion-chat-v2-run-card-evidence-value">{message.runCard.approval.consequence || 'This confirmation applies only to this pending step in this run.'}</span>
                                </div>
                              </div>
                              <div className="orion-chat-v2-actions">
                                <button
                                  type="button"
                                  className="orion-chat-v2-action is-primary"
                                  onClick={() => onRunApprovalDecision?.('once')}
                                  disabled={!onRunApprovalDecision}
                                >
                                  Confirm once
                                </button>
                                <button
                                  type="button"
                                  className="orion-chat-v2-action is-danger"
                                  onClick={() => onRunApprovalDecision?.('deny')}
                                  disabled={!onRunApprovalDecision}
                                >
                                  Decline
                                </button>
                              </div>
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                      {message.actions && message.actions.length > 0 ? (
                        <div className="orion-chat-v2-actions">
                          {message.actions.map((action) => (
                            <button
                              key={action.id}
                              type="button"
                              className={`orion-chat-v2-action${action.variant === 'primary' ? ' is-primary' : ''}${action.kind === 'connect' ? ' is-connect' : ''}`}
                              onClick={() => onMessageAction?.(message.id, action)}
                              disabled={!onMessageAction}
                            >
                              {action.label}
                            </button>
                          ))}
                        </div>
                      ) : null}
                      <ChatMessageToolbar
                        copied={copiedMessageId === message.id}
                        onCopy={() => handleCopyMessage(message.id, displayContent)}
                        onSpeak={() => { void handleSpeakMessage(message.id, displayContent); }}
                        speaking={speakingMessageId === message.id}
                        onOpenArtifacts={artifactsForMessage.length > 0 ? () => handleSelectArtifact(artifactsForMessage[0]!.id) : null}
                        artifactCount={artifactsForMessage.length}
                      />
                      <div className="orion-chat-v2-meta">{fmtTime(message.ts)}</div>
                    </div>
                  )}
                </article>
              );
                })}
                <div ref={bottomRef} />
              </div>
            ) : null}
            <div className={`orion-chat-v2-composer-shell${hasMessages ? ' is-docked' : ' is-empty'}`}>
              <div className="orion-chat-v2-composer-frame">
            {permissionPrompt ? (
              <div className="orion-chat-v2-permission-card" role="status" aria-live="polite">
                <div className="orion-chat-v2-permission-header">
                  <div className="orion-chat-v2-permission-title">Confirmation required</div>
                  <div className="orion-chat-v2-permission-copy">{permissionPrompt.prompt}</div>
                </div>
                {permissionPrompt.labels.length > 0 ? (
                  <div className="orion-chat-v2-permission-chips">
                    {permissionPrompt.labels.map((label) => (
                      <span key={`label:${label}`} className="orion-chat-v2-permission-chip">{label}</span>
                    ))}
                  </div>
                ) : null}
                {permissionPrompt.capabilities.length > 0 ? (
                  <div className="orion-chat-v2-permission-detail">Requested: {permissionPrompt.capabilities.join(', ')}</div>
                ) : null}
                <div className="orion-chat-v2-permission-detail">Action: {permissionPrompt.actions.join(', ') || 'Not recorded'}</div>
                <div className="orion-chat-v2-permission-detail">Target: {permissionPrompt.target || 'Not recorded'}</div>
                <div className="orion-chat-v2-permission-detail">Scope: One-time for this pending step</div>
                <div className="orion-chat-v2-permission-detail">{permissionPrompt.consequence || 'This confirmation applies only to this pending step in this run.'}</div>
                <div className="orion-chat-v2-permission-actions">
                  <button
                    type="button"
                    className="orion-chat-v2-permission-action is-primary"
                    onClick={permissionPrompt.onAllowOnce}
                    disabled={Boolean(permissionPrompt.busyKey)}
                  >
                    {permissionPrompt.busyKey === 'Proceed:once' ? 'Confirming…' : 'Confirm once'}
                  </button>
                  <button
                    type="button"
                    className="orion-chat-v2-permission-action is-danger"
                    onClick={permissionPrompt.onDeny}
                    disabled={Boolean(permissionPrompt.busyKey)}
                  >
                    {permissionPrompt.busyKey === 'Hold:once' ? 'Declining…' : 'Decline'}
                  </button>
                </div>
              </div>
            ) : null}

            <div className="orion-chat-v2-composer">
              <textarea
                ref={primaryGoalRef}
                value={goal}
                onChange={(event) => setGoal(event.target.value)}
                placeholder="Ask anything or tell it what to do"
                rows={1}
                className="orion-chat-v2-input"
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    invokeSend();
                  }
                }}
              />

              <div className="orion-chat-v2-composer-toolbar">
                <div className="orion-chat-v2-composer-toolbar-left">
                  <button
                    type="button"
                    className="orion-chat-v2-model-pill"
                    onClick={() => setHistoryDrawerOpen(true)}
                    aria-label="Open chat history"
                  >
                    <PanelLeft size={14} />
                    <span>History</span>
                  </button>
                  <div className="orion-chat-v2-composer-menu" data-chat-menu-root>
                    <button
                      type="button"
                      className="orion-chat-v2-icon-btn"
                      aria-label="Add context"
                      aria-haspopup="menu"
                      aria-expanded={attachMenuOpen}
                      onClick={() => {
                        setAttachMenuOpen((current) => !current);
                        setModelMenuOpen(false);
                        setControlsMenuOpen(false);
                      }}
                    >
                      <Plus size={16} />
                    </button>
                    {attachMenuOpen ? (
                      <div className="orion-chat-v2-menu" role="menu">
                        <button type="button" className="orion-chat-v2-menu-item" onClick={() => { setAttachMenuOpen(false); router.push('/artifacts'); }}>
                          Open artifacts
                        </button>
                        <button type="button" className="orion-chat-v2-menu-item" onClick={() => { setAttachMenuOpen(false); router.push('/executions'); }}>
                          Open runs
                        </button>
                        <button type="button" className="orion-chat-v2-menu-item" onClick={() => { setAttachMenuOpen(false); onToggleIdentityDrawer(); }}>
                          Open context
                        </button>
                      </div>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    className={`orion-chat-v2-icon-btn orion-chat-v2-voice-btn${voicePhase === 'listening' ? ' is-recording' : ''}${voicePhase === 'processing' ? ' is-processing' : ''}`}
                    aria-label={voicePhase === 'listening' ? 'Stop voice input' : 'Start voice input'}
                    aria-pressed={voicePhase === 'listening'}
                    title={voicePhase === 'listening' ? 'Release to stop or click to stop' : 'Click to start, or hold to talk'}
                    onPointerDown={handleMicPointerDown}
                    onPointerUp={handleMicPointerRelease}
                    onPointerCancel={handleMicPointerRelease}
                    onPointerLeave={handleMicPointerRelease}
                    onClick={handleMicClick}
                    disabled={voicePhase === 'processing'}
                  >
                    {voicePhase === 'processing' ? <LoaderCircle size={16} className="spin" /> : <Mic size={16} />}
                  </button>
                </div>

                <div className="orion-chat-v2-composer-toolbar-right">
                  <div className="orion-chat-v2-composer-menu" data-chat-menu-root>
                    <button
                      type="button"
                      className="orion-chat-v2-model-pill"
                      aria-label="Choose model"
                      aria-haspopup="menu"
                      aria-expanded={modelMenuOpen}
                      title={modelsLoading ? 'Refreshing models' : 'Choose model'}
                      onClick={() => {
                        setModelMenuOpen((current) => !current);
                        setAttachMenuOpen(false);
                        setControlsMenuOpen(false);
                      }}
                    >
                      <span>Models</span>
                      <ChevronDown size={14} />
                    </button>
                    {modelMenuOpen ? (
                      <div className="orion-chat-v2-menu is-model" role="menu">
                        {modelOptions.map((option) => (
                          <button
                            key={option}
                            type="button"
                            className={`orion-chat-v2-menu-item${option === selectedModel ? ' is-selected' : ''}`}
                            onClick={() => {
                              onSelectModel(option);
                              setModelMenuOpen(false);
                            }}
                          >
                            {option}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>

                  <div className="orion-chat-v2-composer-menu" data-chat-menu-root>
                    <button
                      type="button"
                      className="orion-chat-v2-icon-btn"
                      aria-label="More controls"
                      aria-haspopup="menu"
                      aria-expanded={controlsMenuOpen}
                      onClick={() => {
                        setControlsMenuOpen((current) => !current);
                        setAttachMenuOpen(false);
                        setModelMenuOpen(false);
                      }}
                    >
                      <SlidersHorizontal size={16} />
                    </button>
                    {controlsMenuOpen ? (
                      <div className="orion-chat-v2-menu is-controls" role="menu">
                        <div className="orion-chat-v2-menu-section-label">Current access</div>
                        <div className="orion-chat-v2-menu-meta">{trustLabel}</div>
                        <div className="orion-chat-v2-menu-section-label">Response depth</div>
                        <div className="orion-chat-v2-menu-meta">{depthLabel}</div>
                        {depthOptions.map((option) => (
                          <button
                            key={option.value}
                            type="button"
                            className={`orion-chat-v2-menu-item${option.value === selectedDepth ? ' is-selected' : ''}`}
                            onClick={() => {
                              onSelectDepth(option.value);
                              setControlsMenuOpen(false);
                            }}
                          >
                            {option.label}
                          </button>
                        ))}
                        <button type="button" className="orion-chat-v2-menu-item" onClick={() => { setControlsMenuOpen(false); onToggleIdentityDrawer(); }}>
                          Open context
                        </button>
                        <button type="button" className="orion-chat-v2-menu-item" onClick={() => { setControlsMenuOpen(false); router.push('/connectors'); }}>
                          Open integrations
                        </button>
                      </div>
                    ) : null}
                  </div>

                  <button
                    type="button"
                    onClick={invokeSend}
                    disabled={sendDisabled}
                    className="orion-chat-v2-send"
                    aria-label="Send"
                  >
                    <ArrowUp size={16} />
                  </button>
                </div>
              </div>
            </div>

            {composerStatusText || emptyAction ? (
              <div className="orion-chat-v2-status-line">
                <span>{composerStatusText || 'Connect an AI account to start chatting.'}</span>
                {inlineAction ? (
                  <button type="button" className="orion-chat-v2-status-action" onClick={() => router.push(inlineAction.href)}>
                    {inlineAction.label}
                  </button>
                ) : emptyAction ? (
                  <button type="button" className="orion-chat-v2-status-action" onClick={() => router.push(emptyAction.href)}>
                    {emptyAction.label}
                  </button>
                ) : null}
              </div>
            ) : null}
              </div>
            </div>
          </div>
        </div>
        {artifactPanelVisible && selectedArtifact ? (
          <ChatArtifactPanel
            artifact={selectedArtifact}
            artifacts={artifacts}
            panelWidth={artifactPanelWidth}
            onClose={() => setArtifactPanelOpen(false)}
            onResizeStart={handleResizeArtifactPanel}
            onSelectArtifact={handleSelectArtifact}
          />
        ) : null}
      </div>

      {identityDrawerOpen ? (
        <>
          <button type="button" className="orion-chat-v2-drawer-backdrop" aria-label="Close setup details" onClick={onCloseIdentityDrawer} />
          <aside className="orion-chat-v2-drawer" aria-label="Chat context">
            <div className="orion-chat-v2-drawer-header">
              <div>
                <div className="orion-chat-v2-drawer-eyebrow">Context</div>
                <h2 className="orion-chat-v2-drawer-title">What this reply uses</h2>
              </div>
              <button type="button" className="orion-chat-v2-drawer-close" onClick={onCloseIdentityDrawer} aria-label="Close context">
                <X size={16} />
              </button>
            </div>
            <div className="orion-chat-v2-drawer-body">
              {identityActions.length > 0 ? (
                <div className="orion-chat-v2-drawer-actions">
                  {identityActions.map((action) => (
                    <button
                      key={action.label}
                      type="button"
                      className={`orion-chat-v2-drawer-action${action.priority === 'primary' ? ' is-primary' : ''}`}
                      onClick={action.onClick}
                    >
                      {action.label}
                    </button>
                  ))}
                </div>
              ) : null}
              {identitySections.map((section) => (
                <section key={section.title} className="orion-chat-v2-drawer-section">
                  <div className="orion-chat-v2-drawer-section-title">{section.title}</div>
                  {section.note ? <p className="orion-chat-v2-drawer-note">{section.note}</p> : null}
                  <div className="orion-chat-v2-drawer-grid">
                    {section.items.map((item) => (
                      <div key={`${section.title}:${item.label}:${item.value}`} className="orion-chat-v2-drawer-item">
                        <div className="orion-chat-v2-drawer-item-label">{item.label}</div>
                        <div className={`orion-chat-v2-drawer-item-value${item.tone ? ` is-${item.tone}` : ''}`}>{item.value}</div>
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </aside>
        </>
      ) : null}
    </section>
  );
}
