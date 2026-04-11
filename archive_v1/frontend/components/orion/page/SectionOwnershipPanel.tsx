'use client';

import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import {
  DESIGN_TOKENS,
  bodyTextStyle,
  buttonStyle,
  eyebrowStyle,
  mergeStyles,
  panelStyle,
  sectionTitleStyle,
} from '@/design-constraints';
import { getProductSection, getProductSectionBoundary, type ProductSectionId } from '@/lib/productArchitecture';

const linkStyle = mergeStyles(buttonStyle({ tone: 'secondary', size: 'sm' }), {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  textDecoration: 'none',
  fontFamily: DESIGN_TOKENS.type.family,
});

export default function SectionOwnershipPanel({ sectionId }: { sectionId: ProductSectionId }) {
  const section = getProductSection(sectionId);
  const boundary = getProductSectionBoundary(sectionId);

  if (!boundary) return null;

  return (
    <section
      style={mergeStyles(panelStyle({ muted: true, padding: DESIGN_TOKENS.space[5] }), {
        marginBottom: DESIGN_TOKENS.space[3],
        display: 'grid',
        gap: DESIGN_TOKENS.space[4],
      })}
    >
      <div style={{ display: 'grid', gap: DESIGN_TOKENS.space[1] }}>
        <div style={eyebrowStyle()}>Canonical Ownership</div>
        <div style={sectionTitleStyle()}>{section.label} owns {section.summary.toLowerCase()}</div>
        <div style={bodyTextStyle()}>
          Use this surface for first-class actions inside the section boundary, not for adjacent ownership domains.
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gap: DESIGN_TOKENS.space[4],
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
        }}
      >
        <BoundaryColumn title="Belongs here" items={boundary.owns} />
        <BoundaryColumn title="First-class actions" items={boundary.firstClass} />
        <BoundaryColumn title="Not owned here" items={boundary.notHere} />
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: DESIGN_TOKENS.space[2] }}>
        {boundary.relatedLinks.map((link) => (
          <Link key={link.href} href={link.href} style={linkStyle} title={link.reason}>
            {link.label}
          </Link>
        ))}
      </div>
    </section>
  );
}

function BoundaryColumn({ title, items }: { title: string; items: string[] }) {
  return (
    <div style={{ display: 'grid', gap: DESIGN_TOKENS.space[2] }}>
      <div
        style={{
          color: DESIGN_TOKENS.color.textPrimary,
          fontSize: DESIGN_TOKENS.type.size.label,
          fontWeight: DESIGN_TOKENS.type.weight.semibold,
          lineHeight: DESIGN_TOKENS.type.lineHeight.normal,
        }}
      >
        {title}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: DESIGN_TOKENS.space[2] }}>
        {items.map((item) => (
          <Badge key={item} variant="secondary">
            {item}
          </Badge>
        ))}
      </div>
    </div>
  );
}
