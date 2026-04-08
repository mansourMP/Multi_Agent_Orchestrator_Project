'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import type { ComponentPropsWithoutRef, PointerEvent as ReactPointerEvent } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowUp,
  Check,
  ChevronDown,
  Copy,
  FileText,
  LoaderCircle,
  Mic,
  Plus,
  Square,
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
  type ChatApprovalRequestRecord,
  type ChatMessageActionRecord,
  type ChatMessageRecord,
  type ChatSessionRecord,
  type ChatStepRecord,
} from './chatSchema';
import { ApprovalRequestCard } from './ApprovalRequestCard';
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
  onApprovalDecision?: (
    messageId: string,
    approval: ChatApprovalRequestRecord,
    decision: 'proceed' | 'hold',
  ) => Promise<void> | void;
  chatBusy: boolean;
  messages: ChatMessageRecord[];
  providerBanner?: {
    text: string;
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
  shellNotice?: {
    id: string;
    tone: 'neutral' | 'accent' | 'warn' | 'error';
    label: string;
    detail?: string | null;
    actions?: Array<{
      id: string;
      label: string;
      tone?: 'default' | 'primary' | 'danger';
      disabled?: boolean;
      onClick: () => void;
    }>;
  } | null;
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

function formatPendingToolLabel(step: ChatStepRecord | null): string | null {
  if (!step) return null;
  const kind = String(step.kind || '').toLowerCase();
  const label = String(step.label || '').toLowerCase();
  const detail = String(step.detail || '').toLowerCase();
  if (kind === 'file') return 'Reading file...';
  if (kind === 'shell') return 'Running command...';
  if (kind === 'screenshot') return 'Capturing screenshot...';
  if (kind === 'connector') {
    if (label.includes('search') || detail.includes('search') || label.includes('web') || detail.includes('web')) {
      return 'Searching the web...';
    }
    if (
      label.includes('browser')
      || detail.includes('browser')
      || label.includes('page')
      || detail.includes('page')
      || label.includes('navigate')
      || detail.includes('navigate')
      || label.includes('url')
      || detail.includes('url')
    ) {
      return 'Loading page...';
    }
    return 'Using tool...';
  }
  if (kind === 'thinking') return 'Working...';
  if (!kind && (label || detail)) return 'Working...';
  return null;
}

function formatChatHistoryTimestamp(value: string): string {
  const timestamp = String(value || '').trim();
  if (!timestamp) return 'No activity yet';
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) return 'No activity yet';
  return parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function hasSavedChatHistory(session: ChatSessionRecord): boolean {
  return session.messages.some((message) => message.role === 'user' && String(message.content || '').trim());
}

function buildChatHistoryTitle(session: ChatSessionRecord): string {
  const firstUserMessage = session.messages.find((message) => message.role === 'user' && String(message.content || '').trim());
  const titleSource = String(firstUserMessage?.content || '').replace(/\s+/g, ' ').trim();
  if (!titleSource) return 'New chat';
  return titleSource.length > 48 ? `${titleSource.slice(0, 45).trimEnd()}...` : titleSource;
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
  onApprovalDecision,
  chatBusy,
  messages,
  providerBanner = null,
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
  shellNotice = null,
}: ChatSurfaceProps) {
  const router = useRouter();
  const { accessMode, setAccessMode, setChatTopControls } = usePlatformShell();
  const sendDisabled = chatBusy || goal.trim().length === 0;
  const threadRef = useRef<HTMLDivElement>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
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
  const visibleHistorySessions = useMemo(
    () => historySessions.filter(hasSavedChatHistory),
    [historySessions],
  );
  const visibleMessages = useMemo(() => messages, [messages]);
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
  const latestAssistantMessage = useMemo(
    () => [...messages].reverse().find((message) => message.role === 'assistant') || null,
    [messages],
  );
  const latestAssistantLifecycle = useMemo(() => {
    if (!latestAssistantMessage) return null;
    const streamState = resolveAssistantStreamState(latestAssistantMessage);
    return resolveAssistantLifecycle(streamState?.showLoading ? (latestAssistantMessage.status || 'running') : latestAssistantMessage.status);
  }, [latestAssistantMessage]);
  const latestAssistantError = useMemo(() => {
    const failedMessage = [...messages].reverse().find((message) => message.role === 'assistant' && message.status === 'error');
    if (!failedMessage) return null;
    const displayContent = normalizeAssembledAssistantText(normalizeAssistantDisplayText(failedMessage.content));
    return normalizeInlineErrorMessage(displayContent) || displayContent || null;
  }, [messages]);
  const latestAssistantSteps = useMemo(() => {
    const stepMessage = [...messages].reverse().find(
      (message) => message.role === 'assistant' && Array.isArray(message.steps) && message.steps.length > 0,
    );
    if (!stepMessage || !Array.isArray(stepMessage.steps) || stepMessage.steps.length === 0) return null;
    const activeStep = stepMessage.steps.find((step) => step.status === 'active') || stepMessage.steps[stepMessage.steps.length - 1] || null;
    return {
      count: stepMessage.steps.length,
      label: activeStep?.label || `${stepMessage.steps.length} steps`,
      detail: activeStep?.detail || (activeStep?.status === 'done' ? 'Completed' : 'Recorded in this reply'),
      kind: activeStep?.kind || null,
      status: activeStep?.status || null,
    };
  }, [messages]);
  const pendingAssistantMessage = latestAssistantMessage;
  const pendingAssistantContent = pendingAssistantMessage
    ? normalizeAssembledAssistantText(normalizeAssistantDisplayText(pendingAssistantMessage.content))
    : '';
  const pendingAssistantSuppressed = pendingAssistantMessage
    ? shouldSuppressAssistantBody(pendingAssistantContent, pendingAssistantMessage.status)
    : false;
  const shouldShowPendingRow = Boolean(
    pendingAssistantMessage
      && (pendingAssistantMessage.status === 'sending' || pendingAssistantMessage.status === 'running')
      && pendingAssistantSuppressed,
  );
  const pendingStep = latestAssistantSteps && latestAssistantSteps.label
    ? ({
        id: latestAssistantSteps.label,
        label: latestAssistantSteps.label,
        detail: latestAssistantSteps.detail,
        status: latestAssistantSteps.status || 'active',
        kind: latestAssistantSteps.kind || null,
      } as ChatStepRecord)
    : null;
  const pendingStepLabel = formatPendingToolLabel(pendingStep);
  const pendingStepActive = pendingStep?.status === 'active';
  const selectedModelLabel = useMemo(() => {
    const value = String(selectedModel || '').trim();
    if (!value) return 'Model';
    return value.length > 18 ? `${value.slice(0, 18).trimEnd()}...` : value;
  }, [selectedModel]);
  const latestRunCard = useMemo(
    () => [...messages].reverse().find((message) => message.role === 'assistant' && message.runCard)?.runCard || null,
    [messages],
  );
  const latestActionMessage = useMemo(
    () => [...messages].reverse().find((message) => message.role === 'assistant' && Array.isArray(message.actions) && message.actions.length > 0) || null,
    [messages],
  );
  const topPanelNotices = useMemo(() => {
    const notices: Array<NonNullable<ReturnType<typeof usePlatformShell>['chatTopControls']>['notices'][number]> = [];

    if (providerBanner) {
      notices.push({
        id: 'provider',
        tone: 'warn',
        label: providerBanner.text,
        actions: [{
          id: 'provider:open',
          label: providerBanner.label,
          tone: 'primary',
          onClick: () => router.push(providerBanner.href),
        }],
      });
    }

    if (shellNotice) {
      notices.push(shellNotice);
    }

    if (voiceError) {
      notices.push({
        id: 'voice',
        tone: 'error',
        label: 'Voice unavailable',
        detail: voiceError,
      });
    }

    if (latestAssistantSteps) {
      notices.push({
        id: 'steps',
        tone: 'neutral',
        label: latestAssistantSteps.label,
        detail: latestAssistantSteps.detail,
      });
    }

    if (latestRunCard) {
      notices.push({
        id: 'run',
        tone: latestRunCard.status === 'failed' || latestRunCard.status === 'needs_attention' ? 'warn' : 'accent',
        label: latestRunCard.title,
        detail: latestRunCard.summary || latestRunCard.status,
      });
    }

    if (latestAssistantError) {
      notices.push({
        id: 'error',
        tone: 'error',
        label: 'Assistant error',
        detail: latestAssistantError,
      });
    }

    if (latestActionMessage?.actions && latestActionMessage.actions.length > 0 && onMessageAction) {
      notices.push({
        id: 'actions',
        tone: 'accent',
        label: 'Actions available',
        detail: 'Use the latest assistant actions from here.',
        actions: latestActionMessage.actions.map((action) => ({
          id: action.id,
          label: action.label,
          tone: action.variant === 'primary' ? 'primary' : 'default',
          onClick: () => onMessageAction(latestActionMessage.id, action),
        })),
      });
    }

    return notices;
  }, [
    latestActionMessage,
    latestAssistantError,
    latestAssistantLifecycle,
    latestAssistantSteps,
    latestRunCard,
    onMessageAction,
    permissionPrompt,
    providerBanner,
    router,
    shellNotice,
    voiceError,
  ]);
  const artifacts = messageArtifacts.allArtifacts;
  const inlineComposerNotice = useMemo(() => {
    if (!shellNotice) return null;
    if (shellNotice.tone !== 'warn' && shellNotice.tone !== 'error') return null;
    return shellNotice;
  }, [shellNotice]);
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
  }, [messages, chatBusy]);

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
      setLatestArtifactId(latest.id);
    }
  }, [artifacts, isMobile, latestArtifactId, selectedArtifactId]);

  useEffect(() => {
    if (!attachMenuOpen && !modelMenuOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (target.closest('[data-chat-menu-root]')) return;
      setAttachMenuOpen(false);
      setModelMenuOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setAttachMenuOpen(false);
      setModelMenuOpen(false);
    };
    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [attachMenuOpen, modelMenuOpen]);

  useEffect(() => {
    if (!identityDrawerOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseIdentityDrawer();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [identityDrawerOpen, onCloseIdentityDrawer]);

  useEffect(() => {
    const handler = () => setHistoryDrawerOpen(true);
    window.addEventListener('orion:open-history', handler);
    return () => window.removeEventListener('orion:open-history', handler);
  }, []);

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
      notices: topPanelNotices.filter((n) => n.id !== 'provider' && (n.tone === 'warn' || n.tone === 'error') && Array.isArray(n.actions) && n.actions.length > 0),
    });
  }, [
    artifactPanelVisible,
    artifacts.length,
    handleOpenContextFromTopBar,
    handleToggleArtifactsFromTopBar,
    setChatTopControls,
    targetLabel,
    topPanelNotices,
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
              className="orion-chat-v2-history-backdrop"
              aria-label="Close chat history"
              onClick={() => setHistoryDrawerOpen(false)}
            />
            <aside
              aria-label="Chat history"
              className="orion-chat-v2-history"
              style={isMobile ? { width: 'min(100%, 320px)' } : undefined}
            >
              <div className="orion-chat-v2-history-header">
                <div className="orion-chat-v2-history-toolbar">
                  <div>
                    <div className="orion-chat-v2-history-title">Chats</div>
                    <div className="orion-chat-v2-history-copy">Recent</div>
                  </div>
                  <button
                    type="button"
                    className="orion-chat-v2-history-close"
                    aria-label="Close chat history"
                    onClick={() => setHistoryDrawerOpen(false)}
                  >
                    <X size={15} />
                  </button>
                </div>
                <button type="button" className="orion-btn orion-chat-v2-history-new" onClick={onNewChat}>New chat</button>
              </div>
              <div className="orion-chat-v2-history-list">
                {visibleHistorySessions.length === 0 ? (
                  <div className="orion-chat-v2-history-empty">No saved chats yet.</div>
                ) : (
                  visibleHistorySessions.map((session) => {
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
                        className={`orion-chat-v2-history-item${active ? ' is-active' : ''}`}
                      >
                        <div className="orion-chat-v2-history-item-head">
                          <div className="orion-chat-v2-history-item-title">{buildChatHistoryTitle(session)}</div>
                          <div className="orion-chat-v2-history-item-time">{formatChatHistoryTimestamp(session.updatedAt)}</div>
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
            {!hasMessages ? (
              <div className="orion-chat-v2-compact-empty">
                <h1 className="orion-chat-v2-compact-title">Start a new chat</h1>
                <p className="orion-chat-v2-compact-copy">
                  Ask a question, describe a task, or tell {targetLabel} what to do next.
                </p>
                {providerBanner ? (
                  <button
                    type="button"
                    className="orion-chat-v2-empty-action"
                    onClick={() => router.push(providerBanner.href)}
                  >
                    {providerBanner.label}
                  </button>
                ) : null}
              </div>
            ) : null}
            {visibleMessages.length > 0 ? (
              <div className="orion-chat-v2-thread" aria-live="polite">
                {visibleMessages.map((message, index) => {
              const isUser = message.role === 'user';
              const previousMessage = index > 0 ? visibleMessages[index - 1] : null;
              const followsUser = !isUser && previousMessage?.role === 'user';
              const displayContent = isUser ? message.content : normalizeAssembledAssistantText(normalizeAssistantDisplayText(message.content));
              const suppressBody = !isUser && shouldSuppressAssistantBody(displayContent, message.status);
              const isFirstAssistantEntry = !isUser && isFirstThread && index <= 1;
              const artifactsForMessage = !isUser ? messageArtifacts.byMessage.get(message.id) || [] : [];
              const codeArtifacts = artifactsForMessage.filter((artifact) => artifact.source === 'code');
              if (!isUser && suppressBody && artifactsForMessage.length === 0 && (!message.approvalRequests || message.approvalRequests.length === 0)) {
                return null;
              }
              let codeArtifactIndex = 0;
              const approvalRequests = Array.isArray(message.approvalRequests) ? message.approvalRequests : [];
              const handleApprovalDecision = (approval: ChatApprovalRequestRecord, decision: 'proceed' | 'hold') => {
                if (onApprovalDecision) {
                  return onApprovalDecision(message.id, approval, decision);
                }
                const linkedAction = message.actions?.find(
                  (action) => action.kind === 'approval_required' && action.id === approval.actionId,
                ) || message.actions?.find((action) => action.kind === 'approval_required');
                if (!linkedAction || !onMessageAction) return;
                if (decision === 'proceed') {
                  return onMessageAction(message.id, linkedAction);
                }
              };
              return (
                <article
                  key={message.id}
                  className={`orion-chat-v2-turn${isUser ? ' is-user' : ' is-assistant'}${isFirstAssistantEntry ? ' is-first-assistant-entry' : ''}${followsUser ? ' is-following-user' : ''}`}
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
                      {!suppressBody ? (
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
                      {approvalRequests.length > 0 ? (
                        <div>
                          {approvalRequests.map((approval) => (
                            <ApprovalRequestCard
                              key={approval.id}
                              approval={approval}
                              onDecision={(decision) => handleApprovalDecision(approval, decision)}
                            />
                          ))}
                        </div>
                      ) : null}
                      {displayContent || artifactsForMessage.length > 0 ? (
                        <>
                          <ChatMessageToolbar
                            copied={copiedMessageId === message.id}
                            onCopy={() => handleCopyMessage(message.id, displayContent)}
                            onSpeak={() => { void handleSpeakMessage(message.id, displayContent); }}
                            speaking={speakingMessageId === message.id}
                            onOpenArtifacts={artifactsForMessage.length > 0 ? () => handleSelectArtifact(artifactsForMessage[0]!.id) : null}
                            artifactCount={artifactsForMessage.length}
                          />
                          <div className="orion-chat-v2-meta">{fmtTime(message.ts)}</div>
                        </>
                      ) : (
                        <div className="orion-chat-v2-meta">{fmtTime(message.ts)}</div>
                      )}
                    </div>
                  )}
                </article>
              );
                })}
                {shouldShowPendingRow ? (
                  <article className="orion-chat-v2-turn is-assistant is-pending">
                    <div className="orion-chat-v2-assistant">
                      {pendingStepLabel ? (
                        <div className="orion-chat-v2-pending-label">{pendingStepLabel}</div>
                      ) : null}
                      {pendingStepActive ? <div className="orion-skeleton-line" /> : null}
                      <div className="orion-thinking-indicator">
                        <div className="orion-thinking-dot"></div>
                        <div className="orion-thinking-dot"></div>
                        <div className="orion-thinking-dot"></div>
                      </div>
                    </div>
                  </article>
                ) : null}
                <div ref={bottomRef} />
              </div>
            ) : null}
            <div className={`orion-chat-v2-composer-shell${hasMessages ? ' is-docked' : ' is-empty'}`}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 12,
                  flexWrap: 'wrap',
                  marginBottom: 12,
                }}
              >
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: 4,
                    borderRadius: 999,
                    border: '1px solid var(--border-default)',
                    background: 'var(--bg-surface)',
                  }}
                >
                  <button
                    type="button"
                    className="orion-btn"
                    onClick={() => setAccessMode('default')}
                    style={{
                      minHeight: 34,
                      borderRadius: 999,
                      padding: '0 12px',
                      fontSize: 12,
                      border: accessMode === 'default' ? '1px solid var(--primary-border-soft)' : '1px solid transparent',
                      background: accessMode === 'default' ? 'var(--primary-soft)' : 'transparent',
                      color: accessMode === 'default' ? 'var(--text-primary)' : 'var(--text-secondary)',
                    }}
                    aria-pressed={accessMode === 'default'}
                  >
                    Co-Pilot Mode
                  </button>
                  <button
                    type="button"
                    className="orion-btn"
                    onClick={() => setAccessMode('full')}
                    style={{
                      minHeight: 34,
                      borderRadius: 999,
                      padding: '0 12px',
                      fontSize: 12,
                      border: accessMode === 'full' ? '1px solid rgba(214, 75, 75, 0.35)' : '1px solid transparent',
                      background: accessMode === 'full' ? 'rgba(122, 27, 27, 0.16)' : 'transparent',
                      color: accessMode === 'full' ? '#f3b3b3' : 'var(--text-secondary)',
                    }}
                    aria-pressed={accessMode === 'full'}
                  >
                    Agent Mode
                  </button>
                </div>
                <div
                  style={{
                    fontSize: 12,
                    lineHeight: 1.4,
                    padding: '8px 12px',
                    borderRadius: 999,
                    border: accessMode === 'full'
                      ? '1px solid rgba(214, 75, 75, 0.28)'
                      : '1px solid var(--border-default)',
                    background: accessMode === 'full'
                      ? 'rgba(122, 27, 27, 0.1)'
                      : 'rgba(255,255,255,0.03)',
                    color: accessMode === 'full' ? '#f3b3b3' : 'var(--text-secondary)',
                  }}
                >
                  {accessMode === 'full'
                    ? `Agent Mode active. Full-trust owner requests can run autonomously.`
                    : `Co-Pilot Mode active. Sensitive actions stay behind approval cards.`}
                </div>
              </div>
              {inlineComposerNotice ? (
                <div
                  style={{
                    marginBottom: 12,
                    padding: '12px 14px',
                    borderRadius: 14,
                    border: inlineComposerNotice.tone === 'error'
                      ? '1px solid rgba(214, 73, 73, 0.28)'
                      : '1px solid rgba(199, 136, 43, 0.28)',
                    background: inlineComposerNotice.tone === 'error'
                      ? 'rgba(214, 73, 73, 0.08)'
                      : 'rgba(199, 136, 43, 0.08)',
                    color: 'var(--text-primary)',
                    fontSize: 13,
                    lineHeight: 1.45,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}
                >
                  {inlineComposerNotice.detail || inlineComposerNotice.label}
                </div>
              ) : null}
              <div className="orion-chat-v2-composer-frame">
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
                      }}
                    >
                      <span>{selectedModelLabel}</span>
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
                  <div
                    style={{
                      fontSize: 11,
                      color: accessMode === 'full' ? '#f3b3b3' : 'var(--text-muted)',
                      padding: '0 2px',
                      whiteSpace: 'nowrap',
                    }}
                    aria-live="polite"
                  >
                    {trustLabel}
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
