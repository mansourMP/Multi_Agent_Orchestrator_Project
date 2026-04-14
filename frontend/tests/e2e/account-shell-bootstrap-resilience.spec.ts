// @ts-nocheck
import { expect, test } from '@playwright/test';

test.describe('account shell and bootstrap resilience', () => {
  test('public routes still render when account-shell bootstrap fails transiently', async ({ page }) => {
    await page.route('**/api/auth/account-shell', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'transient failure' }),
      });
    });

    await page.goto('/login');
    await expect(page.getByRole('button', { name: /log in/i })).toBeVisible();
  });

  test('requested onboarding workspace fails closed when it is unavailable', async ({ page }) => {
    await page.goto('/onboarding?workspaceId=ws-missing');
    await expect(page.getByText(/requested workspace is unavailable/i)).toBeVisible();
    await expect(page).toHaveURL(/\/onboarding\?workspaceId=ws-missing$/);
  });

  test('stale remembered workspace routes are discarded when shell membership state changes', async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem(
        'empyralis.account-shell.v2',
        JSON.stringify({
          accountId: 'user-1',
          selectedWorkspaceId: 'ws-1',
          lastVisitedWorkspaceRouteById: {
            'ws-1': '/w/ws-1/admin',
          },
          workspaceRouteStateById: {
            'ws-1': 'old-membership::/w/ws-1/admin::workspace.admin',
          },
          globalTheme: 'system',
          globalChromePreferences: {
            tenantSwitcherCollapsed: false,
          },
        }),
      );
    });

    await page.goto('/w/ws-1');
    await expect(page).not.toHaveURL(/\/w\/ws-1\/admin$/);
  });
});
