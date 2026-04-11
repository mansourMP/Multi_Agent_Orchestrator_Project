import 'server-only';

export function controlPlaneBaseUrl(): string {
  const rawValue =
    process.env.EMPYRALIS_API_URL
    ?? process.env.NEXT_PUBLIC_API_URL
    ?? process.env.NEXT_PUBLIC_ORION_API_URL
    ?? process.env.EMPYRALIS_PUBLIC_URL
    ?? 'http://127.0.0.1:8000';

  return rawValue.replace(/\/+$/, '');
}
