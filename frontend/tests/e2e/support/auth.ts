// @ts-nocheck
import { expect, type Page } from '@playwright/test';

async function waitForWorkspaceShell(page: Page, workspaceId: string): Promise<void> {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      await page.goto(`/w/${workspaceId}/chat`, { waitUntil: 'domcontentloaded' });
    } catch (error) {
      if (attempt === 5) {
        throw error;
      }
      await page.waitForTimeout(150 * (attempt + 1));
      continue;
    }
    const rail = page.locator('[data-workstation-switcher="rail"]');
    const workspaceLink = page.locator(`[data-workstation-switcher-link="${workspaceId}"]`);
    if (await rail.count() > 0 && await workspaceLink.count() > 0) {
      return;
    }
    await page.waitForTimeout(150 * (attempt + 1));
  }
  throw new Error(`Workspace shell never became healthy for ${workspaceId}.`);
}

async function loginOwnerSession(page: Page): Promise<void> {
  const response = await page.request.post('/api/auth/login', {
    data: {
      email: 'owner@example.com',
      password: 'password-123',
      channel: 'web',
    },
  });
  expect(response.ok()).toBeTruthy();
}

export async function loginAsOwner(page: Page, workspaceId = 'ws-1'): Promise<void> {
  await page.context().clearCookies();
  await loginOwnerSession(page);
  await waitForWorkspaceShell(page, workspaceId);
  await expect(page.locator('[data-workstation-switcher="rail"]')).toBeVisible();
  await expect(page.locator(`[data-workstation-switcher-link="${workspaceId}"]`)).toBeVisible();
}
