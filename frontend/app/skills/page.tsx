'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, RefreshCw, Sparkles, Trash2 } from 'lucide-react';
import { PageHero } from '@/components/orion/page/PageHero';
import { PageHeroCard } from '@/components/orion/page/PageHeroCard';
import { PageSection } from '@/components/orion/page/PageSection';
import { PageStatePanel } from '@/components/orion/page/PageStatePanel';

type SkillRecord = {
  id: string;
  name: string;
  description: string;
  author?: string;
  version?: string;
  tools: string[];
  requires: string[];
  source?: string;
  installed?: boolean;
};

function normalizeSkill(value: unknown): SkillRecord | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const id = String(record.id ?? record.name ?? '').trim();
  const name = String(record.name ?? record.title ?? record.label ?? id).trim();
  const description = String(record.description ?? record.intent ?? '').trim();
  if (!id || !name) return null;
  return {
    id,
    name,
    description: description || 'No description provided yet.',
    author: String(record.author ?? '').trim() || undefined,
    version: String(record.version ?? '').trim() || undefined,
    tools: Array.isArray(record.tools) ? record.tools.map((item) => String(item || '').trim()).filter(Boolean) : [],
    requires: Array.isArray(record.requires) ? record.requires.map((item) => String(item || '').trim()).filter(Boolean) : [],
    source: String(record.source ?? '').trim() || undefined,
  };
}

export default function SkillsPage() {
  const [loading, setLoading] = useState(true);
  const [busySkillId, setBusySkillId] = useState<string | null>(null);
  const [error, setError] = useState<string>('');
  const [marketplace, setMarketplace] = useState<SkillRecord[]>([]);
  const [installed, setInstalled] = useState<SkillRecord[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [installedRes, registryRes] = await Promise.all([
        fetch('/api/skills', { cache: 'no-store' }),
        fetch('/api/skills/registry', { cache: 'no-store' }),
      ]);
      const installedPayload = await installedRes.json().catch(() => null);
      const registryPayload = await registryRes.json().catch(() => null);
      if (!installedRes.ok) {
        throw new Error(
          installedPayload && typeof installedPayload.detail === 'string'
            ? installedPayload.detail
            : 'Failed to load installed skills.',
        );
      }
      if (!registryRes.ok) {
        throw new Error(
          registryPayload && typeof registryPayload.detail === 'string'
            ? registryPayload.detail
            : 'Failed to load skill marketplace.',
        );
      }
      const installedItems = Array.isArray(installedPayload?.items) ? installedPayload.items : [];
      const registryItems = Array.isArray(registryPayload?.items) ? registryPayload.items : [];
      const installedSkills = (installedItems as unknown[])
        .map(normalizeSkill)
        .filter((item): item is SkillRecord => Boolean(item));
      const installedById = new Map(installedSkills.map((item) => [item.id, item]));
      const marketplaceSkills = (registryItems as unknown[])
        .map(normalizeSkill)
        .filter((item): item is SkillRecord => Boolean(item))
        .map((item) => ({ ...item, installed: installedById.has(item.id) }));
      setInstalled(installedSkills);
      setMarketplace(marketplaceSkills);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Failed to load skills.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const installedIds = useMemo(() => new Set(installed.map((item) => item.id)), [installed]);

  const installSkill = useCallback(async (skill: SkillRecord) => {
    setBusySkillId(skill.id);
    setError('');
    try {
      const response = await fetch('/api/skills/install', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source_url: skill.source || '' }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          payload && typeof payload.detail === 'string'
            ? payload.detail
            : `Failed to install ${skill.name}.`,
        );
      }
      await load();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : `Failed to install ${skill.name}.`);
    } finally {
      setBusySkillId(null);
    }
  }, [load]);

  const uninstallSkill = useCallback(async (skill: SkillRecord) => {
    setBusySkillId(skill.id);
    setError('');
    try {
      const response = await fetch(`/api/skills/${encodeURIComponent(skill.id)}`, {
        method: 'DELETE',
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          payload && typeof payload.detail === 'string'
            ? payload.detail
            : `Failed to uninstall ${skill.name}.`,
        );
      }
      await load();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : `Failed to uninstall ${skill.name}.`);
    } finally {
      setBusySkillId(null);
    }
  }, [load]);

  return (
    <div className="orion-page-shell orion-animate-in">
      <PageHero
        kicker="Marketplace"
        title="Install skills that add repeatable execution patterns to your workspace."
        copy="Browse the live skill registry, see what each skill does, and enable only the capabilities your team actually needs."
        actions={
          <button type="button" className="orion-btn orion-btn-ghost" onClick={() => void load()}>
            <RefreshCw size={14} />
            Refresh
          </button>
        }
        aside={
          <>
            <PageHeroCard label="Installed">
              <div className="orion-home-side-value">{installed.length}</div>
              <div className="orion-home-side-note">Skills active in this workspace</div>
            </PageHeroCard>
            <PageHeroCard label="Marketplace">
              <div className="orion-home-side-value">{marketplace.length}</div>
              <div className="orion-home-side-note">Packages available to install</div>
            </PageHeroCard>
          </>
        }
      />

      <PageSection
        title="Available skills"
        description="Each skill declares its intent, required tools, and runtime dependencies before you install it."
      >
        {loading ? (
          <PageStatePanel variant="loading" title="Loading skills" copy="Reading installed skills and marketplace catalog." />
        ) : error ? (
          <PageStatePanel variant="error" title="Skills are unavailable" copy={error} />
        ) : (
          <div className="orion-card-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
            {marketplace.map((skill) => {
              const isInstalled = installedIds.has(skill.id);
              const busy = busySkillId === skill.id;
              return (
                <article key={skill.id} className="orion-glass-card" style={{ display: 'grid', gap: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
                    <div style={{ display: 'grid', gap: 6 }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                        <Sparkles size={16} />
                        <strong>{skill.name}</strong>
                      </div>
                      <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
                        {skill.author || 'Empyralis'}{skill.version ? ` · v${skill.version}` : ''}
                      </div>
                    </div>
                    <span className={`orion-chip${isInstalled ? ' is-accent' : ''}`}>
                      {isInstalled ? 'Installed' : 'Available'}
                    </span>
                  </div>
                  <p style={{ margin: 0, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{skill.description}</p>
                  {skill.tools.length > 0 ? (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {skill.tools.slice(0, 6).map((tool) => (
                        <span key={tool} className="orion-chip">{tool}</span>
                      ))}
                    </div>
                  ) : null}
                  {skill.requires.length > 0 ? (
                    <div style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>
                      Requires: {skill.requires.join(', ')}
                    </div>
                  ) : null}
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    {isInstalled ? (
                      <button
                        type="button"
                        className="orion-btn orion-btn-ghost"
                        onClick={() => void uninstallSkill(skill)}
                        disabled={busy}
                      >
                        <Trash2 size={14} />
                        {busy ? 'Removing...' : 'Uninstall'}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="orion-btn orion-btn-primary"
                        onClick={() => void installSkill(skill)}
                        disabled={busy}
                      >
                        <Download size={14} />
                        {busy ? 'Installing...' : 'Install'}
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </PageSection>
    </div>
  );
}
