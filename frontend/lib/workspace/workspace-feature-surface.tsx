'use client';

import Link from 'next/link';
import {
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react';

import { useWorkspaceBoundary } from '@/lib/workspace/workspace-boundary';
import { useWorkspaceServices } from '@/lib/workspace/workspace-services';
import type { WorkspaceRouteId } from '@/lib/workspace/workspace-shell';

type WorkspaceFeatureViewMode = 'summary' | 'detail';

type WorkspaceFeatureState = {
  scopeKey: string;
  note: string;
  visitCount: number;
  lastOpenedAt: string | null;
  viewMode: WorkspaceFeatureViewMode;
};

type WorkspaceFeatureDefinition = {
  title: string;
  description: string;
  sectionTitle: string;
  sectionItems: string[];
};

const FEATURE_DEFINITIONS: Record<WorkspaceRouteId, WorkspaceFeatureDefinition> = {
  chat: {
    title: 'Chat',
    description: 'Workspace-scoped conversation surface with local notes and route-safe continuity.',
    sectionTitle: 'Restored chat scaffolds',
    sectionItems: ['conversation context', 'draft note', 'manifest-gated entry'],
  },
  workstation: {
    title: 'Workstation',
    description: 'Document-oriented shell surface for split-pane work under the document workstation profile.',
    sectionTitle: 'Restored workstation scaffolds',
    sectionItems: ['document mode summary', 'workspace traits', 'profile-gated shell'],
  },
  runs: {
    title: 'Runs',
    description: 'Execution history surface bound to workspace runtime and scoped local state.',
    sectionTitle: 'Restored run scaffolds',
    sectionItems: ['runtime summary', 'visit state', 'route manifest gating'],
  },
  approvals: {
    title: 'Approvals',
    description: 'Approval review surface gated by backend capabilities instead of role strings.',
    sectionTitle: 'Restored approval scaffolds',
    sectionItems: ['approval capability checks', 'workspace review note', 'safe route fallback'],
  },
  artifacts: {
    title: 'Artifacts',
    description: 'Artifact/file surface with workspace-scoped persistence and disposable object URLs.',
    sectionTitle: 'Restored artifact scaffolds',
    sectionItems: ['artifact capability checks', 'download preview URL', 'scoped persistence'],
  },
  notifications: {
    title: 'Notifications',
    description: 'Notification surface using boundary-scoped realtime helpers and local workspace state.',
    sectionTitle: 'Restored notification scaffolds',
    sectionItems: ['poller registration', 'workspace-scoped activity note', 'safe route entry'],
  },
  applications: {
    title: 'Applications',
    description: 'Workspace application shelf running under the scoped workspace services layer.',
    sectionTitle: 'Restored application scaffolds',
    sectionItems: ['application surface note', 'workspace state', 'manifest-safe route'],
  },
  agents: {
    title: 'Agents',
    description: 'Agent/workbench surface for workspace-bound operator state.',
    sectionTitle: 'Restored agent scaffolds',
    sectionItems: ['agent inventory note', 'runtime targets', 'workspace-only store'],
  },
  activity: {
    title: 'Activity',
    description: 'Workspace activity view with local notes and manifest-driven route safety.',
    sectionTitle: 'Restored activity scaffolds',
    sectionItems: ['activity note', 'workspace timeline summary', 'boundary-only state'],
  },
  integrations: {
    title: 'Integrations',
    description: 'Integration surface rooted in workspace runtime and capability truth.',
    sectionTitle: 'Restored integration scaffolds',
    sectionItems: ['integration note', 'workspace capabilities', 'runtime attachment summary'],
  },
  settings: {
    title: 'Settings',
    description: 'Workspace settings surface derived from bootstrap truth and scoped services.',
    sectionTitle: 'Restored settings scaffolds',
    sectionItems: ['workspace settings note', 'entitlement summary', 'workspace-scoped persistence'],
  },
  admin: {
    title: 'Admin',
    description: 'Admin overview surface for operations workspaces only.',
    sectionTitle: 'Restored admin scaffolds',
    sectionItems: ['admin capability checks', 'ops route manifest', 'workspace-only admin note'],
  },
  'admin/billing': {
    title: 'Billing',
    description: 'Billing administration surface gated by billing capabilities.',
    sectionTitle: 'Restored billing scaffolds',
    sectionItems: ['billing capability checks', 'plan summary', 'workspace admin state'],
  },
  'admin/routing': {
    title: 'Routing',
    description: 'Routing administration surface gated by routing capabilities.',
    sectionTitle: 'Restored routing scaffolds',
    sectionItems: ['routing capability checks', 'deployment summary', 'workspace admin state'],
  },
  'admin/members': {
    title: 'Members',
    description: 'Membership administration surface with workspace-only notes and gating.',
    sectionTitle: 'Restored membership scaffolds',
    sectionItems: ['admin capability checks', 'workspace member note', 'safe route fallback'],
  },
  'admin/policies': {
    title: 'Policies',
    description: 'Policy administration surface for governance-heavy workspaces.',
    sectionTitle: 'Restored policy scaffolds',
    sectionItems: ['policy capability checks', 'compliance summary', 'workspace admin state'],
  },
};

function createDefaultFeatureState(
  featureId: WorkspaceRouteId,
  scopeKey: string,
  workspaceLabel: string,
): WorkspaceFeatureState {
  return {
    scopeKey,
    note: `${workspaceLabel} · ${FEATURE_DEFINITIONS[featureId].title}`,
    visitCount: 0,
    lastOpenedAt: null,
    viewMode: 'summary',
  };
}

function useWorkspaceFeatureState(featureId: WorkspaceRouteId) {
  const { bootstrap, routeManifest, shellProfile, hasCapability } = useWorkspaceBoundary();
  const services = useWorkspaceServices();
  const featureDefinition = FEATURE_DEFINITIONS[featureId];
  const persistenceKey = `feature:${featureId}:surface`;
  const persistedState = useMemo(
    () => services.persistence.getJson<WorkspaceFeatureState>(persistenceKey),
    [persistenceKey, services],
  );
  const store = useMemo(
    () => services.stores.createStore<WorkspaceFeatureState>(
      `feature:${featureId}`,
      persistedState ?? createDefaultFeatureState(featureId, services.scopeKey, bootstrap.workspace.label),
    ),
    [bootstrap.workspace.label, featureId, persistedState, persistenceKey, services],
  );
  const state = useSyncExternalStore(store.subscribe, store.getState, store.getState);
  const route = routeManifest.routeIndex[featureId];
  const summary = useMemo(
    () => ({
      featureId,
      title: featureDefinition.title,
      workspaceId: bootstrap.workspace.id,
      workspaceLabel: bootstrap.workspace.label,
      shellProfileId: shellProfile.id,
      entitlementPlan: bootstrap.entitlements.plan,
      defaultRoute: routeManifest.defaultRoute,
      routeHref: route?.href ?? null,
      requiredCapabilities: route?.requiredCapabilities ?? [],
      servicesScopeKey: services.scopeKey,
    }),
    [
      bootstrap.entitlements.plan,
      bootstrap.workspace.id,
      bootstrap.workspace.label,
      featureDefinition.title,
      featureId,
      route,
      routeManifest.defaultRoute,
      services.scopeKey,
      shellProfile.id,
    ],
  );

  useEffect(() => {
    services.queryClient.set(`feature:${featureId}:summary`, summary);
  }, [featureId, services, summary]);

  useEffect(() => {
    const currentState = store.getState();
    store.setState({
      ...currentState,
      scopeKey: services.scopeKey,
      visitCount: currentState.visitCount + 1,
      lastOpenedAt: new Date().toISOString(),
    });
  }, [featureId, services.scopeKey, store]);

  useEffect(() => {
    services.persistence.setJson(persistenceKey, state);
  }, [persistenceKey, services, state]);

  const updateNote = (note: string) => {
    store.setState({
      ...store.getState(),
      note,
    });
  };

  const toggleViewMode = () => {
    const currentState = store.getState();
    store.setState({
      ...currentState,
      viewMode: currentState.viewMode === 'summary' ? 'detail' : 'summary',
    });
  };

  return {
    bootstrap,
    featureDefinition,
    hasCapability,
    route,
    routeManifest,
    services,
    shellProfile,
    state,
    summary,
    toggleViewMode,
    updateNote,
  };
}

function useArtifactPreviewUrl(featureId: WorkspaceRouteId, payload: unknown) {
  const services = useWorkspaceServices();
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (featureId !== 'artifacts') {
      setUrl(null);
      return;
    }

    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    });
    const nextUrl = services.disposables.trackObjectUrl(URL.createObjectURL(blob));
    setUrl(nextUrl);
  }, [featureId, payload, services]);

  return url;
}

function useNotificationPoller(featureId: WorkspaceRouteId) {
  const services = useWorkspaceServices();
  const [pulseCount, setPulseCount] = useState(0);

  useEffect(() => {
    if (featureId !== 'notifications') {
      return;
    }

    return services.realtime.registerPoller(() => {
      setPulseCount((value) => value + 1);
    }, 30000);
  }, [featureId, services]);

  return pulseCount;
}

export function WorkspaceFeatureSurface({
  featureId,
}: {
  featureId: WorkspaceRouteId;
}) {
  const {
    bootstrap,
    featureDefinition,
    hasCapability,
    route,
    routeManifest,
    services,
    shellProfile,
    state,
    summary,
    toggleViewMode,
    updateNote,
  } = useWorkspaceFeatureState(featureId);
  const artifactPreviewUrl = useArtifactPreviewUrl(featureId, summary);
  const notificationPulseCount = useNotificationPoller(featureId);

  return (
    <main
      style={{
        minHeight: '100vh',
        padding: '2rem 3rem',
        display: 'grid',
        gap: '1.5rem',
      }}
    >
      <header style={{ display: 'grid', gap: '0.5rem' }}>
        <h1 style={{ margin: 0, fontSize: '1.6rem' }}>{featureDefinition.title}</h1>
        <p style={{ margin: 0, maxWidth: '58rem', lineHeight: 1.6 }}>
          {featureDefinition.description}
        </p>
      </header>

      <section
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(16rem, 1fr))',
          gap: '0.9rem',
        }}
      >
        <SummaryCard label="Workspace" value={bootstrap.workspace.label} />
        <SummaryCard label="Shell Profile" value={shellProfile.label} />
        <SummaryCard label="Plan" value={bootstrap.entitlements.label} />
        <SummaryCard label="Route" value={route?.href ?? routeManifest.defaultRoute} />
      </section>

      <section
        style={{
          display: 'grid',
          gap: '0.75rem',
          padding: '1rem',
          borderRadius: '1rem',
          border: '1px solid #cbd5e1',
          background: '#ffffff',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
          <div style={{ display: 'grid', gap: '0.25rem' }}>
            <strong>{featureDefinition.sectionTitle}</strong>
            <span style={{ color: '#475569' }}>
              Workspace-only state stored under <code>{services.scopeKey}</code>
            </span>
          </div>
          <button
            type="button"
            onClick={toggleViewMode}
            style={{
              border: '1px solid #94a3b8',
              borderRadius: '999px',
              background: '#f8fafc',
              padding: '0.45rem 0.8rem',
              cursor: 'pointer',
            }}
          >
            Toggle view: {state.viewMode}
          </button>
        </div>

        <ul style={{ margin: 0, paddingLeft: '1.25rem', display: 'grid', gap: '0.35rem' }}>
          {featureDefinition.sectionItems.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>

        <label style={{ display: 'grid', gap: '0.45rem' }}>
          <span style={{ fontWeight: 600 }}>Workspace note</span>
          <textarea
            value={state.note}
            onChange={(event) => updateNote(event.currentTarget.value)}
            rows={4}
            style={{
              width: '100%',
              resize: 'vertical',
              borderRadius: '0.85rem',
              border: '1px solid #cbd5e1',
              padding: '0.8rem 0.9rem',
              font: 'inherit',
            }}
          />
        </label>
      </section>

      <section
        style={{
          display: 'grid',
          gap: '0.75rem',
          padding: '1rem',
          borderRadius: '1rem',
          border: '1px solid #cbd5e1',
          background: '#f8fafc',
        }}
      >
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {[
            ['approvals_enabled', 'Approvals'],
            ['artifacts_enabled', 'Artifacts'],
            ['document_workstation_enabled', 'Workstation'],
            ['workspace_admin_enabled', 'Admin'],
            ['billing_read_enabled', 'Billing'],
            ['routing_read_enabled', 'Routing'],
          ].map(([capability, label]) => (
            <CapabilityPill
              key={capability}
              label={label}
              enabled={hasCapability(capability)}
            />
          ))}
        </div>
        <pre
          style={{
            margin: 0,
            padding: '1rem',
            borderRadius: '0.85rem',
            background: '#0f172a',
            color: '#e2e8f0',
            overflow: 'auto',
          }}
        >
          {JSON.stringify(
            {
              summary,
              state,
              routeManifest,
              serviceSnapshot: services.snapshot(),
              notificationPulseCount,
            },
            null,
            2,
          )}
        </pre>
        {artifactPreviewUrl ? (
          <Link href={artifactPreviewUrl} download={`${featureId}-${bootstrap.workspace.id}.json`}>
            Download artifact preview
          </Link>
        ) : null}
      </section>
    </main>
  );
}

function SummaryCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div
      style={{
        padding: '1rem',
        borderRadius: '1rem',
        border: '1px solid #cbd5e1',
        background: '#ffffff',
        display: 'grid',
        gap: '0.35rem',
      }}
    >
      <span style={{ fontSize: '0.85rem', color: '#64748b' }}>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function CapabilityPill({
  enabled,
  label,
}: {
  enabled: boolean;
  label: string;
}) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.35rem',
        padding: '0.35rem 0.7rem',
        borderRadius: '999px',
        background: enabled ? '#dcfce7' : '#e2e8f0',
        color: enabled ? '#166534' : '#334155',
        fontSize: '0.85rem',
        fontWeight: 600,
      }}
    >
      {label}: {enabled ? 'enabled' : 'blocked'}
    </span>
  );
}
