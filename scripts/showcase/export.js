#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { chmodSync, cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, matchesGlob, posix, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parse } from '../release/lib/toml.js';
import { createMetadataSync } from './repo-metadata.js';
import { createSecretScanner } from './secret-scanner.js';

export function runCommand(command, args, { cwd }) {
  const result = spawnSync(command, args, { cwd, maxBuffer: 128 * 1024 * 1024 });
  if (result.error || result.status !== 0) {
    const output = Buffer.concat([result.stdout ?? Buffer.alloc(0), result.stderr ?? Buffer.alloc(0)]).toString();
    throw new Error(`${command}: ${result.error?.message ?? `exited ${result.status ?? result.signal}`}\n${output}`.trim());
  }
  return result.stdout;
}

function markerList(text) {
  return text.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith('#'));
}

export function readSettings(text, project, markers = readFileSync(new URL('markers.txt', import.meta.url), 'utf8')) {
  const settings = parse(text);
  for (const key of ['repo', 'description', 'homepage', 'check']) {
    if (typeof settings[key] !== 'string' || !settings[key].trim()) {
      throw new Error(`showcase.toml: ${key} must be a nonempty string`);
    }
  }
  if (!/^[\w.-]+\/[\w.-]+$/.test(settings.repo) || settings.repo.split('/').some((part) => part === '.' || part === '..')) {
    throw new Error('showcase.toml: repo must be owner/name');
  }
  for (const key of ['topics', 'include', 'exclude']) {
    if (!Array.isArray(settings[key]) || settings[key].some((value) => typeof value !== 'string' || !value.trim())) {
      throw new Error(`showcase.toml: ${key} must be an array of nonempty strings`);
    }
  }
  for (const key of ['allow_marker', 'mount']) {
    if (settings[key] === undefined) continue;
    if (!Array.isArray(settings[key]) || settings[key].some((entry) => !entry || typeof entry !== 'object' || Array.isArray(entry))) {
      throw new Error(`showcase.toml: ${key} must be an array of tables`);
    }
  }
  const knownMarkers = markerList(markers).map((marker) => marker.toLowerCase());
  for (const entry of settings.allow_marker ?? []) {
    if (typeof entry.marker !== 'string' || !knownMarkers.includes(entry.marker.toLowerCase())) {
      throw new Error('showcase.toml: allow_marker.marker must name a marker in markers.txt');
    }
    if (!Array.isArray(entry.paths) || !entry.paths.length || entry.paths.some((path) => typeof path !== 'string' || !path.trim())) {
      throw new Error('showcase.toml: allow_marker.paths must be a nonempty array of nonempty strings');
    }
  }
  for (const entry of settings.mount ?? []) {
    for (const key of ['source', 'target']) {
      if (key === 'target' && entry.target === undefined) continue;
      try {
        if (typeof entry[key] !== 'string' || !entry[key].trim() || /^[a-z]:/i.test(entry[key])) throw new Error();
        safePath(entry[key]);
      } catch {
        throw new Error(`showcase.toml: mount.${key} must be a safe ${key === 'source' ? 'repository' : 'export'}-relative folder`);
      }
    }
    if (entry.source === project || entry.source.startsWith(`${project}/`)) {
      throw new Error('showcase.toml: mount.source must be outside the project');
    }
    for (const key of ['include', 'exclude']) {
      if (key === 'exclude' && entry.exclude === undefined) continue;
      if (!Array.isArray(entry[key]) || entry[key].some((glob) => typeof glob !== 'string' || !glob.trim())) {
        throw new Error(`showcase.toml: mount.${key} must be an array of nonempty strings`);
      }
    }
  }
  return settings;
}

export function isIncluded(path, settings) {
  return !path.startsWith('showcase/') && path !== 'showcase' &&
    settings.include.some((glob) => matchesGlob(path, glob)) &&
    !settings.exclude.some((glob) => matchesGlob(path, glob));
}

function safePath(path) {
  if (!path || path.startsWith('/') || path.includes('\\') ||
      path.split('/').some((part) => !part || part === '.' || part === '..' || part.toLowerCase() === '.git')) {
    throw new Error(`Unsafe export path: ${path}`);
  }
}

function writeSnapshot(directory, files) {
  // Build tools may leave outputs or change inputs. Publish only the snapshot
  // whose bytes passed the scans, regardless of what the check writes.
  for (const entry of readdirSync(directory)) rmSync(join(directory, entry), { recursive: true, force: true });
  for (const [path, file] of files) {
    if (file.mode === '120000') continue;
    mkdirSync(dirname(join(directory, path)), { recursive: true });
    writeFileSync(join(directory, path), file.bytes);
    chmodSync(join(directory, path), file.mode === '100755' ? 0o755 : 0o644);
  }
  for (const [path, file] of files) {
    if (file.mode !== '120000') continue;
    const target = file.bytes.toString();
    const destination = posix.normalize(posix.join(posix.dirname(path), target));
    if (posix.isAbsolute(target) || target.includes('\\') || destination === '..' || destination.startsWith('../')) {
      throw new Error(`Unsafe symlink: ${path} -> ${target}`);
    }
    if (destination !== '.') safePath(destination);
    if ([...files.keys()].some((other) => other.startsWith(`${path}/`))) throw new Error(`Symlink is a directory: ${path}`);
    mkdirSync(dirname(join(directory, path)), { recursive: true });
    symlinkSync(target, join(directory, path));
  }
  // Resolving after all links exist also checks chains containing '..', which
  // lexical normalization alone cannot keep inside the snapshot.
  for (const [path, file] of files) {
    if (file.mode !== '120000') continue;
    const destination = relative(realpathSync.native(directory), realpathSync.native(join(directory, path)));
    if (destination === '..' || destination.startsWith('../')) throw new Error(`Unsafe symlink: ${path}`);
  }
}

export function scanMarkers(files, text, allowances = []) {
  const markers = markerList(text);
  const violations = [];
  for (const [path, { bytes }] of files) {
    const blocked = markers.filter((marker) => !allowances.some((entry) =>
      entry.marker.toLowerCase() === marker.toLowerCase() && entry.paths.some((glob) => matchesGlob(path, glob))));
    bytes.toString().split('\n').forEach((line, index) => {
      for (const marker of blocked) {
        if (line.toLowerCase().includes(marker.toLowerCase())) violations.push(`${path}:${index + 1}: private marker ${marker}`);
      }
    });
  }
  if (violations.length) throw new Error(violations.join('\n'));
}

export function exportProject({ root, project, push = false, tempRoot = tmpdir() }, { run, scanDirectory, syncMetadata, log }) {
  if (!/^[\w.-]+(?:\/[\w.-]+)*$/.test(project) || project.split('/').some((part) => part === '.' || part === '..' || part === '.git')) {
    throw new Error('Project must be a repository-relative directory');
  }
  const git = (args, cwd = root) => run('git', args, { cwd });
  const clean = () => {
    if (git(['status', '--porcelain', '--untracked-files=all']).toString().trim()) {
      throw new Error('Refusing to push from a dirty ai-labs worktree');
    }
  };
  if (push) clean();
  const sha = git(['rev-parse', 'HEAD']).toString().trim();
  const unchanged = () => {
    clean();
    if (git(['rev-parse', 'HEAD']).toString().trim() !== sha) throw new Error('HEAD changed during export');
  };
  const readTree = (source) => git(['ls-tree', '-r', '-z', sha, '--', `${source}/`]).toString().split('\0').filter(Boolean).map((entry) => {
    const [, mode, type, oid, path] = /^(\d+) (\w+) ([\da-f]+)\t([\s\S]+)$/.exec(entry) ?? [];
    if (!path?.startsWith(`${source}/`)) throw new Error('Invalid git tree entry');
    return { mode, type, oid, path: path.slice(source.length + 1) };
  });
  const entries = readTree(project);
  const config = entries.find((entry) => entry.path === 'showcase/showcase.toml');
  if (!config || config.mode !== '100644' && config.mode !== '100755') throw new Error(`${project}/showcase/showcase.toml must be committed at HEAD`);
  const markers = readFileSync(new URL('markers.txt', import.meta.url), 'utf8');
  const settings = readSettings(git(['cat-file', 'blob', config.oid]).toString(), project, markers);
  const files = new Map();
  const add = (entry, path) => {
    safePath(path);
    if (entry.type !== 'blob') throw new Error(`Cannot export ${entry.path}: not a file`);
    // A public file replaces a directory, and a public directory replaces a
    // file at the same path, just as the overlay at the repository root does.
    for (const existing of files.keys()) {
      if (existing.startsWith(`${path}/`) || path.startsWith(`${existing}/`)) files.delete(existing);
    }
    files.set(path, { mode: entry.mode, bytes: git(['cat-file', 'blob', entry.oid]) });
  };
  for (const entry of entries) if (isIncluded(entry.path, settings)) add(entry, entry.path);
  for (const mount of settings.mount ?? []) {
    const mountedEntries = readTree(mount.source);
    if (!mountedEntries.length) throw new Error(`${mount.source}: mount source must be a folder committed at HEAD`);
    for (const entry of mountedEntries) {
      if (!mount.include.some((glob) => matchesGlob(entry.path, glob)) ||
          (mount.exclude ?? []).some((glob) => matchesGlob(entry.path, glob))) continue;
      const path = `${mount.target ?? mount.source}/${entry.path}`;
      for (const existing of files.keys()) {
        if (existing === path || existing.startsWith(`${path}/`) || path.startsWith(`${existing}/`)) {
          throw new Error(`Mount collision at export path: ${path} (conflicts with ${existing})`);
        }
      }
      add(entry, path);
    }
  }
  for (const entry of entries) {
    if (entry.path.startsWith('showcase/public/')) add(entry, entry.path.slice('showcase/public/'.length));
  }
  scanMarkers(files, markers, settings.allow_marker);
  const directory = mkdtempSync(join(tempRoot, 'showcase-export-'));
  let clone;
  try {
    writeSnapshot(directory, files);
    scanDirectory(directory);
    const output = run('sh', ['-c', settings.check], { cwd: directory });
    if (output?.length) log(output.toString().trimEnd());
    writeSnapshot(directory, files);
    if (push) {
      unchanged();
      clone = mkdtempSync(join(tempRoot, 'showcase-push-'));
      run('git', ['clone', '--', `https://github.com/${settings.repo}.git`, clone], { cwd: root });
      for (const entry of readdirSync(clone)) {
        if (entry !== '.git') rmSync(join(clone, entry), { recursive: true, force: true });
      }
      for (const entry of readdirSync(directory)) cpSync(join(directory, entry), join(clone, entry), { recursive: true, verbatimSymlinks: true });
      // The allowlist, rather than an exported .gitignore, owns the snapshot.
      git(['add', '--all', '--force'], clone);
      const hasChanges = git(['diff', '--cached', '--name-only', '-z'], clone).length > 0;
      if (!hasChanges) {
        log('No changes; nothing to push.');
      } else {
        git(['commit', '-m', `Sync from ai-labs@${sha.slice(0, 7)}`], clone);
        unchanged();
        run('git', ['push', 'origin', 'HEAD'], { cwd: clone });
      }
      syncMetadata(settings, { cwd: clone });
      if (hasChanges) log(`Pushed ${settings.repo}.`);
    }
    return directory;
  } catch (error) {
    rmSync(directory, { recursive: true, force: true });
    throw error;
  } finally {
    if (clone) rmSync(clone, { recursive: true, force: true });
  }
}

export function handleCLI(args, { cwd, run, scanDirectory, syncMetadata, exportProject: exportSnapshot, stdout, stderr }) {
  try {
    const project = args.find((arg) => arg !== '--push');
    if (!project || args.filter((arg) => arg !== '--push').length !== 1 || args.filter((arg) => arg === '--push').length > 1) {
      throw new Error('Usage: node scripts/showcase/export.js <project> [--push]');
    }
    const root = run('git', ['rev-parse', '--show-toplevel'], { cwd }).toString().trim();
    stdout(exportSnapshot({ root, project, push: args.includes('--push') }, { run, scanDirectory, syncMetadata, log: stderr }));
    return 0;
  } catch (error) {
    stderr(error.message);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = handleCLI(process.argv.slice(2), {
    cwd: process.cwd(), run: runCommand, scanDirectory: createSecretScanner({ run: runCommand }),
    syncMetadata: createMetadataSync({ run: runCommand }), exportProject,
    stdout: (message) => console.log(message), stderr: (message) => console.error(message)
  });
}
