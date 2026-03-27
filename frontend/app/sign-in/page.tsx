import BrowserSignInPage from '@/components/orion/auth/BrowserSignInPage';
import { sanitizeReturnTo } from '@/lib/server/controlPlaneSession';

export const dynamic = 'force-dynamic';

type SignInPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const params = await searchParams;
  const returnToValue = Array.isArray(params.returnTo) ? params.returnTo[0] : params.returnTo;
  const errorValue = Array.isArray(params.error) ? params.error[0] : params.error;

  return (
    <BrowserSignInPage
      returnTo={sanitizeReturnTo(String(returnToValue || '/'))}
      errorCode={String(errorValue || '')}
    />
  );
}
