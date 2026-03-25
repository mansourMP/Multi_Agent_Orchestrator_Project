'use client';

import Link from 'next/link';
import { FileStack, RefreshCw, Search } from 'lucide-react';
import { AGENT_ROLE_OPTIONS, type AgentRoleId } from '@/app/page.catalog';
import { OsPageHeader } from '@/components/ui/OsPageHeader';
import { PageCollection } from '@/components/orion/page/PageCollection';
import { PageFilterBar } from '@/components/orion/page/PageFilterBar';
import { PageHero } from '@/components/orion/page/PageHero';
import { PageHeroCard } from '@/components/orion/page/PageHeroCard';
import { EmptyState } from '@/components/orion/state/EmptyState';
import { ErrorState } from '@/components/orion/state/ErrorState';
import { LoadingState } from '@/components/orion/state/LoadingState';
import { RetryActions } from '@/components/orion/state/RetryActions';
import { ArtifactCard } from '@/components/orion/artifacts/ArtifactCard';
import {
  useArtifactsBrowser,
} from '@/hooks/pages/useArtifactsBrowser';
import {
  artifactViewLabel,
  isLocalFileTarget,
  toDateLabel,
  type ArtifactView,
  type KindFilter,
} from '@/lib/artifactsPresentation';

export default function ArtifactsPage() {
  const {
    payload,
    loading,
    error,
    refresh,
    query,
    setQuery,
    viewMode,
    setViewMode,
    kindFilter,
    setKindFilter,
    agentFilter,
    setAgentFilter,
    channelFilter,
    setChannelFilter,
    filteredItems,
    viewSummary,
    latestArtifact,
    channelOptions,
    hasActiveFilters,
    clearFilters,
    openArtifact,
    revealArtifact,
    revealLabel,
    desktopBridge,
    previewTargetById,
  } = useArtifactsBrowser();

  return (
    <div className="orion-page-shell orion-animate-in">
      <OsPageHeader
        icon={<FileStack size={18} />}
        title="Assets"
        subtitle="Outputs, files, and evidence from your agent runs."
        meta={
          <>
            <span>{filteredItems.length} visible</span>
            {payload ? <span>{payload.summary.total} total</span> : null}
          </>
        }
        actions={
          <button className="orion-btn orion-btn-ghost" onClick={() => void refresh()}>
            <RefreshCw size={14} />
            Refresh
          </button>
        }
      />

      <PageHero
        kicker="Evidence and outputs"
        title="Open deliverables, inspect proof, and trace what each run produced."
        copy="Assets are the execution record. Use this page to review final deliverables, screenshots, and support files without digging through raw run logs first."
        actions={
          <>
            <button className="btn-secondary" onClick={() => void refresh()}>
              <RefreshCw size={14} />
              Refresh
            </button>
            <Link href="/executions" className="btn-secondary">
              Open Runs
            </Link>
          </>
        }
        aside={
          <>
            <PageHeroCard label="Current totals">
              <div className="orion-home-side-stats">
                <div>
                  <div className="orion-home-side-value">{viewSummary.deliverables}</div>
                  <div className="orion-home-side-note">Deliverables</div>
                </div>
                <div>
                  <div className="orion-home-side-value">{viewSummary.evidence}</div>
                  <div className="orion-home-side-note">Evidence items</div>
                </div>
              </div>
              <div className="orion-runs-overview-side-note">
                {latestArtifact
                  ? `Latest update ${toDateLabel(latestArtifact.updated_at)}`
                  : 'No saved outputs yet.'}
              </div>
            </PageHeroCard>
            <PageHeroCard label="Quick focus">
              <div className="orion-home-mini-list">
                <button type="button" className="orion-home-mini-link" onClick={() => setViewMode('deliverables')}>
                  <span>Deliverables</span>
                  <span>{viewSummary.deliverables}</span>
                </button>
                <button type="button" className="orion-home-mini-link" onClick={() => setViewMode('evidence')}>
                  <span>Evidence</span>
                  <span>{viewSummary.evidence}</span>
                </button>
                <button type="button" className="orion-home-mini-link" onClick={() => setViewMode('system')}>
                  <span>System files</span>
                  <span>{viewSummary.system}</span>
                </button>
              </div>
            </PageHeroCard>
          </>
        }
      />

      <PageFilterBar
        title="Browse assets"
        description="Filter outputs, proof, and support files by type, handler, or channel."
        summary={
          <>
            <span className="orion-chip">{filteredItems.length} shown</span>
            {payload ? <span className="orion-chip">{payload.summary.total} saved</span> : null}
          </>
        }
      >
        <div className="orion-page-filter-grid is-search-and-supporting">
          <div className="orion-segmented">
            {(['deliverables', 'evidence', 'system', 'all'] as ArtifactView[]).map((view) => {
              const count =
                view === 'deliverables'
                  ? viewSummary.deliverables
                  : view === 'evidence'
                    ? viewSummary.evidence
                    : view === 'system'
                      ? viewSummary.system
                      : viewSummary.total;
              const active = viewMode === view;

              return (
                <button
                  key={view}
                  className={`orion-segmented-btn${active ? ' is-active' : ''}`}
                  onClick={() => setViewMode(view)}
                >
                  {artifactViewLabel(view)}
                  <span className={`orion-segmented-badge${active ? ' is-active' : ''}`}>{count}</span>
                </button>
              );
            })}
          </div>
          <div className="orion-toolbar-input-wrap" style={{ width: '100%', maxWidth: '100%' }}>
            <Search size={14} className="icon" />
            <input
              className="input"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search assets, tasks, or channels"
              style={{ paddingLeft: 36, height: 42, borderRadius: 11 }}
            />
          </div>
        </div>

        <div className="orion-page-filter-grid is-toolbar">
          <select
            className="input"
            value={kindFilter}
            onChange={(event) => setKindFilter(event.target.value as KindFilter)}
            style={{ height: 42, minWidth: 0, borderRadius: 11 }}
          >
            <option value="all">All kinds</option>
            <option value="screenshots">Screenshots</option>
            <option value="reports">Reports</option>
            <option value="data">Data</option>
            <option value="links">Links</option>
            <option value="files">Saved files</option>
          </select>
          <select
            className="input"
            value={agentFilter}
            onChange={(event) => setAgentFilter(event.target.value as 'all' | AgentRoleId)}
            style={{ height: 42, minWidth: 0, borderRadius: 11 }}
          >
            <option value="all">All handlers</option>
            {AGENT_ROLE_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>{option.label}</option>
            ))}
          </select>
          <select
            className="input"
            value={channelFilter}
            onChange={(event) => setChannelFilter(event.target.value)}
            style={{ height: 42, minWidth: 0, borderRadius: 11 }}
          >
            <option value="all">All channels</option>
            {channelOptions.map((channel) => (
              <option key={channel} value={channel}>{channel}</option>
            ))}
          </select>
          {hasActiveFilters ? (
            <button className="orion-btn orion-btn-ghost" style={{ minHeight: 42, paddingInline: 12 }} onClick={clearFilters}>
              Clear filters
            </button>
          ) : null}
        </div>
      </PageFilterBar>

      {loading ? (
        <LoadingState
          title="Loading assets"
          copy="Reading outputs, proof, and support files from recent runs."
        />
      ) : error ? (
        <ErrorState
          title="Assets are unavailable"
          copy={error}
          actions={<RetryActions onRetry={() => void refresh()} />}
        />
      ) : filteredItems.length === 0 ? (
        <EmptyState
          title="No assets yet"
          filtered={hasActiveFilters}
          copy={
            viewMode === 'deliverables'
              ? 'Assets created by your agents will appear here.'
              : viewMode === 'evidence'
                ? 'Capture screenshots or browser proof, or widen the filters to show more evidence.'
                : viewMode === 'system'
                  ? 'No support files match this view yet. Try another filter or switch back to deliverables.'
                  : 'Change the filters or run something new.'
          }
          actions={
            hasActiveFilters ? (
              <RetryActions onRetry={clearFilters} retryLabel="Clear filters" />
            ) : (
              <RetryActions onRetry={() => void refresh()} />
            )
          }
        />
      ) : (
        <PageCollection className="orion-home-list-panel" bodyClassName="orion-asset-collection-body">
          <section className="orion-asset-grid">
            {filteredItems.map((item, index) => {
              const previewTarget = previewTargetById.get(item.id) || item;
              const resolvedLocation = String(previewTarget.uri_or_path || '').trim();
              const showReveal = Boolean(desktopBridge?.desktop && isLocalFileTarget(resolvedLocation));
              const rowKey = [item.id, item.run_id || '', item.updated_at || '', item.uri_or_path || ''].join('::');

              return (
                <ArtifactCard
                  key={`${rowKey}::${index}`}
                  item={item}
                  previewTarget={previewTarget}
                  revealLabel={revealLabel}
                  viewMode={viewMode}
                  showReveal={showReveal}
                  onOpen={() => void openArtifact(item)}
                  onReveal={() => void revealArtifact(item)}
                />
              );
            })}
          </section>
        </PageCollection>
      )}
    </div>
  );
}
