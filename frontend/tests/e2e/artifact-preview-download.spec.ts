// @ts-nocheck
import { expect, test } from '@playwright/test';

test.describe('artifact preview and download', () => {
  test('text artifact opens in pane 4 with metadata and preview', async ({ page }) => {
    await page.goto('/w/ws-1/artifacts?stage_source=route&stage_kind=artifact&stage_id=artifact-text-1');

    await expect(page.locator('[data-workstation-artifact-viewer="pane"]')).toBeVisible();
    await expect(page.locator('[data-workstation-artifact-viewer="pane"]')).toContainText(/artifact detail/i);
    await expect(page.locator('[data-workstation-artifact-viewer="pane"]')).toContainText(/preview/i);
    await expect(page.getByRole('link', { name: /download/i })).toBeVisible();
  });

  test('image artifact opens with inline preview', async ({ page }) => {
    await page.goto('/w/ws-1/artifacts?stage_source=route&stage_kind=artifact&stage_id=artifact-image-1');

    await expect(page.locator('[data-workstation-artifact-viewer="pane"]')).toBeVisible();
    await expect(page.locator('[data-workstation-artifact-viewer="pane"] img')).toBeVisible();
  });

  test('artifact content endpoint returns attachment disposition', async ({ request }) => {
    const response = await request.get('/api/artifacts/artifact-text-1/content', {
      headers: {
        'x-empyralis-workspace-id': 'ws-1',
      },
    });

    expect(response.headers()['content-disposition']).toContain('attachment;');
  });
});
