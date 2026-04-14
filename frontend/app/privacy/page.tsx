export default function PrivacyPage() {
  return (
    <main className="app-static-page">
      <div className="app-static-page__content">
        <header className="app-static-page__header">
          <p className="app-static-page__kicker">Privacy Policy</p>
          <h1 className="app-static-page__title">External channel privacy for Empyralist deployed agents</h1>
          <p className="app-static-page__body">
            When you message an Empyralist deployed agent on Telegram or another supported channel, the platform stores the conversation event stream needed to answer you, preserve configured memory, and operate the service safely.
          </p>
        </header>

        <section className="app-static-page__section">
          <h2 className="app-static-page__section-title">What we store</h2>
          <p className="app-static-page__body">
            We may store your channel user identifier, conversation messages, generated replies, memory summaries, and operational events such as approvals, tool calls, and quota events for the deployed agent you contacted.
          </p>
        </section>

        <section className="app-static-page__section">
          <h2 className="app-static-page__section-title">Why we store it</h2>
          <p className="app-static-page__body">
            This data is used to deliver the conversation, enforce usage and safety controls, support configured memory, and let the deployed-agent owner review customer interactions and resolve issues.
          </p>
        </section>

        <section className="app-static-page__section">
          <h2 className="app-static-page__section-title">Deletion requests</h2>
          <p className="app-static-page__body">
            You can request deletion of your saved conversation data directly from the channel by sending <strong>/delete</strong> to the deployed agent. The request is logged and can be fulfilled by the deployed-agent owner for that scoped user and deployment.
          </p>
        </section>

        <section className="app-static-page__section">
          <h2 className="app-static-page__section-title">Scope</h2>
          <p className="app-static-page__body">
            Deletion actions are scoped to the deployed agent and the external channel user that requested them. They do not erase unrelated workspace data.
          </p>
        </section>
      </div>
    </main>
  );
}
