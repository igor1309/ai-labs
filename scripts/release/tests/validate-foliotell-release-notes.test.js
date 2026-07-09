import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('validate-foliotell-release-notes', () => {
  let temporaryDirectory;

  beforeEach(() => {
    temporaryDirectory = mkdtempSync(join(tmpdir(), 'foliotell-release-notes-test-'));
  });

  afterEach(() => {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  });

  it('passes when the current version has a valid release note', () => {
    writeReleaseNote();

    const result = runValidator();

    assert.equal(result.exitCode, 0);
  });

  it('fails when the current version release note is missing', () => {
    writeReleaseMetadata();

    const result = runValidator();

    assert.match(result.stderr, /missing release notes/);
  });

  it('fails when the release note title does not match the version', () => {
    writeReleaseNote({ title: '# FolioTell 0.5.1' });

    const result = runValidator();

    assert.match(result.stderr, /title must be "# FolioTell 0.5.0"/);
  });

  it('fails when the release note has no user-facing changes', () => {
    writeReleaseNote({ whatsNew: '' });

    const result = runValidator();

    assert.match(result.stderr, /non-empty "## What's New" section/);
  });

  it('fails when the release note front matter omits its description', () => {
    writeReleaseNote({ frontMatter: 'date: 2026-07-09\nmodel: gpt-5' });

    const result = runValidator();

    assert.match(result.stderr, /front matter is missing description/);
  });

  function runValidator() {
    const scriptPath = join(import.meta.dirname, '..', 'validate-foliotell-release-notes.js');
    try {
      const stdout = execFileSync('node', [scriptPath, '--root', temporaryDirectory], {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      return { exitCode: 0, stdout, stderr: '' };
    } catch (error) {
      return {
        exitCode: error.status,
        stdout: error.stdout ?? '',
        stderr: error.stderr ?? '',
      };
    }
  }

  function writeReleaseMetadata() {
    mkdirSync(join(temporaryDirectory, 'foliotell'), { recursive: true });
    writeFileSync(join(temporaryDirectory, 'foliotell', 'release.toml'), 'version = "0.5.0"\n');
  }

  function writeReleaseNote({
    frontMatter = 'date: 2026-07-09\nmodel: gpt-5\ndescription: "FolioTell 0.5.0 release notes"',
    title = '# FolioTell 0.5.0',
    whatsNew = '- Improved voice quality onboarding.',
  } = {}) {
    writeReleaseMetadata();
    const releasesDirectory = join(temporaryDirectory, 'foliotell', 'docs', 'releases');
    mkdirSync(releasesDirectory, { recursive: true });
    writeFileSync(
      join(releasesDirectory, '0.5.0.md'),
      `---\n${frontMatter}\n---\n\n${title}\n\n## What's New\n\n${whatsNew}\n`,
    );
  }
});
