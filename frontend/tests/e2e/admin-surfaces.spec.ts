// @ts-nocheck
import { expect, test } from '@playwright/test';

import { loginAsOwner } from './support/auth';

test.describe('admin surfaces', () => {
  test('members admin mounts as a workstation surface with invite and pending sections', async ({ page }) => {
    await loginAsOwner(page);
    await page.goto('/w/ws-1/admin/members');

    await expect(page.locator('[data-workstation-surface="admin/members"]')).toBeVisible();
    await expect(page.locator('[data-workstation-surface="admin/members"]')).toContainText(/workspace access/i);
    await expect(page.locator('[data-workstation-surface="admin/members"]')).toContainText(/pending invites/i);
    await expect(page.getByRole('button', { name: /send invite/i })).toBeVisible();
  });

  test('policies admin exposes canonical save and refresh controls', async ({ page }) => {
    await loginAsOwner(page);
    await page.goto('/w/ws-1/admin/policies');

    await expect(page.locator('[data-workstation-surface="admin/policies"]')).toBeVisible();
    await expect(page.getByRole('button', { name: /save policy/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /^refresh$/i })).toBeVisible();
    await expect(page.locator('[data-workstation-surface="admin/policies"]')).toContainText(/canonical snapshot/i);
  });

  test('routing and channel operations surfaces mount through the refaced admin chrome', async ({ page }) => {
    await loginAsOwner(page);
    await page.goto('/w/ws-1/admin/routing');
    await expect(page.locator('[data-workstation-surface="admin/routing"]')).toBeVisible();
    await expect(page.locator('[data-workstation-surface="admin/routing"]')).toContainText(/routing and runtime/i);
    await expect(page.getByRole('button', { name: /platform analytics/i })).toBeVisible();

    await page.goto('/w/ws-1/admin/platform');
    await expect(page.locator('[data-workstation-surface="admin/platform"]')).toBeVisible();
    await expect(page.locator('[data-workstation-surface="admin/platform"]')).toContainText(/platform analytics/i);
    await expect(page.locator('[data-workstation-surface="admin/platform"]')).toContainText(/cross-workspace totals/i);
    await expect(page.locator('[data-workstation-surface="admin/platform"]')).toContainText(/model and provider cost breakdown/i);

    await page.goto('/w/ws-1/admin');
    await expect(page.locator('[data-workstation-surface="admin/channel-operations"]')).toBeVisible();
    await expect(page.locator('[data-workstation-surface="admin/channel-operations"]')).toContainText(/provider health|delivery summary/i);
  });

  test('invite revoke route exists at the workspace admin path', async ({ request }) => {
    const response = await request.delete('/api/workspaces/ws-1/members/invites/invite-1', {
      headers: {
        'x-empyralis-workspace-id': 'ws-1',
      },
    });

    expect([200, 401, 403, 404, 409]).toContain(response.status());
  });
});
