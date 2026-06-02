import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  changedPathsSince,
  eligibleScopes,
  isChangedEligible,
} from '../scope-select/eligibility.js';

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
