import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';
import { stringify } from '../lib/toml.js';

/**
 * Helper: write a manifest and run the validator in the given directory.
 * Returns { exitCode, stderr, stdout }.
 */
function runValidator(tmp) {
  const script = join(import.meta.dirname, '..', 'validate-manifest.js');
  try {
    const stdout = execSync(`node ${script} --root ${tmp}`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { exitCode: 0, stdout, stderr: '' };
  } catch (e) {
    return { exitCode: e.status, stdout: e.stdout || '', stderr: e.stderr || '' };
  }
}

/**
 * Helper: set up a temp dir with a manifest (no git repo needed).
 * The validator gracefully skips tag checks when git is unavailable.
 */
function setupManifest(tmp, units) {
  const manifest = stringify({ units });
  writeFileSync(join(tmp, 'release-units.toml'), manifest);
}

describe('validate-manifest', () => {
  let tmp;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'validate-test-'));
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it('passes for a valid single-unit manifest', () => {
    mkdirSync(join(tmp, 'myapp'));
    writeFileSync(
      join(tmp, 'myapp', 'package.json'),
      JSON.stringify({ version: '1.0.0' }),
    );
    setupManifest(tmp, [
      { basename: 'myapp', path: 'myapp', metadata: 'package.json', version: '1.0.0', docker: false },
    ]);
    const result = runValidator(tmp);
    assert.equal(result.exitCode, 0, `Expected pass but got: ${result.stderr}`);
    assert.ok(result.stdout.includes('all checks passed'));
  });

  it('fails when basename does not match leaf directory name', () => {
    mkdirSync(join(tmp, 'myapp'));
    writeFileSync(
      join(tmp, 'myapp', 'package.json'),
      JSON.stringify({ version: '1.0.0' }),
    );
    setupManifest(tmp, [
      { basename: 'wrong-name', path: 'myapp', metadata: 'package.json', version: '1.0.0', docker: false },
    ]);
    const result = runValidator(tmp);
    assert.equal(result.exitCode, 1);
    assert.ok(result.stderr.includes('is not the leaf directory name "myapp"'));
  });

  it('passes when basename is declared for a nested path in config', () => {
    mkdirSync(join(tmp, 'notio', 'backend'), { recursive: true });
    writeFileSync(join(tmp, 'notio', 'backend', 'release.toml'), 'version = "1.0.0"\n');
    writeFileSync(
      join(tmp, 'release-units.config.toml'),
      'paths = [{ path = "notio/backend", basename = "notio-backend" }]\n',
    );
    setupManifest(tmp, [
      { basename: 'notio-backend', path: 'notio/backend', metadata: 'release.toml', version: '1.0.0', docker: false },
    ]);

    const result = runValidator(tmp);

    assert.equal(result.exitCode, 0, `Expected pass but got: ${result.stderr}`);
  });

  it('fails when basename is neither leaf-derived nor declared in config', () => {
    mkdirSync(join(tmp, 'notio', 'backend'), { recursive: true });
    writeFileSync(join(tmp, 'notio', 'backend', 'release.toml'), 'version = "1.0.0"\n');
    writeFileSync(
      join(tmp, 'release-units.config.toml'),
      'paths = [{ path = "notio/backend", basename = "configured-backend" }]\n',
    );
    setupManifest(tmp, [
      { basename: 'notio-backend', path: 'notio/backend', metadata: 'release.toml', version: '1.0.0', docker: false },
    ]);

    const result = runValidator(tmp);

    assert.equal(result.exitCode, 1);
    assert.ok(result.stderr.includes('is not the leaf directory name "backend" or configured basename "configured-backend"'));
  });

  it('fails on duplicate basenames', () => {
    mkdirSync(join(tmp, 'a'));
    writeFileSync(join(tmp, 'a', 'package.json'), JSON.stringify({ version: '1.0.0' }));
    setupManifest(tmp, [
      { basename: 'a', path: 'a', metadata: 'package.json', version: '1.0.0', docker: false },
      { basename: 'a', path: 'a', metadata: 'package.json', version: '1.0.0', docker: false },
    ]);
    const result = runValidator(tmp);
    assert.equal(result.exitCode, 1);
    assert.ok(result.stderr.includes('duplicate basename'));
  });

  it('fails when basename contains underscore', () => {
    mkdirSync(join(tmp, 'my_app'));
    writeFileSync(
      join(tmp, 'my_app', 'package.json'),
      JSON.stringify({ version: '1.0.0' }),
    );
    setupManifest(tmp, [
      { basename: 'my_app', path: 'my_app', metadata: 'package.json', version: '1.0.0', docker: false },
    ]);
    const result = runValidator(tmp);
    assert.equal(result.exitCode, 1);
    assert.ok(result.stderr.includes('contains underscore'));
  });

  it('fails when unit contains both package.json and release.toml', () => {
    mkdirSync(join(tmp, 'dual'));
    writeFileSync(join(tmp, 'dual', 'package.json'), JSON.stringify({ version: '1.0.0' }));
    writeFileSync(join(tmp, 'dual', 'release.toml'), 'version = "1.0.0"\n');
    setupManifest(tmp, [
      { basename: 'dual', path: 'dual', metadata: 'package.json', version: '1.0.0', docker: false },
    ]);
    const result = runValidator(tmp);
    assert.equal(result.exitCode, 1);
    assert.ok(result.stderr.includes('both package.json and release.toml'));
  });

  it('fails when canonical metadata file is missing', () => {
    mkdirSync(join(tmp, 'empty'));
    setupManifest(tmp, [
      { basename: 'empty', path: 'empty', metadata: 'package.json', version: '1.0.0', docker: false },
    ]);
    const result = runValidator(tmp);
    assert.equal(result.exitCode, 1);
    assert.ok(result.stderr.includes('missing canonical metadata file'));
  });

  it('fails on invalid semver version', () => {
    mkdirSync(join(tmp, 'app'));
    writeFileSync(join(tmp, 'app', 'package.json'), JSON.stringify({ version: 'bad' }));
    setupManifest(tmp, [
      { basename: 'app', path: 'app', metadata: 'package.json', version: 'bad', docker: false },
    ]);
    const result = runValidator(tmp);
    assert.equal(result.exitCode, 1);
    assert.ok(result.stderr.includes('not valid semver'));
  });

  it('accepts valid semver with pre-release', () => {
    mkdirSync(join(tmp, 'app'));
    writeFileSync(
      join(tmp, 'app', 'package.json'),
      JSON.stringify({ version: '1.0.0-beta.1' }),
    );
    setupManifest(tmp, [
      { basename: 'app', path: 'app', metadata: 'package.json', version: '1.0.0-beta.1', docker: false },
    ]);
    const result = runValidator(tmp);
    assert.equal(result.exitCode, 0, `Expected pass but got: ${result.stderr}`);
  });

  it('passes for release.toml units', () => {
    mkdirSync(join(tmp, 'infra'));
    writeFileSync(join(tmp, 'infra', 'release.toml'), 'version = "0.1.0"\n');
    setupManifest(tmp, [
      { basename: 'infra', path: 'infra', metadata: 'release.toml', version: '0.1.0', docker: false },
    ]);
    const result = runValidator(tmp);
    assert.equal(result.exitCode, 0, `Expected pass but got: ${result.stderr}`);
  });

  it('validates multiple units independently', () => {
    mkdirSync(join(tmp, 'alpha'));
    writeFileSync(join(tmp, 'alpha', 'package.json'), JSON.stringify({ version: '1.0.0' }));
    mkdirSync(join(tmp, 'beta'));
    writeFileSync(join(tmp, 'beta', 'package.json'), JSON.stringify({ version: '2.0.0' }));
    setupManifest(tmp, [
      { basename: 'alpha', path: 'alpha', metadata: 'package.json', version: '1.0.0', docker: false },
      { basename: 'beta', path: 'beta', metadata: 'package.json', version: '2.0.0', docker: true },
    ]);
    const result = runValidator(tmp);
    assert.equal(result.exitCode, 0, `Expected pass but got: ${result.stderr}`);
  });
});
