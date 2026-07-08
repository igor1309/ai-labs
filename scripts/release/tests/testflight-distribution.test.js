import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';

const repoRoot = resolve(import.meta.dirname, '..', '..', '..');
const distributeScript = readFileSync(
  resolve(repoRoot, 'foliotell/scripts/distribute-testflight.sh'),
  'utf8',
);

describe('FolioTell TestFlight distribution script', () => {
  it('archives with an Apple Distribution signing identity', () => {
    const archiveFunction = /^archive\(\) \{\n(?<body>[\s\S]*?)\n\}/m.exec(distributeScript)?.groups.body ?? '';

    assert.match(archiveFunction, /CODE_SIGN_IDENTITY="Apple Distribution"/);
  });
});
