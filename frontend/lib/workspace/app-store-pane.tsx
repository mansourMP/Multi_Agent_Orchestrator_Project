'use client';

import Link from 'next/link';
import { PackageOpen, Plus } from 'lucide-react';

import styles from './hosted-mini-apps.module.css';

export function WorkspaceAppStorePane({ workspaceId }: { workspaceId: string }) {
  const applicationsHref = `/w/${encodeURIComponent(workspaceId)}/applications`;
  const createHref = `${applicationsHref}?tab=my_apps`;

  return (
    <main className={styles.shell}>
      <section className={styles.appStoreSurface} aria-label="App Store">
        <div className={styles.appsToolbar}>
          <div>
            <p className={styles.commandKicker}>App Store</p>
            <h1 className={styles.sectionTitle}>Browse apps</h1>
          </div>
          <Link className={styles.secondaryAction} href={applicationsHref}>
            Back to apps
          </Link>
        </div>

        <div className={styles.appStoreEmpty}>
          <div className={styles.commandIcon}>
            <PackageOpen aria-hidden="true" />
          </div>
          <div className={styles.commandCopy}>
            <p className={styles.emptyTitle}>No apps available yet.</p>
            <p className={styles.emptyCopy}>
              Empyralis apps will appear here after review. They must be built for the Empyralis shell instead of embedding a generic website.
            </p>
          </div>
          <Link className={styles.primaryAction} href={createHref}>
            <Plus aria-hidden="true" />
            Submit yours
          </Link>
        </div>
      </section>
    </main>
  );
}
