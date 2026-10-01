import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../repos.js';

const R = globalThis.AgisterRepos;

function domError(name) {
  return new DOMException(`${name} raised`, name);
}

function file(name) {
  return { kind: 'file', name };
}

// A fake directory handle: children maps names to dir() or file() handles.
function dir(name, children = {}) {
  return {
    kind: 'directory',
    name,
    async *entries() {
      for (const [n, h] of Object.entries(children)) yield [n, h];
    },
    async getDirectoryHandle(n) {
      const child = children[n];
      if (!child) throw domError('NotFoundError');
      if (child.kind !== 'directory') throw domError('TypeMismatchError');
      return child;
    },
    async isSameEntry(other) {
      return other === this;
    },
  };
}

function fakeStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
    raw: (k) => data.get(k),
  };
}

function entry(id, lastOpened = 1) {
  return { id, name: id.split(':')[0], lastOpened };
}

test('a folder with a .agister directory is an Agister repo', async () => {
  assert.equal(await R.isAgisterRepo(dir('repo', { '.agister': dir('.agister') })), true);
});

test('a folder without .agister is not an Agister repo', async () => {
  assert.equal(await R.isAgisterRepo(dir('plain', { src: dir('src') })), false);
});

test('a .agister file that is not a directory does not make a repo', async () => {
  assert.equal(await R.isAgisterRepo(dir('odd', { '.agister': file('.agister') })), false);
});

test('detection passes on errors other than a missing or mistyped entry', async () => {
  const denied = dir('denied');
  denied.getDirectoryHandle = async () => { throw domError('NotAllowedError'); };
  await assert.rejects(R.isAgisterRepo(denied), { name: 'NotAllowedError' });
});

test('the recent list puts the newest first and moves a reopened repo to the front', () => {
  let list = [];
  list = R.addRecent(list, entry('a:1'));
  list = R.addRecent(list, entry('b:1'));
  list = R.addRecent(list, entry('c:1'));
  assert.deepEqual(list.map((e) => e.id), ['c:1', 'b:1', 'a:1']);
  list = R.addRecent(list, entry('a:1', 9));
  assert.deepEqual(list.map((e) => e.id), ['a:1', 'c:1', 'b:1']);
  assert.equal(list[0].lastOpened, 9);
});

test('the recent list dedupes by id', () => {
  const list = R.addRecent([entry('a:1'), entry('b:1'), entry('a:1')], entry('b:1', 5));
  assert.deepEqual(list.map((e) => e.id), ['b:1', 'a:1']);
});

test('the recent list keeps at most 10 and reports what the cap dropped', () => {
  const storage = fakeStorage();
  let result;
  for (let i = 0; i < 12; i++) result = R.rememberRepo(storage, entry(`r${i}:x`, i));
  assert.equal(result.list.length, 10);
  assert.deepEqual(result.list.map((e) => e.id), ['r11:x', 'r10:x', 'r9:x', 'r8:x', 'r7:x', 'r6:x', 'r5:x', 'r4:x', 'r3:x', 'r2:x']);
  assert.deepEqual(result.dropped.map((e) => e.id), ['r1:x']);
  assert.deepEqual(R.readRecent(storage), result.list);
});

test('removing a repo drops only that entry, in storage too', () => {
  const storage = fakeStorage();
  R.rememberRepo(storage, entry('a:1'));
  R.rememberRepo(storage, entry('b:1'));
  R.rememberRepo(storage, entry('c:1'));
  const list = R.forgetRepo(storage, 'b:1');
  assert.deepEqual(list.map((e) => e.id), ['c:1', 'a:1']);
  assert.deepEqual(R.readRecent(storage).map((e) => e.id), ['c:1', 'a:1']);
  assert.deepEqual(R.removeRecent(list, 'missing'), list);
});

test('the recent list is stored under agister-pages:recent', () => {
  const storage = fakeStorage();
  R.writeRecent(storage, [entry('a:1')]);
  assert.deepEqual(JSON.parse(storage.raw('agister-pages:recent')), [entry('a:1')]);
});

test('corrupt or foreign storage reads as empty without throwing', () => {
  for (const raw of ['{not json', '"text"', '{"id":"a"}', 'null']) {
    const storage = fakeStorage({ 'agister-pages:recent': raw });
    assert.deepEqual(R.readRecent(storage), [], raw);
  }
  assert.deepEqual(R.readRecent(fakeStorage()), []);
  const mixed = fakeStorage({ 'agister-pages:recent': JSON.stringify([entry('a:1'), { id: 3 }, null]) });
  assert.deepEqual(R.readRecent(mixed), [entry('a:1')]);
});

test('a failing storage reads as empty', () => {
  const storage = { getItem() { throw new Error('blocked'); } };
  assert.deepEqual(R.readRecent(storage), []);
});

// A picked file as Safari and Chrome give it.
function picked(path, text = '') {
  return { name: path.split('/').pop(), webkitRelativePath: path, size: text.length, text: async () => text };
}

test('a picked folder becomes a tree that detection and reading use', async () => {
  const root = R.dirFromFiles([
    picked('repo/README.md'),
    picked('repo/.agister/agents/a.toml', 'name = "a"'),
    picked('repo/src/main.go'),
  ]);
  assert.equal(root.name, 'repo');
  assert.equal(await R.isAgisterRepo(root), true);
  const names = [];
  for await (const [name, handle] of root.entries()) names.push([name, handle.kind]);
  assert.deepEqual(names, [['README.md', 'file'], ['.agister', 'directory'], ['src', 'directory']]);
  const agents = await (await root.getDirectoryHandle('.agister')).getDirectoryHandle('agents');
  assert.equal(await (await (await agents.getFileHandle('a.toml')).getFile()).text(), 'name = "a"');
});

test('a picked tree throws NotFoundError and TypeMismatchError like real handles', async () => {
  const root = R.dirFromFiles([picked('repo/file.txt')]);
  await assert.rejects(root.getDirectoryHandle('missing'), { name: 'NotFoundError' });
  await assert.rejects(root.getDirectoryHandle('file.txt'), { name: 'TypeMismatchError' });
  await assert.rejects(root.getFileHandle('missing'), { name: 'NotFoundError' });
  assert.equal(await R.isAgisterRepo(root), false);
});

test('an empty pick has no folder', () => {
  assert.equal(R.dirFromFiles([]), null);
});

test('the saved copy of .agister round-trips through storage', async () => {
  const root = R.dirFromFiles([
    picked('repo/.agister/service.toml', 'max_attempts = 1'),
    picked('repo/.agister/agents/a.toml', 'name = "a"'),
    picked('repo/.agister/big.json', 'x'.repeat(256 * 1024 + 1)),
  ]);
  const files = await R.readSettings(await root.getDirectoryHandle('.agister'));
  assert.deepEqual(files, { 'service.toml': 'max_attempts = 1', 'agents/a.toml': 'name = "a"' });
  const storage = fakeStorage();
  R.saveSettings(storage, 'repo', files, 42);
  const saved = R.loadSettings(storage, 'repo');
  assert.deepEqual(saved, { savedAt: 42, files });
  const copy = R.dirFromSettings('repo', saved.files);
  assert.equal(copy.name, 'repo');
  assert.equal(await R.isAgisterRepo(copy), true);
  assert.deepEqual(await R.readSettings(await copy.getDirectoryHandle('.agister')), files);
});

test('a repo saved with no settings files still reads as a repo', async () => {
  assert.equal(await R.isAgisterRepo(R.dirFromSettings('repo', {})), true);
});

test('a missing or corrupt saved copy reads as none', () => {
  const key = (id) => R.SETTINGS_KEY + id;
  const storage = fakeStorage({
    [key('bad')]: '{not json',
    [key('shape')]: JSON.stringify({ savedAt: 1, files: { a: 3 } }),
    [key('time')]: JSON.stringify({ files: {} }),
  });
  for (const id of ['missing', 'bad', 'shape', 'time']) assert.equal(R.loadSettings(storage, id), null, id);
});

test('removing a repo or pushing it out of the list drops its saved copy', () => {
  const storage = fakeStorage();
  for (let i = 0; i < 11; i++) {
    R.rememberRepo(storage, entry(`r${i}`, i));
    R.saveSettings(storage, `r${i}`, {}, i);
  }
  assert.equal(R.loadSettings(storage, 'r0'), null);
  assert.ok(R.loadSettings(storage, 'r1'));
  R.forgetRepo(storage, 'r5');
  assert.equal(R.loadSettings(storage, 'r5'), null);
  assert.ok(R.loadSettings(storage, 'r6'));
});
