const DEFAULT_CONTROL_PLANE_BACKEND_ORIGIN = 'http://localhost:4000';
const DEFAULT_RUNTIME_AUTH_ORIGIN = 'http://127.0.0.1:8001';
const CONTROL_PLANE_AUTH_PROVIDERS = new Set(['google', 'apple']);

function trimTrailingSlash(value) {
  return String(value || '').replace(/\/+$/, '');
}

function normalizeControlPlaneBackendUrl(raw) {
  const fallback = `${DEFAULT_CONTROL_PLANE_BACKEND_ORIGIN}/api/v1`;
  const candidate = String(raw || '').trim();
  if (!candidate) return fallback;

  try {
    const parsed = new URL(candidate);
    const pathname = trimTrailingSlash(parsed.pathname || '');
    if (!pathname || pathname === '/') {
      parsed.pathname = '/api/v1';
    } else if (!pathname.startsWith('/api/')) {
      parsed.pathname = '/api/v1';
    } else {
      parsed.pathname = pathname;
    }
    parsed.search = '';
    parsed.hash = '';
    return trimTrailingSlash(parsed.toString());
  } catch {
    return fallback;
  }
}

function normalizeOriginUrl(raw, fallback = DEFAULT_RUNTIME_AUTH_ORIGIN) {
  const candidate = String(raw || '').trim();
  const value = candidate || fallback;
  try {
    const parsed = new URL(value);
    parsed.pathname = '';
    parsed.search = '';
    parsed.hash = '';
    return trimTrailingSlash(parsed.toString());
  } catch {
    return trimTrailingSlash(fallback);
  }
}

function normalizedLoopbackOrigin(raw) {
  const candidate = String(raw || '').trim();
  if (!candidate) return '';
  try {
    const parsed = new URL(candidate);
    return `${parsed.protocol}//${parsed.hostname}:${parsed.port || (parsed.protocol === 'https:' ? '443' : '80')}`;
  } catch {
    return '';
  }
}

function runtimeLikeCandidate(candidate, env) {
  const normalizedOrigin = normalizedLoopbackOrigin(candidate);
  if (!normalizedOrigin) return false;
  if (normalizedOrigin.endsWith(':8001')) return true;

  const runtimeOrigins = [
    env?.ORION_API_URL,
    env?.NEXT_PUBLIC_ORION_API_URL,
  ]
    .map((value) => normalizedLoopbackOrigin(value))
    .filter(Boolean);
  return runtimeOrigins.includes(normalizedOrigin);
}

export function resolveControlPlaneBackendUrl(env = process.env) {
  const explicit = String(env?.ORION_CONTROL_PLANE_BACKEND_URL || '').trim();
  if (explicit) {
    return normalizeControlPlaneBackendUrl(explicit);
  }

  const nextPublicApi = String(env?.NEXT_PUBLIC_API_URL || '').trim();
  if (nextPublicApi && !runtimeLikeCandidate(nextPublicApi, env)) {
    return normalizeControlPlaneBackendUrl(nextPublicApi);
  }

  const backendOrigin = String(env?.BACKEND_PUBLIC_ORIGIN || env?.BACKEND_PUBLIC_HOST || '').trim();
  if (backendOrigin) {
    return normalizeControlPlaneBackendUrl(backendOrigin);
  }

  return normalizeControlPlaneBackendUrl('');
}

function resolveControlPlaneAuthService(env = process.env) {
  const explicit = String(env?.ORION_CONTROL_PLANE_BACKEND_URL || '').trim();
  if (explicit) {
    return { kind: 'backend', baseUrl: normalizeControlPlaneBackendUrl(explicit) };
  }

  const nextPublicApi = String(env?.NEXT_PUBLIC_API_URL || '').trim();
  if (nextPublicApi && !runtimeLikeCandidate(nextPublicApi, env)) {
    return { kind: 'backend', baseUrl: normalizeControlPlaneBackendUrl(nextPublicApi) };
  }

  const backendOrigin = String(env?.BACKEND_PUBLIC_ORIGIN || env?.BACKEND_PUBLIC_HOST || '').trim();
  if (backendOrigin) {
    return { kind: 'backend', baseUrl: normalizeControlPlaneBackendUrl(backendOrigin) };
  }

  const runtimeOrigin = [
    env?.ORION_API_URL,
    env?.NEXT_PUBLIC_ORION_API_URL,
    env?.NEXT_PUBLIC_API_URL,
  ].find((value) => String(value || '').trim());

  return {
    kind: 'runtime',
    baseUrl: normalizeOriginUrl(runtimeOrigin, DEFAULT_RUNTIME_AUTH_ORIGIN),
  };
}

export function resolveControlPlaneAuthServiceKind(env = process.env) {
  return resolveControlPlaneAuthService(env).kind;
}

export function resolveControlPlaneAuthServiceUrl(env = process.env) {
  return resolveControlPlaneAuthService(env).baseUrl;
}

export function resolveControlPlaneAuthUrl(path, env = process.env) {
  const config = resolveControlPlaneAuthService(env);
  const normalizedPath = String(path || '').trim().replace(/^\/+/, '');
  const mappedPath = config.kind === 'runtime' && normalizedPath === 'signup'
    ? 'register'
    : normalizedPath;
  return `${config.baseUrl}/auth/${mappedPath}`;
}

export function resolveControlPlaneAuthStartUrl(provider, env = process.env) {
  const normalizedProvider = String(provider || '').trim().toLowerCase();
  if (!CONTROL_PLANE_AUTH_PROVIDERS.has(normalizedProvider)) {
    throw new Error(`Unsupported auth provider: ${normalizedProvider || 'unknown'}`);
  }
  return `${resolveControlPlaneBackendUrl(env)}/auth/${normalizedProvider}`;
}

export function buildBrowserVisibleControlPlaneAuthStartPath(provider, returnTo, desktopMode = false) {
  const normalizedProvider = String(provider || '').trim().toLowerCase();
  if (!CONTROL_PLANE_AUTH_PROVIDERS.has(normalizedProvider)) {
    throw new Error(`Unsupported auth provider: ${normalizedProvider || 'unknown'}`);
  }
  const params = new URLSearchParams();
  params.set('returnTo', String(returnTo || '/').trim() || '/');
  if (desktopMode) {
    params.set('desktop', '1');
  }
  return `/api/control-plane/auth/${normalizedProvider}/start?${params.toString()}`;
}

export function buildDesktopSignInCompletionPath(returnTo) {
  const params = new URLSearchParams();
  params.set('mode', 'desktop');
  params.set('returnTo', String(returnTo || '/').trim() || '/');
  return `/sign-in/complete?${params.toString()}`;
}

export function buildSignInErrorPath(errorCode, returnTo) {
  const params = new URLSearchParams();
  params.set('error', String(errorCode || 'oauth_exchange_failed').trim() || 'oauth_exchange_failed');
  if (String(returnTo || '').trim()) {
    params.set('returnTo', String(returnTo).trim());
  }
  return `/sign-in?${params.toString()}`;
}
