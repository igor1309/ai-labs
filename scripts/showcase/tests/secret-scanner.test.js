import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createSecretScanner } from '../secret-scanner.js';

for (const stage of ['success', 'missing scanner', 'secret']) {
  test(`scanner uses trusted rules and arguments, propagates failures and cleans up: ${stage}`, (t) => {
    const base = mkdtempSync(join(tmpdir(), 'showcase-scanner-test-'));
    t.after(() => rmSync(base, { recursive: true, force: true }));
    const directory = join(base, 'snapshot');
    mkdirSync(directory);
    const exportedConfig = '[allowlist]\nregexes = [".*"]\n';
    const exportedIgnore = 'ignore-this-secret\n';
    writeFileSync(join(directory, '.gitleaks.toml'), exportedConfig);
    writeFileSync(join(directory, '.gitleaksignore'), exportedIgnore);
    const error = new Error(`${stage}: diagnostic output`);
    const calls = [];
    const scanDirectory = createSecretScanner({ tempRoot: base, run: (command, args, options) => {
      calls.push({ command, args, ...options });
      assert.equal(command, 'gitleaks');
      assert.deepEqual(options, { cwd: directory });
      if (calls.length === 1) {
        assert.deepEqual(args, ['version']);
        assert.deepEqual(readdirSync(base), ['snapshot']);
        if (stage === 'missing scanner') throw error;
      } else {
        const scannerConfig = args[args.indexOf('--config') + 1];
        const scannerIgnore = args[args.indexOf('--gitleaks-ignore-path') + 1];
        const scannerDirectory = dirname(scannerConfig);
        assert.equal(dirname(scannerDirectory), base);
        assert.match(scannerDirectory.slice(base.length + 1), /^showcase-scanner-/);
        assert.notEqual(scannerDirectory, directory);
        assert.equal(scannerConfig, join(scannerDirectory, 'gitleaks.toml'));
        assert.equal(scannerIgnore, join(scannerDirectory, 'ignore'));
        assert.equal(readFileSync(scannerConfig, 'utf8'), '[extend]\nuseDefault = true\n');
        assert.equal(readFileSync(scannerIgnore, 'utf8'), '');
        assert.deepEqual(args, ['dir', directory, '--no-banner', '--redact', '--follow-symlinks',
          '--config', scannerConfig, '--gitleaks-ignore-path', scannerIgnore, '--ignore-gitleaks-allow']);
        if (stage === 'secret') throw error;
      }
      return Buffer.alloc(0);
    } });

    if (stage === 'success') scanDirectory(directory);
    else assert.throws(() => scanDirectory(directory), (actual) => actual === error);

    assert.equal(calls.length, stage === 'missing scanner' ? 1 : 2);
    assert.deepEqual(readdirSync(base), ['snapshot']);
    assert.equal(readFileSync(join(directory, '.gitleaks.toml'), 'utf8'), exportedConfig);
    assert.equal(readFileSync(join(directory, '.gitleaksignore'), 'utf8'), exportedIgnore);
  });
}
