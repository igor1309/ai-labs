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

function run(script, dir, extraArgs = '') {
  const scriptPath = join(import.meta.dirname, '..', script);
  return execSync(`node ${scriptPath} --root ${dir} ${extraArgs}`, {
    cwd: dir,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, ...GIT_ENV },
  }).trim();
}

function getTags(dir) {
  return git(dir, 'tag -l').split('\n').filter(Boolean);
}

describe('end-to-end release lifecycle', () => {
  let tmp;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'lifecycle-test-'));
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it('full lifecycle: version bump → detection → tag creation → idempotent rerun', () => {
    // --- Setup: create repo with one unit ---
    initRepo(tmp);
    mkdirSync(join(tmp, 'myapp'));
    writeFileSync(join(tmp, 'myapp', 'package.json'), JSON.stringify({ version: '1.0.0' }));
    writeFileSync(join(tmp, 'myapp', 'index.js'), 'console.log("v1");\n');
    writeFileSync(
      join(tmp, 'release-units.config.toml'),
      'paths = ["myapp"]\n',
    );

    // Generate manifest
    const genScript = join(import.meta.dirname, '..', 'generate-manifest.js');
    execSync(`node ${genScript} --root ${tmp}`, {
      cwd: tmp,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    commit(tmp, 'add myapp v1.0.0');

    // --- Step 1: Validate manifest ---
    const validateOutput = run('validate-manifest.js', tmp);
    assert.ok(validateOutput.includes('all checks passed'), 'validation should pass');

    // --- Step 2: Detect release (first release, no prior tag) ---
    const detect1 = JSON.parse(run('detect-releases.js', tmp, '--json'));
    assert.equal(detect1.length, 1);
    assert.equal(detect1[0].release, true, 'first release should be detected');
    assert.equal(detect1[0].basename, 'myapp');
    assert.equal(detect1[0].version, '1.0.0');
    assert.equal(detect1[0].lastTag, null);

    // --- Step 3: Create tag ---
    const tagOutput = run('create-tags.js', tmp);
    assert.ok(tagOutput.includes('myapp_v1.0.0'));
    const tags1 = getTags(tmp);
    assert.ok(tags1.includes('myapp_v1.0.0'), 'tag should be created');

    // --- Step 4: Idempotent rerun — no new releases ---
    const detect2 = JSON.parse(run('detect-releases.js', tmp, '--json'));
    assert.equal(detect2[0].release, false, 'rerun should detect no release');
    assert.ok(detect2[0].reason.includes('no path or version changes'));

    const tagOutput2 = run('create-tags.js', tmp);
    assert.ok(tagOutput2.includes('No releases detected'));
    const tags2 = getTags(tmp);
    assert.deepEqual(tags2, tags1, 'no new tags on rerun');

    // --- Step 5: Version bump triggers new release ---
    writeFileSync(join(tmp, 'myapp', 'package.json'), JSON.stringify({ version: '1.1.0' }));
    writeFileSync(join(tmp, 'myapp', 'index.js'), 'console.log("v2");\n');
    // Regenerate manifest
    execSync(`node ${genScript} --root ${tmp}`, {
      cwd: tmp,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    commit(tmp, 'bump to v1.1.0');

    const detect3 = JSON.parse(run('detect-releases.js', tmp, '--json'));
    assert.equal(detect3[0].release, true, 'new version should trigger release');
    assert.equal(detect3[0].version, '1.1.0');
    assert.equal(detect3[0].lastTag, 'myapp_v1.0.0');

    run('create-tags.js', tmp);
    const tags3 = getTags(tmp);
    assert.ok(tags3.includes('myapp_v1.1.0'), 'new tag should be created');
    assert.ok(tags3.includes('myapp_v1.0.0'), 'old tag should still exist');
  });

  it('multi-unit lifecycle: releasing one unit does not trigger another', () => {
    initRepo(tmp);

    // Create two units
    mkdirSync(join(tmp, 'alpha'));
    writeFileSync(join(tmp, 'alpha', 'package.json'), JSON.stringify({ version: '1.0.0' }));
    mkdirSync(join(tmp, 'beta'));
    writeFileSync(join(tmp, 'beta', 'package.json'), JSON.stringify({ version: '1.0.0' }));
    writeFileSync(
      join(tmp, 'release-units.toml'),
      stringify({
        units: [
          { basename: 'alpha', path: 'alpha', metadata: 'package.json', version: '1.0.0', docker: false },
          { basename: 'beta', path: 'beta', metadata: 'package.json', version: '1.0.0', docker: false },
        ],
      }),
    );
    commit(tmp, 'add both');

    // Release both (first release)
    run('create-tags.js', tmp);
    assert.ok(getTags(tmp).includes('alpha_v1.0.0'));
    assert.ok(getTags(tmp).includes('beta_v1.0.0'));

    // Bump only alpha
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
    commit(tmp, 'bump alpha to 1.1.0');

    const detect = JSON.parse(run('detect-releases.js', tmp, '--json'));
    const alpha = detect.find(d => d.basename === 'alpha');
    const beta = detect.find(d => d.basename === 'beta');
    assert.equal(alpha.release, true, 'alpha should release');
    assert.equal(beta.release, false, 'beta should NOT release');

    run('create-tags.js', tmp);
    const tags = getTags(tmp);
    assert.ok(tags.includes('alpha_v1.1.0'), 'alpha new tag created');
    assert.ok(!tags.includes('beta_v1.1.0'), 'beta should not have new tag');
  });

  it('Docker-producing unit gets version and SHA image tags', () => {
    initRepo(tmp);
    mkdirSync(join(tmp, 'svc'));
    writeFileSync(join(tmp, 'svc', 'package.json'), JSON.stringify({ version: '1.0.0' }));
    writeFileSync(join(tmp, 'svc', 'Dockerfile'), 'FROM node:22\n');
    writeFileSync(
      join(tmp, 'release-units.toml'),
      stringify({
        units: [{ basename: 'svc', path: 'svc', metadata: 'package.json', version: '1.0.0', docker: true }],
      }),
    );
    commit(tmp, 'add svc');

    const dockerOutput = JSON.parse(run('docker-tags.js', tmp, '--json'));
    assert.equal(dockerOutput.length, 1);
    assert.equal(dockerOutput[0].basename, 'svc');
    assert.equal(dockerOutput[0].gitTag, 'svc_v1.0.0');
    assert.equal(dockerOutput[0].imageTags[0], '1.0.0');
    assert.ok(/^[0-9a-f]{40}$/.test(dockerOutput[0].imageTags[1]));
  });
});
