'use client';

import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { DESIGN_TOKENS, bodyTextStyle, mergeStyles, metaTextStyle, statCardStyle } from '@/design-constraints';

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

export function MetricStrip({ items, minWidth = 180 }: MetricStripProps) {
  return (
    <section
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(auto-fit, minmax(${minWidth}px, 1fr))`,
        gap: DESIGN_TOKENS.space[3],
      } as CSSProperties}
    >
      {items.map((item) => (
        <section key={item.label} style={statCardStyle()}>
          <div style={mergeStyles(metaTextStyle(), { textTransform: 'uppercase', letterSpacing: DESIGN_TOKENS.type.tracking.wide })}>
            {item.label}
          </div>
          <div
            style={{
              color: DESIGN_TOKENS.color.textPrimary,
              fontSize: DESIGN_TOKENS.type.size.titleSm,
              fontWeight: DESIGN_TOKENS.type.weight.semibold,
              lineHeight: DESIGN_TOKENS.type.lineHeight.tight,
              letterSpacing: DESIGN_TOKENS.type.tracking.tight,
            }}
          >
            <AnimatedMetricValue value={item.value} />
          </div>
          {item.note ? (
            <div style={mergeStyles(bodyTextStyle('tertiary'), { fontSize: DESIGN_TOKENS.type.size.label })}>
              {item.note}
            </div>
          ) : null}
        </section>
      ))}
    </section>
  );
}
