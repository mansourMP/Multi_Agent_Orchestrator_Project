'use client';

import { useEffect, useMemo, useState } from 'react';

import { DataBadge } from '@/lib/ui/data-table';
import { EmptyPanel } from '@/lib/ui/empty-panel';
import {
  FormField,
  FormGrid,
  FormInput,
  FormReadout,
  FormSection,
  FormSelect,
} from '@/lib/ui/form-controls';
import {
  WorkstationActionButton,
  WorkstationSurfaceCard,
  WorkstationSurfaceList,
  WorkstationSurfaceListItem,
  WorkstationSurfaceNotice,
  WorkstationSurfaceStat,
  WorkstationSurfaceStatGrid,
} from '@/lib/workspace/workstation-surface-primitives';
import { useWorkspaceBoundary } from '@/lib/workspace/workspace-boundary';
import { useWorkspaceServices } from '@/lib/workspace/workspace-services';

type GatewayRegistrationRecord = Record<string, unknown> & {
  gateway_id?: string | null;
  display_name?: string | null;
  platform?: string | null;
  status?: string | null;
  device_trust_state?: string | null;
  last_seen_at?: string | null;
};

type GatewayPairingIntentRecord = Record<string, unknown> & {
  pairing_token?: string | null;
  expires_at?: string | null;
  display_name?: string | null;
  platform?: string | null;
};

type GatewayDoctorCheckRecord = Record<string, unknown> & {
  id?: string | null;
  status?: string | null;
  summary?: string | null;
};

type GatewayDoctorPayload = Record<string, unknown> & {
  status?: string | null;
  checks?: GatewayDoctorCheckRecord[];
  approvals?: Record<string, unknown> | null;
  checkpoint?: Record<string, unknown> | null;
  browser?: Record<string, unknown> | null;
};

type PersonalChannelStateRecord = Record<string, unknown> & {
  status?: string | null;
  qr_code?: string | null;
  login_hint?: string | null;
  linked_name?: string | null;
  linked_jid?: string | null;
  linked_phone?: string | null;
  linked_username?: string | null;
  connected_at?: string | null;
};

type PersonalChannelViewPayload = Record<string, unknown> & {
  state?: PersonalChannelStateRecord | null;
  recent_messages?: Array<Record<string, unknown>>;
};

type GatewayApprovalRecord = Record<string, unknown> & {
  approval_id?: string | null;
  capability_id?: string | null;
  status?: string | null;
  run_id?: string | null;
  note?: string | null;
};

type GatewayApprovalsPayload = Record<string, unknown> & {
  pending_count?: number | null;
  retryable_count?: number | null;
  items?: GatewayApprovalRecord[];
};

type GatewayBrowserSessionRecord = Record<string, unknown> & {
  browser_session_id?: string | null;
  status?: string | null;
  session_profile?: string | null;
  current_url?: string | null;
  resume_supported?: boolean | null;
  metadata?: Record<string, unknown> | null;
};

type GatewayBrowserSessionsPayload = Record<string, unknown> & {
  items?: GatewayBrowserSessionRecord[];
};

type PairingDraft = {
  displayName: string;
  platform: string;
};

function buildQueryString(params: Record<string, string | number | null | undefined>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === '') {
      continue;
    }
    query.set(key, String(value));
  }
  const text = query.toString();
  return text ? `?${text}` : '';
}

function readString(value: unknown, fallback = 'Unknown'): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function humanizeToken(value: unknown, fallback = 'Unknown'): string {
  const token = String(value ?? '').trim();
  if (!token) {
    return fallback;
  }
  return token
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatTimestamp(value: unknown): string {
  const token = String(value ?? '').trim();
  if (!token) {
    return 'Not available';
  }
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(token));
  } catch {
    return token;
  }
}

function statusTone(value: unknown): 'neutral' | 'success' | 'warning' | 'danger' | 'accent' {
  const status = String(value ?? '').trim().toLowerCase();
  if (['healthy', 'active', 'connected', 'attached', 'executed', 'approved', 'pass'].includes(status)) {
    return 'success';
  }
  if (['approval_required', 'pending', 'requested', 'warn', 'waiting_for_input', 'attach_required', 'degraded'].includes(status)) {
    return 'warning';
  }
  if (['blocked', 'revoked', 'rejected', 'fail', 'attach_failed', 'offline', 'not_attached'].includes(status)) {
    return 'danger';
  }
  if (['fallback_ready'].includes(status)) {
    return 'accent';
  }
  return 'neutral';
}

function sortGatewayApprovals(items: GatewayApprovalRecord[]): GatewayApprovalRecord[] {
  return [...items].sort((left, right) => {
    const leftPending = String(left.status ?? '').trim().toLowerCase() === 'pending';
    const rightPending = String(right.status ?? '').trim().toLowerCase() === 'pending';
    if (leftPending !== rightPending) {
      return leftPending ? -1 : 1;
    }
    return String(left.approval_id ?? '').localeCompare(String(right.approval_id ?? ''));
  });
}

function sortBrowserSessions(items: GatewayBrowserSessionRecord[]): GatewayBrowserSessionRecord[] {
  return [...items].sort((left, right) => {
    const leftStatus = String(left.status ?? '').trim().toLowerCase();
    const rightStatus = String(right.status ?? '').trim().toLowerCase();
    if (leftStatus !== rightStatus) {
      if (leftStatus === 'active' || leftStatus === 'attached') {
        return -1;
      }
      if (rightStatus === 'active' || rightStatus === 'attached') {
        return 1;
      }
    }
    return String(left.browser_session_id ?? '').localeCompare(String(right.browser_session_id ?? ''));
  });
}

function summarizeWhatsappState(state: PersonalChannelStateRecord | null | undefined): string {
  if (!state) {
    return 'Gateway has not reported WhatsApp personal state yet.';
  }
  if (state.qr_code) {
    return 'QR token is ready on the paired gateway.';
  }
  if (String(state.status ?? '').trim().toLowerCase() === 'connected') {
    const linkedName = readString(state.linked_name, '');
    const linkedJid = readString(state.linked_jid, '');
    const linkedLabel = linkedName || linkedJid || 'Linked account';
    return `${linkedLabel} is connected on the gateway.`;
  }
  return `WhatsApp personal is ${humanizeToken(state.status, 'Idle')}.`;
}

function summarizeTelegramState(state: PersonalChannelStateRecord | null | undefined): string {
  if (!state) {
    return 'Gateway has not reported Telegram personal state yet.';
  }
  if (state.login_hint) {
    return 'Telegram is waiting for a login code or confirmation.';
  }
  if (String(state.status ?? '').trim().toLowerCase() === 'connected') {
    const linkedName = readString(state.linked_name, '');
    const linkedUsername = readString(state.linked_username, '');
    const linkedPhone = readString(state.linked_phone, '');
    const linkedLabel = linkedName || linkedUsername || linkedPhone || 'Linked account';
    return `${linkedLabel} is connected on the gateway.`;
  }
  return `Telegram personal is ${humanizeToken(state.status, 'Idle')}.`;
}

function summarizeDoctorFacet(value: unknown): {
  status: string;
  summary: string;
} {
  const record = readRecord(value);
  return {
    status: humanizeToken(readString(record.status, 'unknown'), 'Unknown'),
    summary: readString(record.summary, 'No detail reported yet.'),
  };
}

export function WorkstationGatewayOperatorPane() {
  const services = useWorkspaceServices();
  const { bootstrap } = useWorkspaceBoundary();
  const workspaceId = bootstrap.workspace.id;

  const [gateways, setGateways] = useState<GatewayRegistrationRecord[]>([]);
  const [selectedGatewayId, setSelectedGatewayId] = useState<string | null>(null);
  const [doctor, setDoctor] = useState<GatewayDoctorPayload | null>(null);
  const [whatsapp, setWhatsapp] = useState<PersonalChannelViewPayload | null>(null);
  const [telegram, setTelegram] = useState<PersonalChannelViewPayload | null>(null);
  const [approvals, setApprovals] = useState<GatewayApprovalsPayload | null>(null);
  const [browserSessions, setBrowserSessions] = useState<GatewayBrowserSessionsPayload | null>(null);
  const [pairingDraft, setPairingDraft] = useState<PairingDraft>({
    displayName: 'My device',
    platform: 'macos',
  });
  const [pairingIntent, setPairingIntent] = useState<GatewayPairingIntentRecord | null>(null);
  const [loadingRegistrations, setLoadingRegistrations] = useState(true);
  const [loadingGatewayDetail, setLoadingGatewayDetail] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [busyActionKey, setBusyActionKey] = useState<string | null>(null);

  const selectedGateway = useMemo(
    () =>
      gateways.find((gateway) => String(gateway.gateway_id ?? '').trim() === String(selectedGatewayId ?? '').trim()) ?? null,
    [gateways, selectedGatewayId],
  );

  const pendingApprovals = useMemo(
    () => sortGatewayApprovals(Array.isArray(approvals?.items) ? approvals?.items : []),
    [approvals],
  );

  const browserItems = useMemo(
    () => sortBrowserSessions(Array.isArray(browserSessions?.items) ? browserSessions?.items : []),
    [browserSessions],
  );

  async function requestPayload<T>(
    path: string,
    init?: RequestInit,
    allowStatuses: number[] = [],
  ): Promise<T | null> {
    return services.client.requestJson<T>({
      path,
      init,
      allowStatuses,
    });
  }

  async function refreshRegistrations(showLoading = false): Promise<void> {
    if (showLoading) {
      setLoadingRegistrations(true);
    }
    const payload = await requestPayload<Record<string, unknown>>(
      `/api/gateway/registrations${buildQueryString({ workspace_id: workspaceId })}`,
    );
    const items = Array.isArray(payload?.items)
      ? payload.items.filter((item): item is GatewayRegistrationRecord => Boolean(item) && typeof item === 'object')
      : [];
    setGateways(items);
    setLoadingRegistrations(false);
    setSelectedGatewayId((current) => {
      if (current && items.some((item) => String(item.gateway_id ?? '').trim() === current)) {
        return current;
      }
      return String(items[0]?.gateway_id ?? '').trim() || null;
    });
  }

  async function refreshGatewayDetail(gatewayId: string, showLoading = false): Promise<void> {
    if (!gatewayId) {
      setDoctor(null);
      setWhatsapp(null);
      setTelegram(null);
      setApprovals(null);
      setBrowserSessions(null);
      return;
    }
    if (showLoading) {
      setLoadingGatewayDetail(true);
    }
    const [
      nextDoctor,
      nextWhatsapp,
      nextTelegram,
      nextApprovals,
      nextBrowserSessions,
    ] = await Promise.all([
      requestPayload<GatewayDoctorPayload>(
        `/api/gateway/registrations/${encodeURIComponent(gatewayId)}/doctor`,
      ),
      requestPayload<PersonalChannelViewPayload>(
        `/api/personal-channels/whatsapp/gateways/${encodeURIComponent(gatewayId)}`,
      ),
      requestPayload<PersonalChannelViewPayload>(
        `/api/personal-channels/telegram/gateways/${encodeURIComponent(gatewayId)}`,
      ),
      requestPayload<GatewayApprovalsPayload>(
        `/api/gateway/registrations/${encodeURIComponent(gatewayId)}/approvals`,
      ),
      requestPayload<GatewayBrowserSessionsPayload>(
        `/api/gateway/registrations/${encodeURIComponent(gatewayId)}/browser/sessions`,
      ),
    ]);
    setDoctor(nextDoctor);
    setWhatsapp(nextWhatsapp);
    setTelegram(nextTelegram);
    setApprovals(nextApprovals);
    setBrowserSessions(nextBrowserSessions);
    setLoadingGatewayDetail(false);
  }

  useEffect(() => {
    let cancelled = false;
    void refreshRegistrations(true).catch((error) => {
      if (cancelled) {
        return;
      }
      setErrorMessage(error instanceof Error ? error.message : 'Gateway registrations are unavailable right now.');
      setLoadingRegistrations(false);
    });
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  useEffect(() => {
    if (!selectedGatewayId) {
      setDoctor(null);
      setWhatsapp(null);
      setTelegram(null);
      setApprovals(null);
      setBrowserSessions(null);
      return;
    }
    let cancelled = false;
    void refreshGatewayDetail(selectedGatewayId, true).catch((error) => {
      if (cancelled) {
        return;
      }
      setErrorMessage(error instanceof Error ? error.message : 'Gateway state is unavailable right now.');
      setLoadingGatewayDetail(false);
    });
    const intervalId = window.setInterval(() => {
      void refreshGatewayDetail(selectedGatewayId, false).catch((error) => {
        if (cancelled) {
          return;
        }
        setErrorMessage(error instanceof Error ? error.message : 'Gateway state is unavailable right now.');
      });
    }, 15_000);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [selectedGatewayId]);

  async function handleCreatePairingIntent() {
    setBusyActionKey('pairing');
    setErrorMessage(null);
    try {
      const payload = await requestPayload<GatewayPairingIntentRecord>(
        '/api/gateway/pairings/intents',
        {
          method: 'POST',
          headers: {
            accept: 'application/json',
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            workspace_id: workspaceId,
            display_name: pairingDraft.displayName.trim() || undefined,
            platform: pairingDraft.platform || undefined,
          }),
        },
      );
      setPairingIntent(payload);
      setStatusMessage('Gateway pairing token is ready. Finish registration from the local gateway app on that device.');
      await refreshRegistrations(false);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not create a gateway pairing token.');
    } finally {
      setBusyActionKey(null);
    }
  }

  async function handleResolveApproval(approvalId: string, decision: 'approved' | 'rejected') {
    if (!selectedGatewayId) {
      return;
    }
    setBusyActionKey(`approval:${approvalId}:${decision}`);
    setErrorMessage(null);
    try {
      await requestPayload<Record<string, unknown>>(
        `/api/gateway/registrations/${encodeURIComponent(selectedGatewayId)}/approvals/${encodeURIComponent(approvalId)}/resolve`,
        {
          method: 'POST',
          headers: {
            accept: 'application/json',
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            decision,
            note: decision === 'approved'
              ? 'Approved from the gateway operator surface.'
              : 'Rejected from the gateway operator surface.',
          }),
        },
      );
      setStatusMessage(
        decision === 'approved'
          ? 'Gateway approval accepted and the blocked work resumed.'
          : 'Gateway approval rejected and the blocked work stopped.',
      );
      await refreshGatewayDetail(selectedGatewayId, false);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not resolve the gateway approval.');
    } finally {
      setBusyActionKey(null);
    }
  }

  async function handleBrowserControl(
    browserSessionId: string,
    action: 'takeover' | 'resume' | 'interrupt',
  ) {
    if (!selectedGatewayId) {
      return;
    }
    const actionKey = `browser:${browserSessionId}:${action}`;
    setBusyActionKey(actionKey);
    setErrorMessage(null);
    try {
      const payload = await requestPayload<Record<string, unknown>>(
        `/api/gateway/registrations/${encodeURIComponent(selectedGatewayId)}/browser/sessions/${encodeURIComponent(browserSessionId)}/${action}`,
        {
          method: 'POST',
          headers: {
            accept: 'application/json',
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            workspace_id: workspaceId,
            run_id: `gateway-operator-${action}-${Date.now().toString(36)}`,
            trace_id: `gateway-operator-${action}-${Date.now().toString(36)}`,
            note: action === 'interrupt'
              ? 'Interrupted from the gateway operator surface.'
              : action === 'takeover'
                ? 'Takeover requested from the gateway operator surface.'
                : 'Resume requested from the gateway operator surface.',
          }),
        },
      );
      const resultStatus = readString((payload as Record<string, unknown> | null)?.status, humanizeToken(action));
      setStatusMessage(`${humanizeToken(action)} request sent. Browser status: ${resultStatus}.`);
      await refreshGatewayDetail(selectedGatewayId, false);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not control the gateway browser session.');
    } finally {
      setBusyActionKey(null);
    }
  }

  const doctorChecks = Array.isArray(doctor?.checks)
    ? doctor.checks.filter((item): item is GatewayDoctorCheckRecord => Boolean(item) && typeof item === 'object')
    : [];

  const doctorStatus = readString(doctor?.status, selectedGateway ? readString(selectedGateway.status, 'unknown') : 'unknown');
  const checkpointStatus = summarizeDoctorFacet(doctor?.checkpoint);
  const browserLaneStatus = summarizeDoctorFacet(doctor?.browser);
  const approvalsPendingCount = Number(approvals?.pending_count ?? 0);
  const browserSessionCount = browserItems.length;
  const whatsappRecentCount = Array.isArray(whatsapp?.recent_messages) ? whatsapp.recent_messages.length : 0;
  const telegramRecentCount = Array.isArray(telegram?.recent_messages) ? telegram.recent_messages.length : 0;

  return (
    <div className="gateway-operator-pane app-stack-3">
      <WorkstationSurfaceCard
        title="Gateway Operator"
        description="Pair trusted devices, inspect personal channels, and manage the governed local browser lane without leaving the shell."
        actions={(
          <WorkstationActionButton
            type="button"
            tone="secondary"
            onClick={() => {
              setStatusMessage(null);
              setErrorMessage(null);
              void refreshRegistrations(true)
                .then(() => (selectedGatewayId ? refreshGatewayDetail(selectedGatewayId, false) : undefined))
                .catch((error) => {
                  setErrorMessage(error instanceof Error ? error.message : 'Could not refresh gateway operator state.');
                });
            }}
          >
            Refresh
          </WorkstationActionButton>
        )}
      >
        {statusMessage ? <WorkstationSurfaceNotice tone="success">{statusMessage}</WorkstationSurfaceNotice> : null}
        {errorMessage ? <WorkstationSurfaceNotice tone="danger">{errorMessage}</WorkstationSurfaceNotice> : null}

        <WorkstationSurfaceStatGrid>
          <WorkstationSurfaceStat
            label="Gateways"
            value={String(gateways.length)}
            hint="Trusted local runtime edges in this workspace"
          />
          <WorkstationSurfaceStat
            label="Doctor"
            value={humanizeToken(doctorStatus, 'Unknown')}
            hint="Selected gateway health posture"
          />
          <WorkstationSurfaceStat
            label="Pending approvals"
            value={String(approvalsPendingCount)}
            hint="Local actions waiting for review"
          />
          <WorkstationSurfaceStat
            label="Browser sessions"
            value={String(browserSessionCount)}
            hint="Tracked governed browser sessions"
          />
        </WorkstationSurfaceStatGrid>

        <FormSection
          title="Pair a new gateway"
          description="Create a short-lived pairing token for the device that will run empyralis-gateway."
        >
          <FormGrid columns="repeat(2, minmax(0, 1fr))">
            <FormField label="Device label" hint="Human-readable name shown in operator surfaces.">
              <FormInput
                value={pairingDraft.displayName}
                onChange={(event) => {
                  setPairingDraft((current) => ({
                    ...current,
                    displayName: event.currentTarget.value,
                  }));
                }}
                placeholder="My MacBook"
              />
            </FormField>
            <FormField label="Platform" hint="Used to help the operator identify the device target.">
              <FormSelect
                value={pairingDraft.platform}
                onChange={(event) => {
                  setPairingDraft((current) => ({
                    ...current,
                    platform: event.currentTarget.value,
                  }));
                }}
              >
                <option value="macos">macOS</option>
                <option value="windows">Windows</option>
                <option value="linux">Linux</option>
              </FormSelect>
            </FormField>
          </FormGrid>
          <div className="settings-action-row">
            <WorkstationActionButton
              type="button"
              disabled={busyActionKey === 'pairing'}
              onClick={() => {
                void handleCreatePairingIntent();
              }}
            >
              {busyActionKey === 'pairing' ? 'Creating token…' : 'Create pairing token'}
            </WorkstationActionButton>
          </div>
        </FormSection>

        {pairingIntent ? (
          <FormGrid>
            <FormReadout
              label="Pairing token"
              value={<code>{readString(pairingIntent.pairing_token, 'Unavailable')}</code>}
            />
            <FormReadout
              label="Expires"
              value={formatTimestamp(pairingIntent.expires_at)}
            />
            <FormReadout
              label="Suggested device"
              value={readString(pairingIntent.display_name, 'Unlabeled device')}
            />
            <FormReadout
              label="Platform"
              value={humanizeToken(pairingIntent.platform, 'Unknown')}
            />
          </FormGrid>
        ) : null}

        {loadingRegistrations ? (
          <WorkstationSurfaceNotice tone="neutral">Loading registered gateways…</WorkstationSurfaceNotice>
        ) : gateways.length === 0 ? (
          <EmptyPanel
            title="No gateways paired yet"
            body="Create a pairing token, open the local gateway on the target device, and finish registration there."
          />
        ) : (
          <WorkstationSurfaceList>
            {gateways.map((gateway) => {
              const gatewayId = String(gateway.gateway_id ?? '').trim();
              const selected = gatewayId === selectedGatewayId;
              return (
                <WorkstationSurfaceListItem
                  key={gatewayId}
                  title={readString(gateway.display_name, gatewayId)}
                  subtitle={`${humanizeToken(gateway.platform, 'Unknown platform')} · ${gatewayId}`}
                  description={`Trust ${humanizeToken(gateway.device_trust_state, 'unknown')} · last seen ${formatTimestamp(gateway.last_seen_at)}`}
                  actions={(
                    <div className="app-inline-actions app-inline-actions--tight">
                      <DataBadge tone={statusTone(gateway.status)}>
                        {humanizeToken(gateway.status, 'Unknown')}
                      </DataBadge>
                      <WorkstationActionButton
                        type="button"
                        tone={selected ? 'secondary' : 'primary'}
                        onClick={() => setSelectedGatewayId(gatewayId)}
                      >
                        {selected ? 'Selected' : 'Inspect'}
                      </WorkstationActionButton>
                    </div>
                  )}
                />
              );
            })}
          </WorkstationSurfaceList>
        )}
      </WorkstationSurfaceCard>

      {selectedGateway ? (
        <WorkstationSurfaceCard
          title="Gateway health"
          description="Doctor state, trust posture, checkpoint readiness, and browser attach truth for the selected gateway."
        >
          {loadingGatewayDetail ? (
            <WorkstationSurfaceNotice tone="neutral">Refreshing gateway doctor state…</WorkstationSurfaceNotice>
          ) : null}

          <FormGrid>
            <FormReadout label="Gateway" value={readString(selectedGateway.display_name, String(selectedGateway.gateway_id ?? ''))} />
            <FormReadout label="Status" value={<DataBadge tone={statusTone(doctorStatus)}>{humanizeToken(doctorStatus, 'Unknown')}</DataBadge>} />
            <FormReadout label="Platform" value={humanizeToken(selectedGateway.platform, 'Unknown')} />
            <FormReadout label="Trust state" value={humanizeToken(selectedGateway.device_trust_state, 'Unknown')} />
            <FormReadout label="Last seen" value={formatTimestamp(selectedGateway.last_seen_at)} />
            <FormReadout label="Checkpoint lane" value={<DataBadge tone={statusTone(readRecord(doctor?.checkpoint).status)}>{checkpointStatus.status}</DataBadge>} />
            <FormReadout label="Browser lane" value={<DataBadge tone={statusTone(readRecord(doctor?.browser).status)}>{browserLaneStatus.status}</DataBadge>} />
            <FormReadout label="Approvals waiting" value={String(approvalsPendingCount)} />
          </FormGrid>

          {(readRecord(doctor?.checkpoint).status || readRecord(doctor?.browser).status) ? (
            <WorkstationSurfaceList>
              <WorkstationSurfaceListItem
                title="Checkpoint readiness"
                subtitle={checkpointStatus.status}
                description={checkpointStatus.summary}
                actions={(
                  <DataBadge tone={statusTone(readRecord(doctor?.checkpoint).status)}>
                    {checkpointStatus.status}
                  </DataBadge>
                )}
              />
              <WorkstationSurfaceListItem
                title="Browser attach lane"
                subtitle={browserLaneStatus.status}
                description={browserLaneStatus.summary}
                actions={(
                  <DataBadge tone={statusTone(readRecord(doctor?.browser).status)}>
                    {browserLaneStatus.status}
                  </DataBadge>
                )}
              />
            </WorkstationSurfaceList>
          ) : null}

          {doctorChecks.length > 0 ? (
            <WorkstationSurfaceList>
              {doctorChecks.map((check) => (
                <WorkstationSurfaceListItem
                  key={readString(check.id, 'check')}
                  title={humanizeToken(check.id, 'Check')}
                  description={readString(check.summary, 'No detail available.')}
                  actions={(
                    <DataBadge tone={statusTone(check.status)}>
                      {humanizeToken(check.status, 'Unknown')}
                    </DataBadge>
                  )}
                />
              ))}
            </WorkstationSurfaceList>
          ) : (
            <EmptyPanel
              title="Doctor has no checks yet"
              body="Pair and connect the gateway to populate health, checkpoint, and personal channel status."
            />
          )}
        </WorkstationSurfaceCard>
      ) : null}

      {selectedGateway ? (
        <WorkstationSurfaceCard
          title="Personal channel state"
          description="Current login, linked identity, and recent activity for the gateway-backed personal WhatsApp and Telegram lanes."
        >
          <WorkstationSurfaceList>
            <WorkstationSurfaceListItem
              title="WhatsApp personal"
              subtitle={whatsapp?.state?.linked_name || whatsapp?.state?.linked_jid || (whatsapp?.state?.qr_code ? 'QR ready' : humanizeToken(whatsapp?.state?.status, 'Idle'))}
              description={`${summarizeWhatsappState(whatsapp?.state)}${whatsappRecentCount > 0 ? ` · ${whatsappRecentCount} recent message${whatsappRecentCount === 1 ? '' : 's'} loaded.` : ''}`}
              actions={(
                <DataBadge tone={statusTone(whatsapp?.state?.status ?? (whatsapp?.state?.qr_code ? 'pending' : 'idle'))}>
                  {whatsapp?.state?.qr_code ? 'QR ready' : humanizeToken(whatsapp?.state?.status, 'Idle')}
                </DataBadge>
              )}
            />
            {whatsapp?.state?.qr_code ? (
              <FormReadout
                label="WhatsApp QR token"
                value={<code>{readString(whatsapp.state.qr_code, 'Unavailable')}</code>}
              />
            ) : null}
            <WorkstationSurfaceListItem
              title="Telegram personal"
              subtitle={telegram?.state?.linked_name || telegram?.state?.linked_username || (telegram?.state?.login_hint ? 'Code required' : humanizeToken(telegram?.state?.status, 'Idle'))}
              description={`${summarizeTelegramState(telegram?.state)}${telegramRecentCount > 0 ? ` · ${telegramRecentCount} recent message${telegramRecentCount === 1 ? '' : 's'} loaded.` : ''}`}
              actions={(
                <DataBadge tone={statusTone(telegram?.state?.status ?? (telegram?.state?.login_hint ? 'pending' : 'idle'))}>
                  {telegram?.state?.login_hint ? 'Code required' : humanizeToken(telegram?.state?.status, 'Idle')}
                </DataBadge>
              )}
            />
            {telegram?.state?.login_hint ? (
              <FormReadout
                label="Telegram login hint"
                value={readString(telegram.state.login_hint, 'Waiting for gateway login confirmation.')}
              />
            ) : null}
          </WorkstationSurfaceList>
        </WorkstationSurfaceCard>
      ) : null}

      {selectedGateway ? (
        <WorkstationSurfaceCard
          title="Gateway approvals"
          description="Resolve risky local actions without leaving the product shell."
        >
          {pendingApprovals.length === 0 ? (
            <EmptyPanel
              title="No gateway approvals waiting"
              body="Risky local actions will appear here with explicit approve and reject controls."
            />
          ) : (
            <WorkstationSurfaceList>
              {pendingApprovals.map((approval) => {
                const approvalId = String(approval.approval_id ?? '').trim();
                const busyApprove = busyActionKey === `approval:${approvalId}:approved`;
                const busyReject = busyActionKey === `approval:${approvalId}:rejected`;
                const busy = busyApprove || busyReject;
                return (
                  <WorkstationSurfaceListItem
                    key={approvalId}
                    title={humanizeToken(approval.capability_id, 'Gateway approval')}
                    subtitle={`${approvalId} · Run ${readString(approval.run_id, 'unlinked')}`}
                    description={readString(approval.note, 'Approval required before Sage can continue on the paired device.')}
                    actions={(
                      <div className="app-inline-actions app-inline-actions--tight">
                        <DataBadge tone={statusTone(approval.status)}>
                          {humanizeToken(approval.status, 'Pending')}
                        </DataBadge>
                        <WorkstationActionButton
                          type="button"
                          tone="secondary"
                          disabled={busy}
                          onClick={() => {
                            void handleResolveApproval(approvalId, 'approved');
                          }}
                        >
                          {busyApprove ? 'Approving…' : 'Approve'}
                        </WorkstationActionButton>
                        <WorkstationActionButton
                          type="button"
                          tone="danger"
                          disabled={busy}
                          onClick={() => {
                            void handleResolveApproval(approvalId, 'rejected');
                          }}
                        >
                          {busyReject ? 'Rejecting…' : 'Reject'}
                        </WorkstationActionButton>
                      </div>
                    )}
                  />
                );
              })}
            </WorkstationSurfaceList>
          )}
        </WorkstationSurfaceCard>
      ) : null}

      {selectedGateway ? (
        <WorkstationSurfaceCard
          title="Browser sessions"
          description="Inspect gateway-owned browser sessions and take over, resume, or interrupt them without dropping into raw APIs."
        >
          {browserItems.length === 0 ? (
            <EmptyPanel
              title="No browser sessions tracked"
              body="Once the gateway starts or attaches a browser session, it will appear here with governed control actions."
            />
          ) : (
            <WorkstationSurfaceList>
              {browserItems.map((session) => {
                const browserSessionId = String(session.browser_session_id ?? '').trim();
                const sessionMode = humanizeToken((session.metadata || {}).browser_session_mode, 'Managed profile');
                const resumeSupported = Boolean(session.resume_supported ?? true);
                return (
                  <WorkstationSurfaceListItem
                    key={browserSessionId}
                    title={readString(session.session_profile, browserSessionId)}
                    subtitle={`${sessionMode} · ${resumeSupported ? 'Resume ready' : 'Resume unavailable'} · ${browserSessionId}`}
                    description={readString(session.current_url, 'No active URL reported yet.')}
                    actions={(
                      <div className="app-inline-actions app-inline-actions--tight">
                        <DataBadge tone={statusTone(session.status)}>
                          {humanizeToken(session.status, 'Unknown')}
                        </DataBadge>
                        <WorkstationActionButton
                          type="button"
                          tone="secondary"
                          disabled={Boolean(busyActionKey)}
                          onClick={() => {
                            void handleBrowserControl(browserSessionId, 'takeover');
                          }}
                        >
                          {busyActionKey === `browser:${browserSessionId}:takeover` ? 'Working…' : 'Takeover'}
                        </WorkstationActionButton>
                        <WorkstationActionButton
                          type="button"
                          tone="secondary"
                          disabled={Boolean(busyActionKey) || !resumeSupported}
                          onClick={() => {
                            void handleBrowserControl(browserSessionId, 'resume');
                          }}
                        >
                          {busyActionKey === `browser:${browserSessionId}:resume` ? 'Working…' : 'Resume'}
                        </WorkstationActionButton>
                        <WorkstationActionButton
                          type="button"
                          tone="danger"
                          disabled={Boolean(busyActionKey)}
                          onClick={() => {
                            void handleBrowserControl(browserSessionId, 'interrupt');
                          }}
                        >
                          {busyActionKey === `browser:${browserSessionId}:interrupt` ? 'Working…' : 'Interrupt'}
                        </WorkstationActionButton>
                      </div>
                    )}
                  />
                );
              })}
            </WorkstationSurfaceList>
          )}
        </WorkstationSurfaceCard>
      ) : null}
    </div>
  );
}
