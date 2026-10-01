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

test('listing puts directories first, by name, and hides dotfiles except .agister', async () => {
  const root = dir('root', {
    'b.txt': file('b.txt'),
    zeta: dir('zeta'),
    '.git': dir('.git'),
    '.env': file('.env'),
    'A.md': file('A.md'),
    alpha: dir('alpha', { '.agister': dir('.agister') }),
    '.agister': dir('.agister', { '.agister': dir('.agister') }),
    item10: dir('item10'),
    item2: dir('item2'),
    Beta: dir('Beta', { '.agister': file('.agister') }),
  });
  const listed = await R.listFolder(root);
  assert.deepEqual(
    listed.map((e) => [e.name, e.kind, e.agister]),
    [
      ['.agister', 'directory', false],
      ['alpha', 'directory', true],
      ['Beta', 'directory', false],
      ['item2', 'directory', false],
      ['item10', 'directory', false],
      ['zeta', 'directory', false],
      ['A.md', 'file', false],
      ['b.txt', 'file', false],
    ],
  );
  assert.equal(listed[1].handle.name, 'alpha');
});

test('dotfile rule', () => {
  assert.equal(R.isVisibleName('.agister'), true);
  assert.equal(R.isVisibleName('.git'), false);
  assert.equal(R.isVisibleName('src'), true);
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

test('repo ids are the name plus a unique part', () => {
  assert.equal(R.makeRepoId('ai-labs', () => 'u1'), 'ai-labs:u1');
  assert.notEqual(R.makeRepoId('x'), R.makeRepoId('x'));
});

test('a folder picked again reuses its stored id', async () => {
  const a = dir('a');
  const b = dir('b');
  const records = [{ id: 'a:1', handle: a }, { id: 'b:1', handle: b }];
  assert.equal(await R.findKnownId(records, b), 'b:1');
  assert.equal(await R.findKnownId(records, dir('b')), null);
});

test('read permission: granted, requested, denied or failing', async () => {
  const handle = (query, request) => ({
    requests: 0,
    async queryPermission(opts) { assert.deepEqual(opts, { mode: 'read' }); return query; },
    async requestPermission(opts) {
      assert.deepEqual(opts, { mode: 'read' });
      this.requests++;
      if (request instanceof Error) throw request;
      return request;
    },
  });
  const granted = handle('granted', 'denied');
  assert.equal(await R.ensureReadPermission(granted), true);
  assert.equal(granted.requests, 0);
  assert.equal(await R.ensureReadPermission(handle('prompt', 'granted')), true);
  assert.equal(await R.ensureReadPermission(handle('prompt', 'denied')), false);
  assert.equal(await R.ensureReadPermission(handle('prompt', domError('SecurityError'))), false);
});
