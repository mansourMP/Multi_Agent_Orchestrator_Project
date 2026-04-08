'use client';

import Link from 'next/link';
import { ArrowRight, ShieldCheck, Sparkles } from 'lucide-react';

export default function QuickstartPage() {
  return (
    <div className="orion-page-shell narrow orion-animate-in" style={{ width: 'min(760px, 100%)', margin: '0 auto', gap: 18 }}>
      <section className="orion-panel" style={{ display: 'grid', gap: 16, padding: 24 }}>
        <div style={{ display: 'grid', gap: 8 }}>
          <div className="orion-chip">Quickstart</div>
          <h1 className="orion-panel-title" style={{ margin: 0 }}>From install to first useful run</h1>
          <p style={{ margin: 0, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
            The fastest path is: finish desktop permissions, run the screenshot demo, open the main workspace, then try one supervised browser task with approvals enabled.
          </p>
        </div>

        <div className="orion-demo-next__grid">
          <div className="orion-demo-next__card is-static">
            <Sparkles size={18} />
            <div>
              <div className="orion-demo-next__label">1. Finish setup</div>
              <p>Grant screen recording, accessibility, and local filesystem access in the desktop app.</p>
            </div>
          </div>
          <div className="orion-demo-next__card is-static">
            <ShieldCheck size={18} />
            <div>
              <div className="orion-demo-next__label">2. Run the demo</div>
              <p>Capture a screenshot, save the artifact, and confirm the local runtime is working.</p>
            </div>
          </div>
          <div className="orion-demo-next__card is-static">
            <ArrowRight size={18} />
            <div>
              <div className="orion-demo-next__label">3. Start a real task</div>
              <p>Open the main workspace and ask Empyralis to do one supervised desktop or browser action.</p>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Link href="/demo" className="orion-btn orion-btn-primary">Open demo</Link>
          <Link href="/" className="orion-btn orion-btn-ghost">Open workspace</Link>
          <Link href="/artifacts" className="orion-btn orion-btn-ghost">Open artifacts</Link>
        </div>
      </section>
    </div>
  );
}
