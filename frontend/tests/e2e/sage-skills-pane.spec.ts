// @ts-nocheck
import { expect, test } from '@playwright/test';

import { loginAsOwner } from './support/auth';

test.describe('sage skills pane', () => {
  test('shows the curated pack first with truthful states', async ({ page }) => {
    await page.route('**/api/sage-skills?workspace_id=ws-1', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          workspace_id: 'ws-1',
          tenant_id: 'tenant-1',
          summary: {
            total_count: 5,
            ready_count: 1,
            needs_setup_count: 2,
            unsupported_count: 1,
            disabled_count: 1,
          },
          curated_pack: [
            {
              id: '1password',
              name: '1Password',
              description: 'Use vault items and saved credentials without pasting secrets into chat.',
              what_it_does: 'Look up vault items and keep secret handling on the paired computer.',
              status: 'ready',
              status_label: 'Ready',
              active_now: true,
              curated: true,
              curated_rank: 0,
              setup_requirement: 'Install and unlock 1Password on this Mac, then enable the 1Password skill for Sage through Gateway.',
            },
            {
              id: 'apple-notes',
              name: 'Apple Notes',
              description: 'Read and organize personal notes from Apple Notes on the paired Mac.',
              what_it_does: 'Read note content and use Apple Notes as a trusted local reference surface.',
              status: 'needs_setup',
              status_label: 'Needs setup',
              active_now: false,
              curated: true,
              curated_rank: 1,
              setup_requirement: 'Use a paired Mac with Apple Notes available through Gateway, then enable the Apple Notes skill.',
            },
            {
              id: 'apple-reminders',
              name: 'Apple Reminders',
              description: 'Review and manage reminders from Apple Reminders on the paired Mac.',
              what_it_does: 'Read reminder lists and update personal tasks through Apple Reminders.',
              status: 'unsupported_device',
              status_label: 'Unsupported on this device',
              active_now: false,
              curated: true,
              curated_rank: 2,
              setup_requirement: 'Use a paired Mac with Apple Reminders available through Gateway, then enable the Apple Reminders skill.',
            },
            {
              id: 'tmux',
              name: 'tmux',
              description: 'Inspect and manage terminal sessions without losing long-running local work.',
              what_it_does: 'Attach to persistent shell sessions and resume local terminal work safely.',
              status: 'disabled_policy',
              status_label: 'Disabled by policy',
              active_now: false,
              curated: true,
              curated_rank: 3,
              setup_requirement: 'Install tmux on this computer and expose the required local runtime access before Sage can use persistent terminal sessions.',
            },
          ],
          items: [
            {
              id: '1password',
              name: '1Password',
              description: 'Use vault items and saved credentials without pasting secrets into chat.',
              what_it_does: 'Look up vault items and keep secret handling on the paired computer.',
              status: 'ready',
              status_label: 'Ready',
              active_now: true,
              curated: true,
              curated_rank: 0,
              setup_requirement: 'Install and unlock 1Password on this Mac, then enable the 1Password skill for Sage through Gateway.',
            },
            {
              id: 'apple-notes',
              name: 'Apple Notes',
              description: 'Read and organize personal notes from Apple Notes on the paired Mac.',
              what_it_does: 'Read note content and use Apple Notes as a trusted local reference surface.',
              status: 'needs_setup',
              status_label: 'Needs setup',
              active_now: false,
              curated: true,
              curated_rank: 1,
              setup_requirement: 'Use a paired Mac with Apple Notes available through Gateway, then enable the Apple Notes skill.',
            },
            {
              id: 'apple-reminders',
              name: 'Apple Reminders',
              description: 'Review and manage reminders from Apple Reminders on the paired Mac.',
              what_it_does: 'Read reminder lists and update personal tasks through Apple Reminders.',
              status: 'unsupported_device',
              status_label: 'Unsupported on this device',
              active_now: false,
              curated: true,
              curated_rank: 2,
              setup_requirement: 'Use a paired Mac with Apple Reminders available through Gateway, then enable the Apple Reminders skill.',
            },
            {
              id: 'tmux',
              name: 'tmux',
              description: 'Inspect and manage terminal sessions without losing long-running local work.',
              what_it_does: 'Attach to persistent shell sessions and resume local terminal work safely.',
              status: 'disabled_policy',
              status_label: 'Disabled by policy',
              active_now: false,
              curated: true,
              curated_rank: 3,
              setup_requirement: 'Install tmux on this computer and expose the required local runtime access before Sage can use persistent terminal sessions.',
            },
            {
              id: 'browser',
              name: 'Browser',
              description: 'Open a page in the browser runtime and return the current page state.',
              what_it_does: 'Use the browser runtime for general web work.',
              status: 'ready',
              status_label: 'Ready',
              active_now: true,
              curated: false,
              setup_requirement: 'Ready now.',
            },
          ],
        }),
      });
    });

    await loginAsOwner(page);
    await page.goto('/w/ws-1/skills');

    await expect(page.getByText(/curated skills/i)).toBeVisible();
    const curatedCard = page.locator('.app-surface-card').filter({ has: page.getByText(/curated skills/i) }).first();
    const curatedText = await curatedCard.textContent();
    expect(curatedText.indexOf('1Password')).toBeLessThan(curatedText.indexOf('Apple Notes'));
    expect(curatedText.indexOf('Apple Notes')).toBeLessThan(curatedText.indexOf('Apple Reminders'));
    expect(curatedText.indexOf('Apple Reminders')).toBeLessThan(curatedText.indexOf('tmux'));
    await expect(curatedCard).toContainText('Ready');
    await expect(curatedCard).toContainText('Needs setup');
    await expect(curatedCard).toContainText('Unsupported on this device');
    await expect(curatedCard).toContainText('Disabled by policy');
    await expect(page.getByText(/other installed skills/i)).toBeVisible();
    const otherInstalledCard = page.locator('.app-surface-card').filter({ has: page.getByText(/other installed skills/i) }).first();
    await expect(otherInstalledCard).toContainText('Browser');
  });
});
