'use client';

import React from 'react';
import { UI, type OutcomeContract as OutcomeContractType } from '../../app/page.catalog';
import { BRAND } from '@/lib/brand';

interface OutcomeContractProps {
  selectedContract: OutcomeContractType;
  isTablet: boolean;
}

export const OutcomeContract: React.FC<OutcomeContractProps> = ({ selectedContract, isTablet }) => {
  return (
    <div style={{ display: 'grid', gap: 10, borderTop: `1px dashed ${UI.borderSoft}`, paddingTop: 12 }}>
      <div className="orion-home-panel-title" style={{ fontSize: 14, color: UI.textSoft }}>Outcome contract</div>
      <div style={{ display: 'grid', gap: 8, gridTemplateColumns: isTablet ? '1fr' : '1fr 1fr 1fr' }}>
        <div style={{ borderRadius: 10, border: `1px solid ${UI.borderSoft}`, background: UI.shell, padding: 10 }}>
          <div style={{ fontSize: 10, color: UI.textMuted, marginBottom: 6, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Inputs</div>
          <div style={{ display: 'grid', gap: 5 }}>
            {selectedContract.inputs.map((item) => (
              <div key={item} style={{ fontSize: 11, color: UI.textSoft }}>• {item}</div>
            ))}
          </div>
        </div>
        <div style={{ borderRadius: 10, border: `1px solid ${UI.borderSoft}`, background: UI.shell, padding: 10 }}>
          <div style={{ fontSize: 10, color: UI.textMuted, marginBottom: 6, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{`Actions ${BRAND.assistant} Will Take`}</div>
          <div style={{ display: 'grid', gap: 5 }}>
            {selectedContract.actions.map((item) => (
              <div key={item} style={{ fontSize: 11, color: UI.textSoft }}>• {item}</div>
            ))}
          </div>
        </div>
        <div style={{ borderRadius: 10, border: `1px solid ${UI.borderSoft}`, background: UI.shell, padding: 10 }}>
          <div style={{ fontSize: 10, color: UI.textMuted, marginBottom: 6, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Success Criteria</div>
          <div style={{ display: 'grid', gap: 5 }}>
            {selectedContract.success.map((item) => (
              <div key={item} style={{ fontSize: 11, color: UI.textSoft }}>• {item}</div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
