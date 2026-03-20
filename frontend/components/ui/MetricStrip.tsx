'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';

type MetricStripItem = {
  label: string;
  value: ReactNode;
  note?: ReactNode;
};

type MetricStripProps = {
  items: MetricStripItem[];
  minWidth?: number;
};

function isIntegerToken(value: ReactNode): value is string | number {
  if (typeof value === 'number' && Number.isFinite(value)) return Number.isInteger(value);
  if (typeof value !== 'string') return false;
  return /^-?\d+$/.test(value.trim());
}

function AnimatedMetricValue({ value }: { value: ReactNode }) {
  const numericTarget = useMemo(() => {
    if (!isIntegerToken(value)) return null;
    const parsed = typeof value === 'number' ? value : Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }, [value]);
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    if (numericTarget === null) return;
    let frame = 0;
    const startedAt = performance.now();
    const tick = (timestamp: number) => {
      const progress = Math.min(1, (timestamp - startedAt) / 600);
      const nextValue = Math.round(numericTarget * progress);
      setDisplayValue(nextValue);
      if (progress < 1) {
        frame = window.requestAnimationFrame(tick);
      }
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [numericTarget]);

  if (numericTarget === null) {
    return <>{value}</>;
  }

  return <>{displayValue}</>;
}

export function MetricStrip({ items, minWidth = 150 }: MetricStripProps) {
  return (
    <section
      className="orion-metric-strip orion-stagger-grid"
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(auto-fit, minmax(${minWidth}px, 1fr))`,
        gap: 10,
      }}
    >
      {items.map((item) => (
        <section key={item.label} className="orion-stat-card">
          <div className="orion-stat-label">{item.label}</div>
          <div className="orion-stat-value">
            <AnimatedMetricValue value={item.value} />
          </div>
          {item.note ? <div className="orion-stat-note">{item.note}</div> : null}
        </section>
      ))}
    </section>
  );
}
