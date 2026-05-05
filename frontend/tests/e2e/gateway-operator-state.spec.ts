// @ts-nocheck
import { expect, test } from '@playwright/test';

import { loginAsOwner } from './support/auth';

test.describe('gateway surface aliases', () => {
  test('My Computer route opens Integrations instead of a duplicate device console', async ({ page }) => {
    await loginAsOwner(page);

    await page.goto('/w/ws-1/gateway');

    await expect(page).toHaveURL(/\/w\/ws-1\/integrations(?:[/?#]|$)/);
    await expect(page.getByRole('link', { name: /^Integrations$/ })).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('link', { name: /^My Computer$/ })).toHaveCount(0);
  });

  test('gateway detail aliases land in the owning product surfaces', async ({ page }) => {
    await loginAsOwner(page);

    await page.goto('/w/ws-1/gateway-approvals');
    await expect(page).toHaveURL(/\/w\/ws-1\/tasks(?:[/?#]|$)/);
    await expect(page.locator('[data-workstation-surface="sage-tasks"]')).toBeVisible();

    await page.goto('/w/ws-1/gateway-activity');
    await expect(page).toHaveURL(/\/w\/ws-1\/activity(?:[/?#]|$)/);
    await expect(page.locator('[data-workstation-surface="activity-proof"]')).toBeVisible();
  });
});
