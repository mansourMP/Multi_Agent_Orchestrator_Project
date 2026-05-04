// @ts-nocheck
import { expect, test } from '@playwright/test';

test.describe('browser auth session', () => {
  test('signup creates a browser session and survives reload', async ({ page }) => {
    const signupEmail = `owner+${Date.now()}@example.com`;
    await page.goto('/signup?channel_attribution=tg-signup-token');
    const signupRequest = page.waitForRequest((request) => (
      request.method() === 'POST'
      && request.url().includes('/api/auth/signup')
    ));
    await page.getByLabel('Name').fill('Owner Example');
    await page.getByLabel('Email').fill(signupEmail);
    await page.getByLabel('Password').fill('password-123');
    await page.getByRole('button', { name: /create account/i }).click();
    const postedSignupRequest = await signupRequest;
    expect(JSON.parse(postedSignupRequest.postData() || '{}').acquisition_token).toBe('tg-signup-token');

    await page.waitForURL(/\/w\/.+\/sage(?:[/?#]|$)/);
    await expect(page).not.toHaveURL(/\/onboarding(?:[/?#]|$)/);
    await page.reload();
    await expect(page).not.toHaveURL(/\/login$/);
  });

  test('login establishes a browser session that survives reload', async ({ page }) => {
    await page.goto('/login?channel_attribution=tg-login-token');
    const loginRequest = page.waitForRequest((request) => (
      request.method() === 'POST'
      && request.url().includes('/api/auth/login')
    ));
    await page.getByLabel('Email').fill('owner@example.com');
    await page.getByLabel('Password').fill('password-123');
    await page.getByRole('button', { name: /^continue$/i }).click();
    const postedLoginRequest = await loginRequest;
    expect(JSON.parse(postedLoginRequest.postData() || '{}').acquisition_token).toBe('tg-login-token');

    await page.waitForURL(/\/w\/.+\/sage(?:[/?#]|$)/);
    await expect(page).not.toHaveURL(/\/onboarding(?:[/?#]|$)/);
    await page.reload();
    await expect(page).not.toHaveURL(/\/login$/);
  });

  test('unsafe cookie-auth requests fail closed without a CSRF header', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill('owner@example.com');
    await page.getByLabel('Password').fill('password-123');
    await page.getByRole('button', { name: /^continue$/i }).click();
    await page.waitForURL(/\/(w\/|onboarding|$)/);

    const response = await page.request.post('/api/auth/logout');
    expect(response.status()).toBe(403);
  });

  test('logout clears the browser session', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill('owner@example.com');
    await page.getByLabel('Password').fill('password-123');
    await page.getByRole('button', { name: /^continue$/i }).click();
    await page.waitForURL(/\/(w\/|onboarding|$)/);

    const csrfCookie = (await page.context().cookies()).find(
      (cookie) => cookie.name === 'empyralis_csrf_token',
    );
    const response = await page.request.post('/api/auth/logout', {
      headers: csrfCookie ? { 'x-csrf-token': csrfCookie.value } : {},
    });
    expect(response.ok()).toBeTruthy();

    await page.goto('/w/ws-1/chat');
    await expect(page).toHaveURL(/\/login$/);
  });
});
