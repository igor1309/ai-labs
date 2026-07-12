import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';

const repoRoot = resolve(import.meta.dirname, '..', '..', '..');
const distributeScript = readFileSync(
  resolve(repoRoot, 'foliotell/ios/scripts/distribute-testflight.sh'),
  'utf8',
);

describe('FolioTell TestFlight distribution script', () => {
  it('archives without signing so exportArchive owns distribution signing', () => {
    const archiveFunction = /^archive\(\) \{\n(?<body>[\s\S]*?)\n\}/m.exec(distributeScript)?.groups.body ?? '';

    assert.match(archiveFunction, /CODE_SIGNING_ALLOWED=NO/);
    assert.doesNotMatch(archiveFunction, /CODE_SIGN_IDENTITY=/);
  });
});
