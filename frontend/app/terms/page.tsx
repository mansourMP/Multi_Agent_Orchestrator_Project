export default function TermsPage() {
  return (
    <main className="app-static-page">
      <div className="app-static-page__content">
        <header className="app-static-page__header">
          <p className="app-static-page__kicker">Terms of Service</p>
          <h1 className="app-static-page__title">Empyralis service terms</h1>
          <p className="app-static-page__body">
            Empyralis provides workspace software for AI-assisted chat, connected applications, deployed agents, and governed computer access. By using Empyralis, you are responsible for the workspaces, agents, channels, credentials, and data you connect to the service.
          </p>
        </header>

        <section className="app-static-page__section">
          <h2 className="app-static-page__section-title">Acceptable use</h2>
          <p className="app-static-page__body">
            You may not use Empyralis to violate laws, abuse third-party services, bypass access controls, send deceptive messages, or operate agents in a way that harms other users, platforms, or systems.
          </p>
        </section>

        <section className="app-static-page__section">
          <h2 className="app-static-page__section-title">Connected accounts and computers</h2>
          <p className="app-static-page__body">
            You control which accounts, channels, tools, and computers are connected. You are responsible for reviewing approvals, permissions, agent behavior, and any actions performed through connected services or Agent Computer.
          </p>
        </section>

        <section className="app-static-page__section">
          <h2 className="app-static-page__section-title">Service changes</h2>
          <p className="app-static-page__body">
            Empyralis may change, limit, suspend, or discontinue features when needed for security, reliability, compliance, abuse prevention, or product development.
          </p>
        </section>

        <section className="app-static-page__section">
          <h2 className="app-static-page__section-title">Contact</h2>
          <p className="app-static-page__body">
            Questions about these terms can be sent to the support contact listed on the Empyralis OAuth consent screen.
          </p>
        </section>
      </div>
    </main>
  );
}
