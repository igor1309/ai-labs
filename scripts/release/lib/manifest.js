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
 * @returns {{ paths: Array<string | { path: string, basename: string }> }}
 */
export function loadConfig(repoRoot) {
  const configPath = join(repoRoot, 'release-units.config.toml');
  if (!existsSync(configPath)) {
    return { paths: [] };
  }
  const text = readFileSync(configPath, 'utf8');
  const config = parse(text);
  if (!Array.isArray(config.paths)) {
    throw new Error('release-units.config.toml: "paths" must be an array');
  }
  for (const entry of config.paths) {
    if (typeof entry === 'string') continue;
    if (isConfiguredPath(entry)) continue;
    throw new Error(
      'release-units.config.toml: "paths" entries must be strings or { path, basename } objects',
    );
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
 * @param {Array<string | { path: string, basename: string }>} paths
 * @returns {import('./types.js').Unit[]}
 */
export function discoverUnits(repoRoot, paths) {
  const units = [];

  for (const entry of paths) {
    const { unitPath, unitBasename } = normalizeConfigPath(entry);
    const absPath = join(repoRoot, unitPath);
    if (!existsSync(absPath)) continue;

    const hasPackageJson = existsSync(join(absPath, 'package.json'));
    const hasReleaseToml = existsSync(join(absPath, 'release.toml'));

    if (!hasPackageJson && !hasReleaseToml) continue;

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
      basename: unitBasename,
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

/**
 * @param {unknown} entry
 * @returns {entry is { path: string, basename: string }}
 */
function isConfiguredPath(entry) {
  return Boolean(
    entry &&
      typeof entry === 'object' &&
      typeof entry.path === 'string' &&
      typeof entry.basename === 'string',
  );
}

/**
 * @param {string | { path: string, basename: string }} entry
 * @returns {{ unitPath: string, unitBasename: string }}
 */
function normalizeConfigPath(entry) {
  if (typeof entry === 'string') {
    return { unitPath: entry, unitBasename: basename(entry) };
  }
  return { unitPath: entry.path, unitBasename: entry.basename };
}
