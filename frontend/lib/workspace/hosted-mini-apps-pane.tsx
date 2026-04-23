'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import { buildCookieAuthHeaders } from '@/lib/auth/csrf';

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
    throw new Error(`Hosted mini app listing failed with status ${response.status}.`);
  }
  const payload = (await response.json()) as MiniAppListingPayload;
  const items = Array.isArray(payload.items) ? payload.items : [];
  return items.filter((item) => item.delivery_mode === 'hosted' && Boolean(item.hosted_app?.hosted_url));
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

export function HostedMiniAppsPane({ workspaceId }: { workspaceId: string }) {
  const [items, setItems] = useState<HostedMiniAppListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
          setError(err instanceof Error ? err.message : 'Failed to load hosted mini apps.');
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  const content = useMemo(() => {
    if (loading) {
      return <div className={styles.empty}>Loading hosted mini applications…</div>;
    }
    if (error) {
      return <div className={`${styles.empty} ${styles.error}`}>{error}</div>;
    }
    if (!items.length) {
      return (
        <div className={styles.empty}>
          No hosted mini applications are configured for this workspace yet.
        </div>
      );
    }
    return (
      <div className={styles.grid}>
        {items.map((item) => (
          <article key={item.app_id} className={styles.card}>
            <div className={styles.header}>
              <p className={styles.eyebrow}>Hosted Mini App</p>
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
              <span className={styles.chip}>Memory: {item.memory_scope === 'none_by_default' ? 'Denied by default' : item.memory_scope || 'Unknown'}</span>
            </div>
            <div className={styles.factStack}>
              <div className={styles.factBlock}>
                <p className={styles.factLabel}>Bridge</p>
                <p className={styles.factValue}>
                  {summarizeBridgeKinds(item.hosted_app?.bridge?.allowed_contracts || item.bridge_contracts)}
                </p>
              </div>
              <div className={styles.factBlock}>
                <p className={styles.factLabel}>Memory boundary</p>
                <p className={styles.factValue}>
                  Sage memory is denied by default. Only explicit context-envelope classes cross the shell boundary.
                </p>
              </div>
              <div className={styles.factBlock}>
                <p className={styles.factLabel}>Denied by default</p>
                <p className={styles.factValue}>
                  {item.hosted_app?.bridge?.denied_by_default?.length
                    ? item.hosted_app.bridge.denied_by_default.map(humanizeToken).slice(0, 3).join(' · ')
                    : 'No implicit memory or runtime grants.'}
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
                  Source
                </a>
              ) : null}
            </div>
          </article>
        ))}
      </div>
    );
  }, [error, items, loading, workspaceId]);

  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>Applications</p>
        <h1 className={styles.title}>Hosted mini applications</h1>
        <p className={styles.copy}>
          These apps run in an embedded browser surface. They can only reach Sage or other runtime targets through
          explicit bridge contracts, allowed origins, and denied-by-default memory boundaries.
        </p>
      </header>
      {content}
    </main>
  );
}
