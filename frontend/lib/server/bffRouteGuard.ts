import type { NextRequest } from 'next/server';

type BffGuardOptions = {
  methods: string[];
  requireLoopbackHost?: boolean;
};

function jsonError(detail: string, status: number, extra?: Record<string, unknown>) {
  return Response.json({ detail, ...(extra || {}) }, { status });
}

function normalizedAllowedOrigins(request: NextRequest): Set<string> {
  const raw = process.env.CONTROL_PLANE_ORIGINS || process.env.FRONTEND_ORIGINS || '';
  const allowed = new Set(
    String(raw)
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
  );
  allowed.add(request.nextUrl.origin);
  return allowed;
}

function originFromRequest(request: NextRequest): string | null {
  const originHeader = String(request.headers.get('origin') || '').trim();
  if (originHeader) {
    try {
      return new URL(originHeader).origin;
    } catch {
      return null;
    }
  }

  const refererHeader = String(request.headers.get('referer') || '').trim();
  if (!refererHeader) return null;
  try {
    return new URL(refererHeader).origin;
  } catch {
    return null;
  }
}

function isLoopbackHost(hostname: string): boolean {
  const normalized = String(hostname || '').trim().toLowerCase();
  return normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '::1';
}

export function enforceBffRouteGuard(request: NextRequest, options: BffGuardOptions): Response | null {
  const method = request.method.toUpperCase();
  const allowedMethods = new Set(options.methods.map((item) => item.toUpperCase()));
  if (!allowedMethods.has(method)) {
    return jsonError('Method not allowed.', 405);
  }

  if (options.requireLoopbackHost && !isLoopbackHost(request.nextUrl.hostname)) {
    return jsonError('This route is only available on the local control plane host.', 403);
  }

  const requestOrigin = originFromRequest(request);
  if (!requestOrigin) {
    return jsonError('Missing control-plane origin.', 403);
  }

  const allowedOrigins = normalizedAllowedOrigins(request);
  if (!allowedOrigins.has(requestOrigin)) {
    return jsonError('Origin is not allowed.', 403, {
      origin: requestOrigin,
      allowed_origins: Array.from(allowedOrigins),
    });
  }

  const secFetchSite = String(request.headers.get('sec-fetch-site') || '').trim().toLowerCase();
  if (secFetchSite && !['same-origin', 'same-site', 'none'].includes(secFetchSite)) {
    return jsonError('Request site context is not allowed.', 403, { sec_fetch_site: secFetchSite });
  }

  return null;
}

export function sanitizeArtifactsWorkspaceQuery(request: NextRequest): string {
  const allowedKeys = new Set(['workspace_id', 'history_limit', 'limit']);
  const next = new URLSearchParams();

  for (const [key, value] of request.nextUrl.searchParams.entries()) {
    if (!allowedKeys.has(key)) continue;
    const normalized = String(value || '').trim();
    if (!normalized) continue;
    if (key === 'workspace_id') {
      next.set(key, normalized);
      continue;
    }
    const numeric = Number(normalized);
    if (!Number.isFinite(numeric)) continue;
    const bounded = Math.max(1, Math.min(Math.trunc(numeric), key === 'limit' ? 200 : 500));
    next.set(key, String(bounded));
  }

  return next.toString();
}
