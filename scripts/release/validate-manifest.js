#!/usr/bin/env node

/**
 * Validate the committed release-units.toml against ADR invariants.
 *
 * Checks:
 *   1. Each basename equals the leaf directory name of its path     (ADR-003)
 *   2. Basenames are globally unique                                (ADR-003)
 *   3. No basename contains an underscore                           (ADR-003)
 *   4. Each unit has exactly one canonical metadata file            (ADR-002/005)
 *   5. No unit has both package.json and release.toml               (ADR-002)
 *   6. Every canonical version is valid semver                      (ADR-002)
 *   7. Docker-producing status recorded                             (ADR-006)
 *
 * Usage:
 *   node scripts/release/validate-manifest.js
 *
 * Exits non-zero on first violation.
 */

import { existsSync } from 'node:fs';
import { resolve, join, basename as pathBasename } from 'node:path';
import { loadManifest } from './lib/manifest.js';

const rootIdx = process.argv.indexOf('--root');
const repoRoot = rootIdx !== -1
  ? resolve(process.argv[rootIdx + 1])
  : resolve(import.meta.dirname, '..', '..');

const manifest = loadManifest(repoRoot);
const errors = [];

const seenBasenames = new Set();

for (const unit of manifest.units) {
  // 1. Basename == leaf directory name
  const leafName = pathBasename(unit.path);
  if (unit.basename !== leafName) {
    errors.push(
      `${unit.basename}: basename "${unit.basename}" does not equal leaf directory name "${leafName}" of path "${unit.path}"`,
    );
  }

  // 2. Uniqueness
  if (seenBasenames.has(unit.basename)) {
    errors.push(`${unit.basename}: duplicate basename`);
  }
  seenBasenames.add(unit.basename);

  // 3. No underscores
  if (unit.basename.includes('_')) {
    errors.push(`${unit.basename}: basename contains underscore`);
  }

  // 5. Exactly one metadata file
  const absPath = join(repoRoot, unit.path);
  const hasPackageJson = existsSync(join(absPath, 'package.json'));
  const hasReleaseToml = existsSync(join(absPath, 'release.toml'));

  // 6. Not both
  if (hasPackageJson && hasReleaseToml) {
    errors.push(
      `${unit.basename}: contains both package.json and release.toml (ADR-002 violation)`,
    );
  }

  // 5 cont. At least one
  if (!hasPackageJson && !hasReleaseToml) {
    errors.push(
      `${unit.basename}: missing canonical metadata file (need package.json or release.toml)`,
    );
  }

  // Metadata type consistency
  if (hasPackageJson && unit.metadata !== 'package.json') {
    errors.push(
      `${unit.basename}: metadata recorded as "${unit.metadata}" but package.json exists`,
    );
  }
  if (hasReleaseToml && unit.metadata !== 'release.toml') {
    errors.push(
      `${unit.basename}: metadata recorded as "${unit.metadata}" but release.toml exists`,
    );
  }

  // 7. Valid semver
  if (!isValidSemver(unit.version)) {
    errors.push(
      `${unit.basename}: version "${unit.version}" is not valid semver`,
    );
  }

  // 8. Docker field present (type check)
  if (typeof unit.docker !== 'boolean') {
    errors.push(
      `${unit.basename}: docker field must be a boolean, got ${typeof unit.docker}`,
    );
  }
}


if (errors.length > 0) {
  for (const e of errors) {
    process.stderr.write(`ERROR: ${e}\n`);
  }
  process.exit(1);
}

process.stdout.write(
  `Validated ${manifest.units.length} release unit(s) — all checks passed.\n`,
);

/**
 * Minimal semver validation (MAJOR.MINOR.PATCH with optional pre-release/build).
 * @param {string} v
 * @returns {boolean}
 */
function isValidSemver(v) {
  return /^\d+\.\d+\.\d+(-[\w.]+)?(\+[\w.]+)?$/.test(v);
}
