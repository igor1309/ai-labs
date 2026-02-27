/**
 * Shared helpers for reading the discovery config and manifest.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { parse } from './toml.js';

/**
 * Load and return the discovery configuration.
 *
 * @param {string} repoRoot
 * @returns {{ paths: string[] }}
 */
export function loadConfig(repoRoot) {
  const configPath = join(repoRoot, 'release-units.config.toml');
  const text = readFileSync(configPath, 'utf8');
  const config = parse(text);
  if (!Array.isArray(config.paths)) {
    throw new Error('release-units.config.toml: "paths" must be an array');
  }
  return { paths: config.paths };
}

/**
 * Load and return the committed manifest.
 *
 * @param {string} repoRoot
 * @returns {{ units: import('./types.js').Unit[] }}
 */
export function loadManifest(repoRoot) {
  const manifestPath = join(repoRoot, 'release-units.toml');
  const text = readFileSync(manifestPath, 'utf8');
  const data = parse(text);
  return { units: data.units || [] };
}

/**
 * Discover release units from the repo by scanning configured paths.
 *
 * @param {string} repoRoot
 * @param {string[]} paths
 * @returns {import('./types.js').Unit[]}
 */
export function discoverUnits(repoRoot, paths) {
  const units = [];

  for (const unitPath of paths) {
    const absPath = join(repoRoot, unitPath);
    if (!existsSync(absPath)) continue;

    const hasPackageJson = existsSync(join(absPath, 'package.json'));
    const hasReleaseToml = existsSync(join(absPath, 'release.toml'));

    if (!hasPackageJson && !hasReleaseToml) continue;

    const leafName = basename(unitPath);
    let version;
    let metadata;

    if (hasPackageJson) {
      metadata = 'package.json';
      const pkg = JSON.parse(readFileSync(join(absPath, 'package.json'), 'utf8'));
      version = pkg.version;
    } else {
      metadata = 'release.toml';
      const toml = parse(readFileSync(join(absPath, 'release.toml'), 'utf8'));
      version = toml.version;
    }

    const docker = existsSync(join(absPath, 'Dockerfile'));

    units.push({
      basename: leafName,
      path: unitPath,
      metadata,
      version: String(version),
      docker,
    });
  }

  // Sort by basename for deterministic output
  units.sort((a, b) => a.basename.localeCompare(b.basename));

  return units;
}
