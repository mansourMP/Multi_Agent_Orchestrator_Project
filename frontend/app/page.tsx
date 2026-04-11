export default function HomePage() {
  return (
    <main
      style={{
        padding: '3rem',
        display: 'grid',
        gap: '0.75rem',
      }}
    >
      <h1 style={{ margin: 0, fontSize: '1.5rem' }}>Empyralis Frontend V2</h1>
      <p style={{ margin: 0, maxWidth: '48rem', lineHeight: 1.6 }}>
        Phase FE-1 is active. The account shell and workspace membership model now own the only
        global frontend state. Visual shell rebuild and workspace boundary remounts land next.
      </p>
    </main>
  );
}
