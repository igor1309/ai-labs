import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, beforeEach, afterEach } from 'node:test';
import { stringify } from '../lib/toml.js';

const GIT_ENV = {
  GIT_AUTHOR_NAME: 'test',
  GIT_AUTHOR_EMAIL: 'test@test',
  GIT_COMMITTER_NAME: 'test',
  GIT_COMMITTER_EMAIL: 'test@test',
  GIT_CONFIG_NOSYSTEM: '1',
  HOME: '/dev/null',
};

describe('check-agonara-release-readiness', () => {
  let tmp;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'agonara-readiness-test-'));
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it('passes when the first Agonara release tag is ready', () => {
    writeAgonaraReleaseRepo(tmp);

    const result = runReadiness(tmp);

    assert.equal(result.exitCode, 0, result.stderr);
    assert.ok(result.stdout.includes('Agonara release readiness passed for agonara_v0.1.0.'));
  });

  it('fails when run away from trunk', () => {
    writeAgonaraReleaseRepo(tmp);
    git(tmp, 'checkout -b release-check');

    const result = runReadiness(tmp);

    assert.equal(result.exitCode, 1);
    assert.ok(result.stderr.includes('releases are only allowed from trunk'));
  });

  it('fails when the release tag already exists', () => {
    writeAgonaraReleaseRepo(tmp);
    git(tmp, 'tag agonara_v0.1.0');

    const result = runReadiness(tmp);

    assert.equal(result.exitCode, 1);
    assert.ok(result.stderr.includes('release tag already exists: agonara_v0.1.0'));
  });

  it('fails when the workflow does not require Agonara deploy success', () => {
    writeAgonaraReleaseRepo(tmp, {
      workflow: [
        'jobs:',
        '  deploy-agonara-staging:',
        '  deploy-agonara-prod:',
        '      - name: Verify Agonara deploy secrets',
        '        run: true',
      ].join('\n'),
    });

    const result = runReadiness(tmp);

    assert.equal(result.exitCode, 1);
    assert.ok(result.stderr.includes("release-unit.yml missing needs.deploy-agonara-staging.result == 'success'"));
  });
});

function writeAgonaraReleaseRepo(dir, {
  workflow = validReleaseWorkflow(),
} = {}) {
  git(dir, 'init -b trunk');
  git(dir, 'config commit.gpgSign false');
  git(dir, 'commit --allow-empty -m "initial"');
  mkdirSync(join(dir, 'agonara'), { recursive: true });
  writeFileSync(join(dir, 'agonara/package.json'), JSON.stringify({ name: 'agonara', version: '0.1.0' }));
  writeFileSync(join(dir, 'agonara/Dockerfile'), 'FROM node:22\n');
  writeFileSync(join(dir, 'release-units.config.toml'), 'paths = ["agonara"]\n');
  writeFileSync(
    join(dir, 'release-units.toml'),
    stringify({
      units: [{ basename: 'agonara', path: 'agonara', metadata: 'package.json', version: '0.1.0', docker: true }],
    }),
  );
  mkdirSync(join(dir, '.github/workflows'), { recursive: true });
  writeFileSync(join(dir, '.github/workflows/release-unit.yml'), workflow);
  git(dir, 'add -A');
  git(dir, 'commit -m "add agonara release wiring"');
}

function validReleaseWorkflow() {
  return [
    'jobs:',
    '  deploy-agonara-staging:',
    '      - name: Verify Agonara deploy secrets',
    '        run: true',
    '  deploy-agonara-prod:',
    "      && needs.deploy-agonara-staging.result == 'success'",
    "      && needs.deploy-agonara-prod.result == 'success'",
    '        deploy-agonara-staging=${{ needs.deploy-agonara-staging.result }}',
    '        deploy-agonara-prod=${{ needs.deploy-agonara-prod.result }}',
  ].join('\n');
}

function runReadiness(dir) {
  const script = join(import.meta.dirname, '..', 'check-agonara-release-readiness.js');
  try {
    const stdout = execSync(`node ${script} --root ${dir}`, {
      cwd: dir,
      encoding: 'utf8',
      env: { ...process.env, ...GIT_ENV },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { exitCode: 0, stdout, stderr: '' };
  } catch (error) {
    return { exitCode: error.status, stdout: error.stdout || '', stderr: error.stderr || '' };
  }
}

function git(dir, cmd) {
  return execSync(`git ${cmd}`, {
    cwd: dir,
    encoding: 'utf8',
    env: { ...process.env, ...GIT_ENV },
    stdio: ['pipe', 'pipe', 'pipe'],
  }).trim();
}
