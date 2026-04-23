import type { ReactNode } from 'react';

export function FirstLaunchPanel({
  primaryAction,
  secondaryAction,
}: {
  primaryAction: ReactNode;
  secondaryAction: ReactNode;
}) {
  return (
    <main className="app-auth-page">
      <section className="app-auth-card app-auth-card--launch">
        <div className="app-first-launch__copy">
          <h1 className="app-auth-title">Welcome to Empyralis</h1>
        </div>
        <div className="app-first-launch__actions">
          {primaryAction}
          {secondaryAction}
        </div>
      </section>
    </main>
  );
}
