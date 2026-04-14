import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="app-page-message">
      <div className="app-page-message__content">
        <h1 className="app-page-message__title">This route is not available</h1>
        <p className="app-page-message__body">
          Use the public preview to inspect the refactored workstation UI without logging in, or return to the authenticated login flow.
        </p>
        <div className="app-inline-actions">
          <Link href="/preview" className="app-link-button app-link-button--primary">
            Open public preview
          </Link>
          <Link href="/login" className="app-link-button">
            Open login
          </Link>
        </div>
      </div>
    </main>
  );
}
