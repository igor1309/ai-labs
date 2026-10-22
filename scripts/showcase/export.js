#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { chmodSync, cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, matchesGlob, posix, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parse } from '../release/lib/toml.js';

export function runCommand(command, args, { cwd }) {
  const result = spawnSync(command, args, { cwd, maxBuffer: 128 * 1024 * 1024 });
  if (result.error || result.status !== 0) {
    const output = Buffer.concat([result.stdout ?? Buffer.alloc(0), result.stderr ?? Buffer.alloc(0)]).toString();
    throw new Error(`${command}: ${result.error?.message ?? `exited ${result.status ?? result.signal}`}\n${output}`.trim());
  }
  return result.stdout;
}

export function readSettings(text) {
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

export function scanMarkers(files, text) {
  const markers = text.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith('#'));
  const violations = [];
  for (const [path, { bytes }] of files) {
    bytes.toString().split('\n').forEach((line, index) => {
      for (const marker of markers) {
        if (line.toLowerCase().includes(marker.toLowerCase())) violations.push(`${path}:${index + 1}: private marker ${marker}`);
      }
    });
  }
  if (violations.length) throw new Error(violations.join('\n'));
}

export function exportProject({ root, project, push = false, tempRoot = tmpdir() }, { run, log }) {
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
  const entries = git(['ls-tree', '-r', '-z', sha, '--', `${project}/`]).toString().split('\0').filter(Boolean).map((entry) => {
    const [, mode, type, oid, path] = /^(\d+) (\w+) ([\da-f]+)\t([\s\S]+)$/.exec(entry) ?? [];
    if (!path?.startsWith(`${project}/`)) throw new Error('Invalid git tree entry');
    return { mode, type, oid, path: path.slice(project.length + 1) };
  });
  const config = entries.find((entry) => entry.path === 'showcase/showcase.toml');
  if (!config || config.mode !== '100644' && config.mode !== '100755') throw new Error(`${project}/showcase/showcase.toml must be committed at HEAD`);
  const settings = readSettings(git(['cat-file', 'blob', config.oid]).toString());
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
  for (const entry of entries) {
    if (entry.path.startsWith('showcase/public/')) add(entry, entry.path.slice('showcase/public/'.length));
  }
  scanMarkers(files, readFileSync(new URL('markers.txt', import.meta.url), 'utf8'));
  const directory = mkdtempSync(join(tempRoot, 'showcase-export-'));
  let clone;
  let scannerDirectory;
  try {
    writeSnapshot(directory, files);
    run('gitleaks', ['version'], { cwd: directory });
    // Exported config, ignore files and inline allow comments must not weaken
    // the secret scan of a public snapshot.
    scannerDirectory = mkdtempSync(join(tempRoot, 'showcase-scanner-'));
    const scannerConfig = join(scannerDirectory, 'gitleaks.toml');
    const scannerIgnore = join(scannerDirectory, 'ignore');
    writeFileSync(scannerConfig, '[extend]\nuseDefault = true\n');
    writeFileSync(scannerIgnore, '');
    run('gitleaks', ['dir', directory, '--no-banner', '--redact', '--follow-symlinks',
      '--config', scannerConfig, '--gitleaks-ignore-path', scannerIgnore, '--ignore-gitleaks-allow'], { cwd: directory });
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
      if (!git(['diff', '--cached', '--name-only', '-z'], clone).length) {
        log('No changes; nothing to push.');
      } else {
        git(['commit', '-m', `Sync from ai-labs@${sha.slice(0, 7)}`], clone);
        unchanged();
        run('git', ['push', 'origin', 'HEAD'], { cwd: clone });
        const { repositoryTopics } = JSON.parse(run('gh', ['repo', 'view', settings.repo, '--json', 'repositoryTopics'], { cwd: clone }).toString());
        const remove = (repositoryTopics ?? []).map(({ name }) => name).filter((topic) => !settings.topics.includes(topic));
        run('gh', ['repo', 'edit', settings.repo, '--description', settings.description, '--homepage', settings.homepage,
          ...settings.topics.flatMap((topic) => ['--add-topic', topic]), ...remove.flatMap((topic) => ['--remove-topic', topic])], { cwd: clone });
        log(`Pushed ${settings.repo}.`);
      }
    }
    return directory;
  } catch (error) {
    rmSync(directory, { recursive: true, force: true });
    throw error;
  } finally {
    if (clone) rmSync(clone, { recursive: true, force: true });
    if (scannerDirectory) rmSync(scannerDirectory, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2);
    const project = args.find((arg) => arg !== '--push');
    if (!project || args.filter((arg) => arg !== '--push').length !== 1 || args.filter((arg) => arg === '--push').length > 1) {
      throw new Error('Usage: node scripts/showcase/export.js <project> [--push]');
    }
    const root = runCommand('git', ['rev-parse', '--show-toplevel'], { cwd: process.cwd() }).toString().trim();
    console.log(exportProject({ root, project, push: args.includes('--push') }, { run: runCommand, log: (message) => console.error(message) }));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
