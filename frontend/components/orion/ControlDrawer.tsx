'use client';

import React from 'react';
import {
  UI,
  fmtTime,
  OUTCOME_PACKS,
  normalizeTrustMode,
  isProviderId,
  type DrawerPanel,
  type SetupSession,
  type ProviderOption,
  type LocalWorkerStatus,
  type LogEntry,
} from '../../app/page.catalog';

interface ControlDrawerProps {
  drawerPanel: DrawerPanel;
  setDrawerPanel: (v: DrawerPanel | null) => void;
  isMobile: boolean;
  setupSteps: { label: string; done: boolean }[];
  setupSession: SetupSession | null;
  setupSessionBusy: boolean;
  resumeSetupSession: () => Promise<void>;
  cancelSetupSession: () => Promise<void>;
  runRuntimeCheck: () => Promise<void>;
  setupBusy: string | null;
  isChecking: boolean;
  testConnection: () => Promise<void>;
  setupStatus: { accountConnected: boolean };
  setShowSetupWizard: (v: boolean) => void;
  selectedPack: { id: string };
  setSelectedPackId: (v: string | ((prev: string) => string)) => void;
  setGoal: (v: string | ((prev: string) => string)) => void;
  trustMode: string;
  setTrustMode: (v: string) => void;
  provider: string;
  setProvider: (v: string) => void;
  connectionMode: string;
  setupAction: (
    action:
      | 'select_provider'
      | 'submit_credential'
      | 'verify'
      | 'complete'
      | 'cancel'
      | 'resume'
      | 'risk_ack'
      | 'provider_auth_choice'
      | 'credential_handling'
      | 'channel_choice',
    payload?: Record<string, unknown>,
  ) => Promise<void>;
  providerOptions: ProviderOption[];
  model: string;
  setModel: (v: string | ((prev: string) => string)) => void;
  modelsLoading: boolean;
  modelOptions: string[];
  inboxInput: string;
  setInboxInput: (v: string | ((prev: string) => string)) => void;
  leadsInput: string;
  setLeadsInput: (v: string | ((prev: string) => string)) => void;
  slotsInput: string;
  setSlotsInput: (v: string | ((prev: string) => string)) => void;
  metricsLoading: boolean;
  workersLoading: boolean;
  kpiCards: { label: string; value: string }[];
  workerSummary: { online: number; known: number; busy: number; pending: number; claimed: number };
  localWorkerStatus: LocalWorkerStatus | null;
  logs: LogEntry[];
}

export const ControlDrawer: React.FC<ControlDrawerProps> = ({
  drawerPanel,
  setDrawerPanel,
  isMobile,
  setupSteps,
  setupSession,
  setupSessionBusy,
  resumeSetupSession,
  cancelSetupSession,
  runRuntimeCheck,
  setupBusy,
  isChecking,
  testConnection,
  setupStatus,
  setShowSetupWizard,
  selectedPack,
  setSelectedPackId,
  setGoal,
  trustMode,
  setTrustMode,
  provider,
  setProvider,
  connectionMode,
  setupAction,
  providerOptions,
  model,
  setModel,
  modelsLoading,
  modelOptions,
  inboxInput,
  setInboxInput,
  leadsInput,
  setLeadsInput,
  slotsInput,
  setSlotsInput,
  metricsLoading,
  workersLoading,
  kpiCards,
  workerSummary,
  localWorkerStatus,
  logs,
}) => {
  const allowedActions = Array.isArray(setupSession?.allowed_actions)
    ? new Set(setupSession.allowed_actions.map((item) => String(item)))
    : null;
  const canSetupAction = (action: string) => !allowedActions || allowedActions.has(action);
  const selectedPackDefinition = OUTCOME_PACKS.find((item) => item.id === selectedPack.id) || OUTCOME_PACKS[0];
  const inputLabels = selectedPackDefinition.inputLabels;
  const inputPlaceholders = selectedPackDefinition.inputPlaceholders;

  return (
    <div
      onClick={() => setDrawerPanel(null)}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        background: 'var(--overlay-scrim)',
        backdropFilter: 'blur(2px)',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          bottom: 0,
          width: isMobile ? '100%' : 420,
          borderLeft: `1px solid ${UI.border}`,
          background: UI.surfaceAlt,
          padding: 14,
          overflowY: 'auto',
          display: 'grid',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: UI.textSoft }}>
            {drawerPanel === 'setup'
              ? 'Setup'
              : drawerPanel === 'details'
              ? 'Run Details'
              : drawerPanel === 'metrics'
              ? 'Runtime Metrics'
              : 'Live Logs'}
          </div>
          <button
            onClick={() => setDrawerPanel(null)}
            className="orion-btn orion-btn-ghost"
            style={{ minHeight: 30, fontSize: 11, color: UI.textMuted }}
          >
            Close
          </button>
        </div>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {(['setup', 'details', 'metrics', 'logs'] as DrawerPanel[]).map((panel) => (
            <button
              key={panel}
              onClick={() => setDrawerPanel(panel)}
              className="orion-btn orion-btn-ghost"
              style={{
                minHeight: 30,
                fontSize: 11,
                padding: '0 10px',
                borderColor: drawerPanel === panel ? UI.accentBorder : UI.border,
                background: drawerPanel === panel ? UI.accentSoft : 'transparent',
                color: drawerPanel === panel ? UI.textSoft : UI.textMuted,
              }}
            >
              {panel === 'setup'
                ? 'Setup'
                : panel === 'details'
                ? 'Details'
                : panel === 'metrics'
                ? 'Metrics'
                : 'Logs'}
            </button>
          ))}
        </div>

        {drawerPanel === 'setup' && (
          <div style={{ display: 'grid', gap: 10 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {setupSteps.map((step) => (
                <span
                  key={step.label}
                  style={{
                    borderRadius: 999,
                    border: `1px solid ${step.done ? UI.successBorder : UI.border}`,
                    color: step.done ? UI.successFg : UI.textMuted,
                    background: step.done ? UI.successBg : 'transparent',
                    padding: '4px 8px',
                    fontSize: 11,
                    fontWeight: 700,
                  }}
                >
                  {step.label}
                </span>
              ))}
            </div>
            {setupSession && (
              <div style={{ fontSize: 11, color: UI.textMuted }}>
                Session: <strong style={{ color: UI.textSoft }}>{setupSession.state}</strong> · {setupSession.id.slice(0, 8)}...
                {setupSession.next_step ? (
                  <>
                    {' · '}
                    Next: <strong style={{ color: UI.textSoft }}>{setupSession.next_step}</strong>
                  </>
                ) : null}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                onClick={resumeSetupSession}
                disabled={setupSessionBusy || !canSetupAction('resume')}
                style={{
                  borderRadius: 8,
                  border: `1px solid ${UI.border}`,
                  background: 'transparent',
                  color: UI.textSoft,
                  padding: '6px 10px',
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: setupSessionBusy || !canSetupAction('resume') ? 'not-allowed' : 'pointer',
                }}
              >
                Resume setup session
              </button>
              <button
                onClick={cancelSetupSession}
                disabled={setupSessionBusy || !canSetupAction('cancel')}
                style={{
                  borderRadius: 8,
                  border: `1px solid ${UI.border}`,
                  background: 'transparent',
                  color: UI.textSoft,
                  padding: '6px 10px',
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: setupSessionBusy || !canSetupAction('cancel') ? 'not-allowed' : 'pointer',
                }}
              >
                Cancel setup session
              </button>
            </div>
            <button
              onClick={runRuntimeCheck}
              disabled={setupBusy !== null || isChecking}
              style={{
                borderRadius: 8,
                border: `1px solid ${UI.border}`,
                background: 'transparent',
                color: UI.textSoft,
                padding: '8px 10px',
                fontSize: 12,
                fontWeight: 700,
                cursor: setupBusy !== null || isChecking ? 'not-allowed' : 'pointer',
              }}
            >
              {setupBusy === 'runtime' ? 'Checking...' : 'Run System Check'}
            </button>
            <button
              onClick={testConnection}
              disabled={setupBusy !== null || !setupStatus.accountConnected}
              style={{
                borderRadius: 8,
                border: `1px solid ${UI.border}`,
                background: 'transparent',
                color: UI.textSoft,
                padding: '8px 10px',
                fontSize: 12,
                fontWeight: 700,
                cursor: setupBusy !== null || !setupStatus.accountConnected ? 'not-allowed' : 'pointer',
              }}
            >
              {setupBusy === 'test' ? 'Testing...' : 'Test Connection'}
            </button>
            <button
              onClick={() => {
                setShowSetupWizard(true);
                setDrawerPanel(null);
              }}
              style={{
                borderRadius: 8,
                border: `1px solid ${UI.border}`,
                background: UI.accentSoft,
                color: UI.textSoft,
                padding: '8px 10px',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Open Full Setup Form
            </button>
          </div>
        )}

        {drawerPanel === 'details' && (
          <div style={{ display: 'grid', gap: 10 }}>
            <div style={{ fontSize: 12, color: UI.textMuted }}>Outcome pack</div>
            <select
              value={selectedPack.id}
              onChange={(e) => {
                const nextId = e.target.value;
                setSelectedPackId(nextId);
                const nextPack = OUTCOME_PACKS.find((item) => item.id === nextId);
                if (nextPack) {
                  setGoal(nextPack.defaultGoal);
                }
              }}
              style={{
                width: '100%',
                borderRadius: 8,
                border: `1px solid ${UI.border}`,
                background: 'var(--bg-element)',
                color: UI.textSoft,
                padding: '8px 10px',
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              {OUTCOME_PACKS.map((pack) => (
                <option key={pack.id} value={pack.id}>{pack.label}</option>
              ))}
            </select>

            <div style={{ fontSize: 12, color: UI.textMuted }}>Trust mode</div>
            <select
              value={trustMode}
              onChange={(e) => setTrustMode(normalizeTrustMode(e.target.value))}
              style={{
                borderRadius: 8,
                border: `1px solid ${UI.border}`,
                background: 'var(--bg-element)',
                color: UI.textSoft,
                padding: '8px 10px',
                fontSize: 12,
              }}
            >
              <option value="guarded">Guarded (recommended)</option>
              <option value="auto">Auto (fastest)</option>
              <option value="strict">Strict (approve everything)</option>
              <option value="cost_guard">Cost Guard (threshold based)</option>
              <option value="sensitive_guard">Sensitive Guard (compliance first)</option>
            </select>

            <div style={{ fontSize: 12, color: UI.textMuted }}>Provider</div>
            <select
              value={provider}
              onChange={(e) => {
                const next = e.target.value;
                if (isProviderId(next)) {
                  setProvider(next);
                  void setupAction('select_provider', { provider: next });
                }
              }}
              disabled={connectionMode !== 'byok'}
              style={{
                borderRadius: 8,
                border: `1px solid ${UI.border}`,
                background: 'var(--bg-element)',
                color: UI.textSoft,
                padding: '8px 10px',
                fontSize: 12,
                cursor: connectionMode !== 'byok' ? 'not-allowed' : 'pointer',
                opacity: connectionMode !== 'byok' ? 0.7 : 1,
              }}
            >
              {providerOptions.map((item) => (
                <option key={item.id} value={item.id}>{item.label}</option>
              ))}
            </select>

            <div style={{ fontSize: 12, color: UI.textMuted }}>Model</div>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              disabled={modelsLoading}
              style={{
                borderRadius: 8,
                border: `1px solid ${UI.border}`,
                background: 'var(--bg-element)',
                color: UI.textSoft,
                padding: '8px 10px',
                fontSize: 12,
                cursor: modelsLoading ? 'not-allowed' : 'pointer',
                opacity: modelsLoading ? 0.7 : 1,
              }}
            >
              {modelOptions.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>

            <label style={{ display: 'block', fontSize: 12, color: UI.textSoft }}>
              Inputs
            </label>
            <div style={{ fontSize: 11, color: UI.textMuted, marginTop: -4, marginBottom: 2 }}>
              {selectedPack.id === 'spreadsheet-ops-v1'
                ? 'Local paths and OneDrive paths both work here. Example: onedrive:/Sales/customers.xlsx'
                : selectedPack.id === 'local-execution-v1'
                  ? 'Describe the exact local task, target, and any payload or options.'
                  : 'Use the pack-specific inputs below to guide the run.'}
            </div>
            <label style={{ display: 'block', fontSize: 12, color: UI.textMuted, marginTop: 2, marginBottom: -6 }}>
              {inputLabels.primary}
            </label>
            <textarea
              value={inboxInput}
              onChange={(e) => setInboxInput(e.target.value)}
              placeholder={inputPlaceholders.primary}
              rows={3}
              style={{
                width: '100%',
                borderRadius: 8,
                border: `1px solid ${UI.border}`,
                background: 'var(--bg-element)',
                color: UI.text,
                padding: 8,
                resize: 'vertical',
                fontSize: 12,
              }}
            />
            <label style={{ display: 'block', fontSize: 12, color: UI.textMuted, marginTop: 2, marginBottom: -6 }}>
              {inputLabels.secondary}
            </label>
            <textarea
              value={leadsInput}
              onChange={(e) => setLeadsInput(e.target.value)}
              placeholder={inputPlaceholders.secondary}
              rows={3}
              style={{
                width: '100%',
                borderRadius: 8,
                border: `1px solid ${UI.border}`,
                background: 'var(--bg-element)',
                color: UI.text,
                padding: 8,
                resize: 'vertical',
                fontSize: 12,
              }}
            />
            <label style={{ display: 'block', fontSize: 12, color: UI.textMuted, marginTop: 2, marginBottom: -6 }}>
              {inputLabels.tertiary}
            </label>
            <textarea
              value={slotsInput}
              onChange={(e) => setSlotsInput(e.target.value)}
              placeholder={inputPlaceholders.tertiary}
              rows={3}
              style={{
                width: '100%',
                borderRadius: 8,
                border: `1px solid ${UI.border}`,
                background: 'var(--bg-element)',
                color: UI.text,
                padding: 8,
                resize: 'vertical',
                fontSize: 12,
              }}
            />
          </div>
        )}

        {drawerPanel === 'metrics' && (
          <div style={{ display: 'grid', gap: 8 }}>
            {metricsLoading && (
              <div style={{ fontSize: 11, color: UI.textMuted }}>Updating metrics...</div>
            )}
            {workersLoading && (
              <div style={{ fontSize: 11, color: UI.textMuted }}>Updating local worker status...</div>
            )}
            {kpiCards.map((kpi) => (
              <div
                key={kpi.label}
                style={{
                  borderRadius: 10,
                  border: `1px solid ${UI.borderSoft}`,
                  background: UI.surface,
                  padding: '8px 10px',
                }}
              >
                <div style={{ fontSize: 10, color: UI.textMuted, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{kpi.label}</div>
                <div style={{ marginTop: 4, fontSize: 14, fontWeight: 700, color: UI.textSoft }}>{kpi.value}</div>
              </div>
            ))}
            <div
              style={{
                borderRadius: 10,
                border: `1px solid ${UI.borderSoft}`,
                background: UI.surface,
                padding: '8px 10px',
              }}
            >
              <div style={{ fontSize: 10, color: UI.textMuted, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Local Workers</div>
              <div style={{ marginTop: 4, fontSize: 13, color: UI.textSoft, fontWeight: 700 }}>
                {workerSummary.online}/{workerSummary.known || workerSummary.online} online
              </div>
              <div style={{ marginTop: 2, fontSize: 11, color: UI.textMuted }}>
                Busy {workerSummary.busy} · Queued {workerSummary.pending} · Claimed {workerSummary.claimed}
              </div>
            </div>
            {(localWorkerStatus?.items || []).slice(0, 5).map((worker) => (
              <div
                key={worker.worker_id}
                style={{
                  borderRadius: 10,
                  border: `1px solid ${UI.borderSoft}`,
                  background: UI.surface,
                  padding: '8px 10px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: UI.textSoft }}>{worker.worker_id}</div>
                  <span style={{ fontSize: 10, color: worker.online ? UI.success : UI.textMuted }}>
                    {worker.online ? 'online' : 'offline'}
                  </span>
                </div>
                <div style={{ marginTop: 4, fontSize: 11, color: UI.textMuted }}>
                  {worker.current_run_id
                    ? `Run ${worker.current_run_id.slice(0, 8)}...`
                    : 'Idle'}
                </div>
                {typeof worker.seconds_since_seen === 'number' && (
                  <div style={{ marginTop: 2, fontSize: 10, color: UI.textMuted }}>
                    Last seen {worker.seconds_since_seen}s ago
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {drawerPanel === 'logs' && (
          <div style={{ display: 'grid', gap: 8 }}>
            {logs.length === 0 ? (
              <div style={{ color: UI.textMuted, fontSize: 12 }}>No logs yet.</div>
            ) : (
              logs.map((entry, idx) => {
                const color = entry.level === 'error' ? UI.error : entry.level === 'warn' ? UI.warning : UI.textMuted;
                return (
                  <div key={`${entry.ts}-${idx}`} style={{ borderRadius: 8, border: `1px solid ${UI.borderSoft}`, padding: '8px 10px', background: UI.shell }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontSize: 11, color, fontWeight: 700 }}>{entry.level.toUpperCase()}</span>
                      <span style={{ fontSize: 11, color: UI.textMuted }}>{fmtTime(entry.ts)}</span>
                    </div>
                    <div style={{ fontSize: 12, color: UI.textSoft, lineHeight: 1.4 }}>{entry.message}</div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
};
