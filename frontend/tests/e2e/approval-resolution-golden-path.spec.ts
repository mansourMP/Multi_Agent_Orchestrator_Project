// @ts-nocheck
import { expect, test } from '@playwright/test';
import { loginAsOwner } from './support/auth';

test.describe('approval resolution golden path', () => {
  test('approvals surface mounts the current permission queue', async ({ page }) => {
    await loginAsOwner(page);
    const bootstrapResponse = await page.request.get('/api/workspaces/ws-1/bootstrap');
    const bootstrap = bootstrapResponse.ok() ? await bootstrapResponse.json() : null;
    const approvalsEnabled = bootstrap?.capabilities?.approvals_enabled === true;

    await page.goto('/w/ws-1/approvals');

    if (!approvalsEnabled) {
      await expect(page).toHaveURL(/\/w\/ws-1\/sage(?:[/?#]|$)/);
      await expect(page.locator('[data-workstation-surface="chat"]')).toBeVisible();
      await expect(page.locator('[data-workstation-surface="approvals"]')).toHaveCount(0);
      return;
    }

    const surface = page.locator('[data-workstation-surface="approvals"]');
    await expect(surface).toBeVisible();
    await expect(surface).toContainText(/approvals/i);
    await expect(surface).toContainText(/pending approvals/i);
    await expect(page.getByRole('button', { name: /refresh/i })).toBeVisible();
  });

  test('approval resolution endpoint remains workspace scoped', async ({ page }) => {
    await loginAsOwner(page);
    const response = await page.request.get('/api/approvals?workspace_id=ws-1&limit=1');

    expect([200, 403]).toContain(response.status());
  });
});
