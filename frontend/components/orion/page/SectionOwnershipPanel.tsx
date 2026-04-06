'use client';

import Link from 'next/link';
import { getProductSection, getProductSectionBoundary, type ProductSectionId } from '@/lib/productArchitecture';

export default function SectionOwnershipPanel({ sectionId }: { sectionId: ProductSectionId }) {
  const section = getProductSection(sectionId);
  const boundary = getProductSectionBoundary(sectionId);

  if (!boundary) return null;

  return (
    <section
      className="orion-panel muted"
      style={{
        marginBottom: 12,
        display: 'grid',
        gap: 14,
      }}
    >
      <div style={{ display: 'grid', gap: 4 }}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--text-tertiary)',
          }}
        >
          Canonical Ownership
        </div>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
          {section.label} owns {section.summary.toLowerCase()}
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gap: 12,
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
        }}
      >
        <div style={{ display: 'grid', gap: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>Belongs here</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {boundary.owns.map((item) => (
              <span key={item} className="orion-chip">{item}</span>
            ))}
          </div>
        </div>

        <div style={{ display: 'grid', gap: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>First-class actions</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {boundary.firstClass.map((item) => (
              <span key={item} className="orion-chip">{item}</span>
            ))}
          </div>
        </div>

        <div style={{ display: 'grid', gap: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>Not owned here</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {boundary.notHere.map((item) => (
              <span key={item} className="orion-chip">{item}</span>
            ))}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {boundary.relatedLinks.map((link) => (
          <Link key={link.href} href={link.href} className="orion-control-link" title={link.reason}>
            {link.label}
          </Link>
        ))}
      </div>
    </section>
  );
}
