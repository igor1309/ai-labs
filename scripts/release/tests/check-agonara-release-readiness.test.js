import assert from 'node:assert/strict';
import { execFileSync, execSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { stringify } from '../lib/toml.js';

const GIT_ENV = {
  GIT_AUTHOR_NAME: 'test',
  GIT_AUTHOR_EMAIL: 'test@test',
  GIT_COMMITTER_NAME: 'test',
  GIT_COMMITTER_EMAIL: 'test@test',
  GIT_CONFIG_NOSYSTEM: '1',
  HOME: '/dev/null',
};

let scratchDirs;

describe('check-agonara-release-readiness', () => {
  let tmp;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'agonara-readiness-test-'));
    scratchDirs = [];
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
    for (const scratchDir of scratchDirs) {
      rmSync(scratchDir, { recursive: true, force: true });
    }
  });

  it('passes when the first Agonara release tag is ready', () => {
    writeAgonaraReleaseRepo(tmp);

    const result = runReadiness(tmp);

    assert.equal(result.exitCode, 0, result.stderr);
    assert.ok(result.stdout.includes('OK locked release install'));
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

  it('fails when the working tree is dirty', () => {
    writeAgonaraReleaseRepo(tmp);
    writeFileSync(join(tmp, 'agonara/uncommitted.js'), 'uncommitted\n');

    const result = runReadiness(tmp);

    assert.equal(result.exitCode, 1);
    assert.ok(result.stderr.includes('working tree must be clean'));
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

  it('fails when the locked release install wiring is incomplete', () => {
    writeAgonaraReleaseRepo(tmp, {
      dockerfile: [
        'FROM node:22',
        'COPY --chown=agonara:agonara package.json ./',
        'RUN npm install --omit=dev',
      ].join('\n'),
    });

    const result = runReadiness(tmp);

    assert.equal(result.exitCode, 1);
    assert.ok(result.stderr.includes('Agonara Dockerfile must copy package-lock.json and use npm ci --omit=dev'));
  });

  it('fails when the release workflow does not upload the Agonara package lock', () => {
    writeAgonaraReleaseRepo(tmp, {
      workflow: validReleaseWorkflow().replace(
        '        source: "agonara/package-lock.json"',
        '        source: "agonara/package.json"',
      ),
    });

    const result = runReadiness(tmp);

    assert.equal(result.exitCode, 1);
    assert.ok(result.stderr.includes('release-unit.yml must upload agonara/package-lock.json'));
  });

  it('fails when the CI dispatcher does not route Agonara package lock changes', () => {
    writeAgonaraReleaseRepo(tmp, {
      ciWorkflow: validCiWorkflow().replace(
        '    - "agonara/package-lock.json"',
        '    - "agonara/package.json"',
      ),
    });

    const result = runReadiness(tmp);

    assert.equal(result.exitCode, 1);
    assert.ok(result.stderr.includes('ci.yml must route agonara/package-lock.json changes to Agonara core'));
  });

  it('passes the GitHub secret check when required deploy secret names exist', () => {
    writeAgonaraReleaseRepo(tmp);
    const fakeGhBin = writeFakeGhSecretList([
      'AGONARA_VPS_HOST',
      'AGONARA_VPS_USER',
      'AGONARA_VPS_SSH_KEY',
    ]);

    const result = runReadiness(tmp, {
      args: ['--check-github-secrets'],
      env: { PATH: `${fakeGhBin}:${process.env.PATH}` },
    });

    assert.equal(result.exitCode, 0, result.stderr);
    assert.ok(result.stdout.includes('OK github deploy secret names'));
  });

  it('fails the GitHub secret check when a required deploy secret name is missing', () => {
    writeAgonaraReleaseRepo(tmp);
    const fakeGhBin = writeFakeGhSecretList([
      'AGONARA_VPS_HOST',
      'AGONARA_VPS_USER',
    ]);

    const result = runReadiness(tmp, {
      args: ['--check-github-secrets'],
      env: { PATH: `${fakeGhBin}:${process.env.PATH}` },
    });

    assert.equal(result.exitCode, 1);
    assert.ok(result.stderr.includes('missing GitHub deploy secret names: AGONARA_VPS_SSH_KEY'));
  });

  it('fails the GitHub secret check when gh cannot list secrets', () => {
    writeAgonaraReleaseRepo(tmp);
    const fakeGhBin = writeFakeGhError();

    const result = runReadiness(tmp, {
      args: ['--check-github-secrets'],
      env: { PATH: `${fakeGhBin}:${process.env.PATH}` },
    });

    assert.equal(result.exitCode, 1);
    assert.ok(result.stderr.includes('unable to list GitHub secret names with gh: gh auth failed'));
  });
});

function writeAgonaraReleaseRepo(dir, {
  dockerfile = validDockerfile(),
  workflow = validReleaseWorkflow(),
  ciWorkflow = validCiWorkflow(),
} = {}) {
  git(dir, 'init -b trunk');
  git(dir, 'config commit.gpgSign false');
  git(dir, 'commit --allow-empty -m "initial"');
  mkdirSync(join(dir, 'agonara'), { recursive: true });
  writeFileSync(join(dir, 'agonara/package.json'), JSON.stringify({ name: 'agonara', version: '0.1.0' }));
  writeFileSync(join(dir, 'agonara/package-lock.json'), JSON.stringify({
    name: 'agonara',
    version: '0.1.0',
    lockfileVersion: 3,
    packages: { '': { name: 'agonara', version: '0.1.0' } },
  }));
  writeFileSync(join(dir, 'agonara/Dockerfile'), dockerfile);
  writeFileSync(join(dir, 'release-units.config.toml'), 'paths = ["agonara"]\n');
  writeFileSync(
    join(dir, 'release-units.toml'),
    stringify({
      units: [{ basename: 'agonara', path: 'agonara', metadata: 'package.json', version: '0.1.0', docker: true }],
    }),
  );
  mkdirSync(join(dir, '.github/workflows'), { recursive: true });
  writeFileSync(join(dir, '.github/workflows/release-unit.yml'), workflow);
  writeFileSync(join(dir, '.github/workflows/ci.yml'), ciWorkflow);
  git(dir, 'add -A');
  git(dir, 'commit -m "add agonara release wiring"');
}

function validDockerfile() {
  return [
    'FROM node:22',
    'COPY --chown=agonara:agonara package.json package-lock.json ./',
    'RUN npm ci --omit=dev',
  ].join('\n');
}

function validReleaseWorkflow() {
  return [
    'jobs:',
    '  deploy-agonara-staging:',
    '      - name: Verify Agonara deploy secrets',
    '        run: true',
    '        source: "agonara/package-lock.json"',
    '  deploy-agonara-prod:',
    "      && needs.deploy-agonara-staging.result == 'success'",
    "      && needs.deploy-agonara-prod.result == 'success'",
    '        deploy-agonara-staging=${{ needs.deploy-agonara-staging.result }}',
    '        deploy-agonara-prod=${{ needs.deploy-agonara-prod.result }}',
  ].join('\n');
}

function validCiWorkflow() {
  return [
    'filters:',
    '  agonara:',
    '    - "agonara/package-lock.json"',
    '  agonara-ci:',
    '    - ".github/workflows/agonara-core.yml"',
  ].join('\n');
}

function runReadiness(dir, {
  args = [],
  env = {},
} = {}) {
  const script = join(import.meta.dirname, '..', 'check-agonara-release-readiness.js');
  try {
    const stdout = execFileSync(process.execPath, [script, '--root', dir, ...args], {
      cwd: dir,
      encoding: 'utf8',
      env: { ...process.env, ...GIT_ENV, ...env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { exitCode: 0, stdout, stderr: '' };
  } catch (error) {
    return {
      exitCode: error.status ?? 1,
      stdout: error.stdout || '',
      stderr: error.stderr || '',
    };
  }
}

function writeFakeGhSecretList(secretNames) {
  const fakeGhBin = mkdtempSync(join(tmpdir(), 'agonara-gh-bin-'));
  scratchDirs.push(fakeGhBin);
  const payload = JSON.stringify(secretNames.map($0 => ({ name: $0 })));
  writeFileSync(join(fakeGhBin, 'gh'), [
    '#!/bin/sh',
    `printf '%s\\n' '${payload}'`,
  ].join('\n'));
  chmodSync(join(fakeGhBin, 'gh'), 0o755);
  return fakeGhBin;
}

function writeFakeGhError() {
  const fakeGhBin = mkdtempSync(join(tmpdir(), 'agonara-gh-bin-'));
  scratchDirs.push(fakeGhBin);
  writeFileSync(join(fakeGhBin, 'gh'), [
    '#!/bin/sh',
    "printf '%s\\n' 'gh auth failed' >&2",
    'exit 7',
  ].join('\n'));
  chmodSync(join(fakeGhBin, 'gh'), 0o755);
  return fakeGhBin;
}

function git(dir, cmd) {
  return execSync(`git ${cmd}`, {
    cwd: dir,
    encoding: 'utf8',
    env: { ...process.env, ...GIT_ENV },
    stdio: ['pipe', 'pipe', 'pipe'],
  }).trim();
}
