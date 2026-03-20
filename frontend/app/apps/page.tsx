'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Grid2x2, Pin, PinOff, Puzzle } from 'lucide-react';
import { MetricStrip } from '@/components/ui/MetricStrip';
import { OsPageHeader } from '@/components/ui/OsPageHeader';
import {
  APPS_PINNED_UPDATED_EVENTS,
  SKILLS_UPDATED_EVENTS,
  loadCustomSkills,
  loadPinnedApps,
  savePinnedApps,
  type SkillCard,
} from '@/lib/skills';

const MAX_PINNED_APPS = 6;

export default function AppsPage() {
  const [apps, setApps] = useState<SkillCard[]>([]);
  const [pinnedIds, setPinnedIds] = useState<string[]>([]);
  const [draggingPinnedId, setDraggingPinnedId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const refresh = () => {
      setApps(loadCustomSkills());
      setPinnedIds(loadPinnedApps());
    };
    refresh();
    window.addEventListener('storage', refresh);
    for (const eventName of SKILLS_UPDATED_EVENTS) {
      window.addEventListener(eventName, refresh as EventListener);
    }
    for (const eventName of APPS_PINNED_UPDATED_EVENTS) {
      window.addEventListener(eventName, refresh as EventListener);
    }
    return () => {
      window.removeEventListener('storage', refresh);
      for (const eventName of SKILLS_UPDATED_EVENTS) {
        window.removeEventListener(eventName, refresh as EventListener);
      }
      for (const eventName of APPS_PINNED_UPDATED_EVENTS) {
        window.removeEventListener(eventName, refresh as EventListener);
      }
    };
  }, []);

  const appById = useMemo(() => new Map(apps.map((app) => [app.id, app])), [apps]);

  const normalizedPinnedIds = useMemo(
    () => pinnedIds.filter((id) => appById.has(id)).slice(0, MAX_PINNED_APPS),
    [appById, pinnedIds],
  );

  const pinnedApps = useMemo(
    () => normalizedPinnedIds.map((id) => appById.get(id)).filter((item): item is SkillCard => Boolean(item)),
    [appById, normalizedPinnedIds],
  );

  const orderedApps = useMemo(() => {
    const pinnedSet = new Set(normalizedPinnedIds);
    const rest = apps.filter((item) => !pinnedSet.has(item.id));
    return [...pinnedApps, ...rest];
  }, [apps, normalizedPinnedIds, pinnedApps]);

  const availableCount = Math.max(0, apps.length - normalizedPinnedIds.length);

  const togglePin = (appId: string) => {
    const isPinned = normalizedPinnedIds.includes(appId);
    if (!isPinned && normalizedPinnedIds.length >= MAX_PINNED_APPS) {
      setNotice(`Pinned app limit reached (${MAX_PINNED_APPS}). Unpin one first.`);
      return;
    }
    const next = isPinned
      ? normalizedPinnedIds.filter((id) => id !== appId)
      : [...normalizedPinnedIds, appId];
    savePinnedApps(next);
    setPinnedIds(next);
    setNotice(null);
  };

  const reorderPinned = (sourceId: string, targetId: string) => {
    if (!sourceId || !targetId || sourceId === targetId) return;
    const sourceIndex = normalizedPinnedIds.indexOf(sourceId);
    const targetIndex = normalizedPinnedIds.indexOf(targetId);
    if (sourceIndex < 0 || targetIndex < 0) return;
    const next = [...normalizedPinnedIds];
    next.splice(sourceIndex, 1);
    next.splice(targetIndex, 0, sourceId);
    savePinnedApps(next);
    setPinnedIds(next);
  };

  return (
    <div className="orion-page-shell orion-animate-in">
      <OsPageHeader
        icon={<Grid2x2 size={18} />}
        title="Apps"
        subtitle="Optional capability surfaces."
        meta={
          <>
            <span>{apps.length} installed</span>
            <span>{normalizedPinnedIds.length} pinned</span>
          </>
        }
        actions={
          <Link className="orion-btn orion-btn-ghost" href="/skills">
            Manage Capabilities
          </Link>
        }
      />

      <MetricStrip
        items={[
          { label: 'Installed', value: String(apps.length) },
          { label: 'Pinned', value: `${normalizedPinnedIds.length} / ${MAX_PINNED_APPS}` },
          { label: 'Available', value: String(availableCount) },
        ]}
        minWidth={170}
      />

      <section className="orion-panel" style={{ display: 'grid', gap: 8 }}>
        <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
          {apps.length} installed app{apps.length === 1 ? '' : 's'} · pinned {normalizedPinnedIds.length} / {MAX_PINNED_APPS}
        </div>
        {notice ? <div style={{ fontSize: 12, color: 'var(--warning-fg)' }}>{notice}</div> : null}
      </section>

      {orderedApps.length === 0 ? (
        <section className="orion-empty">
          <div className="orion-empty-title">No apps installed</div>
          <div className="orion-empty-copy">Install optional capabilities first, then pin their apps here.</div>
          <div style={{ marginTop: 10 }}>
            <Link className="orion-btn orion-btn-ghost" href="/skills">
              Manage Capabilities
            </Link>
          </div>
        </section>
      ) : (
        <>
          <section className="orion-panel" style={{ display: 'grid', gap: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 700, paddingBottom: 8, borderBottom: '1px solid var(--border-subtle)' }}>
              Pinned Rail Order
            </div>
            {pinnedApps.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>No pinned apps yet.</div>
            ) : (
              <div style={{ display: 'grid', gap: 8 }}>
                {pinnedApps.map((app) => (
                  <article
                    key={`pinned:${app.id}`}
                    className="orion-list-row"
                    draggable
                    onDragStart={() => setDraggingPinnedId(app.id)}
                    onDragEnd={() => setDraggingPinnedId(null)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => {
                      event.preventDefault();
                      if (!draggingPinnedId) return;
                      reorderPinned(draggingPinnedId, app.id);
                      setDraggingPinnedId(null);
                    }}
                    style={{
                      background: draggingPinnedId === app.id ? 'var(--primary-soft)' : undefined,
                    }}
                  >
                    <div className="orion-list-row-main" style={{ gap: 6 }}>
                      <div className="orion-list-row-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Puzzle size={14} />
                        {app.title}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Drag to reorder in left rail.</div>
                    </div>
                    <button className="orion-btn orion-btn-ghost" onClick={() => togglePin(app.id)}>
                      <PinOff size={14} />
                      Unpin
                    </button>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="orion-list">
            {orderedApps.map((app) => {
              const isPinned = normalizedPinnedIds.includes(app.id);
              return (
                <article key={app.id} className="orion-list-row">
                  <div className="orion-list-row-main" style={{ gap: 8 }}>
                    <div className="orion-list-row-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Puzzle size={14} />
                      {app.title}
                    </div>
                    <div className="orion-list-row-subtitle">{app.intent}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                      Optional capability app
                    </div>
                  </div>
                  <div style={{ display: 'inline-flex', gap: 8, flexWrap: 'wrap' }}>
                    <Link className="orion-btn orion-btn-ghost" href={`/skills?focus=${encodeURIComponent(app.id)}`}>
                      Open
                    </Link>
                    <button className="orion-btn orion-btn-ghost" onClick={() => togglePin(app.id)}>
                      {isPinned ? <PinOff size={14} /> : <Pin size={14} />}
                      {isPinned ? 'Unpin' : 'Pin'}
                    </button>
                  </div>
                </article>
              );
            })}
          </section>
        </>
      )}
    </div>
  );
}
