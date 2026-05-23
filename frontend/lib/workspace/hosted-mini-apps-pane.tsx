'use client';

import Link from 'next/link';
import type { FormEvent } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ExternalLink,
  Globe2,
  LockKeyhole,
  PackageOpen,
  Plus,
  Sparkles,
} from 'lucide-react';

import { buildCookieAuthHeaders } from '@/lib/auth/csrf';
import {
  buildApplicationTabHref,
  normalizeApplicationSurfaceTabId,
} from '@/lib/workspace/application-surface-tabs';

import styles from './hosted-mini-apps.module.css';

type HostedMiniAppListItem = {
  app_id: string;
  label: string;
  description?: string | null;
  delivery_mode?: string | null;
  memory_scope?: string | null;
  permissions?: string[];
  bridge_contracts?: Record<string, string[]>;
  context_envelope?: {
    default_classes?: string[];
    optional_classes?: string[];
  } | null;
  hosted_app?: {
    hosted_url?: string | null;
    allowed_origins?: string[];
    embed?: {
      kind?: string | null;
    };
    bridge?: {
      allowed_contracts?: Record<string, string[]>;
      denied_by_default?: string[];
    } | null;
  } | null;
};

type MiniAppListingPayload = {
  items?: HostedMiniAppListItem[];
};

async function fetchHostedMiniApps(workspaceId: string): Promise<HostedMiniAppListItem[]> {
  const response = await fetch(`/api/workspaces/${encodeURIComponent(workspaceId)}/mini-apps`, {
    credentials: 'include',
    headers: buildCookieAuthHeaders('GET', { accept: 'application/json' }),
  });
  if (!response.ok) {
    throw new Error(`Application listing failed with status ${response.status}.`);
  }
  const payload = (await response.json()) as MiniAppListingPayload;
  const items = Array.isArray(payload.items) ? payload.items : [];
  return items.filter((item) => item.delivery_mode === 'hosted' && Boolean(item.hosted_app?.hosted_url));
}

async function upsertHostedMiniApp(
  workspaceId: string,
  appId: string,
  payload: Record<string, unknown>,
): Promise<HostedMiniAppListItem> {
  const response = await fetch(
    `/api/workspaces/${encodeURIComponent(workspaceId)}/mini-apps/${encodeURIComponent(appId)}`,
    {
      method: 'PUT',
      credentials: 'include',
      headers: buildCookieAuthHeaders('PUT', {
        accept: 'application/json',
        'content-type': 'application/json',
      }),
      body: JSON.stringify(payload),
    },
  );
  const responsePayload = (await response.json().catch(() => null)) as { detail?: unknown } | HostedMiniAppListItem | null;
  if (!response.ok) {
    const detail = responsePayload && 'detail' in responsePayload ? responsePayload.detail : null;
    throw new Error(typeof detail === 'string' ? detail : `Application creation failed with status ${response.status}.`);
  }
  if (!responsePayload || !('app_id' in responsePayload)) {
    throw new Error('Application creation returned an invalid response.');
  }
  return responsePayload as HostedMiniAppListItem;
}

function humanizeToken(value: string): string {
  return value
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function bridgeContractCount(contracts: Record<string, string[]> | undefined): number {
  return Object.values(contracts || {}).reduce((total, items) => total + items.length, 0);
}

function summarizeBridgeKinds(contracts: Record<string, string[]> | undefined): string {
  const kinds = Object.keys(contracts || {});
  if (!kinds.length) {
    return 'No bridge contracts';
  }
  return kinds.map(humanizeToken).join(' · ');
}

function appIdFromName(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);
  return `${slug || 'private_app'}_${Date.now().toString(36)}`;
}

function urlTargetsLocalDevelopment(url: URL): boolean {
  const host = url.hostname.toLowerCase();
  return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]' || host.endsWith('.local');
}

export function HostedMiniAppsPane({ workspaceId }: { workspaceId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeTab = normalizeApplicationSurfaceTabId(searchParams.get('tab') || searchParams.get('applicationTab'));
  const [items, setItems] = useState<HostedMiniAppListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [privateAppName, setPrivateAppName] = useState('');
  const [privateAppUrl, setPrivateAppUrl] = useState('');
  const [privateAppError, setPrivateAppError] = useState<string | null>(null);
  const [privateAppSaving, setPrivateAppSaving] = useState(false);
  const [privateAppSaved, setPrivateAppSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void fetchHostedMiniApps(workspaceId)
      .then((nextItems) => {
        if (!cancelled) {
          setItems(nextItems);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load applications.');
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  const handlePrivateAppSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setPrivateAppError(null);
      setPrivateAppSaved(false);
      const name = privateAppName.trim();
      const rawUrl = privateAppUrl.trim();
      if (!name) {
        setPrivateAppError('Enter an app name.');
        return;
      }
      let parsedUrl: URL;
      try {
        parsedUrl = new URL(rawUrl);
      } catch {
        setPrivateAppError('Enter a valid app URL.');
        return;
      }
      if (parsedUrl.protocol !== 'https:' && !(process.env.NODE_ENV !== 'production' && urlTargetsLocalDevelopment(parsedUrl))) {
        setPrivateAppError('Private apps require an HTTPS URL. Localhost is allowed only in development.');
        return;
      }
      setPrivateAppSaving(true);
      try {
        const created = await upsertHostedMiniApp(workspaceId, appIdFromName(name), {
          label: name,
          description: 'Private workspace app',
          delivery_mode: 'hosted',
          hosted_url: parsedUrl.toString(),
          allowed_origins: [parsedUrl.origin],
          trust_tier: 'user_private',
          permissions: [],
          bridge_contracts: {},
          context_envelope: {
            default_classes: [],
            optional_classes: [],
          },
          background_ai_allowed: false,
          visibility: 'workspace_private',
          install_status: 'installed',
        });
        setItems((current) => [created, ...current.filter((item) => item.app_id !== created.app_id)]);
        setPrivateAppName('');
        setPrivateAppUrl('');
        setPrivateAppSaved(true);
        router.replace(buildApplicationTabHref(workspaceId, 'installed', searchParams));
      } catch (err) {
        setPrivateAppError(err instanceof Error ? err.message : 'Could not create this application.');
      } finally {
        setPrivateAppSaving(false);
      }
    },
    [privateAppName, privateAppUrl, router, searchParams, workspaceId],
  );

  const content = useMemo(() => {
    if (activeTab === 'official') {
      return (
        <section className={styles.catalogEmpty} aria-label="Official applications">
          <div className={styles.emptyIcon}>
            <Sparkles aria-hidden="true" />
          </div>
          <div className={styles.emptyCopyBlock}>
            <p className={styles.emptyTitle}>No official apps yet.</p>
            <p className={styles.emptyCopy}>Empyralis-built apps will appear here when they are ready to add.</p>
          </div>
          <button
            type="button"
            className={styles.secondaryAction}
            onClick={() => router.replace(buildApplicationTabHref(workspaceId, 'installed', searchParams))}
          >
            Back to apps
          </button>
        </section>
      );
    }

    if (activeTab === 'my_apps') {
      return (
        <section className={styles.privateAppPanel} aria-label="Private applications">
          <div className={styles.privateAppIntro}>
            <div className={styles.emptyIcon}>
              <LockKeyhole aria-hidden="true" />
            </div>
            <div className={styles.emptyCopyBlock}>
              <p className={styles.emptyTitle}>Add a private app URL</p>
              <p className={styles.emptyCopy}>Connect an app surface you control. It opens in the workspace shell with no bridge permissions until you explicitly enable them.</p>
            </div>
          </div>
          <form className={styles.privateAppForm} onSubmit={handlePrivateAppSubmit}>
            <label className={styles.fieldLabel}>
              App name
              <input
                className={styles.textInput}
                value={privateAppName}
                onChange={(event) => {
                  setPrivateAppName(event.target.value);
                  setPrivateAppError(null);
                  setPrivateAppSaved(false);
                }}
                placeholder="Customer portal"
                autoComplete="off"
              />
            </label>
            <label className={styles.fieldLabel}>
              App URL
              <input
                className={styles.textInput}
                value={privateAppUrl}
                onChange={(event) => {
                  setPrivateAppUrl(event.target.value);
                  setPrivateAppError(null);
                  setPrivateAppSaved(false);
                }}
                placeholder="https://apps.example.com/customer-portal"
                autoComplete="off"
              />
            </label>
            {privateAppError ? <p className={styles.formError}>{privateAppError}</p> : null}
            {privateAppSaved ? <p className={styles.formSuccess}>Private app added.</p> : null}
            <div className={styles.actionRow}>
              <button type="submit" className={styles.primaryAction} disabled={privateAppSaving}>
                <Plus aria-hidden="true" />
                {privateAppSaving ? 'Adding...' : 'Add app'}
              </button>
              <button
                type="button"
                className={styles.secondaryAction}
                onClick={() => router.replace(buildApplicationTabHref(workspaceId, 'installed', searchParams))}
              >
                Back to apps
              </button>
            </div>
          </form>
        </section>
      );
    }

    if (loading) {
      return <div className={styles.emptyState}>Loading applications...</div>;
    }
    if (error) {
      return <div className={`${styles.emptyState} ${styles.error}`}>Applications could not refresh. Try again when ready.</div>;
    }
    if (!items.length) {
      return (
        <section className={styles.installedEmpty} aria-label="Installed applications">
          <div className={styles.commandPanel}>
            <div className={styles.commandIcon}>
              <PackageOpen aria-hidden="true" />
            </div>
            <div className={styles.commandCopy}>
              <p className={styles.commandKicker}>Apps</p>
              <h2 className={styles.commandTitle}>No apps installed</h2>
              <p className={styles.commandText}>Browse official apps or create a private workspace app.</p>
            </div>
            <div className={styles.actionRow}>
              <button
                type="button"
                className={styles.primaryAction}
                onClick={() => router.replace(buildApplicationTabHref(workspaceId, 'official', searchParams))}
              >
                <Globe2 aria-hidden="true" />
                Browse official
              </button>
              <button
                type="button"
                className={styles.secondaryAction}
                onClick={() => router.replace(buildApplicationTabHref(workspaceId, 'my_apps', searchParams))}
              >
                <Plus aria-hidden="true" />
                Create app
              </button>
            </div>
          </div>
        </section>
      );
    }
    return (
      <section className={styles.appsSection} aria-label="Installed applications">
        <div className={styles.appsToolbar}>
          <div>
            <p className={styles.commandKicker}>Apps</p>
            <h2 className={styles.sectionTitle}>Installed apps</h2>
          </div>
          <div className={styles.actionRow}>
            <button
              type="button"
              className={styles.secondaryAction}
              onClick={() => router.replace(buildApplicationTabHref(workspaceId, 'official', searchParams))}
            >
              <Globe2 aria-hidden="true" />
              Browse official
            </button>
            <button
              type="button"
              className={styles.primaryAction}
              onClick={() => router.replace(buildApplicationTabHref(workspaceId, 'my_apps', searchParams))}
            >
              <Plus aria-hidden="true" />
              Create app
            </button>
          </div>
        </div>
        <div className={styles.grid}>
          {items.map((item) => (
            <article key={item.app_id} className={styles.card}>
              <div className={styles.header}>
                <p className={styles.eyebrow}>App</p>
                <h2 className={styles.cardTitle}>{item.label}</h2>
                <p className={styles.copy}>{item.description || 'No description yet.'}</p>
              </div>
              <div className={styles.cardMeta}>
                <span className={styles.chip}>{item.hosted_app?.embed?.kind || 'iframe'}</span>
                <span className={styles.chip}>{item.permissions?.length || 0} permission(s)</span>
                <span className={styles.chip}>
                  {item.hosted_app?.allowed_origins?.length || 0} allowed origin{(item.hosted_app?.allowed_origins?.length || 0) === 1 ? '' : 's'}
                </span>
                <span className={styles.chip}>
                  {bridgeContractCount(item.hosted_app?.bridge?.allowed_contracts || item.bridge_contracts)} bridge contract{bridgeContractCount(item.hosted_app?.bridge?.allowed_contracts || item.bridge_contracts) === 1 ? '' : 's'}
                </span>
              </div>
              <div className={styles.factStack}>
                <div className={styles.factBlock}>
                  <p className={styles.factLabel}>Bridge</p>
                  <p className={styles.factValue}>
                    {summarizeBridgeKinds(item.hosted_app?.bridge?.allowed_contracts || item.bridge_contracts)}
                  </p>
                </div>
              </div>
              <div className={styles.linkRow}>
                <Link
                  className={styles.linkButton}
                  href={`/w/${encodeURIComponent(workspaceId)}/applications/${encodeURIComponent(item.app_id)}`}
                >
                  Open
                </Link>
                {item.hosted_app?.hosted_url ? (
                  <a
                    className={styles.linkSecondary}
                    href={item.hosted_app.hosted_url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Source <ExternalLink aria-hidden="true" />
                  </a>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      </section>
    );
  }, [
    activeTab,
    error,
    handlePrivateAppSubmit,
    items,
    loading,
    privateAppError,
    privateAppName,
    privateAppSaved,
    privateAppSaving,
    privateAppUrl,
    router,
    searchParams,
    workspaceId,
  ]);

  return (
    <main className={styles.shell}>
      {content}
    </main>
  );
}
