import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildBrowserVisibleControlPlaneAuthStartPath,
  buildDesktopSignInCompletionPath,
  buildSignInErrorPath,
  resolveControlPlaneAuthStartUrl,
  resolveControlPlaneBackendUrl,
} from './controlPlaneAuthRouting.js';

test('resolveControlPlaneBackendUrl defaults to the control-plane backend, not the raw runtime', () => {
  assert.equal(resolveControlPlaneBackendUrl({}), 'http://localhost:4000/api/v1');
});

test('resolveControlPlaneBackendUrl preserves explicit control-plane API env values', () => {
  assert.equal(
    resolveControlPlaneBackendUrl({ NEXT_PUBLIC_API_URL: 'http://127.0.0.1:8080/api/v1' }),
    'http://127.0.0.1:8080/api/v1',
  );
});

test('resolveControlPlaneAuthStartUrl builds backend auth start routes', () => {
  assert.equal(
    resolveControlPlaneAuthStartUrl('google', { NEXT_PUBLIC_API_URL: 'http://127.0.0.1:8080/api/v1' }),
    'http://127.0.0.1:8080/api/v1/auth/google',
  );
  assert.equal(
    resolveControlPlaneAuthStartUrl('apple', {}),
    'http://localhost:4000/api/v1/auth/apple',
  );
});

test('buildBrowserVisibleControlPlaneAuthStartPath keeps browser auth on the control-plane surface', () => {
  assert.equal(
    buildBrowserVisibleControlPlaneAuthStartPath('google', '/runs/123', true),
    '/api/control-plane/auth/google/start?returnTo=%2Fruns%2F123&desktop=1',
  );
  assert.equal(
    buildBrowserVisibleControlPlaneAuthStartPath('apple', '/home', false),
    '/api/control-plane/auth/apple/start?returnTo=%2Fhome',
  );
});

test('desktop completion and failure paths stay on frontend sign-in routes', () => {
  assert.equal(
    buildDesktopSignInCompletionPath('/setup?step=integrations'),
    '/sign-in/complete?mode=desktop&returnTo=%2Fsetup%3Fstep%3Dintegrations',
  );
  assert.equal(
    buildSignInErrorPath('oauth_missing_token', '/workflows'),
    '/sign-in?error=oauth_missing_token&returnTo=%2Fworkflows',
  );
});
