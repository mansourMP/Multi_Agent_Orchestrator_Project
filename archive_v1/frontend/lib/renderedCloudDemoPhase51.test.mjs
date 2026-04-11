import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';

const baseUrl = process.env.PHASE51_BASE_URL || 'http://localhost:3000';
const promptText = 'Research cats and draft a summary.';

async function waitForAssistantTurn(page, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  let lastText = '';
  while (Date.now() < deadline) {
    const turns = page.locator('.orion-chat-v2-turn.is-assistant');
    const count = await turns.count();
    if (count > 0) {
      lastText = (await turns.nth(count - 1).innerText()).trim();
      if (lastText.length >= 120 && /cat/i.test(lastText)) {
        return lastText;
      }
    }
    await page.waitForTimeout(500);
  }
  throw new Error(`Timed out waiting for assistant text. Last text: ${lastText}`);
}

function latestStatusFor(hits, needle) {
  for (let index = hits.length - 1; index >= 0; index -= 1) {
    if (hits[index].url.includes(needle)) {
      return hits[index].status;
    }
  }
  return null;
}

test('real rendered cloud chat renders a live assistant answer on the current web shell', async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ baseURL: baseUrl });
  const page = await context.newPage();
  const apiHits = [];
  page.on('response', (response) => {
    const url = response.url();
    if (!url.includes('/api/')) return;
    if (url.includes('/_next/')) return;
    apiHits.push({ url, status: response.status() });
  });
  const uniqueId = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const email = `phase51-rendered-${uniqueId}@example.com`;

  try {
    await page.goto('/sign-in', { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Create account' }).click();
    await page.getByLabel('Full name').fill('Phase 51 Demo');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill('Passw0rd!12345');
    await page.getByRole('button', { name: 'Create Empyralis account' }).click();

    await page.waitForSelector('.orion-chat-v2-input', { timeout: 20000 });
    const bodyText = await page.locator('body').innerText();
    assert.equal(
      bodyText.includes('No AI provider configured for Sage yet.'),
      false,
      'Expected the rendered shell to show a usable provider path.',
    );
    await page.locator('.orion-chat-v2-input').fill(promptText);
    await page.getByRole('button', { name: 'Send' }).click();

    const userTurns = page.locator('.orion-chat-v2-turn.is-user');
    await userTurns.first().waitFor({ timeout: 10000 });
    const userText = await userTurns.nth((await userTurns.count()) - 1).innerText();
    assert.match(userText, /Research cats and draft a summary\./i);

    const assistantText = await waitForAssistantTurn(page);
    assert.match(assistantText, /cat/i);
    assert.ok(
      assistantText.length >= 120,
      `Expected a substantive assistant answer, got ${assistantText.length} chars`,
    );

    assert.equal(latestStatusFor(apiHits, '/api/control-plane/providers/runtime-availability'), 200);
    assert.equal(latestStatusFor(apiHits, '/api/chat/master-context'), 200);
    assert.equal(latestStatusFor(apiHits, '/api/activity/timeline'), 200);
    assert.equal(latestStatusFor(apiHits, '/api/sessions'), 200);
    assert.equal(latestStatusFor(apiHits, '/api/turn'), 200);
  } finally {
    await context.close();
    await browser.close();
  }
});
