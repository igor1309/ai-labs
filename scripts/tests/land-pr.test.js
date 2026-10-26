import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { it } from 'node:test';

const SCRIPT = resolve('scripts/land-pr.sh');

// withRepo runs land-pr.sh on a branch cloned from a local origin, with fake
// gh, watch-pr.sh and curl. `behind` puts a trunk commit the branch lacks;
// `checks` is watch-pr's exit; `trunkRuns` is trunk's runs on the merge.
function withRepo({ behind = false, checks = 0, trunkRuns }, fn) {
  const dir = mkdtempSync(join(tmpdir(), 'land-pr-test-'));
  try {
    const git = (cwd, ...args) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd, encoding: 'utf8' }).trim();
    const origin = join(dir, 'origin.git');
    git(dir, 'init', '-q', '--bare', '-b', 'trunk', origin);
    const work = join(dir, 'work');
    git(dir, 'clone', '-q', origin, work);
    git(work, 'commit', '-q', '--allow-empty', '-m', 'base');
    git(work, 'push', '-q', 'origin', 'trunk');
    git(work, 'switch', '-q', '-c', 'feature');
    git(work, 'commit', '-q', '--allow-empty', '-m', 'work');
    if (behind) {
      git(work, 'switch', '-q', 'trunk');
      git(work, 'commit', '-q', '--allow-empty', '-m', 'later');
      git(work, 'push', '-q', 'origin', 'trunk');
      git(work, 'switch', '-q', 'feature');
    }
    const head = git(work, 'rev-parse', 'HEAD');
    const scripts = join(work, 'scripts');
    mkdirSync(scripts);
    execFileSync('cp', [SCRIPT, scripts]);
    writeFileSync(join(scripts, 'watch-pr.sh'), `#!/usr/bin/env bash\nexit ${checks}\n`);
    chmodSync(join(scripts, 'watch-pr.sh'), 0o755);
    const bin = join(dir, 'bin');
    mkdirSync(bin);
    const calls = join(dir, 'calls');
    writeFileSync(calls, '');
    writeFileSync(join(bin, 'gh'), `#!/usr/bin/env bash
echo "$*" >> "${calls}"
case "$*" in
  *"--jq .title"*) echo "a title" ;;
  *"--jq .headRefOid"*) echo ${head} ;;
  *"--jq .state"*) grep -q "pr merge" "${calls}" && echo MERGED || echo OPEN ;;
  *"--jq .mergeCommit.oid"*) echo 0123abcd ;;
  "run list"*) echo '${JSON.stringify(trunkRuns ?? [])}' ;;
esac
`);
    writeFileSync(join(bin, 'curl'), `#!/usr/bin/env bash\necho "$*" >> "${dir}/notes"\n`);
    chmodSync(join(bin, 'gh'), 0o755);
    chmodSync(join(bin, 'curl'), 0o755);
    const home = join(dir, 'home');
    mkdirSync(join(home, '.config', 'ntfy'), { recursive: true });
    writeFileSync(join(home, '.config', 'ntfy', 'topic'), 'topic\n');
    writeFileSync(join(dir, 'notes'), '');
    const result = spawnSync('bash', [join(scripts, 'land-pr.sh'), '7'], {
      cwd: work, encoding: 'utf8',
      env: { ...process.env, HOME: home, PATH: `${bin}:${process.env.PATH}`, LAND_PR_INTERVAL: '0' },
    });
    return fn(result, readFileSync(calls, 'utf8'), readFileSync(join(dir, 'notes'), 'utf8'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

it('refuses a branch behind trunk without merging', () => {
  withRepo({ behind: true }, (result, calls) => {
    assert.equal(result.status, 1);
    assert.match(result.stderr, /behind origin\/trunk/);
    assert.doesNotMatch(calls, /pr merge/);
  });
});

it('does not merge a red PR and says so', () => {
  withRepo({ checks: 1 }, (result, calls, notes) => {
    assert.equal(result.status, 1);
    assert.doesNotMatch(calls, /pr merge/);
    assert.match(notes, /PR #7 red, not merged/);
  });
});

it('reports green only when trunk CI on the merge passed', () => {
  withRepo({ trunkRuns: [{ status: 'completed', conclusion: 'success' }, { status: 'completed', conclusion: 'skipped' }] }, (result, calls, notes) => {
    assert.equal(result.status, 0);
    assert.match(calls, /pr merge 7 --merge/);
    assert.match(calls, /run list --branch trunk --commit 0123abcd/);
    assert.match(notes, /trunk CI green/);
  });
});

it('reports red trunk CI on the merge', () => {
  withRepo({ trunkRuns: [{ status: 'completed', conclusion: 'failure' }] }, (result, _calls, notes) => {
    assert.equal(result.status, 1);
    assert.match(notes, /trunk CI RED on 0123abcd/);
  });
});
