'use client';

import { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { usePlatformShell } from '@/components/orion/PlatformShellContext';
import { promptControlPlaneSignIn } from '@/lib/controlPlaneSession';

function toTitleCase(value: string): string {
  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function normalizeStatus(value: string | null | undefined): string {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return 'Unknown';
  if (normalized === 'queued_local') return 'Preparing';
  if (normalized === 'waiting') return 'Waiting for confirmation';
  return toTitleCase(normalized);
}

function uniqueNonEmpty(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const token = String(value || '').trim();
    if (!token || seen.has(token)) continue;
    seen.add(token);
    out.push(token);
  }
  return out;
}

export default function PlatformInspectPanel() {
  const { inspectPanelOpen, inspectState, setInspectPanelOpen, status } = usePlatformShell();
  const [authBusy, setAuthBusy] = useState(false);

  useEffect(() => {
    document.body.classList.toggle('orion-inspect-open', inspectPanelOpen);
    return () => {
      document.body.classList.remove('orion-inspect-open');
    };
  }, [inspectPanelOpen]);

  useEffect(() => {
    if (!inspectPanelOpen) return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setInspectPanelOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [inspectPanelOpen, setInspectPanelOpen]);

  const contract = inspectState?.runDetailContract ?? null;
  const providerModel = contract?.provider_model ?? null;
  const approvalOutcome = contract?.approval_outcome ?? null;
  const connectorMutation = contract?.connector_mutation ?? null;
  const evidenceItems = Array.isArray(contract?.evidence_items)
    ? contract.evidence_items.filter(
        (item): item is NonNullable<NonNullable<typeof contract>['evidence_items']>[number] =>
          Boolean(item && String(item.label || '').trim() && String(item.value || '').trim()),
      )
    : [];

  const toolsCalled = useMemo(
    () =>
      uniqueNonEmpty([
        connectorMutation?.execution_label,
        connectorMutation?.action_label,
        connectorMutation?.system_label,
        connectorMutation?.binding?.label,
      ]),
    [connectorMutation],
  );

  const pendingApprovalItems = useMemo(() => {
    const label = String(approvalOutcome?.label || '').trim();
    const status = String(approvalOutcome?.status || '').trim();
    const candidate = label || (status ? toTitleCase(status) : '');
    if (!candidate) return [];
    const lower = candidate.toLowerCase();
    if (lower.includes('confirm') || lower.includes('pending') || lower.includes('waiting') || lower.includes('required')) {
      return [candidate];
    }
    return [];
  }, [approvalOutcome]);

  const hasActiveRun = Boolean(inspectState?.runId && inspectState?.status && contract);

  const promptSignIn = async () => {
    setAuthBusy(true);
    try {
      await promptControlPlaneSignIn();
    } finally {
      setAuthBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        className="orion-inspect-panel-backdrop"
        aria-label="Close inspect panel"
        aria-hidden={!inspectPanelOpen}
        tabIndex={inspectPanelOpen ? 0 : -1}
        onClick={() => setInspectPanelOpen(false)}
      />
      <aside
        className={`orion-inspect-panel${inspectPanelOpen ? ' is-open' : ''}`}
        aria-hidden={!inspectPanelOpen}
      >
        <div className="orion-inspect-panel-inner">
          <div className="orion-inspect-panel-header">
            <div>
              <div className="orion-inspect-panel-kicker">Inspect</div>
              <div className="orion-inspect-panel-title">{status.authRequired ? 'System status' : 'Current run'}</div>
            </div>
            <button
              type="button"
              className="orion-icon-btn"
              onClick={() => setInspectPanelOpen(false)}
              aria-label="Close inspect panel"
            >
              <X size={16} />
            </button>
          </div>

          {!hasActiveRun && !status.authRequired && !status.setupLoading && !status.setupError ? (
            <div className="orion-inspect-panel-empty">No active run.</div>
          ) : (
            <div className="orion-inspect-panel-sections">
              {status.setupLoading ? (
                <section className="orion-inspect-panel-section">
                  <div className="orion-inspect-panel-label">System status</div>
                  <div className="orion-inspect-panel-value">Loading setup status…</div>
                </section>
              ) : null}
              {status.setupError ? (
                <section className="orion-inspect-panel-section">
                  <div className="orion-inspect-panel-label">System status</div>
                  <div className="orion-inspect-panel-value">Setup status unavailable.</div>
                  <div className="orion-inspect-panel-muted">{status.setupError}</div>
                </section>
              ) : null}
              {status.authRequired ? (
                <section className="orion-inspect-panel-section">
                  <div className="orion-inspect-panel-label">Browser sign-in</div>
                  <div className="orion-inspect-panel-value">Continue in your browser to unlock protected actions.</div>
                  <div className="orion-inspect-panel-muted">
                    {String(status.authMessage || 'Continue in your browser to sign in.').trim()}
                  </div>
                  <div className="orion-inspect-panel-actions">
                    <button
                      type="button"
                      className="orion-btn orion-btn-secondary sm"
                      onClick={() => {
                        void promptSignIn();
                      }}
                      disabled={authBusy}
                    >
                      {authBusy ? 'Opening browser…' : 'Sign in'}
                    </button>
                  </div>
                </section>
              ) : null}

              {hasActiveRun ? (
                <>
                  <section className="orion-inspect-panel-section">
                    <div className="orion-inspect-panel-label">Current run status</div>
                    <div className="orion-inspect-panel-value">{normalizeStatus(inspectState?.status)}</div>
                  </section>

                  <section className="orion-inspect-panel-section">
                    <div className="orion-inspect-panel-label">Model and provider used</div>
                    <div className="orion-inspect-panel-value">
                      {String(providerModel?.effective_provider || '').trim() || 'Unknown provider'}
                      {' · '}
                      {String(providerModel?.effective_model || '').trim() || 'Unknown model'}
                    </div>
                  </section>

                  <section className="orion-inspect-panel-section">
                    <div className="orion-inspect-panel-label">Tools called</div>
                    {toolsCalled.length > 0 ? (
                      <div className="orion-inspect-panel-list">
                        {toolsCalled.map((item) => (
                          <div key={item} className="orion-inspect-panel-list-item">
                            {item}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="orion-inspect-panel-muted">No tools recorded.</div>
                    )}
                  </section>

                  <section className="orion-inspect-panel-section">
                    <div className="orion-inspect-panel-label">Evidence items</div>
                    {evidenceItems.length > 0 ? (
                      <div className="orion-inspect-panel-list">
                        {evidenceItems.map((item, index) => (
                          <div key={String(item.id || `evidence-${index}`)} className="orion-inspect-panel-evidence">
                            <div className="orion-inspect-panel-evidence-label">{item.label}</div>
                            <div className="orion-inspect-panel-evidence-value">{item.value}</div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="orion-inspect-panel-muted">No evidence recorded.</div>
                    )}
                  </section>

                  <section className="orion-inspect-panel-section">
                    <div className="orion-inspect-panel-label">Pending approvals</div>
                    {pendingApprovalItems.length > 0 ? (
                      <div className="orion-inspect-panel-list">
                        {pendingApprovalItems.map((item) => (
                          <div key={item} className="orion-inspect-panel-list-item">
                            {item}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="orion-inspect-panel-muted">No pending approvals.</div>
                    )}
                  </section>
                </>
              ) : null}
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
