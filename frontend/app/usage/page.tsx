'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { BarChart3, Bot, Coins, DollarSign, RefreshCw } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { PageCollection } from '@/components/orion/page/PageCollection';
import { PageFilterBar } from '@/components/orion/page/PageFilterBar';
import { PageHero } from '@/components/orion/page/PageHero';
import { PageHeroCard } from '@/components/orion/page/PageHeroCard';
import { PageSection } from '@/components/orion/page/PageSection';
import { PageStatePanel } from '@/components/orion/page/PageStatePanel';
import { ensureControlPlaneSession } from '@/lib/controlPlaneSession';

type UsagePeriod = 'day' | 'week' | 'month' | 'all';

type UsageSummary = {
  period: UsagePeriod;
  total_tokens: number;
  total_cost_usd: number;
  runs_count: number;
  by_provider: Array<{
    provider: string;
    total_tokens: number;
    total_cost_usd: number;
    runs_count: number;
    percentage: number;
  }>;
  by_model: Array<{
    provider: string;
    model: string;
    total_tokens: number;
    total_cost_usd: number;
    runs_count: number;
  }>;
  by_run: Array<{
    run_id: string;
    run_name: string;
    provider: string;
    model: string;
    total_tokens: number;
    estimated_cost_usd: number | null;
    timestamp: string | null;
  }>;
  daily: Array<{
    date: string;
    total_tokens: number;
    total_cost_usd: number;
    runs_count: number;
  }>;
  detail?: string;
};

type UsageRunsPayload = {
  items: Array<{
    run_id: string;
    run_name: string;
    provider: string;
    model: string;
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    estimated_cost_usd: number | null;
    status: string | null;
    timestamp: string | null;
    created_at: string | null;
    completed_at: string | null;
  }>;
  count: number;
  total: number;
  limit: number;
  offset: number;
  period: UsagePeriod;
  detail?: string;
};

const PERIOD_OPTIONS: Array<{ id: UsagePeriod; label: string }> = [
  { id: 'day', label: 'Today' },
  { id: 'week', label: 'This Week' },
  { id: 'month', label: 'This Month' },
  { id: 'all', label: 'All Time' },
];

const EMPTY_SUMMARY: UsageSummary = {
  period: 'all',
  total_tokens: 0,
  total_cost_usd: 0,
  runs_count: 0,
  by_provider: [],
  by_model: [],
  by_run: [],
  daily: [],
};

const EMPTY_RUNS: UsageRunsPayload = {
  items: [],
  count: 0,
  total: 0,
  limit: 20,
  offset: 0,
  period: 'all',
};

const tokenFormatter = new Intl.NumberFormat('en-US');
const costFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

function formatTokens(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '--';
  return tokenFormatter.format(Math.max(0, Math.trunc(value)));
}

function formatCost(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '--';
  return costFormatter.format(Math.max(0, value));
}

function formatProviderLabel(value: string): string {
  return value.replace(/[_-]+/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatDateLabel(value: string | null): string {
  if (!value) return '--';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '--';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
  }).format(parsed);
}

function formatDateTimeLabel(value: string | null): string {
  if (!value) return '--';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '--';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(parsed);
}

export default function UsagePage() {
  const [period, setPeriod] = useState<UsagePeriod>('week');
  const [summary, setSummary] = useState<UsageSummary>(EMPTY_SUMMARY);
  const [runs, setRuns] = useState<UsageRunsPayload>(EMPTY_RUNS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadUsage = useCallback(async (selectedPeriod: UsagePeriod) => {
    setLoading(true);
    setError('');
    try {
      await ensureControlPlaneSession();
      const [summaryResponse, runsResponse] = await Promise.all([
        fetch(`/api/usage/summary?period=${selectedPeriod}`, { cache: 'no-store' }),
        fetch(`/api/usage/runs?period=${selectedPeriod}&limit=20&offset=0`, { cache: 'no-store' }),
      ]);

      const summaryPayload = await summaryResponse.json().catch(() => EMPTY_SUMMARY);
      const runsPayload = await runsResponse.json().catch(() => EMPTY_RUNS);

      if (!summaryResponse.ok) {
        throw new Error(String((summaryPayload as { detail?: string }).detail || 'Failed to load usage summary.'));
      }
      if (!runsResponse.ok) {
        throw new Error(String((runsPayload as { detail?: string }).detail || 'Failed to load usage runs.'));
      }

      setSummary(summaryPayload as UsageSummary);
      setRuns(runsPayload as UsageRunsPayload);
    } catch (loadError) {
      setSummary({ ...EMPTY_SUMMARY, period: selectedPeriod });
      setRuns({ ...EMPTY_RUNS, period: selectedPeriod });
      setError(loadError instanceof Error ? loadError.message : 'Failed to load usage.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadUsage(period);
  }, [loadUsage, period]);

  const chartData = useMemo(
    () => summary.daily.map((item) => ({
      date: formatDateLabel(item.date),
      tokens: item.total_tokens,
      cost: item.total_cost_usd,
      runs: item.runs_count,
    })),
    [summary.daily],
  );

  return (
    <div className="orion-page-shell orion-animate-in">
      <PageHero
        kicker="Usage"
        title="Track model consumption, token volume, and estimated cost by run."
        copy="This surface rolls up token and cost telemetry from completed runs so you can see which providers and workflows are driving usage."
      />

      <section
        style={{
          display: 'grid',
          gap: 12,
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          marginBottom: 12,
        }}
      >
        <PageHeroCard label="Total tokens">
          <div className="orion-home-side-stats">
            <div>
              <div className="orion-home-side-value">{formatTokens(summary.total_tokens)}</div>
              <div className="orion-home-side-note">{PERIOD_OPTIONS.find((item) => item.id === period)?.label || 'Period'}</div>
            </div>
            <Coins size={16} color="var(--text-secondary)" />
          </div>
        </PageHeroCard>
        <PageHeroCard label="Estimated cost">
          <div className="orion-home-side-stats">
            <div>
              <div className="orion-home-side-value">{formatCost(summary.total_cost_usd)}</div>
              <div className="orion-home-side-note">Current model pricing</div>
            </div>
            <DollarSign size={16} color="var(--text-secondary)" />
          </div>
        </PageHeroCard>
        <PageHeroCard label="Runs count">
          <div className="orion-home-side-stats">
            <div>
              <div className="orion-home-side-value">{formatTokens(summary.runs_count)}</div>
              <div className="orion-home-side-note">Runs with usage data</div>
            </div>
            <Bot size={16} color="var(--text-secondary)" />
          </div>
        </PageHeroCard>
      </section>

      <PageFilterBar
        title="Period"
        description="Switch the reporting window without leaving the run history model already used across the platform."
        actions={(
          <button type="button" className="orion-btn orion-btn-secondary" onClick={() => void loadUsage(period)}>
            <RefreshCw size={14} />
            Refresh
          </button>
        )}
      >
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {PERIOD_OPTIONS.map((option) => {
            const active = option.id === period;
            return (
              <button
                key={option.id}
                type="button"
                className={active ? 'orion-btn' : 'orion-btn orion-btn-secondary'}
                onClick={() => setPeriod(option.id)}
                aria-pressed={active}
                style={active ? undefined : { minHeight: 44 }}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </PageFilterBar>

      {loading ? (
        <PageStatePanel variant="loading" title="Loading usage…" />
      ) : error ? (
        <PageStatePanel
          variant="error"
          title="Usage is unavailable"
          copy={error}
          actions={(
            <button type="button" className="orion-btn" onClick={() => void loadUsage(period)}>
              Retry
            </button>
          )}
        />
      ) : (
        <>
          <div className="grid gap-3 xl:grid-cols-[minmax(0,1.8fr)_minmax(280px,1fr)]" style={{ marginBottom: 12 }}>
            <PageSection title="Daily token usage" description="Token volume grouped by day for the selected period.">
              {chartData.length === 0 ? (
                <PageStatePanel
                  variant="empty"
                  icon={<BarChart3 size={18} />}
                  title="No usage recorded yet"
                  copy="Run a task with a model-backed execution path to populate token and cost reporting."
                />
              ) : (
                <div style={{ width: '100%', height: 280 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                      <CartesianGrid stroke="var(--border-subtle)" vertical={false} />
                      <XAxis
                        dataKey="date"
                        tickLine={false}
                        axisLine={false}
                        tick={{ fill: 'var(--text-secondary)', fontSize: 11 }}
                      />
                      <YAxis
                        tickLine={false}
                        axisLine={false}
                        tick={{ fill: 'var(--text-secondary)', fontSize: 11 }}
                        tickFormatter={(value: number) => tokenFormatter.format(value)}
                      />
                      <RechartsTooltip
                        cursor={{ fill: 'var(--primary-soft)' }}
                        contentStyle={{
                          borderRadius: 14,
                          border: '1px solid var(--border-subtle)',
                          background: 'var(--bg-panel)',
                          color: 'var(--text-primary)',
                          boxShadow: 'var(--shadow-card-hover)',
                        }}
                        formatter={(value: unknown, name: unknown) => {
                          const numericValue = typeof value === 'number' ? value : Number(value) || 0;
                          const normalizedName = typeof name === 'string' ? name : '';
                          if (normalizedName === 'tokens') return [tokenFormatter.format(numericValue), 'Tokens'];
                          if (normalizedName === 'cost') return [formatCost(numericValue), 'Estimated cost'];
                          return [String(value ?? ''), normalizedName];
                        }}
                      />
                      <Bar dataKey="tokens" radius={[10, 10, 0, 0]} fill="var(--primary-base)" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </PageSection>

            <PageSection title="Provider breakdown" description="Share of total token volume by provider.">
              {summary.by_provider.length === 0 ? (
                <PageStatePanel variant="empty" title="No provider data yet" />
              ) : (
                <div style={{ display: 'grid', gap: 10 }}>
                  {summary.by_provider.map((item) => (
                    <div key={item.provider} className="orion-list-row">
                      <div className="orion-list-row-main">
                        <div className="orion-list-row-title">{formatProviderLabel(item.provider)}</div>
                        <div className="orion-list-row-subtitle">
                          {formatTokens(item.total_tokens)} tokens · {formatCost(item.total_cost_usd)}
                        </div>
                      </div>
                      <div style={{ display: 'grid', justifyItems: 'end', gap: 6 }}>
                        <span className="orion-chip" data-status-tone="grey">{item.percentage.toFixed(1)}%</span>
                        <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{formatTokens(item.runs_count)} runs</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </PageSection>
          </div>

          <PageCollection
            title="Top runs by token count"
            description="The heaviest runs for the selected period, sorted by total token volume."
          >
            {runs.items.length === 0 ? (
              <PageStatePanel variant="empty" title="No runs recorded for this period" />
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', minWidth: 760, borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', fontSize: 12, textAlign: 'left' }}>
                      <th style={{ padding: '0 0 12px' }}>Run</th>
                      <th style={{ padding: '0 0 12px' }}>Provider</th>
                      <th style={{ padding: '0 0 12px' }}>Model</th>
                      <th style={{ padding: '0 0 12px', textAlign: 'right' }}>Tokens</th>
                      <th style={{ padding: '0 0 12px', textAlign: 'right' }}>Est. cost</th>
                      <th style={{ padding: '0 0 12px', textAlign: 'right' }}>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {runs.items.map((item) => (
                      <tr key={item.run_id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                        <td style={{ padding: '14px 0' }}>
                          <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{item.run_name}</div>
                          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{item.run_id}</div>
                        </td>
                        <td style={{ padding: '14px 0', color: 'var(--text-primary)' }}>{formatProviderLabel(item.provider)}</td>
                        <td style={{ padding: '14px 0', color: 'var(--text-secondary)' }}>{item.model}</td>
                        <td style={{ padding: '14px 0', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{formatTokens(item.total_tokens)}</td>
                        <td style={{ padding: '14px 0', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{formatCost(item.estimated_cost_usd)}</td>
                        <td style={{ padding: '14px 0', textAlign: 'right', color: 'var(--text-secondary)' }}>{formatDateTimeLabel(item.timestamp || item.completed_at || item.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </PageCollection>
        </>
      )}
    </div>
  );
}
