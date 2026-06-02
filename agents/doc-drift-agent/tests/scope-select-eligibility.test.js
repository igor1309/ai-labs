import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  changedPathsSince,
  eligibleScopes,
  isChangedEligible,
  isStaleEligible,
  staleScopes,
} from '../scope-select/eligibility.js';

const DAY = 86400000;
const NOW = Date.parse('2026-06-30T00:00:00Z');

test('isChangedEligible is true when the scope has changed paths', () => {
  assert.equal(
    isChangedEligible({ lastAuditedCommit: 'abc', changedPaths: ['oracle/README.md'] }),
    true,
  );
});

test('isChangedEligible is false when nothing changed since the last audit', () => {
  assert.equal(
    isChangedEligible({ lastAuditedCommit: 'abc', changedPaths: [] }),
    false,
  );
});

test('isChangedEligible is true on a first audit (no prior commit)', () => {
  assert.equal(
    isChangedEligible({ lastAuditedCommit: null, changedPaths: [] }),
    true,
  );
});

test('isChangedEligible is true when the last-audited commit is unreachable', () => {
  assert.equal(
    isChangedEligible({ lastAuditedCommit: 'gone', changedPaths: null }),
    true,
  );
});

test('changedPathsSince returns the changed files reported by git', () => {
  const runGit = () => ({ status: 0, stdout: 'oracle/README.md\noracle/docs/x.md\n' });
  assert.deepEqual(
    changedPathsSince({ commit: 'abc', paths: ['oracle/README.md'], runGit }),
    ['oracle/README.md', 'oracle/docs/x.md'],
  );
});

test('changedPathsSince returns null when git fails (unreachable commit)', () => {
  const runGit = () => ({ status: 128, stdout: '' });
  assert.equal(
    changedPathsSince({ commit: 'gone', paths: ['oracle/README.md'], runGit }),
    null,
  );
});

test('changedPathsSince diffs the scope paths against HEAD since the commit', () => {
  let received;
  const runGit = (args) => {
    received = args;
    return { status: 0, stdout: '' };
  };
  changedPathsSince({ commit: 'abc', paths: ['oracle/README.md', 'oracle/docs/**/*.md'], runGit });
  assert.deepEqual(received, [
    'diff',
    '--name-only',
    'abc',
    'HEAD',
    '--',
    'oracle/README.md',
    'oracle/docs/**/*.md',
  ]);
});

test('eligibleScopes includes changed, first-audit and unreachable scopes; excludes unchanged', () => {
  const registry = {
    scopes: {
      changed: { docs: ['changed/**'] },
      unchanged: { docs: ['unchanged/**'] },
      gone: { docs: ['gone/**'] },
      fresh: { docs: ['fresh/**'] },
    },
  };
  const state = {
    changed: { lastAuditedCommit: 'c1' },
    unchanged: { lastAuditedCommit: 'u1' },
    gone: { lastAuditedCommit: 'g1' },
    // `fresh` has no entry -> first audit
  };
  const runGit = (args) => {
    const commit = args[2];
    if (commit === 'c1') return { status: 0, stdout: 'changed/README.md\n' };
    if (commit === 'u1') return { status: 0, stdout: '' };
    return { status: 128, stdout: '' }; // g1 unreachable
  };
  const eligible = eligibleScopes({
    scopeIds: ['changed', 'unchanged', 'gone', 'fresh'],
    registry,
    state,
    runGit,
  });
  assert.deepEqual([...eligible].sort(), ['changed', 'fresh', 'gone']);
});

test('isStaleEligible is true when never audited', () => {
  assert.equal(isStaleEligible({ lastAuditedAt: null, now: NOW, windowMs: 7 * DAY }), true);
});

test('isStaleEligible is true at the window boundary (audited exactly window ago)', () => {
  const lastAuditedAt = new Date(NOW - 7 * DAY).toISOString();
  assert.equal(isStaleEligible({ lastAuditedAt, now: NOW, windowMs: 7 * DAY }), true);
});

test('isStaleEligible is false when audited within the window', () => {
  const lastAuditedAt = new Date(NOW - 7 * DAY + 1).toISOString();
  assert.equal(isStaleEligible({ lastAuditedAt, now: NOW, windowMs: 7 * DAY }), false);
});

test('staleScopes uses the default window when there is no per-scope override', () => {
  const registry = { scopes: { a: {}, b: {} } };
  const state = {
    a: { lastAuditedAt: new Date(NOW - 10 * DAY).toISOString() },
    b: { lastAuditedAt: new Date(NOW - 1 * DAY).toISOString() },
  };
  const stale = staleScopes({ scopeIds: ['a', 'b'], state, now: NOW, windowMs: 7 * DAY, registry });
  assert.deepEqual([...stale], ['a']);
});

test('staleScopes honors a per-scope staleness window override', () => {
  const registry = { scopes: { a: { stalenessDays: 1 } } };
  const state = { a: { lastAuditedAt: new Date(NOW - 2 * DAY).toISOString() } };
  const stale = staleScopes({ scopeIds: ['a'], state, now: NOW, windowMs: 7 * DAY, registry });
  assert.deepEqual([...stale], ['a']);
});
