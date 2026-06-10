export default function PrivacyPage() {
  return (
    <main className="app-static-page">
      <div className="app-static-page__content">
        <header className="app-static-page__header">
          <p className="app-static-page__kicker">Privacy Policy</p>
          <h1 className="app-static-page__title">Empyralis privacy policy</h1>
          <p className="app-static-page__body">
            Empyralis provides workspace software for AI-assisted chat, connected applications, deployed agents, and governed computer access. This policy explains the information we process to operate the service.
          </p>
        </header>

        <section className="app-static-page__section">
          <h2 className="app-static-page__section-title">What we store</h2>
          <p className="app-static-page__body">
            We may store account identifiers, workspace settings, chat messages, uploaded files, generated replies, memory summaries, connected app metadata, channel user identifiers, and operational events such as approvals, tool calls, quota events, runtime status, and audit records.
          </p>
        </section>

        <section className="app-static-page__section">
          <h2 className="app-static-page__section-title">Google and connected app data</h2>
          <p className="app-static-page__body">
            If you connect a Google account or another third-party service, Empyralis uses the authorized data only to provide the features you request, such as sign-in, account linking, retrieval, drafting, scheduling, or agent actions you approve. Empyralis does not sell Google user data or use it for advertising.
          </p>
        </section>

        <section className="app-static-page__section">
          <h2 className="app-static-page__section-title">OAuth tokens and credentials</h2>
          <p className="app-static-page__body">
            Access tokens, refresh tokens, API keys, and other credentials are used to maintain the connections you configure. They are stored separately from normal workspace content where supported and are used only for the connected service actions you initiate or authorize.
          </p>
        </section>

        <section className="app-static-page__section">
          <h2 className="app-static-page__section-title">Why we store it</h2>
          <p className="app-static-page__body">
            This data is used to deliver the service, authenticate users, operate connected agents, enforce usage and safety controls, support configured memory, provide transparency and audit logs, troubleshoot issues, and protect the platform from abuse.
          </p>
        </section>

        <section className="app-static-page__section">
          <h2 className="app-static-page__section-title">Deletion requests</h2>
          <p className="app-static-page__body">
            You can request deletion of saved conversation data from a supported external channel by sending <strong>/delete</strong> to the deployed agent. You can also disconnect connected accounts inside Empyralis where connection controls are available.
          </p>
        </section>

        <section className="app-static-page__section">
          <h2 className="app-static-page__section-title">Retention and scope</h2>
          <p className="app-static-page__body">
            Deletion actions are scoped to the relevant user, workspace, deployed agent, external channel user, or connected account. Some operational records may be retained when needed for security, compliance, abuse prevention, billing, or audit integrity.
          </p>
        </section>
      </div>
    </main>
  );
}
