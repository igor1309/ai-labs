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

/**
 * Run detect-releases.js with --root and --json, return parsed output.
 */
function detect(repoDir) {
  const script = join(import.meta.dirname, '..', 'detect-releases.js');
  const stdout = execSync(`node ${script} --root ${repoDir} --json`, {
    cwd: repoDir,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  return JSON.parse(stdout);
}

/**
 * Create a git repo with an initial empty commit.
 * Uses --no-gpg-sign to avoid signing issues in test environments.
 */
function initRepo(dir) {
  execSync('git init -b trunk', { cwd: dir, stdio: 'pipe', env: { ...process.env, ...GIT_ENV } });
  execSync('git config commit.gpgSign false', { cwd: dir, stdio: 'pipe', env: { ...process.env, ...GIT_ENV } });
  execSync('git commit --allow-empty -m "initial"', {
    cwd: dir,
    stdio: 'pipe',
    env: { ...process.env, ...GIT_ENV },
  });
}

function commit(dir, msg) {
  execSync(`git add -A && git commit -m "${msg}"`, {
    cwd: dir,
    stdio: 'pipe',
    env: { ...process.env, ...GIT_ENV },
  });
}

function tag(dir, name) {
  execSync(`git tag ${name}`, { cwd: dir, stdio: 'pipe', env: { ...process.env, ...GIT_ENV } });
}

describe('detect-releases', () => {
  let tmp;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'detect-test-'));
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it('detects release when path and version both changed (first release, no prior tag)', () => {
    initRepo(tmp);

    // Add a unit with metadata
    mkdirSync(join(tmp, 'myapp'));
    writeFileSync(join(tmp, 'myapp', 'package.json'), JSON.stringify({ version: '1.0.0' }));
    writeFileSync(join(tmp, 'myapp', 'index.js'), 'console.log("hello");\n');
    writeFileSync(
      join(tmp, 'release-units.toml'),
      stringify({
        units: [{ basename: 'myapp', path: 'myapp', metadata: 'package.json', version: '1.0.0', docker: false }],
      }),
    );
    commit(tmp, 'add myapp');

    const results = detect(tmp);
    assert.equal(results.length, 1);
    assert.equal(results[0].basename, 'myapp');
    assert.equal(results[0].release, true);
    assert.equal(results[0].lastTag, null);
  });

  it('skips release when path changed but version unchanged', () => {
    initRepo(tmp);

    // Add unit
    mkdirSync(join(tmp, 'myapp'));
    writeFileSync(join(tmp, 'myapp', 'package.json'), JSON.stringify({ version: '1.0.0' }));
    commit(tmp, 'add myapp');
    tag(tmp, 'myapp_v1.0.0');

    // Change a file but NOT the version
    writeFileSync(join(tmp, 'myapp', 'index.js'), 'new file\n');
    writeFileSync(
      join(tmp, 'release-units.toml'),
      stringify({
        units: [{ basename: 'myapp', path: 'myapp', metadata: 'package.json', version: '1.0.0', docker: false }],
      }),
    );
    commit(tmp, 'add index.js without version bump');

    const results = detect(tmp);
    assert.equal(results[0].release, false);
    assert.ok(results[0].reason.includes('version unchanged'));
  });

  it('skips release when version changed but no path changes', () => {
    // Note: per ADR-004 analysis, this is architecturally impossible since
    // the metadata file IS under the unit root, so changing version changes
    // a file. But the detection code handles it correctly for defense in depth.
    initRepo(tmp);

    mkdirSync(join(tmp, 'myapp'));
    writeFileSync(join(tmp, 'myapp', 'package.json'), JSON.stringify({ version: '1.0.0' }));
    commit(tmp, 'add myapp');
    tag(tmp, 'myapp_v1.0.0');

    // Bump version (which changes a file under the path)
    writeFileSync(join(tmp, 'myapp', 'package.json'), JSON.stringify({ version: '1.1.0' }));
    writeFileSync(
      join(tmp, 'release-units.toml'),
      stringify({
        units: [{ basename: 'myapp', path: 'myapp', metadata: 'package.json', version: '1.1.0', docker: false }],
      }),
    );
    commit(tmp, 'bump version');

    // Since the version change IS a path change, this should detect a release
    const results = detect(tmp);
    assert.equal(results[0].release, true);
    assert.equal(results[0].version, '1.1.0');
  });

  it('detects release when both path and version changed (with prior tag)', () => {
    initRepo(tmp);

    mkdirSync(join(tmp, 'myapp'));
    writeFileSync(join(tmp, 'myapp', 'package.json'), JSON.stringify({ version: '1.0.0' }));
    writeFileSync(join(tmp, 'myapp', 'index.js'), 'v1\n');
    commit(tmp, 'add myapp');
    tag(tmp, 'myapp_v1.0.0');

    // Change files AND bump version
    writeFileSync(join(tmp, 'myapp', 'package.json'), JSON.stringify({ version: '1.1.0' }));
    writeFileSync(join(tmp, 'myapp', 'index.js'), 'v2\n');
    writeFileSync(
      join(tmp, 'release-units.toml'),
      stringify({
        units: [{ basename: 'myapp', path: 'myapp', metadata: 'package.json', version: '1.1.0', docker: false }],
      }),
    );
    commit(tmp, 'bump and change');

    const results = detect(tmp);
    assert.equal(results[0].release, true);
    assert.equal(results[0].lastTag, 'myapp_v1.0.0');
    assert.equal(results[0].version, '1.1.0');
  });

  it('produces identical output on consecutive runs (idempotent)', () => {
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

    const first = detect(tmp);
    const second = detect(tmp);
    assert.deepEqual(first, second);
  });

  it('evaluates multiple units independently', () => {
    initRepo(tmp);

    // Add two units
    mkdirSync(join(tmp, 'alpha'));
    writeFileSync(join(tmp, 'alpha', 'package.json'), JSON.stringify({ version: '1.0.0' }));
    mkdirSync(join(tmp, 'beta'));
    writeFileSync(join(tmp, 'beta', 'package.json'), JSON.stringify({ version: '1.0.0' }));
    commit(tmp, 'add both');
    tag(tmp, 'alpha_v1.0.0');
    tag(tmp, 'beta_v1.0.0');

    // Change only alpha (both path and version)
    writeFileSync(join(tmp, 'alpha', 'package.json'), JSON.stringify({ version: '1.1.0' }));
    writeFileSync(
      join(tmp, 'release-units.toml'),
      stringify({
        units: [
          { basename: 'alpha', path: 'alpha', metadata: 'package.json', version: '1.1.0', docker: false },
          { basename: 'beta', path: 'beta', metadata: 'package.json', version: '1.0.0', docker: false },
        ],
      }),
    );
    commit(tmp, 'bump alpha only');

    const results = detect(tmp);
    const alpha = results.find(r => r.basename === 'alpha');
    const beta = results.find(r => r.basename === 'beta');
    assert.equal(alpha.release, true, 'alpha should release');
    assert.equal(beta.release, false, 'beta should NOT release');
  });

  it('uses initial commit as base when no tag exists (first release)', () => {
    initRepo(tmp);

    mkdirSync(join(tmp, 'myapp'));
    writeFileSync(join(tmp, 'myapp', 'package.json'), JSON.stringify({ version: '0.1.0' }));
    writeFileSync(
      join(tmp, 'release-units.toml'),
      stringify({
        units: [{ basename: 'myapp', path: 'myapp', metadata: 'package.json', version: '0.1.0', docker: false }],
      }),
    );
    commit(tmp, 'add myapp');

    const results = detect(tmp);
    assert.equal(results[0].release, true);
    assert.equal(results[0].lastTag, null);
    // Base should be the initial commit
    const initialCommit = execSync('git rev-list --max-parents=0 HEAD', {
      cwd: tmp,
      encoding: 'utf8',
    }).trim().split('\n').pop();
    assert.equal(results[0].base, initialCommit);
  });
});
