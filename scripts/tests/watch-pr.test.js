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

const OPEN = { state: 'OPEN', mergeable: 'MERGEABLE', headRefOid: '0123abcd' };

// One poll's answers: gh pr checks' JSON, the head commit's workflow runs,
// all completed unless given, and gh pr view's PR state.
function polled(checks, runs = [{ status: 'completed' }], view = OPEN) {
  return { exit: 0, stdout: JSON.stringify(checks), runs, view };
}

const REPORT = check('report', 'pass', 'SUCCESS');

// withFakeGh runs watch-pr.sh in a temp git repository with a fake gh first
// on PATH. Each poll starts with `pr view`: the fake's nth answers it with
// answers[n].view, and the last answer from then on; that poll's `pr
// checks` and `run list` give the same answer's checks and runs. `fn` gets
// the `pr checks` calls.
function withFakeGh(answers, env, fn) {
  const dir = mkdtempSync(join(tmpdir(), 'watch-pr-test-'));
  try {
    execFileSync('git', ['init', '-q'], { cwd: dir });
    const bin = join(dir, 'bin');
    mkdirSync(bin);
    const calls = join(dir, 'calls');
    const views = join(dir, 'views');
    writeFileSync(calls, '');
    writeFileSync(views, '');
    answers.forEach(({ exit, stdout = '', stderr = '', runs = [], view = OPEN }, n) => {
      writeFileSync(join(dir, `out-${n + 1}`), stdout);
      writeFileSync(join(dir, `err-${n + 1}`), stderr);
      writeFileSync(join(dir, `exit-${n + 1}`), String(exit));
      writeFileSync(join(dir, `runs-${n + 1}`), JSON.stringify(runs));
      writeFileSync(join(dir, `view-${n + 1}`), JSON.stringify(view));
    });
    writeFileSync(
      join(bin, 'gh'),
      `#!/usr/bin/env bash
n_file="${dir}/n"
case "$1 $2" in
  "pr view")
    echo x >> "${views}"
    n=$(wc -l < "${views}" | tr -d ' ')
    [ "$n" -gt ${answers.length} ] && n=${answers.length}
    echo "$n" > "$n_file"
    cat "${dir}/view-$n"; exit 0 ;;
  "run list")
    [ "$4" = 0123abcd ] || exit 9
    cat "${dir}/runs-$(cat "$n_file")"; exit 0 ;;
esac
echo "$*" >> "${calls}"
n=$(cat "$n_file")
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
    const lines = readFileSync(calls, 'utf8').trim();
    return fn(result, lines ? lines.split('\n') : []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

it('waits for checks GitHub has not registered yet', () => {
  withFakeGh([NOT_REGISTERED, NOT_REGISTERED, polled([check('core', 'pass', 'SUCCESS'), REPORT])], {}, (result, calls) => {
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.equal(calls.length, 3);
  });
});

it('waits while checks run, and passes once all pass or are skipped', () => {
  withFakeGh(
    [
      polled([check('core', 'pending', 'IN_PROGRESS'), check('lint', 'pass', 'SUCCESS')]),
      polled([check('core', 'pass', 'SUCCESS'), check('lint', 'pass', 'SUCCESS'), check('other', 'skipping', 'SKIPPED'), REPORT]),
    ],
    {},
    (result, calls) => {
      assert.equal(result.status, 0, result.stdout + result.stderr);
      assert.equal(calls.length, 2);
    },
  );
});

it('reports a failing check at once, by name', () => {
  withFakeGh([polled([check('core', 'fail', 'FAILURE'), check('lint', 'pending', 'IN_PROGRESS')])], {}, (result, calls) => {
    assert.equal(result.status, 1);
    assert.equal(calls.length, 1);
    assert.match(result.stderr, /failed: core/);
  });
});

it('asks gh for the checks as JSON', () => {
  withFakeGh([polled([check('core', 'pass', 'SUCCESS'), REPORT])], {}, (result, calls) => {
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
    [polled([check('agister-core / core', 'pending', 'QUEUED', 3600), check('core', 'pass', 'SUCCESS', 3600)])],
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
      polled([check('queued', 'pending', 'QUEUED', 60), check('running', 'pending', 'IN_PROGRESS', 3600)]),
      polled([check('queued', 'pass', 'SUCCESS'), check('running', 'pass', 'SUCCESS'), REPORT]),
    ],
    { WATCH_PR_QUEUE_LIMIT: '900' },
    (result, calls) => {
      assert.equal(result.status, 0, result.stdout + result.stderr);
      assert.equal(calls.length, 2);
    },
  );
});

it('waits for the head commit\'s own runs, not the checks of the commit before', () => {
  withFakeGh(
    [
      polled([check('GitGuardian', 'pass', 'SUCCESS')], []),
      polled([check('GitGuardian', 'pass', 'SUCCESS')], [{ status: 'queued' }]),
      polled([check('GitGuardian', 'pass', 'SUCCESS'), check('core', 'pass', 'SUCCESS'), REPORT]),
    ],
    {},
    (result, calls) => {
      assert.equal(result.status, 0, result.stdout + result.stderr);
      assert.equal(calls.length, 3);
    },
  );
});

it('gives up when the head commit gets no workflow runs', () => {
  withFakeGh([polled([check('GitGuardian', 'pass', 'SUCCESS')], [])], {}, (result, calls) => {
    assert.equal(result.status, 1);
    assert.equal(calls.length, 12);
  });
});

it('stops when checks are still pending at the overall limit', () => {
  withFakeGh([polled([check('core', 'pending', 'IN_PROGRESS')])], { WATCH_PR_LIMIT: '1', WATCH_PR_INTERVAL: '0.2' }, (result, calls) => {
    assert.equal(result.status, 4);
    assert.ok(calls.length >= 1);
    assert.match(result.stderr, /still pending after 1s: core/);
  });
});

const TIMED_OUT = { exit: 1, stderr: 'Post "https://api.github.com/graphql": context deadline exceeded' };

it('keeps watching through a gh call that times out', () => {
  withFakeGh([polled([check('core', 'pending', 'IN_PROGRESS')]), TIMED_OUT, TIMED_OUT, polled([check('core', 'pass', 'SUCCESS'), REPORT])], {}, (result, calls) => {
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.equal(calls.length, 4);
  });
});

it('gives up after gh fails the given number of times in a row', () => {
  withFakeGh([TIMED_OUT], { WATCH_PR_GH_RETRIES: '3' }, (result, calls) => {
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.equal(calls.length, 3);
    assert.match(result.stderr, /gh failed 3 times in a row: .*context deadline exceeded/);
  });
});

it('does not pass on other checks while the required report check is missing', () => {
  withFakeGh([polled([check('GitGuardian', 'pass', 'SUCCESS')])], {}, (result, calls) => {
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.equal(calls.length, 12);
    assert.match(result.stderr, /CI never ran for this PR: required check report not reported/);
  });
});

it('fails when the required report check was skipped', () => {
  withFakeGh([polled([check('core', 'pass', 'SUCCESS'), check('report', 'skipping', 'SKIPPED')])], {}, (result) => {
    assert.equal(result.status, 1);
    assert.match(result.stderr, /failed: report skipped/);
  });
});

it('says why when CI never registers', () => {
  withFakeGh([NOT_REGISTERED], {}, (result) => {
    assert.match(result.stderr, /CI never ran for this PR: no checks reported/);
  });
});

it('stops on a conflicting PR, which GitHub runs no CI for, before asking for checks', () => {
  withFakeGh([{ ...NOT_REGISTERED, view: { ...OPEN, mergeable: 'CONFLICTING' } }], {}, (result, calls) => {
    assert.equal(result.status, 5, result.stdout + result.stderr);
    assert.equal(calls.length, 0);
    assert.match(result.stderr, /conflicts with its base/);
  });
});

it('finds a conflict GitHub reports only after checks went missing for a while', () => {
  const unknown = { ...NOT_REGISTERED, view: { ...OPEN, mergeable: 'UNKNOWN' } };
  withFakeGh(
    [...Array(15).fill(unknown), { ...NOT_REGISTERED, view: { ...OPEN, mergeable: 'CONFLICTING' } }],
    {},
    (result, calls) => {
      assert.equal(result.status, 5, result.stdout + result.stderr);
      assert.equal(calls.length, 15);
    },
  );
});

it('stops at the overall limit while mergeability stays unknown', () => {
  withFakeGh([{ ...NOT_REGISTERED, view: { ...OPEN, mergeable: 'UNKNOWN' } }], { WATCH_PR_LIMIT: '1', WATCH_PR_INTERVAL: '0.2' }, (result) => {
    assert.equal(result.status, 4, result.stdout + result.stderr);
    assert.match(result.stderr, /still pending after 1s: checks to be reported/);
  });
});

it('passes a PR that is already merged, and fails a closed one', () => {
  withFakeGh([{ ...NOT_REGISTERED, view: { ...OPEN, state: 'MERGED' } }], {}, (result, calls) => {
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.equal(calls.length, 0);
  });
  withFakeGh([{ ...NOT_REGISTERED, view: { ...OPEN, state: 'CLOSED' } }], {}, (result) => {
    assert.equal(result.status, 1);
    assert.match(result.stderr, /closed/);
  });
});
