// @ts-nocheck
import { expect, test } from '@playwright/test';

test.describe('workspace setup', () => {
  test('fresh signup lands on onboarding and enters the configured workspace', async ({ page }) => {
    await page.goto('/signup');
    await page.getByLabel('Email').fill('owner@example.com');
    await page.getByLabel('Password').fill('password-123');
    await page.getByLabel('Display name').fill('Owner Example');
    await page.getByRole('button', { name: /sign up/i }).click();

    await expect(page).toHaveURL(/\/onboarding/);
    await page.getByLabel('Workspace name').fill('Acme Deal Room');
    await page.getByLabel('Shell profile').selectOption('document_workstation_shell');
    await page.getByLabel('Default route').selectOption(/workstation$/);
    await page.getByRole('button', { name: /save workspace setup/i }).click();

    await page.waitForURL(/\/w\/[^/]+\/workstation$/);
  });

  test('existing users can create a second workspace and see it in the switcher', async ({ page }) => {
    await page.goto('/workspaces/new');
    await page.getByLabel('Workspace name').fill('Second Workspace');
    await page.getByLabel('Workspace type').selectOption('team');
    await page.getByLabel('Shell profile').selectOption('operations_admin_shell');
    await page.getByLabel('Default route').selectOption('/admin');
    await page.getByRole('button', { name: /create workspace/i }).click();

    await page.waitForURL(/\/w\/[^/]+\/admin$/);
    await expect(page.locator('[data-workstation-switcher-link]')).toContainText(['Second Workspace']);
  });

  test('direct navigation to an incomplete workspace redirects to onboarding', async ({ page }) => {
    await page.goto('/w/ws-incomplete/chat');
    await expect(page).toHaveURL(/\/onboarding\?workspaceId=ws-incomplete$/);
  });
});
