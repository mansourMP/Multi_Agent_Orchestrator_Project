// @ts-nocheck
import { expect, test } from '@playwright/test';

test.describe('approval resolution golden path', () => {
  test('approving an approval removes it from pending and shows resumed run state', async ({ page }) => {
    await page.goto('/w/ws-1/approvals?stage_source=route&stage_kind=approval&stage_id=approval-1');

    await expect(page.locator('[data-workstation-approval-detail="pane"]')).toBeVisible();
    await page.getByRole('button', { name: /^approve$/i }).click();

    await expect(page.locator('[data-workstation-surface="approvals"]')).not.toContainText('approval-1');
    await expect(page.locator('[data-workstation-approval-detail="pane"]')).toContainText(/run resumed/i);
  });

  test('rejecting an approval removes it from pending and shows terminal run state', async ({ page }) => {
    await page.goto('/w/ws-1/approvals?stage_source=route&stage_kind=approval&stage_id=approval-2');

    await expect(page.locator('[data-workstation-approval-detail="pane"]')).toBeVisible();
    await page.getByRole('button', { name: /^reject$/i }).click();

    await expect(page.locator('[data-workstation-surface="approvals"]')).not.toContainText('approval-2');
    await expect(page.locator('[data-workstation-approval-detail="pane"]')).toContainText(/run stopped/i);
  });

  test('run detail opens directly by id without depending on the first summary page', async ({ page }) => {
    await page.goto('/w/ws-1/runs?stage_source=route&stage_kind=run&stage_id=run-deep-link-1');

    await expect(page.locator('[data-workstation-run-detail="pane"]')).toBeVisible();
    await expect(page.locator('[data-workstation-run-detail="pane"]')).toContainText('run-deep-link-1');
  });
});
