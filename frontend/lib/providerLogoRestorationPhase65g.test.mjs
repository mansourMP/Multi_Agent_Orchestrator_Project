import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const source = readFileSync(
  new URL('../components/orion/connections/ConnectionMarks.tsx', import.meta.url),
  'utf8',
);

test('provider logo assets exist for the primary AI providers', () => {
  const requiredAssets = [
    'openai.svg',
    'anthropic.svg',
    'gemini.svg',
    'vertex.svg',
  ];

  for (const asset of requiredAssets) {
    const assetUrl = new URL(`../public/provider-logos/${asset}`, import.meta.url);
    assert.equal(existsSync(assetUrl), true, `Expected provider logo asset ${asset} to exist.`);
  }
});

test('provider logo marks use real provider assets instead of inline placeholder branches', () => {
  assert.match(source, /const PROVIDER_VISUALS:/);
  assert.match(source, /openai:\s*\{[\s\S]*?assetSrc:\s*'\/provider-logos\/openai\.svg'/);
  assert.match(source, /'openai-codex':\s*\{[\s\S]*?assetSrc:\s*'\/provider-logos\/openai\.svg'/);
  assert.match(source, /anthropic:\s*\{[\s\S]*?assetSrc:\s*'\/provider-logos\/anthropic\.svg'/);
  assert.match(source, /gemini:\s*\{[\s\S]*?assetSrc:\s*'\/provider-logos\/gemini\.svg'/);
  assert.match(source, /vertex:\s*\{[\s\S]*?assetSrc:\s*'\/provider-logos\/vertex\.svg'/);
  assert.match(source, /<img[\s\S]*src=\{visual\.assetSrc\}/);

  assert.doesNotMatch(source, /if \(provider === 'openai'/);
  assert.doesNotMatch(source, /if \(provider === 'anthropic'/);
  assert.doesNotMatch(source, /if \(provider === 'gemini'/);
  assert.doesNotMatch(source, /if \(provider === 'vertex'/);
});

test('connector logo marks remain separate from provider logo assets', () => {
  const connectorSection = source.slice(source.indexOf('export function ConnectorLogoMark'));

  assert.match(connectorSection, /if \(id === 'google_workspace'/);
  assert.match(connectorSection, /if \(id === 'telegram_bot'/);
  assert.doesNotMatch(connectorSection, /\/provider-logos\//);
});
