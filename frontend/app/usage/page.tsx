export default function UsagePage() {
  return (
    <div className="orion-page-shell orion-animate-in">
      <section className="orion-panel">
        <div className="orion-panel-header">
          <div>
            <div className="orion-panel-title">Usage</div>
            <div className="orion-panel-copy">Track spend, requests, and execution efficiency.</div>
          </div>
        </div>
        <div className="orion-empty" style={{ minHeight: 280 }}>
          <div className="orion-empty-title">Usage coming soon</div>
          <div className="orion-empty-copy">This area will show platform usage, model consumption, and operating limits.</div>
        </div>
      </section>
    </div>
  );
}
