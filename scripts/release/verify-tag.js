#!/usr/bin/env node

/**
 * Validate a release tag against the manifest.
 *
 * Usage:
 *   node scripts/release/verify-tag.js <tag>
 *
 * Outputs to stdout (for CI capture):
 *   basename=<name>
 *   version=<version>
 *   docker=<true|false>
 *   unit_path=<path>
 *
 * Exits non-zero if the tag does not match a manifest unit.
 */

import { resolve } from 'node:path';
import { loadManifest } from './lib/manifest.js';

const tag = process.argv[2];
if (!tag) {
  process.stderr.write('Usage: verify-tag.js <tag>\n');
  process.exit(1);
}

// Parse tag: <basename>_v<version>
const sepIdx = tag.lastIndexOf('_v');
if (sepIdx === -1) {
  process.stderr.write(`Invalid tag format (expected <basename>_v<version>): ${tag}\n`);
  process.exit(1);
}
const basename = tag.slice(0, sepIdx);
const version = tag.slice(sepIdx + 2);

const repoRoot = resolve(import.meta.dirname, '..', '..');
const manifest = loadManifest(repoRoot);
const unit = manifest.units.find(u => u.basename === basename);

if (!unit) {
  process.stderr.write(`Unit not found in manifest: ${basename}\n`);
  process.exit(1);
}

if (unit.version !== version) {
  process.stderr.write(
    `Tag version ${version} does not match canonical version ${unit.version}\n`,
  );
  process.exit(1);
}

process.stdout.write(`basename=${unit.basename}\n`);
process.stdout.write(`version=${unit.version}\n`);
process.stdout.write(`docker=${unit.docker}\n`);
process.stdout.write(`unit_path=${unit.path}\n`);
