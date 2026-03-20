'use client';

import { useEffect, useMemo, useState, type ComponentType } from 'react';
import {
  Activity,
  Bot,
  Brain,
  Clock3,
  Cpu,
  Eye,
  Shield,
  Sparkles,
  Wand2,
} from 'lucide-react';
import io from 'socket.io-client';
import { BRAND } from '@/lib/brand';

type RoomStatus = 'idle' | 'thinking' | 'executing' | 'blocked';

type AgentRoom = {
  id: string;
  room: string;
  owner: string;
  objective: string;
  status: RoomStatus;
  updatedAt: string;
  icon: ComponentType<{ size?: number }>;
};

const INITIAL_ROOMS: AgentRoom[] = [
  {
    id: 'strategy-room',
    room: 'Strategy Room',
    owner: 'Strategist',
    objective: 'Break goal into executable outcome plan',
    status: 'thinking',
    updatedAt: new Date().toISOString(),
    icon: Brain,
  },
  {
    id: 'ops-room',
    room: 'Operations Room',
    owner: 'Operator',
    objective: 'Coordinate tools, run tasks, report deltas',
    status: 'executing',
    updatedAt: new Date().toISOString(),
    icon: Cpu,
  },
  {
    id: 'review-room',
    room: 'Review Room',
    owner: 'Verifier',
    objective: 'Check quality, risk, and policy boundaries',
    status: 'idle',
    updatedAt: new Date().toISOString(),
    icon: Eye,
  },
  {
    id: 'trust-room',
    room: 'Trust Room',
    owner: 'Guardian',
    objective: 'Hold approval gates for sensitive actions',
    status: 'idle',
    updatedAt: new Date().toISOString(),
    icon: Shield,
  },
];

function statusMeta(status: RoomStatus): {
  label: string;
  color: string;
  border: string;
  bg: string;
} {
  if (status === 'thinking') {
    return {
      label: 'Thinking',
      color: 'var(--primary-base)',
      border: '1px solid var(--primary-border-soft)',
      bg: 'var(--primary-soft)',
    };
  }

  if (status === 'executing') {
    return {
      label: 'Executing',
      color: 'var(--success-fg)',
      border: '1px solid var(--success-border)',
      bg: 'var(--success-bg)',
    };
  }

  if (status === 'blocked') {
    return {
      label: 'Blocked',
      color: 'var(--error-fg)',
      border: '1px solid var(--error-border)',
      bg: 'var(--error-bg)',
    };
  }

  return {
    label: 'Idle',
    color: 'var(--text-secondary)',
    border: '1px solid var(--border-default)',
    bg: 'var(--bg-element)',
  };
}

function statusDot(status: RoomStatus): string {
  if (status === 'thinking') return 'var(--primary-base)';
  if (status === 'executing') return 'var(--success-fg)';
  if (status === 'blocked') return 'var(--error-fg)';
  return 'var(--text-tertiary)';
}

function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleTimeString();
}

export default function AeskCommandCenter() {
  const [rooms, setRooms] = useState<AgentRoom[]>(INITIAL_ROOMS);
  const [logs, setLogs] = useState<string[]>([
    `[boot] ${BRAND.product} Playground online.`,
    '[hint] Run a task to stream agent room events here.',
  ]);
  const [note, setNote] = useState('Run a weekly content cycle and show room updates.');

  useEffect(() => {
    const backendBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
    const socket = io(`${backendBase}/executions`, {
      transports: ['websocket'],
      withCredentials: true,
      timeout: 2500,
    });

    socket.on('log', (payload: { log?: string }) => {
      const text = payload.log?.trim();
      if (!text) return;

      setLogs((prev) => [`[${new Date().toLocaleTimeString()}] ${text}`, ...prev].slice(0, 120));
    });

    socket.on('connect_error', () => {
      setLogs((prev) => {
        if (prev[0]?.includes('Socket disconnected')) return prev;
        return ['[warn] Socket disconnected. Showing local simulation only.', ...prev].slice(0, 120);
      });
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  function simulateRoomCycle() {
    const states: RoomStatus[] = ['thinking', 'executing', 'idle'];

    setRooms((prev) =>
      prev.map((room, index) => {
        const next = states[(index + Math.floor(Math.random() * states.length)) % states.length];
        return {
          ...room,
          status: next,
          updatedAt: new Date().toISOString(),
        };
      }),
    );

    setLogs((prev) => [`[sim] ${note.trim() || 'Simulation triggered.'}`, ...prev].slice(0, 120));
  }

  const summary = useMemo(() => {
    const executing = rooms.filter((room) => room.status === 'executing').length;
    const thinking = rooms.filter((room) => room.status === 'thinking').length;
    const blocked = rooms.filter((room) => room.status === 'blocked').length;

    return {
      total: rooms.length,
      executing,
      thinking,
      blocked,
    };
  }, [rooms]);

  return (
    <div className="orion-page-shell orion-animate-in">
      <header className="orion-page-header">
        <div className="orion-page-title-wrap">
          <div className="orion-page-icon">
            <Sparkles size={18} />
          </div>
          <div>
            <h1 className="orion-page-title">Playground</h1>
            <p className="orion-page-subtitle">
              Multi-room simulation for {BRAND.company} worker coordination.
            </p>
          </div>
        </div>

        <div className="orion-page-actions">
          <button className="orion-btn orion-btn-primary" onClick={simulateRoomCycle}>
            <Wand2 size={14} />
            Simulate Cycle
          </button>
        </div>
      </header>

      <section className="orion-stat-grid">
        <article className="orion-stat-card orion-surface-lift">
          <div className="orion-stat-label">Rooms</div>
          <div className="orion-stat-value">{summary.total}</div>
        </article>
        <article className="orion-stat-card orion-surface-lift">
          <div className="orion-stat-label">Executing</div>
          <div className="orion-stat-value" style={{ color: 'var(--success-fg)' }}>
            {summary.executing}
          </div>
        </article>
        <article className="orion-stat-card orion-surface-lift">
          <div className="orion-stat-label">Thinking</div>
          <div className="orion-stat-value" style={{ color: 'var(--primary-base)' }}>
            {summary.thinking}
          </div>
        </article>
      </section>

      <section className="orion-grid-2">
        <div className="orion-panel orion-surface-lift" style={{ display: 'grid', gap: 10 }}>
          <div className="orion-panel-header" style={{ marginBottom: 0 }}>
            <div>
              <div className="orion-panel-title">Agent Building</div>
              <div className="orion-panel-copy">Role-based rooms coordinated as one digital workforce.</div>
            </div>
          </div>

          <div className="orion-room-grid">
            {rooms.map((room) => {
              const meta = statusMeta(room.status);
              const Icon = room.icon;

              return (
                <article key={room.id} className="orion-room-card orion-surface-lift">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                    <div
                      style={{
                        width: 34,
                        height: 34,
                        borderRadius: 10,
                        border: '1px solid var(--border-default)',
                        background: 'var(--bg-element)',
                        display: 'grid',
                        placeItems: 'center',
                        color: 'var(--text-primary)',
                        flexShrink: 0,
                      }}
                    >
                      <Icon size={15} />
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div className="orion-list-row-title">{room.room}</div>
                      <div className="orion-list-row-subtitle">{room.owner}</div>
                    </div>
                  </div>

                  <div className="orion-room-meta">
                    <span
                      className="orion-chip"
                      style={{
                        border: meta.border,
                        background: meta.bg,
                        color: meta.color,
                        minWidth: 90,
                        justifyContent: 'center',
                      }}
                    >
                      <span className="orion-dot" style={{ background: statusDot(room.status) }} />
                      {meta.label}
                    </span>
                    <span className="orion-room-status">Updated {formatTimestamp(room.updatedAt)}</span>
                  </div>

                  <div className="orion-list-row-subtitle" style={{ lineHeight: 1.45 }}>
                    {room.objective}
                  </div>
                </article>
              );
            })}
          </div>
        </div>

        <div className="orion-panel orion-surface-lift" style={{ display: 'grid', gap: 10, minHeight: 0 }}>
          <div className="orion-panel-header" style={{ marginBottom: 0 }}>
            <div>
              <div className="orion-panel-title">Live Console</div>
              <div className="orion-panel-copy">Streaming room events and orchestration traces.</div>
            </div>
          </div>

          <div className="orion-log" style={{ minHeight: 320 }}>
            {logs.map((line, index) => (
              <div key={`${line}-${index}`} style={{ paddingBottom: 6 }}>
                {line}
              </div>
            ))}
          </div>

          <div className="orion-field">
            <label className="orion-field-label" htmlFor="playground-note">
              Simulation prompt
            </label>
            <textarea
              id="playground-note"
              className="input"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={3}
              style={{ borderRadius: 10, resize: 'vertical', minHeight: 92 }}
            />
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <span className="orion-chip" style={{ color: 'var(--primary-base)', border: '1px solid var(--primary-border-soft)', background: 'var(--primary-soft)' }}>
              <Bot size={12} />
              Autonomous rooms
            </span>
            <span className="orion-chip" style={{ color: 'var(--primary-base)', border: '1px solid var(--primary-border-soft)', background: 'var(--primary-soft)' }}>
              <Activity size={12} />
              Event streaming
            </span>
            <span className="orion-chip" style={{ color: 'var(--warning-fg)', border: '1px solid var(--warning-border)', background: 'var(--warning-bg)' }}>
              <Clock3 size={12} />
              24/7 posture
            </span>
          </div>
        </div>
      </section>

      {summary.blocked > 0 && (
        <div
          className="orion-chip"
          style={{
            width: 'fit-content',
            color: 'var(--error-fg)',
            border: '1px solid var(--error-border)',
            background: 'var(--error-bg)',
          }}
        >
          <Shield size={12} />
          {summary.blocked} room(s) blocked pending approval
        </div>
      )}
    </div>
  );
}
