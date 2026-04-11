import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('frontend runtime config accepts both startup env names and derives websocket url', () => {
  const source = readFileSync(new URL('./config.ts', import.meta.url), 'utf8');

  assert.match(source, /NEXT_PUBLIC_API_URL/);
  assert.match(source, /NEXT_PUBLIC_ORION_API_URL/);
  assert.match(source, /NEXT_PUBLIC_WS_URL/);
  assert.match(source, /wss:\/\//);
  assert.match(source, /ws:\/\//);
});

test('stack helper exports both runtime env names for the frontend shell', () => {
  const source = readFileSync(
    new URL('../../scripts/start_orion_local_stack.sh', import.meta.url),
    'utf8',
  );

  assert.match(source, /NEXT_PUBLIC_API_URL="\$\{ORION_API_URL\}"/);
  assert.match(source, /NEXT_PUBLIC_ORION_API_URL="\$\{ORION_API_URL\}"/);
  assert.match(source, /NEXT_PUBLIC_WS_URL="\$\{ORION_WS_URL\}"/);
});

test('stack helper bootstraps node or npm before launching web services', () => {
  const source = readFileSync(
    new URL('../../scripts/start_orion_local_stack.sh', import.meta.url),
    'utf8',
  );

  assert.match(source, /bootstrap_node_toolchain_path/);
  assert.match(source, /npm is not on PATH/);
  assert.match(source, /node is not on PATH/);
});
