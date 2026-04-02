'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Crown, Eye, Settings, ShieldCheck, UserCog, UserRound, Users } from 'lucide-react';
import { MetricStrip } from '@/components/ui/MetricStrip';
import { OsPageHeader } from '@/components/ui/OsPageHeader';
import { displayNameFromEmail, readAccountProfilePreferences } from '@/lib/accountProfile';

type AccountProfile = {
  displayName: string;
  roleLabel: string;
};

type TeamMember = {
  id: string;
  name: string;
  role: 'Owner' | 'Admin' | 'Operator' | 'Viewer';
  scope: string;
  note: string;
};

const DEFAULT_PROFILE: AccountProfile = {
  displayName: 'Workspace Owner',
  roleLabel: 'Owner',
};

const DEFAULT_MEMBERS: TeamMember[] = [
  {
    id: 'owner',
    name: 'Workspace Owner',
    role: 'Owner',
    scope: 'Full control over agents, integrations, workflows, billing, and settings.',
    note: 'Responsible for final decisions and workspace direction.',
  },
  {
    id: 'admin',
    name: 'Operations Admin',
    role: 'Admin',
    scope: 'Can manage agents, integrations, settings, and most day-to-day configuration.',
    note: 'Best for the person running setup and maintaining the workspace.',
  },
  {
    id: 'operator',
    name: 'Workflow Operator',
    role: 'Operator',
    scope: 'Can run work, review runs, and resolve approvals without changing core settings.',
    note: 'Best for people handling live work every day.',
  },
  {
    id: 'viewer',
    name: 'Read-only Viewer',
    role: 'Viewer',
    scope: 'Can inspect status, assets, and history without changing the workspace.',
    note: 'Best for stakeholders who need visibility only.',
  },
];

const ROLE_TONE: Record<TeamMember['role'], string> = {
  Owner: 'var(--brand-solid)',
  Admin: 'var(--status-info)',
  Operator: 'var(--status-success)',
  Viewer: 'var(--text-secondary)',
};

function loadProfile(): AccountProfile {
  const saved = readAccountProfilePreferences();
  return {
    displayName: saved.displayName || DEFAULT_PROFILE.displayName,
    roleLabel: DEFAULT_PROFILE.roleLabel,
  };
}

export default function TeamPage() {
  const [profile] = useState<AccountProfile>(() => loadProfile());
  const [authEmail, setAuthEmail] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function loadIdentity() {
      try {
        const response = await fetch('/api/control-plane/auth/me', { cache: 'no-store' });
        const payload = (await response.json().catch(() => null)) as { user?: { email?: string | null } | null } | null;
        if (cancelled) return;
        setAuthEmail(String(payload?.user?.email || '').trim());
      } catch {
        // Ignore identity lookup failures on local-only sessions.
      }
    }
    void loadIdentity();
    return () => {
      cancelled = true;
    };
  }, []);

  const members = useMemo<TeamMember[]>(() => {
    const ownerName =
      profile.displayName.trim() || displayNameFromEmail(authEmail, DEFAULT_PROFILE.displayName);
    return DEFAULT_MEMBERS.map((member) =>
      member.id === 'owner'
        ? {
            ...member,
            name: ownerName,
            note: `${ownerName} has the final say on workspace changes and sensitive actions.`,
          }
        : member,
    );
  }, [authEmail, profile.displayName]);

  const metrics = useMemo(
    () => [
      { label: 'People', value: members.length, note: 'Visible roles in this workspace' },
      { label: 'Owner', value: members.filter((member) => member.role === 'Owner').length, note: 'Full-control seats' },
      { label: 'Admins', value: members.filter((member) => member.role === 'Admin').length, note: 'Can manage setup and tools' },
      { label: 'Viewers', value: members.filter((member) => member.role === 'Viewer').length, note: 'Read-only access' },
    ],
    [members],
  );

  return (
    <div className="orion-page-shell orion-animate-in">
      <OsPageHeader
        icon={<Users size={18} />}
        title="Team"
        subtitle="Manage people, roles, and who can change this workspace."
        meta={
          <>
            <span>{profile.displayName.trim() || displayNameFromEmail(authEmail, DEFAULT_PROFILE.displayName)}</span>
            <span>{profile.roleLabel}</span>
          </>
        }
        actions={
          <>
            <Link href="/account" className="orion-btn orion-btn-ghost" style={{ minHeight: 44, paddingInline: 12 }}>
              <UserRound size={13} />
              Account
            </Link>
            <Link href="/settings" className="orion-btn orion-btn-ghost" style={{ minHeight: 44, paddingInline: 12 }}>
              <Settings size={13} />
              Settings
            </Link>
          </>
        }
      />

      <MetricStrip items={metrics} minWidth={150} />

      <section className="orion-grid-2" style={{ gap: 12, alignItems: 'start' }}>
        <section className="orion-panel">
          <div className="orion-panel-header">
            <div>
              <div className="orion-panel-title">Role model</div>
              <div className="orion-panel-copy">Keep access simple: one owner, a few admins or operators, and viewers when people only need visibility.</div>
            </div>
          </div>

          <div style={{ display: 'grid', gap: 10 }}>
            {[
              {
                icon: <Crown size={15} />,
                title: 'Owner',
                copy: 'Full control over the workspace, billing, settings, agents, and sensitive approvals.',
              },
              {
                icon: <ShieldCheck size={15} />,
                title: 'Admin',
                copy: 'Can manage setup, integrations, workflows, and most operational settings.',
              },
              {
                icon: <UserCog size={15} />,
                title: 'Operator',
                copy: 'Can run work, inspect runs, and handle day-to-day operations without full ownership.',
              },
              {
                icon: <Eye size={15} />,
                title: 'Viewer',
                copy: 'Can inspect the workspace, runs, and assets without changing important settings.',
              },
            ].map((role) => (
              <div key={role.title} className="orion-list-row">
                <div className="orion-list-row-main">
                  <div className="orion-list-row-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    {role.icon}
                    {role.title}
                  </div>
                  <div className="orion-list-row-subtitle">{role.copy}</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="orion-panel">
          <div className="orion-panel-header">
            <div>
              <div className="orion-panel-title">Workspace access</div>
              <div className="orion-panel-copy">A simple starting point for who owns the workspace, who operates it, and who only needs read-only visibility.</div>
            </div>
          </div>

          <div className="orion-list" style={{ gap: 10 }}>
            {members.map((member) => (
              <div key={member.id} className="orion-list-row">
                <div className="orion-list-row-main">
                  <div className="orion-list-row-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                    <span
                      aria-hidden
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: 999,
                        background: ROLE_TONE[member.role],
                        boxShadow: `0 0 0 4px color-mix(in srgb, ${ROLE_TONE[member.role]} 14%, transparent)`,
                      }}
                    />
                    {member.name}
                  </div>
                  <div className="orion-list-row-subtitle">{member.scope}</div>
                </div>
                <div style={{ display: 'grid', justifyItems: 'end', gap: 6 }}>
                  <span className="orion-chip">{member.role}</span>
                  <div className="orion-panel-copy" style={{ margin: 0, textAlign: 'right', maxWidth: 260 }}>
                    {member.note}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </section>
    </div>
  );
}
