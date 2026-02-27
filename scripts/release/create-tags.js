#!/usr/bin/env node

/**
 * Create git tags for detected releases.
 *
 * For each unit where detection signals a release, creates a tag
 * `<basename>_v<version>` at HEAD.
 *
 * Invariants enforced:
 *   - Tags only created on trunk (ADR-001).
 *   - Tag format is `<basename>_v<version>` (ADR-003).
 *   - No tag created if detection did not signal a release (ADR-004).
 *   - Basename in tag matches leaf directory name (ADR-003).
 *   - Version in tag matches canonical version from metadata (ADR-002).
 *
 * Usage:
 *   node scripts/release/create-tags.js              # create tags
 *   node scripts/release/create-tags.js --dry-run    # preview without creating
 *   node scripts/release/create-tags.js --root <dir> # override repo root
 *
 * ADR traceability: ADR-003, ADR-001, ADR-000, ADR-002.
 */

import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const rootIdx = process.argv.indexOf('--root');
const repoRoot = rootIdx !== -1
  ? resolve(process.argv[rootIdx + 1])
  : resolve(import.meta.dirname, '..', '..');

const dryRun = process.argv.includes('--dry-run');

// Trunk enforcement: reject if HEAD is not on trunk.
const currentBranch = execFileSync(
  'git', ['rev-parse', '--abbrev-ref', 'HEAD'],
  { cwd: repoRoot, encoding: 'utf8' },
).trim();

if (currentBranch !== 'trunk') {
  process.stderr.write(
    `ERROR: releases are only allowed from trunk (current branch: ${currentBranch})\n`,
  );
  process.exit(1);
}

// Run detection to find which units need releases.
const detectScript = new URL('./detect-releases.js', import.meta.url).pathname;
const detectOutput = execFileSync(
  process.execPath,
  [detectScript, '--root', repoRoot, '--json'],
  { cwd: repoRoot, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] },
);
const detections = JSON.parse(detectOutput);

const releasing = detections.filter(d => d.release);

if (releasing.length === 0) {
  process.stdout.write('No releases detected. No tags to create.\n');
  process.exit(0);
}

const created = [];

for (const unit of releasing) {
  const tagName = `${unit.basename}_v${unit.version}`;

  // Verify tag doesn't already exist (idempotency guard)
  try {
    execFileSync('git', ['rev-parse', '--verify', `refs/tags/${tagName}`], {
      cwd: repoRoot,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    process.stdout.write(`SKIP    ${tagName} (tag already exists)\n`);
    continue;
  } catch {
    // Tag doesn't exist — proceed to create
  }

  if (dryRun) {
    process.stdout.write(`DRY-RUN ${tagName}\n`);
  } else {
    execFileSync('git', ['tag', tagName], { cwd: repoRoot, stdio: 'pipe' });
    process.stdout.write(`CREATED ${tagName}\n`);
  }
  created.push(tagName);
}

process.stdout.write(
  `\n${created.length} tag(s) ${dryRun ? 'would be created' : 'created'}.\n`,
);
