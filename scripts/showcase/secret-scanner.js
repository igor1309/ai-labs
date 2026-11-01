import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export function createSecretScanner({ run, tempRoot = tmpdir() }) {
  return function scanDirectory(directory) {
    run('gitleaks', ['version'], { cwd: directory });
    // Exported config, ignore files and inline allow comments must not weaken
    // the secret scan of a public snapshot.
    const scannerDirectory = mkdtempSync(join(tempRoot, 'showcase-scanner-'));
    try {
      const scannerConfig = join(scannerDirectory, 'gitleaks.toml');
      const scannerIgnore = join(scannerDirectory, 'ignore');
      writeFileSync(scannerConfig, '[extend]\nuseDefault = true\n');
      writeFileSync(scannerIgnore, '');
      run('gitleaks', ['dir', directory, '--no-banner', '--redact', '--follow-symlinks',
        '--config', scannerConfig, '--gitleaks-ignore-path', scannerIgnore, '--ignore-gitleaks-allow'], { cwd: directory });
    } finally {
      rmSync(scannerDirectory, { recursive: true, force: true });
    }
  };
}
