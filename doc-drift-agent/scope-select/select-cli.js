// `select` step: prints the one scope id to audit this run (nothing when none
// are eligible). Eligibility is change-based — a scope qualifies on first audit,
// when its last-audited commit is unreachable, or when its paths changed since
// that commit (a local git diff against the source clone). Wired into the
// nightly Lobster pipeline ahead of the worker. The real-git path is
// integration-tested on the gateway (plan Phase 5); the decision logic is unit-
// tested with injected git facts in scope-select-eligibility.test.js.
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { eligibleScopes } from './eligibility.js';
import { loadScopeIds } from './scopes.js';
import { selectScope } from './select.js';
import { readState } from './state.js';

const defaultRegistry = fileURLToPath(
  new URL('../agent/scope-registry.json', import.meta.url),
);

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
    },
  });
  const registry = JSON.parse(await readFile(values.registry, 'utf8'));
  const scopeIds = loadScopeIds(registry);
  const state = values.state ? await readState(values.state) : {};
  const eligible = eligibleScopes({
    scopeIds,
    registry,
    state,
    runGit: gitRunner(values.repo),
  });
  const chosen = selectScope({ scopeIds, state, eligible });
  if (chosen) process.stdout.write(`${chosen}\n`);
}

await main(process.argv.slice(2));
