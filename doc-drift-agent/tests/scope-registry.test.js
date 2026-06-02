import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Repo root is two levels up from doc-drift-agent/tests/.
const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const registry = JSON.parse(
  readFileSync(new URL('../agent/scope-registry.json', import.meta.url)),
);

// Derive the set of top-level "projects with docs" from the working tree, using
// the registry's own exclusion list as the single source of truth.
function deriveProjects() {
  const exclude = new Set(registry.excludedTopLevel);
  return readdirSync(repoRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !exclude.has(d.name))
    .map((d) => d.name)
    .filter(
      (n) =>
        existsSync(`${repoRoot}${n}/README.md`) ||
        (existsSync(`${repoRoot}${n}/docs`) &&
          statSync(`${repoRoot}${n}/docs`).isDirectory()),
    )
    .sort();
}

test('project scopes exactly match the top-level projects with README/docs', () => {
  const projectScopes = Object.keys(registry.scopes)
    .filter((s) => s !== 'readmes')
    .sort();
  assert.deepEqual(
    projectScopes,
    deriveProjects(),
    'a new project with docs needs a scope; a scope for a removed project must go',
  );
});

test('every project scope points at an existing dir with a non-empty doc set', () => {
  for (const [id, scope] of Object.entries(registry.scopes)) {
    if (id === 'readmes') continue;
    assert.ok(existsSync(`${repoRoot}${id}`), `scope '${id}' has no top-level dir`);
    assert.ok(
      Array.isArray(scope.docs) && scope.docs.length > 0,
      `scope '${id}' has an empty doc set`,
    );
    assert.ok(
      existsSync(`${repoRoot}${scope.docs[0]}`),
      `scope '${id}' README missing: ${scope.docs[0]}`,
    );
    // A project that has a docs/ tree must have it in its scope's doc set.
    if (
      existsSync(`${repoRoot}${id}/docs`) &&
      statSync(`${repoRoot}${id}/docs`).isDirectory()
    ) {
      assert.ok(
        scope.docs.some((d) => d.startsWith(`${id}/docs/`)),
        `scope '${id}' has a docs/ tree but its doc set omits it`,
      );
    }
  }
});

test('the readmes scope covers the root README and every project README', () => {
  const expected = ['README.md', ...deriveProjects().map((p) => `${p}/README.md`)].sort();
  assert.deepEqual([...registry.scopes.readmes.docs].sort(), expected);
});
