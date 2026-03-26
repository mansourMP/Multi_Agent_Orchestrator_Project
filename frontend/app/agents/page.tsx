'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { PageHero } from '@/components/orion/page/PageHero';
import { PageHeroCard } from '@/components/orion/page/PageHeroCard';
import { PageSection } from '@/components/orion/page/PageSection';
import { PageStatePanel } from '@/components/orion/page/PageStatePanel';
import { MetricStrip } from '@/components/ui/MetricStrip';
import { ensureControlPlaneSession } from '@/lib/controlPlaneSession';

type InstalledSkill = {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  has_query_handler?: boolean;
  has_snapshot_worker?: boolean;
  config?: Record<string, unknown>;
};

type SkillsStateResponse = {
  installed?: InstalledSkill[];
};

const BUILT_IN_SKILLS = [
  'Summarize emails',
  'Draft replies',
  'Research topics',
  'Organize tasks',
  'Monitor and alert',
];

function capabilitySummary(skill: InstalledSkill): string {
  if (skill.id === 'vision-monitor') {
    return 'Capture snapshots, count people, write live space state, and answer operational questions from the latest camera state.';
  }
  return skill.description || 'Installed skill available to your assistant.';
}

function configuredSpaces(skill: InstalledSkill): string[] {
  const config = skill.config && typeof skill.config === 'object' ? skill.config : {};
  const spaces = Array.isArray(config.spaces) ? config.spaces : [];
  return spaces
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    .map((item) => String(item.name || item.id || '').trim())
    .filter(Boolean);
}

export default function SkillsPage() {
  const [skills, setSkills] = useState<InstalledSkill[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadSkills = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      await ensureControlPlaneSession();
      const res = await fetch('/api/skills/state', { cache: 'no-store' });
      const body = (await res.json().catch(() => ({}))) as SkillsStateResponse & { detail?: string; message?: string };
      if (!res.ok) {
        throw new Error(String(body?.detail || body?.message || 'Failed to load skills.'));
      }
      const items = Array.isArray(body.installed) ? body.installed : [];
      setSkills(items.filter((item) => item && typeof item === 'object' && String(item.id || '').trim()));
    } catch (fetchError) {
      setSkills([]);
      setError(fetchError instanceof Error ? fetchError.message : 'Failed to load skills.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSkills();
  }, [loadSkills]);

  const activeCount = skills.filter((item) => item.enabled).length;

  return (
    <div className="orion-page-shell narrow orion-animate-in">
      <PageHero
        kicker="Skills"
        title="Installed capability modules available to this deployment."
        copy="Use this page to confirm which skill modules are active, what they do, and which built-in assistant capabilities remain available by default."
        aside={
          <PageHeroCard label="Current status">
            <div className="orion-home-side-stats">
              <div>
                <div className="orion-home-side-value">{activeCount}</div>
                <div className="orion-home-side-note">Active skills</div>
              </div>
              <div>
                <div className="orion-home-side-value">{skills.length}</div>
                <div className="orion-home-side-note">Installed skills</div>
              </div>
            </div>
          </PageHeroCard>
        }
      />

      <MetricStrip
        items={[
          { label: 'Installed skills', value: String(skills.length) },
          { label: 'Active skills', value: String(activeCount) },
          { label: 'Built-in skills', value: String(BUILT_IN_SKILLS.length) },
        ]}
        minWidth={180}
      />

      <PageSection title="Installed skills" description="These skills are loaded from the backend `/skills/state` endpoint.">

        {loading ? (
          <PageStatePanel variant="loading" title="Loading skills…" />
        ) : error ? (
          <PageStatePanel variant="error" title="Could not load skills" copy={error} />
        ) : skills.length === 0 ? (
          <PageStatePanel
            variant="empty"
            title="No installed skills found"
            copy="Add a skill directory under `/skills` on the runtime host and it will appear here automatically."
          />
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
            {skills.map((skill) => {
              const spaces = configuredSpaces(skill);
              return (
                <article
                  key={skill.id}
                  style={{
                    display: 'grid',
                    gap: 10,
                    padding: 16,
                    borderRadius: 16,
                    border: '1px solid var(--border-default)',
                    background: 'var(--bg-surface)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
                    <div style={{ display: 'grid', gap: 4 }}>
                      <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>{skill.name}</div>
                      <div style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>{skill.id}</div>
                    </div>
                    <span className="orion-chip">{skill.enabled ? 'Active' : 'Inactive'}</span>
                  </div>

                  <div style={{ fontSize: 13.5, lineHeight: 1.6, color: 'var(--text-secondary)' }}>
                    {capabilitySummary(skill)}
                  </div>

                  {spaces.length > 0 ? (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {spaces.slice(0, 4).map((space) => (
                        <span key={`${skill.id}:${space}`} className="orion-chip">
                          {space}
                        </span>
                      ))}
                    </div>
                  ) : null}

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {skill.has_snapshot_worker ? <span className="orion-chip">Worker</span> : null}
                    {skill.has_query_handler ? <span className="orion-chip">Query handler</span> : null}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </PageSection>

      <PageSection title="Built-in skills" description="Core assistant abilities available independently of installed plugins.">

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
          {BUILT_IN_SKILLS.map((skill) => (
            <div key={skill} className="orion-list-row" style={{ minHeight: 76, alignItems: 'center' }}>
              <div className="orion-list-row-main">
                <div className="orion-list-row-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <Sparkles size={14} />
                  {skill}
                </div>
              </div>
            </div>
          ))}
        </div>
      </PageSection>
    </div>
  );
}
