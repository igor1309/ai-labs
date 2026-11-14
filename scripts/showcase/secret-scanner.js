import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export function createSecretScanner({ run, tempRoot = tmpdir() }) {
  // A public value is a finding the owner has reviewed as public, such as an
  // extension's public key. It passes only while its line is byte for byte
  // the one reviewed; any other finding, or a changed line, still fails.
  return function scanDirectory(directory, publicValues = []) {
    const fingerprints = publicValues.map(({ finding, line_sha256: expected }) => {
      const [path, rule, line] = finding.split(':');
      let text;
      try {
        text = readFileSync(join(directory, path), 'utf8').split('\n')[Number(line) - 1];
      } catch {
        text = undefined;
      }
      const actual = text === undefined ? undefined : createHash('sha256').update(text).digest('hex');
      if (actual !== expected) throw new Error(`public_value ${finding} no longer matches its reviewed line`);
      return `${join(directory, path)}:${rule}:${line}`;
    });
    run('gitleaks', ['version'], { cwd: directory });
    // Exported config, ignore files and inline allow comments must not weaken
    // the secret scan of a public snapshot.
    const scannerDirectory = mkdtempSync(join(tempRoot, 'showcase-scanner-'));
    try {
      const scannerConfig = join(scannerDirectory, 'gitleaks.toml');
      const scannerIgnore = join(scannerDirectory, 'ignore');
      writeFileSync(scannerConfig, '[extend]\nuseDefault = true\n');
      writeFileSync(scannerIgnore, fingerprints.map((fingerprint) => `${fingerprint}\n`).join(''));
      run('gitleaks', ['dir', directory, '--no-banner', '--redact', '--follow-symlinks',
        '--config', scannerConfig, '--gitleaks-ignore-path', scannerIgnore, '--ignore-gitleaks-allow'], { cwd: directory });
    } finally {
      rmSync(scannerDirectory, { recursive: true, force: true });
    }
  };
}
