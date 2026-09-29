import assert from 'node:assert/strict';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { it } from 'node:test';

const SCRIPT = resolve('scripts/revert-check.py');

// The Go test blocks (after leaving a marker) when the mutation is applied.
const GO_SOURCE = `package mod

const Mode = "fixed"

func Fixed() bool { return Mode == "fixed" }

func Other() int { return 1 }
`;
const GO_TEST = `package mod

import (
	"os"
	"strconv"
	"testing"
	"time"
)

func TestFixed(t *testing.T) {
	if Mode == "blocked" {
		if m := os.Getenv("RC_MARKER"); m != "" {
			cwd, _ := os.Getwd()
			os.WriteFile(m, []byte(strconv.Itoa(os.Getpid())+"\\n"+cwd), 0o644)
		}
		time.Sleep(45 * time.Second)
	}
	if !Fixed() {
		t.Fatal("not fixed")
	}
}

func TestStillPasses(t *testing.T) {}

func TestOther(t *testing.T) {
	if Other() != 1 {
		t.Fatal("other")
	}
}
`;

function sh(cwd, ...args) {
  return execFileSync(args[0], args.slice(1), { cwd, encoding: 'utf8' });
}

// extra: more files for the module, by name.
function makeRepo(extra = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'revert-check-test-'));
  mkdirSync(join(dir, 'mod'));
  writeFileSync(join(dir, 'mod', 'go.mod'), 'module example.com/mod\n\ngo 1.21\n');
  writeFileSync(join(dir, 'mod', 'mod.go'), GO_SOURCE);
  writeFileSync(join(dir, 'mod', 'mod_test.go'), GO_TEST);
  for (const [name, text] of Object.entries(extra)) writeFileSync(join(dir, 'mod', name), text);
  sh(dir, 'git', 'init', '-q');
  sh(dir, 'git', 'config', 'user.email', 't@example.com');
  sh(dir, 'git', 'config', 'user.name', 't');
  sh(dir, 'git', 'add', '-A');
  sh(dir, 'git', 'commit', '-q', '-m', 'init');
  return dir;
}

function writeSpec(dir, body) {
  const path = join(dir, 'x.spec');
  writeFileSync(path, `module: mod\n\n${body}`);
  return path;
}

const CAUGHT = `[caught]
file: mod.go
find: const Mode = "fixed"
replace: const Mode = "broken"
test: . TestFixed
`;
const SURVIVES = `[survives]
file: mod.go
find: const Mode = "fixed"
replace: const Mode = "other"
test: . TestStillPasses
`;
const NOBUILD = `[nobuild]
file: mod.go
find: const Mode = "fixed"
replace: const Mode = 
test: . TestFixed
`;
const BLOCK = `[blocks]
file: mod.go
find: const Mode = "fixed"
replace: const Mode = "blocked"
test: . TestFixed
`;

function withRepo(fn, extra) {
  const dir = makeRepo(extra);
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function state(dir) {
  return {
    src: readFileSync(join(dir, 'mod', 'mod.go'), 'utf8'),
    status: sh(dir, 'git', 'status', '--porcelain'),
    worktrees: sh(dir, 'git', 'worktree', 'list'),
  };
}

const run = (dir, ...args) => spawnSync('python3', [SCRIPT, ...args], { cwd: dir, encoding: 'utf8' });

// Ends the run under the one-minute limit; revert-check.py cleans up on SIGTERM.
const runBounded = (dir, ...args) =>
  spawnSync('python3', [SCRIPT, ...args], { cwd: dir, encoding: 'utf8', timeout: 50_000, killSignal: 'SIGTERM' });

it('catches, rejects survivors and non-building mutations, and leaves the tree untouched', () => {
  withRepo((dir) => {
    const before = state(dir);
    const ok = run(dir, writeSpec(dir, CAUGHT));
    assert.equal(ok.status, 0, ok.stdout + ok.stderr);
    assert.match(ok.stdout, /^ok {4}caught$/m);
    assert.match(ok.stdout, /1\/1 mutations caught \(revision [0-9a-f]{40}\)/);

    const survivor = run(dir, writeSpec(dir, SURVIVES));
    assert.equal(survivor.status, 1);
    assert.match(survivor.stdout, /survives: still passing with the fix undone: TestStillPasses/);

    const broken = run(dir, writeSpec(dir, NOBUILD));
    assert.equal(broken.status, 1);
    assert.match(broken.stdout, /nobuild: the mutation does not build, so it proves nothing/);

    // x.spec is untracked and written by the test itself; it is the only difference.
    const after = state(dir);
    assert.equal(after.src, before.src);
    assert.equal(after.status.trim(), '?? x.spec');
    assert.equal(after.worktrees, before.worktrees);
  });
});

it('checks uncommitted and untracked changes, at a revision that is not HEAD', () => {
  withRepo((dir) => {
    // The fix exists only in the working tree: uncommitted edit plus an untracked file.
    writeFileSync(join(dir, 'mod', 'mod.go'), GO_SOURCE.replace('func Other() int { return 1 }', 'func Other() int { return other() }'));
    writeFileSync(join(dir, 'mod', 'extra.go'), 'package mod\n\nfunc other() int { return 1 }\n');
    const spec = writeSpec(dir, `[uncommitted]
file: mod.go
find: return other()
replace: return 2
test: . TestOther
`);
    const before = state(dir);
    const head = sh(dir, 'git', 'rev-parse', 'HEAD').trim();
    const result = run(dir, spec);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const rev = result.stdout.match(/^checking revision ([0-9a-f]{40})$/m)[1];
    assert.notEqual(rev, head);
    assert.match(result.stdout, new RegExp(`\\(revision ${rev}\\)`));
    assert.deepEqual(state(dir), before);

    // --rev pins a commit: at HEAD the untracked file and edit do not exist.
    const pinned = run(dir, '--rev', 'HEAD', spec);
    assert.equal(pinned.status, 1);
    assert.match(pinned.stdout, new RegExp(`checking revision ${head}`));
    assert.match(pinned.stdout, /find matches 0 times/);
  });
});

// A TestMain that ends the package with its own exit status, whatever the
// tests' PASS and FAIL lines say.
const exitingWith = (code) => `package mod

import (
	"os"
	"testing"
)

func TestMain(m *testing.M) {
	m.Run()
	os.Exit(${code})
}
`;

it('rejects a baseline whose go test fails even though the listed tests pass', () => {
  withRepo((dir) => {
    const result = runBounded(dir, writeSpec(dir, CAUGHT));
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stdout, /^FAIL {2}caught: go test fails before mutating: \. \(exit 1\)$/m);
    assert.match(result.stdout, /0\/1 mutations caught/);
  }, { 'main_test.go': exitingWith(1) });
});

it('does not count a mutation caught when go test exits 0 despite a failing test', () => {
  withRepo((dir) => {
    const result = runBounded(dir, writeSpec(dir, CAUGHT));
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stdout, /^FAIL {2}caught: go test exits 0 with the fix undone: \.$/m);
    assert.match(result.stdout, /0\/1 mutations caught/);
  }, { 'main_test.go': exitingWith(0) });
});

function killed(signal) {
  return new Promise((resolvePromise, reject) => {
    const dir = makeRepo();
    const markerDir = mkdtempSync(join(tmpdir(), 'revert-check-marker-'));
    const marker = join(markerDir, 'marker');
    const spec = writeSpec(dir, BLOCK);
    const before = state(dir);
    let testPid = null;
    let worktree = null;
    const child = spawn('python3', [SCRIPT, spec], {
      cwd: dir,
      env: { ...process.env, RC_MARKER: marker },
      stdio: 'ignore',
    });
    // The marker is an event that surely comes: the mutated test is running.
    const watchdog = setInterval(() => {
      if (!existsSync(marker)) return;
      const text = readFileSync(marker, 'utf8');
      if (!text.includes('\n')) return; // written but not complete yet
      clearInterval(watchdog);
      const [pid, cwd] = text.split('\n');
      testPid = Number(pid);
      worktree = dirname(dirname(cwd)); // the temp dir holding the worktree
      child.kill(signal);
    }, 50);
    const bound = setTimeout(() => {
      child.kill('SIGKILL');
      finish(new Error('marker never appeared'));
    }, 50000);
    let done = false;
    function finish(err) {
      if (done) return;
      done = true;
      clearInterval(watchdog);
      clearTimeout(bound);
      if (testPid) { try { process.kill(testPid, 'SIGKILL'); } catch {} }
      try { child.kill('SIGKILL'); } catch {}
      try {
        if (!err) {
          const after = state(dir);
          assert.equal(after.src, before.src);
          assert.equal(after.status.trim(), '?? x.spec');
          if (signal === 'SIGTERM') {
            assert.equal(child.exitCode, 143);
            assert.equal(existsSync(worktree), false, 'worktree dir left behind');
            assert.equal(after.worktrees, before.worktrees);
          } else {
            // SIGKILL: only the temporary worktree may be left, and prune says so.
            assert.equal(existsSync(worktree), true);
            rmSync(worktree, { recursive: true, force: true });
            sh(dir, 'git', 'worktree', 'prune');
            assert.equal(state(dir).worktrees, before.worktrees);
          }
        }
      } catch (e) {
        err = e;
      }
      if (worktree) rmSync(worktree, { recursive: true, force: true });
      rmSync(dir, { recursive: true, force: true });
      rmSync(markerDir, { recursive: true, force: true });
      err ? reject(err) : resolvePromise();
    }
    child.on('exit', () => setTimeout(() => finish(), 0));
  });
}

it('a SIGKILLed run leaves the caller tree untouched', async () => {
  await killed('SIGKILL');
});

it('a SIGTERMed run removes its temporary worktree', async () => {
  await killed('SIGTERM');
});
