import test from 'node:test';
import assert from 'node:assert/strict';

import { shouldUseDurableRunForTaskRequest } from './primaryRunPath.js';

test('promotes serious task requests to the durable run path', () => {
  assert.equal(
    shouldUseDurableRunForTaskRequest('Research the release blockers and draft a summary.'),
    true,
  );
});

test('keeps lightweight question prompts on the direct chat path', () => {
  assert.equal(
    shouldUseDurableRunForTaskRequest('What model are you using right now?'),
    false,
  );
});

test('keeps short conversational prompts on the direct chat path', () => {
  assert.equal(
    shouldUseDurableRunForTaskRequest('hello there'),
    false,
  );
});
