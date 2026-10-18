import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { it } from 'node:test';

const SCRIPT = resolve('scripts/watch-pr.sh');

const NOT_REGISTERED = { exit: 1, stderr: "no checks reported on the 'b' branch" };

// A check as gh pr checks --json gives it, queued or started `ago` seconds
// before now.
function check(name, bucket, state, ago = 60) {
  return { name, bucket, state, startedAt: new Date(Date.now() - ago * 1000).toISOString().replace(/\.\d+Z$/, 'Z') };
}

function polled(...checks) {
  return { exit: 0, stdout: JSON.stringify(checks) };
}

// withFakeGh runs watch-pr.sh in a temp git repository with a fake gh first
// on PATH. The fake answers its nth call with answers[n], and the last
// answer from then on.
function withFakeGh(answers, env, fn) {
  const dir = mkdtempSync(join(tmpdir(), 'watch-pr-test-'));
  try {
    execFileSync('git', ['init', '-q'], { cwd: dir });
    const bin = join(dir, 'bin');
    mkdirSync(bin);
    const calls = join(dir, 'calls');
    writeFileSync(calls, '');
    answers.forEach(({ exit, stdout = '', stderr = '' }, n) => {
      writeFileSync(join(dir, `out-${n + 1}`), stdout);
      writeFileSync(join(dir, `err-${n + 1}`), stderr);
      writeFileSync(join(dir, `exit-${n + 1}`), String(exit));
    });
    writeFileSync(
      join(bin, 'gh'),
      `#!/usr/bin/env bash
echo "$*" >> "${calls}"
n=$(wc -l < "${calls}" | tr -d ' ')
[ "$n" -gt ${answers.length} ] && n=${answers.length}
cat "${dir}/out-$n"
cat "${dir}/err-$n" >&2
exit "$(cat "${dir}/exit-$n")"
`,
    );
    chmodSync(join(bin, 'gh'), 0o755);
    const result = spawnSync('bash', [SCRIPT, '7'], {
      cwd: dir,
      encoding: 'utf8',
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, WATCH_PR_RETRY_DELAY: '0', WATCH_PR_INTERVAL: '0', ...env },
    });
    return fn(result, readFileSync(calls, 'utf8').trim().split('\n'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

it('waits for checks GitHub has not registered yet', () => {
  withFakeGh([NOT_REGISTERED, NOT_REGISTERED, polled(check('core', 'pass', 'SUCCESS'))], {}, (result, calls) => {
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.equal(calls.length, 3);
  });
});

it('waits while checks run, and passes once all pass or are skipped', () => {
  withFakeGh(
    [
      polled(check('core', 'pending', 'IN_PROGRESS'), check('lint', 'pass', 'SUCCESS')),
      polled(check('core', 'pass', 'SUCCESS'), check('lint', 'pass', 'SUCCESS'), check('other', 'skipping', 'SKIPPED')),
    ],
    {},
    (result, calls) => {
      assert.equal(result.status, 0, result.stdout + result.stderr);
      assert.equal(calls.length, 2);
    },
  );
});

it('reports a failing check at once, by name', () => {
  withFakeGh([polled(check('core', 'fail', 'FAILURE'), check('lint', 'pending', 'IN_PROGRESS'))], {}, (result, calls) => {
    assert.equal(result.status, 1);
    assert.equal(calls.length, 1);
    assert.match(result.stderr, /failed: core/);
  });
});

it('asks gh for the checks as JSON', () => {
  withFakeGh([polled(check('core', 'pass', 'SUCCESS'))], {}, (result, calls) => {
    assert.equal(result.status, 0);
    assert.equal(calls[0], 'pr checks 7 --json name,state,bucket,startedAt');
  });
});

it('gives up when no checks appear', () => {
  withFakeGh([NOT_REGISTERED], {}, (result, calls) => {
    assert.equal(result.status, 1);
    assert.equal(calls.length, 12);
  });
});

it('stops on a check no runner has picked up within the queue limit, naming it', () => {
  withFakeGh(
    [polled(check('agister-core / core', 'pending', 'QUEUED', 3600), check('core', 'pass', 'SUCCESS', 3600))],
    { WATCH_PR_QUEUE_LIMIT: '900' },
    (result, calls) => {
      assert.equal(result.status, 3);
      assert.equal(calls.length, 1);
      assert.match(result.stderr, /no runner: agister-core \/ core/);
    },
  );
});

it('keeps waiting on a check queued for less than the queue limit, and on one running past it', () => {
  withFakeGh(
    [
      polled(check('queued', 'pending', 'QUEUED', 60), check('running', 'pending', 'IN_PROGRESS', 3600)),
      polled(check('queued', 'pass', 'SUCCESS'), check('running', 'pass', 'SUCCESS')),
    ],
    { WATCH_PR_QUEUE_LIMIT: '900' },
    (result, calls) => {
      assert.equal(result.status, 0, result.stdout + result.stderr);
      assert.equal(calls.length, 2);
    },
  );
});

it('stops when checks are still pending at the overall limit', () => {
  withFakeGh([polled(check('core', 'pending', 'IN_PROGRESS'))], { WATCH_PR_LIMIT: '0' }, (result, calls) => {
    assert.equal(result.status, 4);
    assert.equal(calls.length, 1);
    assert.match(result.stderr, /still pending after 0s: core/);
  });
});
