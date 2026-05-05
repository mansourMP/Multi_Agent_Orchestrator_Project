// @ts-nocheck
import { expect, test } from '@playwright/test';

import { loginAsOwner } from './support/auth';

type GatewayStateMode = 'not_connected' | 'online' | 'revoked' | 'reconnecting';

function buildGatewayRegistration(mode: Exclude<GatewayStateMode, 'not_connected'>) {
  const status =
    mode === 'online'
      ? 'online'
      : mode === 'revoked'
        ? 'revoked'
        : 'reconnecting';
  const trust =
    mode === 'revoked'
      ? 'revoked'
      : 'trusted';
  return {
    gateway_id: 'gateway-1',
    display_name: 'Mansur MacBook Pro',
    platform: 'macos',
    status,
    connection_status: status,
    device_trust_state: trust,
    capabilities: [
      'filesystem.read_write',
      'shell.execute',
      'browser.observe',
      'screenshot.capture',
      'clipboard.read',
      'channel.telegram.personal.outbound',
      'channel.whatsapp.personal.outbound',
      'ollama.local',
    ],
    last_seen_at: '2026-05-05T12:00:00Z',
  };
}

function buildDoctor(mode: Exclude<GatewayStateMode, 'not_connected'>) {
  const status =
    mode === 'online'
      ? 'healthy'
      : mode === 'revoked'
        ? 'blocked'
        : 'reconnecting';
  return {
    status,
    checkpoint: {
      status: mode === 'online' ? 'healthy' : 'degraded',
      summary: mode === 'online' ? 'Checkpoint is current.' : 'Checkpoint is waiting for the companion to reconnect.',
    },
    browser: {
      status: mode === 'online' ? 'healthy' : 'pending',
      summary: mode === 'online' ? 'Browser lane is ready.' : 'Browser lane is waiting for reconnect.',
    },
    providers: {
      status: mode === 'online' ? 'healthy' : 'pending',
      summary: mode === 'online' ? 'Local Ollama is reachable.' : 'Provider checks will resume after reconnect.',
      items: [
        {
          id: 'ollama',
          label: 'Ollama',
          state: mode === 'online' ? 'connected' : 'configured',
        },
      ],
    },
    specialists: {
      status: 'healthy',
      summary: 'Build assistants can still route through the control plane.',
      items: [],
    },
    quota: {
      status: 'healthy',
      summary: 'No local quota issue reported.',
    },
    checks: [
      {
        id: 'gateway',
        status,
        summary: mode === 'online'
          ? 'This computer is ready.'
          : mode === 'revoked'
            ? 'Access was revoked.'
            : 'Reconnect is in progress.',
      },
    ],
  };
}

async function stubGatewayOperatorState(page, mode: GatewayStateMode) {
  await page.route('**/api/gateway/registrations?workspace_id=ws-1', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items: mode === 'not_connected' ? [] : [buildGatewayRegistration(mode)],
      }),
    });
  });

  await page.route('**/api/gateway/registrations/gateway-1/doctor**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(buildDoctor(mode as Exclude<GatewayStateMode, 'not_connected'>)),
    });
  });

  await page.route('**/api/gateway/registrations/gateway-1/approvals', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ pending_count: 0, retryable_count: 0, items: [] }),
    });
  });

  await page.route('**/api/gateway/registrations/gateway-1/browser/sessions', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [] }),
    });
  });

  await page.route('**/api/personal-channels/whatsapp/gateways/gateway-1', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        state: {
          status: mode === 'online' ? 'connected' : 'idle',
          linked_name: mode === 'online' ? 'Mansur WhatsApp' : null,
        },
      }),
    });
  });

  await page.route('**/api/personal-channels/telegram/gateways/gateway-1', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        state: {
          status: mode === 'online' ? 'connected' : 'idle',
          linked_name: mode === 'online' ? 'Mansur Telegram' : null,
        },
      }),
    });
  });
}

test.describe('gateway operator productization', () => {
  test('not connected state is compact and keeps setup behind Manage', async ({ page }) => {
    await stubGatewayOperatorState(page, 'not_connected');
    await loginAsOwner(page);
    await page.goto('/w/ws-1/gateway');

    const operatorSurface = page
      .locator('.app-surface-card')
      .filter({ has: page.getByRole('heading', { name: /^This Mac$/i }) })
      .first();

    await expect(page.getByRole('heading', { name: /^This Mac$/i })).toBeVisible();
    await expect(operatorSurface).toContainText(/Not connected/i);
    await expect(page.locator('.app-surface-stat').filter({ hasText: 'State' })).toContainText('Not connected');
    await expect(operatorSurface.getByRole('button', { name: /^Manage$/i })).toBeVisible();
    await expect(operatorSurface).not.toContainText('Files');
    await expect(operatorSurface).not.toContainText('Telegram');
    await expect(operatorSurface).not.toContainText('WhatsApp');
    await expect(operatorSurface).not.toContainText('Advanced terminal setup');

    await operatorSurface.getByRole('button', { name: /^Manage$/i }).click();
    await expect(page.getByRole('dialog')).toContainText('Manage this computer');
    await expect(page.getByRole('button', { name: /^Connect this computer$/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Manual setup$/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Advanced diagnostics$/i })).toBeVisible();
  });

  test('manual setup reveals pairing copy and command flow only after Manage', async ({ page }) => {
    await stubGatewayOperatorState(page, 'not_connected');
    await page.route('**/api/gateway/pairings/intents', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          pairing_token: 'pair_12345678',
          expires_at: '2026-05-05T13:00:00Z',
          display_name: 'Mansur MacBook Pro',
          platform: 'macos',
        }),
      });
    });

    await loginAsOwner(page);
    await page.goto('/w/ws-1/gateway');

    const operatorSurface = page
      .locator('.app-surface-card')
      .filter({ has: page.getByRole('heading', { name: /^This Mac$/i }) })
      .first();

    await expect(page.getByText(/advanced terminal setup/i)).toHaveCount(0);
    await operatorSurface.getByRole('button', { name: /^Manage$/i }).click();
    await page.getByRole('button', { name: /^Manual setup$/i }).click();

    await expect(page.locator('.app-surface-stat').filter({ hasText: 'State' })).toContainText('Pairing');
    await expect(page.getByText(/advanced terminal setup/i)).toBeVisible();
    await expect(page.getByText(/run on this computer/i)).toBeVisible();
  });

  test('online state shows device trust first and hides capability groups by default', async ({ page }) => {
    await stubGatewayOperatorState(page, 'online');
    await loginAsOwner(page);
    await page.goto('/w/ws-1/gateway');

    const operatorSurface = page
      .locator('.app-surface-card')
      .filter({ has: page.getByRole('heading', { name: /^This Mac$/i }) })
      .first();

    await expect(page.getByRole('heading', { name: /^This Mac$/i })).toBeVisible();
    await expect(operatorSurface).toContainText(/Online/i);
    await expect(operatorSurface).toContainText(/Verified/i);
    await expect(page.locator('.app-surface-stat').filter({ hasText: 'State' })).toContainText('Online');
    await expect(operatorSurface.getByRole('button', { name: /^Manage$/i })).toBeVisible();
    await expect(operatorSurface).not.toContainText('Telegram');
    await expect(operatorSurface).not.toContainText('WhatsApp');
    await expect(operatorSurface).not.toContainText('Ollama');
    await expect(operatorSurface).toContainText('Last seen');

    await operatorSurface.getByRole('button', { name: /^Manage$/i }).click();
    await expect(page.getByRole('button', { name: /^Reconnect$/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Revoke access$/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Manual setup$/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Advanced diagnostics$/i })).toBeVisible();

    await page.getByRole('button', { name: /^Advanced diagnostics$/i }).click();
    await expect(operatorSurface).toContainText('Telegram');
    await expect(operatorSurface).toContainText('WhatsApp');
    await expect(operatorSurface).toContainText('Ollama');
  });

  test('revoked state keeps reconnect behind Manage', async ({ page }) => {
    await stubGatewayOperatorState(page, 'revoked');
    await loginAsOwner(page);
    await page.goto('/w/ws-1/gateway');

    const operatorSurface = page
      .locator('.app-surface-card')
      .filter({ has: page.getByRole('heading', { name: /^This Mac$/i }) })
      .first();

    await expect(page.locator('.app-surface-stat').filter({ hasText: 'State' })).toContainText('Revoked');
    await expect(operatorSurface.getByRole('button', { name: /^Manage$/i })).toBeVisible();
    await expect(operatorSurface).toContainText('Access from this computer was revoked');
    await operatorSurface.getByRole('button', { name: /^Manage$/i }).click();
    await expect(page.getByRole('button', { name: /^Reconnect$/i })).toBeVisible();
  });

  test('reconnecting state keeps reconnect behind Manage', async ({ page }) => {
    await stubGatewayOperatorState(page, 'reconnecting');
    await loginAsOwner(page);
    await page.goto('/w/ws-1/gateway');

    const operatorSurface = page
      .locator('.app-surface-card')
      .filter({ has: page.getByRole('heading', { name: /^This Mac$/i }) })
      .first();

    await expect(page.locator('.app-surface-stat').filter({ hasText: 'State' })).toContainText('Reconnecting');
    await expect(operatorSurface.getByRole('button', { name: /^Manage$/i })).toBeVisible();
    await expect(operatorSurface).toContainText('reconnecting or waiting for the local companion');
    await operatorSurface.getByRole('button', { name: /^Manage$/i }).click();
    await expect(page.getByRole('button', { name: /^Reconnect$/i })).toBeVisible();
  });
});
