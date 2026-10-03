import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { it } from 'node:test';

const SCRIPT = resolve('scripts/watch-pr.sh');

// withFakeGh runs fn in a temp git repository with a fake gh first on PATH.
// The fake answers its first `pending` calls with gh's "no checks reported"
// failure, then exits with `final` after printing `finalOutput`.
function withFakeGh({ pending, final, finalOutput }, fn) {
  const dir = mkdtempSync(join(tmpdir(), 'watch-pr-test-'));
  try {
    execFileSync('git', ['init', '-q'], { cwd: dir });
    const bin = join(dir, 'bin');
    mkdirSync(bin);
    const calls = join(dir, 'calls');
    writeFileSync(calls, '');
    writeFileSync(
      join(bin, 'gh'),
      `#!/usr/bin/env bash
echo call >> "${calls}"
n=$(wc -l < "${calls}")
if [ "$n" -le ${pending} ]; then
  echo "no checks reported on the 'b' branch" >&2
  exit 1
fi
echo "${finalOutput}"
exit ${final}
`,
    );
    chmodSync(join(bin, 'gh'), 0o755);
    const result = spawnSync('bash', [SCRIPT, '7'], {
      cwd: dir,
      encoding: 'utf8',
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, WATCH_PR_RETRY_DELAY: '0' },
    });
    return fn(result, readFileSync(calls, 'utf8').trim().split('\n').length);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

it('waits for checks GitHub has not registered yet', () => {
  withFakeGh({ pending: 2, final: 0, finalOutput: 'all pass' }, (result, calls) => {
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.equal(calls, 3);
  });
});

it('reports a failing check at once', () => {
  withFakeGh({ pending: 0, final: 1, finalOutput: 'core fail' }, (result, calls) => {
    assert.equal(result.status, 1);
    assert.equal(calls, 1);
  });
});

it('gives up when no checks appear', () => {
  withFakeGh({ pending: 99, final: 0, finalOutput: '' }, (result, calls) => {
    assert.equal(result.status, 1);
    assert.equal(calls, 12);
  });
});
