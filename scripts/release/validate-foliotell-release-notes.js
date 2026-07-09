#!/usr/bin/env node

/**
 * Validate the checked-in FolioTell release note for its canonical version.
 *
 * Usage:
 *   node scripts/release/validate-foliotell-release-notes.js [--root <path>]
 */

import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parse } from './lib/toml.js';

const rootIndex = process.argv.indexOf('--root');
const repositoryRoot = rootIndex === -1
  ? resolve(import.meta.dirname, '..', '..')
  : resolve(process.argv[rootIndex + 1]);
const releaseMetadataPath = join(repositoryRoot, 'foliotell', 'release.toml');
const releaseMetadata = parse(readFileSync(releaseMetadataPath, 'utf8'));
const version = String(releaseMetadata.version);
const releaseNotesPath = join(repositoryRoot, 'foliotell', 'docs', 'releases', `${version}.md`);

if (existsSync(releaseNotesPath) === false) {
  fail(`FolioTell ${version}: missing release notes at ${releaseNotesPath}`);
}

const releaseNotes = readFileSync(releaseNotesPath, 'utf8');
const frontMatter = releaseNotes.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
if (frontMatter === null) {
  fail(`FolioTell ${version}: release notes must begin with YAML front matter`);
}

for (const fieldName of ['date', 'model', 'description']) {
  if (new RegExp(`^${fieldName}:\\s*\\S`, 'm').test(frontMatter[1]) === false) {
    fail(`FolioTell ${version}: release notes front matter is missing ${fieldName}`);
  }
}

const releaseNotesBody = releaseNotes.slice(frontMatter[0].length);
if (new RegExp(`^# FolioTell ${escapeRegularExpression(version)}\\s*$`, 'm').test(releaseNotesBody) === false) {
  fail(`FolioTell ${version}: release notes title must be "# FolioTell ${version}"`);
}

const whatsNewHeading = /^## What's New\s*$/m.exec(releaseNotesBody);
const whatsNewStart = whatsNewHeading === null
  ? null
  : whatsNewHeading.index + whatsNewHeading[0].length;
const remainingReleaseNotes = whatsNewStart === null
  ? ''
  : releaseNotesBody.slice(whatsNewStart);
const nextHeadingIndex = remainingReleaseNotes.search(/^## /m);
const whatsNewContents = nextHeadingIndex === -1
  ? remainingReleaseNotes
  : remainingReleaseNotes.slice(0, nextHeadingIndex);
if (whatsNewHeading === null || /^-\s+\S/m.test(whatsNewContents) === false) {
  fail(`FolioTell ${version}: release notes must contain a non-empty "## What's New" section`);
}

process.stdout.write(`Validated FolioTell release notes for v${version}.\n`);

function escapeRegularExpression(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function fail(message) {
  process.stderr.write(`ERROR: ${message}\n`);
  process.exit(1);
}
