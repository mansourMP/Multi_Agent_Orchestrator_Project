'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useState, type PropsWithChildren } from 'react';

import { joinClassNames, AppButton, AppNotice } from '@/lib/ui/primitives';
import {
  FormField,
  FormGrid,
  FormReadout,
  FormSection,
  FormSelect,
  FormTokenListEditor,
} from '@/lib/ui/form-controls';
import { ListDetailColumns, ListDetailPanel, ListDetailShell } from '@/lib/ui/list-detail';
import { ScrollRegion } from '@/lib/ui/scroll-region';
import { SplitPane } from '@/lib/ui/split-pane';
import {
  WorkstationShellFrame,
} from '@/lib/workspace/workstation-shell-frame';
import { WorkstationTitlebar } from '@/lib/workspace/workstation-titlebar';
import { WorkstationRosterPane } from '@/lib/workspace/workstation-roster-pane';
import { WorkstationStagePane } from '@/lib/workspace/workstation-stage-pane';
import { WorkstationDesktopStatus } from '@/lib/workspace/workstation-desktop-status';
import { WorkspaceBoundary, useWorkspaceBoundary } from '@/lib/workspace/workspace-boundary';
import { useWorkstationKernel, useWorkstationStreamState } from '@/lib/workspace/workspace-services';
import { SageTraceView } from '@/lib/workspace/sage-trace-view';
import { WorkstationSurfaceRoot } from '@/lib/workspace/workstation-surface-primitives';
import type {
  WorkstationAgentTraceEvent,
  WorkstationAgentTraceRecord,
} from '@/lib/workspace/workstation-client';
import type { WorkspaceBootstrapPayload } from '@/lib/workspace/workspace-bootstrap';

type PreviewSurfaceId = 'trace' | 'policies';

type PreviewSurfaceDefinition = {
  id: PreviewSurfaceId;
  label: string;
  subtitle: string;
  description: string;
};

type PreviewShellLayoutState = {
  rosterWidth: number;
  stageWidth: number;
};

const PREVIEW_LAYOUT_KEY = 'layout:public-preview-shell:v1';
const DEFAULT_LAYOUT: PreviewShellLayoutState = {
  rosterWidth: 308,
  stageWidth: 364,
};

const PREVIEW_WORKSPACE_ID = 'ws-preview';

const PREVIEW_SURFACES: PreviewSurfaceDefinition[] = [
  {
    id: 'trace',
    label: 'Trace Preview',
    subtitle: 'Rebuilt workstation shell with the seeded Sage trace harness.',
    description: 'Shows the titlebar, 220px rail, workstation chrome, and seeded trace surface without requiring login.',
  },
  {
    id: 'policies',
    label: 'Policies Preview',
    subtitle: 'Structured token list editor using the approved form controls only.',
    description: 'Shows the refactored policy surface patterns with local preview state and no backend dependency.',
  },
];

const PREVIEW_BOOTSTRAP: WorkspaceBootstrapPayload = {
  account: {
    id: 'preview-account',
    email: 'preview@empyralis.local',
    displayName: 'Preview Operator',
  },
  workspace: {
    id: PREVIEW_WORKSPACE_ID,
    tenantId: 'tenant-preview',
    label: 'Preview Workspace',
    kind: 'personal',
  },
  membership: {
    role: 'owner',
    permissions: [
      'workspace.manage',
      'workspace.admin',
      'workspace.preview',
    ],
    version: 'preview-v1',
  },
  capabilities: {
    approvals_enabled: true,
    artifacts_enabled: true,
    billing_read_enabled: true,
    channel_pairing_enabled: true,
    document_workstation_enabled: true,
    platform_admin_enabled: true,
    routing_read_enabled: true,
    workspace_admin_enabled: true,
  },
  entitlements: {
    plan: 'preview',
    label: 'Preview',
    source: 'local',
    flags: {
      browser_shell: true,
      public_preview: true,
    },
    limits: {
      seats: null,
      runs_per_day: null,
    },
  },
  workspaceTraits: {
    adminHeavy: true,
    complianceMode: 'standard',
    documentHeavy: true,
    operatingMode: 'preview',
  },
  runtime: {
    deploymentMode: 'cloud',
    runtimeTargets: [
      {
        id: 'runtime-cloud',
        label: 'Preview Cloud',
        kind: 'cloud',
        online: true,
        preferred: true,
      },
      {
        id: 'runtime-local',
        label: 'Local Companion',
        kind: 'local',
        online: false,
        preferred: false,
      },
    ],
  },
  shellHints: {
    defaultRoute: `/w/${PREVIEW_WORKSPACE_ID}/home`,
    preferredProfile: 'document_workstation_shell',
    setupCompleted: true,
    requiresOnboarding: false,
  },
};

function normalizeSurface(value: string | null): PreviewSurfaceId {
  return value === 'policies' ? 'policies' : 'trace';
}

function clampWidth(width: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(width)));
}

function normalizeLayoutState(
  value: Partial<PreviewShellLayoutState> | null | undefined,
): PreviewShellLayoutState {
  return {
    rosterWidth: clampWidth(value?.rosterWidth ?? DEFAULT_LAYOUT.rosterWidth, 256, 420),
    stageWidth: clampWidth(value?.stageWidth ?? DEFAULT_LAYOUT.stageWidth, 300, 520),
  };
}

function previewHref(surface: PreviewSurfaceId): string {
  return `/preview?surface=${encodeURIComponent(surface)}`;
}

function buildInlineTrace(traceId: string, workspaceId: string): WorkstationAgentTraceRecord {
  return {
    id: traceId,
    workspace_id: workspaceId,
    root_agent_id: 'sage',
    surface: 'web',
    runtime_target: 'cloud',
    provider: 'openai',
    model: 'gpt-5.4',
    outcome: 'success',
    started_at: '2026-04-13T12:00:00Z',
    finished_at: '2026-04-13T12:00:05Z',
  };
}

function buildInlineEvents(): WorkstationAgentTraceEvent[] {
  return [
    {
      id: 'evt-route',
      trace_id: 'trace-inline',
      seq: 1,
      ts: '2026-04-13T12:00:00Z',
      event_type: 'trace.routed',
      persisted: true,
      agent_id: 'sage',
      data: {
        runtime_target: 'cloud',
        provider: 'openai',
        model: 'gpt-5.4',
      },
    },
    {
      id: 'evt-plan-start',
      trace_id: 'trace-inline',
      seq: 2,
      ts: '2026-04-13T12:00:01Z',
      event_type: 'plan.started',
      persisted: true,
      agent_id: 'sage',
      data: {
        title: 'Sage Plan',
        summary: 'Inspect the request, search the web, and answer with grounded sources.',
      },
    },
    {
      id: 'evt-plan-item',
      trace_id: 'trace-inline',
      seq: 3,
      ts: '2026-04-13T12:00:02Z',
      event_type: 'plan.item.created',
      persisted: true,
      agent_id: 'sage',
      item_id: 'plan-item-1',
      data: {
        index: 1,
        title: 'Search for supporting sources',
        kind: 'tool',
        owner: 'sage',
        rationale_summary: 'The answer needs current public references.',
      },
    },
    {
      id: 'evt-tool-start',
      trace_id: 'trace-inline',
      seq: 4,
      ts: '2026-04-13T12:00:03Z',
      event_type: 'tool.started',
      persisted: true,
      agent_id: 'sage',
      item_id: 'plan-item-1',
      tool_call_id: 'tool-search-1',
      data: {
        tool_name: 'web.search',
        capability_id: 'web_search',
        connector_id: 'builtin',
        args_preview: {
          query: 'empyralist agent transparency',
        },
      },
    },
    {
      id: 'evt-query',
      trace_id: 'trace-inline',
      seq: 5,
      ts: '2026-04-13T12:00:03Z',
      event_type: 'search.query',
      persisted: true,
      agent_id: 'sage',
      tool_call_id: 'tool-search-1',
      data: {
        provider: 'web',
        query: 'empyralist agent transparency',
        filters: {},
      },
    },
    {
      id: 'evt-results',
      trace_id: 'trace-inline',
      seq: 6,
      ts: '2026-04-13T12:00:04Z',
      event_type: 'search.results',
      persisted: true,
      agent_id: 'sage',
      tool_call_id: 'tool-search-1',
      data: {
        results: [
          {
            title: 'Empyralist transparency design',
            url: 'https://example.com/transparency',
          },
        ],
      },
    },
    {
      id: 'evt-browser-shot',
      trace_id: 'trace-inline',
      seq: 7,
      ts: '2026-04-13T12:00:04Z',
      event_type: 'browser.screenshot',
      persisted: true,
      agent_id: 'sage',
      tool_call_id: 'tool-search-1',
      artifact_id: 'artifact-inline-shot',
      data: {
        caption: 'Search results screenshot',
        width: 1280,
        height: 720,
      },
    },
    {
      id: 'evt-tool-result',
      trace_id: 'trace-inline',
      seq: 8,
      ts: '2026-04-13T12:00:04Z',
      event_type: 'tool.result',
      persisted: true,
      agent_id: 'sage',
      tool_call_id: 'tool-search-1',
      data: {
        status: 'ok',
        summary: 'Found current references for the answer.',
        artifact_ids: [],
      },
    },
    {
      id: 'evt-complete',
      trace_id: 'trace-inline',
      seq: 9,
      ts: '2026-04-13T12:00:05Z',
      event_type: 'trace.completed',
      persisted: true,
      agent_id: 'sage',
      data: {
        outcome: 'success',
        duration_ms: 5100,
      },
    },
  ];
}

function PreviewSwitcher({ surface }: { surface: PreviewSurfaceId }) {
  return (
    <aside data-workstation-switcher="rail" className="account-switcher">
      <div className="account-switcher__brand">Empyralis</div>

      <nav aria-label="Preview switcher" className="account-switcher__nav">
        {PREVIEW_SURFACES.map((entry) => (
          <Link
            key={entry.id}
            href={previewHref(entry.id)}
            className={joinClassNames(
              'account-switcher__link',
              surface === entry.id && 'account-switcher__link--active',
            )}
          >
            {entry.label}
          </Link>
        ))}
      </nav>

      <div className="app-stack-2">
        <Link href="/login" className="account-switcher__action">
          Open login
        </Link>
        <div className="account-switcher__meta">
          Public preview · no auth required · local shell specimen
        </div>
      </div>
    </aside>
  );
}

function PreviewCommandBar({ surface }: { surface: PreviewSurfaceId }) {
  return (
    <nav aria-label="Preview navigation" data-workstation-command-bar="root" className="workstation-command-bar">
      <div className="workstation-command-bar__group">
        <span className="workstation-command-bar__label">Preview</span>
        <div className="workstation-command-bar__routes">
          {PREVIEW_SURFACES.map((entry) => (
            <Link
              key={entry.id}
              href={previewHref(entry.id)}
              className={joinClassNames(
                'workstation-command-bar__link',
                surface === entry.id && 'workstation-command-bar__link--active',
              )}
            >
              {entry.label}
            </Link>
          ))}
        </div>
      </div>
    </nav>
  );
}

function PreviewPane({
  paneId,
  title,
  subtitle,
  children,
}: PropsWithChildren<{
  paneId: '2' | '3' | '4';
  title: string;
  subtitle: string;
}>) {
  return (
    <section data-workstation-pane={paneId} className="workstation-pane">
      <header className="workstation-pane__header">
        <strong className="workstation-pane__title">{title}</strong>
        <span className="workstation-pane__subtitle">{subtitle}</span>
      </header>

      <ScrollRegion>{children}</ScrollRegion>
    </section>
  );
}

function PreviewTraceSurface() {
  const { bootstrap } = useWorkspaceBoundary();
  const [additiveEvents, setAdditiveEvents] = useState<WorkstationAgentTraceEvent[]>([]);

  const initialTrace = useMemo(
    () => buildInlineTrace('trace-inline', bootstrap.workspace.id),
    [bootstrap.workspace.id],
  );

  const initialEvents = useMemo(
    () => buildInlineEvents(),
    [],
  );

  return (
    <main data-workstation-surface="trace-preview" className="app-stack-4">
      <section className="app-stack-2">
        <span className="app-meta-label">Public Preview</span>
        <h1 className="stage-detail-layout__title">Sage Trace View Harness</h1>
        <AppNotice>
          This preview route renders the rebuilt workstation shell without requiring login or live backend data.
        </AppNotice>
      </section>

      <section className="app-inline-actions">
        <AppButton
          type="button"
          tone="secondary"
          onClick={() => {
            setAdditiveEvents((current) => [
              ...current,
              {
                id: `evt-reasoning-${current.length + 1}`,
                trace_id: 'trace-inline',
                seq: 100 + current.length,
                event_type: 'reasoning.summary.delta',
                persisted: false,
                agent_id: 'sage',
                item_id: 'plan-item-1',
                data: {
                  delta: 'Cross-checking the latest source before answering.',
                },
              },
            ]);
          }}
        >
          Inject reasoning delta
        </AppButton>
      </section>

      <SageTraceView
        traceId="trace-inline"
        mode="replay"
        initialTrace={initialTrace}
        initialEvents={initialEvents}
        additiveEvents={additiveEvents}
      />
    </main>
  );
}

function PreviewPoliciesSurface() {
  const [allowCapabilities, setAllowCapabilities] = useState<string[]>([
    'workspace.manage',
    'approvals.review',
  ]);
  const [denyCapabilities, setDenyCapabilities] = useState<string[]>([
    'workspace.delete',
  ]);
  const [allowConnectors, setAllowConnectors] = useState<string[]>([
    'github',
    'slack',
  ]);
  const [denyConnectors, setDenyConnectors] = useState<string[]>([
    'gmail',
  ]);
  const [trustedMachines, setTrustedMachines] = useState<string[]>([
    'machine_alpha',
    'machine_beta',
  ]);
  const [machineEnrollmentScope, setMachineEnrollmentScope] = useState('workspace');

  return (
    <WorkstationSurfaceRoot surface="preview/policies">
      <ListDetailShell
        title="Policies Preview"
        subtitle="Structured token editors and token-scale admin chrome rendered from local preview state."
        actions={(
          <AppButton
            type="button"
            tone="secondary"
            onClick={() => {
              setAllowCapabilities(['workspace.manage', 'approvals.review']);
              setDenyCapabilities(['workspace.delete']);
              setAllowConnectors(['github', 'slack']);
              setDenyConnectors(['gmail']);
              setTrustedMachines(['machine_alpha', 'machine_beta']);
              setMachineEnrollmentScope('workspace');
            }}
          >
            Reset preview
          </AppButton>
        )}
      >
        <ListDetailColumns
          primary={(
            <ListDetailPanel
              eyebrow="Policy"
              title="Access and enrollment controls"
              subtitle="This is a local specimen of the refactored policy editor with no backend dependency."
            >
              <FormSection
                title="Capabilities"
                description="Allow and deny lists for high-level workspace capabilities."
              >
                <FormGrid>
                  <FormField label="Capability allow" hint="Add allowed capability tokens one at a time.">
                    <FormTokenListEditor
                      value={allowCapabilities}
                      onChange={setAllowCapabilities}
                      placeholder="workspace.manage"
                      emptyLabel="No allowed capabilities."
                    />
                  </FormField>
                  <FormField label="Capability deny" hint="Explicit capability blocks.">
                    <FormTokenListEditor
                      value={denyCapabilities}
                      onChange={setDenyCapabilities}
                      placeholder="workspace.delete"
                      emptyLabel="No denied capabilities."
                    />
                  </FormField>
                </FormGrid>
              </FormSection>

              <FormSection
                title="Connectors"
                description="Connector-level allow and deny lists for this workspace."
              >
                <FormGrid>
                  <FormField label="Connector allow" hint="Allowed connector identifiers.">
                    <FormTokenListEditor
                      value={allowConnectors}
                      onChange={setAllowConnectors}
                      placeholder="github"
                      emptyLabel="No allowed connectors."
                    />
                  </FormField>
                  <FormField label="Connector deny" hint="Use for explicit blocks.">
                    <FormTokenListEditor
                      value={denyConnectors}
                      onChange={setDenyConnectors}
                      placeholder="gmail"
                      emptyLabel="No denied connectors."
                    />
                  </FormField>
                </FormGrid>
              </FormSection>

              <FormSection
                title="Enrollment"
                description="Machine enrollment scope and trusted machine state."
              >
                <FormGrid>
                  <FormField label="Machine enrollment scope" hint="Scope applied when enrolling operator machines.">
                    <FormSelect
                      value={machineEnrollmentScope}
                      onChange={(event) => setMachineEnrollmentScope(event.currentTarget.value)}
                    >
                      <option value="workspace">workspace</option>
                      <option value="tenant">tenant</option>
                      <option value="global">global</option>
                    </FormSelect>
                  </FormField>
                  <FormField label="Trusted owner machine ids" hint="Add each trusted machine identifier separately.">
                    <FormTokenListEditor
                      value={trustedMachines}
                      onChange={setTrustedMachines}
                      placeholder="machine_123"
                      emptyLabel="No trusted owner machines."
                    />
                  </FormField>
                </FormGrid>
              </FormSection>
            </ListDetailPanel>
          )}
          secondary={(
            <div className="app-stack-4">
              <ListDetailPanel
                eyebrow="Summary"
                title="Preview state"
                subtitle="Local readouts to verify the structured list editor behavior."
              >
                <FormGrid columns="repeat(auto-fit, minmax(12rem, 1fr))">
                  <FormReadout label="Allowed capabilities" value={String(allowCapabilities.length)} />
                  <FormReadout label="Denied capabilities" value={String(denyCapabilities.length)} />
                  <FormReadout label="Allowed connectors" value={String(allowConnectors.length)} />
                  <FormReadout label="Denied connectors" value={String(denyConnectors.length)} />
                  <FormReadout label="Trusted machines" value={String(trustedMachines.length)} />
                  <FormReadout label="Enrollment scope" value={machineEnrollmentScope} />
                </FormGrid>
              </ListDetailPanel>

              <ListDetailPanel
                eyebrow="Why"
                title="What this proves"
                subtitle="This route exists so you can inspect the refactored UI immediately from a clean local browser."
              >
                <div className="app-stack-2">
                  <p className="app-surface-description">
                    No login, no seeded backend data, and no comma-separated token inputs. The editor is the same tokenized list pattern used in the workstation policy refactor.
                  </p>
                  <Link href="/login" className="app-link-button app-link-button--primary">
                    Return to authenticated app
                  </Link>
                </div>
              </ListDetailPanel>
            </div>
          )}
        />
      </ListDetailShell>
    </WorkstationSurfaceRoot>
  );
}

function PreviewSurfaceRenderer({ surface }: { surface: PreviewSurfaceId }) {
  if (surface === 'policies') {
    return <PreviewPoliciesSurface />;
  }
  return <PreviewTraceSurface />;
}

function PublicPreviewKernelShell({
  surface,
  queryString,
}: {
  surface: PreviewSurfaceId;
  queryString: string;
}) {
  const pathname = usePathname();
  const kernel = useWorkstationKernel();
  const streamState = useWorkstationStreamState();
  const [layout, setLayout] = useState<PreviewShellLayoutState>(() =>
    normalizeLayoutState(
      kernel.persistence.getJson<PreviewShellLayoutState>(PREVIEW_LAYOUT_KEY),
    ),
  );

  useEffect(() => {
    kernel.persistence.setJson(PREVIEW_LAYOUT_KEY, layout);
  }, [kernel, layout]);

  const surfaceDefinition = PREVIEW_SURFACES.find((entry) => entry.id === surface) ?? PREVIEW_SURFACES[0];
  const rosterSubtitle = `${streamState.notifications.unreadCount} unread notifications · ${streamState.activity.totalCount} recent events`;
  const surfaceSubtitle = `Public preview surface · ${surfaceDefinition.label}`;
  const stageSubtitle = `Inspector context · ${pathname}${queryString ? `?${queryString}` : ''}`;

  return (
    <div data-workstation-shell="kernel" className="workstation-shell">
      <WorkstationTitlebar
        surfaceLabel={surfaceDefinition.label}
        diagnosticsVisible={false}
        onToggleDiagnostics={() => {}}
      />

      <PreviewCommandBar surface={surface} />
      <WorkstationDesktopStatus />

      <SplitPane
        primary="first"
        size={layout.rosterWidth}
        minSize={256}
        maxSize={420}
        handleLabel="Resize preview inventory"
        onSizeChange={(nextWidth) => {
          setLayout((current) => ({
            ...current,
            rosterWidth: clampWidth(nextWidth, 256, 420),
          }));
        }}
      >
        <PreviewPane paneId="2" title="Workspace" subtitle={rosterSubtitle}>
          <WorkstationRosterPane />
        </PreviewPane>

        <SplitPane
          primary="second"
          size={layout.stageWidth}
          minSize={300}
          maxSize={520}
          handleLabel="Resize preview inspector"
          onSizeChange={(nextWidth) => {
            setLayout((current) => ({
              ...current,
              stageWidth: clampWidth(nextWidth, 300, 520),
            }));
          }}
        >
          <PreviewPane paneId="3" title={surfaceDefinition.label} subtitle={surfaceSubtitle}>
            <PreviewSurfaceRenderer surface={surface} />
          </PreviewPane>

          <PreviewPane paneId="4" title="Inspector" subtitle={stageSubtitle}>
            <WorkstationStagePane />
          </PreviewPane>
        </SplitPane>
      </SplitPane>
    </div>
  );
}

export function PublicWorkstationPreview({
  initialSurface,
  initialQueryString = '',
}: {
  initialSurface?: string | null;
  initialQueryString?: string;
}) {
  const surface = normalizeSurface(initialSurface ?? null);

  return (
    <WorkspaceBoundary workspaceId={PREVIEW_WORKSPACE_ID} bootstrap={PREVIEW_BOOTSTRAP}>
      <WorkstationShellFrame
        switcherPane={<PreviewSwitcher surface={surface} />}
        kernelPane={<PublicPreviewKernelShell surface={surface} queryString={initialQueryString} />}
      />
    </WorkspaceBoundary>
  );
}
