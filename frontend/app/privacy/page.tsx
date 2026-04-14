export default function PrivacyPage() {
  return (
    <main
      style={{
        minHeight: '100vh',
        background: 'var(--app-bg-canvas, #06070a)',
        color: 'var(--app-text-primary, #f5f7fb)',
        padding: '4rem 1.5rem',
      }}
    >
      <div
        style={{
          width: 'min(46rem, 100%)',
          margin: '0 auto',
          display: 'grid',
          gap: '1.5rem',
        }}
      >
        <header style={{ display: 'grid', gap: '0.65rem' }}>
          <p style={{ margin: 0, color: 'var(--app-text-tertiary, #98a1b3)', fontSize: '0.8rem', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            Privacy Policy
          </p>
          <h1 style={{ margin: 0, fontSize: 'clamp(2rem, 4vw, 3rem)', lineHeight: 1.05 }}>
            External channel privacy for Empyralist deployed agents
          </h1>
          <p style={{ margin: 0, color: 'var(--app-text-secondary, #c9d0de)', lineHeight: 1.7 }}>
            When you message an Empyralist deployed agent on Telegram or another supported channel, the platform stores the conversation event stream needed to answer you, preserve configured memory, and operate the service safely.
          </p>
        </header>

        <section style={{ display: 'grid', gap: '0.6rem' }}>
          <h2 style={{ margin: 0, fontSize: '1.05rem' }}>What we store</h2>
          <p style={{ margin: 0, color: 'var(--app-text-secondary, #c9d0de)', lineHeight: 1.7 }}>
            We may store your channel user identifier, conversation messages, generated replies, memory summaries, and operational events such as approvals, tool calls, and quota events for the deployed agent you contacted.
          </p>
        </section>

        <section style={{ display: 'grid', gap: '0.6rem' }}>
          <h2 style={{ margin: 0, fontSize: '1.05rem' }}>Why we store it</h2>
          <p style={{ margin: 0, color: 'var(--app-text-secondary, #c9d0de)', lineHeight: 1.7 }}>
            This data is used to deliver the conversation, enforce usage and safety controls, support configured memory, and let the deployed-agent owner review customer interactions and resolve issues.
          </p>
        </section>

        <section style={{ display: 'grid', gap: '0.6rem' }}>
          <h2 style={{ margin: 0, fontSize: '1.05rem' }}>Deletion requests</h2>
          <p style={{ margin: 0, color: 'var(--app-text-secondary, #c9d0de)', lineHeight: 1.7 }}>
            You can request deletion of your saved conversation data directly from the channel by sending <strong>/delete</strong> to the deployed agent. The request is logged and can be fulfilled by the deployed-agent owner for that scoped user and deployment.
          </p>
        </section>

        <section style={{ display: 'grid', gap: '0.6rem' }}>
          <h2 style={{ margin: 0, fontSize: '1.05rem' }}>Scope</h2>
          <p style={{ margin: 0, color: 'var(--app-text-secondary, #c9d0de)', lineHeight: 1.7 }}>
            Deletion actions are scoped to the deployed agent and the external channel user that requested them. They do not erase unrelated workspace data.
          </p>
        </section>
      </div>
    </main>
  );
}
