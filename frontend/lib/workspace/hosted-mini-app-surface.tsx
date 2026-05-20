'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { buildCookieAuthHeaders } from '@/lib/auth/csrf';

import styles from './hosted-mini-apps.module.css';

type HostedMiniAppManifest = {
  app_id: string;
  label?: string | null;
  description?: string | null;
  memory_scope?: string | null;
  permissions?: string[];
  context_envelope?: {
    default_classes?: string[];
    optional_classes?: string[];
    inherits_sage_memory_by_default?: boolean;
    inherits_specialist_memory_by_default?: boolean;
  } | null;
  hosted_app?: {
    hosted_url?: string | null;
    allowed_origins?: string[];
    embed?: {
      kind?: string | null;
      sandbox?: string[];
      allow?: string[];
      referrer_policy?: string | null;
    } | null;
    bridge?: {
      endpoint?: string | null;
      request_type?: string | null;
      response_type?: string | null;
      ready_type?: string | null;
      allowed_contracts?: Record<string, string[]>;
      permissions?: string[];
      context_envelope?: {
        default_classes?: string[];
        optional_classes?: string[];
        inherits_sage_memory_by_default?: boolean;
        inherits_specialist_memory_by_default?: boolean;
      } | null;
      denied_by_default?: string[];
      launch_token_required?: boolean;
    } | null;
    launch?: {
      token?: string | null;
      expires_at?: number | null;
      bound_origin?: string | null;
      bridge_nonce?: string | null;
    } | null;
  } | null;
};

type HostedMiniAppBridgeConfig = NonNullable<
  NonNullable<HostedMiniAppManifest['hosted_app']>['bridge']
>;

type HostedMiniAppBridgeEvent = {
  type?: string;
  requestId?: string;
  bridgeKind?: string;
  bridgeType?: string;
  requestText?: string;
  target?: Record<string, unknown>;
  contextEnvelope?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
};

type BridgeActivityState = 'idle' | 'pending' | 'success' | 'error';

type BridgeActivity = {
  state: BridgeActivityState;
  requestId: string;
  bridgeKind: string;
  bridgeType: string;
  origin: string;
  requestText?: string;
  error?: string;
  auditId?: string;
  runId?: string;
  threadId?: string;
};

async function fetchManifest(workspaceId: string, appId: string): Promise<HostedMiniAppManifest> {
  const response = await fetch(
    `/api/workspaces/${encodeURIComponent(workspaceId)}/mini-apps/${encodeURIComponent(appId)}/hosted-manifest`,
    {
      credentials: 'include',
      headers: buildCookieAuthHeaders('GET', { accept: 'application/json' }),
    },
  );
  if (!response.ok) {
    throw new Error(`Hosted mini app manifest failed with status ${response.status}.`);
  }
  return response.json() as Promise<HostedMiniAppManifest>;
}

async function dispatchBridgeMessage(
  endpoint: string,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const response = await fetch(endpoint, {
    method: 'POST',
    credentials: 'include',
    headers: buildCookieAuthHeaders('POST', {
      accept: 'application/json',
      'content-type': 'application/json',
    }),
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null) as
    | { detail?: string; error?: string; message?: string }
    | Record<string, unknown>
    | null;
  if (!response.ok) {
    const detail =
      (typeof payload?.detail === 'string' && payload.detail)
      || (typeof payload?.error === 'string' && payload.error)
      || (typeof payload?.message === 'string' && payload.message)
      || `Hosted mini app bridge failed with status ${response.status}.`;
    throw new Error(detail);
  }
  return (payload && typeof payload === 'object' ? payload : {}) as Record<string, unknown>;
}

function humanizeToken(value: string): string {
  return value
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function isAllowedBridgeRequest(
  bridgeConfig: HostedMiniAppBridgeConfig | null | undefined,
  bridgeKind: string,
  bridgeType: string,
): { ok: true } | { ok: false; error: string } {
  const normalizedKind = String(bridgeKind || '').trim().toLowerCase();
  const normalizedType = String(bridgeType || '').trim().toLowerCase();
  const allowedContracts = bridgeConfig?.allowed_contracts || {};
  const allowedTypes = allowedContracts[normalizedKind] || [];
  if (!normalizedKind || !normalizedType) {
    return { ok: false, error: 'Hosted mini apps must declare both bridge kind and bridge type.' };
  }
  if (!allowedTypes.length || !allowedTypes.includes(normalizedType)) {
    return { ok: false, error: 'This hosted app requested a bridge contract that is not allowed for this embed.' };
  }
  return { ok: true };
}

export function HostedMiniAppSurface({
  workspaceId,
  appId,
}: {
  workspaceId: string;
  appId: string;
}) {
  const [manifest, setManifest] = useState<HostedMiniAppManifest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bridgeActivity, setBridgeActivity] = useState<BridgeActivity | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void fetchManifest(workspaceId, appId)
      .then((payload) => {
        if (!cancelled) {
          setManifest(payload);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load hosted mini app.');
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [appId, workspaceId]);

  const bridgeConfig = manifest?.hosted_app?.bridge;
  const allowedOrigins = useMemo(
    () => new Set((manifest?.hosted_app?.allowed_origins || []).map((origin) => String(origin))),
    [manifest],
  );
  const bridgeContracts = useMemo(() => manifest?.hosted_app?.bridge?.allowed_contracts || {}, [manifest]);
  const bridgePermissions = useMemo(
    () => manifest?.hosted_app?.bridge?.permissions || manifest?.permissions || [],
    [manifest],
  );
  const deniedByDefault = useMemo(() => manifest?.hosted_app?.bridge?.denied_by_default || [], [manifest]);
  const defaultEnvelopeClasses = useMemo(
    () => manifest?.hosted_app?.bridge?.context_envelope?.default_classes || manifest?.context_envelope?.default_classes || [],
    [manifest],
  );
  const optionalEnvelopeClasses = useMemo(
    () => manifest?.hosted_app?.bridge?.context_envelope?.optional_classes || manifest?.context_envelope?.optional_classes || [],
    [manifest],
  );

  const postToIframe = useCallback((payload: Record<string, unknown>, targetOrigin: string) => {
    iframeRef.current?.contentWindow?.postMessage(payload, targetOrigin);
  }, []);

  useEffect(() => {
    if (!manifest || !bridgeConfig?.endpoint) {
      return undefined;
    }
    const requestType = bridgeConfig.request_type || 'empyralis.hosted_app.bridge.request';
    const responseType = bridgeConfig.response_type || 'empyralis.hosted_app.bridge.response';

    const handleMessage = (event: MessageEvent<HostedMiniAppBridgeEvent>) => {
      if (event.source !== iframeRef.current?.contentWindow) {
        return;
      }
      if (!allowedOrigins.has(event.origin)) {
        return;
      }
      const payload = event.data;
      if (!payload || payload.type !== requestType) {
        return;
      }
      const requestId = typeof payload.requestId === 'string' ? payload.requestId : '';
      const bridgeKind = String(payload.bridgeKind || '');
      const bridgeType = String(payload.bridgeType || '');
      const localValidation = isAllowedBridgeRequest(bridgeConfig, bridgeKind, bridgeType);
      if (!localValidation.ok) {
        setBridgeActivity({
          state: 'error',
          requestId,
          bridgeKind,
          bridgeType,
          origin: event.origin,
          requestText: typeof payload.requestText === 'string' ? payload.requestText : undefined,
          error: localValidation.error,
        });
        postToIframe(
          {
            type: responseType,
            requestId,
            ok: false,
            error: localValidation.error,
          },
          event.origin,
        );
        return;
      }
      setBridgeActivity({
        state: 'pending',
        requestId,
        bridgeKind,
        bridgeType,
        origin: event.origin,
        requestText: typeof payload.requestText === 'string' ? payload.requestText : undefined,
      });
      void dispatchBridgeMessage(String(bridgeConfig.endpoint), {
        origin: event.origin,
        bridge_kind: bridgeKind,
        bridge_type: bridgeType,
        request_text: payload.requestText,
        target: payload.target,
        context_envelope: payload.contextEnvelope,
        metadata: {
          ...(payload.metadata || {}),
          bridge_nonce: manifest.hosted_app?.launch?.bridge_nonce,
        },
        launch_token: manifest.hosted_app?.launch?.token,
      })
        .then((responsePayload) => {
          const audit =
            typeof responsePayload.audit === 'object' && responsePayload.audit
              ? (responsePayload.audit as { activity_event_id?: unknown })
              : null;
          setBridgeActivity({
            state: 'success',
            requestId,
            bridgeKind,
            bridgeType,
            origin: event.origin,
            requestText: typeof payload.requestText === 'string' ? payload.requestText : undefined,
            auditId: typeof audit?.activity_event_id === 'string' ? audit.activity_event_id : undefined,
            runId: typeof responsePayload.run_id === 'string' ? responsePayload.run_id : undefined,
            threadId: typeof responsePayload.thread_id === 'string' ? responsePayload.thread_id : undefined,
          });
          postToIframe(
            {
              type: responseType,
              requestId,
              ok: true,
              payload: responsePayload,
            },
            event.origin,
          );
        })
        .catch((bridgeError) => {
          const message = bridgeError instanceof Error ? bridgeError.message : 'Hosted mini app bridge failed.';
          setBridgeActivity({
            state: 'error',
            requestId,
            bridgeKind,
            bridgeType,
            origin: event.origin,
            requestText: typeof payload.requestText === 'string' ? payload.requestText : undefined,
            error: message,
          });
          postToIframe(
            {
              type: responseType,
              requestId,
              ok: false,
              error: message,
            },
            event.origin,
          );
        });
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [allowedOrigins, bridgeConfig, manifest, postToIframe]);

  const handleFrameLoad = useCallback(() => {
    const readyType = bridgeConfig?.ready_type || 'empyralis.hosted_app.bridge.ready';
    const targetOrigin = manifest?.hosted_app?.allowed_origins?.[0];
    if (!targetOrigin) {
      return;
    }
    postToIframe(
      {
        type: readyType,
        appId: manifest?.app_id,
        workspaceId,
        allowedContracts: bridgeConfig?.allowed_contracts || {},
        permissions: bridgePermissions,
        deniedByDefault,
        contextEnvelope: {
          defaultClasses: defaultEnvelopeClasses,
          optionalClasses: optionalEnvelopeClasses,
        },
        memoryScope: manifest?.memory_scope || 'none_by_default',
        launchToken: manifest?.hosted_app?.launch?.token,
        launchTokenExpiresAt: manifest?.hosted_app?.launch?.expires_at,
        bridgeNonce: manifest?.hosted_app?.launch?.bridge_nonce,
      },
      targetOrigin,
    );
  }, [
    bridgeConfig,
    bridgePermissions,
    defaultEnvelopeClasses,
    deniedByDefault,
    manifest,
    optionalEnvelopeClasses,
    postToIframe,
    workspaceId,
  ]);

  const embedSandbox = useMemo(
    () => (manifest?.hosted_app?.embed?.sandbox || []).join(' ') || undefined,
    [manifest],
  );
  const embedAllow = useMemo(
    () => (manifest?.hosted_app?.embed?.allow || []).join('; ') || undefined,
    [manifest],
  );
  const bridgeContractEntries = useMemo(
    () => Object.entries(bridgeContracts).filter(([, items]) => Array.isArray(items) && items.length > 0),
    [bridgeContracts],
  );
  const bridgeStatusLabel = useMemo(() => {
    if (!bridgeActivity) {
      return 'Waiting for explicit bridge requests from the embedded app.';
    }
    if (bridgeActivity.state === 'pending') {
      return 'Processing a governed bridge request.';
    }
    if (bridgeActivity.state === 'success') {
      return 'Last bridge request completed under explicit contract checks.';
    }
    return 'Last bridge request was rejected or failed.';
  }, [bridgeActivity]);

  return (
    <main className={styles.shell}>
      <header className={styles.frameHeader}>
        <div className={styles.header}>
          <p className={styles.eyebrow}>Hosted Mini App</p>
          <h1 className={styles.title}>{manifest?.label || appId}</h1>
          <p className={styles.copy}>
            {manifest?.description || 'This mini application runs inside an isolated embedded surface.'}
          </p>
        </div>
        <div className={styles.linkRow}>
          <Link
            className={styles.linkSecondary}
            href={`/w/${encodeURIComponent(workspaceId)}/deploy`}
          >
            Back
          </Link>
          {manifest?.hosted_app?.hosted_url ? (
            <a
              className={styles.linkButton}
              href={manifest.hosted_app.hosted_url}
              target="_blank"
              rel="noreferrer"
            >
              Open source app
            </a>
          ) : null}
        </div>
      </header>

      {loading ? (
        <div className={styles.empty}>Loading hosted mini application…</div>
      ) : error ? (
        <div className={`${styles.empty} ${styles.error}`}>Mini app could not load. Try again when ready.</div>
      ) : manifest?.hosted_app?.hosted_url ? (
        <section className={styles.frameShell}>
          <div className={styles.status}>
            <span className={styles.dot} />
            {bridgeStatusLabel}
          </div>
          <section className={styles.policyGrid}>
            <article className={styles.policyCard}>
              <p className={styles.policyLabel}>Memory boundary</p>
              <h2 className={styles.policyTitle}>No Sage memory by default</h2>
              <p className={styles.policyCopy}>
                This app mounts with <strong>{manifest.memory_scope === 'none_by_default' ? 'denied-by-default memory access' : manifest.memory_scope || 'scoped memory'}</strong>.
                Only explicit context-envelope classes can cross the shell boundary.
              </p>
              <div className={styles.inlineList}>
                {(defaultEnvelopeClasses.length ? defaultEnvelopeClasses : ['user_selected_inputs']).map((item) => (
                  <span key={item} className={styles.chip}>{humanizeToken(item)}</span>
                ))}
              </div>
            </article>

            <article className={styles.policyCard}>
              <p className={styles.policyLabel}>Bridge contracts</p>
              <h2 className={styles.policyTitle}>Explicit postMessage contracts only</h2>
              <p className={styles.policyCopy}>
                The shell only forwards requests that match the hosted manifest. Unsupported bridge kinds or types are rejected in the client and again in the backend.
              </p>
              {bridgeContractEntries.length ? (
                <div className={styles.contractList}>
                  {bridgeContractEntries.map(([kind, items]) => (
                    <div key={kind} className={styles.contractRow}>
                      <span className={styles.contractKind}>{humanizeToken(kind)}</span>
                      <span className={styles.contractTypes}>{items.map(humanizeToken).join(' · ')}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className={styles.policyCopy}>No bridge contracts are granted for this app.</p>
              )}
            </article>

            <article className={styles.policyCard}>
              <p className={styles.policyLabel}>Permissions and denials</p>
              <h2 className={styles.policyTitle}>Governed runtime access</h2>
              <p className={styles.policyCopy}>
                Requested permissions stay explicit. Memory and runtime capabilities that are not granted remain denied by default.
              </p>
              <div className={styles.inlineList}>
                {(bridgePermissions.length ? bridgePermissions : ['no additional bridge permissions']).map((item) => (
                  <span key={item} className={styles.chip}>{humanizeToken(item)}</span>
                ))}
              </div>
              <div className={styles.inlineList}>
                {(deniedByDefault.length ? deniedByDefault : ['read_sage_memory']).map((item) => (
                  <span key={item} className={styles.chipMuted}>{humanizeToken(item)}</span>
                ))}
              </div>
            </article>

            <article className={styles.policyCard}>
              <p className={styles.policyLabel}>Origins and bridge activity</p>
              <h2 className={styles.policyTitle}>Allowed origins only</h2>
              <p className={styles.policyCopy}>
                Only the listed origins can talk to the bridge endpoint. Every accepted request is auditable.
              </p>
              <div className={styles.inlineList}>
                {(manifest.hosted_app.allowed_origins || []).map((origin) => (
                  <span key={origin} className={styles.chip}>{origin}</span>
                ))}
              </div>
              <div className={styles.activityCard}>
                <p className={styles.activityLabel}>Last bridge activity</p>
                {bridgeActivity ? (
                  <>
                    <p className={styles.activityValue}>
                      {humanizeToken(bridgeActivity.bridgeKind)} · {humanizeToken(bridgeActivity.bridgeType)} · {bridgeActivity.state.toUpperCase()}
                    </p>
                    <p className={styles.activityMeta}>
                      {bridgeActivity.requestText || 'No request text provided.'}
                    </p>
                    <p className={styles.activityMeta}>
                      Origin: {bridgeActivity.origin}
                      {bridgeActivity.auditId ? ` · Audit ${bridgeActivity.auditId}` : ''}
                      {bridgeActivity.runId ? ` · Run ${bridgeActivity.runId}` : ''}
                      {bridgeActivity.threadId ? ` · Thread ${bridgeActivity.threadId}` : ''}
                    </p>
                    {bridgeActivity.error ? <p className={styles.activityError}>{bridgeActivity.error}</p> : null}
                  </>
                ) : (
                  <p className={styles.activityMeta}>No bridge request has been received yet.</p>
                )}
              </div>
            </article>
          </section>
          <div className={styles.frameCard}>
            <iframe
              ref={iframeRef}
              className={styles.frame}
              src={manifest.hosted_app.hosted_url}
              title={manifest.label || appId}
              sandbox={embedSandbox}
              allow={embedAllow}
              referrerPolicy={(manifest.hosted_app.embed?.referrer_policy as ReferrerPolicy | undefined) || 'origin'}
              onLoad={handleFrameLoad}
            />
          </div>
        </section>
      ) : (
        <div className={styles.empty}>This mini app does not expose a hosted entrypoint.</div>
      )}
    </main>
  );
}
