import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { it } from 'node:test';

const SCRIPT = resolve('dev-skills/public/worktree/scripts/git-worktree-create');

const ENV = {
  ...process.env,
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_AUTHOR_NAME: 't',
  GIT_AUTHOR_EMAIL: 't@example.com',
  GIT_COMMITTER_NAME: 't',
  GIT_COMMITTER_EMAIL: 't@example.com',
};

function sh(cwd, ...args) {
  return execFileSync(args[0], args.slice(1), { cwd, env: ENV, encoding: 'utf8', stdio: 'pipe' });
}

const git = (cwd, ...args) => spawnSync('git', args, { cwd, env: ENV, encoding: 'utf8' });

// A bare "remote" plus a clone with trunk pushed, so origin/trunk exists.
function withClone(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'git-worktree-create-test-'));
  try {
    const remote = join(dir, 'remote.git');
    const clone = join(dir, 'clone');
    sh(dir, 'git', 'init', '-q', '--bare', '-b', 'trunk', remote);
    sh(dir, 'git', 'clone', '-q', remote, clone);
    sh(clone, 'git', 'checkout', '-q', '-b', 'trunk');
    // Without --no-track, `always` makes any base (remote or local) the upstream.
    sh(clone, 'git', 'config', 'branch.autoSetupMerge', 'always');
    writeFileSync(join(clone, 'a.txt'), 'a\n');
    sh(clone, 'git', 'add', '-A');
    sh(clone, 'git', 'commit', '-q', '-m', 'init');
    sh(clone, 'git', 'push', '-q', '-u', 'origin', 'trunk');
    return fn(dir, clone);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function assertNoUpstream(clone, branch) {
  assert.equal(git(clone, 'rev-parse', '--verify', '-q', `refs/heads/${branch}`).status, 0);
  const upstream = git(clone, 'rev-parse', '--abbrev-ref', `${branch}@{upstream}`);
  assert.notEqual(upstream.status, 0, `unexpected upstream: ${upstream.stdout}`);
  const merge = git(clone, 'config', `branch.${branch}.merge`);
  assert.notEqual(merge.status, 0, `unexpected merge config: ${merge.stdout}`);
}

it('sets no upstream when the base is a remote-tracking ref', () => {
  withClone((dir, clone) => {
    sh(clone, SCRIPT, 'fix/remote-base', 'origin/trunk', '-C', join(dir, 'wt'));
    assertNoUpstream(clone, 'fix/remote-base');
  });
});

it('sets no upstream when the base is HEAD', () => {
  withClone((dir, clone) => {
    sh(clone, SCRIPT, 'fix/head-base', '-C', join(dir, 'wt'));
    assertNoUpstream(clone, 'fix/head-base');
  });
});
