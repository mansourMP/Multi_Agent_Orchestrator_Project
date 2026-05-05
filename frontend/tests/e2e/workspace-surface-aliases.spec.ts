// @ts-nocheck
import { expect, test } from '@playwright/test';

import { loginAsOwner } from './support/auth';

test.describe('workspace surface aliases', () => {
  test('legacy duplicate Sage routes redirect to the five canonical surfaces', async ({ page }) => {
    await loginAsOwner(page);

    const aliases = [
      ['/w/ws-1/profile', /\/w\/ws-1\/memory(?:[/?#]|$)/, '[data-workstation-surface="memory"]'],
      ['/w/ws-1/skills', /\/w\/ws-1\/integrations(?:[/?#]|$)/, '[data-workstation-surface="integrations"]'],
      ['/w/ws-1/channels', /\/w\/ws-1\/integrations(?:[/?#]|$)/, '[data-workstation-surface="integrations"]'],
      ['/w/ws-1/history', /\/w\/ws-1\/activity(?:[/?#]|$)/, '[data-workstation-surface="activity-proof"]'],
      ['/w/ws-1/runs', /\/w\/ws-1\/activity(?:[/?#]|$)/, '[data-workstation-surface="activity-proof"]'],
      ['/w/ws-1/heartbeat', /\/w\/ws-1\/tasks(?:[/?#]|$)/, '[data-workstation-surface="sage-tasks"]'],
      ['/w/ws-1/approvals', /\/w\/ws-1\/tasks(?:[/?#]|$)/, '[data-workstation-surface="sage-tasks"]'],
    ];

    for (const [href, urlPattern, selector] of aliases) {
      await page.goto(href);
      await expect(page).toHaveURL(urlPattern);
      await expect(page.locator(selector)).toBeVisible();
    }
  });
});
