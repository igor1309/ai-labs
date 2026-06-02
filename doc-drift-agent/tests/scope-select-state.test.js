import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  commitScope,
  pruneState,
  readState,
  writeStateAtomic,
} from '../scope-select/state.js';

async function withTempDir(run) {
  const dir = await mkdtemp(join(tmpdir(), 'scope-select-'));
  try {
    return await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('commitScope records only the last-audited commit and timestamp for a scope', () => {
  const next = commitScope(
    {},
    { scopeId: 'oracle', commit: 'abc123', at: '2026-06-02T01:00:00Z' },
  );
  assert.deepEqual(next.oracle, {
    lastAuditedCommit: 'abc123',
    lastAuditedAt: '2026-06-02T01:00:00Z',
  });
});

test('commitScope preserves other scopes already in the state', () => {
  const before = {
    readmes: { lastAuditedCommit: 'old', lastAuditedAt: '2026-06-01T00:00:00Z' },
  };
  const next = commitScope(before, {
    scopeId: 'oracle',
    commit: 'abc',
    at: '2026-06-02T00:00:00Z',
  });
  assert.deepEqual(next.readmes, before.readmes);
});

test('pruneState drops entries for scopes not in the registry', () => {
  const state = {
    oracle: { lastAuditedCommit: 'a', lastAuditedAt: '2026-06-02T00:00:00Z' },
    removed: { lastAuditedCommit: 'b', lastAuditedAt: '2026-06-01T00:00:00Z' },
  };
  assert.deepEqual(pruneState(state, ['oracle']), {
    oracle: { lastAuditedCommit: 'a', lastAuditedAt: '2026-06-02T00:00:00Z' },
  });
});

test('readState returns an empty state when the file is absent (all stale)', async () => {
  await withTempDir(async (dir) => {
    assert.deepEqual(await readState(join(dir, 'missing.json')), {});
  });
});

test('writeStateAtomic then readState round-trips the state', async () => {
  await withTempDir(async (dir) => {
    const path = join(dir, 'state.json');
    const state = {
      oracle: { lastAuditedCommit: 'abc', lastAuditedAt: '2026-06-02T00:00:00Z' },
    };
    await writeStateAtomic(path, state);
    assert.deepEqual(await readState(path), state);
  });
});
