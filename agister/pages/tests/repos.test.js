import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../repos.js';

const R = globalThis.AgisterRepos;

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
  return { id, name: R.baseName(id), lastOpened };
}

test('the recent list puts the newest first and moves a reopened repo to the front', () => {
  let list = [];
  list = R.addRecent(list, entry('/a'));
  list = R.addRecent(list, entry('/b'));
  list = R.addRecent(list, entry('/c'));
  assert.deepEqual(list.map((e) => e.id), ['/c', '/b', '/a']);
  list = R.addRecent(list, entry('/a', 9));
  assert.deepEqual(list.map((e) => e.id), ['/a', '/c', '/b']);
  assert.equal(list[0].lastOpened, 9);
});

test('the recent list dedupes by path', () => {
  const list = R.addRecent([entry('/a'), entry('/b'), entry('/a')], entry('/b', 5));
  assert.deepEqual(list.map((e) => e.id), ['/b', '/a']);
});

test('a remembered repo is named by its folder and the list keeps at most 10', () => {
  const storage = fakeStorage();
  let list;
  for (let i = 0; i < 12; i++) list = R.rememberRepo(storage, `/src/r${i}`, i);
  assert.equal(list.length, 10);
  assert.deepEqual(list[0], { id: '/src/r11', name: 'r11', lastOpened: 11 });
  assert.equal(list[9].id, '/src/r2');
  assert.deepEqual(R.readRecent(storage), list);
});

test('removing a repo drops only that entry, in storage too', () => {
  const storage = fakeStorage();
  for (const p of ['/a', '/b', '/c']) R.rememberRepo(storage, p, 1);
  const list = R.forgetRepo(storage, '/b');
  assert.deepEqual(list.map((e) => e.id), ['/c', '/a']);
  assert.deepEqual(R.readRecent(storage).map((e) => e.id), ['/c', '/a']);
  assert.deepEqual(R.removeRecent(list, '/missing'), list);
});

test('the recent list is stored under agister-pages:recent', () => {
  const storage = fakeStorage();
  R.writeRecent(storage, [entry('/a')]);
  assert.deepEqual(JSON.parse(storage.raw('agister-pages:recent')), [entry('/a')]);
});

test('corrupt, foreign or older storage reads as empty without throwing', () => {
  for (const raw of ['{not json', '"text"', '{"id":"/a"}', 'null']) {
    assert.deepEqual(R.readRecent(fakeStorage({ 'agister-pages:recent': raw })), [], raw);
  }
  assert.deepEqual(R.readRecent(fakeStorage()), []);
  // Entries saved before the server were named, not pathed: they go.
  const mixed = fakeStorage({ 'agister-pages:recent': JSON.stringify([entry('/a'), { id: 'repo', name: 'repo', lastOpened: 1 }, null]) });
  assert.deepEqual(R.readRecent(mixed), [entry('/a')]);
  assert.deepEqual(R.readRecent({ getItem() { throw new Error('blocked'); } }), []);
  R.writeRecent({ setItem() { throw new Error('full'); } }, [entry('/a')]);
});

test('the path last shown is kept; missing, foreign or failing storage reads as none', () => {
  const storage = fakeStorage();
  assert.equal(R.readCurrent(storage), null);
  R.writeCurrent(storage, R.HOME_ID);
  assert.equal(R.readCurrent(storage), '~');
  R.writeCurrent(storage, '/src/repo');
  assert.equal(storage.raw(R.CURRENT_KEY), '/src/repo');
  assert.equal(R.readCurrent(fakeStorage({ [R.CURRENT_KEY]: 'repo' })), null);
  assert.equal(R.readCurrent({ getItem() { throw new Error('blocked'); } }), null);
  R.writeCurrent({ setItem() { throw new Error('full'); } }, '~');
});

// A fetch that answers from routes: url -> [status, body]; a missing route
// fails like a stopped server.
function fakeFetch(routes) {
  const calls = [];
  const fn = async (url, init = {}) => {
    calls.push([init.method || 'GET', url, init.headers]);
    if (!(url in routes)) throw new TypeError('Load failed');
    const [status, body] = routes[url];
    return { ok: status < 300, status, json: async () => (typeof body === 'string' ? JSON.parse(body) : body) };
  };
  fn.calls = calls;
  return fn;
}

test('settings come from the server by path; ~ asks for Agister home', async () => {
  const fetch = fakeFetch({
    'api/settings?path=~': [200, { path: '~', dir: '/u/.agister', home: true, files: { 'service.toml': 'x' } }],
    'api/settings?path=%2Fsrc%2Frepo': [200, { files: { 'agents/a.toml': 'y' }, homeFiles: { 'agents/h.toml': 'z' } }],
  });
  assert.deepEqual(await R.fetchSettings(fetch, '~'), { id: '~', files: { 'service.toml': 'x' }, homeFiles: null });
  assert.deepEqual(await R.fetchSettings(fetch, '/src/repo'),
    { id: '/src/repo', files: { 'agents/a.toml': 'y' }, homeFiles: { 'agents/h.toml': 'z' } });
});

test('the folder holding Agister home reads as ~', async () => {
  const fetch = fakeFetch({ 'api/settings?path=%2FUsers%2Fu': [200, { home: true, files: { 'service.toml': 'x' } }] });
  assert.deepEqual(await R.fetchSettings(fetch, '/Users/u'), { id: '~', files: { 'service.toml': 'x' }, homeFiles: null });
});

test('a server error carries its message; no server says to run agister pages', async () => {
  const fetch = fakeFetch({
    'api/settings?path=%2Fplain': [404, { error: 'no .agister folder at /plain/.agister' }],
    'api/choose': [500, '{not json'],
  });
  await assert.rejects(R.fetchSettings(fetch, '/plain'), { message: 'no .agister folder at /plain/.agister' });
  await assert.rejects(R.fetchSettings(fetch, '/elsewhere'), { message: R.NO_SERVER });
  await assert.rejects(R.chooseFolder(fetch), { message: R.NO_SERVER });
  assert.match(R.NO_SERVER, /agister pages/);
});

test('a chosen folder comes from the server; a cancelled dialog is null', async () => {
  const chosen = fakeFetch({ 'api/choose': [200, { path: '/u/repo' }] });
  assert.equal(await R.chooseFolder(chosen), '/u/repo');
  assert.deepEqual(chosen.calls, [['POST', 'api/choose', { 'X-Agister-Pages': '1' }]]);
  assert.equal(await R.chooseFolder(fakeFetch({ 'api/choose': [200, { path: '' }] })), null);
});

test('settings files read as a .agister folder', async () => {
  const agister = R.agisterFromFiles({
    'service.toml': 'max_attempts = 1',
    'agents/a.toml': 'name = "a"',
    'processes/nested/p.yaml': 'name: p',
    'service.toml/x': 'under a file: dropped',
  });
  assert.equal(agister.name, '.agister');
  const names = [];
  for await (const [name, handle] of agister.entries()) names.push([name, handle.kind]);
  assert.deepEqual(names, [['service.toml', 'file'], ['agents', 'directory'], ['processes', 'directory']]);
  const agents = await agister.getDirectoryHandle('agents');
  assert.equal(await (await (await agents.getFileHandle('a.toml')).getFile()).text(), 'name = "a"');
  const nested = await (await agister.getDirectoryHandle('processes')).getDirectoryHandle('nested');
  assert.equal(await (await (await nested.getFileHandle('p.yaml')).getFile()).text(), 'name: p');
  await assert.rejects(agister.getDirectoryHandle('missing'), { name: 'NotFoundError' });
  await assert.rejects(agister.getDirectoryHandle('service.toml'), { name: 'TypeMismatchError' });
  await assert.rejects(agister.getFileHandle('agents'), { name: 'TypeMismatchError' });
});

test('the name of a path is its last folder', () => {
  assert.equal(R.baseName('/src/ai-labs'), 'ai-labs');
  assert.equal(R.baseName('/src/ai-labs/'), 'ai-labs');
  assert.equal(R.baseName('/'), '/');
});
