export default function DeviceSettingsPage() {
  return (
    <main
      style={{
        minHeight: '100vh',
        padding: '3rem',
        display: 'grid',
        gap: '0.75rem',
      }}
    >
      <h1 style={{ margin: 0, fontSize: '1.5rem' }}>Device Sessions</h1>
      <p style={{ margin: 0, maxWidth: '48rem', lineHeight: 1.6 }}>
        This route remains account-global and will not mount workspace-scoped feature state.
      </p>
    </main>
  );
}
