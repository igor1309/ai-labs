import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { it } from 'node:test';

const SCRIPT = resolve('scripts/wait-pr-merged.sh');

const AUTO = { mergeMethod: 'MERGE' };
function pr(state, extra = {}) {
  return { state, mergeable: 'MERGEABLE', mergeStateStatus: 'BLOCKED', autoMergeRequest: AUTO, ...extra };
}

// withFakeGh runs wait-pr-merged.sh with a fake gh whose nth `pr view`
// gives views[n], and the last one from then on.
function withFakeGh(views, env, fn) {
  const dir = mkdtempSync(join(tmpdir(), 'wait-pr-merged-test-'));
  try {
    const bin = join(dir, 'bin');
    mkdirSync(bin);
    writeFileSync(join(dir, 'calls'), '');
    views.forEach((view, n) => writeFileSync(join(dir, `view-${n + 1}`), JSON.stringify(view)));
    writeFileSync(
      join(bin, 'gh'),
      `#!/usr/bin/env bash
[ "$1 $2 $3" = "pr view 7" ] || exit 9
echo x >> "${dir}/calls"
n=$(wc -l < "${dir}/calls" | tr -d ' ')
[ "$n" -gt ${views.length} ] && n=${views.length}
cat "${dir}/view-$n"
`,
    );
    chmodSync(join(bin, 'gh'), 0o755);
    return fn(
      spawnSync('bash', [SCRIPT, '7'], {
        encoding: 'utf8',
        env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, WAIT_PR_MERGED_INTERVAL: '0', ...env },
      }),
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

it('waits while auto-merge is pending and passes once merged', () => {
  withFakeGh([pr('OPEN'), pr('OPEN'), pr('MERGED')], {}, (result) => {
    assert.equal(result.status, 0, result.stderr);
  });
});

it('stops on a conflict with the base', () => {
  withFakeGh([pr('OPEN', { mergeStateStatus: 'DIRTY', mergeable: 'CONFLICTING' })], {}, (result) => {
    assert.equal(result.status, 5);
    assert.match(result.stderr, /conflicts with its base/);
  });
});

it('stops when no auto-merge is set on two polls in a row', () => {
  withFakeGh([pr('OPEN', { autoMergeRequest: null })], {}, (result) => {
    assert.equal(result.status, 6);
    assert.match(result.stderr, /no auto-merge set; merge state: BLOCKED/);
  });
});

it('passes a PR that merged between a poll without auto-merge and the next', () => {
  withFakeGh([pr('OPEN', { autoMergeRequest: null }), pr('MERGED', { autoMergeRequest: null })], {}, (result) => {
    assert.equal(result.status, 0, result.stderr);
  });
});

it('fails a closed PR', () => {
  withFakeGh([pr('CLOSED')], {}, (result) => {
    assert.equal(result.status, 1);
  });
});

it('stops at its limit, naming the merge state', () => {
  withFakeGh([pr('OPEN')], { WAIT_PR_MERGED_LIMIT: '1', WAIT_PR_MERGED_INTERVAL: '0.2' }, (result) => {
    assert.equal(result.status, 4);
    assert.match(result.stderr, /not merged after 1s; merge state: BLOCKED/);
  });
});
