// `select` step: prints the one scope id to audit this run (nothing when none
// are registered). Wired into the nightly Lobster pipeline ahead of the worker.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { loadScopeIds } from './scopes.js';
import { selectScope } from './select.js';
import { readState } from './state.js';

const defaultRegistry = fileURLToPath(
  new URL('../agent/scope-registry.json', import.meta.url),
);

async function main(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      registry: { type: 'string', default: defaultRegistry },
      state: { type: 'string' },
    },
  });
  const registry = JSON.parse(await readFile(values.registry, 'utf8'));
  const scopeIds = loadScopeIds(registry);
  const state = values.state ? await readState(values.state) : {};
  const chosen = selectScope({ scopeIds, state });
  if (chosen) process.stdout.write(`${chosen}\n`);
}

await main(process.argv.slice(2));
