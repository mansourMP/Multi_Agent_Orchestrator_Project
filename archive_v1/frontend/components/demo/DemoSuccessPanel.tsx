'use client';

import Link from 'next/link';
import { ArrowRight, CheckCircle2, Compass, MonitorPlay, Sparkles } from 'lucide-react';
import type { DesktopDemoStatus } from '@/lib/desktopFirstRun';
import { DemoArtifactCard } from './DemoArtifactCard';

type DemoSuccessPanelProps = {
  demo: DesktopDemoStatus;
};

export function DemoSuccessPanel({ demo }: DemoSuccessPanelProps) {
  const ocrText = String(demo.ocr?.text || '').trim();
  const ocrError = String(demo.ocr?.error || '').trim();

  return (
    <div className="orion-demo-success">
      <section className="orion-demo-success__hero">
        <div className="orion-demo-success__check">
          <CheckCircle2 size={28} />
        </div>
        <div className="orion-demo-success__copy">
          <div className="orion-demo-success__eyebrow">Demo complete</div>
          <h2>Empyralis captured your desktop and stored the result inside the platform.</h2>
          <p>{demo.description || demo.summary}</p>
        </div>
      </section>

      <DemoArtifactCard demo={demo} />

      <section className="orion-demo-success__insight">
        <div className="orion-demo-success__insight-head">
          <Sparkles size={16} />
          <span>What the demo observed</span>
        </div>
        {ocrText ? (
          <p>{ocrText}</p>
        ) : ocrError ? (
          <p>
            Screenshot capture succeeded. Local text extraction is not available on this machine yet: {ocrError}
          </p>
        ) : (
          <p>Screenshot capture succeeded. No readable text was detected in the current view.</p>
        )}
      </section>

      <section className="orion-demo-next">
        <div className="orion-demo-next__title">What&apos;s next?</div>
        <div className="orion-demo-next__grid">
          <Link href="/" className="orion-demo-next__card">
            <MonitorPlay size={18} />
            <div>
              <div className="orion-demo-next__label">Try browser automation</div>
              <p>Open the main workspace and ask Empyralis to do a supervised desktop task.</p>
            </div>
            <ArrowRight size={16} />
          </Link>
          <Link href="/" className="orion-demo-next__card">
            <Compass size={18} />
            <div>
              <div className="orion-demo-next__label">Create your first run</div>
              <p>Start a real task, then inspect every action, artifact, and approval in one place.</p>
            </div>
            <ArrowRight size={16} />
          </Link>
          <Link href="/quickstart" className="orion-demo-next__card">
            <Sparkles size={18} />
            <div>
              <div className="orion-demo-next__label">Read quickstart guide</div>
              <p>See the shortest path from desktop setup to your first production workflow.</p>
            </div>
            <ArrowRight size={16} />
          </Link>
        </div>
      </section>
    </div>
  );
}
