'use client';

import { useEffect, useMemo } from 'react';
import { usePlatformShell } from '@/components/orion/PlatformShellContext';

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
  const { inspectPanelOpen, inspectState } = usePlatformShell();

  useEffect(() => {
    document.body.classList.toggle('orion-inspect-open', inspectPanelOpen);
    return () => {
      document.body.classList.remove('orion-inspect-open');
    };
  }, [inspectPanelOpen]);

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

  return (
    <aside
      className={`orion-inspect-panel${inspectPanelOpen ? ' is-open' : ''}`}
      aria-hidden={!inspectPanelOpen}
    >
      <div className="orion-inspect-panel-inner">
        <div className="orion-inspect-panel-header">
          <div>
            <div className="orion-inspect-panel-kicker">Inspect</div>
            <div className="orion-inspect-panel-title">Current run</div>
          </div>
        </div>

        {!hasActiveRun ? (
          <div className="orion-inspect-panel-empty">No active run.</div>
        ) : (
          <div className="orion-inspect-panel-sections">
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
          </div>
        )}
      </div>
    </aside>
  );
}
