import Link from 'next/link';
import { CheckCircle2 } from 'lucide-react';
import DesktopSignInComplete from '@/components/orion/auth/DesktopSignInComplete';
import { sanitizeReturnTo } from '@/lib/server/controlPlaneSession';

export const dynamic = 'force-dynamic';

type SignInCompletePageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function SignInCompletePage({ searchParams }: SignInCompletePageProps) {
  const params = await searchParams;
  const returnToValue = Array.isArray(params.returnTo) ? params.returnTo[0] : params.returnTo;
  const modeValue = Array.isArray(params.mode) ? params.mode[0] : params.mode;
  const returnTo = sanitizeReturnTo(String(returnToValue || '/'));
  const desktopMode = String(modeValue || '').trim() === 'desktop';

  return (
    <div className="orion-auth-page">
      <DesktopSignInComplete enabled={desktopMode} />
      <div className="orion-auth-card">
        <div className="orion-auth-card__eyebrow">
          <CheckCircle2 size={14} />
          Sign-in complete
        </div>
        <h1 className="orion-auth-card__title">You can return to Empyralis</h1>
        <p className="orion-auth-card__copy">
          {desktopMode
            ? 'Your browser sign-in finished successfully. Empyralis is returning to the app now.'
            : 'Your browser sign-in finished successfully. The desktop app can finish the session from here.'}
        </p>
        <div className="orion-auth-note">
          {desktopMode
            ? 'This window should close automatically. If the app does not update, switch back once and try again.'
            : 'Return to the desktop app. If it does not update automatically, reopen the app or press sign in again once. If chat still says setup is incomplete, connect an AI provider next.'}
        </div>
        <div className="orion-auth-card__footer">
          <Link href={`/connect-ai?returnTo=${encodeURIComponent(returnTo)}`} className="btn-primary orion-auth-back">
            Connect AI account
          </Link>
          <Link href={returnTo} className="btn-ghost orion-auth-back">
            Stay in browser
          </Link>
        </div>
      </div>
    </div>
  );
}
