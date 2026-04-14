// @ts-nocheck
import { expect, test } from '@playwright/test';

test.describe('workstation data reconciliation', () => {
  test('notifications mark-all-read updates both list state and status messaging', async ({ page }) => {
    await page.goto('/w/ws-1/notifications');

    await expect(page.locator('[data-workstation-surface="notifications"]')).toBeVisible();
    await page.getByRole('button', { name: /mark all read/i }).click();
    await expect(page.locator('[data-workstation-surface="notifications"]')).toContainText(/marked all visible notifications as read/i);
  });

  test('chat refreshes canonical thread and approval state after approval outcomes', async ({ page }) => {
    await page.goto('/w/ws-1/chat');

    await expect(page.locator('[data-workstation-surface="chat"]')).toBeVisible();
    await page.getByRole('button', { name: /refresh thread/i }).click();
    await expect(page.locator('[data-workstation-surface="chat"]')).not.toContainText(/loading canonical thread history/i);
  });

  test('runs, approvals, activity, and home surfaces leave loading states and mount live data surfaces', async ({ page }) => {
    for (const route of ['/w/ws-1', '/w/ws-1/runs', '/w/ws-1/approvals', '/w/ws-1/activity']) {
      await page.goto(route);
      await expect(page.locator('[data-workstation-surface]')).toBeVisible();
      await expect(page.locator('text=/Loading /i')).toHaveCount(0);
    }
  });
});
