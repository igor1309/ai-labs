import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selectScope } from '../scope-select/select.js';

test('selectScope returns the first scope when none audited yet', () => {
  const scopeIds = ['readmes', 'oracle', 'nomos'];
  assert.equal(selectScope({ scopeIds, state: {} }), 'readmes');
});

test('selectScope prefers a never-audited scope over an audited one', () => {
  const scopeIds = ['readmes', 'oracle', 'nomos'];
  const state = { readmes: { lastAuditedAt: '2026-06-02T00:00:00Z' } };
  assert.equal(selectScope({ scopeIds, state }), 'oracle');
});

test('selectScope picks the least-recently-audited scope when all are audited', () => {
  const scopeIds = ['readmes', 'oracle'];
  const state = {
    readmes: { lastAuditedAt: '2026-06-02T10:00:00Z' },
    oracle: { lastAuditedAt: '2026-06-01T10:00:00Z' },
  };
  assert.equal(selectScope({ scopeIds, state }), 'oracle');
});

test('selectScope returns null when there are no scopes', () => {
  assert.equal(selectScope({ scopeIds: [], state: {} }), null);
});

test('selectScope returns the only scope when one is registered', () => {
  assert.equal(selectScope({ scopeIds: ['oracle'], state: {} }), 'oracle');
});

test('selectScope ignores state for scopes no longer in the registry', () => {
  const scopeIds = ['oracle'];
  const state = {
    removed: { lastAuditedAt: '2099-01-01T00:00:00Z' },
    oracle: { lastAuditedAt: '2026-06-01T10:00:00Z' },
  };
  assert.equal(selectScope({ scopeIds, state }), 'oracle');
});
