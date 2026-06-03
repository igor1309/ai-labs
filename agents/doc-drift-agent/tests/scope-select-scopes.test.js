import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadScopeIds } from '../scope-select/scopes.js';

test('loadScopeIds returns scope ids in registry order', () => {
  const registry = { scopes: { readmes: {}, oracle: {}, nomos: {} } };
  assert.deepEqual(loadScopeIds(registry), ['readmes', 'oracle', 'nomos']);
});
