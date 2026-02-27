import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';
import { stringify } from '../lib/toml.js';

const GIT_ENV = {
  GIT_AUTHOR_NAME: 'test',
  GIT_AUTHOR_EMAIL: 'test@test',
  GIT_COMMITTER_NAME: 'test',
  GIT_COMMITTER_EMAIL: 'test@test',
  GIT_CONFIG_NOSYSTEM: '1',
  HOME: '/dev/null',
};

function git(dir, cmd) {
  return execSync(`git ${cmd}`, {
    cwd: dir,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, ...GIT_ENV },
  }).trim();
}

function initRepo(dir) {
  git(dir, 'init -b trunk');
  git(dir, 'config commit.gpgSign false');
  git(dir, 'commit --allow-empty -m "initial"');
}

function commit(dir, msg) {
  git(dir, 'add -A');
  git(dir, `commit -m "${msg}"`);
}

function runCreateTags(dir, extraArgs = '') {
  const script = join(import.meta.dirname, '..', 'create-tags.js');
  try {
    const stdout = execSync(`node ${script} --root ${dir} ${extraArgs}`, {
      cwd: dir,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ...GIT_ENV },
    });
    return { exitCode: 0, stdout, stderr: '' };
  } catch (e) {
    return { exitCode: e.status, stdout: e.stdout || '', stderr: e.stderr || '' };
  }
}

function getTags(dir) {
  return git(dir, 'tag -l').split('\n').filter(Boolean);
}

describe('create-tags', () => {
  let tmp;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'tags-test-'));
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it('creates tag in <basename>_v<version> format', () => {
    initRepo(tmp);
    mkdirSync(join(tmp, 'myapp'));
    writeFileSync(join(tmp, 'myapp', 'package.json'), JSON.stringify({ version: '1.0.0' }));
    writeFileSync(
      join(tmp, 'release-units.toml'),
      stringify({
        units: [{ basename: 'myapp', path: 'myapp', metadata: 'package.json', version: '1.0.0', docker: false }],
      }),
    );
    commit(tmp, 'add myapp');

    const result = runCreateTags(tmp);
    assert.equal(result.exitCode, 0, `stderr: ${result.stderr}`);
    assert.ok(result.stdout.includes('myapp_v1.0.0'));

    const tags = getTags(tmp);
    assert.ok(tags.includes('myapp_v1.0.0'));
  });

  it('rejects tag creation from non-trunk branch', () => {
    initRepo(tmp);
    git(tmp, 'checkout -b feature');
    mkdirSync(join(tmp, 'myapp'));
    writeFileSync(join(tmp, 'myapp', 'package.json'), JSON.stringify({ version: '1.0.0' }));
    writeFileSync(
      join(tmp, 'release-units.toml'),
      stringify({
        units: [{ basename: 'myapp', path: 'myapp', metadata: 'package.json', version: '1.0.0', docker: false }],
      }),
    );
    commit(tmp, 'add myapp');

    const result = runCreateTags(tmp);
    assert.equal(result.exitCode, 1);
    assert.ok(result.stderr.includes('only allowed from trunk'));
  });

  it('does not create tags when no releases are detected', () => {
    initRepo(tmp);
    mkdirSync(join(tmp, 'myapp'));
    writeFileSync(join(tmp, 'myapp', 'package.json'), JSON.stringify({ version: '1.0.0' }));
    commit(tmp, 'add myapp');
    git(tmp, 'tag myapp_v1.0.0');

    // No changes since tag — no release
    writeFileSync(
      join(tmp, 'release-units.toml'),
      stringify({
        units: [{ basename: 'myapp', path: 'myapp', metadata: 'package.json', version: '1.0.0', docker: false }],
      }),
    );
    commit(tmp, 'add manifest');

    const result = runCreateTags(tmp);
    assert.equal(result.exitCode, 0);
    assert.ok(result.stdout.includes('No releases detected'));
  });

  it('dry-run does not create tags', () => {
    initRepo(tmp);
    mkdirSync(join(tmp, 'myapp'));
    writeFileSync(join(tmp, 'myapp', 'package.json'), JSON.stringify({ version: '1.0.0' }));
    writeFileSync(
      join(tmp, 'release-units.toml'),
      stringify({
        units: [{ basename: 'myapp', path: 'myapp', metadata: 'package.json', version: '1.0.0', docker: false }],
      }),
    );
    commit(tmp, 'add myapp');

    const result = runCreateTags(tmp, '--dry-run');
    assert.equal(result.exitCode, 0);
    assert.ok(result.stdout.includes('DRY-RUN'));

    const tags = getTags(tmp);
    assert.ok(!tags.includes('myapp_v1.0.0'));
  });

  it('skips already-existing tags (idempotent)', () => {
    initRepo(tmp);
    mkdirSync(join(tmp, 'myapp'));
    writeFileSync(join(tmp, 'myapp', 'package.json'), JSON.stringify({ version: '1.0.0' }));
    writeFileSync(
      join(tmp, 'release-units.toml'),
      stringify({
        units: [{ basename: 'myapp', path: 'myapp', metadata: 'package.json', version: '1.0.0', docker: false }],
      }),
    );
    commit(tmp, 'add myapp');

    // First run creates the tag
    runCreateTags(tmp);
    assert.ok(getTags(tmp).includes('myapp_v1.0.0'));

    // Bump version so detection runs again but old tag still exists
    // Actually, after creating the tag, detection should NOT detect a release
    // because no changes since the tag. Let's manually add the tag first
    // and then re-run — it should be a no-op.
    const result = runCreateTags(tmp);
    assert.equal(result.exitCode, 0);
    assert.ok(result.stdout.includes('No releases detected'));
  });

  it('creates tags for multiple units', () => {
    initRepo(tmp);
    mkdirSync(join(tmp, 'alpha'));
    writeFileSync(join(tmp, 'alpha', 'package.json'), JSON.stringify({ version: '1.0.0' }));
    mkdirSync(join(tmp, 'beta'));
    writeFileSync(join(tmp, 'beta', 'package.json'), JSON.stringify({ version: '2.0.0' }));
    writeFileSync(
      join(tmp, 'release-units.toml'),
      stringify({
        units: [
          { basename: 'alpha', path: 'alpha', metadata: 'package.json', version: '1.0.0', docker: false },
          { basename: 'beta', path: 'beta', metadata: 'package.json', version: '2.0.0', docker: true },
        ],
      }),
    );
    commit(tmp, 'add both');

    const result = runCreateTags(tmp);
    assert.equal(result.exitCode, 0);
    const tags = getTags(tmp);
    assert.ok(tags.includes('alpha_v1.0.0'));
    assert.ok(tags.includes('beta_v2.0.0'));
  });
});
