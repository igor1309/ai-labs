import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { it } from 'node:test';

const SCRIPT = resolve('scripts/handoff-check.py');

function sh(cwd, ...args) {
  return execFileSync(args[0], args.slice(1), { cwd, encoding: 'utf8' });
}

function withRepo(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'handoff-check-test-'));
  try {
    sh(dir, 'git', 'init', '-q');
    sh(dir, 'git', 'config', 'user.email', 't@example.com');
    sh(dir, 'git', 'config', 'user.name', 't');
    writeFileSync(join(dir, 'a.go'), 'package a\n\nconst Mode = "fixed"\n');
    writeFileSync(join(dir, 'b.go'), 'package a\n');
    writeFileSync(join(dir, '.gitignore'), 'ignored.txt\n');
    sh(dir, 'git', 'add', '-A');
    sh(dir, 'git', 'commit', '-q', '-m', 'init');
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const run = (dir, ...args) => spawnSync('python3', [SCRIPT, ...args], { cwd: dir, encoding: 'utf8' });

it('reports claimed-vs-changed mismatches both ways', () => {
  withRepo((dir) => {
    writeFileSync(join(dir, 'a.go'), 'package a\n\nconst Mode = "fixed"\n// edit\n'); // modified
    writeFileSync(join(dir, 'new.go'), 'package a\n'); // untracked
    writeFileSync(join(dir, 'ignored.txt'), 'x'); // ignored: not changed
    rmSync(join(dir, 'b.go')); // deleted

    const result = run(dir, '--claimed', 'a.go', 'new.go', 'ghost.go');
    assert.equal(result.status, 1, result.stdout);
    assert.match(result.stdout, /^FAIL {2}changed but not claimed: b\.go$/m);
    assert.match(result.stdout, /^FAIL {2}claimed but not changed: ghost\.go$/m);
    assert.doesNotMatch(result.stdout, /ignored\.txt|not claimed: a\.go|not claimed: new\.go/);
    assert.match(result.stdout, /2 problem\(s\), 3 changed file\(s\)/);

    const clean = run(dir, '--claimed', 'a.go', 'b.go', 'new.go');
    assert.equal(clean.status, 0, clean.stdout);
  });
});

it('passes a clean hand-off', () => {
  withRepo((dir) => {
    writeFileSync(join(dir, 'b.go'), 'package a\n// done\n');
    const result = run(dir, '--claimed', 'b.go');
    assert.equal(result.status, 0, result.stdout);
    assert.match(result.stdout, /0 problem\(s\)/);
  });
});
