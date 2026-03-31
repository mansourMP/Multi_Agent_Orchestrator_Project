'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import { useToast } from '@/components/Toast';
import { ensureControlPlaneSession } from '@/lib/controlPlaneSession';
import {
  GLOBAL_COMMAND_EVENT,
  LEGACY_ORION_GLOBAL_COMMAND_EVENT,
  PENDING_GLOBAL_COMMAND_STORAGE_KEY,
  LEGACY_ORION_PENDING_COMMAND_STORAGE_KEY,
  listPlatformCommands,
  searchPlatformCommands,
  type PlatformCommand,
  type PlatformGlobalCommandEventDetail,
  type PlatformLocalOpsAction,
} from '@/lib/commandRegistry';

const LOCAL_OP_SUCCESS: Record<PlatformLocalOpsAction, string> = {
  start_services: 'Start services command sent.',
  restart_services: 'Restart services command sent.',
  readiness: 'Readiness check triggered.',
  release_status: 'Release status command sent.',
  telegram_rebind: 'Telegram rebind command sent.',
  ops_daemon_status: 'Daemon status refreshed.',
  ops_daemon_restart: 'Ops daemon restart command sent.',
};

export const EMPYRALIS_COMMAND_PALETTE_OPEN_EVENT = 'empyralis:command-palette-open';
export const LEGACY_ORION_COMMAND_PALETTE_OPEN_EVENT = 'orion:command-palette-open';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function extractMessage(payload: unknown): string {
  if (!isRecord(payload)) return '';
  const detail = payload.detail;
  if (typeof detail === 'string' && detail.trim()) return detail.trim();
  const stderr = payload.stderr;
  if (typeof stderr === 'string' && stderr.trim()) return stderr.trim();
  const stdout = payload.stdout;
  if (typeof stdout === 'string' && stdout.trim()) return stdout.trim();
  const output = payload.output;
  if (typeof output === 'string' && output.trim()) return output.trim();
  const message = payload.message;
  if (typeof message === 'string' && message.trim()) return message.trim();
  return '';
}

export function GlobalCommandPalette() {
  const router = useRouter();
  const pathname = usePathname() ?? '/';
  const { addToast } = useToast();
  const inputRef = useRef<HTMLInputElement | null>(null);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [runningId, setRunningId] = useState<string | null>(null);
  const commands = useMemo(() => listPlatformCommands(), []);
  const filtered = useMemo(() => searchPlatformCommands(commands, query), [commands, query]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query, open]);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => inputRef.current?.focus(), 10);
    return () => window.clearTimeout(timer);
  }, [open]);

  const runLocalOp = useCallback(async (action: PlatformLocalOpsAction) => {
    await ensureControlPlaneSession();
    const res = await fetch('/api/local-ops', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    const payload = (await res.json().catch(() => null)) as unknown;
    if (!res.ok) {
      const text = extractMessage(payload);
      throw new Error(text || `Operation failed (${res.status}).`);
    }
    if (isRecord(payload) && payload.ok === false) {
      const text = extractMessage(payload);
      throw new Error(text || 'Operation failed.');
    }
    return payload;
  }, []);

  const emitUiEvent = useCallback(
    (detail: PlatformGlobalCommandEventDetail, navigateHomeFirst: boolean) => {
      const dispatch = () => {
        window.dispatchEvent(new CustomEvent<PlatformGlobalCommandEventDetail>(GLOBAL_COMMAND_EVENT, { detail }));
        window.dispatchEvent(new CustomEvent<PlatformGlobalCommandEventDetail>(LEGACY_ORION_GLOBAL_COMMAND_EVENT, { detail }));
      };
      if (!navigateHomeFirst) {
        dispatch();
        return;
      }
      try {
        const payload = JSON.stringify({ detail, ts: Date.now() });
        window.sessionStorage.setItem(PENDING_GLOBAL_COMMAND_STORAGE_KEY, payload);
        window.sessionStorage.setItem(LEGACY_ORION_PENDING_COMMAND_STORAGE_KEY, payload);
      } catch {
        // Storage access can fail in strict privacy contexts; direct dispatch still works on Home.
      }
      router.push('/');
      window.setTimeout(dispatch, 220);
    },
    [router],
  );

  const executeCommand = useCallback(
    async (command: PlatformCommand) => {
      setRunningId(command.id);
      try {
        if (command.action.type === 'navigate') {
          router.push(command.action.href);
          addToast({ type: 'info', title: command.title });
        } else if (command.action.type === 'local_op') {
          const payload = await runLocalOp(command.action.action);
          const message = extractMessage(payload);
          addToast({
            type: 'success',
            title: LOCAL_OP_SUCCESS[command.action.action],
            message: message ? message.slice(0, 180) : undefined,
          });
        } else if (command.action.type === 'ui_event') {
          const requiresHome = command.action.event === 'focus_command' || command.action.event === 'focus_goal' || command.action.event === 'run_autopilot';
          emitUiEvent({ type: command.action.event }, requiresHome && pathname !== '/');
        }
        setOpen(false);
        setQuery('');
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Command failed.';
        addToast({ type: 'error', title: 'Command failed', message: message.slice(0, 180) });
      } finally {
        setRunningId(null);
      }
    },
    [addToast, emitUiEvent, pathname, router, runLocalOp],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      const cmdOrCtrl = event.metaKey || event.ctrlKey;
      if (cmdOrCtrl && key === 'k') {
        event.preventDefault();
        setOpen((prev) => !prev);
        return;
      }
      if (cmdOrCtrl && event.shiftKey && key === 'p') {
        event.preventDefault();
        setOpen(true);
        return;
      }
      if (!open) return;
      if (key === 'escape') {
        event.preventDefault();
        setOpen(false);
        return;
      }
      if (key === 'arrowdown') {
        event.preventDefault();
        setSelectedIndex((prev) => (filtered.length ? (prev + 1) % filtered.length : 0));
        return;
      }
      if (key === 'arrowup') {
        event.preventDefault();
        setSelectedIndex((prev) => (filtered.length ? (prev - 1 + filtered.length) % filtered.length : 0));
        return;
      }
      if (key === 'enter') {
        if (!filtered.length) return;
        event.preventDefault();
        void executeCommand(filtered[selectedIndex] ?? filtered[0]);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [executeCommand, filtered, open, selectedIndex]);

  useEffect(() => {
    const openPalette = () => setOpen(true);
    window.addEventListener(EMPYRALIS_COMMAND_PALETTE_OPEN_EVENT, openPalette);
    window.addEventListener(LEGACY_ORION_COMMAND_PALETTE_OPEN_EVENT, openPalette);
    return () => {
      window.removeEventListener(EMPYRALIS_COMMAND_PALETTE_OPEN_EVENT, openPalette);
      window.removeEventListener(LEGACY_ORION_COMMAND_PALETTE_OPEN_EVENT, openPalette);
    };
  }, []);

  return (
    <>
      {open ? (
        <div className="orion-cmd-overlay" onMouseDown={() => setOpen(false)}>
          <div className="orion-cmd-panel" onMouseDown={(event) => event.stopPropagation()}>
            <div className="orion-cmd-input-row">
              <Search size={16} />
              <input
                ref={inputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search pages, library, and assets..."
                className="orion-cmd-input"
              />
            </div>

            <div className="orion-cmd-list">
              {filtered.length === 0 ? (
                <div className="orion-cmd-empty">No matching command.</div>
              ) : (
                filtered.slice(0, 16).map((command, index) => {
                  const active = index === selectedIndex;
                  const running = runningId === command.id;
                  return (
                    <button
                      key={command.id}
                      type="button"
                      className={`orion-cmd-item${active ? ' is-active' : ''}`}
                      onMouseEnter={() => setSelectedIndex(index)}
                      onClick={() => {
                        void executeCommand(command);
                      }}
                      disabled={Boolean(runningId)}
                    >
                      <div className="orion-cmd-item-main">
                        <span className="orion-cmd-item-title">{command.title}</span>
                        <span className="orion-cmd-item-group">{command.group}</span>
                      </div>
                      <div className="orion-cmd-item-meta">
                        <span className="orion-cmd-item-description">{command.description}</span>
                        {command.shortcut ? <kbd>{command.shortcut}</kbd> : null}
                        {running ? <span className="orion-cmd-item-running">Running…</span> : null}
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            <div className="orion-cmd-footer">
              <span>Enter to run</span>
              <span>Up/Down to navigate</span>
              <span>Esc to close</span>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

export default GlobalCommandPalette;
