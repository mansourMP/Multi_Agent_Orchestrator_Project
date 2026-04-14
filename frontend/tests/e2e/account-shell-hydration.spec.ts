// @ts-nocheck
import { expect, test } from '@playwright/test';

test.describe('account shell hydration', () => {
  test('hydrates the account shell after login and shows real memberships', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill('owner@example.com');
    await page.getByLabel('Password').fill('password-123');
    await page.getByRole('button', { name: /log in/i }).click();

    await page.waitForURL(/\/w\/[^/]+/);
    await expect(page.locator('[data-workstation-switcher="rail"]')).toBeVisible();
    await expect(page.locator('[data-workstation-switcher-link]')).toHaveCount(1);
  });

  test('hard refresh on a workspace route preserves the server-hydrated shell session', async ({ page }) => {
    await page.goto('/w/ws-1/chat');
    await page.reload();

    await expect(page.locator('[data-workstation-switcher="rail"]')).toBeVisible();
    await expect(page.locator('[data-workstation-switcher-link="ws-1"]')).toBeVisible();
  });

  test('anonymous users are redirected out of account routes', async ({ page }) => {
    await page.goto('/w/ws-1/chat');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('switching authenticated accounts discards the previous membership snapshot before render', async ({ page, context }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill('first@example.com');
    await page.getByLabel('Password').fill('password-123');
    await page.getByRole('button', { name: /log in/i }).click();
    await page.waitForURL(/\/w\/[^/]+/);
    await context.clearCookies();

    await page.goto('/login');
    await page.getByLabel('Email').fill('second@example.com');
    await page.getByLabel('Password').fill('password-123');
    await page.getByRole('button', { name: /log in/i }).click();

    await expect(page.locator('[data-workstation-switcher-link="ws-first"]')).toHaveCount(0);
  });
});
