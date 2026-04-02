'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  CheckCircle2,
  Download,
  ExternalLink,
  Eye,
  Library,
  Package,
  Power,
  RefreshCw,
  Trash2,
  Upload,
} from 'lucide-react';
import { MetricStrip } from '@/components/ui/MetricStrip';
import { OsPageHeader } from '@/components/ui/OsPageHeader';
import { ensureControlPlaneSession } from '@/lib/controlPlaneSession';

type InstalledSkill = {
  id: string;
  name: string;
  version?: string;
  description?: string;
  author?: string;
  tools?: string[];
  slash_commands?: string[];
  requires?: string[];
  homepage?: string;
  source?: string;
  enabled: boolean;
  available: boolean;
  format?: string;
  source_kind?: string;
  installed_path?: string;
  readme?: string;
  install_source?: string;
  installed_at?: string;
  uninstallable?: boolean;
};

type RegistrySkill = {
  id: string;
  name: string;
  version?: string;
  description?: string;
  author?: string;
  tools?: string[];
  slash_commands?: string[];
  requires?: string[];
  homepage?: string;
  source?: string;
  readme?: string;
  installed?: boolean;
};

type RegistryResponse = {
  ok?: boolean;
  items?: RegistrySkill[];
};

type InstalledResponse = {
  ok?: boolean;
  items?: InstalledSkill[];
  count?: number;
};

export default function LibraryPage() {
  const [installedSkills, setInstalledSkills] = useState<InstalledSkill[]>([]);
  const [registrySkills, setRegistrySkills] = useState<RegistrySkill[]>([]);
  const [loadingInstalled, setLoadingInstalled] = useState(false);
  const [loadingRegistry, setLoadingRegistry] = useState(false);
  const [busySkillId, setBusySkillId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [detailSkill, setDetailSkill] = useState<InstalledSkill | RegistrySkill | null>(null);

  const controlPlaneFetch = useCallback(async (input: string, init?: RequestInit) => {
    await ensureControlPlaneSession();
    const headers = new Headers(init?.headers || {});
    if (init?.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    return fetch(input, {
      ...init,
      headers,
      cache: 'no-store',
    });
  }, []);

  const refreshInstalled = useCallback(async () => {
    setLoadingInstalled(true);
    try {
      const res = await controlPlaneFetch('/api/skills');
      if (!res.ok) throw new Error(`Installed skills failed (HTTP ${res.status})`);
      const payload = (await res.json()) as InstalledResponse;
      setInstalledSkills(Array.isArray(payload.items) ? payload.items : []);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load installed skills.';
      setNotice(message);
      setInstalledSkills([]);
    } finally {
      setLoadingInstalled(false);
    }
  }, [controlPlaneFetch]);

  const refreshRegistry = useCallback(async () => {
    setLoadingRegistry(true);
    try {
      const res = await controlPlaneFetch('/api/skills/registry');
      if (!res.ok) throw new Error(`Registry failed (HTTP ${res.status})`);
      const payload = (await res.json()) as RegistryResponse;
      setRegistrySkills(Array.isArray(payload.items) ? payload.items : []);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load marketplace registry.';
      setNotice(message);
      setRegistrySkills([]);
    } finally {
      setLoadingRegistry(false);
    }
  }, [controlPlaneFetch]);

  useEffect(() => {
    void refreshInstalled();
    void refreshRegistry();
  }, [refreshInstalled, refreshRegistry]);

  const handleInstall = useCallback(async (skill: RegistrySkill) => {
    if (!skill.source) return;
    setBusySkillId(skill.id);
    try {
      const res = await controlPlaneFetch('/api/skills/install', {
        method: 'POST',
        body: JSON.stringify({ source_url: skill.source }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(String((payload as { detail?: string }).detail || `Install failed (HTTP ${res.status})`));
      }
      setNotice(`${skill.name} installed.`);
      await refreshInstalled();
      await refreshRegistry();
    } catch (error) {
      const message = error instanceof Error ? error.message : `Failed to install ${skill.name}.`;
      setNotice(message);
    } finally {
      setBusySkillId(null);
    }
  }, [controlPlaneFetch, refreshInstalled, refreshRegistry]);

  const handleToggle = useCallback(async (skill: InstalledSkill) => {
    setBusySkillId(skill.id);
    try {
      const res = await controlPlaneFetch(`/api/skills/${encodeURIComponent(skill.id)}`, {
        method: 'PUT',
        body: JSON.stringify({ enabled: !skill.enabled }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(String((payload as { detail?: string }).detail || `Update failed (HTTP ${res.status})`));
      }
      setNotice(`${skill.name} ${skill.enabled ? 'disabled' : 'enabled'}.`);
      await refreshInstalled();
    } catch (error) {
      const message = error instanceof Error ? error.message : `Failed to update ${skill.name}.`;
      setNotice(message);
    } finally {
      setBusySkillId(null);
    }
  }, [controlPlaneFetch, refreshInstalled]);

  const handleUninstall = useCallback(async (skill: InstalledSkill) => {
    setBusySkillId(skill.id);
    try {
      const res = await controlPlaneFetch(`/api/skills/${encodeURIComponent(skill.id)}`, {
        method: 'DELETE',
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(String((payload as { detail?: string }).detail || `Uninstall failed (HTTP ${res.status})`));
      }
      setNotice(`${skill.name} uninstalled.`);
      await refreshInstalled();
      await refreshRegistry();
    } catch (error) {
      const message = error instanceof Error ? error.message : `Failed to uninstall ${skill.name}.`;
      setNotice(message);
    } finally {
      setBusySkillId(null);
    }
  }, [controlPlaneFetch, refreshInstalled, refreshRegistry]);

  const handlePublish = useCallback(async (skill: InstalledSkill) => {
    setBusySkillId(skill.id);
    try {
      const res = await controlPlaneFetch('/api/skills/publish', {
        method: 'POST',
        body: JSON.stringify({ name: skill.id }),
      });
      const payload = await res.json().catch(() => ({} as { path?: string; detail?: string }));
      if (!res.ok) {
        throw new Error(String(payload.detail || `Publish failed (HTTP ${res.status})`));
      }
      setNotice(payload.path ? `${skill.name} packaged at ${payload.path}` : `${skill.name} packaged.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : `Failed to publish ${skill.name}.`;
      setNotice(message);
    } finally {
      setBusySkillId(null);
    }
  }, [controlPlaneFetch]);

  const stats = useMemo(() => {
    const enabledCount = installedSkills.filter((item) => item.enabled).length;
    return {
      installed: installedSkills.length,
      enabled: enabledCount,
      marketplace: registrySkills.length,
      bundled: installedSkills.filter((item) => item.source_kind === 'bundled').length,
    };
  }, [installedSkills, registrySkills]);

  return (
    <div className="orion-page-shell orion-animate-in">
      <OsPageHeader
        icon={<Library size={18} />}
        title="Skill Library"
        subtitle="Browse marketplace skills, install them into this workspace, and package your own for sharing."
        meta={
          <>
            <span>{stats.installed} installed</span>
            <span>{stats.enabled} enabled</span>
            <span>{stats.marketplace} marketplace</span>
          </>
        }
        actions={
          <>
            <button className="orion-btn orion-btn-ghost" onClick={() => { void refreshInstalled(); void refreshRegistry(); }}>
              <RefreshCw size={14} />
              Refresh
            </button>
          </>
        }
      />

      <MetricStrip
        items={[
          { label: 'Installed', value: String(stats.installed) },
          { label: 'Enabled', value: String(stats.enabled) },
          { label: 'Marketplace', value: String(stats.marketplace) },
          { label: 'Bundled', value: String(stats.bundled) },
        ]}
        minWidth={180}
      />

      {notice ? (
        <section
          className="orion-panel muted"
          style={{ marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}
        >
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{notice}</div>
          <button className="orion-btn orion-btn-ghost" style={{ minHeight: 44, fontSize: 11 }} onClick={() => setNotice(null)}>
            Dismiss
          </button>
        </section>
      ) : null}

      <section className="orion-grid-2">
        <article className="orion-panel orion-surface-lift" style={{ display: 'grid', gap: 12 }}>
          <div className="orion-panel-header" style={{ marginBottom: 0 }}>
            <div>
              <div className="orion-panel-title">Installed skills</div>
              <div className="orion-panel-copy">
                Enable or disable runtime skills without restarting the platform. Workspace-installed skills can also be removed or packaged.
              </div>
            </div>
          </div>

          <div className="orion-list">
            {loadingInstalled ? (
              <div className="orion-list-row">
                <div className="orion-list-row-subtitle">Loading installed skills…</div>
              </div>
            ) : installedSkills.length === 0 ? (
              <div className="orion-list-row">
                <div className="orion-list-row-subtitle">No installed skills found.</div>
              </div>
            ) : (
              installedSkills.map((skill) => {
                const busy = busySkillId === skill.id;
                return (
                  <article key={skill.id} className="orion-list-row">
                    <div className="orion-list-row-main">
                      <div className="orion-list-row-title">{skill.name}</div>
                      <div className="orion-list-row-subtitle">{skill.description || 'No description provided.'}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>
                        {skill.author || 'Unknown author'} • v{skill.version || '1.0.0'} • {skill.source_kind || 'workspace'} • {skill.format || 'skill_json'}
                      </div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                        <span className="orion-chip">
                          <CheckCircle2 size={12} />
                          {skill.enabled ? 'Enabled' : 'Disabled'}
                        </span>
                        {skill.available ? (
                          <span className="orion-chip">Runtime ready</span>
                        ) : (
                          <span className="orion-chip">Missing runtime deps</span>
                        )}
                        {skill.install_source ? <span className="orion-chip">{skill.install_source}</span> : null}
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-end' }}>
                      <button
                        className="orion-btn orion-btn-ghost"
                        style={{ minHeight: 44, paddingInline: 10, fontSize: 11 }}
                        onClick={() => setDetailSkill(skill)}
                      >
                        <Eye size={12} />
                        Details
                      </button>
                      <button
                        className="orion-btn orion-btn-ghost"
                        style={{ minHeight: 44, paddingInline: 10, fontSize: 11 }}
                        onClick={() => { void handleToggle(skill); }}
                        disabled={busy}
                      >
                        <Power size={12} />
                        {busy ? 'Saving…' : skill.enabled ? 'Disable' : 'Enable'}
                      </button>
                      <button
                        className="orion-btn orion-btn-ghost"
                        style={{ minHeight: 44, paddingInline: 10, fontSize: 11 }}
                        onClick={() => { void handlePublish(skill); }}
                        disabled={busy}
                      >
                        <Download size={12} />
                        {busy ? 'Working…' : 'Publish'}
                      </button>
                      {skill.uninstallable ? (
                        <button
                          className="orion-btn orion-btn-danger"
                          style={{ minHeight: 44, paddingInline: 10, fontSize: 11 }}
                          onClick={() => { void handleUninstall(skill); }}
                          disabled={busy}
                        >
                          <Trash2 size={12} />
                          {busy ? 'Removing…' : 'Uninstall'}
                        </button>
                      ) : null}
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </article>

        <article className="orion-panel orion-surface-lift" style={{ display: 'grid', gap: 12 }}>
          <div className="orion-panel-header" style={{ marginBottom: 0 }}>
            <div>
              <div className="orion-panel-title">Browse marketplace</div>
              <div className="orion-panel-copy">
                Browse the seeded registry now. This same surface can point at a hosted registry later without changing the install flow.
              </div>
            </div>
          </div>

          <div className="orion-list">
            {loadingRegistry ? (
              <div className="orion-list-row">
                <div className="orion-list-row-subtitle">Loading marketplace…</div>
              </div>
            ) : registrySkills.length === 0 ? (
              <div className="orion-list-row">
                <div className="orion-list-row-subtitle">No marketplace entries available.</div>
              </div>
            ) : (
              registrySkills.map((skill) => {
                const busy = busySkillId === skill.id;
                return (
                  <article key={skill.id} className="orion-list-row">
                    <div className="orion-list-row-main">
                      <div className="orion-list-row-title">{skill.name}</div>
                      <div className="orion-list-row-subtitle">{skill.description || 'No description provided.'}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>
                        {skill.author || 'Unknown author'} • v{skill.version || '1.0.0'}
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-end' }}>
                      <button
                        className="orion-btn orion-btn-ghost"
                        style={{ minHeight: 44, paddingInline: 10, fontSize: 11 }}
                        onClick={() => setDetailSkill(skill)}
                      >
                        <Eye size={12} />
                        Details
                      </button>
                      {skill.homepage ? (
                        <a
                          className="orion-btn orion-btn-ghost"
                          style={{ minHeight: 44, paddingInline: 10, fontSize: 11 }}
                          href={skill.homepage}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <ExternalLink size={12} />
                          Home
                        </a>
                      ) : null}
                      <button
                        className="orion-btn orion-btn-primary"
                        style={{ minHeight: 44, paddingInline: 10, fontSize: 11 }}
                        onClick={() => { void handleInstall(skill); }}
                        disabled={busy || skill.installed || !skill.source}
                      >
                        <Upload size={12} />
                        {skill.installed ? 'Installed' : busy ? 'Installing…' : 'Install'}
                      </button>
                    </div>
                  </article>
                );
              })
            )}
          </div>

          <section className="orion-panel muted" style={{ display: 'grid', gap: 8 }}>
            <div className="orion-panel-title" style={{ marginBottom: 0 }}>Marketplace contract</div>
            <div className="orion-panel-copy">
              Skill packages follow the standardized `skill.json` + `handler.py` layout. Legacy bundled skills remain supported and can be packaged into the new format from this page.
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <span className="orion-chip"><Package size={12} /> `skill.json` manifest</span>
              <span className="orion-chip"><Upload size={12} /> install from registry or GitHub</span>
              <span className="orion-chip"><Download size={12} /> publish as zip</span>
            </div>
          </section>
        </article>
      </section>

      <section className="orion-panel orion-surface-lift" style={{ display: 'grid', gap: 12, marginTop: 12 }}>
        <div className="orion-panel-header" style={{ marginBottom: 0 }}>
          <div>
            <div className="orion-panel-title">Skills</div>
            <div className="orion-panel-copy">
              Installed skills now live here with the rest of the library. The legacy skills route redirects back to this page.
            </div>
          </div>
        </div>

        <div className="orion-list">
          {loadingInstalled ? (
            <div className="orion-list-row">
              <div className="orion-list-row-subtitle">Loading skills…</div>
            </div>
          ) : installedSkills.length === 0 ? (
            <div className="orion-list-row">
              <div className="orion-list-row-subtitle">No installed skills found.</div>
            </div>
          ) : (
            installedSkills.map((skill) => (
              <article key={`library-skill-${skill.id}`} className="orion-list-row">
                <div className="orion-list-row-main">
                  <div className="orion-list-row-title">{skill.name}</div>
                  <div className="orion-list-row-subtitle">{skill.description || 'No description provided.'}</div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                    <span className="orion-chip">
                      <BookOpen size={12} />
                      {skill.enabled ? 'Enabled' : 'Disabled'}
                    </span>
                    {skill.available ? <span className="orion-chip">Runtime ready</span> : <span className="orion-chip">Missing runtime deps</span>}
                    {skill.author ? <span className="orion-chip">{skill.author}</span> : null}
                  </div>
                </div>
                <div className="orion-list-row-subtitle" style={{ whiteSpace: 'nowrap' }}>
                  v{skill.version || '1.0.0'}
                </div>
              </article>
            ))
          )}
        </div>
      </section>

      {detailSkill ? (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'var(--overlay-scrim)',
            display: 'grid',
            placeItems: 'center',
            zIndex: 120,
            padding: 24,
          }}
          onClick={() => setDetailSkill(null)}
        >
          <div
            className="orion-panel orion-surface-lift"
            style={{ width: 'min(760px, 100%)', maxHeight: '80vh', overflow: 'auto', display: 'grid', gap: 12 }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="orion-panel-header" style={{ marginBottom: 0 }}>
              <div>
                <div className="orion-panel-title">{detailSkill.name}</div>
                <div className="orion-panel-copy">{detailSkill.description || 'No description provided.'}</div>
              </div>
              <button className="orion-btn orion-btn-ghost" onClick={() => setDetailSkill(null)}>
                Close
              </button>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <span className="orion-chip">{detailSkill.author || 'Unknown author'}</span>
              <span className="orion-chip">v{detailSkill.version || '1.0.0'}</span>
              {'enabled' in detailSkill ? <span className="orion-chip">{detailSkill.enabled ? 'Enabled' : 'Disabled'}</span> : null}
            </div>
            <pre
              style={{
                margin: 0,
                whiteSpace: 'pre-wrap',
                borderRadius: 12,
                border: '1px solid var(--border-subtle)',
                background: 'var(--bg-surface)',
                color: 'var(--text-secondary)',
                padding: 14,
                fontSize: 12,
                lineHeight: 1.6,
              }}
            >
              {detailSkill.readme || 'No README available.'}
            </pre>
          </div>
        </div>
      ) : null}
    </div>
  );
}
