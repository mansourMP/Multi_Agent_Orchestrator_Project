'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { RefreshCw, Search } from 'lucide-react';
import { AGENT_ROLE_OPTIONS, type AgentRoleId } from '@/app/page.catalog';
import { Input } from '@/components/ui/input';
import { PageCollection } from '@/components/orion/page/PageCollection';
import { PageFilterBar } from '@/components/orion/page/PageFilterBar';
import { PageHero } from '@/components/orion/page/PageHero';
import { PageHeroCard } from '@/components/orion/page/PageHeroCard';
import { EmptyState } from '@/components/orion/state/EmptyState';
import { ErrorState } from '@/components/orion/state/ErrorState';
import { LoadingState } from '@/components/orion/state/LoadingState';
import { RetryActions } from '@/components/orion/state/RetryActions';
import { ArtifactCard } from '@/components/orion/artifacts/ArtifactCard';
import { ArtifactDetailPane } from '@/components/orion/artifacts/ArtifactDetailPane';
import {
  useArtifactsBrowser,
} from '@/hooks/pages/useArtifactsBrowser';
import {
  artifactSurfaceLabel,
  artifactViewLabel,
  isLocalFileTarget,
  toDateLabel,
  type ArtifactView,
  type KindFilter,
} from '@/lib/artifactsPresentation';
import {
  DESIGN_TOKENS,
  bodyTextStyle,
  buttonStyle,
  inputStyle,
  mergeStyles,
  metaTextStyle,
  pageShellStyle,
  panelStyle,
} from '@/design-constraints';

function ArtifactsPageContent() {
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
    isNarrowViewport,
    selectedArtifact,
    selectedPreviewTarget,
    selectedArtifactHiddenByFilters,
    selectArtifact,
    closeArtifactSelection,
    hasPreviousArtifact,
    hasNextArtifact,
    selectPreviousArtifact,
    selectNextArtifact,
    artifactContentHref,
    artifactDownloadHref,
    openArtifact,
    revealArtifact,
    revealLabel,
    desktopBridge,
    previewTargetById,
  } = useArtifactsBrowser();
  const showWorkspace = filteredItems.length > 0 || Boolean(selectedArtifact);
  const mobileDetailOpen = Boolean(isNarrowViewport && selectedArtifact);

  return (
    <div style={pageShellStyle()}>
      <PageHero
        kicker="Assets"
        title="Inspect deliverables, evidence, and runtime outputs in one workspace."
        copy="Review final files, screenshots, and supporting artifacts with preview, source, and provenance side by side instead of jumping between run logs and external apps."
        actions={
          <>
            <button type="button" style={buttonStyle({ tone: 'secondary', size: 'md' })} onClick={() => void refresh()}>
              <RefreshCw size={14} />
              Refresh
            </button>
            <Link
              href="/executions"
              style={mergeStyles(
                { display: 'inline-flex', alignItems: 'center', textDecoration: 'none' },
                buttonStyle({ tone: 'secondary', size: 'md' }),
              )}
            >
              Open Runs
            </Link>
          </>
        }
        aside={
          <>
            <PageHeroCard label="Current totals">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: DESIGN_TOKENS.space[4] }}>
                <div style={{ display: 'grid', gap: DESIGN_TOKENS.space[1] }}>
                  <div style={{ fontSize: DESIGN_TOKENS.type.size.title, fontWeight: DESIGN_TOKENS.type.weight.semibold, color: DESIGN_TOKENS.color.textPrimary }}>
                    {viewSummary.deliverables}
                  </div>
                  <div style={metaTextStyle()}>Deliverables</div>
                </div>
                <div style={{ display: 'grid', gap: DESIGN_TOKENS.space[1] }}>
                  <div style={{ fontSize: DESIGN_TOKENS.type.size.title, fontWeight: DESIGN_TOKENS.type.weight.semibold, color: DESIGN_TOKENS.color.textPrimary }}>
                    {viewSummary.evidence}
                  </div>
                  <div style={metaTextStyle()}>Evidence items</div>
                </div>
              </div>
              <div style={bodyTextStyle()}>
                {latestArtifact
                  ? `Latest update ${toDateLabel(latestArtifact.updated_at)}`
                  : 'No saved outputs yet.'}
              </div>
            </PageHeroCard>
            <PageHeroCard label="Quick focus">
              <div style={{ display: 'grid', gap: DESIGN_TOKENS.space[2] }}>
                <button
                  type="button"
                  onClick={() => setViewMode('deliverables')}
                  style={mergeStyles(buttonStyle({ tone: viewMode === 'deliverables' ? 'secondary' : 'ghost', size: 'sm' }), {
                    justifyContent: 'space-between',
                  })}
                >
                  <span>Deliverables</span>
                  <span>{viewSummary.deliverables}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('evidence')}
                  style={mergeStyles(buttonStyle({ tone: viewMode === 'evidence' ? 'secondary' : 'ghost', size: 'sm' }), {
                    justifyContent: 'space-between',
                  })}
                >
                  <span>Evidence</span>
                  <span>{viewSummary.evidence}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('system')}
                  style={mergeStyles(buttonStyle({ tone: viewMode === 'system' ? 'secondary' : 'ghost', size: 'sm' }), {
                    justifyContent: 'space-between',
                  })}
                >
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
            <span style={mergeStyles(metaTextStyle(), {
              padding: `${DESIGN_TOKENS.space[2]}px ${DESIGN_TOKENS.space[3]}px`,
              borderRadius: DESIGN_TOKENS.radius.pill,
              border: `1px solid ${DESIGN_TOKENS.color.borderSubtle}`,
              background: DESIGN_TOKENS.color.surfaceMuted,
            })}
            >
              {filteredItems.length} shown
            </span>
            {payload ? (
              <span style={mergeStyles(metaTextStyle(), {
                padding: `${DESIGN_TOKENS.space[2]}px ${DESIGN_TOKENS.space[3]}px`,
                borderRadius: DESIGN_TOKENS.radius.pill,
                border: `1px solid ${DESIGN_TOKENS.color.borderSubtle}`,
                background: DESIGN_TOKENS.color.surfaceMuted,
              })}
              >
                {payload.summary.total} saved
              </span>
            ) : null}
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
          <div style={{ position: 'relative', width: '100%', maxWidth: '100%' }}>
            <Search
              size={14}
              style={{
                position: 'absolute',
                left: DESIGN_TOKENS.space[3],
                top: '50%',
                transform: 'translateY(-50%)',
                color: DESIGN_TOKENS.color.textTertiary,
                pointerEvents: 'none',
              }}
            />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search assets, tasks, or channels"
              style={{ paddingLeft: 36, height: 42, borderRadius: DESIGN_TOKENS.radius.lg }}
            />
          </div>
        </div>

        <div className="orion-page-filter-grid is-toolbar">
          <select
            value={kindFilter}
            onChange={(event) => setKindFilter(event.target.value as KindFilter)}
            style={mergeStyles(inputStyle(), { height: 42, minWidth: 0, borderRadius: DESIGN_TOKENS.radius.lg })}
          >
            <option value="all">All kinds</option>
            <option value="screenshots">Screenshots</option>
            <option value="reports">Reports</option>
            <option value="data">Data</option>
            <option value="links">Links</option>
            <option value="files">Saved files</option>
          </select>
          <select
            value={agentFilter}
            onChange={(event) => setAgentFilter(event.target.value as 'all' | AgentRoleId)}
            style={mergeStyles(inputStyle(), { height: 42, minWidth: 0, borderRadius: DESIGN_TOKENS.radius.lg })}
          >
            <option value="all">All handlers</option>
            {AGENT_ROLE_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>{option.label}</option>
            ))}
          </select>
          <select
            value={channelFilter}
            onChange={(event) => setChannelFilter(event.target.value)}
            style={mergeStyles(inputStyle(), { height: 42, minWidth: 0, borderRadius: DESIGN_TOKENS.radius.lg })}
          >
            <option value="all">All channels</option>
            {channelOptions.map((channel) => (
              <option key={channel} value={channel}>{channel}</option>
            ))}
          </select>
          {hasActiveFilters ? (
            <button type="button" style={buttonStyle({ tone: 'ghost', size: 'md' })} onClick={clearFilters}>
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
      ) : !showWorkspace ? (
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
          <div
            style={mergeStyles(panelStyle({ muted: true, padding: DESIGN_TOKENS.space[4] }), {
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: DESIGN_TOKENS.space[4],
              flexWrap: 'wrap',
              background: DESIGN_TOKENS.color.surfaceMuted,
            })}
          >
            <div style={{ display: 'grid', gap: DESIGN_TOKENS.space[2] }}>
              <div style={{ color: DESIGN_TOKENS.color.textPrimary, fontSize: DESIGN_TOKENS.type.size.body, fontWeight: DESIGN_TOKENS.type.weight.semibold }}>
                {selectedArtifact
                  ? `Inspecting ${artifactSurfaceLabel(selectedArtifact)}`
                  : 'Select an artifact to inspect'}
              </div>
              <div style={bodyTextStyle()}>
                {isNarrowViewport
                  ? 'Tap an asset to open the detail pane. Use Back or Esc to return to the list.'
                  : 'The right pane keeps preview, code, and provenance together so you can inspect files without leaving Empyralis.'}
              </div>
            </div>
          </div>
          <div className={`orion-artifact-workspace${mobileDetailOpen ? ' is-mobile-detail-open' : ''}`}>
            <section className="orion-artifact-list-pane">
              {filteredItems.length === 0 ? (
                <div style={mergeStyles(panelStyle({ muted: true, padding: DESIGN_TOKENS.space[5] }), {
                  display: 'grid',
                  gap: DESIGN_TOKENS.space[3],
                  background: DESIGN_TOKENS.color.surfaceMuted,
                })}
                >
                  <div style={{ color: DESIGN_TOKENS.color.textPrimary, fontSize: DESIGN_TOKENS.type.size.titleSm, fontWeight: DESIGN_TOKENS.type.weight.semibold }}>
                    No visible artifacts
                  </div>
                  <p style={bodyTextStyle()}>
                    {selectedArtifactHiddenByFilters
                      ? 'The selected artifact is still open on the right, but your current filters hide it from the list.'
                      : 'No artifacts match the current filters.'}
                  </p>
                  {hasActiveFilters ? (
                    <button type="button" style={buttonStyle({ tone: 'ghost', size: 'md' })} onClick={clearFilters}>
                      Clear filters
                    </button>
                  ) : null}
                </div>
              ) : (
                <div className="orion-asset-grid">
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
                        isSelected={selectedArtifact?.id === item.id}
                        revealLabel={revealLabel}
                        viewMode={viewMode}
                        showReveal={showReveal}
                        onSelect={() => selectArtifact(item)}
                        onReveal={() => void revealArtifact(item)}
                      />
                    );
                  })}
                </div>
              )}
            </section>

            {!isNarrowViewport || selectedArtifact ? (
              <div className="orion-artifact-detail-column">
                {selectedArtifactHiddenByFilters ? (
                  <div style={mergeStyles(panelStyle({ muted: true, padding: DESIGN_TOKENS.space[4] }), {
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    gap: DESIGN_TOKENS.space[3],
                    flexWrap: 'wrap',
                    background: DESIGN_TOKENS.color.warningSoft,
                    borderColor: DESIGN_TOKENS.color.warning,
                  })}
                  >
                    <div style={{ display: 'grid', gap: DESIGN_TOKENS.space[1] }}>
                      <strong>Selected artifact is hidden by current filters.</strong>
                      <span style={bodyTextStyle()}>
                        It stays open here until you clear the filters or pick another file.
                      </span>
                    </div>
                    {hasActiveFilters ? (
                      <button type="button" style={buttonStyle({ tone: 'ghost', size: 'md' })} onClick={clearFilters}>
                        Clear filters
                      </button>
                    ) : null}
                  </div>
                ) : null}

                <ArtifactDetailPane
                  item={selectedArtifact}
                  previewTarget={selectedPreviewTarget}
                  contentHref={selectedPreviewTarget ? artifactContentHref(selectedPreviewTarget) : null}
                  downloadHref={selectedPreviewTarget ? artifactDownloadHref(selectedPreviewTarget) : null}
                  showReveal={Boolean(
                    selectedPreviewTarget
                    && desktopBridge?.desktop
                    && isLocalFileTarget(String(selectedPreviewTarget.uri_or_path || '').trim()),
                  )}
                  revealLabel={revealLabel}
                  showBackButton={isNarrowViewport}
                  onBack={() => closeArtifactSelection()}
                  hasPreviousArtifact={hasPreviousArtifact}
                  hasNextArtifact={hasNextArtifact}
                  onPreviousArtifact={() => selectPreviousArtifact()}
                  onNextArtifact={() => selectNextArtifact()}
                  onOpenExternal={() => (selectedArtifact ? void openArtifact(selectedArtifact) : undefined)}
                  onReveal={() => (selectedArtifact ? void revealArtifact(selectedArtifact) : undefined)}
                />
              </div>
            ) : null}
          </div>
        </PageCollection>
      )}
    </div>
  );
}

export default function ArtifactsPage() {
  return (
    <Suspense fallback={<div style={pageShellStyle()} />}>
      <ArtifactsPageContent />
    </Suspense>
  );
}
