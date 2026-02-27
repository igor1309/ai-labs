#!/usr/bin/env node

/**
 * Compute Docker image tags for Docker-producing release units.
 *
 * For each unit marked as `docker: true` in the manifest that has a
 * detected release, outputs two tags:
 *   - `<version>` (canonical semver from unit metadata)
 *   - `<git-sha>` (commit SHA the release tag points to)
 *
 * Non-Docker units are completely skipped.
 *
 * Usage:
 *   node scripts/release/docker-tags.js              # human-readable output
 *   node scripts/release/docker-tags.js --json        # JSON output for CI
 *   node scripts/release/docker-tags.js --root <dir>  # override repo root
 *
 * ADR traceability: ADR-006 (all invariants).
 */

import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const rootIdx = process.argv.indexOf('--root');
const repoRoot = rootIdx !== -1
  ? resolve(process.argv[rootIdx + 1])
  : resolve(import.meta.dirname, '..', '..');

const jsonOutput = process.argv.includes('--json');

// Get detected releases
const detectScript = new URL('./detect-releases.js', import.meta.url).pathname;
const detectOutput = execFileSync(
  process.execPath,
  [detectScript, '--root', repoRoot, '--json'],
  { cwd: repoRoot, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] },
);
const detections = JSON.parse(detectOutput);

// Filter to Docker-producing units with detected releases
const dockerReleases = detections.filter(d => d.release && d.docker);

const headSha = execFileSync(
  'git', ['rev-parse', 'HEAD'],
  { cwd: repoRoot, encoding: 'utf8' },
).trim();

const results = dockerReleases.map(d => ({
  basename: d.basename,
  gitTag: `${d.basename}_v${d.version}`,
  imageTags: [d.version, headSha],
  version: d.version,
  sha: headSha,
}));

if (jsonOutput) {
  process.stdout.write(JSON.stringify(results, null, 2) + '\n');
} else {
  if (results.length === 0) {
    process.stdout.write('No Docker-producing releases detected.\n');
  } else {
    for (const r of results) {
      process.stdout.write(`${r.basename}:\n`);
      process.stdout.write(`  git tag:    ${r.gitTag}\n`);
      process.stdout.write(`  image tags: ${r.imageTags.join(', ')}\n`);
    }
    process.stdout.write(`\n${results.length} Docker release(s).\n`);
  }
}
