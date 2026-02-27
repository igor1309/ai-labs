import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { discoverUnits } from '../lib/manifest.js';

describe('discoverUnits', () => {
  let tmp;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'release-test-'));
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it('discovers a Node unit with package.json', () => {
    mkdirSync(join(tmp, 'myapp'));
    writeFileSync(
      join(tmp, 'myapp', 'package.json'),
      JSON.stringify({ name: 'myapp', version: '1.2.3' }),
    );
    const units = discoverUnits(tmp, ['myapp']);
    assert.equal(units.length, 1);
    assert.equal(units[0].basename, 'myapp');
    assert.equal(units[0].path, 'myapp');
    assert.equal(units[0].metadata, 'package.json');
    assert.equal(units[0].version, '1.2.3');
    assert.equal(units[0].docker, false);
  });

  it('discovers a non-Node unit with release.toml', () => {
    mkdirSync(join(tmp, 'infra'));
    writeFileSync(join(tmp, 'infra', 'release.toml'), 'version = "0.1.0"\n');
    const units = discoverUnits(tmp, ['infra']);
    assert.equal(units.length, 1);
    assert.equal(units[0].basename, 'infra');
    assert.equal(units[0].metadata, 'release.toml');
    assert.equal(units[0].version, '0.1.0');
  });

  it('detects Docker-producing units via Dockerfile', () => {
    mkdirSync(join(tmp, 'svc'));
    writeFileSync(
      join(tmp, 'svc', 'package.json'),
      JSON.stringify({ version: '1.0.0' }),
    );
    writeFileSync(join(tmp, 'svc', 'Dockerfile'), 'FROM node:22\n');
    const units = discoverUnits(tmp, ['svc']);
    assert.equal(units[0].docker, true);
  });

  it('skips directories without metadata', () => {
    mkdirSync(join(tmp, 'empty'));
    const units = discoverUnits(tmp, ['empty']);
    assert.equal(units.length, 0);
  });

  it('skips non-existent directories', () => {
    const units = discoverUnits(tmp, ['does-not-exist']);
    assert.equal(units.length, 0);
  });

  it('sorts output by basename for deterministic ordering', () => {
    mkdirSync(join(tmp, 'zebra'));
    writeFileSync(
      join(tmp, 'zebra', 'package.json'),
      JSON.stringify({ version: '1.0.0' }),
    );
    mkdirSync(join(tmp, 'alpha'));
    writeFileSync(
      join(tmp, 'alpha', 'package.json'),
      JSON.stringify({ version: '2.0.0' }),
    );
    const units = discoverUnits(tmp, ['zebra', 'alpha']);
    assert.equal(units[0].basename, 'alpha');
    assert.equal(units[1].basename, 'zebra');
  });

  it('produces identical output on repeated runs (deterministic)', () => {
    mkdirSync(join(tmp, 'app'));
    writeFileSync(
      join(tmp, 'app', 'package.json'),
      JSON.stringify({ version: '1.0.0' }),
    );
    const first = discoverUnits(tmp, ['app']);
    const second = discoverUnits(tmp, ['app']);
    assert.deepEqual(first, second);
  });

  it('uses leaf directory name as basename for nested paths', () => {
    mkdirSync(join(tmp, 'apps', 'my-api'), { recursive: true });
    writeFileSync(
      join(tmp, 'apps', 'my-api', 'package.json'),
      JSON.stringify({ version: '0.1.0' }),
    );
    const units = discoverUnits(tmp, ['apps/my-api']);
    assert.equal(units[0].basename, 'my-api');
    assert.equal(units[0].path, 'apps/my-api');
  });
});
