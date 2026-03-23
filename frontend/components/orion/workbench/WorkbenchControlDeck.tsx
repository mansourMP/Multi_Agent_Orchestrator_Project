'use client';

import { useMemo, useState } from 'react';
import { ORION_API_URL } from '@/app/page.api';
import {
  DEFAULT_LOCAL_EXECUTION_OPERATION,
  UI,
  fmtTime,
  type AgentRoleOption,
  type BusinessPreset,
  type ConnectorCredentialItem,
  type LocalExecutionDraft,
  type LocalExecutionOperationDraft,
  type LogEntry,
  type OutcomePack,
} from '@/app/page.catalog';
import type { ChatMessageRecord } from '@/components/orion/chat/chatSchema';

export type WorkbenchDeckMode = 'context' | 'control' | 'inspect';
export type WorkbenchInspectStreamState = 'idle' | 'live' | 'reconnecting' | 'closed';
export type WorkbenchChatMode = 'direct' | 'orchestrate';
export type WorkbenchAgentChatMessage = ChatMessageRecord;

type OneDriveBrowserItem = {
  name?: string;
  path?: string;
  kind?: 'file' | 'folder' | string;
  mime_type?: string | null;
  size?: number | null;
};

type WorkbenchRecentRun = {
  run_id: string;
  status: string;
  created_at: string | null;
  result_summary: string | null;
  pack_id?: string | null;
  execution_target_selected?: string | null;
  usage_provider?: string | null;
  usage_model?: string | null;
  agent_role?: string | null;
};

type WorkbenchControlDeckProps = {
  isMobile: boolean;
  isNarrow: boolean;
  mode: WorkbenchDeckMode;
  onModeChange: (mode: WorkbenchDeckMode) => void;
  chatMode: WorkbenchChatMode;
  singleAgentMode?: boolean;
  selectedAgentRole: AgentRoleOption['id'];
  agentRoleOptions: AgentRoleOption[];
  status: string;
  runId: string | null;
  selectedRun: WorkbenchRecentRun | null;
  latestRunId: string | null;
  latestRunSummary: string | null;
  pendingApprovals: number;
  inspectLogs: LogEntry[];
  inspectStreamState: WorkbenchInspectStreamState;
  onOpenRunInspect: (runId: string) => void;
  selectedAgentChannels: Array<{
    channel?: string;
    identity_label?: string | null;
    label?: string | null;
    status?: string | null;
  }>;
  selectedAgentChannelsLoading: boolean;
  selectedPackId: string;
  onPackChange: (packId: string) => void;
  packOptions: OutcomePack[];
  connectorCredentials: ConnectorCredentialItem[];
  runtimeApiKey: string;
  packPrimaryInput: string;
  onPackPrimaryInputChange: (value: string) => void;
  packSecondaryInput: string;
  onPackSecondaryInputChange: (value: string) => void;
  packTertiaryInput: string;
  onPackTertiaryInputChange: (value: string) => void;
  selectedPresetId: string;
  presetOptions: BusinessPreset[];
  onApplyPreset: (presetId: string) => void;
  localExecutionDraft: LocalExecutionDraft;
  onLocalExecutionDraftChange: (updater: (prev: LocalExecutionDraft) => LocalExecutionDraft) => void;
};

export function WorkbenchControlDeck({
  isMobile,
  isNarrow,
  mode,
  onModeChange,
  chatMode,
  singleAgentMode = false,
  selectedAgentRole,
  agentRoleOptions,
  status,
  runId,
  selectedRun,
  latestRunId,
  latestRunSummary,
  pendingApprovals,
  inspectLogs,
  inspectStreamState,
  onOpenRunInspect,
  selectedAgentChannels,
  selectedAgentChannelsLoading,
  selectedPackId,
  onPackChange,
  packOptions,
  connectorCredentials,
  runtimeApiKey,
  packPrimaryInput,
  onPackPrimaryInputChange,
  packSecondaryInput,
  onPackSecondaryInputChange,
  packTertiaryInput,
  onPackTertiaryInputChange,
  selectedPresetId,
  presetOptions,
  onApplyPreset,
  localExecutionDraft,
  onLocalExecutionDraftChange,
}: WorkbenchControlDeckProps) {
  const screenshotPathPattern = /\.(png|jpg|jpeg|webp)$/i;
  const clampLocalExecutionIndex = (index: number, operations: LocalExecutionOperationDraft[]): number => {
    if (operations.length === 0) return 0;
    if (index < 0) return 0;
    if (index >= operations.length) return operations.length - 1;
    return index;
  };
  const normalizeOperationForTool = (
    operation: LocalExecutionOperationDraft,
    tool: LocalExecutionOperationDraft['tool'],
  ): LocalExecutionOperationDraft => {
    if (tool === 'execute_shell_command') {
      return {
        ...operation,
        tool,
        path: '',
        content: '',
      };
    }
    if (tool === 'browser_automation') {
      return {
        ...operation,
        tool,
        command: '',
        cwd: '',
        content: '',
        fileMode: 'read',
        path:
          operation.browserMode === 'capture_page'
            ? operation.path.trim() && /\.(png|jpg|jpeg)$/i.test(operation.path.trim())
              ? operation.path
              : ''
            : operation.path.trim() && /\.(html?|json|txt)$/i.test(operation.path.trim())
            ? operation.path
            : '',
      };
    }
    if (tool === 'capture_screenshot') {
      return {
        ...operation,
        tool,
        command: '',
        cwd: '',
        content: '',
        path: operation.path.trim() && screenshotPathPattern.test(operation.path.trim()) ? operation.path : '',
      };
    }
    return {
      ...operation,
      tool,
      command: '',
      cwd: '',
      path: operation.path.trim(),
    };
  };
  const summarizeLocalExecutionOperation = (operation: LocalExecutionOperationDraft, index: number): string => {
    if (operation.tool === 'execute_shell_command') {
      return operation.command.trim() || `Shell command ${index + 1}`;
    }
    if (operation.tool === 'browser_automation') {
      const url = operation.url.trim();
      if (operation.browserMode === 'capture_page') return url || `Page capture ${index + 1}`;
      if (operation.browserMode === 'extract_links') return url || `Link extraction ${index + 1}`;
      if (operation.browserMode === 'save_html') return url || `Save HTML ${index + 1}`;
      return url || `Text extraction ${index + 1}`;
    }
    if (operation.tool === 'capture_screenshot') {
      return operation.path.trim() || `Screenshot ${index + 1}`;
    }
    const path = operation.path.trim();
    if (operation.fileMode === 'read') return path ? `Read ${path}` : `Read file ${index + 1}`;
    if (operation.fileMode === 'append') return path ? `Append ${path}` : `Append file ${index + 1}`;
    return path ? `Write ${path}` : `Write file ${index + 1}`;
  };
  const inspectTargetRunId = selectedRun?.run_id || runId || latestRunId;
  const modeItems: Array<{ id: WorkbenchDeckMode; label: string }> = [
    { id: 'context', label: 'Context' },
    { id: 'control', label: 'Automation' },
    { id: 'inspect', label: 'Inspect' },
  ];
  const streamColor =
    inspectStreamState === 'live'
      ? UI.success
      : inspectStreamState === 'reconnecting'
      ? UI.warning
      : inspectStreamState === 'closed'
      ? UI.textMuted
      : UI.textMuted;
  const streamLabel =
    inspectStreamState === 'live'
      ? 'live'
      : inspectStreamState === 'reconnecting'
      ? 'reconnecting'
      : inspectStreamState === 'closed'
      ? 'closed'
      : 'idle';
  const inspectFeed = inspectLogs.slice(-10).reverse();
  const selectedAgent = agentRoleOptions.find((option) => option.id === selectedAgentRole) || agentRoleOptions[0];
  const selectedPack = packOptions.find((option) => option.id === selectedPackId) || packOptions[0];
  const isLocalExecutionPack = selectedPack.id === 'local-execution-v1';
  const supportsOneDrivePaths = selectedPack.id === 'spreadsheet-ops-v1' || selectedPack.id === 'document-studio-v1';
  const microsoftConnector = useMemo(
    () => connectorCredentials.find((item) => item.connector === 'microsoft_365') || null,
    [connectorCredentials],
  );
  const [driveBrowser, setDriveBrowser] = useState<{
    open: boolean;
    loading: boolean;
    path: string;
    items: OneDriveBrowserItem[];
    error: string;
  }>({
    open: false,
    loading: false,
    path: 'onedrive:/',
    items: [],
    error: '',
  });
  const localExecutionOperations = Array.isArray(localExecutionDraft.operations) ? localExecutionDraft.operations : [];
  const activeLocalExecutionIndex = clampLocalExecutionIndex(localExecutionDraft.activeOperationIndex, localExecutionOperations);
  const activeLocalExecutionOperation = localExecutionOperations[activeLocalExecutionIndex] || DEFAULT_LOCAL_EXECUTION_OPERATION;
  const inspectAgentLabel = (() => {
    if (selectedRun?.agent_role) {
      const base =
        agentRoleOptions.find((option) => option.id === selectedRun.agent_role)?.label ||
        selectedRun.agent_role
          .split('-')
          .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
          .join(' ');
      if (singleAgentMode && selectedRun.agent_role === 'orchestrator') return 'Assistant';
      return base;
    }
    return singleAgentMode ? 'Assistant' : selectedAgent?.label || 'Orchestrator';
  })();
  const controlDeckLabel = singleAgentMode ? 'Assistant' : selectedAgent?.label || 'Orchestrator';
  const ownerLabel = singleAgentMode ? 'Assistant' : chatMode === 'orchestrate' ? 'Orchestrator' : selectedAgent.label;
  const ownerDescription = singleAgentMode
    ? 'Handles planning, local tools, and approvals end to end.'
    : chatMode === 'orchestrate'
      ? 'Coordinates execution paths and keeps related work linked to the parent run.'
      : selectedAgent.description;
  const inspectSummary = selectedRun?.result_summary || latestRunSummary;
  const inputLabels = selectedPack.inputLabels;
  const inputPlaceholders = selectedPack.inputPlaceholders;
  const packInputSupportNote =
    selectedPack.id === 'spreadsheet-ops-v1'
      ? 'Use a local CSV/XLSX path or a OneDrive path. Example: onedrive:/Sales/customers.xlsx'
      : selectedPack.id === 'document-studio-v1'
      ? 'Use a local .docx/.pptx path or a OneDrive path. Example: onedrive:/Decks/q2-update.pptx'
      : 'Use the pack-specific fields below to shape the run instead of burying everything in one prompt.';
  const buildDriveHeaders = () => {
    const headers = new Headers();
    if (runtimeApiKey) headers.set('X-API-Key', runtimeApiKey);
    return headers;
  };
  const handleBrowseMicrosoftDrive = async (nextPath = '') => {
    if (!microsoftConnector) return;
    const targetPath = nextPath || 'onedrive:/';
    setDriveBrowser((current) => ({
      ...current,
      open: true,
      loading: true,
      path: targetPath,
      error: '',
    }));
    try {
      const url = new URL(`${ORION_API_URL}/connectors/vault/${encodeURIComponent(microsoftConnector.id)}/microsoft-drive`);
      url.searchParams.set('workspace_id', 'default');
      if (targetPath !== 'onedrive:/') url.searchParams.set('path', targetPath);
      const res = await fetch(url.toString(), { headers: buildDriveHeaders() });
      const raw = await res.text().catch(() => '');
      const body = raw ? JSON.parse(raw) : {};
      if (!res.ok) throw new Error(String(body?.detail || body?.message || 'Failed to browse OneDrive.'));
      setDriveBrowser({
        open: true,
        loading: false,
        path: typeof body?.path === 'string' ? body.path : targetPath,
        items: Array.isArray(body?.items) ? (body.items as OneDriveBrowserItem[]) : [],
        error: '',
      });
    } catch (error) {
      setDriveBrowser((current) => ({
        ...current,
        open: true,
        loading: false,
        path: targetPath,
        error: error instanceof Error ? error.message : 'Failed to browse OneDrive.',
      }));
    }
  };
  const goToParentDrivePath = () => {
    const current = String(driveBrowser.path || 'onedrive:/');
    const normalized = current.replace(/^onedrive:\//, '').replace(/\/$/, '');
    const parts = normalized ? normalized.split('/').filter(Boolean) : [];
    parts.pop();
    const parent = parts.length ? `onedrive:/${parts.join('/')}` : 'onedrive:/';
    void handleBrowseMicrosoftDrive(parent);
  };
  const deckTabRowStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: 2,
    width: '100%',
    padding: '0 0 8px',
    borderBottom: `1px solid ${UI.borderSoft}`,
    overflowX: 'auto' as const,
    scrollbarWidth: 'none' as const,
  };
  const deckTabStyle = (active: boolean) => ({
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 34,
    padding: '0 13px',
    border: 0,
    borderBottom: active ? `2px solid ${UI.accent}` : '2px solid transparent',
    borderRadius: 0,
    background: 'transparent',
    color: active ? UI.textSoft : UI.textMuted,
    fontSize: 12.5,
    fontWeight: 750,
    cursor: 'pointer',
    whiteSpace: 'nowrap' as const,
    userSelect: 'none' as const,
  });

  return (
    <aside
      style={{
        borderRadius: 14,
        border: `1px solid ${UI.borderSoft}`,
        background: `linear-gradient(180deg, color-mix(in srgb, ${UI.surfaceAlt} 54%, ${UI.surface} 46%) 0%, ${UI.surface} 100%)`,
        padding: isMobile ? 14 : 16,
        display: 'grid',
        gap: 14,
        alignSelf: 'start',
        minWidth: 0,
        gridColumn: isNarrow && !isMobile ? '1 / -1' : 'auto',
        boxShadow: 'inset 0 1px 0 color-mix(in srgb, var(--text-primary) 4%, transparent)',
      }}
    >
      <div style={{ display: 'grid', gap: 6, paddingBottom: 12, borderBottom: `1px solid ${UI.borderSoft}` }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: UI.textSoft }}>Control deck</div>
        <div style={{ fontSize: 12.5, color: UI.textMuted, lineHeight: 1.45 }}>
          {singleAgentMode ? 'Working with' : chatMode === 'orchestrate' ? 'Working with' : 'Direct chat with'} {controlDeckLabel}
          {mode === 'inspect' && inspectTargetRunId ? ` · inspecting ${inspectTargetRunId.slice(0, 8)}` : ''}
        </div>
      </div>

      <div style={deckTabRowStyle}>
        {modeItems.map((item) => {
          const active = mode === item.id;
          return (
            <div
              key={item.id}
              role="tab"
              aria-selected={active}
              tabIndex={active ? 0 : -1}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onModeChange(item.id)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onModeChange(item.id);
                }
              }}
              style={deckTabStyle(active)}
            >
              {item.label}
            </div>
          );
        })}
      </div>

      <section style={{ display: mode === 'context' ? 'grid' : 'none', gap: 10 }}>
        <div style={{ display: 'grid', gap: 4 }}>
          <div style={{ fontSize: 11, color: UI.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>
            Selected owner
          </div>
          <div style={{ fontSize: 14, color: UI.textSoft, fontWeight: 700 }}>
            {ownerLabel}
          </div>
          <div style={{ fontSize: 12, color: UI.textMuted, lineHeight: 1.45 }}>
            {ownerDescription}
          </div>
        </div>

        <div style={{ display: 'grid', gap: 6 }}>
          <div style={{ fontSize: 11, color: UI.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>
            Channels
          </div>
          {selectedAgentChannelsLoading ? (
            <div style={{ fontSize: 12, color: UI.textMuted }}>Loading channels...</div>
          ) : selectedAgentChannels.length > 0 ? (
            <div style={{ display: 'grid', gap: 6 }}>
              {selectedAgentChannels.slice(0, 4).map((binding, index) => (
                <div
                  key={`${binding.channel || 'channel'}:${binding.identity_label || binding.label || index}`}
                  style={{
                    display: 'grid',
                    gap: 3,
                    minWidth: 0,
                    padding: '10px 12px',
                    borderRadius: 10,
                    border: `1px solid ${UI.borderSoft}`,
                    background: UI.surfaceAlt,
                  }}
                >
                  <div style={{ fontSize: 12.5, color: UI.textSoft, fontWeight: 700 }}>
                    {binding.label || binding.channel || 'Channel'}
                  </div>
                  <div
                    style={{
                      fontSize: 11.5,
                      color: UI.textMuted,
                      lineHeight: 1.45,
                      wordBreak: 'break-word',
                      overflowWrap: 'anywhere',
                    }}
                  >
                    {binding.identity_label || 'Shared workspace routing'}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 12, color: UI.textMuted }}>No dedicated channels assigned yet.</div>
          )}
        </div>

        <div style={{ display: 'grid', gap: 6 }}>
          <div style={{ fontSize: 11, color: UI.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>
            Current run
          </div>
          <div
            style={{
              display: 'grid',
              gap: 5,
              minWidth: 0,
              padding: '10px 12px',
              borderRadius: 10,
              border: `1px solid ${UI.borderSoft}`,
              background: UI.surfaceAlt,
            }}
          >
            <div style={{ fontSize: 12.5, color: UI.textSoft, fontWeight: 700 }}>
              {selectedRun?.status || status || 'idle'}
            </div>
            <div
              style={{
                fontSize: 12,
                color: UI.textMuted,
                lineHeight: 1.45,
                wordBreak: 'break-word',
                overflowWrap: 'anywhere',
              }}
            >
              {inspectSummary || latestRunSummary || 'No active or recent run selected.'}
            </div>
            {inspectTargetRunId ? (
              <button
                onClick={() => onOpenRunInspect(inspectTargetRunId)}
                className="orion-btn orion-btn-ghost"
                style={{ minHeight: 30, width: 'fit-content', padding: '0 10px', fontSize: 11.5 }}
              >
                Open inspect
              </button>
            ) : null}
          </div>
        </div>

        {pendingApprovals > 0 ? (
          <div style={{ display: 'grid', gap: 4 }}>
            <div style={{ fontSize: 11, color: UI.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>
              Attention
            </div>
            <div style={{ fontSize: 12.5, color: UI.warningFg, fontWeight: 700 }}>
              {pendingApprovals} approval{pendingApprovals === 1 ? '' : 's'} waiting
            </div>
          </div>
        ) : null}
      </section>

      <section style={{ display: mode === 'control' ? 'grid' : 'none', gap: 6 }}>
        <div style={{ fontSize: 11, color: UI.textMuted }}>Automation</div>
        <select
          value={selectedPackId}
          onChange={(e) => onPackChange(e.target.value)}
          style={{
            borderRadius: 8,
            border: `1px solid ${UI.border}`,
            background: UI.surfaceAlt,
            color: UI.textSoft,
            padding: '7px 8px',
            fontSize: 12,
          }}
        >
          {packOptions.map((pack) => (
            <option key={pack.id} value={pack.id}>
              {pack.label}
            </option>
          ))}
        </select>
        {isLocalExecutionPack ? (
          <div
            style={{
              display: 'grid',
              gap: 8,
              borderTop: `1px solid ${UI.borderSoft}`,
              paddingTop: 8,
            }}
          >
            <div style={{ display: 'grid', gap: 3 }}>
              <div style={{ fontSize: 11, color: UI.textMuted }}>Runs on</div>
              <div style={{ fontSize: 12, color: UI.textSoft }}>Local Companion only</div>
              <div style={{ fontSize: 11, color: UI.textMuted, lineHeight: 1.4 }}>
                Uses the local worker and may pause for approval before shell or file actions.
              </div>
            </div>
            <div
              style={{
                display: 'grid',
                gap: 4,
                padding: '8px 10px',
                borderRadius: 8,
                border: `1px solid ${UI.accentBorder}`,
                background: UI.accentSoft,
              }}
            >
              <div style={{ fontSize: 11, color: UI.textMuted }}>Run owner</div>
              <div style={{ fontSize: 12.5, color: UI.textSoft, fontWeight: 700 }}>{selectedAgent.label}</div>
              <div style={{ fontSize: 11, color: UI.textMuted, lineHeight: 1.4 }}>
                This local plan will run under the selected agent and show up in that agent&apos;s history, artifacts, and chat context.
              </div>
            </div>
            <div style={{ display: 'grid', gap: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <div style={{ fontSize: 11, color: UI.textMuted }}>Plan steps</div>
                <button
                  className="orion-btn orion-btn-ghost"
                  style={{ minHeight: 28, paddingInline: 10, fontSize: 11 }}
                  onClick={() =>
                    onLocalExecutionDraftChange((prev) => {
                      const operations = [...prev.operations, { ...DEFAULT_LOCAL_EXECUTION_OPERATION }];
                      return {
                        ...prev,
                        operations,
                        activeOperationIndex: operations.length - 1,
                      };
                    })
                  }
                  disabled={localExecutionOperations.length >= 12}
                >
                  Add step
                </button>
              </div>
              <div style={{ display: 'grid', gap: 6 }}>
                {localExecutionOperations.map((operation, index) => {
                  const isActive = index === activeLocalExecutionIndex;
                  return (
                    <div
                      key={`local-op-${index}`}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr auto',
                        gap: 8,
                        alignItems: 'center',
                        padding: '8px 10px',
                        borderRadius: 10,
                        border: `1px solid ${isActive ? UI.accentBorder : UI.borderSoft}`,
                        background: isActive ? UI.accentSoft : UI.surfaceAlt,
                      }}
                    >
                      <div
                        onClick={() =>
                          onLocalExecutionDraftChange((prev) => ({
                            ...prev,
                            activeOperationIndex: index,
                          }))
                        }
                        style={{ cursor: 'pointer', display: 'grid', gap: 3, minWidth: 0 }}
                      >
                        <div style={{ fontSize: 11, color: isActive ? UI.textSoft : UI.textMuted, fontWeight: 700 }}>
                          Step {index + 1} · {operation.tool === 'read_write_files'
                            ? `${operation.fileMode} file`
                            : operation.tool === 'capture_screenshot'
                            ? 'screenshot'
                            : operation.tool === 'browser_automation'
                            ? `browser ${operation.browserMode.replace('_', ' ')}`
                            : 'shell'}
                        </div>
                        <div
                          style={{
                            fontSize: 12,
                            color: UI.textSoft,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                          title={summarizeLocalExecutionOperation(operation, index)}
                        >
                          {summarizeLocalExecutionOperation(operation, index)}
                        </div>
                      </div>
                      <div style={{ display: 'inline-flex', gap: 4 }}>
                        <button
                          className="orion-btn orion-btn-ghost"
                          style={{ minHeight: 28, paddingInline: 8, fontSize: 11 }}
                          onClick={() =>
                            onLocalExecutionDraftChange((prev) => {
                              if (index === 0) return prev;
                              const operations = [...prev.operations];
                              [operations[index - 1], operations[index]] = [operations[index], operations[index - 1]];
                              return {
                                ...prev,
                                operations,
                                activeOperationIndex:
                                  prev.activeOperationIndex === index
                                    ? index - 1
                                    : prev.activeOperationIndex === index - 1
                                    ? index
                                    : prev.activeOperationIndex,
                              };
                            })
                          }
                          disabled={index === 0}
                        >
                          Up
                        </button>
                        <button
                          className="orion-btn orion-btn-ghost"
                          style={{ minHeight: 28, paddingInline: 8, fontSize: 11 }}
                          onClick={() =>
                            onLocalExecutionDraftChange((prev) => {
                              if (index >= prev.operations.length - 1) return prev;
                              const operations = [...prev.operations];
                              [operations[index], operations[index + 1]] = [operations[index + 1], operations[index]];
                              return {
                                ...prev,
                                operations,
                                activeOperationIndex:
                                  prev.activeOperationIndex === index
                                    ? index + 1
                                    : prev.activeOperationIndex === index + 1
                                    ? index
                                    : prev.activeOperationIndex,
                              };
                            })
                          }
                          disabled={index >= localExecutionOperations.length - 1}
                        >
                          Down
                        </button>
                        <button
                          className="orion-btn orion-btn-ghost"
                          style={{ minHeight: 28, paddingInline: 8, fontSize: 11, color: UI.error }}
                          onClick={() =>
                            onLocalExecutionDraftChange((prev) => {
                              if (prev.operations.length <= 1) {
                                return {
                                  ...prev,
                                  operations: [{ ...DEFAULT_LOCAL_EXECUTION_OPERATION }],
                                  activeOperationIndex: 0,
                                };
                              }
                              const operations = prev.operations.filter((_, opIndex) => opIndex !== index);
                              return {
                                ...prev,
                                operations,
                                activeOperationIndex: clampLocalExecutionIndex(prev.activeOperationIndex > index ? prev.activeOperationIndex - 1 : prev.activeOperationIndex, operations),
                              };
                            })
                          }
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div style={{ display: 'grid', gap: 4 }}>
              <div style={{ fontSize: 11, color: UI.textMuted }}>Tool</div>
              <select
                value={activeLocalExecutionOperation.tool}
                onChange={(e) =>
                  onLocalExecutionDraftChange((prev) => {
                    const operations = [...prev.operations];
                    operations[activeLocalExecutionIndex] = normalizeOperationForTool(
                      operations[activeLocalExecutionIndex],
                      e.target.value as LocalExecutionOperationDraft['tool'],
                    );
                    return {
                      ...prev,
                      operations,
                    };
                  })
                }
                style={{
                  borderRadius: 8,
                  border: `1px solid ${UI.border}`,
                  background: UI.surfaceAlt,
                  color: UI.textSoft,
                  padding: '7px 8px',
                  fontSize: 12,
                }}
              >
                <option value="read_write_files">File operation</option>
                <option value="browser_automation">Browser page task</option>
                <option value="capture_screenshot">Capture screenshot</option>
                <option value="execute_shell_command">Shell command</option>
              </select>
            </div>

            {activeLocalExecutionOperation.tool === 'read_write_files' ? (
              <>
                <div style={{ display: 'grid', gap: 4 }}>
                  <div style={{ fontSize: 11, color: UI.textMuted }}>Mode</div>
                  <select
                    value={activeLocalExecutionOperation.fileMode}
                    onChange={(e) =>
                      onLocalExecutionDraftChange((prev) => {
                        const operations = [...prev.operations];
                        operations[activeLocalExecutionIndex] = {
                          ...operations[activeLocalExecutionIndex],
                          fileMode: e.target.value as LocalExecutionOperationDraft['fileMode'],
                        };
                        return {
                          ...prev,
                          operations,
                        };
                      })
                    }
                    style={{
                      borderRadius: 8,
                      border: `1px solid ${UI.border}`,
                      background: UI.surfaceAlt,
                      color: UI.textSoft,
                      padding: '7px 8px',
                      fontSize: 12,
                    }}
                  >
                    <option value="read">Read</option>
                    <option value="write">Write</option>
                    <option value="append">Append</option>
                  </select>
                </div>
                <div style={{ display: 'grid', gap: 4 }}>
                  <div style={{ fontSize: 11, color: UI.textMuted }}>Path</div>
                  <input
                    value={activeLocalExecutionOperation.path}
                    onChange={(e) =>
                      onLocalExecutionDraftChange((prev) => {
                        const operations = [...prev.operations];
                        operations[activeLocalExecutionIndex] = {
                          ...operations[activeLocalExecutionIndex],
                          path: e.target.value,
                        };
                        return {
                          ...prev,
                          operations,
                        };
                      })
                    }
                    placeholder="server.py or docs/notes.md"
                    className="input"
                    style={{ minHeight: 34, fontSize: 12 }}
                  />
                </div>
                {activeLocalExecutionOperation.fileMode !== 'read' ? (
                  <div style={{ display: 'grid', gap: 4 }}>
                    <div style={{ fontSize: 11, color: UI.textMuted }}>Content</div>
                    <textarea
                      value={activeLocalExecutionOperation.content}
                      onChange={(e) =>
                        onLocalExecutionDraftChange((prev) => {
                          const operations = [...prev.operations];
                          operations[activeLocalExecutionIndex] = {
                            ...operations[activeLocalExecutionIndex],
                            content: e.target.value,
                          };
                          return {
                            ...prev,
                            operations,
                          };
                        })
                      }
                      placeholder="Text content to write into the file"
                      rows={5}
                      style={{
                        width: '100%',
                        borderRadius: 9,
                        border: `1px solid ${UI.border}`,
                        background: UI.surfaceAlt,
                        color: UI.text,
                        padding: 9,
                        resize: 'vertical',
                        fontSize: 12,
                        lineHeight: 1.45,
                      }}
                    />
                  </div>
                ) : null}
              </>
            ) : null}

            {activeLocalExecutionOperation.tool === 'browser_automation' ? (
              <>
                <div style={{ display: 'grid', gap: 4 }}>
                  <div style={{ fontSize: 11, color: UI.textMuted }}>Mode</div>
                  <select
                    value={activeLocalExecutionOperation.browserMode}
                    onChange={(e) =>
                      onLocalExecutionDraftChange((prev) => {
                        const operations = [...prev.operations];
                        const nextMode = e.target.value as LocalExecutionOperationDraft['browserMode'];
                        const currentPath = operations[activeLocalExecutionIndex].path;
                        const normalizedPath =
                          nextMode === 'capture_page'
                            ? currentPath.trim() && /\.(png|jpg|jpeg)$/i.test(currentPath.trim())
                              ? currentPath
                              : ''
                            : currentPath.trim() && /\.(html?|json|txt)$/i.test(currentPath.trim())
                            ? currentPath
                            : '';
                        operations[activeLocalExecutionIndex] = {
                          ...operations[activeLocalExecutionIndex],
                          browserMode: nextMode,
                          path: normalizedPath,
                        };
                        return {
                          ...prev,
                          operations,
                        };
                      })
                    }
                    style={{
                      borderRadius: 8,
                      border: `1px solid ${UI.border}`,
                      background: UI.surfaceAlt,
                      color: UI.textSoft,
                      padding: '7px 8px',
                      fontSize: 12,
                    }}
                  >
                    <option value="extract_text">Extract text</option>
                    <option value="extract_links">Extract links</option>
                    <option value="save_html">Save HTML</option>
                    <option value="capture_page">Capture page</option>
                  </select>
                </div>
                <div style={{ display: 'grid', gap: 4 }}>
                  <div style={{ fontSize: 11, color: UI.textMuted }}>URL</div>
                  <input
                    value={activeLocalExecutionOperation.url}
                    onChange={(e) =>
                      onLocalExecutionDraftChange((prev) => {
                        const operations = [...prev.operations];
                        operations[activeLocalExecutionIndex] = {
                          ...operations[activeLocalExecutionIndex],
                          url: e.target.value,
                        };
                        return {
                          ...prev,
                          operations,
                        };
                      })
                    }
                    placeholder="https://example.com"
                    className="input"
                    style={{ minHeight: 34, fontSize: 12 }}
                  />
                </div>
                {activeLocalExecutionOperation.browserMode === 'capture_page' ? (
                  <div style={{ display: 'grid', gap: 4 }}>
                    <div style={{ fontSize: 11, color: UI.textMuted }}>Session profile (optional)</div>
                    <input
                      value={activeLocalExecutionOperation.browserSessionProfile}
                      onChange={(e) =>
                        onLocalExecutionDraftChange((prev) => {
                          const operations = [...prev.operations];
                          operations[activeLocalExecutionIndex] = {
                            ...operations[activeLocalExecutionIndex],
                            browserSessionProfile: e.target.value,
                          };
                          return {
                            ...prev,
                            operations,
                          };
                        })
                      }
                      placeholder="marketing-login"
                      className="input"
                      style={{ minHeight: 34, fontSize: 12 }}
                    />
                  </div>
                ) : null}
                <div style={{ display: 'grid', gap: 4 }}>
                  <div style={{ fontSize: 11, color: UI.textMuted }}>Save path (optional)</div>
                  <input
                    value={activeLocalExecutionOperation.path}
                    onChange={(e) =>
                      onLocalExecutionDraftChange((prev) => {
                        const operations = [...prev.operations];
                        operations[activeLocalExecutionIndex] = {
                          ...operations[activeLocalExecutionIndex],
                          path: e.target.value,
                        };
                        return {
                          ...prev,
                          operations,
                        };
                      })
                    }
                    placeholder={
                      activeLocalExecutionOperation.browserMode === 'capture_page'
                        ? 'Leave blank to save a page screenshot under .orion-artifacts/local-execution/browser'
                        : 'Leave blank to save under .orion-artifacts/local-execution/browser'
                    }
                    className="input"
                    style={{ minHeight: 34, fontSize: 12 }}
                  />
                </div>
                <div style={{ display: 'grid', gap: 4 }}>
                  <div style={{ fontSize: 11, color: UI.textMuted }}>Wait for selector (optional)</div>
                  <input
                    value={activeLocalExecutionOperation.waitForSelector}
                    onChange={(e) =>
                      onLocalExecutionDraftChange((prev) => {
                        const operations = [...prev.operations];
                        operations[activeLocalExecutionIndex] = {
                          ...operations[activeLocalExecutionIndex],
                          waitForSelector: e.target.value,
                        };
                        return {
                          ...prev,
                          operations,
                        };
                      })
                    }
                    placeholder=".app-ready"
                    className="input"
                    style={{ minHeight: 34, fontSize: 12 }}
                  />
                </div>
                <div style={{ display: 'grid', gap: 4 }}>
                  <div style={{ fontSize: 11, color: UI.textMuted }}>Type into selector (optional)</div>
                  <input
                    value={activeLocalExecutionOperation.typeSelector}
                    onChange={(e) =>
                      onLocalExecutionDraftChange((prev) => {
                        const operations = [...prev.operations];
                        operations[activeLocalExecutionIndex] = {
                          ...operations[activeLocalExecutionIndex],
                          typeSelector: e.target.value,
                        };
                        return {
                          ...prev,
                          operations,
                        };
                      })
                    }
                    placeholder="input[type='search']"
                    className="input"
                    style={{ minHeight: 34, fontSize: 12 }}
                  />
                </div>
                <div style={{ display: 'grid', gap: 4 }}>
                  <div style={{ fontSize: 11, color: UI.textMuted }}>Text to type (optional)</div>
                  <input
                    value={activeLocalExecutionOperation.typeText}
                    onChange={(e) =>
                      onLocalExecutionDraftChange((prev) => {
                        const operations = [...prev.operations];
                        operations[activeLocalExecutionIndex] = {
                          ...operations[activeLocalExecutionIndex],
                          typeText: e.target.value,
                        };
                        return {
                          ...prev,
                          operations,
                        };
                      })
                    }
                    placeholder="Empyralis"
                    className="input"
                    style={{ minHeight: 34, fontSize: 12 }}
                  />
                </div>
                <div style={{ display: 'grid', gap: 4 }}>
                  <div style={{ fontSize: 11, color: UI.textMuted }}>Click selector (optional)</div>
                  <input
                    value={activeLocalExecutionOperation.clickSelector}
                    onChange={(e) =>
                      onLocalExecutionDraftChange((prev) => {
                        const operations = [...prev.operations];
                        operations[activeLocalExecutionIndex] = {
                          ...operations[activeLocalExecutionIndex],
                          clickSelector: e.target.value,
                        };
                        return {
                          ...prev,
                          operations,
                        };
                      })
                    }
                    placeholder="button[type='submit']"
                    className="input"
                    style={{ minHeight: 34, fontSize: 12 }}
                  />
                </div>
                {activeLocalExecutionOperation.browserMode === 'capture_page' ? (
                  <div style={{ display: 'grid', gap: 4 }}>
                    <div style={{ fontSize: 11, color: UI.textMuted }}>Advanced script JSON (optional)</div>
                    <textarea
                      value={activeLocalExecutionOperation.browserActionScript}
                      onChange={(e) =>
                        onLocalExecutionDraftChange((prev) => {
                          const operations = [...prev.operations];
                          operations[activeLocalExecutionIndex] = {
                            ...operations[activeLocalExecutionIndex],
                            browserActionScript: e.target.value,
                          };
                          return {
                            ...prev,
                            operations,
                          };
                        })
                      }
                      placeholder={`[\n  {"action":"wait","selector":"#ready"},\n  {"action":"type","selector":"#search","text":"Empyralis"},\n  {"action":"click","selector":"#go"},\n  {"action":"open_popup","selector":"#popup-link","tab":"popup"},\n  {"action":"extract","tab":"popup","selector":"#popup-copy"}\n]`}
                      rows={5}
                      style={{
                        width: '100%',
                        borderRadius: 9,
                        border: `1px solid ${UI.border}`,
                        background: UI.surfaceAlt,
                        color: UI.text,
                        padding: 9,
                        resize: 'vertical',
                        fontSize: 12,
                        lineHeight: 1.45,
                      }}
                    />
                  </div>
                ) : null}
                <div style={{ display: 'grid', gap: 4, fontSize: 11, lineHeight: 1.45 }}>
                  <div style={{ color: UI.textMuted }}>
                    {activeLocalExecutionOperation.browserMode === 'capture_page'
                      ? 'Browser capture uses the local Electron browser to load the page and save a real screenshot artifact.'
                      : 'Browser automation fetches public pages through the local companion and stores HTML or extraction reports as artifacts.'}
                  </div>
                  {activeLocalExecutionOperation.browserMode === 'capture_page' ? (
                    <div style={{ color: UI.warningFg }}>
                      Add a session profile to reuse site cookies and browser state across runs for the same site. Session-backed interactive browser runs require approval in guarded mode. Session-backed privileged actions like upload, download, and popup flows are treated as higher-trust browser work and also require approval. Use Advanced script JSON for ordered browser actions like wait, type, click, select, upload, extract, download, popup opening, and named tab actions. Add an optional <code>frame</code> selector for same-origin iframe targeting and <code>tab</code> for multi-page flows.
                    </div>
                  ) : (
                    <div style={{ color: UI.warningFg }}>
                      Session-backed browser state is only available on page capture right now.
                    </div>
                  )}
                </div>
              </>
            ) : null}

            {activeLocalExecutionOperation.tool === 'execute_shell_command' ? (
              <>
                <div style={{ display: 'grid', gap: 4 }}>
                  <div style={{ fontSize: 11, color: UI.textMuted }}>Command</div>
                  <input
                    value={activeLocalExecutionOperation.command}
                    onChange={(e) =>
                      onLocalExecutionDraftChange((prev) => {
                        const operations = [...prev.operations];
                        operations[activeLocalExecutionIndex] = {
                          ...operations[activeLocalExecutionIndex],
                          command: e.target.value,
                        };
                        return {
                          ...prev,
                          operations,
                        };
                      })
                    }
                    placeholder="pwd"
                    className="input"
                    style={{ minHeight: 34, fontSize: 12 }}
                  />
                </div>
                <div style={{ display: 'grid', gap: 4 }}>
                  <div style={{ fontSize: 11, color: UI.textMuted }}>Working directory</div>
                  <input
                    value={activeLocalExecutionOperation.cwd}
                    onChange={(e) =>
                      onLocalExecutionDraftChange((prev) => {
                        const operations = [...prev.operations];
                        operations[activeLocalExecutionIndex] = {
                          ...operations[activeLocalExecutionIndex],
                          cwd: e.target.value,
                        };
                        return {
                          ...prev,
                          operations,
                        };
                      })
                    }
                    placeholder="Optional, relative to the local root"
                    className="input"
                    style={{ minHeight: 34, fontSize: 12 }}
                  />
                </div>
                <div style={{ fontSize: 11, color: UI.warning, lineHeight: 1.4 }}>
                  Shell execution is allowlisted and can require approval before queueing.
                </div>
              </>
            ) : null}

            {activeLocalExecutionOperation.tool === 'capture_screenshot' ? (
              <>
                <div style={{ display: 'grid', gap: 4 }}>
                  <div style={{ fontSize: 11, color: UI.textMuted }}>Save path (.png)</div>
                  <input
                    value={activeLocalExecutionOperation.path}
                    onChange={(e) =>
                      onLocalExecutionDraftChange((prev) => {
                        const operations = [...prev.operations];
                        operations[activeLocalExecutionIndex] = {
                          ...operations[activeLocalExecutionIndex],
                          path: e.target.value,
                        };
                        return {
                          ...prev,
                          operations,
                        };
                      })
                    }
                    placeholder="Leave blank to save under .orion-artifacts/local-execution/screenshots"
                    className="input"
                    style={{ minHeight: 34, fontSize: 12 }}
                  />
                </div>
                <div style={{ display: 'grid', gap: 4, fontSize: 11, lineHeight: 1.45 }}>
                  <div style={{ color: UI.textMuted }}>
                    Captures the active local display session. It does not target the Empyralis panel or a specific app window yet.
                  </div>
                  <div style={{ color: UI.warningFg }}>
                    On macOS, enable Screen Recording for the app running Empyralis locally, usually Terminal or iTerm, then relaunch it.
                  </div>
                  <div style={{ color: UI.textMuted }}>
                    Use a `.png`, `.jpg`, or `.webp` path if you set one manually.
                  </div>
                </div>
              </>
            ) : null}

            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 11, color: UI.textMuted }}>
              <input
                type="checkbox"
                checked={localExecutionDraft.continueOnError}
                onChange={(e) =>
                  onLocalExecutionDraftChange((prev) => ({
                    ...prev,
                    continueOnError: e.target.checked,
                  }))
                }
              />
              Continue when later operations fail
            </label>
          </div>
        ) : (
          <>
            <div style={{ fontSize: 11, color: UI.textMuted }}>Starter</div>
            <select
              value={selectedPresetId}
              onChange={(e) => onApplyPreset(e.target.value)}
              style={{
                borderRadius: 8,
                border: `1px solid ${UI.border}`,
                background: UI.surfaceAlt,
                color: UI.textSoft,
                padding: '7px 8px',
                fontSize: 12,
              }}
            >
              {presetOptions.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.label}
                </option>
              ))}
            </select>

            <div
              style={{
                display: 'grid',
                gap: 8,
                borderTop: `1px solid ${UI.borderSoft}`,
                paddingTop: 10,
              }}
            >
              <div style={{ display: 'grid', gap: 3 }}>
                <div style={{ fontSize: 11, color: UI.textMuted }}>Pack inputs</div>
                <div style={{ fontSize: 11.5, color: UI.textMuted, lineHeight: 1.45 }}>
                  {packInputSupportNote}
                </div>
              </div>

              <div style={{ display: 'grid', gap: 4 }}>
                <div style={{ fontSize: 11, color: UI.textMuted }}>{inputLabels.primary}</div>
                <textarea
                  value={packPrimaryInput}
                  onChange={(e) => onPackPrimaryInputChange(e.target.value)}
                  placeholder={inputPlaceholders.primary}
                  rows={3}
                  style={{
                    width: '100%',
                    borderRadius: 9,
                    border: `1px solid ${UI.border}`,
                    background: UI.surfaceAlt,
                    color: UI.text,
                    padding: 9,
                    resize: 'vertical',
                    fontSize: 12,
                    lineHeight: 1.45,
                  }}
                />
              </div>

              {supportsOneDrivePaths ? (
                <div
                  style={{
                    display: 'grid',
                    gap: 8,
                    padding: '10px 12px',
                    borderRadius: 10,
                    border: `1px solid ${microsoftConnector ? UI.borderSoft : UI.warningBorder}`,
                    background: microsoftConnector ? UI.surfaceAlt : UI.warningBg,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <div style={{ display: 'grid', gap: 3 }}>
                      <div style={{ fontSize: 11, color: UI.textMuted }}>OneDrive path helper</div>
                      <div style={{ fontSize: 12.5, color: UI.textSoft, fontWeight: 700 }}>
                        {microsoftConnector ? `Connected through ${microsoftConnector.label}` : 'Microsoft 365 is not connected yet'}
                      </div>
                    </div>
                    {microsoftConnector ? (
                      <div style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
                        <button
                          className="orion-btn orion-btn-ghost"
                          style={{ minHeight: 28, paddingInline: 10, fontSize: 11 }}
                          onClick={() => {
                            if (driveBrowser.open) {
                              setDriveBrowser((current) => ({ ...current, open: false, error: '' }));
                              return;
                            }
                            void handleBrowseMicrosoftDrive(driveBrowser.path || 'onedrive:/');
                          }}
                        >
                          {driveBrowser.open ? 'Hide OneDrive' : 'Browse OneDrive'}
                        </button>
                        {driveBrowser.open ? (
                          <button
                            className="orion-btn orion-btn-ghost"
                            style={{ minHeight: 28, paddingInline: 10, fontSize: 11 }}
                            onClick={() => void handleBrowseMicrosoftDrive(driveBrowser.path || 'onedrive:/')}
                          >
                            Refresh
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                  <div style={{ fontSize: 11.5, color: microsoftConnector ? UI.textMuted : UI.warningFg, lineHeight: 1.45 }}>
                    {microsoftConnector
                      ? 'Pick a file or folder and insert its onedrive:/ path directly into the main document or spreadsheet input.'
                      : 'Connect Microsoft 365 in Integrations first if you want to browse OneDrive instead of typing paths manually.'}
                  </div>

                  {driveBrowser.open && microsoftConnector ? (
                    <div style={{ display: 'grid', gap: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <div style={{ display: 'grid', gap: 2 }}>
                          <div style={{ fontSize: 11, color: UI.textMuted }}>Current path</div>
                          <div style={{ fontSize: 12.5, color: UI.textSoft, fontWeight: 700 }}>{driveBrowser.path || 'onedrive:/'}</div>
                        </div>
                        {driveBrowser.path && driveBrowser.path !== 'onedrive:/' ? (
                          <button
                            className="orion-btn orion-btn-ghost"
                            style={{ minHeight: 28, paddingInline: 10, fontSize: 11 }}
                            onClick={goToParentDrivePath}
                          >
                            Up
                          </button>
                        ) : null}
                      </div>

                      {driveBrowser.error ? (
                        <div style={{ fontSize: 11.5, color: UI.error, lineHeight: 1.45 }}>{driveBrowser.error}</div>
                      ) : null}

                      <div
                        style={{
                          display: 'grid',
                          gap: 6,
                          maxHeight: 260,
                          overflowY: 'auto',
                          paddingRight: 2,
                        }}
                      >
                        {driveBrowser.loading ? (
                          <div style={{ fontSize: 12, color: UI.textMuted }}>Loading OneDrive…</div>
                        ) : driveBrowser.items.length > 0 ? (
                          driveBrowser.items.map((item, index) => {
                            const itemPath = typeof item.path === 'string' ? item.path : '';
                            const isFolder = item.kind === 'folder';
                            return (
                              <div
                                key={`${itemPath || item.name || 'item'}:${index}`}
                                style={{
                                  display: 'grid',
                                  gridTemplateColumns: 'minmax(0, 1fr) auto',
                                  gap: 8,
                                  alignItems: 'center',
                                  padding: '8px 10px',
                                  borderRadius: 10,
                                  border: `1px solid ${UI.borderSoft}`,
                                  background: UI.surface,
                                }}
                              >
                                <div style={{ minWidth: 0, display: 'grid', gap: 2 }}>
                                  <div style={{ fontSize: 12.5, color: UI.textSoft, fontWeight: 700 }}>
                                    {isFolder ? 'Folder' : 'File'} · {item.name || itemPath || 'Untitled'}
                                  </div>
                                  <div
                                    style={{
                                      fontSize: 11,
                                      color: UI.textMuted,
                                      lineHeight: 1.45,
                                      wordBreak: 'break-word',
                                      overflowWrap: 'anywhere',
                                    }}
                                  >
                                    {itemPath || 'onedrive:/'}
                                  </div>
                                </div>
                                <div style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                                  {isFolder ? (
                                    <button
                                      className="orion-btn orion-btn-ghost"
                                      style={{ minHeight: 28, paddingInline: 10, fontSize: 11 }}
                                      onClick={() => void handleBrowseMicrosoftDrive(itemPath)}
                                    >
                                      Open
                                    </button>
                                  ) : (
                                    <>
                                      <button
                                        className="orion-btn orion-btn-ghost"
                                        style={{ minHeight: 28, paddingInline: 10, fontSize: 11 }}
                                        onClick={() => onPackPrimaryInputChange(itemPath)}
                                      >
                                        Use path
                                      </button>
                                      <button
                                        className="orion-btn orion-btn-ghost"
                                        style={{ minHeight: 28, paddingInline: 10, fontSize: 11 }}
                                        onClick={() => {
                                          if (typeof navigator !== 'undefined' && navigator.clipboard) {
                                            void navigator.clipboard.writeText(itemPath);
                                          }
                                        }}
                                      >
                                        Copy
                                      </button>
                                    </>
                                  )}
                                </div>
                              </div>
                            );
                          })
                        ) : (
                          <div style={{ fontSize: 12, color: UI.textMuted }}>No files found in this folder.</div>
                        )}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div style={{ display: 'grid', gap: 4 }}>
                <div style={{ fontSize: 11, color: UI.textMuted }}>{inputLabels.secondary}</div>
                <textarea
                  value={packSecondaryInput}
                  onChange={(e) => onPackSecondaryInputChange(e.target.value)}
                  placeholder={inputPlaceholders.secondary}
                  rows={3}
                  style={{
                    width: '100%',
                    borderRadius: 9,
                    border: `1px solid ${UI.border}`,
                    background: UI.surfaceAlt,
                    color: UI.text,
                    padding: 9,
                    resize: 'vertical',
                    fontSize: 12,
                    lineHeight: 1.45,
                  }}
                />
              </div>

              <div style={{ display: 'grid', gap: 4 }}>
                <div style={{ fontSize: 11, color: UI.textMuted }}>{inputLabels.tertiary}</div>
                <textarea
                  value={packTertiaryInput}
                  onChange={(e) => onPackTertiaryInputChange(e.target.value)}
                  placeholder={inputPlaceholders.tertiary}
                  rows={4}
                  style={{
                    width: '100%',
                    borderRadius: 9,
                    border: `1px solid ${UI.border}`,
                    background: UI.surfaceAlt,
                    color: UI.text,
                    padding: 9,
                    resize: 'vertical',
                    fontSize: 12,
                    lineHeight: 1.45,
                  }}
                />
              </div>
            </div>
          </>
        )}
      </section>

      <section style={{ display: mode === 'inspect' ? 'grid' : 'none', gap: 6 }}>
        <div
          style={{
            borderTop: `1px solid ${UI.borderSoft}`,
            padding: '8px 0 6px',
            display: 'grid',
            gap: 6,
            fontSize: 12,
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 700, color: UI.textSoft }}>Run snapshot</div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
              gap: 8,
            }}
          >
            <div style={{ display: 'grid', gap: 3 }}>
              <div style={{ fontSize: 10, color: UI.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>Run</div>
              <div style={{ color: UI.textSoft }}>{inspectTargetRunId ? inspectTargetRunId.slice(0, 8) : '-'}</div>
            </div>
            <div style={{ display: 'grid', gap: 3 }}>
              <div style={{ fontSize: 10, color: UI.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>Status</div>
              <div style={{ color: (selectedRun?.status || status) === 'error' ? UI.error : (selectedRun?.status || status) === 'waiting' ? UI.warning : UI.textSoft }}>
                {selectedRun?.status || status}
              </div>
            </div>
            <div style={{ display: 'grid', gap: 3 }}>
              <div style={{ fontSize: 10, color: UI.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>Agent</div>
              <div style={{ color: UI.textSoft }}>{inspectAgentLabel}</div>
            </div>
            <div style={{ display: 'grid', gap: 3 }}>
              <div style={{ fontSize: 10, color: UI.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>Stream</div>
              <div style={{ color: streamColor }}>{streamLabel}</div>
            </div>
            <div style={{ display: 'grid', gap: 3 }}>
              <div style={{ fontSize: 10, color: UI.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>Source</div>
              <div style={{ color: UI.textMuted }}>
                {(selectedRun?.usage_provider || '--').toString()}
                {selectedRun?.usage_model ? ` · ${selectedRun.usage_model}` : ''}
              </div>
            </div>
            <div style={{ display: 'grid', gap: 3 }}>
              <div style={{ fontSize: 10, color: UI.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>Route</div>
              <div style={{ color: UI.textMuted }}>{selectedRun?.execution_target_selected || '--'}</div>
            </div>
            <div style={{ display: 'grid', gap: 3 }}>
              <div style={{ fontSize: 10, color: UI.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>Pack</div>
              <div style={{ color: UI.textMuted }}>{selectedRun?.pack_id || '--'}</div>
            </div>
            <div style={{ display: 'grid', gap: 3 }}>
              <div style={{ fontSize: 10, color: UI.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>Started</div>
              <div style={{ color: UI.textMuted }}>{selectedRun?.created_at ? fmtTime(selectedRun.created_at) : '--'}</div>
            </div>
          </div>
          <div style={{ color: pendingApprovals > 0 ? UI.warning : UI.textMuted }}>
            approvals {pendingApprovals}
          </div>
        </div>
        {inspectTargetRunId ? (
          <button
            onClick={() => onOpenRunInspect(inspectTargetRunId)}
            className="orion-btn orion-btn-ghost"
            style={{ minHeight: 30, fontSize: 11 }}
          >
            Full inspect
          </button>
        ) : null}
        <div
          style={{
            borderTop: `1px solid ${UI.borderSoft}`,
            borderBottom: `1px solid ${UI.borderSoft}`,
            maxHeight: 180,
            overflowY: 'auto',
            overflowX: 'auto',
          }}
        >
          <div
            style={{
              color: UI.textMuted,
              fontSize: 11,
              padding: '8px 0',
              borderBottom: `1px solid ${UI.borderSoft}`,
            }}
          >
            Recent events
          </div>
          {inspectFeed.length === 0 ? (
            <div style={{ color: UI.textMuted, fontSize: 12, padding: '10px 9px' }}>No events.</div>
          ) : (
            <div style={{ minWidth: 420 }}>
              {inspectFeed.map((entry, idx) => {
                const levelColor =
                  entry.level === 'error'
                    ? UI.error
                    : entry.level === 'warn'
                    ? UI.warning
                    : UI.textMuted;
                return (
                  <div
                    key={`${entry.ts}-${entry.event || 'evt'}-${idx}`}
                    className="orion-log-entry"
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '60px 96px minmax(220px, 1fr)',
                      gap: 8,
                      padding: '8px 0',
                      borderBottom: `1px solid ${UI.borderSoft}`,
                      alignItems: 'start',
                    }}
                  >
                    <span style={{ color: levelColor, fontWeight: 700, fontSize: 11 }}>
                      {String(entry.level || 'info').toUpperCase()}
                    </span>
                    <span style={{ color: UI.textMuted, fontSize: 11 }}>{fmtTime(entry.ts)}</span>
                    <span style={{ color: UI.textSoft, fontSize: 12, lineHeight: 1.35 }}>
                      {entry.event ? `${entry.event}: ` : ''}
                      {entry.message}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        {inspectSummary ? (
          <div
            style={{
              borderTop: `1px solid ${UI.borderSoft}`,
              borderBottom: `1px solid ${UI.borderSoft}`,
              padding: '8px 0',
              fontSize: 12,
              color: UI.textMuted,
              lineHeight: 1.35,
              wordBreak: 'break-word',
              overflowWrap: 'anywhere',
            }}
          >
            <span style={{ color: UI.textSoft, fontWeight: 700 }}>Summary:</span> {inspectSummary}
          </div>
        ) : null}
      </section>
    </aside>
  );
}
