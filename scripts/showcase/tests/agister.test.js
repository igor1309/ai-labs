import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, matchesGlob, resolve } from 'node:path';
import { isIncluded, readSettings } from '../export.js';

const root = resolve(import.meta.dirname, '../../..');
const settings = readSettings(readFileSync(join(root, 'agister/showcase/showcase.toml'), 'utf8'), 'agister');

function put(directory, path, bytes, mode = 0o644) {
  const file = join(directory, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, bytes, { mode });
}

function temporary(t) {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'agister-showcase-test-')));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

test('agister projection carries code and its inputs while excluding private trees and the installer test', () => {
  assert.equal(settings.repo, 'igor1309/agister');
  assert.equal(settings.homepage, 'https://igor1309.dev/agister/');
  assert.deepEqual(settings.allow_marker, [
    { marker: 'agister', paths: ['**'] }, { marker: '.agister/', paths: ['**'] },
  ]);
  for (const path of ['architecture_test.go', 'home_test.go', 'cmd/agister/main.go', 'core/call/call_test.go',
    'e2e/e2e_test.go', 'core/call/call.feature', 'go.mod', 'go.sum', 'home/prompts/implement.md',
    'home/agents/bash.toml', 'skills/agister/SKILL.md', 'scripts/check-public.sh']) {
    assert.equal(isIncluded(path, settings), true, path);
  }
  for (const path of ['archive/main.go', 'archive/go.mod', 'research/example.go', 'backlog/case.feature',
    '.agister/settings.go', 'docs/example.go', 'AGENTS.md', 'README.md', 'scripts/loop/install.sh',
    'scripts/loop/example.go', 'install_test.go', 'showcase/showcase.toml', 'showcase/AGENTS.md']) {
    assert.equal(isIncluded(path, settings), false, path);
  }
  assert.equal(existsSync(join(root, 'agister/install_test.go')), true);
  assert.equal(existsSync(join(root, 'agister/showcase/public/LICENSE')), false);
  assert.match(readFileSync(join(root, 'agister/showcase/public/README.md'), 'utf8'), /^# Agister\n\n\S/);
  assert.equal(settings.mount.length, 1);
  const mount = settings.mount[0];
  assert.equal(mount.source, 'gokit');
  assert.equal(mount.target, 'gokit');
  const included = (path) => mount.include.some((glob) => matchesGlob(path, glob)) &&
    !(mount.exclude ?? []).some((glob) => matchesGlob(path, glob));
  for (const path of ['go.mod', 'module_test.go', 'clocktest/clocktest.go', 'tree/go.mod', 'tree/go.sum',
    'tree/tree.go', 'tree/tree_test.go', 'tree/tree.feature', 'scripts/test.sh', 'scripts/test_test.go']) {
    assert.equal(included(path), true, path);
  }
  for (const path of ['README.md', 'AGENTS.md', 'docs/private.md', 'scripts/other.sh']) {
    assert.equal(included(path), false, path);
  }
});

// Contract test: Go resolves the public workspace's replacements over the private module's sibling paths.
test('public workspace builds and vets both local dependencies without a sibling gokit', (t) => {
  const directory = temporary(t);
  // The stub packages use no third-party imports, so their fixture needs
  // only the local requirements and the unchanged private replacements.
  const privateModule = readFileSync(join(root, 'agister/go.mod'), 'utf8');
  put(directory, 'go.mod', privateModule.replace(/require \(\n[^)]*\)\n/g,
    (block) => block.includes('// indirect') ? '' : block));
  put(directory, 'go.work', readFileSync(join(root, 'agister/showcase/public/go.work')));
  for (const name of ['gokit', 'gokit/tree']) {
    put(directory, `${name}/go.mod`, `module github.com/igor1309/ai-labs/${name}\n\ngo 1.24\n`);
    put(directory, `${name}/value.go`, 'package dependency\nconst Value = 1\n');
  }
  put(directory, 'main.go', `package main
import (
  kit "github.com/igor1309/ai-labs/gokit"
  tree "github.com/igor1309/ai-labs/gokit/tree"
)
func main() { println(kit.Value + tree.Value) }
`);
  const env = { ...process.env, GOWORK: join(directory, 'go.work'), GOPATH: join(directory, 'gopath'),
    GOTOOLCHAIN: 'local', GOPROXY: 'off', GOSUMDB: 'off' };
  for (const args of [
    ['list', '-m', '-f', '{{.Replace.Dir}}', 'github.com/igor1309/ai-labs/gokit', 'github.com/igor1309/ai-labs/gokit/tree'],
    ['build', './...'], ['vet', './...'],
  ]) {
    const result = spawnSync('go', args, { cwd: directory, env, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    if (args[0] === 'list') assert.deepEqual(result.stdout.trim().split('\n'), [join(directory, 'gokit'), join(directory, 'gokit/tree')]);
  }
});

function checkFixture(t, { featureLines = 100, testLines = 1000, unformatted = '', fail = '' } = {}) {
  const directory = temporary(t);
  put(directory, 'scripts/check-public.sh', readFileSync(join(root, 'agister/scripts/check-public.sh')));
  put(directory, 'go.mod', 'module example.test/public\n');
  put(directory, 'go.work', 'use .\n');
  put(directory, 'case.feature', 'line\n'.repeat(featureLines));
  put(directory, 'case_test.go', '// line\n'.repeat(testLines));
  put(directory, 'gokit/go.mod', 'module example.test/gokit\n');
  put(directory, 'gokit/ignored_test.go', '// line\n'.repeat(1001));
  put(directory, 'gokit/scripts/test.sh', `#!/bin/sh
test "$GOWORK" = off || exit 91
printf 'gokit check\n' >> "$CHECK_RECORDS"
test "$CHECK_FAIL" != gokit
`);
  put(directory, 'bin/gofmt', `#!/bin/sh
printf 'gofmt %s\n' "$*" >> "$CHECK_RECORDS"
if test -n "$CHECK_UNFORMATTED"; then printf '%s\n' "$CHECK_UNFORMATTED"; fi
`, 0o755);
  put(directory, 'bin/go', `#!/bin/sh
test "$GOWORK" = "$CHECK_ROOT/go.work" || exit 92
printf 'go %s\n' "$*" >> "$CHECK_RECORDS"
if test "$1" = test; then
  test "\${AGISTER_E2E+x}" != x || exit 93
fi
test "$CHECK_FAIL" != "$1"
`, 0o755);
  const result = spawnSync('sh', ['-c', settings.check], {
    cwd: directory, encoding: 'utf8', env: { ...process.env,
      PATH: `${directory}/bin:${process.env.PATH}`, GOWORK: '/outside/go.work', AGISTER_E2E: '1',
      CHECK_ROOT: directory, CHECK_RECORDS: join(directory, 'records'), CHECK_FAIL: fail, CHECK_UNFORMATTED: unformatted,
    },
  });
  assert.ifError(result.error);
  const records = readFileSync(join(directory, 'records'), 'utf8').trim().split('\n');
  return { ...result, records };
}

// Contract test: sh executes the exported check with go and gofmt supplied as spies.
test('public check enforces module format, size, build, vet and race tests, with e2e unset', (t) => {
  const result = checkFixture(t);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.deepEqual(result.records, ['gokit check', 'gofmt -l ./case_test.go', 'go build ./...', 'go vet ./...',
    'go test -race -count=1 -timeout 1m ./...']);
});

for (const [name, options, diagnostic] of [
  ['format', { unformatted: './case_test.go' }, /gofmt needed:\n\.\/case_test.go/],
  ['feature limit', { featureLines: 101 }, /case.feature: 101 lines, limit 100/],
  ['test limit', { testLines: 1001 }, /case_test.go: 1001 lines, limit 1000/],
]) {
  // Contract test: the check rejects bad files in a temporary export with spies for Go tooling.
  test(`public check rejects ${name} before building`, (t) => {
    const result = checkFixture(t, options);
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stdout, diagnostic);
    assert.ok(!result.records.some((line) => line.startsWith('go ')), result.records.join('\n'));
  });
}

for (const stage of ['gokit', 'build', 'vet', 'test']) {
  // Contract test: the check propagates a failed dependency check or Go command's exit status.
  test(`public check fails when ${stage} fails`, (t) => {
    const result = checkFixture(t, { fail: stage });
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.equal(result.records.at(-1), stage === 'gokit' ? 'gokit check' :
      stage === 'test' ? 'go test -race -count=1 -timeout 1m ./...' : `go ${stage} ./...`);
  });
}
