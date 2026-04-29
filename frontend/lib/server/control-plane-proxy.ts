import 'server-only';

import { NextRequest, NextResponse } from 'next/server';

import {
  AUTH_ACCESS_COOKIE_NAME,
  AUTH_CSRF_COOKIE_NAME,
  AUTH_CSRF_HEADER_NAME,
  AUTH_REFRESH_COOKIE_NAME,
  browserCsrfProtectedMethod,
} from '@/lib/auth/csrf';
import { controlPlaneBaseUrl } from '@/lib/server/control-plane-base-url';

type ForwardControlPlaneRequestInit = RequestInit & {
  timeoutMs?: number;
};

const HOP_BY_HOP_REQUEST_HEADERS = new Set([
  'connection',
  'content-length',
  'host',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);

const HOP_BY_HOP_RESPONSE_HEADERS = new Set([
  'connection',
  'content-length',
  'content-encoding',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);

function hasBrowserSessionCookie(request: NextRequest): boolean {
  return Boolean(
    request.cookies.get(AUTH_ACCESS_COOKIE_NAME)
    || request.cookies.get(AUTH_REFRESH_COOKIE_NAME)
    || request.cookies.get(AUTH_CSRF_COOKIE_NAME),
  );
}

function validateBrowserCsrf(request: NextRequest): NextResponse | null {
  if (!browserCsrfProtectedMethod(request.method)) {
    return null;
  }
  if (!hasBrowserSessionCookie(request)) {
    return null;
  }
  const csrfCookie = request.cookies.get(AUTH_CSRF_COOKIE_NAME)?.value?.trim() || '';
  const csrfHeader = request.headers.get(AUTH_CSRF_HEADER_NAME)?.trim() || '';
  if (!csrfCookie || !csrfHeader || csrfCookie !== csrfHeader) {
    return new NextResponse(JSON.stringify({ detail: 'CSRF validation failed.' }), {
      status: 403,
      headers: { 'content-type': 'application/json' },
    });
  }
  return null;
}

function copyForwardableRequestHeaders(
  request: NextRequest,
  targetHeaders: Headers,
  initHeaders?: HeadersInit,
): void {
  for (const [name, value] of request.headers.entries()) {
    const normalizedName = name.toLowerCase();
    if (HOP_BY_HOP_REQUEST_HEADERS.has(normalizedName)) {
      continue;
    }
    targetHeaders.set(name, value);
  }

  if (!targetHeaders.has('x-forwarded-host')) {
    const host = request.headers.get('host');
    if (host) {
      targetHeaders.set('x-forwarded-host', host);
    }
  }
  if (!targetHeaders.has('x-forwarded-proto')) {
    targetHeaders.set('x-forwarded-proto', request.nextUrl.protocol.replace(':', '') || 'http');
  }

  if (!initHeaders) {
    return;
  }

  const overrideHeaders = new Headers(initHeaders);
  for (const [name, value] of overrideHeaders.entries()) {
    targetHeaders.set(name, value);
  }
}

function copyForwardableResponseHeaders(response: Response): Headers {
  const headers = new Headers();
  for (const [name, value] of response.headers.entries()) {
    const normalizedName = name.toLowerCase();
    if (HOP_BY_HOP_RESPONSE_HEADERS.has(normalizedName) || normalizedName === 'set-cookie') {
      continue;
    }
    headers.append(name, value);
  }

  const responseHeaders = response.headers as Headers & {
    getSetCookie?: () => string[];
  };
  const setCookieValues =
    typeof responseHeaders.getSetCookie === 'function'
      ? responseHeaders.getSetCookie()
      : [];
  if (setCookieValues.length > 0) {
    for (const cookie of setCookieValues) {
      headers.append('set-cookie', cookie);
    }
  } else {
    const setCookieHeader = response.headers.get('set-cookie');
    if (setCookieHeader) {
      headers.append('set-cookie', setCookieHeader);
    }
  }

  return headers;
}

export async function forwardControlPlaneRequest(
  request: NextRequest,
  upstreamPath: string,
  init: ForwardControlPlaneRequestInit = {},
): Promise<NextResponse> {
  const csrfFailure = validateBrowserCsrf(request);
  if (csrfFailure) {
    return csrfFailure;
  }

  const upstreamUrl = `${controlPlaneBaseUrl()}${upstreamPath}`;
  const headers = new Headers();
  copyForwardableRequestHeaders(request, headers, init.headers);
  const timeoutMs = Number.isFinite(init.timeoutMs) ? Math.max(1, Number(init.timeoutMs)) : null;

  const body =
    init.body !== undefined
      ? init.body
      : request.method === 'GET' || request.method === 'HEAD'
        ? undefined
        : await request.text();
  const controller = timeoutMs === null ? null : new AbortController();
  const timeoutHandle = controller && timeoutMs !== null
    ? setTimeout(() => {
      controller.abort();
    }, timeoutMs)
    : null;

  try {
    const response = await fetch(upstreamUrl, {
      method: init.method ?? request.method,
      cache: 'no-store',
      redirect: 'manual',
      headers,
      body: body === '' ? undefined : body,
      signal: controller?.signal,
    });

    const responseHeaders = copyForwardableResponseHeaders(response);
    const contentType = response.headers.get('content-type')?.toLowerCase() || '';
    const shouldStreamResponse = contentType.includes('text/event-stream');
    const responseBody = shouldStreamResponse
      ? response.body
      : response.body === null
        ? null
        : await response.arrayBuffer();

    return new NextResponse(responseBody, {
      status: response.status,
      headers: responseHeaders,
    });
  } catch (error) {
    if (controller && error instanceof Error && error.name === 'AbortError') {
      return new NextResponse(
        JSON.stringify({ detail: `Upstream request timed out after ${timeoutMs}ms.` }),
        {
          status: 504,
          headers: { 'content-type': 'application/json' },
        },
      );
    }
    throw error;
  } finally {
    if (timeoutHandle !== null) {
      clearTimeout(timeoutHandle);
    }
  }
}
