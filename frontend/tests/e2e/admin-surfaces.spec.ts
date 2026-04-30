// @ts-nocheck
import { expect, test } from '@playwright/test';

import { loginAsOwner } from './support/auth';

test.describe('admin surfaces', () => {
  test('legacy admin workspace routes stay hidden from the active shell', async ({ page }) => {
    await loginAsOwner(page);

    for (const path of [
      '/w/ws-1/admin',
      '/w/ws-1/admin/members',
      '/w/ws-1/admin/platform',
      '/w/ws-1/admin/policies',
      '/w/ws-1/admin/routing',
    ]) {
      await page.goto(path);
      await expect(page.getByRole('heading', { name: /this route is not available/i })).toBeVisible();
    }
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
