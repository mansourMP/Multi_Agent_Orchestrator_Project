// @ts-nocheck
import { expect, type Page } from '@playwright/test';

let cachedOwnerCookies: Awaited<ReturnType<Page['context']['storageState']>>['cookies'] | null = null;

export async function loginAsOwner(page: Page, workspaceId = 'ws-1'): Promise<void> {
  if (cachedOwnerCookies && cachedOwnerCookies.length > 0) {
    await page.context().addCookies(cachedOwnerCookies);
  } else {
    const response = await page.request.post('/api/auth/login', {
      data: {
        email: 'owner@example.com',
        password: 'password-123',
        channel: 'web',
      },
    });
    expect(response.ok()).toBeTruthy();
    cachedOwnerCookies = (await page.context().storageState()).cookies;
  }

  await page.goto(`/w/${workspaceId}/chat`);
  await expect(page.locator('[data-workstation-switcher="rail"]')).toBeVisible();
  await expect(page.locator(`[data-workstation-switcher-link="${workspaceId}"]`)).toBeVisible();
}
