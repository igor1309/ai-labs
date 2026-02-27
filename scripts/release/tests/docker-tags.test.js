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

function runDockerTags(dir) {
  const script = join(import.meta.dirname, '..', 'docker-tags.js');
  const stdout = execSync(`node ${script} --root ${dir} --json`, {
    cwd: dir,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, ...GIT_ENV },
  });
  return JSON.parse(stdout);
}

describe('docker-tags', () => {
  let tmp;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'docker-tags-test-'));
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it('produces version and SHA tags for Docker-producing unit', () => {
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

    const results = runDockerTags(tmp);
    assert.equal(results.length, 1);
    assert.equal(results[0].basename, 'svc');
    assert.equal(results[0].gitTag, 'svc_v1.0.0');
    assert.equal(results[0].imageTags.length, 2);
    assert.equal(results[0].imageTags[0], '1.0.0');
    // Second tag is the git SHA
    assert.ok(/^[0-9a-f]{40}$/.test(results[0].imageTags[1]));
    assert.equal(results[0].version, '1.0.0');
    assert.equal(results[0].sha, results[0].imageTags[1]);
  });

  it('skips non-Docker units', () => {
    initRepo(tmp);
    mkdirSync(join(tmp, 'lib'));
    writeFileSync(join(tmp, 'lib', 'package.json'), JSON.stringify({ version: '1.0.0' }));
    writeFileSync(
      join(tmp, 'release-units.toml'),
      stringify({
        units: [{ basename: 'lib', path: 'lib', metadata: 'package.json', version: '1.0.0', docker: false }],
      }),
    );
    commit(tmp, 'add lib');

    const results = runDockerTags(tmp);
    assert.equal(results.length, 0);
  });

  it('image version matches canonical semver', () => {
    initRepo(tmp);
    mkdirSync(join(tmp, 'svc'));
    writeFileSync(join(tmp, 'svc', 'package.json'), JSON.stringify({ version: '2.3.4' }));
    writeFileSync(join(tmp, 'svc', 'Dockerfile'), 'FROM node:22\n');
    writeFileSync(
      join(tmp, 'release-units.toml'),
      stringify({
        units: [{ basename: 'svc', path: 'svc', metadata: 'package.json', version: '2.3.4', docker: true }],
      }),
    );
    commit(tmp, 'add svc');

    const results = runDockerTags(tmp);
    assert.equal(results[0].version, '2.3.4');
    assert.equal(results[0].imageTags[0], '2.3.4');
  });

  it('git tag format matches <basename>_v<version>', () => {
    initRepo(tmp);
    mkdirSync(join(tmp, 'my-service'));
    writeFileSync(join(tmp, 'my-service', 'package.json'), JSON.stringify({ version: '0.1.0' }));
    writeFileSync(join(tmp, 'my-service', 'Dockerfile'), 'FROM node:22\n');
    writeFileSync(
      join(tmp, 'release-units.toml'),
      stringify({
        units: [{ basename: 'my-service', path: 'my-service', metadata: 'package.json', version: '0.1.0', docker: true }],
      }),
    );
    commit(tmp, 'add my-service');

    const results = runDockerTags(tmp);
    assert.equal(results[0].gitTag, 'my-service_v0.1.0');
  });
});
