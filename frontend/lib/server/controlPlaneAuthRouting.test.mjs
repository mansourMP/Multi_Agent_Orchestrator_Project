import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildBrowserVisibleControlPlaneAuthStartPath,
  buildDesktopSignInCompletionPath,
  buildSignInErrorPath,
  resolveControlPlaneAuthServiceKind,
  resolveControlPlaneAuthServiceUrl,
  resolveControlPlaneAuthUrl,
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

test('resolveControlPlaneBackendUrl prefers an explicit control-plane backend URL and normalizes bare origins', () => {
  assert.equal(
    resolveControlPlaneBackendUrl({
      ORION_CONTROL_PLANE_BACKEND_URL: 'http://127.0.0.1:8080',
      NEXT_PUBLIC_API_URL: 'http://127.0.0.1:8001',
      BACKEND_PUBLIC_ORIGIN: 'http://localhost:4000',
    }),
    'http://127.0.0.1:8080/api/v1',
  );
});

test('resolveControlPlaneBackendUrl falls back to the backend public origin when the public API points at runtime', () => {
  assert.equal(
    resolveControlPlaneBackendUrl({
      NEXT_PUBLIC_API_URL: 'http://127.0.0.1:8001',
      ORION_API_URL: 'http://127.0.0.1:8001',
      BACKEND_PUBLIC_ORIGIN: 'http://127.0.0.1:8080',
    }),
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

test('runtime auth is the default auth service when no control-plane backend is configured', () => {
  assert.equal(resolveControlPlaneAuthServiceKind({}), 'runtime');
  assert.equal(resolveControlPlaneAuthServiceUrl({}), 'http://127.0.0.1:8001');
  assert.equal(resolveControlPlaneAuthUrl('login', {}), 'http://127.0.0.1:8001/auth/login');
  assert.equal(resolveControlPlaneAuthUrl('signup', {}), 'http://127.0.0.1:8001/auth/register');
});

test('explicit control-plane backend keeps auth proxying on the backend surface', () => {
  const env = {
    ORION_CONTROL_PLANE_BACKEND_URL: 'http://127.0.0.1:8080',
    NEXT_PUBLIC_ORION_API_URL: 'http://127.0.0.1:8001',
  };

  assert.equal(resolveControlPlaneAuthServiceKind(env), 'backend');
  assert.equal(resolveControlPlaneAuthServiceUrl(env), 'http://127.0.0.1:8080/api/v1');
  assert.equal(resolveControlPlaneAuthUrl('signup', env), 'http://127.0.0.1:8080/api/v1/auth/signup');
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
