import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const selectCli = fileURLToPath(
  new URL('../scope-select/select-cli.js', import.meta.url),
);
const commitCli = fileURLToPath(
  new URL('../scope-select/commit-cli.js', import.meta.url),
);

async function withRegistryAndState(run) {
  const dir = await mkdtemp(join(tmpdir(), 'scope-select-cli-'));
  const registry = join(dir, 'registry.json');
  await writeFile(registry, JSON.stringify({ scopes: { readmes: {}, oracle: {} } }));
  const state = join(dir, 'state.json');
  try {
    return await run({ registry, state });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('select CLI prints the chosen scope id', async () => {
  await withRegistryAndState(({ registry, state }) => {
    const res = spawnSync(
      'node',
      [selectCli, '--registry', registry, '--state', state],
      { encoding: 'utf8' },
    );
    assert.equal(res.stdout.trim(), 'readmes');
  });
});

test('commit CLI records the audit so the next selection moves on', async () => {
  await withRegistryAndState(({ registry, state }) => {
    spawnSync(
      'node',
      [commitCli, '--registry', registry, '--scope', 'readmes', '--commit', 'abc', '--at', '2026-06-02T00:00:00Z', '--state', state],
      { encoding: 'utf8' },
    );
    const res = spawnSync(
      'node',
      [selectCli, '--registry', registry, '--state', state],
      { encoding: 'utf8' },
    );
    assert.equal(res.stdout.trim(), 'oracle');
  });
});
