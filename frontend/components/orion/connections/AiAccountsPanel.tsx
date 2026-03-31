'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import {
  ChevronDown,
  PauseCircle,
  PlayCircle,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react';
import {
  DEFAULT_MODEL_ALIAS_OPTIONS,
  DEFAULT_PROVIDER_LABELS,
  DEFAULT_PROVIDER_MODELS,
  DEFAULT_PROVIDER_OPTIONS,
  getProviderAuthModes,
  isProviderId,
  normalizeProviderId,
  resolveModelAlias,
  type ModelAliasOption,
  type ProviderId,
  type ProviderOption,
} from '@/app/page.catalog';
import { ProviderLogoMark } from '@/components/orion/connections/ConnectionMarks';
import { ensureControlPlaneSession } from '@/lib/controlPlaneSession';

type ProviderCredentialRow = {
  id: string;
  label: string;
  provider: ProviderId;
  rawProvider?: string;
  metadata?: Record<string, unknown>;
  authMode?: string;
  created_at?: string;
  updated_at?: string;
};

type ProviderProfileRow = {
  id: string;
  provider: ProviderId;
  rawProvider?: string;
  label: string;
  credential_id?: string | null;
  auth_mode?: string | null;
  workspace_id?: string | null;
  priority?: number;
  enabled: boolean;
  model?: string | null;
  health?: string | null;
  cooldown_until?: string | null;
  last_error?: string | null;
  last_used_at?: string | null;
  last_success_at?: string | null;
  last_failure_at?: string | null;
  success_count?: number;
  failure_count?: number;
  created_at?: string;
  updated_at?: string;
};

type ProviderProfilesHealth = {
  healthy: number;
  cooldown: number;
  disabled: number;
  total: number;
};

type RuntimeAvailabilityItem = {
  provider: ProviderId;
  label: string;
  ready: boolean;
  status: 'ready' | 'attention';
  source: string;
  source_label: string;
  detail: string;
  profile_count: number;
};

type LocalOpenAiAuthStatus = {
  available: boolean;
  importable: boolean;
  auth_file_exists: boolean;
  auth_file_path?: string;
  auth_mode?: string | null;
  has_access_token: boolean;
  has_api_key: boolean;
  sign_in_url?: string;
  detail?: string;
};

type ProviderAccountFormState = {
  provider: ProviderId;
  label: string;
  authMode: string;
  secret: string;
  projectId: string;
  location: string;
  model: string;
  enableRuntime: boolean;
};

type ProviderConnectMethodId =
  | 'openai_api_key'
  | 'openai_browser_oauth'
  | 'openai_local_import'
  | 'anthropic_api_key'
  | 'anthropic_local_import'
  | 'gemini_api_key'
  | 'gemini_cli_oauth'
  | 'vertex_access_token'
  | 'qwen_api_key'
  | 'deepseek_api_key'
  | 'mistral_api_key'
  | 'ollama_local';

type ProviderConnectMethodAction =
  | 'manual'
  | 'openai_browser_oauth'
  | 'openai_local_import'
  | 'anthropic_local_import'
  | 'gemini_cli_oauth';

type ProviderConnectMethod = {
  id: ProviderConnectMethodId;
  provider: ProviderId;
  label: string;
  description: string;
  authMode: string;
  action: ProviderConnectMethodAction;
  disabled?: boolean;
  disabledReason?: string;
};

type AiAccountsPanelProps = {
  workspaceId: string;
  mode?: 'manage' | 'connect';
  returnTo?: string;
};

type ProviderVisual = {
  assetSrc?: string;
  bg: string;
  border: string;
};

type ClaudeAuthStatus = {
  ok?: boolean;
  available?: boolean;
  loggedIn?: boolean;
  authMethod?: string;
  apiProvider?: string;
  message?: string;
};

type GeminiCliStatus = {
  ok?: boolean;
  available?: boolean;
  message?: string;
};

type ProviderCardState = {
  provider: ProviderId;
  label: string;
  credential: ProviderCredentialRow | null;
  profile: ProviderProfileRow | null;
  availability: RuntimeAvailabilityItem | null;
  order: number | null;
  isDefaultProfile: boolean;
  isActiveProfile: boolean;
  enabled: boolean;
  errorMessage: string | null;
};

const DEFAULT_PROVIDER_FORM: ProviderAccountFormState = {
  provider: 'anthropic',
  label: 'My Anthropic Key',
  authMode: 'api_key',
  secret: '',
  projectId: '',
  location: 'us-central1',
  model: 'claude-sonnet',
  enableRuntime: true,
};

const PROVIDER_ASSET_TILE_BG = 'var(--bg-element)';
const PROVIDER_ASSET_TILE_BORDER = 'var(--border-subtle)';

const PROVIDER_VISUALS: Partial<Record<ProviderId, ProviderVisual>> = {
  openai: {
    assetSrc: '/provider-logos/openai.svg',
    bg: PROVIDER_ASSET_TILE_BG,
    border: PROVIDER_ASSET_TILE_BORDER,
  },
  anthropic: {
    assetSrc: '/provider-logos/anthropic-icon.ico',
    bg: PROVIDER_ASSET_TILE_BG,
    border: PROVIDER_ASSET_TILE_BORDER,
  },
  claude_code_cli: {
    assetSrc: '/provider-logos/anthropic-icon.ico',
    bg: PROVIDER_ASSET_TILE_BG,
    border: PROVIDER_ASSET_TILE_BORDER,
  },
  gemini: {
    assetSrc: '/provider-logos/gemini.svg',
    bg: PROVIDER_ASSET_TILE_BG,
    border: PROVIDER_ASSET_TILE_BORDER,
  },
  vertex: {
    assetSrc: '/provider-logos/vertex.svg',
    bg: PROVIDER_ASSET_TILE_BG,
    border: PROVIDER_ASSET_TILE_BORDER,
  },
  mistral: {
    assetSrc: '/provider-logos/mistral-icon.ico',
    bg: PROVIDER_ASSET_TILE_BG,
    border: PROVIDER_ASSET_TILE_BORDER,
  },
};

function providerVisual(provider: ProviderId): ProviderVisual | null {
  return PROVIDER_VISUALS[provider] || null;
}

function ProviderMark({ provider, size }: { provider: ProviderId; size: number }) {
  const visual = providerVisual(provider);
  if (!visual?.assetSrc) {
    return <ProviderLogoMark provider={provider} size={size} />;
  }
  const innerSize = Math.round(size * 0.88);

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: Math.max(6, Math.round(size * 0.24)),
        background: visual.bg,
        border: `1px solid ${visual.border}`,
        display: 'grid',
        placeItems: 'center',
        flexShrink: 0,
        overflow: 'hidden',
      }}
    >
      <Image
        src={visual.assetSrc}
        alt=""
        aria-hidden="true"
        unoptimized
        width={innerSize}
        height={innerSize}
        style={{
          width: innerSize,
          height: innerSize,
          objectFit: 'contain',
        }}
      />
    </div>
  );
}

function defaultConnectMethodForProvider(provider: ProviderId): ProviderConnectMethodId {
  if (provider === 'openai') return 'openai_api_key';
  if (provider === 'anthropic') return 'anthropic_api_key';
  if (provider === 'gemini') return 'gemini_api_key';
  if (provider === 'qwen') return 'qwen_api_key';
  if (provider === 'deepseek') return 'deepseek_api_key';
  if (provider === 'mistral') return 'mistral_api_key';
  if (provider === 'ollama') return 'ollama_local';
  return 'vertex_access_token';
}

function authModeForConnectMethod(methodId: ProviderConnectMethodId): string {
  switch (methodId) {
    case 'openai_browser_oauth':
    case 'openai_local_import':
      return 'oauth_token';
    case 'anthropic_local_import':
      return 'local_cli';
    case 'gemini_cli_oauth':
      return 'gemini_cli_oauth';
    case 'vertex_access_token':
      return 'access_token';
    case 'ollama_local':
      return 'none';
    case 'openai_api_key':
    case 'anthropic_api_key':
    case 'gemini_api_key':
    case 'qwen_api_key':
    case 'deepseek_api_key':
    case 'mistral_api_key':
    default:
      return 'api_key';
  }
}

function isManualConnectMethod(action: ProviderConnectMethodAction): boolean {
  return action === 'manual';
}

function formatDate(value?: string | null): string {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString();
}

function normalizeProvidersError(message?: string | null): string {
  const normalized = String(message || '').trim();
  const lowered = normalized.toLowerCase();
  if (
    !normalized ||
    lowered === 'failed to fetch' ||
    lowered.includes('networkerror') ||
    lowered.includes('load failed') ||
    lowered.includes('aborted') ||
    lowered.includes('timed out')
  ) {
    return 'Unable to reach the local control plane. Start Empyralis services, then try again.';
  }
  return normalized;
}

function providerOptionFor(provider: ProviderId, options: ProviderOption[]): ProviderOption {
  return options.find((item) => item.id === provider)
    || DEFAULT_PROVIDER_OPTIONS.find((item) => item.id === provider)
    || DEFAULT_PROVIDER_OPTIONS[0];
}

function providerLabel(provider: ProviderId, options: ProviderOption[]): string {
  return providerOptionFor(provider, options).label || provider;
}

function providerAuthModeLabel(provider: ProviderId, authMode: string | undefined, options: ProviderOption[]): string {
  const resolved = String(authMode || '').trim().toLowerCase();
  const item = getProviderAuthModes(providerOptionFor(provider, options)).find((entry) => entry.id === resolved);
  if (item?.label) return item.label;
  if (resolved === 'local_cli') return 'Claude Subscription';
  if (resolved === 'oauth_token') return 'Saved OpenAI / Codex token';
  if (resolved === 'api_key') return 'API Key';
  if (resolved === 'access_token') return provider === 'vertex' ? 'Vertex access token' : 'OpenAI access token';
  return resolved || 'Default';
}

function defaultProviderModel(provider: ProviderId, authMode: string, options: ProviderOption[]): string {
  if (provider === 'anthropic' && authMode === 'local_cli') {
    return providerOptionFor('anthropic', options).defaultModel || DEFAULT_PROVIDER_MODELS.anthropic[0] || 'claude-sonnet';
  }
  const fallback = providerOptionFor(provider, options).defaultModel;
  return fallback || DEFAULT_PROVIDER_MODELS[provider]?.[0] || '';
}

function defaultProviderLabel(provider: ProviderId, authMode: string): string {
  if (provider === 'anthropic' && authMode === 'local_cli') return DEFAULT_PROVIDER_LABELS.claude_code_cli;
  return DEFAULT_PROVIDER_LABELS[provider] || 'AI Account';
}

function knownProviderId(value?: unknown): ProviderId | null {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'claude_code_cli') return 'anthropic';
  if (raw === 'openai-codex') return 'openai';
  return isProviderId(raw) ? raw : null;
}

function parseModelAliasCatalog(items: unknown[]): ModelAliasOption[] {
  return items
    .map((item: unknown) => {
      const value = item as {
        alias?: unknown;
        provider?: unknown;
        model?: unknown;
        resolved_model?: unknown;
        is_global_default?: unknown;
        is_provider_default?: unknown;
      };
      const rawProvider = typeof value.provider === 'string' ? value.provider.trim().toLowerCase() : '';
      const provider = normalizeProviderId(rawProvider);
      const alias = typeof value.alias === 'string' ? value.alias.trim() : '';
      const model = typeof value.model === 'string' ? value.model.trim() : '';
      const resolvedModel = typeof value.resolved_model === 'string' ? value.resolved_model.trim() : '';
      if (!rawProvider || !alias || !model || !resolvedModel) return null;
      return {
        alias,
        provider,
        model,
        resolvedModel,
        isGlobalDefault: Boolean(value.is_global_default),
        isProviderDefault: Boolean(value.is_provider_default),
      } satisfies ModelAliasOption;
    })
    .filter((item: ModelAliasOption | null): item is ModelAliasOption => item !== null);
}

function buildProviderCredentialPayload(state: ProviderAccountFormState): Record<string, unknown> {
  if (state.provider === 'anthropic') {
    if (state.authMode === 'local_cli') return { auth_mode: 'local_cli' };
    return { api_key: state.secret.trim(), auth_mode: state.authMode || 'api_key' };
  }
  if (state.provider === 'gemini') {
    if (state.authMode === 'gemini_cli_oauth') return { auth_mode: 'gemini_cli_oauth' };
    return { api_key: state.secret.trim(), auth_mode: state.authMode || 'api_key' };
  }
  if (state.provider === 'vertex') {
    return {
      access_token: state.secret.trim(),
      project_id: state.projectId.trim(),
      location: state.location.trim() || 'us-central1',
      auth_mode: state.authMode || 'access_token',
    };
  }
  if (state.provider === 'ollama') {
    return {
      auth_mode: state.authMode || 'none',
      base_url: 'http://localhost:11434/v1',
    };
  }
  const token = state.secret.trim();
  if (state.authMode === 'access_token') {
    return { access_token: token, auth_mode: 'access_token' };
  }
  if (state.authMode === 'oauth_token') {
    return { oauth_token: token, auth_mode: 'oauth_token' };
  }
  return { api_key: token, auth_mode: 'api_key' };
}

function providerSetupGuidance(provider: ProviderId, authMode: string, option: ProviderOption): string {
  if (provider === 'openai') {
    if (authMode === 'oauth_token') {
      return 'Paste a saved OpenAI token you already control, or use the ChatGPT action above when desktop sign-in or local session import is available.';
    }
    if (authMode === 'access_token') {
      return 'Paste a direct OpenAI access token. Use this only if your organization issues access tokens instead of API keys.';
    }
    return option.note || 'Use a direct OpenAI API key. Empyralis does not route your requests through third-party model gateways.';
  }
  if (provider === 'gemini' && authMode === 'gemini_cli_oauth') {
    return option.note || 'Use the Gemini CLI OAuth action on the provider card.';
  }
  if (provider === 'anthropic' && authMode === 'local_cli') {
    return option.note || 'Use the Claude subscription already signed into the local Claude CLI on this machine.';
  }
  return option.note || 'Use direct provider credentials only.';
}

function providerAccountContextLine(item: ProviderCredentialRow): string {
  if (item.provider === 'anthropic' && item.authMode === 'local_cli') {
    return 'Uses the local Claude subscription already signed into the `claude` CLI on this Mac.';
  }
  if (item.provider === 'ollama') {
    return 'Uses the local Ollama OpenAI-compatible endpoint on this machine.';
  }
  if (item.provider === 'vertex') {
    const projectId = String(item.metadata?.project_id || '').trim();
    const location = String(item.metadata?.location || '').trim();
    return [projectId ? `Project ${projectId}` : '', location ? `Region ${location}` : '']
      .filter(Boolean)
      .join(' • ') || 'Saved access token for Vertex AI.';
  }
  return 'Saved in the encrypted Empyralis vault for this workspace.';
}

function profileTone(profile: ProviderProfileRow | null): CSSProperties {
  if (!profile) {
    return { color: 'var(--text-secondary)', border: '1px solid var(--border-default)', background: 'var(--bg-element)' };
  }
  if (profile.health === 'cooldown') {
    return { color: 'var(--warning-fg)', border: '1px solid var(--warning-border)', background: 'var(--warning-bg)' };
  }
  if (profile.enabled) {
    return { color: 'var(--success-fg)', border: '1px solid var(--success-border)', background: 'var(--success-bg)' };
  }
  return { color: 'var(--text-secondary)', border: '1px solid var(--border-default)', background: 'var(--bg-element)' };
}

function profileStatusLabel(profile: ProviderProfileRow | null, mode: 'manage' | 'connect'): string {
  if (!profile) return 'Vault only';
  if (profile.health === 'cooldown') return 'Cooldown';
  if (mode === 'connect') return profile.enabled ? 'Ready' : 'Saved only';
  return profile.enabled ? 'Enabled for runtime' : 'Disabled';
}

function claudeAuthTone(loggedIn: boolean): CSSProperties {
  return loggedIn
    ? { color: 'var(--success-fg)', border: '1px solid var(--success-border)', background: 'var(--success-bg)' }
    : { color: 'var(--warning-fg)', border: '1px solid var(--warning-border)', background: 'var(--warning-bg)' };
}

function sortProviderProfiles(left: ProviderProfileRow, right: ProviderProfileRow): number {
  const leftPriority = typeof left.priority === 'number' ? left.priority : 100;
  const rightPriority = typeof right.priority === 'number' ? right.priority : 100;
  if (leftPriority !== rightPriority) return leftPriority - rightPriority;
  const leftCreated = String(left.created_at || '');
  const rightCreated = String(right.created_at || '');
  if (leftCreated !== rightCreated) return leftCreated.localeCompare(rightCreated);
  return String(left.id || '').localeCompare(String(right.id || ''));
}

function normalizeClaudeCliError(message: string): string {
  const normalized = String(message || '').trim();
  const lowered = normalized.toLowerCase();
  if (lowered.includes('not logged in') || lowered.includes('/login')) {
    return 'Claude is not signed in on this machine yet. Use Sign in to Claude in the add-account dialog, then refresh status.';
  }
  return normalized;
}

function simpleProviderAuthLabel(provider: ProviderId): string {
  if (provider === 'ollama') return 'Use local Ollama';
  return provider === 'vertex' ? 'Add access token' : 'Add API key';
}

function simpleProviderSecretPlaceholder(provider: ProviderId): string {
  if (provider === 'openai') return 'sk-...';
  if (provider === 'anthropic') return 'sk-ant-...';
  if (provider === 'gemini') return 'AIza...';
  if (provider === 'qwen') return 'DashScope API key';
  if (provider === 'deepseek') return 'sk-...';
  if (provider === 'mistral') return 'Mistral API key';
  return 'Access token';
}

function summarizeProviderCardError(message: string | null): string | null {
  const normalized = String(message || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return null;
  if (normalized.length <= 76) return normalized;
  return `${normalized.slice(0, 75).trimEnd()}…`;
}

const secondaryProviderActionButtonStyle: CSSProperties = {
  minHeight: 30,
  paddingInline: 10,
  width: 'fit-content',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
  border: '1px solid var(--border-subtle)',
  background: 'var(--bg-surface)',
  color: 'var(--text-primary)',
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 600,
  lineHeight: 1,
  whiteSpace: 'nowrap',
  cursor: 'pointer',
  appearance: 'none',
  WebkitAppearance: 'none',
  textDecoration: 'none',
};

export default function AiAccountsPanel({ workspaceId, mode = 'manage', returnTo = '/' }: AiAccountsPanelProps) {
  const router = useRouter();
  const returningToSetup = returnTo.startsWith('/setup');
  const [providerOptions, setProviderOptions] = useState<ProviderOption[]>(DEFAULT_PROVIDER_OPTIONS);
  const [modelAliases, setModelAliases] = useState<ModelAliasOption[]>(DEFAULT_MODEL_ALIAS_OPTIONS);
  const [providerCredentials, setProviderCredentials] = useState<ProviderCredentialRow[]>([]);
  const [providerProfiles, setProviderProfiles] = useState<ProviderProfileRow[]>([]);
  const [providerHealth, setProviderHealth] = useState<ProviderProfilesHealth>({ healthy: 0, cooldown: 0, disabled: 0, total: 0 });
  const [runtimeAvailability, setRuntimeAvailability] = useState<RuntimeAvailabilityItem[]>([]);
  const [localOpenAiAuth, setLocalOpenAiAuth] = useState<LocalOpenAiAuthStatus | null>(null);
  const [providerLoading, setProviderLoading] = useState(true);
  const [providerError, setProviderError] = useState('');
  const [providerNotice, setProviderNotice] = useState('');
  const [lastConnectedAccountLabel, setLastConnectedAccountLabel] = useState('');
  const [providerBusy, setProviderBusy] = useState<Record<string, string>>({});
  const [providerDetailsOpen, setProviderDetailsOpen] = useState<Record<string, boolean>>({});
  const [showProviderForm, setShowProviderForm] = useState(false);
  const [providerForm, setProviderForm] = useState<ProviderAccountFormState>(DEFAULT_PROVIDER_FORM);
  const [providerConnectMethod, setProviderConnectMethod] = useState<ProviderConnectMethodId>(() => defaultConnectMethodForProvider(DEFAULT_PROVIDER_FORM.provider));
  const [claudeAuthStatus, setClaudeAuthStatus] = useState<ClaudeAuthStatus | null>(null);
  const [geminiCliStatus, setGeminiCliStatus] = useState<GeminiCliStatus | null>(null);

  const controlPlaneFetch = useCallback(async (input: string, init?: RequestInit) => {
    await ensureControlPlaneSession();
    const headers = new Headers(init?.headers || {});
    if (init?.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    return fetch(input, {
      ...init,
      headers,
      cache: 'no-store',
    });
  }, []);

  const selectedProviderOption = useMemo(
    () => providerOptionFor(providerForm.provider, providerOptions),
    [providerForm.provider, providerOptions],
  );
  const selectedProviderAuthModes = useMemo(
    () => getProviderAuthModes(selectedProviderOption),
    [selectedProviderOption],
  );
  const providerConnectMethods = useMemo<ProviderConnectMethod[]>(() => {
    if (providerForm.provider === 'openai') {
      return [
        {
          id: 'openai_api_key',
          provider: 'openai',
          label: 'Add API key',
          description: 'Paste a direct OpenAI API key and store it in the encrypted vault.',
          authMode: 'api_key',
          action: 'manual',
        },
        {
          id: 'openai_browser_oauth',
          provider: 'openai',
          label: 'Sign in with OpenAI',
          description: 'Open OpenAI in your browser and connect the session automatically.',
          authMode: 'oauth_token',
          action: 'openai_browser_oauth',
        },
      ];
    }
    if (providerForm.provider === 'anthropic') {
      return [
        {
          id: 'anthropic_api_key',
          provider: 'anthropic',
          label: 'Add API key',
          description: 'Paste a direct Anthropic API key and store it in the encrypted vault.',
          authMode: 'api_key',
          action: 'manual',
        },
        {
          id: 'anthropic_local_import',
          provider: 'anthropic',
          label: 'Use local Claude session',
          description: claudeAuthStatus?.loggedIn === true
            ? 'Use the Claude session already signed in on this machine.'
            : 'Requires Claude to already be signed in on this machine.',
          authMode: 'local_cli',
          action: 'anthropic_local_import',
          disabled: claudeAuthStatus?.loggedIn !== true,
          disabledReason: claudeAuthStatus?.loggedIn === true
            ? undefined
            : claudeAuthStatus?.message || 'Claude is not signed in on this machine yet.',
        },
      ];
    }
    if (providerForm.provider === 'gemini') {
      return [
        {
          id: 'gemini_api_key',
          provider: 'gemini',
          label: 'Add API key',
          description: 'Paste a direct Gemini API key and store it in the encrypted vault.',
          authMode: 'api_key',
          action: 'manual',
        },
      ];
    }
    if (providerForm.provider === 'qwen') {
      return [
        {
          id: 'qwen_api_key',
          provider: 'qwen',
          label: 'Add API key',
          description: 'Paste a direct Qwen API key and store it in the encrypted vault.',
          authMode: 'api_key',
          action: 'manual',
        },
      ];
    }
    if (providerForm.provider === 'deepseek') {
      return [
        {
          id: 'deepseek_api_key',
          provider: 'deepseek',
          label: 'Add API key',
          description: 'Paste a direct DeepSeek API key and store it in the encrypted vault.',
          authMode: 'api_key',
          action: 'manual',
        },
      ];
    }
    if (providerForm.provider === 'mistral') {
      return [
        {
          id: 'mistral_api_key',
          provider: 'mistral',
          label: 'Add API key',
          description: 'Paste a direct Mistral API key and store it in the encrypted vault.',
          authMode: 'api_key',
          action: 'manual',
        },
      ];
    }
    if (providerForm.provider === 'ollama') {
      return [
        {
          id: 'ollama_local',
          provider: 'ollama',
          label: 'Use local Ollama',
          description: 'Connect the local Ollama OpenAI-compatible endpoint running on this machine.',
          authMode: 'none',
          action: 'manual',
        },
      ];
    }
    return [
      {
        id: 'vertex_access_token',
        provider: 'vertex',
        label: 'Add access token',
        description: 'Paste a Vertex access token and provide the project and region it should use.',
        authMode: 'access_token',
        action: 'manual',
      },
    ];
  }, [claudeAuthStatus, providerForm.provider]);
  const selectedConnectMethod = useMemo(
    () => providerConnectMethods.find((item) => item.id === providerConnectMethod) || providerConnectMethods[0] || null,
    [providerConnectMethod, providerConnectMethods],
  );
  const selectedConnectAuthMode = selectedConnectMethod?.authMode
    || providerForm.authMode
    || selectedProviderOption.defaultAuthMode
    || selectedProviderAuthModes[0]?.id
    || 'api_key';
  const selectedConnectAuthConfig = useMemo(
    () => selectedProviderAuthModes.find((item) => item.id === selectedConnectAuthMode) || null,
    [selectedConnectAuthMode, selectedProviderAuthModes],
  );
  const selectedConnectNeedsSecret = selectedConnectAuthConfig?.secretRequired !== false;
  const effectiveModelAliases = useMemo(
    () => (modelAliases.length > 0 ? modelAliases : DEFAULT_MODEL_ALIAS_OPTIONS),
    [modelAliases],
  );
  const usesClaudeLocalCli = providerForm.provider === 'anthropic' && providerForm.authMode === 'local_cli';
  const groupedModelAliases = useMemo(() => {
    return providerOptions
      .map((option) => ({
        provider: option.id,
        label: option.label,
        items: effectiveModelAliases
          .filter((item) => item.provider === option.id)
          .sort((left, right) => {
            if (left.isProviderDefault !== right.isProviderDefault) return left.isProviderDefault ? -1 : 1;
            if (left.isGlobalDefault !== right.isGlobalDefault) return left.isGlobalDefault ? -1 : 1;
            return left.alias.localeCompare(right.alias);
          }),
      }))
      .filter((group) => group.items.length > 0);
  }, [effectiveModelAliases, providerOptions]);

  const providerProfilesByCredential = useMemo(() => {
    const map = new Map<string, ProviderProfileRow[]>();
    for (const profile of providerProfiles) {
      const credentialId = String(profile.credential_id || '').trim();
      if (!credentialId) continue;
      const bucket = map.get(credentialId) || [];
      bucket.push(profile);
      map.set(credentialId, bucket);
    }
    return map;
  }, [providerProfiles]);

  const orphanProviderProfiles = useMemo(() => {
    const credentialIds = new Set(providerCredentials.map((item) => item.id));
    return providerProfiles.filter((profile) => {
      const credentialId = String(profile.credential_id || '').trim();
      return !credentialId || !credentialIds.has(credentialId);
    });
  }, [providerCredentials, providerProfiles]);

  const runtimeProfileGroups = useMemo(() => {
    const orphanIds = new Set(orphanProviderProfiles.map((item) => item.id));
    const groups = new Map<ProviderId, ProviderProfileRow[]>();
    for (const profile of providerProfiles) {
      if (orphanIds.has(profile.id)) continue;
      const bucket = groups.get(profile.provider) || [];
      bucket.push(profile);
      groups.set(profile.provider, bucket);
    }
    return Array.from(groups.entries())
      .map(([providerId, items]) => ({
        provider: providerId,
        label: providerLabel(providerId, providerOptions),
        items: [...items].sort(sortProviderProfiles),
      }))
      .sort((left, right) => left.label.localeCompare(right.label));
  }, [orphanProviderProfiles, providerOptions, providerProfiles]);
  const openAiHasApiKeyCredential = useMemo(
    () => providerCredentials.some((credential) => credential.provider === 'openai' && String(credential.authMode || '').trim().toLowerCase() === 'api_key'),
    [providerCredentials],
  );

  const profileOrderById = useMemo(() => {
    const map = new Map<string, number>();
    for (const group of runtimeProfileGroups) {
      group.items.forEach((profile, index) => {
        map.set(profile.id, index + 1);
      });
    }
    return map;
  }, [runtimeProfileGroups]);

  const defaultProfileIdByProvider = useMemo(() => {
    const map = new Map<ProviderId, string>();
    for (const group of runtimeProfileGroups) {
      if (group.items[0]?.id) {
        map.set(group.provider, group.items[0].id);
      }
    }
    return map;
  }, [runtimeProfileGroups]);

  const activeProfileIdByProvider = useMemo(() => {
    const map = new Map<ProviderId, string>();
    for (const group of runtimeProfileGroups) {
      const active = group.items.find((item) => item.enabled && item.health !== 'cooldown') || null;
      if (active?.id) {
        map.set(group.provider, active.id);
      }
    }
    return map;
  }, [runtimeProfileGroups]);

  const credentialLabelById = useMemo(() => {
    return new Map(providerCredentials.map((item) => [item.id, item.label]));
  }, [providerCredentials]);

  const runtimeAvailabilityByProvider = useMemo(() => {
    return new Map(runtimeAvailability.map((item) => [item.provider, item]));
  }, [runtimeAvailability]);

  const providerCards = useMemo<ProviderCardState[]>(() => {
    return providerOptions.map((option) => {
      const credentials = providerCredentials.filter((item) => item.provider === option.id);
      const profiles = runtimeProfileGroups.find((group) => group.provider === option.id)?.items || [];
      const profile = profiles.find((item) => item.enabled && item.health !== 'cooldown') || profiles[0] || null;
      const credential = profile?.credential_id
        ? credentials.find((item) => item.id === profile.credential_id) || credentials[0] || null
        : credentials[0] || null;
      const availability = runtimeAvailabilityByProvider.get(option.id) || null;
      const errorMessage = String(profile?.last_error || '').trim()
        || (profile && availability?.status === 'attention' ? String(availability.detail || '').trim() : '')
        || null;
      return {
        provider: option.id,
        label: option.label,
        credential,
        profile,
        availability,
        order: profile ? profileOrderById.get(profile.id) || null : null,
        isDefaultProfile: profile ? defaultProfileIdByProvider.get(option.id) === profile.id : false,
        isActiveProfile: profile ? activeProfileIdByProvider.get(option.id) === profile.id : false,
        enabled: Boolean(profile?.enabled),
        errorMessage,
      };
    });
  }, [
    activeProfileIdByProvider,
    defaultProfileIdByProvider,
    profileOrderById,
    providerCredentials,
    providerOptions,
    runtimeAvailabilityByProvider,
    runtimeProfileGroups,
  ]);
  const hasProviderCardError = useMemo(
    () => providerCards.some((card) => Boolean(String(card.errorMessage || '').trim())),
    [providerCards],
  );
  const readyProviderCard = useMemo(
    () => providerCards.find((card) => card.enabled && !String(card.errorMessage || '').trim()) || null,
    [providerCards],
  );
  const connectedAccounts = useMemo(() => {
    return providerCredentials.map((credential) => {
      const linkedProfiles = [...(providerProfilesByCredential.get(credential.id) || [])].sort(sortProviderProfiles);
      const primaryProfile = linkedProfiles.find((profile) => profile.enabled && profile.health !== 'cooldown') || linkedProfiles[0] || null;
      return {
        credential,
        primaryProfile,
        enabled: linkedProfiles.some((profile) => profile.enabled),
      };
    });
  }, [providerCredentials, providerProfilesByCredential]);

  const connectMode = mode === 'connect';

  useEffect(() => {
    if (!providerLoading) {
      setProviderDetailsOpen({});
    }
  }, [providerLoading]);

  const setProviderActionBusy = useCallback((id: string, action: string | null) => {
    setProviderBusy((prev) => {
      const next = { ...prev };
      if (!action) delete next[id];
      else next[id] = action;
      return next;
    });
  }, []);

  const resetProviderForm = useCallback((nextProvider: ProviderId = 'anthropic', nextAuthMode = 'local_cli') => {
    setProviderForm({
      provider: nextProvider,
      label: defaultProviderLabel(nextProvider, nextAuthMode),
      authMode: nextAuthMode,
      secret: '',
      projectId: '',
      location: 'us-central1',
      model: defaultProviderModel(nextProvider, nextAuthMode, providerOptions),
      enableRuntime: true,
    });
  }, [providerOptions]);

  const openProviderFormForMethod = useCallback((nextProvider: ProviderId, nextMethodId?: ProviderConnectMethodId) => {
    const resolvedMethodId = nextMethodId || defaultConnectMethodForProvider(nextProvider);
    const nextAuthMode = authModeForConnectMethod(resolvedMethodId);
    setProviderConnectMethod(resolvedMethodId);
    setProviderForm({
      provider: nextProvider,
      label: defaultProviderLabel(nextProvider, nextAuthMode),
      authMode: nextAuthMode,
      secret: '',
      projectId: '',
      location: 'us-central1',
      model: defaultProviderModel(nextProvider, nextAuthMode, providerOptions),
      enableRuntime: true,
    });
    setProviderError('');
    setProviderNotice('');
    setShowProviderForm(true);
  }, [providerOptions]);

  const openOpenAiApiKeyForm = useCallback(() => {
    openProviderFormForMethod('openai', 'openai_api_key');
  }, [openProviderFormForMethod]);

  const openGeminiApiKeyForm = useCallback(() => {
    openProviderFormForMethod('gemini', 'gemini_api_key');
  }, [openProviderFormForMethod]);

  const openVertexCredentialsForm = useCallback(() => {
    openProviderFormForMethod('vertex', 'vertex_access_token');
  }, [openProviderFormForMethod]);

  const loadProviderAccounts = useCallback(async () => {
    setProviderLoading(true);
    setProviderError('');
    setProviderNotice('');
    try {
      const [providersRes, modelAliasesRes, credentialsRes, profilesRes, runtimeAvailabilityRes] = await Promise.all([
        controlPlaneFetch('/api/control-plane/providers'),
        controlPlaneFetch('/api/control-plane/providers/model-aliases'),
        controlPlaneFetch(`/api/control-plane/credentials?workspace_id=${encodeURIComponent(workspaceId)}`),
        controlPlaneFetch(`/api/control-plane/providers/profiles/health?workspace_id=${encodeURIComponent(workspaceId)}`),
        controlPlaneFetch(`/api/control-plane/providers/runtime-availability?workspace_id=${encodeURIComponent(workspaceId)}`),
      ]);

      const providersRaw = await providersRes.text().catch(() => '');
      const modelAliasesRaw = await modelAliasesRes.text().catch(() => '');
      const credentialsRaw = await credentialsRes.text().catch(() => '');
      const profilesRaw = await profilesRes.text().catch(() => '');
      const runtimeAvailabilityRaw = await runtimeAvailabilityRes.text().catch(() => '');
      const providersBody = providersRaw ? JSON.parse(providersRaw) : {};
      const modelAliasesBody = modelAliasesRaw ? JSON.parse(modelAliasesRaw) : {};
      const credentialsBody = credentialsRaw ? JSON.parse(credentialsRaw) : {};
      const profilesBody = profilesRaw ? JSON.parse(profilesRaw) : {};
      const runtimeAvailabilityBody = runtimeAvailabilityRaw ? JSON.parse(runtimeAvailabilityRaw) : {};
      const nextModelAliases = modelAliasesRes.ok
        ? parseModelAliasCatalog(Array.isArray(modelAliasesBody?.models) ? modelAliasesBody.models : [])
        : [];
      const aliasCatalog = nextModelAliases.length > 0 ? nextModelAliases : DEFAULT_MODEL_ALIAS_OPTIONS;

      if (!providersRes.ok) {
        throw new Error(String(providersBody?.detail || providersBody?.message || 'Failed to load provider catalog.'));
      }
      if (!credentialsRes.ok) {
        throw new Error(String(credentialsBody?.detail || credentialsBody?.message || 'Failed to load saved AI accounts.'));
      }
      if (!profilesRes.ok) {
        throw new Error(String(profilesBody?.detail || profilesBody?.message || 'Failed to load provider profiles.'));
      }
      if (nextModelAliases.length > 0) {
        setModelAliases(nextModelAliases);
      }

      const providerItems: unknown[] = Array.isArray(providersBody?.providers) ? providersBody.providers : [];
      const normalizedProviders = providerItems
        .map((item: unknown): ProviderOption | null => {
          if (!item || typeof item !== 'object') return null;
          const value = item as { id?: unknown; label?: unknown; default_model?: unknown; auth?: unknown; auth_modes?: unknown; default_auth_mode?: unknown; note?: unknown };
          const id = knownProviderId(value.id);
          if (!id) return null;
          const fallback = DEFAULT_PROVIDER_OPTIONS.find((entry) => entry.id === id);
          const authModes = Array.isArray(value.auth_modes)
            ? value.auth_modes
                .filter((mode): mode is { id?: unknown; label?: unknown; secret_required?: unknown } => Boolean(mode) && typeof mode === 'object')
                .map((mode) => ({
                  id: typeof mode.id === 'string' ? mode.id : 'api_key',
                  label: typeof mode.label === 'string' && mode.label.trim() ? mode.label.trim() : String(mode.id || 'API Key'),
                  secretRequired: Boolean(mode.secret_required),
                }))
            : fallback?.authModes || [];
          return {
            id,
            label: typeof value.label === 'string' && value.label.trim() ? value.label.trim() : fallback?.label || id,
            defaultModel: (() => {
              const rawDefaultModel = typeof value.default_model === 'string' && value.default_model.trim()
                ? value.default_model.trim()
                : fallback?.defaultModel || DEFAULT_PROVIDER_MODELS[id]?.[0] || '';
              return resolveModelAlias(id, rawDefaultModel, aliasCatalog) || rawDefaultModel;
            })(),
            auth: Array.isArray(value.auth)
              ? value.auth.filter((entry): entry is string => typeof entry === 'string')
              : fallback?.auth || ['api_key'],
            defaultAuthMode: typeof value.default_auth_mode === 'string' && value.default_auth_mode.trim()
              ? value.default_auth_mode.trim()
              : fallback?.defaultAuthMode || fallback?.auth?.[0] || 'api_key',
            authModes,
            note: typeof value.note === 'string' && value.note.trim() ? value.note.trim() : fallback?.note,
          };
        })
        .filter((item: ProviderOption | null): item is ProviderOption => item !== null);
      if (normalizedProviders.length > 0) {
        setProviderOptions(normalizedProviders);
      }

      const credentialItems: unknown[] = Array.isArray(credentialsBody?.items) ? credentialsBody.items : [];
      const normalizedCredentials = credentialItems
        .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
        .map((item): ProviderCredentialRow | null => {
          const normalizedProvider = knownProviderId(item.provider);
          if (!normalizedProvider) return null;
          return {
            id: typeof item.id === 'string' ? item.id : '',
            label: typeof item.label === 'string' ? item.label : 'AI Account',
            provider: normalizedProvider,
            rawProvider: typeof item.provider === 'string' ? item.provider : undefined,
            metadata: item.metadata && typeof item.metadata === 'object' ? item.metadata as Record<string, unknown> : {},
            authMode: item.metadata && typeof item.metadata === 'object' && typeof (item.metadata as Record<string, unknown>).auth_mode === 'string'
              ? String((item.metadata as Record<string, unknown>).auth_mode)
              : undefined,
            created_at: typeof item.created_at === 'string' ? item.created_at : undefined,
            updated_at: typeof item.updated_at === 'string' ? item.updated_at : undefined,
          };
        })
        .filter((item: ProviderCredentialRow | null): item is ProviderCredentialRow => item !== null && item.id.length > 0);
      setProviderCredentials(normalizedCredentials);

      const profileItems: unknown[] = Array.isArray(profilesBody?.items) ? profilesBody.items : [];
      const normalizedProfiles = profileItems
        .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
        .map((item): ProviderProfileRow | null => {
          const normalizedProvider = knownProviderId(item.provider);
          if (!normalizedProvider) return null;
          return {
            id: typeof item.id === 'string' ? item.id : '',
            provider: normalizedProvider,
            rawProvider: typeof item.provider === 'string' ? item.provider : undefined,
            label: typeof item.label === 'string' ? item.label : 'Runtime profile',
            credential_id: typeof item.credential_id === 'string' ? item.credential_id : null,
            auth_mode: typeof item.auth_mode === 'string' ? item.auth_mode : null,
            workspace_id: typeof item.workspace_id === 'string' ? item.workspace_id : null,
            priority: typeof item.priority === 'number' ? item.priority : 100,
            enabled: item.enabled !== false,
            model: typeof item.model === 'string'
              ? resolveModelAlias(normalizedProvider, item.model, aliasCatalog) || item.model
              : null,
            health: typeof item.health === 'string' ? item.health : null,
            cooldown_until: typeof item.cooldown_until === 'string' ? item.cooldown_until : null,
            last_error: typeof item.last_error === 'string' ? item.last_error : null,
            last_used_at: typeof item.last_used_at === 'string' ? item.last_used_at : null,
            last_success_at: typeof item.last_success_at === 'string' ? item.last_success_at : null,
            last_failure_at: typeof item.last_failure_at === 'string' ? item.last_failure_at : null,
            success_count: typeof item.success_count === 'number' ? item.success_count : 0,
            failure_count: typeof item.failure_count === 'number' ? item.failure_count : 0,
            created_at: typeof item.created_at === 'string' ? item.created_at : undefined,
            updated_at: typeof item.updated_at === 'string' ? item.updated_at : undefined,
          };
        })
        .filter((item: ProviderProfileRow | null): item is ProviderProfileRow => item !== null && item.id.length > 0)
        .sort((left: ProviderProfileRow, right: ProviderProfileRow) => {
          const providerCompare = left.provider.localeCompare(right.provider);
          if (providerCompare !== 0) return providerCompare;
          return (left.priority || 100) - (right.priority || 100);
        });
      setProviderProfiles(normalizedProfiles);

      const summary = profilesBody?.summary && typeof profilesBody.summary === 'object'
        ? profilesBody.summary as Record<string, unknown>
        : {};
      setProviderHealth({
        healthy: typeof summary.healthy === 'number' ? summary.healthy : 0,
        cooldown: typeof summary.cooldown === 'number' ? summary.cooldown : 0,
        disabled: typeof summary.disabled === 'number' ? summary.disabled : 0,
        total: typeof summary.total === 'number' ? summary.total : normalizedProfiles.length,
      });

      const availabilityItems = runtimeAvailabilityRes.ok && Array.isArray(runtimeAvailabilityBody?.items)
        ? runtimeAvailabilityBody.items
            .filter((item: unknown): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
            .map((item: Record<string, unknown>): RuntimeAvailabilityItem | null => {
              const provider = knownProviderId(item.provider);
              if (!provider) return null;
              return {
                provider,
                label: typeof item.label === 'string' && item.label.trim() ? item.label.trim() : providerLabel(provider, normalizedProviders.length > 0 ? normalizedProviders : providerOptions),
                ready: item.ready === true,
                status: item.status === 'attention' ? 'attention' : 'ready',
                source: typeof item.source === 'string' ? item.source : '',
                source_label: typeof item.source_label === 'string' ? item.source_label : 'Runtime account',
                detail: typeof item.detail === 'string' ? item.detail : '',
                profile_count: typeof item.profile_count === 'number' ? item.profile_count : 0,
              };
            })
            .filter((item: RuntimeAvailabilityItem | null): item is RuntimeAvailabilityItem => item !== null)
        : [];
      setRuntimeAvailability(availabilityItems);
    } catch (error) {
      setProviderError(normalizeProvidersError(error instanceof Error ? error.message : 'Failed to load saved AI accounts.'));
    } finally {
      setProviderLoading(false);
    }
  }, [controlPlaneFetch, workspaceId]);

  const loadLocalOpenAiAuth = useCallback(async () => {
    try {
      const res = await controlPlaneFetch('/api/control-plane/providers/openai/local-auth/status');
      const body = await res.json().catch(() => null) as LocalOpenAiAuthStatus | null;
      if (res.ok && body) {
        setLocalOpenAiAuth(body);
        return;
      }
      setLocalOpenAiAuth(null);
    } catch {
      setLocalOpenAiAuth(null);
    }
  }, [controlPlaneFetch]);

  useEffect(() => {
    void loadProviderAccounts();
  }, [loadProviderAccounts]);

  useEffect(() => {
    void loadLocalOpenAiAuth();
  }, [loadLocalOpenAiAuth]);

  useEffect(() => {
    if (selectedConnectMethod && !isManualConnectMethod(selectedConnectMethod.action)) {
      return;
    }
    const availableAuthMode = selectedProviderAuthModes.find((item) => item.id === providerForm.authMode)?.id
      || selectedProviderOption.defaultAuthMode
      || selectedProviderAuthModes[0]?.id
      || 'api_key';
    if (availableAuthMode !== providerForm.authMode) {
      setProviderForm((prev) => ({
        ...prev,
        authMode: availableAuthMode,
        label: prev.label === defaultProviderLabel(prev.provider, prev.authMode)
          ? defaultProviderLabel(prev.provider, availableAuthMode)
          : prev.label,
        model: defaultProviderModel(prev.provider, availableAuthMode, providerOptions),
      }));
    }
  }, [providerForm.authMode, providerForm.provider, providerOptions, selectedConnectMethod, selectedProviderAuthModes, selectedProviderOption.defaultAuthMode]);

  useEffect(() => {
    const fallbackMethod = providerConnectMethods[0] || null;
    if (!fallbackMethod) return;
    if (!selectedConnectMethod || selectedConnectMethod.provider !== providerForm.provider) {
      const nextMethod = fallbackMethod;
      const nextAuthMode = authModeForConnectMethod(nextMethod.id);
      setProviderConnectMethod(nextMethod.id);
      setProviderForm((prev) => ({
        ...prev,
        provider: nextMethod.provider,
        authMode: nextAuthMode,
        label: defaultProviderLabel(nextMethod.provider, nextAuthMode),
        model: defaultProviderModel(nextMethod.provider, nextAuthMode, providerOptions),
        secret: '',
        projectId: '',
        location: nextMethod.provider === 'vertex' ? 'us-central1' : prev.location,
      }));
    }
  }, [providerConnectMethods, providerForm.provider, providerOptions, selectedConnectMethod]);

  useEffect(() => {
    if (!showProviderForm || typeof document === 'undefined') return;
    const { body, documentElement } = document;
    const previousBodyOverflow = body.style.overflow;
    const previousHtmlOverflow = documentElement.style.overflow;
    body.style.overflow = 'hidden';
    documentElement.style.overflow = 'hidden';
    return () => {
      body.style.overflow = previousBodyOverflow;
      documentElement.style.overflow = previousHtmlOverflow;
    };
  }, [showProviderForm]);

  const refreshClaudeAuthStatus = useCallback(async (silent = false) => {
    if (!silent) setProviderBusy((prev) => ({ ...prev, 'claude-auth': 'status' }));
    try {
      const res = await controlPlaneFetch('/api/control-plane/providers/anthropic/local-cli/status');
      const raw = await res.text().catch(() => '');
      const body = raw ? JSON.parse(raw) : {};
      if (!res.ok) {
        throw new Error(String(body?.detail || body?.message || 'Could not read Claude auth status.'));
      }
      setClaudeAuthStatus(body as ClaudeAuthStatus);
    } catch (error) {
      setClaudeAuthStatus({
        ok: false,
        available: false,
        loggedIn: false,
        message: error instanceof Error ? error.message : 'Could not read Claude auth status.',
      });
    } finally {
      if (!silent) {
        setProviderBusy((prev) => {
          const next = { ...prev };
          delete next['claude-auth'];
          return next;
        });
      }
    }
  }, [controlPlaneFetch]);

  useEffect(() => {
    void refreshClaudeAuthStatus(true);
  }, [refreshClaudeAuthStatus]);

  useEffect(() => {
    if (!showProviderForm || !usesClaudeLocalCli) return;
    void refreshClaudeAuthStatus(true);
  }, [refreshClaudeAuthStatus, showProviderForm, usesClaudeLocalCli]);

  const refreshGeminiCliStatus = useCallback(async () => {
    try {
      const res = await controlPlaneFetch('/api/control-plane/providers/gemini/local-cli/status');
      const raw = await res.text().catch(() => '');
      const body = raw ? JSON.parse(raw) : {};
      if (!res.ok) {
        throw new Error(String(body?.detail || body?.message || 'Could not read Gemini CLI status.'));
      }
      setGeminiCliStatus(body as GeminiCliStatus);
    } catch (error) {
      setGeminiCliStatus({
        ok: false,
        available: false,
        message: error instanceof Error ? error.message : 'Could not read Gemini CLI status.',
      });
    }
  }, [controlPlaneFetch]);

  useEffect(() => {
    void refreshGeminiCliStatus();
  }, [refreshGeminiCliStatus]);

  const upsertRuntimeProfileForCredential = useCallback(async (
    credential: ProviderCredentialRow,
    existingProfile?: ProviderProfileRow | null,
    enabled = true,
    preferredModel?: string,
  ) => {
    const authMode = String(
      credential.authMode || providerOptionFor(credential.provider, providerOptions).defaultAuthMode || '',
    ).trim() || 'api_key';
    const payload = {
      id: existingProfile?.id || undefined,
      provider: credential.rawProvider || credential.provider,
      label: existingProfile?.label || credential.label,
      credential_id: credential.id,
      auth_mode: authMode,
      workspace_id: workspaceId,
      priority: existingProfile?.priority || 100,
      enabled,
      model: preferredModel || existingProfile?.model || defaultProviderModel(credential.provider, authMode, providerOptions),
    };
    const res = await controlPlaneFetch('/api/control-plane/providers/profiles', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    const raw = await res.text().catch(() => '');
    const body = raw ? JSON.parse(raw) : {};
    if (!res.ok) throw new Error(String(body?.detail || body?.message || 'Failed to save runtime profile.'));
  }, [controlPlaneFetch, providerOptions, workspaceId]);

  const handleSaveProviderCredential = useCallback(async () => {
    const authMode = providerForm.authMode || selectedProviderOption.defaultAuthMode || selectedProviderAuthModes[0]?.id || 'api_key';
    const authConfig = selectedProviderAuthModes.find((item) => item.id === authMode);
    const needsSecret = authConfig?.secretRequired !== false;
    if (providerForm.provider === 'gemini' && authMode === 'gemini_cli_oauth') {
      setProviderError('Use Sign in with Google (Gemini CLI) on the Gemini card instead of the manual form.');
      return;
    }
    if (usesClaudeLocalCli && claudeAuthStatus && claudeAuthStatus.loggedIn === false) {
      setProviderError('Claude is not signed in on this machine yet. Use Sign in to Claude first, then refresh status.');
      return;
    }
    if (!providerForm.label.trim()) {
      setProviderError('Account label is required.');
      return;
    }
    if (needsSecret && !providerForm.secret.trim()) {
      setProviderError(authMode === 'access_token' ? 'Access token is required.' : 'Secret is required.');
      return;
    }
    if (providerForm.provider === 'vertex' && !providerForm.projectId.trim()) {
      setProviderError('Vertex project ID is required.');
      return;
    }

    setProviderActionBusy('provider-create', 'save');
    setProviderError('');
    setProviderNotice('');
    setLastConnectedAccountLabel('');
    try {
      const credentials = buildProviderCredentialPayload(providerForm);
      const res = await controlPlaneFetch('/api/control-plane/credentials', {
        method: 'POST',
        body: JSON.stringify({
          label: providerForm.label.trim(),
          provider: providerForm.provider,
          workspace_id: workspaceId,
          mode: 'byok',
          credentials,
        }),
      });
      const raw = await res.text().catch(() => '');
      const body = raw ? JSON.parse(raw) : {};
      if (!res.ok) throw new Error(String(body?.detail || body?.message || 'Failed to save AI account.'));

      const credentialId = typeof body?.id === 'string' ? body.id : '';
      const savedCredential: ProviderCredentialRow = {
        id: credentialId,
        label: providerForm.label.trim(),
        provider: providerForm.provider,
        authMode,
        metadata: body?.metadata && typeof body.metadata === 'object' ? body.metadata as Record<string, unknown> : {},
      };
      if (providerForm.enableRuntime && credentialId) {
        await upsertRuntimeProfileForCredential(
          savedCredential,
          null,
          true,
          providerForm.model.trim() || defaultProviderModel(providerForm.provider, authMode, providerOptions),
        );
      }
      resetProviderForm(providerForm.provider, authMode);
      setShowProviderForm(false);
      await loadProviderAccounts();
      setLastConnectedAccountLabel(providerForm.label.trim());
      setProviderNotice(
        connectMode
          ? `${providerLabel(providerForm.provider, providerOptions)} connected and ready.`
          : providerForm.enableRuntime
            ? 'AI account saved and enabled for runtime.'
            : 'AI account saved to the encrypted vault.',
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save AI account.';
      setProviderError(usesClaudeLocalCli ? normalizeClaudeCliError(message) : message);
    } finally {
      setProviderActionBusy('provider-create', null);
    }
  }, [
    controlPlaneFetch,
    loadProviderAccounts,
    providerForm,
    providerOptions,
    resetProviderForm,
    selectedProviderAuthModes,
    selectedProviderOption.defaultAuthMode,
    setProviderActionBusy,
    upsertRuntimeProfileForCredential,
    workspaceId,
    usesClaudeLocalCli,
    claudeAuthStatus,
    connectMode,
  ]);

  const handleTestProviderCredential = useCallback(async (credential: ProviderCredentialRow) => {
    setProviderActionBusy(credential.id, 'test');
    setProviderError('');
    setProviderNotice('');
    try {
      const providerId = encodeURIComponent(String(credential.rawProvider || credential.provider).trim());
      const res = await controlPlaneFetch(`/api/control-plane/providers/${providerId}/probe?workspace_id=${encodeURIComponent(workspaceId)}&credential_id=${encodeURIComponent(credential.id)}`, {
        method: 'POST',
      });
      const raw = await res.text().catch(() => '');
      const body = raw ? JSON.parse(raw) : {};
      if (!res.ok) throw new Error(String(body?.detail || body?.message || 'AI account live probe failed.'));
      const model = String(body?.model || '').trim();
      const reply = String(body?.reply || '').replace(/\s+/g, ' ').trim();
      const replyPreview = reply.length > 72 ? `${reply.slice(0, 72).trimEnd()}…` : reply;
      setProviderNotice(
        [
          String(body?.message || 'Live probe succeeded.').trim(),
          model ? `Model: ${resolveModelAlias(credential.provider, model, effectiveModelAliases) || model}` : '',
          replyPreview ? `Reply: ${replyPreview}` : '',
        ].filter(Boolean).join(' '),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'AI account live probe failed.';
      setProviderError(credential.provider === 'anthropic' && credential.authMode === 'local_cli' ? normalizeClaudeCliError(message) : message);
    } finally {
      setProviderActionBusy(credential.id, null);
    }
  }, [controlPlaneFetch, effectiveModelAliases, setProviderActionBusy, workspaceId]);

  const handleToggleProviderProfile = useCallback(async (credential: ProviderCredentialRow, existingProfile?: ProviderProfileRow | null) => {
    const action = existingProfile?.enabled ? 'disable-runtime' : 'enable-runtime';
    setProviderActionBusy(credential.id, action);
    setProviderError('');
    setProviderNotice('');
    try {
      if (existingProfile?.enabled) {
        const res = await controlPlaneFetch(`/api/control-plane/providers/profiles/${encodeURIComponent(existingProfile.id)}/disable`, {
          method: 'POST',
        });
        const raw = await res.text().catch(() => '');
        const body = raw ? JSON.parse(raw) : {};
        if (!res.ok) throw new Error(String(body?.detail || body?.message || 'Failed to disable runtime profile.'));
      } else {
        await upsertRuntimeProfileForCredential(credential, existingProfile || null, true);
      }
      await loadProviderAccounts();
      setProviderNotice(existingProfile?.enabled ? 'Runtime profile disabled.' : 'Runtime profile enabled.');
    } catch (error) {
      setProviderError(error instanceof Error ? error.message : 'Failed to update runtime profile.');
    } finally {
      setProviderActionBusy(credential.id, null);
    }
  }, [controlPlaneFetch, loadProviderAccounts, setProviderActionBusy, upsertRuntimeProfileForCredential]);

  const handlePromoteProviderProfile = useCallback(async (profile: ProviderProfileRow) => {
    const siblings = runtimeProfileGroups.find((group) => group.provider === profile.provider)?.items || [];
    if (siblings.length === 0) return;

    setProviderActionBusy(profile.id, 'make-default');
    setProviderError('');
    setProviderNotice('');
    try {
      const reordered = [profile, ...siblings.filter((item) => item.id !== profile.id)];
      for (let index = 0; index < reordered.length; index += 1) {
        const item = reordered[index];
        const res = await controlPlaneFetch('/api/control-plane/providers/profiles', {
          method: 'POST',
          body: JSON.stringify({
            id: item.id,
            provider: item.rawProvider || item.provider,
            label: item.label,
            credential_id: item.credential_id || undefined,
            auth_mode: item.auth_mode || undefined,
            workspace_id: item.workspace_id || workspaceId,
            priority: index * 100,
            enabled: item.enabled,
            model: item.model || undefined,
          }),
        });
        const raw = await res.text().catch(() => '');
        const body = raw ? JSON.parse(raw) : {};
        if (!res.ok) {
          throw new Error(String(body?.detail || body?.message || 'Failed to reorder runtime profiles.'));
        }
      }
      await loadProviderAccounts();
      setProviderNotice(`${providerLabel(profile.provider, providerOptions)} default updated. Runs will try ${profile.label} first.`);
    } catch (error) {
      setProviderError(error instanceof Error ? error.message : 'Failed to update default runtime profile.');
    } finally {
      setProviderActionBusy(profile.id, null);
    }
  }, [controlPlaneFetch, loadProviderAccounts, providerOptions, runtimeProfileGroups, setProviderActionBusy, workspaceId]);

  const handleDeleteProviderProfile = useCallback(async (profile: ProviderProfileRow) => {
    setProviderActionBusy(profile.id, 'remove-profile');
    setProviderError('');
    setProviderNotice('');
    try {
      const res = await controlPlaneFetch(`/api/control-plane/providers/profiles/${encodeURIComponent(profile.id)}`, {
        method: 'DELETE',
      });
      const raw = await res.text().catch(() => '');
      const body = raw ? JSON.parse(raw) : {};
      if (!res.ok) throw new Error(String(body?.detail || body?.message || 'Failed to remove runtime profile.'));
      await loadProviderAccounts();
      setProviderNotice('Runtime profile removed.');
    } catch (error) {
      setProviderError(error instanceof Error ? error.message : 'Failed to remove runtime profile.');
    } finally {
      setProviderActionBusy(profile.id, null);
    }
  }, [controlPlaneFetch, loadProviderAccounts, setProviderActionBusy]);

  const handleRemoveProviderCredential = useCallback(async (credential: ProviderCredentialRow) => {
    setProviderActionBusy(credential.id, 'remove');
    setProviderError('');
    setProviderNotice('');
    try {
      const linkedProfiles = providerProfilesByCredential.get(credential.id) || [];
      for (const profile of linkedProfiles) {
        const deleteRes = await controlPlaneFetch(`/api/control-plane/providers/profiles/${encodeURIComponent(profile.id)}`, {
          method: 'DELETE',
        });
        const deleteRaw = await deleteRes.text().catch(() => '');
        const deleteBody = deleteRaw ? JSON.parse(deleteRaw) : {};
        if (!deleteRes.ok) {
          throw new Error(String(deleteBody?.detail || deleteBody?.message || 'Failed to remove linked runtime profile.'));
        }
      }

      const res = await controlPlaneFetch(`/api/control-plane/credentials/${encodeURIComponent(credential.id)}?workspace_id=${encodeURIComponent(workspaceId)}`, {
        method: 'DELETE',
      });
      const raw = await res.text().catch(() => '');
      const body = raw ? JSON.parse(raw) : {};
      if (!res.ok) throw new Error(String(body?.detail || body?.message || 'Failed to remove AI account.'));
      await loadProviderAccounts();
      setProviderNotice('AI account removed.');
    } catch (error) {
      setProviderError(error instanceof Error ? error.message : 'Failed to remove AI account.');
    } finally {
      setProviderActionBusy(credential.id, null);
    }
  }, [controlPlaneFetch, loadProviderAccounts, providerProfilesByCredential, setProviderActionBusy, workspaceId]);

  const handleClaudeAuthLogin = useCallback(async () => {
    setProviderActionBusy('claude-auth', 'login');
    setProviderError('');
    setProviderNotice('');
    try {
      const res = await controlPlaneFetch('/api/control-plane/providers/anthropic/local-cli/login', {
        method: 'POST',
      });
      const raw = await res.text().catch(() => '');
      const body = raw ? JSON.parse(raw) : {};
      if (!res.ok) {
        throw new Error(String(body?.detail || body?.message || 'Failed to start Claude login.'));
      }
      setProviderNotice(String(body?.message || 'Claude login started. Complete it, then refresh status.'));
      window.setTimeout(() => {
        void refreshClaudeAuthStatus(true);
      }, 1500);
    } catch (error) {
      setProviderError(error instanceof Error ? error.message : 'Failed to start Claude login.');
    } finally {
      setProviderActionBusy('claude-auth', null);
    }
  }, [controlPlaneFetch, refreshClaudeAuthStatus, setProviderActionBusy]);

  const handleImportLocalClaudeAuth = useCallback(async () => {
    setProviderActionBusy('anthropic-local-import', 'import');
    setProviderError('');
    setProviderNotice('');
    try {
      const res = await controlPlaneFetch('/api/control-plane/providers/anthropic/local-auth/import', {
        method: 'POST',
        body: JSON.stringify({
          workspace_id: workspaceId,
          enable_runtime: true,
        }),
      });
      const raw = await res.text().catch(() => '');
      const body = raw ? JSON.parse(raw) : {};
      if (!res.ok) {
        throw new Error(String(body?.detail || body?.message || 'Failed to import the local Claude session.'));
      }
      await Promise.all([loadProviderAccounts(), refreshClaudeAuthStatus(true)]);
      setLastConnectedAccountLabel('Claude on this Mac');
      setProviderNotice(String(body?.message || 'Claude local session imported from this Mac.'));
    } catch (error) {
      setProviderError(error instanceof Error ? error.message : 'Failed to import the local Claude session.');
    } finally {
      setProviderActionBusy('anthropic-local-import', null);
    }
  }, [controlPlaneFetch, loadProviderAccounts, refreshClaudeAuthStatus, setProviderActionBusy, workspaceId]);

  const handleGeminiCliOauthImport = useCallback(async () => {
    setProviderActionBusy('gemini-cli-oauth', 'import');
    setProviderError('');
    setProviderNotice('');
    setLastConnectedAccountLabel('');
    try {
      const res = await controlPlaneFetch('/api/control-plane/providers/gemini/local-auth/import', {
        method: 'POST',
        body: JSON.stringify({
          workspace_id: workspaceId,
          enable_runtime: true,
        }),
      });
      const raw = await res.text().catch(() => '');
      const body = raw ? JSON.parse(raw) : {};
      if (!res.ok) {
        throw new Error(String(body?.detail || body?.message || 'Failed to complete Gemini CLI OAuth.'));
      }
      await Promise.all([loadProviderAccounts(), refreshGeminiCliStatus()]);
      setLastConnectedAccountLabel(String(body?.label || 'Google Gemini CLI'));
      setProviderNotice(String(body?.message || 'Gemini CLI OAuth connected.'));
    } catch (error) {
      setProviderError(error instanceof Error ? error.message : 'Failed to complete Gemini CLI OAuth.');
    } finally {
      setProviderActionBusy('gemini-cli-oauth', null);
    }
  }, [controlPlaneFetch, loadProviderAccounts, refreshGeminiCliStatus, setProviderActionBusy, workspaceId]);

  const handleImportLocalOpenAiAuth = useCallback(async () => {
    setProviderActionBusy('openai-local-import', 'import');
    setProviderError('');
    setProviderNotice('');
    try {
      const res = await controlPlaneFetch('/api/control-plane/providers/openai/local-auth/import', {
        method: 'POST',
        body: JSON.stringify({
          workspace_id: workspaceId,
          enable_runtime: true,
        }),
      });
      const raw = await res.text().catch(() => '');
      const body = raw ? JSON.parse(raw) : {};
      if (!res.ok) {
        throw new Error(String(body?.detail || body?.message || 'Failed to import OpenAI / Codex session.'));
      }
      await Promise.all([loadProviderAccounts(), loadLocalOpenAiAuth()]);
      setLastConnectedAccountLabel('OpenAI / Codex on this Mac');
      setProviderNotice(String(body?.message || 'OpenAI / Codex session imported from this Mac.'));
    } catch (error) {
      setProviderError(error instanceof Error ? error.message : 'Failed to import OpenAI / Codex session.');
    } finally {
      setProviderActionBusy('openai-local-import', null);
    }
  }, [controlPlaneFetch, loadLocalOpenAiAuth, loadProviderAccounts, setProviderActionBusy, workspaceId]);

  const handleOpenAiCodexOauthSignIn = useCallback(async () => {
    setProviderActionBusy('openai-codex-oauth', 'login');
    setProviderError('');
    setProviderNotice('');
    setLastConnectedAccountLabel('');

    try {
      const res = await controlPlaneFetch('/api/control-plane/providers/openai/local-auth/import', {
        method: 'POST',
        body: JSON.stringify({
          workspace_id: workspaceId,
          enable_runtime: true,
          auth_flow: 'browser_oauth',
        }),
      });
      const raw = await res.text().catch(() => '');
      const body = raw ? JSON.parse(raw) : {};
      if (!res.ok) {
        throw new Error(String(body?.detail || body?.message || 'Failed to complete OpenAI browser OAuth.'));
      }

      await loadProviderAccounts();
      setLastConnectedAccountLabel(String(body?.label || 'OpenAI / Codex'));
      setProviderNotice(String(body?.message || 'OpenAI / Codex connected and ready.'));
    } catch (error) {
      setProviderError(error instanceof Error ? error.message : 'Failed to complete OpenAI sign-in.');
    } finally {
      setProviderActionBusy('openai-codex-oauth', null);
    }
  }, [
    controlPlaneFetch,
    loadProviderAccounts,
    setProviderActionBusy,
    workspaceId,
  ]);

  const selectedConnectBusy = (() => {
    if (!selectedConnectMethod) return false;
    if (selectedConnectMethod.action === 'manual') {
      return providerBusy['provider-create'] === 'save';
    }
    if (selectedConnectMethod.action === 'openai_browser_oauth') {
      return providerBusy['openai-codex-oauth'] === 'login';
    }
    if (selectedConnectMethod.action === 'openai_local_import') {
      return providerBusy['openai-local-import'] === 'import';
    }
    if (selectedConnectMethod.action === 'anthropic_local_import') {
      return providerBusy['anthropic-local-import'] === 'import';
    }
    if (selectedConnectMethod.action === 'gemini_cli_oauth') {
      return providerBusy['gemini-cli-oauth'] === 'import';
    }
    return false;
  })();

  const selectedConnectDisabled = Boolean(
    !selectedConnectMethod
    || selectedConnectBusy
    || selectedConnectMethod.disabled,
  );

  const selectedConnectDisabledReason = selectedConnectMethod?.disabledReason || '';
  const selectedConnectPrimaryLabel = selectedConnectMethod?.action === 'openai_browser_oauth'
    ? (selectedConnectBusy ? 'Opening browser…' : 'Open browser to sign in')
    : selectedConnectMethod?.action === 'anthropic_local_import'
      ? (selectedConnectBusy ? 'Connecting…' : 'Use local Claude session')
      : selectedConnectBusy
        ? 'Connecting…'
        : 'Connect';

  const handleConnectSelectedMethod = useCallback(async () => {
    if (!selectedConnectMethod || selectedConnectMethod.disabled) return;
    if (selectedConnectMethod.action === 'manual') {
      await handleSaveProviderCredential();
      return;
    }
    if (selectedConnectMethod.action === 'openai_browser_oauth') {
      await handleOpenAiCodexOauthSignIn();
      return;
    }
    if (selectedConnectMethod.action === 'openai_local_import') {
      await handleImportLocalOpenAiAuth();
      return;
    }
    if (selectedConnectMethod.action === 'anthropic_local_import') {
      await handleImportLocalClaudeAuth();
      return;
    }
    if (selectedConnectMethod.action === 'gemini_cli_oauth') {
      await handleGeminiCliOauthImport();
    }
  }, [
    handleGeminiCliOauthImport,
    handleImportLocalClaudeAuth,
    handleImportLocalOpenAiAuth,
    handleOpenAiCodexOauthSignIn,
    handleSaveProviderCredential,
    selectedConnectMethod,
  ]);

  const applyProviderConnectMethod = useCallback((method: ProviderConnectMethod) => {
    const nextAuthMode = authModeForConnectMethod(method.id);
    setProviderConnectMethod(method.id);
    setProviderError('');
    setProviderNotice('');
    setProviderForm((prev) => ({
      ...prev,
      provider: method.provider,
      authMode: nextAuthMode,
      label: defaultProviderLabel(method.provider, nextAuthMode),
      model: defaultProviderModel(method.provider, nextAuthMode, providerOptions),
      secret: '',
      projectId: method.provider === 'vertex' ? prev.projectId : '',
      location: method.provider === 'vertex' ? prev.location || 'us-central1' : prev.location,
    }));
  }, [providerOptions]);

  return (
    <>
      <section style={{ display: 'grid', gap: 16, overflow: 'visible' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) auto',
            gap: 12,
            alignItems: 'center',
          }}
        >
          <div style={{ display: 'grid', gap: 3 }}>
            <div className="orion-panel-title">{connectMode ? 'Connect AI account' : 'AI accounts'}</div>
            <div className="orion-panel-copy">
              {connectMode
                ? 'Connect one provider account, then return to your setup flow or chat.'
                : 'Manage the provider accounts connected to this workspace.'}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <button className="orion-btn orion-btn-ghost" style={{ minHeight: 38, paddingInline: 12 }} onClick={() => void loadProviderAccounts()}>
              <RefreshCw size={14} />
              Refresh
            </button>
            <button
              className="orion-btn orion-btn-primary"
              style={{ minHeight: 38, paddingInline: 14 }}
              onClick={() => {
                openProviderFormForMethod(providerForm.provider, providerConnectMethod);
              }}
            >
              <Plus size={14} />
              Add account
            </button>
          </div>
        </div>

        {providerError ? (
          <div
            style={{
              borderRadius: 12,
              border: '1px solid var(--error-border)',
              background: 'var(--error-bg)',
              color: 'var(--error-fg)',
              padding: '9px 12px',
              fontSize: 12,
              lineHeight: 1.5,
            }}
          >
            {providerError}
          </div>
        ) : null}

        {providerNotice ? (
          <div
            style={{
              borderRadius: 12,
              border: '1px solid var(--success-border)',
              background: 'var(--success-bg)',
              color: 'var(--success-fg)',
              padding: '9px 12px',
              fontSize: 12,
              lineHeight: 1.5,
            }}
          >
            {providerNotice}
          </div>
        ) : null}

        {connectMode && providerCredentials.length > 0 && readyProviderCard ? (
          <div
            style={{
              display: 'grid',
              gap: 8,
              borderRadius: 12,
              border: '1px solid var(--success-border)',
              background: 'var(--success-bg)',
              color: 'var(--success-fg)',
              padding: '11px 13px',
            }}
          >
            <div style={{ display: 'grid', gap: 3 }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>
                {lastConnectedAccountLabel ? `${lastConnectedAccountLabel} connected` : `${readyProviderCard.label} connected`}
              </div>
              <div style={{ fontSize: 12, lineHeight: 1.5 }}>
                {returningToSetup
                  ? 'Return to setup and connect one integration before you start your first task.'
                  : 'Return to chat and continue. You can manage provider order later from Connectors if you need to.'}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                className="orion-btn orion-btn-primary"
                style={{ minHeight: 36, paddingInline: 14 }}
                onClick={() => router.push(returnTo)}
              >
                {returningToSetup ? 'Continue setup' : 'Start chatting'}
              </button>
            </div>
          </div>
        ) : null}

        {providerLoading ? (
          <section className="orion-empty" style={{ minHeight: 180 }}>
            <div className="orion-empty-title">Loading AI accounts</div>
            <div className="orion-empty-copy">Loading connected accounts and runtime availability.</div>
          </section>
        ) : connectedAccounts.length === 0 ? (
          <section className="orion-empty" style={{ minHeight: 220, gap: 12 }}>
            <div className="orion-empty-title">No AI accounts connected yet</div>
            <div className="orion-empty-copy">
              Add one provider account to start using AI inside Empyralis.
            </div>
            <button
              className="orion-btn orion-btn-primary"
              style={{ minHeight: 38, paddingInline: 14 }}
              onClick={() => {
                openProviderFormForMethod(providerForm.provider, providerConnectMethod);
              }}
            >
              <Plus size={14} />
              Add account
            </button>
          </section>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {connectedAccounts.map(({ credential, primaryProfile, enabled }) => {
              const busyAction = providerBusy[credential.id] || '';
              const statusTone = enabled
                ? { color: 'var(--success-fg)', border: '1px solid var(--success-border)', background: 'var(--success-bg)' }
                : { color: 'var(--text-secondary)', border: '1px solid var(--border-subtle)', background: 'var(--bg-element)' };

              return (
                <div
                  key={credential.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'minmax(0, 1fr) auto',
                    gap: 12,
                    alignItems: 'center',
                    borderRadius: 0,
                    border: '1px solid var(--border-subtle)',
                    background: 'var(--bg-surface)',
                    padding: '14px 16px',
                  }}
                >
                  <div style={{ display: 'grid', gap: 4, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flexWrap: 'wrap' }}>
                      <ProviderMark provider={credential.provider} size={30} />
                      <div style={{ display: 'grid', gap: 2, minWidth: 0 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-primary)' }}>
                          {providerLabel(credential.provider, providerOptions)}
                        </div>
                        <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.45, wordBreak: 'break-word' }}>
                          {credential.label}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                      <span className="orion-chip" style={statusTone}>
                        {enabled ? 'Enabled' : 'Disabled'}
                      </span>
                      {primaryProfile?.model ? (
                        <span className="orion-chip">{primaryProfile.model}</span>
                      ) : null}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    <button
                      className="orion-btn orion-btn-ghost"
                      style={{ minHeight: 34, paddingInline: 12 }}
                      onClick={() => void handleTestProviderCredential(credential)}
                      disabled={busyAction === 'test'}
                    >
                      {busyAction === 'test' ? 'Testing…' : 'Test'}
                    </button>
                    <button
                      className="orion-btn orion-btn-danger"
                      style={{ minHeight: 34, paddingInline: 12 }}
                      onClick={() => void handleRemoveProviderCredential(credential)}
                      disabled={busyAction === 'remove'}
                    >
                      <Trash2 size={13} />
                      {busyAction === 'remove' ? 'Removing…' : 'Remove'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {showProviderForm ? (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 80,
            display: 'grid',
            placeItems: 'center',
            padding: 24,
            background: 'var(--overlay-scrim)',
            backdropFilter: 'blur(10px)',
          }}
          onClick={() => setShowProviderForm(false)}
        >
          <div
            className="orion-panel"
            style={{
              width: 'min(560px, calc(100vw - 48px))',
              maxHeight: 'calc(100vh - 48px)',
              overflow: 'auto',
              display: 'grid',
              gap: 18,
              padding: 24,
              borderRadius: 12,
              boxShadow: 'none',
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 20, alignItems: 'start' }}>
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--text-primary)' }}>
                  Add account
                </div>
                <div style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  Connect one provider account to this workspace.
                </div>
              </div>
              <button
                className="orion-btn orion-btn-ghost"
                style={{ minHeight: 42, minWidth: 42, paddingInline: 12 }}
                onClick={() => setShowProviderForm(false)}
                aria-label="Close add account dialog"
              >
                <X size={16} />
              </button>
            </div>

            <div
              style={{
                display: 'grid',
                gap: 14,
                borderRadius: 8,
                border: '1px solid var(--border-subtle)',
                background: 'var(--bg-element)',
                padding: 18,
              }}
            >
              <label style={{ display: 'grid', gap: 6 }}>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Provider</span>
                <select
                  className="input"
                  value={providerForm.provider}
                  onChange={(event) => {
                    const nextProvider = knownProviderId(event.target.value) || 'anthropic';
                    openProviderFormForMethod(nextProvider);
                  }}
                >
                  {providerOptions.map((option) => (
                    <option key={option.id} value={option.id}>{option.label}</option>
                  ))}
                </select>
              </label>

              <div
                style={{
                  display: 'grid',
                  gap: 4,
                  borderRadius: 8,
                  border: '1px solid var(--border-subtle)',
                  background: 'var(--bg-surface)',
                  padding: '12px 14px',
                }}
              >
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Connection method</div>
                {providerConnectMethods.length > 1 ? (
                  <div style={{ display: 'grid', gap: 8 }}>
                    {providerConnectMethods.map((method) => {
                      const checked = selectedConnectMethod?.id === method.id;
                      return (
                        <label
                          key={method.id}
                          style={{
                            display: 'grid',
                            gridTemplateColumns: 'auto minmax(0, 1fr)',
                            gap: 10,
                            alignItems: 'start',
                            cursor: method.disabled ? 'not-allowed' : 'pointer',
                            opacity: method.disabled ? 0.65 : 1,
                          }}
                        >
                          <input
                            type="radio"
                            name="provider-connect-method"
                            checked={checked}
                            onChange={() => applyProviderConnectMethod(method)}
                            disabled={method.disabled}
                            style={{ marginTop: 2 }}
                          />
                          <span style={{ display: 'grid', gap: 3 }}>
                            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{method.label}</span>
                            <span style={{ fontSize: 12.5, color: method.disabled ? 'var(--warning-fg)' : 'var(--text-secondary)', lineHeight: 1.5 }}>
                              {method.disabled && method.disabledReason ? method.disabledReason : method.description}
                            </span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                ) : (
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                    {simpleProviderAuthLabel(providerForm.provider)}
                  </div>
                )}
              </div>

              {selectedConnectMethod && isManualConnectMethod(selectedConnectMethod.action) && providerForm.provider === 'vertex' ? (
                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Project ID</span>
                  <input
                    className="input"
                    value={providerForm.projectId}
                    onChange={(event) => setProviderForm((prev) => ({ ...prev, projectId: event.target.value }))}
                    placeholder="my-gcp-project"
                  />
                </label>
              ) : null}

              {selectedConnectMethod && isManualConnectMethod(selectedConnectMethod.action) && selectedConnectNeedsSecret ? (
                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    {providerForm.provider === 'vertex' ? 'Access token' : 'API key'}
                  </span>
                  <input
                    className="input"
                    type="password"
                    value={providerForm.secret}
                    onChange={(event) => setProviderForm((prev) => ({ ...prev, secret: event.target.value }))}
                    placeholder={simpleProviderSecretPlaceholder(providerForm.provider)}
                  />
                </label>
              ) : (
                <div
                  style={{
                    display: 'grid',
                    gap: 6,
                    borderRadius: 8,
                    border: '1px solid var(--border-subtle)',
                    background: 'var(--bg-surface)',
                    padding: '12px 14px',
                  }}
                >
                  <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.55 }}>
                    {selectedConnectMethod?.description || 'Use the selected connection method to continue.'}
                  </div>
                  {selectedConnectDisabledReason ? (
                    <div style={{ fontSize: 12.5, color: 'var(--warning-fg)', lineHeight: 1.55 }}>
                      {selectedConnectDisabledReason}
                    </div>
                  ) : null}
                </div>
              )}
            </div>

            {providerError ? (
              <div
                style={{
                  borderRadius: 14,
                  border: '1px solid var(--warning-border)',
                  background: 'var(--warning-bg)',
                  color: 'var(--warning-fg)',
                  padding: '10px 12px',
                  fontSize: 12.5,
                  lineHeight: 1.5,
                }}
              >
                {providerError}
              </div>
            ) : null}

            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: 12,
                alignItems: 'center',
                borderTop: '1px solid var(--border-subtle)',
                paddingTop: 18,
                flexWrap: 'wrap',
              }}
            >
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  className="orion-btn orion-btn-ghost"
                  style={{ minHeight: 40, paddingInline: 16 }}
                  onClick={() => setShowProviderForm(false)}
                >
                  Cancel
                </button>
                <button
                  className="orion-btn orion-btn-primary"
                  style={{ minHeight: 40, paddingInline: 16 }}
                  onClick={() => void handleConnectSelectedMethod()}
                  disabled={selectedConnectDisabled}
                  title={selectedConnectDisabledReason || undefined}
                >
                  <Plus size={14} />
                  {selectedConnectPrimaryLabel}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
