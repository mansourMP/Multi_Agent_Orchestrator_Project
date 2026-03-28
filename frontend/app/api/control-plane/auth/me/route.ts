import { NextRequest } from 'next/server';
import { getAdminBrowserIdentity } from '@/lib/server/controlPlaneSession';

export async function GET(request: NextRequest) {
  const identity = await getAdminBrowserIdentity(request);
  return Response.json(
    {
      user: identity
        ? {
            id: identity.sub,
            email: identity.email,
          }
        : null,
    },
    {
      status: 200,
      headers: {
        'Cache-Control': 'no-store',
      },
    },
  );
}
