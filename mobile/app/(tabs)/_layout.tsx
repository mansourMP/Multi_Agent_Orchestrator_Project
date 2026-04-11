import { buildMobileWorkspaceShellModel } from '../../src/lib/mobile-workspace-surfaces.js';
import { createInitialAccountShellState } from '../../src/lib/shell/account-shell-store.js';
import { createMemoryKeyValueStorage } from '../../src/lib/storage/memory-key-value-storage.js';

export default function TabsLayout() {
  const shell = buildMobileWorkspaceShellModel({
    accountState: createInitialAccountShellState(),
    foundation: null,
    storage: createMemoryKeyValueStorage(),
    fetchImpl: async () => {
      throw new Error('Mobile workspace shell is mounted before a workspace foundation is available.');
    },
  });

  return (
    <main
      data-mobile-shell="mounted"
      style={{
        minHeight: '100vh',
        padding: '1.5rem',
        display: 'grid',
        gap: '0.9rem',
        fontFamily: 'ui-sans-serif, system-ui, sans-serif',
      }}
    >
      <header style={{ display: 'grid', gap: '0.35rem' }}>
        <strong>Empyralis Mobile Shell</strong>
        <span style={{ color: '#475569' }}>
          Workspace surfaces are mounted through the shared mobile surface model and wait for an authenticated workspace foundation.
        </span>
      </header>
      <ul style={{ margin: 0, paddingLeft: '1.25rem', display: 'grid', gap: '0.3rem' }}>
        {shell.tabs.map((tab) => (
          <li key={tab.id}>
            {tab.label} · {tab.mounted ? 'mounted' : 'waiting for workspace'}
          </li>
        ))}
      </ul>
    </main>
  );
}
