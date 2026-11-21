import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { it } from 'node:test';

// A trunk with the generator, a minimal registry and three surfaces, pushed to a
// local bare "origin"; `gh` is a fake that records its calls.
function setup({ openPr = '' } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'dss-run-'));
  const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' });
  git(dir, 'init', '--quiet', '--bare', 'origin.git');
  const src = join(dir, 'src');
  mkdirSync(join(src, 'dashboard-sync-agent'), { recursive: true });
  mkdirSync(join(src, 'scripts'), { recursive: true });
  mkdirSync(join(src, 'docs'), { recursive: true });
  mkdirSync(join(src, 'alpha'), { recursive: true });
  cpSync('dashboard-sync-agent/sync.js', join(src, 'dashboard-sync-agent/sync.js'));
  cpSync('dashboard-sync-agent/run.sh', join(src, 'dashboard-sync-agent/run.sh'));
  writeFileSync(join(src, 'alpha/README.md'), '# Alpha\n');
  writeFileSync(join(src, 'README.md'), [
    '## Components', '', '| Component | Type | Description |', '|---|---|---|',
    '| alpha | Application | Alpha app. |', '',
    '## Structure', '', '| Path | Purpose |', '|---|---|', '| `docs/` | Docs |', '',
  ].join('\n'));
  writeFileSync(join(src, 'scripts/loc-dashboard.sh'), [
    '#!/usr/bin/env bash', '# ROW PROJECTS (update the loop in main when adding a new project):', '#   alpha',
    'check_project_drift() {', '  local known="alpha docs"', '}',
    'for proj in alpha; do', '  printf "%s 1 1 1 3\\n" "$proj"', 'done', '',
  ].join('\n'));
  writeFileSync(join(src, 'docs/products.html'), [
    '  <section class="products">', '    <h2 class="section-title">Products</h2>', '', '  </section>', '',
  ].join('\n'));
  writeFileSync(join(src, 'docs/loc-dashboard.html'), [
    'const data = [', '  { name: "alpha",                code:     1, tests:     1, docs:     1 },', '];', '',
  ].join('\n'));
  git(src, 'init', '--quiet', '-b', 'trunk');
  git(src, 'add', '.');
  git(src, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '--quiet', '-m', 'init');
  git(src, 'remote', 'add', 'origin', join(dir, 'origin.git'));
  git(src, 'push', '--quiet', 'origin', 'trunk');

  const bin = join(dir, 'bin');
  mkdirSync(bin);
  const log = join(dir, 'gh.log');
  writeFileSync(join(bin, 'gh'), `#!/usr/bin/env bash
echo "$*" >> ${log}
case "$1 $2" in
  "pr list") echo "${openPr}" ;;
  "pr create") echo "https://github.com/igor1309/ai-labs/pull/77" ;;
esac
`);
  chmodSync(join(bin, 'gh'), 0o755);
  const run = () => spawnSync('bash', [join(src, 'dashboard-sync-agent/run.sh')], {
    encoding: 'utf8',
    env: { ...process.env, REPO: src, PATH: `${bin}:${process.env.PATH}` },
  });
  const ghLog = () => { try { return readFileSync(log, 'utf8'); } catch { return ''; } };
  return { dir, src, run, ghLog, git };
}

it('opens a PR on the stable branch when a surface drifts, and stays silent when clean', () => {
  const { dir, run, ghLog, git } = setup();
  const first = run();
  assert.equal(first.status, 0, first.stderr);
  assert.match(first.stdout, /^\[dashboard-sync\] scheduled · /);
  assert.match(first.stdout, /3\/3 surfaces drifted, 0\/3 in error/);
  assert.match(first.stdout, /PR: https:\/\/github.com\/igor1309\/ai-labs\/pull\/77/);
  assert.match(ghLog(), /pr create --repo igor1309\/ai-labs --head dashboard-sync\/daily --base trunk/);
  const pushed = git(join(dir, 'origin.git'), 'show', 'dashboard-sync/daily:docs/products.html');
  assert.match(pushed, /<span class="product-name">Alpha<\/span>/);

  // Merge the sync branch into trunk: the next run finds nothing and prints nothing.
  git(join(dir, 'origin.git'), 'update-ref', 'refs/heads/trunk', 'refs/heads/dashboard-sync/daily');
  const second = run();
  assert.equal(second.status, 0, second.stderr);
  assert.equal(second.stdout, '');
});

it('updates the open PR instead of creating another', () => {
  const { run, ghLog } = setup({ openPr: '12' });
  const result = run();
  assert.equal(result.status, 0, result.stderr);
  assert.match(ghLog(), /pr edit 12 --repo igor1309\/ai-labs/);
  assert.doesNotMatch(ghLog(), /pr create/);
  assert.match(result.stdout, /PR: https:\/\/github.com\/igor1309\/ai-labs\/pull\/12/);
});
