'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import { EmptyPanel } from '@/lib/ui/empty-panel';
import { ListDetailColumns, ListDetailPanel, ListDetailShell } from '@/lib/ui/list-detail';
import { AppButton, joinClassNames } from '@/lib/ui/primitives';
import { SkeletonBlock } from '@/lib/ui/skeleton-block';
import type { MarketplaceAgentCardRecord } from '@/lib/workspace/workstation-client';
import { useWorkspaceServices } from '@/lib/workspace/workspace-services';
import { WorkstationSurfaceRoot } from '@/lib/workspace/workstation-surface-primitives';

const CATEGORY_FILTERS = ['all', 'medical', 'legal', 'finance', 'general', 'other'] as const;
const COST_TIER_FILTERS = ['all', 'free', 'standard', 'premium'] as const;

type CategoryFilter = typeof CATEGORY_FILTERS[number];
type CostTierFilter = typeof COST_TIER_FILTERS[number];

function readString(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function readNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeMarketplaceCards(payload: unknown): MarketplaceAgentCardRecord[] {
  if (!payload || typeof payload !== 'object') {
    return [];
  }
  const items = (payload as Record<string, unknown>).items;
  return Array.isArray(items)
    ? items.filter((item): item is MarketplaceAgentCardRecord => Boolean(item) && typeof item === 'object')
    : [];
}

function humanizeToken(value: string): string {
  if (!value) {
    return 'Unknown';
  }
  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function MarketplaceSkeleton() {
  return (
    <div className="marketplace-pane__grid">
      {Array.from({ length: 8 }).map((_, index) => (
        <article key={`marketplace-skeleton-${index}`} className="marketplace-pane__card">
          <div className="marketplace-pane__card-copy">
            <SkeletonBlock height="1.1rem" width="8rem" />
            <SkeletonBlock height="1.5rem" width="5rem" />
            <SkeletonBlock height="3.5rem" />
            <SkeletonBlock height="1rem" width="6rem" />
            <SkeletonBlock height="1.5rem" width="4rem" />
          </div>
          <div className="marketplace-pane__card-actions">
            <SkeletonBlock height="2.5rem" />
            <SkeletonBlock height="2.5rem" />
          </div>
        </article>
      ))}
    </div>
  );
}

export function MarketplacePane() {
  const services = useWorkspaceServices();
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [costTierFilter, setCostTierFilter] = useState<CostTierFilter>('all');
  const [items, setItems] = useState<MarketplaceAgentCardRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const activeRequestControllerRef = useRef<AbortController | null>(null);

  async function loadMarketplace() {
    setLoading(true);
    setError(null);
    activeRequestControllerRef.current?.abort();
    const requestController = new AbortController();
    activeRequestControllerRef.current = requestController;
    try {
      const payload = await services.client.listMarketplaceAgents({
        category: categoryFilter === 'all' ? null : humanizeToken(categoryFilter),
        costTier: costTierFilter === 'all' ? null : costTierFilter,
        limit: 100,
        offset: 0,
      });
      if (requestController.signal.aborted || activeRequestControllerRef.current !== requestController) {
        return;
      }
      setItems(normalizeMarketplaceCards(payload));
    } catch (loadError) {
      if (requestController.signal.aborted || activeRequestControllerRef.current !== requestController) {
        return;
      }
      setError(loadError instanceof Error ? loadError.message : 'Marketplace could not be loaded.');
      setItems([]);
    } finally {
      if (activeRequestControllerRef.current === requestController) {
        activeRequestControllerRef.current = null;
      }
      if (requestController.signal.aborted) {
        return;
      }
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadMarketplace();
    return () => {
      activeRequestControllerRef.current?.abort();
      activeRequestControllerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryFilter, costTierFilter]);

  const renderedCards = useMemo(
    () => items.map((item, index) => {
      const cardId = readString(item.id, `marketplace-agent-${index}`);
      const description = readString(item.description, 'No public description has been added yet.');
      const category = readString(item.category, 'General');
      const qualityStars = readNumber(item.quality_stars);
      const costTier = readString(item.cost_tier);
      const telegramBotUsername = readString(item.telegram_bot_username);
      const telegramHref = telegramBotUsername ? `https://t.me/${telegramBotUsername}` : '';
      return {
        id: cardId,
        name: readString(item.name, 'Unnamed specialist'),
        description,
        category,
        qualityStars,
        costTier,
        telegramBotUsername,
        telegramHref,
      };
    }),
    [items],
  );

  return (
    <WorkstationSurfaceRoot surface="marketplace">
      <ListDetailShell
        className="marketplace-pane"
        title="Marketplace"
        subtitle="Discover public specialists that are already live on the platform."
      >
        <ListDetailColumns
          primary={(
            <ListDetailPanel
              title="Published agents"
              subtitle="Browse live public specialists by category and cost tier."
            >
              <div className="marketplace-pane__filters">
                <div className="marketplace-pane__filter-row">
                  {CATEGORY_FILTERS.map((filter) => (
                    <button
                      key={filter}
                      type="button"
                      className={joinClassNames(
                        'marketplace-pane__filter-pill',
                        categoryFilter === filter && 'marketplace-pane__filter-pill--active',
                      )}
                      onClick={() => setCategoryFilter(filter)}
                    >
                      {humanizeToken(filter)}
                    </button>
                  ))}
                </div>
                <div className="marketplace-pane__filter-row">
                  {COST_TIER_FILTERS.map((filter) => (
                    <button
                      key={filter}
                      type="button"
                      className={joinClassNames(
                        'marketplace-pane__filter-pill',
                        costTierFilter === filter && 'marketplace-pane__filter-pill--active',
                      )}
                      onClick={() => setCostTierFilter(filter)}
                    >
                      {humanizeToken(filter)}
                    </button>
                  ))}
                </div>
              </div>

              {error && !loading ? (
                <div className="marketplace-pane__error">
                  <span>{error}</span>
                  <AppButton type="button" tone="secondary" onClick={() => { void loadMarketplace(); }}>
                    Retry
                  </AppButton>
                </div>
              ) : null}

              {loading ? (
                <MarketplaceSkeleton />
              ) : renderedCards.length === 0 ? (
                <EmptyPanel
                  title="No agents published yet. Be the first to publish one in Studio."
                  body="Once specialists are marked public and live, they will appear here automatically."
                />
              ) : (
                <div className="marketplace-pane__grid">
                  {renderedCards.map((card) => (
                    <article key={card.id} className="marketplace-pane__card">
                      <div className="marketplace-pane__card-copy">
                        <strong className="marketplace-pane__card-title">{card.name}</strong>
                        <span className="marketplace-pane__category-pill">{card.category}</span>
                        <p className="marketplace-pane__card-description">{card.description}</p>
                        <div className="marketplace-pane__rating-row">
                          {card.qualityStars && card.qualityStars > 0 ? (
                            <div className="marketplace-pane__stars" aria-label={`Quality ${card.qualityStars} out of 5`}>
                              {Array.from({ length: 5 }).map((_, starIndex) => (
                                <span
                                  key={`${card.id}-star-${starIndex}`}
                                  className={joinClassNames(
                                    'marketplace-pane__star',
                                    starIndex < (card.qualityStars ?? 0) && 'marketplace-pane__star--filled',
                                  )}
                                >
                                  ★
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="marketplace-pane__unrated">Unrated</span>
                          )}
                          {card.costTier ? (
                            <span
                              className={joinClassNames(
                                'marketplace-pane__tier-badge',
                                `marketplace-pane__tier-badge--${card.costTier}`,
                              )}
                            >
                              {humanizeToken(card.costTier)}
                            </span>
                          ) : null}
                        </div>
                      </div>
                      <div className="marketplace-pane__card-actions">
                        {card.telegramHref ? (
                          <a
                            href={card.telegramHref}
                            target="_blank"
                            rel="noreferrer"
                            className="marketplace-pane__link-button"
                          >
                            Try on Telegram
                          </a>
                        ) : (
                          <button
                            type="button"
                            className="marketplace-pane__link-button marketplace-pane__link-button--disabled"
                            disabled
                            title="Not available on Telegram yet"
                          >
                            Try on Telegram
                          </button>
                        )}
                        <button
                          type="button"
                          className="marketplace-pane__secondary-button"
                          disabled
                          title="Coming soon"
                        >
                          Add to Workspace
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </ListDetailPanel>
          )}
        />
      </ListDetailShell>
    </WorkstationSurfaceRoot>
  );
}
