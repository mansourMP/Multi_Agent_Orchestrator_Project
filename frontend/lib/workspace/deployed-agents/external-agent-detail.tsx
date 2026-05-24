'use client';

import { memo, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import {
  BarChart3,
  BookOpen,
  Brain,
  Cable,
  FileText,
  LayoutDashboard,
  MessageSquareText,
  Route,
  ShieldCheck,
  Zap,
  type LucideIcon,
} from 'lucide-react';

import { ListDetailPanel } from '@/lib/ui/list-detail';
import { AnimatePresence, MotionTabPanel } from '@/lib/ui/motion';
import { AppButton, AppSurfaceStat, AppSurfaceStatGrid, AppTextarea, joinClassNames } from '@/lib/ui/primitives';
import { DataBadge } from '@/lib/ui/data-table';
import { EmptyPanel } from '@/lib/ui/empty-panel';
import type { ConnectedExternalAgentRecord } from '@/lib/workspace/workstation-client';
import type { SpecialistOverlayTabId } from './types';
import { AGENT_STUDIO_OBJECT_LABELS, AGENT_VISIBILITY_LABELS, SPECIALIST_OVERLAY_TABS } from './constants';
import { formatTimestamp, humanizeToken, readRecord, readString } from './utils';

export type ExternalAgentChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
};

export type ExternalAgentChatSessionState = {
  messages: ExternalAgentChatMessage[];
};

type ExternalSurfaceSection = {
  id: string;
  title: string;
  icon: string;
  capabilityRequired: string;
  dataEndpointRef: string;
  actionsEndpointRef: string;
  displayKind: string;
};

export function createEmptyExternalAgentChatSession(): ExternalAgentChatSessionState {
  return { messages: [] };
}

const EXTERNAL_AGENT_SECTION_ICONS: Record<SpecialistOverlayTabId, LucideIcon> = {
  overview: LayoutDashboard,
  chat: MessageSquareText,
  knowledge: BookOpen,
  ai: Route,
  tools: Zap,
  memory: Brain,
  connectors: Cable,
  analytics: BarChart3,
};

function capabilityEnabled(capabilityManifest: Record<string, unknown>, key: string): boolean {
  if (capabilityManifest[key] === true) {
    return true;
  }
  const capabilities = capabilityManifest.capabilities;
  return Array.isArray(capabilities) && capabilities.map((item) => readString(item).toLowerCase()).includes(key);
}

function makeMessageId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function formatOptionalTimestamp(value: unknown, fallback: string): string {
  return readString(value) ? formatTimestamp(value) : fallback;
}

function normalizeSurfaceSections(value: unknown): ExternalSurfaceSection[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => {
    const record = readRecord(item);
    return {
      id: readString(record.id),
      title: readString(record.title, 'External section'),
      icon: readString(record.icon, 'key_value'),
      capabilityRequired: readString(record.capability_required),
      dataEndpointRef: readString(record.data_endpoint_ref),
      actionsEndpointRef: readString(record.actions_endpoint_ref),
      displayKind: readString(record.display_kind, 'key_value'),
    };
  }).filter((item) => item.id && item.dataEndpointRef);
}

function externalOwnershipLabel(value: unknown): string {
  return readString(value, 'external') === 'external' ? 'External-owned' : humanizeToken(value, 'External-owned');
}

export const ConnectedExternalAgentDetailView = memo(({
  externalAgent,
  overlayTab,
  onSelectTab,
  services,
  chatSession,
  onChatSessionChange,
  onExternalAgentUpdated,
}: {
  externalAgent: ConnectedExternalAgentRecord | null;
  overlayTab: SpecialistOverlayTabId;
  onSelectTab: (tabId: SpecialistOverlayTabId) => void;
  services: any;
  chatSession: ExternalAgentChatSessionState;
  onChatSessionChange: Dispatch<SetStateAction<ExternalAgentChatSessionState>>;
  onExternalAgentUpdated: (record: ConnectedExternalAgentRecord) => void;
}) => {
  const [messageDraft, setMessageDraft] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isRefreshingManifest, setIsRefreshingManifest] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [loadingSectionIds, setLoadingSectionIds] = useState<Set<string>>(() => new Set());
  const [sectionPayloads, setSectionPayloads] = useState<Record<string, Record<string, unknown>>>({});
  const [localError, setLocalError] = useState<string | null>(null);

  const externalAgentId = readString(externalAgent?.id);
  const displayName = readString(externalAgent?.name ?? externalAgent?.label, 'Connected Agent');
  const providerLabel = humanizeToken(externalAgent?.provider_kind, 'Custom endpoint');
  const connectionState = readString(externalAgent?.connection_state, 'unverified').toLowerCase();
  const trustState = readString(externalAgent?.trust_state, connectionState).toLowerCase();
  const endpointRefs = readRecord(externalAgent?.endpoint_refs);
  const localConnector = readRecord(externalAgent?.local_connector);
  const capabilityManifest = readRecord(externalAgent?.capability_manifest);
  const externalSections = normalizeSurfaceSections(externalAgent?.surface_sections);
  const objectTypes = Array.isArray(externalAgent?.object_types)
    ? externalAgent.object_types.map((item) => humanizeToken(item, '')).filter(Boolean)
    : [];
  const protocols = Array.isArray(externalAgent?.protocols)
    ? externalAgent.protocols.map((item) => humanizeToken(readRecord(item).kind, '')).filter(Boolean)
    : [];
  const hasChat = capabilityEnabled(capabilityManifest, 'chat');
  const isVerified = connectionState === 'verified';
  const isRevoked = connectionState === 'revoked' || externalAgent?.enabled === false;

  const visibleTabs = useMemo(() => SPECIALIST_OVERLAY_TABS.filter((tab) => {
    if (tab.id === 'knowledge') {
      return capabilityEnabled(capabilityManifest, 'knowledge_read') || capabilityEnabled(capabilityManifest, 'knowledge_write');
    }
    if (tab.id === 'memory') {
      return capabilityEnabled(capabilityManifest, 'memory_read') || capabilityEnabled(capabilityManifest, 'memory_write');
    }
    if (tab.id === 'tools') {
      return capabilityEnabled(capabilityManifest, 'actions') || capabilityEnabled(capabilityManifest, 'tools');
    }
    if (tab.id === 'analytics') {
      return true;
    }
    return true;
  }), [capabilityManifest]);

  const activeTab = visibleTabs.some((tab) => tab.id === overlayTab) ? overlayTab : 'overview';
  const capabilityLabels = Array.isArray(capabilityManifest.capabilities)
    ? capabilityManifest.capabilities.map((item) => humanizeToken(item, '')).filter(Boolean)
    : [];

  async function sendPrivateChatTurn() {
    const message = messageDraft.trim();
    if (!externalAgentId || !message || isSending) {
      return;
    }
    setLocalError(null);
    setMessageDraft('');
    const userMessage: ExternalAgentChatMessage = {
      id: makeMessageId('user'),
      role: 'user',
      content: message,
    };
    onChatSessionChange((current) => ({
      ...current,
      messages: [...current.messages, userMessage],
    }));
    setIsSending(true);
    try {
      const payload = await services.client.chatTurnConnectedExternalAgent({
        externalAgentId,
        message,
        recentMessages: chatSession.messages.map((item) => ({
          role: item.role,
          content: item.content,
        })),
      });
      const reply = readString(readRecord(payload).reply, 'The connected agent did not return text.');
      onChatSessionChange((current) => ({
        ...current,
        messages: [
          ...current.messages,
          { id: makeMessageId('assistant'), role: 'assistant', content: reply },
        ],
      }));
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : 'Connected agent chat failed.');
    } finally {
      setIsSending(false);
    }
  }

  async function refreshManifest() {
    if (!externalAgentId || isRefreshingManifest) {
      return;
    }
    setIsRefreshingManifest(true);
    setLocalError(null);
    try {
      const payload = await services.client.refreshConnectedExternalAgentManifest({ externalAgentId });
      onExternalAgentUpdated(payload as ConnectedExternalAgentRecord);
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : 'Manifest refresh failed.');
    } finally {
      setIsRefreshingManifest(false);
    }
  }

  async function disconnectAgent() {
    if (!externalAgentId || isDisconnecting) {
      return;
    }
    setIsDisconnecting(true);
    setLocalError(null);
    try {
      const payload = await services.client.disconnectConnectedExternalAgent({ externalAgentId });
      onExternalAgentUpdated(payload as ConnectedExternalAgentRecord);
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : 'Connected agent could not be disconnected.');
    } finally {
      setIsDisconnecting(false);
    }
  }

  async function loadExternalSection(section: ExternalSurfaceSection) {
    if (!externalAgentId || !section.id || loadingSectionIds.has(section.id)) {
      return;
    }
    setLocalError(null);
    setLoadingSectionIds((current) => new Set([...current, section.id]));
    try {
      const payload = await services.client.getConnectedExternalAgentSectionData({
        externalAgentId,
        sectionId: section.id,
      });
      setSectionPayloads((current) => ({
        ...current,
        [section.id]: readRecord(payload),
      }));
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : 'External section could not be loaded.');
    } finally {
      setLoadingSectionIds((current) => {
        const next = new Set(current);
        next.delete(section.id);
        return next;
      });
    }
  }

  function renderSectionItems(payload: Record<string, unknown>) {
    const items = Array.isArray(payload.items) ? payload.items.map(readRecord) : [];
    if (items.length === 0) {
      return <EmptyPanel title="No external records" body="This external section returned no displayable records." />;
    }
    return (
      <div className="studio-agent-overview__grid">
        {items.slice(0, 12).map((item, index) => (
          <div key={readString(item.id, `external-item-${index}`)} className="studio-agent-overview__card">
            <div className="studio-agent-overview__card-icon"><FileText size={15} aria-hidden="true" /></div>
            <div>
              <strong>{readString(item.title || item.name || item.external_id, 'External record')}</strong>
              <span>{externalOwnershipLabel(item.ownership)} · {humanizeToken(item.object_type, 'External object')}</span>
              {readString(item.status) ? <span>{humanizeToken(item.status)}</span> : null}
              {readString(item.summary) ? <span>{readString(item.summary)}</span> : null}
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!externalAgent) {
    return (
      <div className="studio-agent-detail-empty" aria-label="Connected agent detail">
        <strong>Select a connected agent</strong>
        <span>Connection status, private chat, endpoints, and capabilities will appear here.</span>
      </div>
    );
  }

  return (
    <div className="app-stack-4 studio-agent-detail-motion">
      <div className="studio-agent-detail-layout">
        <nav className="studio-agent-detail-tabs studio-agent-detail-tabs--rail" role="tablist" aria-label="Connected Agent sections">
          {visibleTabs.map((tab) => {
            const SectionIcon = EXTERNAL_AGENT_SECTION_ICONS[tab.id];
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                className={joinClassNames(
                  'studio-agent-detail-tabs__button',
                  activeTab === tab.id && 'studio-agent-detail-tabs__button--active',
                )}
                aria-label={tab.label}
                aria-selected={activeTab === tab.id}
                title={tab.label}
                onClick={() => onSelectTab(tab.id)}
              >
                <SectionIcon size={15} strokeWidth={2} aria-hidden="true" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="studio-agent-detail-content">
          {localError ? (
            <div className="studio-agent-inline-error" role="alert">{localError}</div>
          ) : null}
          <AnimatePresence mode="wait" initial={false}>
            {activeTab === 'overview' && (
              <MotionTabPanel key="external-overview" className="studio-agent-motion-panel">
                <ListDetailPanel
                  className="studio-panel studio-panel--detail"
                  hideHeaderText
                  eyebrow="Connected Agent"
                  title={displayName}
                  subtitle="A workspace-owned connection to an external agent runtime. The platform does not own its brain."
                  actions={(
                    <div className="app-inline-actions app-inline-actions--tight">
                      <AppButton type="button" tone="secondary" onClick={refreshManifest} disabled={isRefreshingManifest || isRevoked}>
                        {isRefreshingManifest ? 'Refreshing...' : 'Refresh manifest'}
                      </AppButton>
                    </div>
                  )}
                >
                  <div className="studio-agent-overview">
                    <div className="studio-agent-overview__readiness-hero">
                      <div className="studio-agent-overview__hero-copy">
                        <div className="studio-agent-overview__state-row">
                          <span className="studio-agent-overview__state-dot" data-tone={isVerified ? 'live' : isRevoked ? 'danger' : 'warning'} />
                          <DataBadge tone={isVerified ? 'success' : isRevoked ? 'danger' : 'warning'}>
                            {humanizeToken(connectionState, 'Unverified')}
                          </DataBadge>
                        </div>
                        <h3>{isVerified ? 'Connection verified' : isRevoked ? 'Connection revoked' : 'Verification needed'}</h3>
                        <p>Connected agents start private, approval-gated, and revocable. Public customer send is not enabled here.</p>
                        <div className="studio-agent-overview__chips" aria-label={`${displayName} boundary`}>
                          <span>{AGENT_STUDIO_OBJECT_LABELS.connected_external_agent}</span>
                          <span>External-owned</span>
                          <span>{AGENT_VISIBILITY_LABELS.private_workspace}</span>
                          <span>{providerLabel}</span>
                        </div>
                      </div>
                    </div>
                    <AppSurfaceStatGrid>
                      <AppSurfaceStat label="Provider" value={providerLabel} hint="External provider kind" />
                      <AppSurfaceStat label="Trust state" value={humanizeToken(trustState, 'Unverified')} hint="Verified after manifest refresh" />
                      <AppSurfaceStat label="Chat" value={hasChat ? 'Available' : 'Not exposed'} hint="Manifest chat capability" />
                      <AppSurfaceStat label="Endpoint" value={readString(endpointRefs.chat_url) ? 'Backend proxy' : 'Missing'} hint="External endpoint never called from browser" />
                      <AppSurfaceStat label="Protocols" value={protocols.length > 0 ? protocols.join(', ') : 'Custom HTTP'} hint="Adapter hints only" />
                      <AppSurfaceStat label="Local connector" value={localConnector.required ? 'Required' : 'Not required'} hint="Private endpoints require Agent Computer" />
                    </AppSurfaceStatGrid>
                    <ListDetailPanel
                      className="studio-panel studio-panel--detail"
                      eyebrow="Capabilities"
                      title="Manifest claims"
                      subtitle="Claims stay limited to the connected-agent surface and do not grant native deployed-agent capabilities."
                    >
                      {capabilityLabels.length > 0 ? (
                        <div className="studio-inline-wrap">
                          {capabilityLabels.map((label) => <DataBadge key={label}>{label}</DataBadge>)}
                        </div>
                      ) : (
                        <EmptyPanel title="No capabilities verified" body="Refresh the manifest after connecting the endpoint." />
                      )}
                    </ListDetailPanel>
                    <ListDetailPanel
                      className="studio-panel studio-panel--detail"
                      eyebrow="External Sections"
                      title="Provider-owned surfaces"
                      subtitle="These sections are schema-rendered by Studio. No external frontend code runs here."
                    >
                      {externalSections.length > 0 ? (
                        <div className="studio-agent-overview__grid">
                          {externalSections.map((section) => (
                            <div key={section.id} className="studio-agent-overview__card">
                              <div className="studio-agent-overview__card-icon"><FileText size={15} aria-hidden="true" /></div>
                              <div>
                                <strong>{section.title}</strong>
                                <span>{humanizeToken(section.displayKind)} · {humanizeToken(section.dataEndpointRef)}</span>
                                {section.capabilityRequired ? <span>Requires {humanizeToken(section.capabilityRequired)}</span> : null}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <EmptyPanel title="No custom sections declared" body="This connected agent has not exposed provider-owned Studio sections." />
                      )}
                    </ListDetailPanel>
                  </div>
                </ListDetailPanel>
              </MotionTabPanel>
            )}

            {activeTab === 'chat' && (
              <MotionTabPanel key="external-chat" className="studio-agent-motion-panel">
                <ListDetailPanel
                  className="studio-panel studio-panel--detail studio-panel--chat"
                  eyebrow="Chat"
                  title="Private external-agent chat"
                  subtitle="Owner workspace chat through the backend proxy. No customer channel send."
                >
                  {!hasChat || !isVerified || isRevoked ? (
                    <EmptyPanel
                      title="Private chat is not available"
                      body={isRevoked ? 'This connection is revoked.' : !isVerified ? 'Refresh and verify the manifest before chatting.' : 'The manifest does not expose chat.'}
                    />
                  ) : (
                    <div className="studio-external-chat">
                      <div className="studio-external-chat__transcript" aria-live="polite">
                        {chatSession.messages.length === 0 ? (
                          <EmptyPanel title="No owner chat yet" body="Send a message to this connected agent. It stays private to Studio." />
                        ) : chatSession.messages.map((message) => (
                          <div key={message.id} className={joinClassNames(
                            'studio-external-chat__message',
                            message.role === 'user' && 'studio-external-chat__message--user',
                          )}>
                            <span>{message.role === 'user' ? 'You' : displayName}</span>
                            <p>{message.content}</p>
                          </div>
                        ))}
                      </div>
                      <div className="studio-external-chat__composer">
                        <AppTextarea
                          value={messageDraft}
                          rows={3}
                          placeholder="Message this connected agent privately..."
                          onChange={(event) => setMessageDraft(event.currentTarget.value)}
                        />
                        <AppButton type="button" onClick={() => { void sendPrivateChatTurn(); }} disabled={isSending || !messageDraft.trim()}>
                          {isSending ? 'Sending...' : 'Send'}
                        </AppButton>
                      </div>
                    </div>
                  )}
                </ListDetailPanel>
              </MotionTabPanel>
            )}

            {activeTab === 'knowledge' && (
              <MotionTabPanel key="external-knowledge" className="studio-agent-motion-panel">
                <ListDetailPanel className="studio-panel studio-panel--detail" eyebrow="Knowledge" title="Externally managed knowledge" subtitle="This connected agent exposes knowledge through its own contract. Native Studio uploads stay unavailable." />
              </MotionTabPanel>
            )}

            {activeTab === 'ai' && (
              <MotionTabPanel key="external-model" className="studio-agent-motion-panel">
                <ListDetailPanel className="studio-panel studio-panel--detail" eyebrow="Model" title="External runtime owns the model" subtitle="Provider switching is disabled because this agent runs outside the native Studio runtime.">
                  <AppSurfaceStatGrid>
                    <AppSurfaceStat label="Provider" value={providerLabel} hint="Declared by manifest" />
                    <AppSurfaceStat label="Route" value="External endpoint" hint="Model route is outside native Studio" />
                    <AppSurfaceStat label="Platform control" value="Read-only" hint="No native provider switching" />
                  </AppSurfaceStatGrid>
                </ListDetailPanel>
              </MotionTabPanel>
            )}

            {activeTab === 'tools' && (
              <MotionTabPanel key="external-actions" className="studio-agent-motion-panel">
                <ListDetailPanel className="studio-panel studio-panel--detail" eyebrow="Actions" title="External action policy" subtitle="External actions remain approval-gated and cannot install native tools unless a future adapter explicitly exposes them.">
                  <div className="studio-inline-wrap">
                    <DataBadge tone="warning">Approval-gated</DataBadge>
                    <DataBadge>Revocable</DataBadge>
                    <DataBadge>No native tool install</DataBadge>
                  </div>
                </ListDetailPanel>
              </MotionTabPanel>
            )}

            {activeTab === 'memory' && (
              <MotionTabPanel key="external-memory" className="studio-agent-motion-panel">
                <ListDetailPanel className="studio-panel studio-panel--detail" eyebrow="Memory" title="Externally managed memory" subtitle="Memory is read-only here unless the manifest exposes a scoped memory endpoint." />
              </MotionTabPanel>
            )}

            {activeTab === 'connectors' && (
              <MotionTabPanel key="external-integrations" className="studio-agent-motion-panel">
                <ListDetailPanel
                  className="studio-panel studio-panel--detail"
                  eyebrow="Integrations"
                  title="Connection and endpoints"
                  subtitle="Secrets stay in workspace credential storage. Studio metadata only keeps endpoint refs and secret refs."
                  actions={(
                    <div className="app-inline-actions app-inline-actions--tight">
                      <AppButton type="button" tone="secondary" onClick={refreshManifest} disabled={isRefreshingManifest || isRevoked}>
                        {isRefreshingManifest ? 'Refreshing...' : 'Refresh manifest'}
                      </AppButton>
                      <AppButton type="button" tone="danger" onClick={disconnectAgent} disabled={isDisconnecting || isRevoked}>
                        {isDisconnecting ? 'Disconnecting...' : 'Disconnect'}
                      </AppButton>
                    </div>
                  )}
                >
                  <div className="studio-agent-overview__grid">
                    {Object.entries(endpointRefs).length > 0 ? Object.entries(endpointRefs).map(([key, value]) => (
                      <div key={key} className="studio-agent-overview__card">
                        <div className="studio-agent-overview__card-icon"><ShieldCheck size={15} aria-hidden="true" /></div>
                        <div>
                          <strong>{humanizeToken(key, key)}</strong>
                          <span>{readString(value, 'Not set')}</span>
                        </div>
                      </div>
                    )) : (
                      <EmptyPanel title="No endpoints" body="Connect a manifest URL or endpoint reference first." />
                    )}
                  </div>
                </ListDetailPanel>
              </MotionTabPanel>
            )}

            {activeTab === 'analytics' && (
              <MotionTabPanel key="external-results" className="studio-agent-motion-panel">
                <ListDetailPanel className="studio-panel studio-panel--detail" eyebrow="Results" title="Connected-agent activity" subtitle="Platform activity and endpoint logs appear here when exposed by the manifest.">
                  <AppSurfaceStatGrid>
                    <AppSurfaceStat label="Last manifest refresh" value={formatOptionalTimestamp(externalAgent.last_manifest_refresh_at, 'Not refreshed')} hint="Latest backend handshake" />
                    <AppSurfaceStat label="Status" value={humanizeToken(connectionState, 'Unverified')} hint="Current connection state" />
                    <AppSurfaceStat label="Public send" value="Disabled" hint="Customer channels come later" />
                    <AppSurfaceStat label="External objects" value={objectTypes.length > 0 ? String(objectTypes.length) : 'None'} hint={objectTypes.length > 0 ? objectTypes.join(', ') : 'No object types declared'} />
                  </AppSurfaceStatGrid>
                  <div className="app-stack-3">
                    {externalSections.length > 0 ? externalSections.map((section) => {
                      const payload = sectionPayloads[section.id];
                      const isLoading = loadingSectionIds.has(section.id);
                      return (
                        <ListDetailPanel
                          key={section.id}
                          className="studio-panel studio-panel--detail"
                          eyebrow={humanizeToken(section.displayKind)}
                          title={section.title}
                          subtitle="External-owned records loaded through the backend proxy."
                          actions={(
                            <AppButton
                              type="button"
                              tone="secondary"
                              onClick={() => { void loadExternalSection(section); }}
                              disabled={isLoading || !isVerified || isRevoked}
                            >
                              {isLoading ? 'Loading...' : payload ? 'Refresh' : 'Load'}
                            </AppButton>
                          )}
                        >
                          {payload ? renderSectionItems(payload) : (
                            <EmptyPanel
                              title="Section not loaded"
                              body={isVerified ? 'Load this section to inspect external-owned records.' : 'Verify the connection before loading provider-owned records.'}
                            />
                          )}
                        </ListDetailPanel>
                      );
                    }) : (
                      <EmptyPanel title="No external sections" body="Events, logs, artifacts, and generated outputs appear here when the manifest exposes them." />
                    )}
                  </div>
                </ListDetailPanel>
              </MotionTabPanel>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
});

ConnectedExternalAgentDetailView.displayName = 'ConnectedExternalAgentDetailView';
