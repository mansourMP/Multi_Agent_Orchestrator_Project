'use client';

import * as React from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  ActionId,
  ActionImpl,
  KBarAnimator,
  KBarPortal,
  KBarPositioner,
  KBarProvider,
  KBarResults,
  KBarSearch,
  useKBar,
  useMatches,
} from 'kbar';
import { ActivitySquare, Bot, MessageSquare, PlusSquare, Search, Settings, User, Wrench } from 'lucide-react';
import { PRODUCT_SECTIONS, getProductSection } from '@/lib/productArchitecture';

const EMPYRALIS_NEW_CHAT_EVENT = 'empyralis:new-chat';
export const EMPYRALIS_COMMAND_PALETTE_TOGGLE_EVENT = 'empyralis:command-palette-toggle';
type VisibleSectionId = (typeof PRODUCT_SECTIONS)[number]['id'];

const positionerStyle: React.CSSProperties = {
  background: 'rgba(10, 12, 16, 0.52)',
  inset: 0,
  zIndex: 120,
};

const animatorStyle: React.CSSProperties = {
  width: 'min(680px, calc(100vw - 32px))',
  maxWidth: '680px',
  borderRadius: '18px',
  overflow: 'hidden',
  background: 'var(--bg-surface)',
  color: 'var(--text-primary)',
  border: '1px solid var(--border-default)',
  boxShadow: '0 24px 80px rgba(0, 0, 0, 0.28)',
};

const searchStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '16px 18px',
  fontSize: '15px',
  outline: 'none',
  border: 'none',
  borderBottom: '1px solid var(--border-subtle)',
  background: 'transparent',
  color: 'var(--text-primary)',
};

const groupNameStyle: React.CSSProperties = {
  padding: '10px 16px 6px',
  fontSize: '11px',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  color: 'var(--text-tertiary)',
};

function CommandPaletteEvents() {
  const { query } = useKBar();

  React.useEffect(() => {
    const toggle = () => query.toggle();
    window.addEventListener(EMPYRALIS_COMMAND_PALETTE_TOGGLE_EVENT, toggle);
    return () => {
      window.removeEventListener(EMPYRALIS_COMMAND_PALETTE_TOGGLE_EVENT, toggle);
    };
  }, [query]);

  return null;
}

function CommandPaletteSurface() {
  return (
    <KBarPortal>
      <KBarPositioner style={positionerStyle}>
        <KBarAnimator style={animatorStyle}>
          <KBarSearch
            style={searchStyle}
            placeholder="Search navigation and workspace actions..."
          />
          <CommandPaletteResults />
        </KBarAnimator>
      </KBarPositioner>
    </KBarPortal>
  );
}

function CommandPaletteResults() {
  const { results, rootActionId } = useMatches();

  return (
    <KBarResults
      items={results}
      onRender={({ item, active }) =>
        typeof item === 'string' ? (
          <div style={groupNameStyle}>{item}</div>
        ) : (
          <CommandPaletteResultItem
            action={item}
            active={active}
            currentRootActionId={rootActionId}
          />
        )
      }
    />
  );
}

const CommandPaletteResultItem = React.forwardRef<
  HTMLDivElement,
  {
    action: ActionImpl;
    active: boolean;
    currentRootActionId: ActionId | null | undefined;
  }
>(function CommandPaletteResultItem({ action, active, currentRootActionId }, ref) {
  const ancestors = React.useMemo(() => {
    if (!currentRootActionId) return action.ancestors;
    const index = action.ancestors.findIndex((ancestor) => ancestor.id === currentRootActionId);
    return action.ancestors.slice(index + 1);
  }, [action.ancestors, currentRootActionId]);

  return (
    <div
      ref={ref}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px',
        padding: '12px 16px',
        background: active ? 'color-mix(in srgb, var(--bg-hover) 72%, var(--primary-base) 12%)' : 'transparent',
        borderLeft: active ? '2px solid var(--primary-base)' : '2px solid transparent',
        cursor: 'pointer',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '32px',
            height: '32px',
            borderRadius: '10px',
            background: 'color-mix(in srgb, var(--bg-hover) 82%, transparent 18%)',
            color: 'var(--text-secondary)',
            flexShrink: 0,
          }}
        >
          {action.icon}
        </div>
        <div style={{ display: 'grid', gap: '2px', minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0, flexWrap: 'wrap' }}>
            {ancestors.map((ancestor) => (
              <React.Fragment key={ancestor.id}>
                <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>{ancestor.name}</span>
                <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>›</span>
              </React.Fragment>
            ))}
            <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>{action.name}</span>
          </div>
          {action.subtitle ? (
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{action.subtitle}</span>
          ) : null}
        </div>
      </div>

      {action.shortcut?.length ? (
        <div aria-hidden style={{ display: 'grid', gridAutoFlow: 'column', gap: '4px' }}>
          {action.shortcut.map((shortcut) => (
            <kbd
              key={shortcut}
              style={{
                minHeight: '24px',
                padding: '0 8px',
                borderRadius: '8px',
                border: '1px solid var(--border-subtle)',
                background: 'color-mix(in srgb, var(--bg-app) 72%, transparent 28%)',
                color: 'var(--text-tertiary)',
                display: 'inline-flex',
                alignItems: 'center',
                fontSize: '11px',
                fontWeight: 600,
              }}
            >
              {shortcut.toUpperCase()}
            </kbd>
          ))}
        </div>
      ) : null}
    </div>
  );
});

export default function CommandPaletteProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname() ?? '/';

  const startNewChat = React.useCallback(() => {
    const dispatch = () => window.dispatchEvent(new Event(EMPYRALIS_NEW_CHAT_EVENT));
    if (pathname !== '/') {
      router.push('/');
      window.setTimeout(dispatch, 180);
      return;
    }
    dispatch();
  }, [pathname, router]);

  const actions = React.useMemo(
    () => {
      const baseActions = PRODUCT_SECTIONS.map((section) => {
        const sectionId = section.id as VisibleSectionId;
        const shortcuts: Record<VisibleSectionId, string[]> = {
          sage: ['c'],
          runs: ['r'],
          agents: ['a'],
          integrations: ['i'],
          usage: ['u'],
          account: ['p'],
          settings: ['s'],
        };
        const icons: Record<VisibleSectionId, React.ReactNode> = {
          sage: <MessageSquare size={16} />,
          runs: <ActivitySquare size={16} />,
          agents: <Bot size={16} />,
          integrations: <Wrench size={16} />,
          usage: <Wrench size={16} />,
          account: <User size={16} />,
          settings: <Settings size={16} />,
        };
        return {
          id: `section-${sectionId}`,
          name: section.label,
          shortcut: shortcuts[sectionId],
          keywords: `${section.label.toLowerCase()} ${section.role.replace(/_/g, ' ')}`,
          subtitle: section.summary,
          section: 'Navigation',
          perform: () => router.push(section.href),
          icon: icons[sectionId],
        };
      });

      return [
        ...baseActions,
        {
          id: 'new-chat',
          name: 'New chat',
          shortcut: ['n'],
          keywords: 'chat fresh conversation work now',
          subtitle: getProductSection('sage').summary,
          section: 'Sage',
          perform: startNewChat,
          icon: <PlusSquare size={16} />,
        },
        {
          id: 'runs',
          name: 'Runs',
          shortcut: ['r'],
          keywords: 'runs active blocked execution history cockpit',
          subtitle: 'Operational work in motion, blocked work, and completed work.',
          section: 'Runs',
          perform: () => router.push('/runs'),
          icon: <Wrench size={16} />,
        },
        {
          id: 'approvals',
          name: 'Approvals',
          keywords: 'runs blocked confirm attention inbox',
          subtitle: 'Approvals and interventions that need your attention now.',
          section: 'Runs',
          perform: () => router.push('/approvals'),
          icon: <Wrench size={16} />,
        },
        {
          id: 'machines',
          name: 'Machines',
          keywords: 'integrations local runtime machine capability',
          subtitle: 'Workspace runtime targets and local machine availability.',
          section: 'Integrations',
          perform: () => router.push('/integrations'),
          icon: <Wrench size={16} />,
        },
        {
          id: 'health',
          name: 'Health',
          keywords: 'integrations runtime doctor diagnostics machine health',
          subtitle: 'Operational health for connected runtimes and workspace capabilities.',
          section: 'Integrations',
          perform: () => router.push('/integrations'),
          icon: <Wrench size={16} />,
        },
      ];
    },
    [router, startNewChat],
  );

  return (
    <KBarProvider actions={actions}>
      <CommandPaletteEvents />
      <CommandPaletteSurface />
      {children}
    </KBarProvider>
  );
}

export function CommandPaletteLauncherIcon() {
  return <Search size={13} />;
}
