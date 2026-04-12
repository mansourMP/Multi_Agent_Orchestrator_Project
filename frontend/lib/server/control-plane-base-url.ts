import 'server-only';

export function resolveControlPlaneBaseUrl(
  env: Partial<Record<
    'EMPYRALIS_API_URL' | 'NEXT_PUBLIC_ORION_API_URL' | 'NEXT_PUBLIC_API_URL' | 'EMPYRALIS_PUBLIC_URL',
    string | undefined
  >> = process.env,
): string {
  const rawValue =
    env.EMPYRALIS_API_URL
    ?? env.NEXT_PUBLIC_ORION_API_URL
    ?? env.NEXT_PUBLIC_API_URL
    ?? env.EMPYRALIS_PUBLIC_URL
    ?? 'http://127.0.0.1:8000';

  return rawValue.replace(/\/+$/, '');
}

export function controlPlaneBaseUrl(): string {
  return resolveControlPlaneBaseUrl(process.env);
}
