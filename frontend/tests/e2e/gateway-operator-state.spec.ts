// @ts-nocheck
import { expect, test } from '@playwright/test';

import { loginAsOwner } from './support/auth';

async function mockAgentComputerSettings(page) {
  const registration = {
    gateway_id: 'gw-1',
    workspace_id: 'ws-1',
    display_name: 'Mansur Mac mini',
    platform: 'macos-arm64',
    status: 'online',
    connection_status: 'online',
    device_trust_state: 'verified',
    last_seen_at: '2026-05-25T00:00:00Z',
    runtime_access_mode: 'custom',
    runtime_access_label: 'Custom',
    agent_computer_policy_id: 'agent-computer:gw-1',
    capabilities: ['file.write', 'browser.read', 'terminal.approved_script'],
  };
  let savedPolicy = null;

  await page.route('**/api/gateway/registrations?**', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue();
      return;
    }
    await route.fulfill({ json: { items: [registration] } });
  });
  await page.route('**/api/gateway/registrations/gw-1/doctor**', async (route) => {
    await route.fulfill({
      json: {
        status: 'healthy',
        checks: [],
        browser: { status: 'ready' },
        providers: { status: 'ready' },
        checkpoint: { status: 'ready' },
        quota: { status: 'ready' },
      },
    });
  });
  await page.route('**/api/gateway/registrations/gw-1/approvals', async (route) => {
    await route.fulfill({ json: { items: [] } });
  });
  await page.route('**/api/gateway/registrations/gw-1/browser/sessions', async (route) => {
    await route.fulfill({ json: { items: [] } });
  });
  await page.route('**/api/gateway/registrations/gw-1/events?**', async (route) => {
    await route.fulfill({ json: { items: [] } });
  });
  await page.route('**/api/personal-channels/*/gateways/gw-1', async (route) => {
    await route.fulfill({ json: { connected: false, status: 'not_configured' } });
  });
  await page.route('**/api/agent-computers/gw-1/policy**', async (route) => {
    if (route.request().method() === 'PUT') {
      savedPolicy = route.request().postDataJSON()?.policy ?? null;
      await route.fulfill({
        json: {
          workspace_id: 'ws-1',
          computer_id: 'gw-1',
          policy_id: 'agent-computer:gw-1',
          saved: true,
          runtime_access_mode: 'custom',
          policy: savedPolicy,
          effective_policy: savedPolicy,
          emergency_stop: { active: false },
        },
      });
      return;
    }
    const policyPayload = savedPolicy ?? {
      policy_id: 'agent-computer:gw-1',
      autonomy_mode: 'ask_every_time',
      filesystem_scope: [],
      blocked_filesystem_scope: [],
      domain_allowlist: [],
      terminal_policy: 'review_required',
      network_policy: 'approval_required',
      browser_access_policy: 'approval_required',
      app_access_policy: 'approval_required',
      approval_ttl_seconds: 900,
      max_runtime_seconds: 0,
      max_budget_cents: 0,
      emergency_stop_enabled: true,
    };
    await route.fulfill({
      json: {
        workspace_id: 'ws-1',
        computer_id: 'gw-1',
        policy_id: 'agent-computer:gw-1',
        saved: Boolean(savedPolicy),
        runtime_access_mode: 'custom',
        policy: policyPayload,
        effective_policy: policyPayload,
        emergency_stop: { active: false },
      },
    });
  });

  return {
    savedPolicy: () => savedPolicy,
  };
}

test.describe('gateway surface aliases', () => {
  test('My Computer route opens the Agent Computer surface', async ({ page }) => {
    await loginAsOwner(page);

    await page.goto('/w/ws-1/gateway');

    await expect(page).toHaveURL(/\/w\/ws-1\/gateway(?:[/?#]|$)/);
    await expect(page.locator('[data-workstation-surface-view="gateway"]')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Connect a computer' })).toBeVisible();
    await expect(page.getByRole('link', { name: /^My Computer$/ })).toHaveCount(0);
  });

  test('gateway detail aliases stay inside the Agent Computer surface', async ({ page }) => {
    await loginAsOwner(page);

    await page.goto('/w/ws-1/gateway-approvals');
    await expect(page).toHaveURL(/\/w\/ws-1\/gateway-approvals(?:[/?#]|$)/);
    await expect(page.locator('[data-workstation-surface-view="gatewayApprovals"]')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Connect a computer' })).toBeVisible();

    await page.goto('/w/ws-1/gateway-activity');
    await expect(page).toHaveURL(/\/w\/ws-1\/gateway-activity(?:[/?#]|$)/);
    await expect(page.locator('[data-workstation-surface-view="gatewayActivity"]')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Connect a computer' })).toBeVisible();
  });
});

test.describe('Agent Computer policy settings', () => {
  test('shows the three access modes and saves Custom policy fields', async ({ page }) => {
    const mock = await mockAgentComputerSettings(page);
    await loginAsOwner(page);

    await page.goto('/w/ws-1/settings?section=devices');

    await expect(page.getByRole('heading', { name: /^Agent Computer$/ })).toBeVisible();
    await expect(page.getByText('Selected local runtime for Sage.')).toBeVisible();
    await expect(page.getByText('Guarded until saved')).toBeVisible();

    await page.getByRole('button', { name: 'Manage computer' }).click();
    await page.getByRole('button', { name: 'Manual setup' }).click();

    const runtimeMode = page.getByLabel('Runtime mode');
    const modeLabels = await runtimeMode.locator('option').allTextContents();
    expect(modeLabels).toEqual(expect.arrayContaining(['Default Guarded', 'Autonomous Full Access', 'Custom']));

    await expect(page.getByText('Custom access policy')).toBeVisible();
    await expect(page.getByLabel('Terminal policy')).toBeVisible();
    await expect(page.getByLabel('Network policy')).toBeVisible();
    await expect(page.getByLabel('Browser access')).toBeVisible();
    await expect(page.getByLabel('App access')).toBeVisible();

    await page.getByRole('textbox', { name: /Allowed folders/i }).fill('/Users/mansur/Projects');
    await page.getByRole('button', { name: 'Add folder' }).click();
    await page.getByRole('textbox', { name: /Blocked folders/i }).fill('/Users/mansur/Projects/secrets');
    await page.getByRole('button', { name: 'Block folder' }).click();
    await page.getByPlaceholder('example.com').fill('api.example.com');
    await page.getByRole('button', { name: 'Add domain' }).click();
    await page.getByLabel('Max runtime seconds').fill('3600');
    await page.getByLabel('Max budget dollars').fill('5');

    await page.getByRole('button', { name: 'Save custom policy' }).click();

    await expect.poll(() => mock.savedPolicy()).not.toBeNull();
    await expect(page.getByText('Custom saved').first()).toBeVisible();
    expect(mock.savedPolicy()).toMatchObject({
      autonomy_mode: 'trusted_workstation',
      filesystem_scope: ['/Users/mansur/Projects'],
      blocked_filesystem_scope: ['/Users/mansur/Projects/secrets'],
      domain_allowlist: ['api.example.com'],
      max_runtime_seconds: 3600,
      max_budget_cents: 500,
    });
  });
});
