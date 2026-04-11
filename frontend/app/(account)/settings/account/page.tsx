export default function AccountSettingsPage() {
  return (
    <main
      style={{
        minHeight: '100vh',
        padding: '3rem',
        display: 'grid',
        gap: '0.75rem',
      }}
    >
      <h1 style={{ margin: 0, fontSize: '1.5rem' }}>Account Settings</h1>
      <p style={{ margin: 0, maxWidth: '48rem', lineHeight: 1.6 }}>
        This route remains outside the workspace boundary because it is account-global.
      </p>
    </main>
  );
}
