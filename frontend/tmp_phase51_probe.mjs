import { chromium } from '@playwright/test';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ baseURL: 'http://localhost:3000' });
const page = await context.newPage();
const uniqueId = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
const email = `phase51-probe-${uniqueId}@example.com`;
try {
  await page.goto('/sign-in', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.getByLabel('Full name').fill('Phase 51 Probe');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('Passw0rd!12345');
  await page.getByRole('button', { name: 'Create Empyralis account' }).click();
  await page.waitForSelector('.orion-chat-v2-input', { timeout: 20000 });
  await page.locator('.orion-chat-v2-input').fill('Research cats and draft a summary.');
  await page.getByRole('button', { name: 'Send' }).click();
  await page.waitForTimeout(7000);
  const assistantTurns = page.locator('.orion-chat-v2-turn.is-assistant');
  const count = await assistantTurns.count();
  console.log('assistant turns', count);
  for (let i = 0; i < count; i++) {
    console.log('TURN', i, await assistantTurns.nth(i).innerText());
  }
  const buttons = await page.locator('button').evaluateAll((els) => els.map((el) => ({text: el.textContent?.trim(), aria: el.getAttribute('aria-label')})).filter((x) => x.text || x.aria));
  console.log('buttons', JSON.stringify(buttons.slice(0, 120), null, 2));
  const body = await page.locator('body').innerText();
  console.log('body snippet', body.slice(0, 7000));
} finally {
  await context.close();
  await browser.close();
}
