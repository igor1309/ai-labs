// `select` step: prints the scope id(s) to audit this run (one per line, up to
// `--budget`; nothing when none are eligible). Eligibility is `changed ∪ stale`:
// a scope is change-eligible on first audit, when its last-audited commit is
// unreachable, or when its paths changed since that commit (a local git diff
// against the source clone); it is stale-eligible when not audited within the
// staleness window. Changed scopes are drained before stale ones. Wired into the
// nightly Lobster pipeline ahead of the worker. The real-git path is
// integration-tested on the gateway (plan Phase 5); the decision logic is unit-
// tested with injected git facts in scope-select-eligibility.test.js.
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { eligibleScopes, staleScopes } from './eligibility.js';
import { loadScopeIds } from './scopes.js';
import { selectScopes } from './select.js';
import { readState } from './state.js';

const defaultRegistry = fileURLToPath(
  new URL('../agent/scope-registry.json', import.meta.url),
);
const DAY_MS = 86400000;
const DEFAULT_STALENESS_DAYS = 30;

/// A git runner bound to `repo`, returning spawnSync's `{ status, stdout }`.
function gitRunner(repo) {
  return (args) => spawnSync('git', ['-C', repo, ...args], { encoding: 'utf8' });
}

async function main(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      registry: { type: 'string', default: defaultRegistry },
      state: { type: 'string' },
      repo: { type: 'string', default: process.cwd() },
      budget: { type: 'string', default: '1' },
      'staleness-days': { type: 'string', default: String(DEFAULT_STALENESS_DAYS) },
      now: { type: 'string' },
    },
  });
  const registry = JSON.parse(await readFile(values.registry, 'utf8'));
  const scopeIds = loadScopeIds(registry);
  const state = values.state ? await readState(values.state) : {};
  const now = values.now ? Date.parse(values.now) : Date.now();
  const windowMs = Number(values['staleness-days']) * DAY_MS;
  const changed = eligibleScopes({
    scopeIds,
    registry,
    state,
    runGit: gitRunner(values.repo),
  });
  const stale = staleScopes({ scopeIds, state, now, windowMs, registry });
  const selected = selectScopes({
    scopeIds,
    state,
    changed,
    stale,
    budget: Number(values.budget),
  });
  for (const id of selected) process.stdout.write(`${id}\n`);
}

await main(process.argv.slice(2));
