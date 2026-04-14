import 'server-only';

type ControlPlaneEnv = Partial<Record<
  'EMPYRALIS_API_URL' | 'ORION_API_URL' | 'NEXT_PUBLIC_ORION_API_URL' | 'NEXT_PUBLIC_API_URL',
  string | undefined
>>;

export function resolveControlPlaneBaseUrl(
  env: ControlPlaneEnv = process.env as ControlPlaneEnv,
): string {
  const rawValue =
    env.EMPYRALIS_API_URL
    ?? env.ORION_API_URL
    ?? env.NEXT_PUBLIC_ORION_API_URL
    ?? env.NEXT_PUBLIC_API_URL
    ?? (process.env.NODE_ENV === 'production' ? undefined : 'http://127.0.0.1:8001');

  if (!rawValue || !rawValue.trim()) {
    throw new Error(
      'Control-plane base URL is not configured. Set EMPYRALIS_API_URL or ORION_API_URL.',
    );
  }

  return rawValue.replace(/\/+$/, '');
}

export function controlPlaneBaseUrl(): string {
  return resolveControlPlaneBaseUrl(process.env as ControlPlaneEnv);
}
