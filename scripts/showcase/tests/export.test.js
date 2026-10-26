import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { exportProject, isIncluded, readSettings, runCommand, scanMarkers } from '../export.js';
import { stringify } from '../../release/lib/toml.js';

const env = { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 'test@example.test', GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 'test@example.test' };
function git(root, ...args) {
  return execFileSync('git', ['-c', 'commit.gpgSign=false', '-c', 'core.hooksPath=/dev/null', ...args], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
}
function put(root, path, value) {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), value);
}
function list(root) {
  return readdirSync(root, { recursive: true, withFileTypes: true }).filter((entry) => !entry.isDirectory())
    .map((entry) => join(entry.parentPath, entry.name).slice(root.length + 1)).sort();
}
function fixture(t, settings = {}) {
  const base = mkdtempSync(join(tmpdir(), 'showcase-test-'));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const root = join(base, 'source');
  mkdirSync(root);
  git(root, 'init', '-b', 'trunk');
  const config = { repo: 'someone/game', description: 'A game', homepage: 'https://example.test', topics: ['react', 'game'],
    include: ['src/**', 'tests/**', 'docs/features/*.feature', 'README.md', 'scripts/test.sh'], exclude: ['tests/private.*'], check: 'check-game', ...settings };
  put(root, 'game/showcase/showcase.toml', stringify(config));
  put(root, 'game/src/main.js', 'const issue = "LAB-461";\n');
  const commit = () => { git(root, 'add', '-A'); git(root, 'commit', '-m', 'Private source commit'); };
  const calls = [];
  const messages = [];
  const run = (command, args, options) => {
    calls.push({ command, args, cwd: options.cwd });
    if (command === 'sh') return Buffer.alloc(0);
    if (command === 'git' && args[0] === 'clone') {
      assert.deepEqual(args, ['clone', '--', `https://github.com/${config.repo}.git`, args[3]]);
      assert.equal(options.cwd, root);
      assert.equal(dirname(args[3]), base);
      assert.match(args[3].slice(base.length + 1), /^showcase-push-/);
      return git(root, 'clone', '--', join(base, 'remote.git'), args[3]);
    }
    assert.equal(command, 'git');
    return git(options.cwd, ...args);
  };
  const scanDirectory = (directory) => calls.push({ command: 'scanDirectory', args: [directory], cwd: directory });
  const syncMetadata = ({ repo, description, homepage, topics }, { cwd }) =>
    calls.push({ command: 'syncMetadata', args: [{ repo, description, homepage, topics }], cwd });
  const invoke = (options = {}, execute = run, scan = scanDirectory, sync = syncMetadata) => exportProject({ root, project: 'game', tempRoot: base, ...options }, {
    run: execute, scanDirectory: scan, syncMetadata: sync, log: (value) => messages.push(value)
  });
  const remote = () => {
    const path = join(base, 'remote.git');
    git(base, 'init', '--bare', '-b', 'trunk', path);
    return path;
  };
  return { base, root, config, calls, messages, run, scanDirectory, syncMetadata, invoke, commit, remote };
}

test('exports exactly the HEAD allowlist, with the committed public overlay and executable bits', (t) => {
  const f = fixture(t, { include: ['**'] });
  for (const [path, value] of Object.entries({
    'README.md': 'private readme', 'docs/note.md': 'not allowlisted', 'src/nested/tool.js': 'committed bytes',
    'tests/private.test.js': 'excluded', 'showcase/AGENTS.md': 'private instructions',
    'showcase/draft.txt': 'draft', 'showcase/public/README.md': 'public readme', 'showcase/public/LICENSE': 'licence',
    'showcase/public/screenshots/home.bin': Buffer.from([0, 255, 37, 128]), 'scripts/test.sh': '#!/bin/sh\ntrue\n'
  })) put(f.root, `game/${path}`, value);
  // The broad allowlist still cannot export private showcase files.
  put(f.root, 'game/showcase/showcase.toml', stringify({ ...f.config, exclude: ['tests/private.*', 'docs/**'] }));
  chmodSync(join(f.root, 'game/scripts/test.sh'), 0o755);
  f.commit();
  put(f.root, 'game/src/main.js', 'uncommitted replacement');
  put(f.root, 'game/src/local.js', 'untracked');
  put(f.root, 'game/showcase/public/README.md', 'uncommitted overlay');
  put(f.root, 'game/showcase/public/new.md', 'untracked overlay');
  put(f.root, 'game/showcase/showcase.toml', 'not the committed configuration');
  rmSync(join(f.root, 'game/src/nested/tool.js'));
  let scannedFiles;
  const directory = f.invoke({}, f.run, (directory) => {
    f.scanDirectory(directory);
    scannedFiles = list(directory).map((path) => [path, readFileSync(join(directory, path))]);
  });
  assert.deepEqual(list(directory), ['LICENSE', 'README.md', 'screenshots/home.bin', 'scripts/test.sh', 'src/main.js', 'src/nested/tool.js']);
  assert.equal(readFileSync(join(directory, 'README.md'), 'utf8'), 'public readme');
  assert.equal(readFileSync(join(directory, 'src/nested/tool.js'), 'utf8'), 'committed bytes');
  assert.equal(readFileSync(join(directory, 'src/main.js'), 'utf8'), 'const issue = "LAB-461";\n');
  assert.deepEqual(readFileSync(join(directory, 'screenshots/home.bin')), Buffer.from([0, 255, 37, 128]));
  assert.ok(lstatSync(join(directory, 'scripts/test.sh')).mode & 0o111);
  const external = f.calls.filter(({ command }) => command !== 'git');
  assert.deepEqual(scannedFiles, list(directory).map((path) => [path, readFileSync(join(directory, path))]));
  assert.deepEqual(external.map(({ command, cwd }) => [command, cwd]), [['scanDirectory', directory], ['sh', directory]]);
  assert.deepEqual(external[0].args, [directory]);
  assert.deepEqual(external[1].args, ['-c', 'check-game']);
});

for (const repo of ['someone/game', 'another-owner/Other.Project-2']) {
  test(`push clones the complete configured repository URL for ${repo}`, (t) => {
    const f = fixture(t, { repo });
    f.commit();
    f.remote();
    f.invoke({ push: true });
    const clones = f.calls.filter(({ command, args }) => command === 'git' && args[0] === 'clone');
    assert.equal(clones.length, 1);
    assert.deepEqual(clones[0], {
      command: 'git', args: ['clone', '--', `https://github.com/${repo}.git`, clones[0].args[3]], cwd: f.root
    });
  });
}

test('public overlay replaces file/directory collisions and bypasses the source exclude list', (t) => {
  const f = fixture(t, { include: ['**'], exclude: ['README.md'] });
  put(f.root, 'game/src/a/old', 'old');
  put(f.root, 'game/src/b', 'old');
  put(f.root, 'game/showcase/public/src/a', 'new file');
  put(f.root, 'game/showcase/public/src/b/new', 'new child');
  put(f.root, 'game/showcase/public/README.md', 'public');
  f.commit();
  const dir = f.invoke();
  assert.deepEqual(list(dir), ['README.md', 'src/a', 'src/b/new', 'src/main.js']);
  assert.equal(readFileSync(join(dir, 'src/a'), 'utf8'), 'new file');
  assert.equal(readFileSync(join(dir, 'src/b/new'), 'utf8'), 'new child');
});

test('marker scanning names every file and line, treats literals case-insensitively, and leaves issue ids', () => {
  const files = new Map([['src/a', { bytes: Buffer.from('LAB-461\nAGISTER, MULTICA\n/Users/me\n_inbox\nai-labs.worktrees\n.agister/\nntfy\n') }]]);
  const markers = readFileSync(new URL('../markers.txt', import.meta.url), 'utf8');
  assert.throws(() => scanMarkers(files, markers), (error) => {
    for (const [index, marker] of ['agister', 'multica', '/Users/', '_inbox', 'ai-labs.worktrees', '.agister/', 'ntfy'].entries()) {
      const line = index === 0 ? 2 : index + 1;
      assert.ok(error.message.includes(`src/a:${line}: private marker ${marker}`), error.message);
    }
    return true;
  });
  assert.doesNotThrow(() => scanMarkers(new Map([['ok', { bytes: Buffer.from('LAB-461, axb') }]]), '# LAB-\na.b\n\n'));
});

test('markers in the overlay or source abort before the scanner, check or any publish operation', (t) => {
  for (const path of ['src/leak.js', 'showcase/public/README.md']) {
    const f = fixture(t);
    put(f.root, `game/${path}`, 'first\nMuLtIcA\n');
    f.commit();
    assert.throws(() => f.invoke({ push: true }), /:2: private marker multica/);
    assert.ok(f.calls.every(({ command }) => command === 'git'));
    assert.ok(!f.calls.some(({ args }) => args[0] === 'clone'));
  }
});

test('an overlay replaces a private source file before marker scanning', (t) => {
  const f = fixture(t);
  put(f.root, 'game/README.md', 'agister');
  put(f.root, 'game/showcase/public/README.md', 'public');
  f.commit();
  assert.equal(readFileSync(join(f.invoke(), 'README.md'), 'utf8'), 'public');
});

test('an exact public replacement of an included source file is scanned and exported', (t) => {
  const f = fixture(t);
  put(f.root, 'game/src/main.js', 'agister');
  put(f.root, 'game/showcase/public/src/main.js', 'public replacement');
  f.commit();
  const directory = f.invoke({}, f.run, (directory) => {
    f.scanDirectory(directory);
    assert.equal(readFileSync(join(directory, 'src/main.js'), 'utf8'), 'public replacement');
  });
  assert.deepEqual(list(directory), ['src/main.js']);
  assert.equal(readFileSync(join(directory, 'src/main.js'), 'utf8'), 'public replacement');
});

for (const path of ['src/MAIN.js', 'SRC/main.js', 'SRC', 'src/MAIN.js/child']) {
  test(`rejects a public path ${path} that aliases a project file before marker scanning`, (t) => {
    const f = fixture(t);
    put(f.root, 'game/src/main.js', 'agister');
    put(f.root, `game/showcase/public/${path}`, 'public');
    f.commit();
    assert.throws(() => f.invoke({ push: true }), (error) => {
      assert.match(error.message, /^Export path collision:/);
      assert.ok(error.message.includes(path), error.message);
      assert.ok(error.message.includes('src/main.js'), error.message);
      return true;
    });
    assert.ok(f.calls.every(({ command, args }) => command === 'git' && args[0] !== 'clone'));
    assert.deepEqual(readdirSync(f.base), ['source']);
  });

  for (const source of ['game', 'game/showcase/public']) {
    test(`rejects aliases within ${source}: ${path} and src/main.js`, (t) => {
      const f = fixture(t, { include: ['**'] });
      put(f.root, `${source}/src/main.js`, 'public');
      f.commit();
      const oid = git(f.root, 'rev-parse', `HEAD:${source}/src/main.js`).toString().trim();
      // Git's index can represent case aliases even when the working filesystem cannot.
      git(f.root, 'update-index', '--add', '--cacheinfo', '100644', oid, `${source}/${path}`);
      git(f.root, 'commit', '-m', 'Case aliases');
      assert.throws(() => f.invoke(), (error) => {
        assert.match(error.message, /^Export path collision:/);
        assert.ok(error.message.includes(path), error.message);
        assert.ok(error.message.includes('src/main.js'), error.message);
        return true;
      });
      assert.ok(f.calls.every(({ command }) => command === 'git'));
    });
  }
}

test('marker allowances use exported paths for source files, mounts and the public overlay', (t) => {
  const f = fixture(t, {
    mount: [{ source: 'gokit', target: 'lib', include: ['**'] }],
    allow_marker: [
      { marker: 'AGISTER', paths: ['src/main.js', 'README.md'] },
      { marker: '.Agister/', paths: ['src/main.js'] },
      { marker: '/users/', paths: ['lib/**/*test.js', 'tests/*test.js'] }
    ]
  });
  put(f.root, 'game/src/main.js', 'agister uses .agister/');
  put(f.root, 'game/tests/redaction.test.js', 'fixture: /Users/private');
  put(f.root, 'gokit/nested/path.test.js', 'fixture: /Users/private');
  put(f.root, 'game/showcase/public/README.md', 'Agister');
  f.commit();
  const dir = f.invoke();
  assert.equal(readFileSync(join(dir, 'src/main.js'), 'utf8'), 'agister uses .agister/');
  assert.equal(readFileSync(join(dir, 'tests/redaction.test.js'), 'utf8'), 'fixture: /Users/private');
  assert.equal(readFileSync(join(dir, 'lib/nested/path.test.js'), 'utf8'), 'fixture: /Users/private');
  assert.equal(readFileSync(join(dir, 'README.md'), 'utf8'), 'Agister');
  assert.ok(f.calls.some(({ command }) => command === 'scanDirectory'));
  assert.ok(f.calls.some(({ command }) => command === 'sh'));
});

for (const { path, content, marker } of [
  { path: 'src/other.js', content: 'AGISTER', marker: 'agister' },
  { path: 'src/main.js', content: 'agister\nmultica', marker: 'multica' },
  { path: 'src/main.js', content: '.agister/', marker: '.agister/' },
  { path: 'showcase/public/README.md', content: 'agister', marker: 'agister' }
]) {
  test(`marker allowance still rejects ${marker} in ${path}`, (t) => {
    const f = fixture(t, { allow_marker: [{ marker: 'agister', paths: ['src/main.js'] }] });
    put(f.root, `game/${path}`, content);
    f.commit();
    assert.throws(() => f.invoke(), (error) => {
      assert.ok(error.message.includes(`${path.replace('showcase/public/', '')}:`), error.message);
      assert.ok(error.message.includes(`private marker ${marker}`), error.message);
      assert.ok(!error.message.includes('src/main.js:1: private marker agister'), error.message);
      return true;
    });
    assert.ok(f.calls.every(({ command }) => command === 'git'));
  });
}

test('mounts select committed source-relative globs, default the target and precede the public overlay', (t) => {
  const f = fixture(t, { mount: [
    { source: 'gokit', include: ['go.mod', 'pkg/**', 'tool.sh'], exclude: ['pkg/private/**'] },
    { source: 'shared/data', target: 'assets', include: ['*.json'] }
  ] });
  for (const [path, bytes] of Object.entries({
    'gokit/go.mod': 'module example.test/gokit', 'gokit/pkg/main.go': 'package library',
    'gokit/pkg/private/key': 'multica', 'gokit/docs/private.md': 'agister',
    'gokit/pkg/overlaid.go': 'agister', 'gokit/tool.sh': '#!/bin/sh\ntrue\n',
    'shared/data/catalogue.json': '{"committed":true}', 'shared/data/notes.md': 'multica',
    'game/showcase/public/gokit/pkg/overlaid.go': 'public replacement'
  })) put(f.root, path, bytes);
  chmodSync(join(f.root, 'gokit/tool.sh'), 0o755);
  symlinkSync('main.go', join(f.root, 'gokit/pkg/alias.go'));
  f.commit();
  put(f.root, 'gokit/pkg/main.go', 'uncommitted');
  put(f.root, 'gokit/pkg/local.go', 'untracked');
  put(f.root, 'shared/data/catalogue.json', '{"committed":false}');
  rmSync(join(f.root, 'gokit/go.mod'));
  let scannedFiles;
  const directory = f.invoke({}, (command, args, options) => {
    if (command === 'sh') {
      assert.equal(readFileSync(join(options.cwd, 'gokit/pkg/main.go'), 'utf8'), 'package library');
      assert.equal(readFileSync(join(options.cwd, 'assets/catalogue.json'), 'utf8'), '{"committed":true}');
    }
    return f.run(command, args, options);
  }, (directory) => {
    f.scanDirectory(directory);
    scannedFiles = list(directory);
  });
  assert.deepEqual(list(directory), ['assets/catalogue.json', 'gokit/go.mod', 'gokit/pkg/alias.go',
    'gokit/pkg/main.go', 'gokit/pkg/overlaid.go', 'gokit/tool.sh', 'src/main.js']);
  assert.deepEqual(scannedFiles, list(directory));
  assert.equal(readFileSync(join(directory, 'gokit/go.mod'), 'utf8'), 'module example.test/gokit');
  assert.equal(readFileSync(join(directory, 'gokit/pkg/overlaid.go'), 'utf8'), 'public replacement');
  assert.equal(readlinkSync(join(directory, 'gokit/pkg/alias.go')), 'main.go');
  assert.ok(lstatSync(join(directory, 'gokit/tool.sh')).mode & 0o111);
});

for (const projectPath of ['src/main.js', 'src', 'src/main.js/child', 'SRC/MAIN.js', 'SRC', 'src/MAIN.js/child']) {
  test(`mounts reject collisions with project path ${projectPath} before the overlay`, (t) => {
    const f = fixture(t, { include: ['**'], mount: [{ source: 'gokit', target: 'src', include: ['**'] }] });
    rmSync(join(f.root, 'game/src'), { recursive: true });
    put(f.root, `game/${projectPath}`, 'project');
    put(f.root, 'gokit/main.js', 'mounted');
    put(f.root, 'game/showcase/public/src/main.js', 'overlay');
    f.commit();
    assert.throws(() => f.invoke(), (error) => {
      assert.match(error.message, /^Mount collision at export path: src\/main.js/);
      assert.ok(error.message.includes(`conflicts with ${projectPath}`), error.message);
      return true;
    });
    assert.ok(f.calls.every(({ command }) => command === 'git'));
  });
}

test('a case-aliased mount cannot overwrite a project file through a marker exemption', (t) => {
  const f = fixture(t, {
    mount: [{ source: 'gokit', target: 'src', include: ['**'] }],
    allow_marker: [{ marker: 'agister', paths: ['src/MAIN.js'] }]
  });
  put(f.root, 'gokit/MAIN.js', 'agister');
  f.commit();
  assert.throws(() => f.invoke(), /Mount collision at export path: src\/MAIN.js \(conflicts with src\/main.js\)/);
  assert.ok(f.calls.every(({ command }) => command === 'git'));
});

for (const target of ['lib', 'LIB']) {
  test(`overlapping mounts at ${target} cannot replace an earlier mounted file`, (t) => {
    const f = fixture(t, { mount: [
      { source: 'gokit', target: 'lib', include: ['**'] },
      { source: 'other', target, include: ['**'] }
    ] });
    put(f.root, 'gokit/main.go', 'first');
    put(f.root, 'other/main.go', 'second');
    f.commit();
    assert.throws(() => f.invoke(), (error) => {
      assert.equal(error.message, `Mount collision at export path: ${target}/main.go (conflicts with lib/main.go)`);
      return true;
    });
  });
}

test('mounted files still pass the marker gate and secret scanner', (t) => {
  for (const stage of ['marker', 'scanner']) {
    const f = fixture(t, { mount: [{ source: 'gokit', target: 'lib', include: ['**'] }] });
    put(f.root, 'gokit/main.go', stage === 'marker' ? 'multica' : 'secret fixture');
    f.commit();
    assert.throws(() => f.invoke({}, f.run, (directory) => {
      f.scanDirectory(directory);
      assert.equal(readFileSync(join(directory, 'lib/main.go'), 'utf8'), 'secret fixture');
      throw new Error('secret detected in lib/main.go');
    }), stage === 'marker' ? /lib\/main.go:1: private marker multica/ : /secret detected in lib\/main.go/);
    assert.ok(!f.calls.some(({ command }) => command === 'sh'));
    assert.deepEqual(readdirSync(f.base), ['source']);
  }
});

test('mounted symlinks cannot escape the exported snapshot', (t) => {
  const f = fixture(t, { mount: [{ source: 'gokit', include: ['**'] }] });
  mkdirSync(join(f.root, 'gokit'));
  symlinkSync('../../outside', join(f.root, 'gokit/escape'));
  f.commit();
  assert.throws(() => f.invoke(), /Unsafe symlink: gokit\/escape/);
  assert.ok(!f.calls.some(({ command }) => command === 'scanDirectory'));
});

test('mounted files must have safe export paths', (t) => {
  const f = fixture(t, { mount: [{ source: 'gokit', include: ['**'] }] });
  put(f.root, 'gokit/unsafe\\name', 'file');
  f.commit();
  assert.throws(() => f.invoke(), /Unsafe export path: gokit\/unsafe\\name/);
  assert.ok(!f.calls.some(({ command }) => command === 'scanDirectory'));
});

test('a mount requires a folder committed at HEAD', (t) => {
  for (const source of ['missing', 'file.txt']) {
    const f = fixture(t, { mount: [{ source, include: ['**'] }] });
    put(f.root, 'file.txt', 'a file');
    f.commit();
    put(f.root, 'missing/local.go', 'untracked');
    assert.throws(() => f.invoke(), /mount source must be a folder committed at HEAD/);
  }
});

for (const stage of ['scanner', 'check', 'clone', 'push', 'metadata']) {
  test(`${stage} failure stops the export, reports output and removes temporary directories`, (t) => {
    const f = fixture(t);
    f.commit();
    f.remote();
    const error = new Error(`${stage}: diagnostic output`);
    assert.throws(() => f.invoke({ push: true }, (command, args, options) => {
      if (stage === 'check' && command === 'sh' ||
          stage === 'clone' && command === 'git' && args[0] === 'clone' ||
          stage === 'push' && command === 'git' && args[0] === 'push') throw error;
      return f.run(command, args, options);
    }, (directory) => {
      f.scanDirectory(directory);
      if (stage === 'scanner') throw error;
    }, (settings, options) => {
      f.syncMetadata(settings, options);
      if (stage === 'metadata') throw error;
    }), error);
    assert.deepEqual(readdirSync(f.base).sort(), ['remote.git', 'source']);
    if (stage === 'scanner') assert.ok(!f.calls.some(({ command }) => command === 'sh'));
    if (['scanner', 'check', 'clone'].includes(stage)) {
      if (stage === 'scanner' || stage === 'check') assert.ok(!f.calls.some(({ args }) => args[0] === 'clone'));
      assert.ok(!f.calls.some(({ args }) => args[0] === 'push'));
      assert.ok(!f.calls.some(({ command }) => command === 'syncMetadata'));
    }
    if (stage === 'push') assert.ok(!f.calls.some(({ command }) => command === 'syncMetadata'));
  });
}

test('check runs in the snapshot, and generated files or changed inputs cannot enter the published snapshot', (t) => {
  const f = fixture(t);
  f.commit();
  const remote = f.remote();
  const directory = f.invoke({ push: true }, (command, args, options) => {
    if (command === 'sh') {
      assert.equal(readFileSync(join(options.cwd, 'src/main.js'), 'utf8'), 'const issue = "LAB-461";\n');
      put(options.cwd, 'src/main.js', 'changed by check');
      put(options.cwd, 'node_modules/dependency.js', 'not public');
      return Buffer.from('check output\n');
    }
    return f.run(command, args, options);
  });
  assert.deepEqual(list(directory), ['src/main.js']);
  assert.equal(git(remote, 'show', 'HEAD:src/main.js').toString(), 'const issue = "LAB-461";\n');
  assert.equal(git(remote, 'rev-list', '--count', 'HEAD').toString().trim(), '1');
  const sha = git(f.root, 'rev-parse', 'HEAD').toString().trim().slice(0, 7);
  assert.equal(git(remote, 'log', '-1', '--format=%s').toString().trim(), `Sync from ai-labs@${sha}`);
  assert.deepEqual(f.messages, ['check output', 'Pushed someone/game.']);
  assert.deepEqual(f.calls.filter(({ command }) => command === 'syncMetadata').map(({ args }) => args), [
    [{ repo: 'someone/game', description: 'A game', homepage: 'https://example.test', topics: ['react', 'game'] }]
  ]);
});

test('sync replaces all remote files except .git, includes ignored allowlisted files and is idempotent', (t) => {
  const f = fixture(t, { include: ['**', '.gitignore'] });
  put(f.root, 'game/.gitignore', 'src/main.js\n');
  git(f.root, 'add', '--force', 'game/src/main.js');
  f.commit();
  const remote = f.remote();
  const seed = join(f.base, 'seed');
  git(f.root, 'clone', remote, seed);
  put(seed, 'old.md', 'obsolete');
  put(seed, '.obsolete', 'obsolete');
  put(seed, 'old-dir/file', 'obsolete');
  git(seed, 'add', '-A');
  git(seed, 'commit', '-m', 'Existing public history');
  git(seed, 'push', 'origin', 'HEAD');
  f.invoke({ push: true });
  assert.deepEqual(git(remote, 'ls-tree', '-r', '--name-only', 'HEAD').toString().trim().split('\n'), ['.gitignore', 'src/main.js']);
  assert.equal(git(remote, 'rev-list', '--count', 'HEAD').toString().trim(), '2');
  const before = git(remote, 'rev-parse', 'HEAD').toString();
  const metadata = { description: 'A renamed game', homepage: 'https://new.example.test', topics: ['puzzle'] };
  put(f.root, 'game/showcase/showcase.toml', stringify({ ...f.config, ...metadata }));
  f.commit();
  f.calls.length = 0;
  f.invoke({ push: true });
  assert.equal(git(remote, 'rev-parse', 'HEAD').toString(), before);
  assert.equal(f.messages.at(-1), 'No changes; nothing to push.');
  assert.ok(!f.calls.some(({ command, args }) => command === 'git' && (args[0] === 'push' || args[0] === 'commit')));
  const clone = f.calls.find(({ command, args }) => command === 'git' && args[0] === 'clone').args[3];
  assert.deepEqual(f.calls.filter(({ command }) => command === 'syncMetadata'), [
    { command: 'syncMetadata', args: [{ repo: f.config.repo, ...metadata }], cwd: clone }
  ]);
});

for (const kind of ['modified', 'staged', 'untracked', 'deleted']) {
  test(`push refuses a ${kind} worktree, even outside the project`, (t) => {
    const f = fixture(t);
    put(f.root, 'outside.txt', 'original');
    f.commit();
    if (kind === 'deleted') rmSync(join(f.root, 'outside.txt'));
    else put(f.root, kind === 'untracked' ? 'new.txt' : 'outside.txt', 'dirty');
    if (kind === 'staged') git(f.root, 'add', '-A');
    assert.throws(() => f.invoke({ push: true }), /dirty ai-labs worktree/);
    assert.deepEqual(f.calls.map(({ args }) => args[0]), ['status']);
  });
}

test('push rechecks cleanliness and HEAD after the check', (t) => {
  for (const change of ['dirty', 'head']) {
    const f = fixture(t);
    f.commit();
    assert.throws(() => f.invoke({ push: true }, (command, args, options) => {
      if (command === 'sh') {
        put(f.root, 'new.txt', 'new');
        if (change === 'head') f.commit();
      }
      return f.run(command, args, options);
    }), change === 'dirty' ? /dirty ai-labs/ : /HEAD changed/);
    assert.ok(!f.calls.some(({ args }) => args[0] === 'clone'));
  }
});

test('push rechecks source changes made while cloning', (t) => {
  const f = fixture(t);
  f.commit();
  const remote = f.remote();
  assert.throws(() => f.invoke({ push: true }, (command, args, options) => {
    const result = f.run(command, args, options);
    if (command === 'git' && args[0] === 'clone') put(f.root, 'new.txt', 'dirty during clone');
    return result;
  }), /dirty ai-labs worktree/);
  assert.ok(!f.calls.some(({ command, args }) => command === 'syncMetadata' || args[0] === 'push'));
  assert.equal(git(remote, 'rev-list', '--all', '--count').toString().trim(), '0');
});

test('a missing existing repository cannot lead to creation, commit, push or metadata edits', (t) => {
  const f = fixture(t);
  f.commit();
  assert.throws(() => f.invoke({ push: true }), /does not exist/);
  assert.ok(!f.calls.some(({ command, args }) => command === 'syncMetadata' || args[0] === 'push' || args[0] === 'commit' || args[0] === 'init'));
});

test('relative symlinks preserve their committed targets in exports and syncs', (t) => {
  const f = fixture(t);
  symlinkSync('main.js', join(f.root, 'game/src/alias.js'));
  f.commit();
  const remote = f.remote();
  const dir = f.invoke({ push: true });
  assert.equal(readlinkSync(join(dir, 'src/alias.js')), 'main.js');
  assert.equal(git(remote, 'show', 'HEAD:src/alias.js').toString(), 'main.js');
  assert.match(git(remote, 'ls-tree', 'HEAD', 'src/alias.js').toString(), /^120000 blob/);
});

for (const target of ['/etc/passwd', '../../outside', '../.git/config']) {
  test(`refuses an unsafe symlink to ${target}`, (t) => {
    const f = fixture(t);
    symlinkSync(target, join(f.root, 'game/src/alias'));
    f.commit();
    assert.throws(() => f.invoke(), /Unsafe (symlink|export path)/);
    assert.ok(!f.calls.some(({ command }) => command === 'scanDirectory'));
  });
}

test('rejects a symlink chain that escapes after resolving an internal link', (t) => {
  const f = fixture(t);
  put(f.base, 'outside', 'private');
  symlinkSync('..', join(f.root, 'game/src/parent'));
  symlinkSync('parent/../outside', join(f.root, 'game/src/escape'));
  f.commit();
  assert.throws(() => f.invoke(), /Unsafe symlink: src\/escape/);
  assert.ok(!f.calls.some(({ command }) => command === 'scanDirectory'));
});

test('rejects unsafe projects and missing committed settings', (t) => {
  const f = fixture(t);
  f.commit();
  for (const project of ['../game', '/game', '.', 'game/../game', 'game\\src', '--push']) {
    assert.throws(() => f.invoke({ project }), /Project must|must be committed/);
  }
  assert.throws(() => f.invoke({ project: 'absent' }), /must be committed/);
});

test('validates required settings instead of accepting malformed allowlists or commands', () => {
  const settings = { repo: 'someone/game', description: 'game', homepage: 'https://example.test', topics: [], include: ['src/**'], exclude: [], check: 'true' };
  for (const [key, value] of [['repo', '../game'], ['repo', '-bad'], ['description', ''], ['homepage', false], ['check', []], ['include', 'src/**'], ['include', [false]], ['exclude', ['']], ['topics', [3]]]) {
    assert.throws(() => readSettings(stringify({ ...settings, [key]: value })), /showcase.toml/);
  }
  for (const key of Object.keys(settings)) {
    const missing = { ...settings };
    delete missing[key];
    assert.throws(() => readSettings(stringify(missing)), /showcase.toml/);
  }
});

test('validates marker allowance tables and mount tables with showcase.toml diagnostics', () => {
  const settings = { repo: 'someone/game', description: 'game', homepage: 'https://example.test',
    topics: [], include: ['src/**'], exclude: [], check: 'true' };
  const mount = { source: 'gokit', include: ['**'] };
  const cases = [
    ['allow_marker', 'agister', 'allow_marker must be an array of tables'],
    ['allow_marker', [false], 'allow_marker must be an array of tables'],
    ...[{}, { marker: false, paths: ['**'] }, { marker: 'unknown', paths: ['**'] }]
      .map((entry) => ['allow_marker', [entry], 'allow_marker.marker must name a marker in markers.txt']),
    ...[undefined, [], '**', [''], [false]].map((paths) => ['allow_marker',
      [{ marker: 'agister', ...(paths === undefined ? {} : { paths }) }], 'allow_marker.paths must be a nonempty array']),
    ['mount', 'gokit', 'mount must be an array of tables'],
    ['mount', [false], 'mount must be an array of tables'],
    ...[undefined, false, '', ' ', '/gokit', '../gokit', 'lib/../gokit', 'gokit/..', 'gokit//lib',
      '.', './gokit', 'gokit/', 'C:/gokit', 'lib\\gokit', '.git', 'lib/.GIT'].map((source) => ['mount',
      [{ include: ['**'], ...(source === undefined ? {} : { source }) }], 'mount.source must be a safe repository-relative folder']),
    ...['game', 'game/src', 'game/src/nested'].map((source) => ['mount', [{ ...mount, source }], 'mount.source must be outside the project']),
    ...[false, '', ' ', '/lib', '../lib', 'lib/../other', '.', './lib', 'lib/', 'lib//nested',
      'lib\\nested', 'C:/lib', '.git', 'lib/.GIT'].map((target) => ['mount', [{ ...mount, target }], 'mount.target must be a safe export-relative folder']),
    ...[undefined, '**', [''], [false]].map((include) => ['mount',
      [{ source: 'gokit', ...(include === undefined ? {} : { include }) }], 'mount.include must be an array of nonempty strings']),
    ...['**', [''], [false]].map((exclude) => ['mount', [{ ...mount, exclude }], 'mount.exclude must be an array of nonempty strings'])
  ];
  for (const [key, value, diagnostic] of cases) {
    assert.throws(() => readSettings(stringify({ ...settings, [key]: value }), 'game'), (error) => {
      assert.ok(error.message.startsWith(`showcase.toml: ${diagnostic}`), `${key}=${JSON.stringify(value)}: ${error.message}`);
      return true;
    });
  }
  const valid = { ...settings,
    allow_marker: [{ marker: 'AGISTER', paths: ['src/**'] }, { marker: '/users/', paths: ['tests/*.js'] }],
    mount: [mount, { source: 'game-tools', target: 'lib/tools', include: ['*.go'], exclude: ['private.go'] }]
  };
  assert.deepEqual(readSettings(stringify(valid), 'game'), valid);
  assert.deepEqual(readSettings(stringify({ ...settings, allow_marker: [], mount: [] }), 'game'),
    { ...settings, allow_marker: [], mount: [] });
  for (const source of ['products/game', 'products/game/src']) {
    assert.throws(() => readSettings(stringify({ ...settings, mount: [{ ...mount, source }] }), 'products/game'),
      /showcase.toml: mount.source must be outside the project/);
  }
});

test('exports reject mounts of the project itself or its descendants', (t) => {
  for (const source of ['game', 'game/src']) {
    const f = fixture(t, { mount: [{ source, include: ['**'] }] });
    f.commit();
    assert.throws(() => f.invoke(), /showcase.toml: mount.source must be outside the project/);
    assert.ok(f.calls.every(({ command }) => command === 'git'));
  }
});

test('foliotell settings still parse without marker allowances or mounts', () => {
  const settings = readSettings(readFileSync(new URL('../../../foliotell/showcase/showcase.toml', import.meta.url), 'utf8'));
  assert.equal(settings.repo, 'igor1309/foliotell');
  assert.equal(settings.check, 'cd ios && swift build && swift test');
  assert.equal(isIncluded('ios/Sources/App.swift', settings), true);
  assert.equal(isIncluded('android/app/Main.kt', settings), false);
});

// Contract test: the process adapter sets the real child process's working directory.
test('command adapter honours cwd for distinct temporary directories', (t) => {
  for (const name of ['first', 'second']) {
    const cwd = mkdtempSync(join(tmpdir(), `showcase-cwd-${name}-`));
    t.after(() => rmSync(cwd, { recursive: true, force: true }));
    const output = runCommand(process.execPath, ['-e', 'process.stdout.write(process.cwd())'], { cwd });
    assert.equal(output.toString(), realpathSync(cwd));
  }
});

test('command adapter reports missing binaries, nonzero status, stdout and stderr', () => {
  assert.throws(() => runCommand('showcase-no-such-executable', [], { cwd: tmpdir() }), /ENOENT/);
  assert.throws(() => runCommand('sh', ['-c', 'printf "stdout diagnostic"; printf "stderr diagnostic" >&2; exit 7'], { cwd: tmpdir() }), /exited 7\nstdout diagnosticstderr diagnostic/);
  assert.equal(runCommand('sh', ['-c', 'printf success'], { cwd: tmpdir() }).toString(), 'success');
});

test('rexlab settings export required runtime and build files while keeping private inputs out', () => {
  const root = resolve(import.meta.dirname, '../../..');
  const settings = readSettings(readFileSync(join(root, 'rexlab/showcase/showcase.toml'), 'utf8'));
  assert.equal(settings.repo, 'igor1309/rexlab');
  assert.equal(settings.check, 'sh scripts/test.sh');
  assert.equal(settings.homepage, 'https://rexlab.enoa.ai');
  assert.deepEqual(settings.topics, ['react', 'typescript', 'vite', 'kids-game', 'ai-assisted']);
  for (const path of ['src/App.tsx', 'src/assets/dinos/triceratops.webp', 'tests/catalogue.test.tsx', 'docs/features/catalogue.feature',
    'index.html', 'package.json', 'package-lock.json', 'tsconfig.json', 'vite.config.ts', '.gitignore', 'scripts/test.sh', 'scripts/digGrid.ts',
    'scripts/skeletonBones.ts', 'art/skeleton-cuts.json', 'prototypes/careHatch.ts', 'prototypes/careSounds.ts', 'prototypes/careHatch.css', 'prototypes/care-hatch.html']) {
    assert.equal(isIncluded(path, settings), true, path);
  }
  for (const path of ['tests/catalogueSources.test.ts', 'docs/sources.md', 'docs/features/private/nested.feature', 'README.md', 'AGENTS.md',
    '.agister/x', 'research/notes.md', 'art/prompts.md', 'design/images/x.webp', 'wrangler.toml', 'scripts/spec-review.sh',
    'scripts/smoke-deployed-version.ts', 'scripts/body-picture.sh', 'scripts/skeleton-picture.sh', 'showcase/showcase.toml', 'showcase/AGENTS.md']) {
    assert.equal(isIncluded(path, settings), false, path);
  }
  assert.match(readFileSync(join(root, 'rexlab/showcase/public/LICENSE'), 'utf8'), /MIT License\n\nCopyright \(c\) 2026 Igor Malyarov/);
  assert.equal(existsSync(join(root, 'rexlab/tests/catalogueSources.test.ts')), true);
});

test('agonara settings export the app, its tests and local compose while keeping deployment and private docs out', () => {
  const root = resolve(import.meta.dirname, '../../..');
  const settings = readSettings(readFileSync(join(root, 'agonara/showcase/showcase.toml'), 'utf8'));
  assert.equal(settings.repo, 'igor1309/agonara');
  assert.equal(settings.check, 'npm ci && npm test');
  assert.equal(settings.homepage, 'https://agonara.enoa.ai');
  for (const path of ['src/server.js', 'src/cli.js', 'tests/executable-acceptance-identity-programs.test.js', 'tests/support/http-api.js', 'docs/api/openapi.yml',
    'docs/api/redocly.yaml', 'index.html', 'package.json', 'package-lock.json', 'playwright.config.js', 'Dockerfile', '.dockerignore', 'compose.yaml',
    'scripts/generate-agonara-openapi.mjs']) {
    assert.equal(isIncluded(path, settings), true, path);
  }
  for (const path of ['compose.prod.yml', 'compose.staging.yml', 'scripts/deploy-prod.sh', 'scripts/backup-staging.sh', 'scripts/restore-prod.sh',
    'scripts/rollback-prod.sh', 'scripts/smoke-public-prod-routes.mjs', 'scripts/project-public-skills.mjs', 'scripts/publish-guard.mjs',
    'tests/deployment-scaffold.test.js', 'tests/material-content-closeout.test.js', 'docs/intent/intent_learning_program_app.md', 'research/x.md',
    'backlog/x.md', 'skills/x/SKILL.md', 'README.md', 'AGENTS.md', 'CLAUDE.md', 'architecture.html', 'showcase/showcase.toml', 'showcase/AGENTS.md']) {
    assert.equal(isIncluded(path, settings), false, path);
  }
  assert.deepEqual(settings.allow_marker.map(({ marker }) => marker), ['/Users/']);
});
