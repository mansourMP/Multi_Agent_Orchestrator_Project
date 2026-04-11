import 'server-only';

import { NextRequest, NextResponse } from 'next/server';

import { controlPlaneBaseUrl } from '@/lib/server/control-plane-base-url';

function copyIfPresent(
  targetHeaders: Headers,
  requestHeaders: Headers,
  sourceName: string,
  targetName: string = sourceName,
): void {
  const value = requestHeaders.get(sourceName);
  if (value) {
    targetHeaders.set(targetName, value);
  }
}

export async function forwardControlPlaneRequest(
  request: NextRequest,
  upstreamPath: string,
  init: RequestInit = {},
): Promise<NextResponse> {
  const upstreamUrl = `${controlPlaneBaseUrl()}${upstreamPath}`;
  const headers = new Headers(init.headers ?? {});

  copyIfPresent(headers, request.headers, 'accept');
  copyIfPresent(headers, request.headers, 'authorization');
  copyIfPresent(headers, request.headers, 'cookie');
  copyIfPresent(headers, request.headers, 'content-type');
  copyIfPresent(headers, request.headers, 'x-forwarded-host');
  copyIfPresent(headers, request.headers, 'x-forwarded-proto');

  if (!headers.has('x-forwarded-host')) {
    copyIfPresent(headers, request.headers, 'host', 'x-forwarded-host');
  }
  if (!headers.has('x-forwarded-proto')) {
    headers.set('x-forwarded-proto', request.nextUrl.protocol.replace(':', '') || 'https');
  }

  const bodyText =
    init.body !== undefined
      ? init.body
      : request.method === 'GET' || request.method === 'HEAD'
        ? undefined
        : await request.text();

  const response = await fetch(upstreamUrl, {
    method: init.method ?? request.method,
    cache: 'no-store',
    headers,
    body: bodyText === '' ? undefined : bodyText,
  });

  const responseText = await response.text();
  const responseHeaders = new Headers();
  const contentType = response.headers.get('content-type');
  if (contentType) {
    responseHeaders.set('content-type', contentType);
  }

  return new NextResponse(responseText, {
    status: response.status,
    headers: responseHeaders,
  });
}
