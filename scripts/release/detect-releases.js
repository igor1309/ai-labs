#!/usr/bin/env node

/**
 * Detect which release units need a new release.
 *
 * For each unit in the manifest:
 *   1. Find the last matching tag via glob `<basename>_v*`.
 *   2. If no tag exists, use the initial repository commit as base.
 *   3. A release is signaled if and only if BOTH conditions are true:
 *      - At least one file under the unit root path changed since base.
 *      - The canonical version changed since base.
 *
 * Detection is idempotent: running multiple times against the same
 * repository state produces identical output.
 *
 * Usage:
 *   node scripts/release/detect-releases.js              # human-readable output
 *   node scripts/release/detect-releases.js --json        # JSON output for CI
 *   node scripts/release/detect-releases.js --root <dir>  # override repo root
 *
 * ADR traceability: ADR-004, ADR-001, ADR-003.
 */

import { resolve } from 'node:path';
import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadManifest } from './lib/manifest.js';
import { parse } from './lib/toml.js';

const rootIdx = process.argv.indexOf('--root');
const repoRoot = rootIdx !== -1
  ? resolve(process.argv[rootIdx + 1])
  : resolve(import.meta.dirname, '..', '..');

const jsonOutput = process.argv.includes('--json');

const manifest = loadManifest(repoRoot);
const results = [];

for (const unit of manifest.units) {
  const detection = detectRelease(unit, repoRoot);
  results.push(detection);
}

if (jsonOutput) {
  process.stdout.write(JSON.stringify(results, null, 2) + '\n');
} else {
  for (const r of results) {
    if (r.release) {
      process.stdout.write(
        `RELEASE ${r.basename} v${r.version} (base: ${r.base.slice(0, 8)}, tag: ${r.lastTag || 'none'})\n`,
      );
    } else {
      process.stdout.write(
        `SKIP    ${r.basename} (${r.reason})\n`,
      );
    }
  }
  const releasing = results.filter(r => r.release);
  process.stdout.write(
    `\n${releasing.length} release(s) detected out of ${results.length} unit(s).\n`,
  );
}

/**
 * Detect whether a unit needs a release.
 *
 * @param {{ basename: string, path: string, metadata: string, version: string, docker: boolean }} unit
 * @param {string} repoRoot
 * @returns {{ basename: string, version: string, release: boolean, reason: string, base: string, lastTag: string | null }}
 */
function detectRelease(unit, repoRoot) {
  const lastTag = findLastTag(unit.basename, repoRoot);
  const base = lastTag
    ? getTagCommit(lastTag, repoRoot)
    : getInitialCommit(repoRoot);

  const pathChanged = hasPathChanges(unit.path, base, repoRoot);
  const versionChanged = hasVersionChanged(unit, base, repoRoot);

  let release = false;
  let reason = '';

  if (!pathChanged && !versionChanged) {
    reason = 'no path or version changes';
  } else if (pathChanged && !versionChanged) {
    reason = 'path changed but version unchanged';
  } else if (!pathChanged && versionChanged) {
    reason = 'version changed but no path changes';
  } else {
    release = true;
    reason = 'path and version both changed';
  }

  return {
    basename: unit.basename,
    version: unit.version,
    release,
    reason,
    base,
    lastTag,
    docker: unit.docker,
  };
}

/**
 * Find the last (most recent) tag matching `<basename>_v*`.
 *
 * @param {string} basename
 * @param {string} repoRoot
 * @returns {string | null}
 */
function findLastTag(basename, repoRoot) {
  try {
    const tags = execSync(
      `git tag -l "${basename}_v*" --sort=-version:refname`,
      { cwd: repoRoot, encoding: 'utf8' },
    ).trim();
    if (!tags) return null;
    return tags.split('\n')[0];
  } catch {
    return null;
  }
}

/**
 * Get the commit SHA a tag points to.
 *
 * @param {string} tag
 * @param {string} repoRoot
 * @returns {string}
 */
function getTagCommit(tag, repoRoot) {
  return execSync(`git rev-list -n1 "${tag}"`, {
    cwd: repoRoot,
    encoding: 'utf8',
  }).trim();
}

/**
 * Get the initial (root) commit of the repository.
 *
 * @param {string} repoRoot
 * @returns {string}
 */
function getInitialCommit(repoRoot) {
  // rev-list --max-parents=0 may return multiple roots; use the oldest.
  const roots = execSync('git rev-list --max-parents=0 HEAD', {
    cwd: repoRoot,
    encoding: 'utf8',
  }).trim().split('\n');
  return roots[roots.length - 1];
}

/**
 * Check if any files under the unit root path changed since the base commit.
 *
 * @param {string} unitPath
 * @param {string} base
 * @param {string} repoRoot
 * @returns {boolean}
 */
function hasPathChanges(unitPath, base, repoRoot) {
  const diff = execSync(
    `git diff --name-only ${base} HEAD -- "${unitPath}"`,
    { cwd: repoRoot, encoding: 'utf8' },
  ).trim();
  return diff.length > 0;
}

/**
 * Check if the canonical version changed since the base commit.
 *
 * Reads the version from the metadata file at the base commit and compares
 * it to the current version.
 *
 * @param {{ path: string, metadata: string, version: string }} unit
 * @param {string} base
 * @param {string} repoRoot
 * @returns {boolean}
 */
function hasVersionChanged(unit, base, repoRoot) {
  const metadataPath = `${unit.path}/${unit.metadata}`;
  let baseVersion;

  try {
    const baseContent = execSync(
      `git show ${base}:${metadataPath}`,
      { cwd: repoRoot, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] },
    );
    if (unit.metadata === 'package.json') {
      baseVersion = JSON.parse(baseContent).version;
    } else {
      baseVersion = parse(baseContent).version;
    }
  } catch {
    // File didn't exist at base commit — version has effectively changed
    // (this handles first-release when the unit was added after initial commit).
    return true;
  }

  return String(baseVersion) !== String(unit.version);
}
