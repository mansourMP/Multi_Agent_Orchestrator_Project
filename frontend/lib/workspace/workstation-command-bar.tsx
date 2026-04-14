'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { useWorkspaceBoundary } from '@/lib/workspace/workspace-boundary';
import { resolveRouteIdFromHref } from '@/lib/workspace/workspace-shell';

export function WorkstationCommandBar() {
  const pathname = usePathname();
  const { routeManifest, workspaceId } = useWorkspaceBoundary();
  const activeRouteId = resolveRouteIdFromHref(workspaceId, pathname);

  return (
    <nav
      aria-label="Workstation navigation"
      data-workstation-command-bar="root"
      style={{
        display: 'grid',
        gap: '0.7rem',
        padding: '0.85rem 1rem 0.9rem',
        borderRadius: '1.05rem',
        border: '1px solid var(--app-border-subtle)',
        background: 'color-mix(in srgb, var(--app-bg-panel) 86%, var(--app-bg-overlay) 14%)',
      }}
    >
      {routeManifest.navGroups.map((group) => (
        <div
          key={group.id}
          style={{
            display: 'grid',
            gap: '0.45rem',
          }}
        >
          <span
            style={{
              color: 'var(--app-text-tertiary)',
              fontSize: '0.72rem',
              fontWeight: 650,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
            }}
          >
            {group.label}
          </span>

          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '0.5rem',
            }}
          >
            {group.routes.map((route) => {
              const active = route.id === activeRouteId;
              return (
                <Link
                  key={route.id}
                  href={route.href}
                  prefetch
                  aria-current={active ? 'page' : undefined}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    minHeight: '2rem',
                    padding: '0.38rem 0.72rem',
                    borderRadius: '999px',
                    border: active ? '1px solid var(--app-border-accent)' : '1px solid var(--app-border-subtle)',
                    background: active
                      ? 'color-mix(in srgb, var(--app-accent-muted) 78%, var(--app-bg-panel) 22%)'
                      : 'color-mix(in srgb, var(--app-bg-panel-elevated) 76%, var(--app-bg-overlay) 24%)',
                    color: active ? 'var(--app-accent-text)' : 'var(--app-text-secondary)',
                    fontSize: '0.82rem',
                    fontWeight: active ? 640 : 560,
                    textDecoration: 'none',
                    transition:
                      'background var(--app-motion-fast) ease, border-color var(--app-motion-fast) ease, color var(--app-motion-fast) ease',
                  }}
                >
                  {route.label}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}
