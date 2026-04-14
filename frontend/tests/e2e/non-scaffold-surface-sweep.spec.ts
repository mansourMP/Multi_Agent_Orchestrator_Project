// @ts-nocheck
import { expect, test } from '@playwright/test';

import { loginAsOwner } from './support/auth';

const SURFACES = [
  ['chat', '[data-workstation-surface="chat"]'],
  ['agents', '[data-workstation-surface="agents"]'],
  ['deployed-agents', '[data-workstation-surface="deployed-agents"]'],
];

test.describe('non-scaffold surface sweep', () => {
  test.describe.configure({ mode: 'serial' });

  let sharedContext;
  let sharedPage;

  test.beforeAll(async ({ browser }) => {
    sharedContext = await browser.newContext();
    sharedPage = await sharedContext.newPage();
    await loginAsOwner(sharedPage);
  });

  test.afterAll(async () => {
    await sharedContext?.close();
  });

  for (const [surface, selector] of SURFACES) {
    test(`mounts a real component for ${surface}`, async () => {
      await sharedPage.goto(`/w/ws-1/${surface}`);
      await expect(sharedPage.locator(selector)).toBeVisible();
      await expect(sharedPage.locator('[data-workstation-surface="fallback"]')).toHaveCount(0);
    });
  }
});
