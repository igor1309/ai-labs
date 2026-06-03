// `commit` step: records that a scope was audited (its commit + timestamp) and
// prunes state for scopes no longer in the registry. Runs after a successful
// audit in the nightly Lobster pipeline.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { loadScopeIds } from './scopes.js';
import { commitScope, pruneState, readState, writeStateAtomic } from './state.js';

const defaultRegistry = fileURLToPath(
  new URL('../agent/scope-registry.json', import.meta.url),
);

async function main(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      registry: { type: 'string', default: defaultRegistry },
      state: { type: 'string' },
      scope: { type: 'string' },
      commit: { type: 'string' },
      at: { type: 'string' },
    },
  });
  for (const required of ['state', 'scope', 'commit']) {
    if (!values[required]) throw new Error(`--${required} is required`);
  }
  const registry = JSON.parse(await readFile(values.registry, 'utf8'));
  const scopeIds = loadScopeIds(registry);
  const current = await readState(values.state);
  const at = values.at ?? new Date().toISOString();
  const audited = commitScope(current, {
    scopeId: values.scope,
    commit: values.commit,
    at,
  });
  await writeStateAtomic(values.state, pruneState(audited, scopeIds));
}

await main(process.argv.slice(2));
