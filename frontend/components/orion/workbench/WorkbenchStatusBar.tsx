'use client';

import { UI } from '@/app/page.catalog';

type WorkbenchStatusBarProps = {
  runtimeOk: boolean;
  workerOnline: number;
  workerPending: number;
  pendingApprovals: number;
};

export function WorkbenchStatusBar({
  runtimeOk,
  workerOnline,
  workerPending,
  pendingApprovals,
}: WorkbenchStatusBarProps) {
  return (
    <div
      style={{
        marginTop: 10,
        borderTop: `1px solid ${UI.borderSoft}`,
        padding: '8px 0 0',
        display: 'flex',
        gap: 12,
        flexWrap: 'wrap',
        fontSize: 11,
      }}
    >
      <span style={{ color: runtimeOk ? UI.success : UI.error, fontWeight: 700 }}>
        runtime {runtimeOk ? 'up' : 'down'}
      </span>
      <span style={{ color: UI.textMuted }}>workers {workerOnline}</span>
      <span style={{ color: UI.textMuted }}>queue {workerPending}</span>
      <span style={{ color: pendingApprovals > 0 ? UI.warning : UI.textMuted }}>
        approvals {pendingApprovals}
      </span>
    </div>
  );
}
