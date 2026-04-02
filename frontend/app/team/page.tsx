'use client';

import Link from 'next/link';
import { Settings, Users } from 'lucide-react';
import { OsPageHeader } from '@/components/ui/OsPageHeader';

export default function TeamPage() {
  return (
    <div className="orion-page-shell narrow orion-animate-in">
      <OsPageHeader
        icon={<Users size={18} />}
        title="Team"
        subtitle="Team management is not available yet."
        actions={
          <Link href="/settings" className="orion-btn orion-btn-ghost" style={{ minHeight: 44, paddingInline: 12 }}>
            <Settings size={13} />
            Settings
          </Link>
        }
      />

      <section
        className="orion-panel muted"
        style={{ minHeight: 220, display: 'grid', placeItems: 'center', textAlign: 'center' }}
      >
        <div style={{ display: 'grid', gap: 8 }}>
          <div className="orion-panel-title">Team management is not available yet.</div>
          <div className="orion-panel-copy" style={{ margin: 0 }}>
            This workspace does not support member invites, roles, or access management yet.
          </div>
        </div>
      </section>
    </div>
  );
}
