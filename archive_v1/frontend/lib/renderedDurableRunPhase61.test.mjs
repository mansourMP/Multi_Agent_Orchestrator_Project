import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';

const baseUrl = process.env.PHASE61_BASE_URL || 'http://127.0.0.1:3000';
const promptText = 'Search for recent AI papers and create a summary document.';

async function pollRunDetail(page, runId, timeoutMs = 45000) {
  const deadline = Date.now() + timeoutMs;
  let lastDetail = null;
  while (Date.now() < deadline) {
    lastDetail = await page.evaluate(async (id) => {
      const res = await fetch(`/api/runs/${encodeURIComponent(id)}`);
      const text = await res.text();
      let json = null;
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }
      return { status: res.status, json, text };
    }, runId);
    const runStatus = String(lastDetail?.json?.status || '').trim().toLowerCase();
    if (['completed', 'waiting', 'failed', 'timeout'].includes(runStatus)) {
      return lastDetail;
    }
    await page.waitForTimeout(1000);
  }
  throw new Error(`Timed out waiting for durable run ${runId}. Last detail: ${JSON.stringify(lastDetail)}`);
}

function latestHit(apiHits, needle) {
  for (let index = apiHits.length - 1; index >= 0; index -= 1) {
    if (apiHits[index].url.includes(needle)) {
      return apiHits[index];
    }
  }
  return null;
}

test('real rendered durable run is visible in the current web shell', async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ baseURL: baseUrl });
  const page = await context.newPage();
  const apiHits = [];
  let turnResponse = null;

  page.on('response', async (response) => {
    const url = response.url();
    if (!url.includes('/api/')) return;
    const headers = await response.allHeaders().catch(() => ({}));
    apiHits.push({
      url,
      status: response.status(),
      contentType: headers['content-type'] || null,
    });
    if (url.includes('/api/turn')) {
      const contentType = String(headers['content-type'] || '').toLowerCase();
      if (contentType.includes('application/json')) {
        try {
          turnResponse = await response.json();
        } catch {
          turnResponse = null;
        }
      }
    }
  });

  const email = `phase61-rendered-${Date.now()}-${Math.random().toString(16).slice(2, 8)}@example.com`;

  try {
    await page.goto('/sign-in', { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Create account' }).click();
    await page.getByLabel('Full name').fill('Phase 61 Demo');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill('Passw0rd!12345');
    await page.getByRole('button', { name: 'Create Empyralis account' }).click();

    await page.waitForSelector('.orion-chat-v2-input', { timeout: 30000 });
    await page.locator('.orion-chat-v2-input').fill(promptText);
    await page.getByRole('button', { name: 'Send' }).click();

    await page.waitForTimeout(5000);

    assert.equal(typeof turnResponse, 'object', 'Expected /api/turn to return JSON for a durable run.');
    assert.equal(turnResponse?.metadata?.kind, 'durable_run');
    assert.match(String(turnResponse?.run_id || ''), /^[0-9a-f-]{36}$/i);

    const finalRunDetail = await pollRunDetail(page, turnResponse.run_id);
    assert.equal(finalRunDetail.status, 200);
    assert.equal(finalRunDetail.json?.status, 'completed');

    await page.waitForTimeout(2000);

    const assistantTurns = page.locator('.orion-chat-v2-turn.is-assistant');
    assert.ok(await assistantTurns.count(), 'Expected the shell to render an assistant-side durable run row.');
    const runCards = page.locator('.orion-chat-v2-run-card');
    assert.ok(await runCards.count(), 'Expected the shell to render a durable run card.');

    const bodyText = await page.locator('body').innerText();
    assert.equal(bodyText.includes('Failed to start durable run.'), false);
    assert.equal(bodyText.includes('Search for recent AI papers and create a summary document.'), true);
    assert.equal(bodyText.includes('Completed'), true);

    const invalidRunResponse = await page.evaluate(async () => {
      const res = await fetch('/api/runs/not-a-real-phase61-run');
      return {
        status: res.status,
        text: await res.text(),
      };
    });
    assert.notEqual(invalidRunResponse.status, 200, 'Expected malformed run ids to fail instead of rendering fake state.');

    assert.equal(latestHit(apiHits, '/api/turn')?.contentType?.includes('application/json'), true);
    assert.equal(latestHit(apiHits, '/api/activity/timeline')?.status, 200);
  } finally {
    await context.close();
    await browser.close();
  }
});
