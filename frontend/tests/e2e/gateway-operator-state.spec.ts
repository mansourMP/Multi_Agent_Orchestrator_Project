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
  test('legacy My Computer route redirects to the Hardware surface', async ({ page }) => {
    await loginAsOwner(page);

    await page.goto('/w/ws-1/gateway');

    await expect(page).toHaveURL(/\/w\/ws-1\/hardware(?:[/?#]|$)/);
    await expect(page.getByRole('heading', { name: /^Hardware$/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /^My Computer$/ })).toHaveCount(0);
  });

  test('legacy gateway detail aliases redirect to the Hardware surface', async ({ page }) => {
    await loginAsOwner(page);

    await page.goto('/w/ws-1/gateway-approvals');
    await expect(page).toHaveURL(/\/w\/ws-1\/hardware(?:[/?#]|$)/);
    await expect(page.getByRole('heading', { name: /^Hardware$/ })).toBeVisible();

    await page.goto('/w/ws-1/gateway-activity');
    await expect(page).toHaveURL(/\/w\/ws-1\/hardware(?:[/?#]|$)/);
    await expect(page.getByRole('heading', { name: /^Hardware$/ })).toBeVisible();
  });
});

test.describe('Agent Computer policy settings', () => {
  test('routes Agent Computer management to the Hardware surface', async ({ page }) => {
    await mockAgentComputerSettings(page);
    await loginAsOwner(page);

    await page.goto('/w/ws-1/hardware');

    await expect(page).toHaveURL(/\/w\/ws-1\/hardware$/);
    await expect(page.getByRole('heading', { name: /^Hardware$/ })).toBeVisible();
    await expect(page.getByText('The computers Empyralis can use.')).toBeVisible();
    await expect(page.getByRole('button', { name: /^Connect$/ }).first()).toBeVisible();
  });

  test('Cloud VPS setup flow uses server regions and full-access pairing metadata', async ({ page }) => {
    await mockAgentComputerSettings(page);
    let provisionBody = null;

    await page.route('**/api/hardware/vps/regions?provider=digitalocean', async (route) => {
      await route.fulfill({
        json: {
          provider: 'digitalocean',
          label: 'DigitalOcean',
          default_region: 'nyc3',
          default_size: 's-1vcpu-2gb',
          regions: [
            { id: 'nyc3', label: 'New York 3' },
            { id: 'sfo3', label: 'San Francisco 3' },
          ],
        },
      });
    });
    await page.route('**/api/hardware/vps/provision', async (route) => {
      provisionBody = route.request().postDataJSON();
      await route.fulfill({
        json: {
          pairing_token: 'pair_test',
          vps_id: 'vps_1',
          provider_resource_id: 'do-1',
          public_ip: '203.0.113.10',
          status: 'provisioning',
        },
      });
    });
    await page.route('**/api/hardware/vps/vps_1/status', async (route) => {
      await route.fulfill({
        json: {
          vps_id: 'vps_1',
          provider: 'digitalocean',
          provider_resource_id: 'do-1',
          public_ip: '203.0.113.10',
          region: 'sfo3',
          size: 's-1vcpu-2gb',
          status: 'registering',
        },
      });
    });
    await loginAsOwner(page);

    await page.goto('/w/ws-1/hardware');
    await page.getByRole('button', { name: /^Connect$/ }).first().click();
    await page.getByRole('button', { name: /^Choose provider$/ }).click();
    await page.getByRole('button', { name: /DigitalOcean/ }).click();
    await expect(page.getByLabel('DigitalOcean PAT')).toBeVisible();

    await page.getByLabel('DigitalOcean PAT').fill('do_test_token');
    await page.getByRole('button', { name: /^Next$/ }).click();
    await expect(page.getByLabel('Region')).toHaveValue('nyc3');
    await page.getByLabel('Region').selectOption('sfo3');
    await page.getByRole('button', { name: /^Next$/ }).click();

    await expect(page.getByText('DigitalOcean')).toBeVisible();
    await expect(page.getByText('San Francisco 3 · sfo3')).toBeVisible();
    await expect(page.getByText('Sage will have Full Access on this dedicated Agent Computer.')).toBeVisible();
    await page.getByRole('button', { name: /^Create Agent Computer$/ }).click();

    await expect(page.getByText('Installing software...')).toBeVisible();
    expect(provisionBody).toMatchObject({
      workspace_id: 'ws-1',
      provider: 'digitalocean',
      credentials: { api_token: 'do_test_token' },
      region: 'sfo3',
      size: 's-1vcpu-2gb',
      runtime_access_mode: 'full_access',
      autonomous_agent_setup_warning_acknowledged: true,
      metadata: {
        autonomous_agent_setup_warning_version: '2026-06-06',
      },
    });
  });
});
