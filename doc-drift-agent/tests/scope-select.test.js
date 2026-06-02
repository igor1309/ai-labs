import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selectScopes } from '../scope-select/select.js';

test('selectScopes returns changed scopes before stale ones', () => {
  const scopeIds = ['a', 'b'];
  const changed = new Set(['b']);
  const stale = new Set(['a']);
  assert.deepEqual(
    selectScopes({ scopeIds, state: {}, changed, stale, budget: 2 }),
    ['b', 'a'],
  );
});

test('selectScopes caps the result at the budget', () => {
  const scopeIds = ['a', 'b', 'c'];
  const changed = new Set(['a', 'b', 'c']);
  assert.deepEqual(
    selectScopes({ scopeIds, state: {}, changed, stale: new Set(), budget: 2 }),
    ['a', 'b'],
  );
});

test('selectScopes orders least-recently-audited first within a class', () => {
  const scopeIds = ['a', 'b'];
  const state = {
    a: { lastAuditedAt: '2026-06-02T00:00:00Z' },
    b: { lastAuditedAt: '2026-06-01T00:00:00Z' },
  };
  const changed = new Set(['a', 'b']);
  assert.deepEqual(
    selectScopes({ scopeIds, state, changed, stale: new Set(), budget: 2 }),
    ['b', 'a'],
  );
});

test('selectScopes returns an empty array when nothing is eligible', () => {
  assert.deepEqual(
    selectScopes({ scopeIds: ['a'], state: {}, changed: new Set(), stale: new Set(), budget: 1 }),
    [],
  );
});

test('selectScopes is idempotent and leaves overflow eligible for the next run', () => {
  const scopeIds = ['a', 'b'];
  const changed = new Set(['a', 'b']);
  const args = { scopeIds, state: {}, changed, stale: new Set(), budget: 1 };
  assert.deepEqual(selectScopes(args), selectScopes(args));
});

test('selectScopes orders by instant, not raw string', () => {
  const scopeIds = ['a', 'b'];
  const state = {
    a: { lastAuditedAt: '2026-06-02T05:00:00+09:00' }, // earlier instant
    b: { lastAuditedAt: '2026-06-02T00:00:00Z' },
  };
  assert.deepEqual(
    selectScopes({ scopeIds, state, changed: new Set(['a', 'b']), stale: new Set(), budget: 1 }),
    ['a'],
  );
});
