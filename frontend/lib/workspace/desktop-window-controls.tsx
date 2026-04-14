'use client';

import type { ReactNode } from 'react';

import { useWorkstationDesktopBridge } from '@/lib/workspace/workstation-desktop-bridge';

function WindowControlIcon({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <svg
      viewBox="0 0 12 12"
      width="12"
      height="12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

function MacTrafficLight({
  tone,
  label,
  onClick,
}: {
  tone: 'close' | 'minimize' | 'maximize';
  label: string;
  onClick: () => void;
}) {
  const background =
    tone === 'close'
      ? '#ff5f57'
      : tone === 'minimize'
        ? '#febc2e'
        : '#28c840';

  return (
    <button
      type="button"
      aria-label={label}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      style={{
        width: '0.82rem',
        height: '0.82rem',
        borderRadius: '999px',
        border: '1px solid color-mix(in srgb, black 18%, transparent 82%)',
        background,
        padding: 0,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 1px 0 color-mix(in srgb, white 18%, transparent 82%) inset',
        cursor: 'pointer',
      }}
    />
  );
}

function AppWindowButton({
  label,
  onClick,
  children,
  tone = 'neutral',
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
  tone?: 'neutral' | 'danger';
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      style={{
        width: '1.9rem',
        height: '1.7rem',
        borderRadius: '0.58rem',
        border: tone === 'danger' ? '1px solid color-mix(in srgb, var(--app-danger) 36%, var(--app-border-subtle) 64%)' : '1px solid var(--app-border-subtle)',
        background: tone === 'danger'
          ? 'color-mix(in srgb, var(--app-danger) 10%, var(--app-bg-panel) 90%)'
          : 'color-mix(in srgb, var(--app-bg-panel-elevated) 84%, var(--app-bg-overlay) 16%)',
        color: tone === 'danger' ? 'var(--app-danger)' : 'var(--app-text-secondary)',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}

export function DesktopWindowControls() {
  const desktop = useWorkstationDesktopBridge();

  if (!desktop.available || !desktop.window.supported) {
    return null;
  }

  if (desktop.platform === 'macos') {
    return (
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.45rem',
        }}
      >
        <MacTrafficLight
          tone="close"
          label="Close window"
          onClick={() => {
            void desktop.window.close();
          }}
        />
        <MacTrafficLight
          tone="minimize"
          label="Minimize window"
          onClick={() => {
            void desktop.window.minimize();
          }}
        />
        <MacTrafficLight
          tone="maximize"
          label={desktop.window.maximized ? 'Restore window' : 'Maximize window'}
          onClick={() => {
            void desktop.window.toggleMaximize();
          }}
        />
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.4rem',
      }}
    >
      <AppWindowButton
        label="Minimize window"
        onClick={() => {
          void desktop.window.minimize();
        }}
      >
        <WindowControlIcon>
          <path d="M2 8.5h8" />
        </WindowControlIcon>
      </AppWindowButton>
      <AppWindowButton
        label={desktop.window.maximized ? 'Restore window' : 'Maximize window'}
        onClick={() => {
          void desktop.window.toggleMaximize();
        }}
      >
        <WindowControlIcon>
          {desktop.window.maximized ? (
            <>
              <path d="M3.5 4.5h5v5h-5z" />
              <path d="M2.5 7.5v-4h4" />
            </>
          ) : (
            <path d="M3 3.5h6v5h-6z" />
          )}
        </WindowControlIcon>
      </AppWindowButton>
      <AppWindowButton
        label="Close window"
        tone="danger"
        onClick={() => {
          void desktop.window.close();
        }}
      >
        <WindowControlIcon>
          <path d="M3.5 3.5 8.5 8.5" />
          <path d="M8.5 3.5 3.5 8.5" />
        </WindowControlIcon>
      </AppWindowButton>
    </div>
  );
}
