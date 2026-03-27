import Link from 'next/link';
import { CheckCircle2 } from 'lucide-react';
import { sanitizeReturnTo } from '@/lib/server/controlPlaneSession';

export const dynamic = 'force-dynamic';

type SignInCompletePageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function SignInCompletePage({ searchParams }: SignInCompletePageProps) {
  const params = await searchParams;
  const returnToValue = Array.isArray(params.returnTo) ? params.returnTo[0] : params.returnTo;
  const returnTo = sanitizeReturnTo(String(returnToValue || '/'));

  return (
    <div className="orion-auth-page">
      <div className="orion-auth-card">
        <div className="orion-auth-card__eyebrow">
          <CheckCircle2 size={14} />
          Sign-in complete
        </div>
        <h1 className="orion-auth-card__title">You can return to Empyralis</h1>
        <p className="orion-auth-card__copy">
          Your browser sign-in finished successfully. The desktop app can finish the session from here.
        </p>
        <div className="orion-auth-note">
          Return to the desktop app. If it does not update automatically, reopen the app or press sign in again once.
        </div>
        <div className="orion-auth-card__footer">
          <Link href={returnTo} className="btn-ghost orion-auth-back">
            Stay in browser
          </Link>
        </div>
      </div>
    </div>
  );
}
