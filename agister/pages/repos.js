// Agister pages: the repo picker's logic that does not touch the DOM.
//
// A classic script that sets globalThis.AgisterRepos, so the tests can
// import this file for that side effect. The page runs under agister pages,
// which serves it and answers the two endpoints called here.
(() => {
  const RECENT_KEY = 'agister-pages:recent';
  const CURRENT_KEY = 'agister-pages:current';
  // Agister's home, ~/.agister; the server reads it for this path.
  const HOME_ID = '~';
  const RECENT_CAP = 10;
  const NO_SERVER = 'The page cannot reach agister pages. Run `agister pages` in a terminal; it serves this page and reads the folders.';

  // A recent repo is { id: its absolute path, name: the folder's name,
  // lastOpened }.
  function isRecentEntry(e) {
    return e !== null && typeof e === 'object' && typeof e.id === 'string' && e.id.startsWith('/') &&
      typeof e.name === 'string' && typeof e.lastOpened === 'number';
  }

  // The recent list from storage; anything unreadable reads as empty.
  function readRecent(storage) {
    try {
      const data = JSON.parse(storage.getItem(RECENT_KEY) || '[]');
      if (!Array.isArray(data)) return [];
      const seen = new Set();
      return data.filter((e) => isRecentEntry(e) && !seen.has(e.id) && seen.add(e.id)).slice(0, RECENT_CAP);
    } catch {
      return [];
    }
  }

  function writeRecent(storage, list) {
    try { storage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, RECENT_CAP))); } catch { /* the page still works */ }
  }

  // entry goes to the front, replacing any entry with its id; later
  // duplicates go too; at most 10.
  function addRecent(list, entry) {
    const seen = new Set();
    return [entry, ...list].filter((e) => !seen.has(e.id) && seen.add(e.id)).slice(0, RECENT_CAP);
  }

  function removeRecent(list, id) {
    return list.filter((e) => e.id !== id);
  }

  // The repo at path goes to the front of the stored list.
  function rememberRepo(storage, path, now) {
    const list = addRecent(readRecent(storage), { id: path, name: baseName(path), lastOpened: now });
    writeRecent(storage, list);
    return list;
  }

  function forgetRepo(storage, id) {
    const list = removeRecent(readRecent(storage), id);
    writeRecent(storage, list);
    return list;
  }

  function baseName(path) {
    return path.split('/').filter(Boolean).pop() || '/';
  }

  // The path last shown, or null.
  function readCurrent(storage) {
    try {
      const id = storage.getItem(CURRENT_KEY);
      return typeof id === 'string' && (id === HOME_ID || id.startsWith('/')) ? id : null;
    } catch {
      return null;
    }
  }

  function writeCurrent(storage, id) {
    try { storage.setItem(CURRENT_KEY, id); } catch { /* the page still shows it */ }
  }

  // --- the server ---

  // The JSON at url; throws an Error with the server's message, or NO_SERVER
  // when there is no server to ask.
  async function getJson(fetchFn, url) {
    let res;
    try {
      res = await fetchFn(url, { cache: 'no-store' });
    } catch {
      throw new Error(NO_SERVER);
    }
    let body;
    try {
      body = await res.json();
    } catch {
      throw new Error(res.ok ? `${url}: not JSON` : NO_SERVER);
    }
    if (!res.ok) throw new Error(body?.error || `${url}: HTTP ${res.status}`);
    return body;
  }

  // { 'agents/a.toml': text, ... }: the settings files of the repo at path,
  // or of Agister's home for ~.
  async function fetchSettings(fetchFn, path) {
    const body = await getJson(fetchFn, `api/settings?path=${encodeURIComponent(path)}`);
    return body.files || {};
  }

  // { path, parent, agister, folders: [{ name, path, agister }] }; an empty
  // path lists the user's home.
  async function fetchFolders(fetchFn, path) {
    return getJson(fetchFn, `api/folders?path=${encodeURIComponent(path || '')}`);
  }

  // --- settings files as a folder ---
  //
  // config.js reads a .agister folder through directory-handle methods:
  // entries(), getDirectoryHandle(), getFileHandle() and a file's getFile().
  // These build that over the files the server sent.

  function notFound(name) {
    const err = new Error(`${name} not found`);
    err.name = 'NotFoundError';
    return err;
  }

  function typeMismatch(name) {
    const err = new Error(`${name} is not of the asked kind`);
    err.name = 'TypeMismatchError';
    return err;
  }

  function folderNode(name) {
    return { kind: 'directory', name, children: new Map() };
  }

  function asHandle(node) {
    if (node.kind === 'file') {
      return { kind: 'file', name: node.name, getFile: async () => node.file };
    }
    return {
      kind: 'directory',
      name: node.name,
      async *entries() {
        for (const [name, child] of node.children) yield [name, asHandle(child)];
      },
      async getDirectoryHandle(name) {
        const child = node.children.get(name);
        if (!child) throw notFound(name);
        if (child.kind !== 'directory') throw typeMismatch(name);
        return asHandle(child);
      },
      async getFileHandle(name) {
        const child = node.children.get(name);
        if (!child) throw notFound(name);
        if (child.kind !== 'file') throw typeMismatch(name);
        return asHandle(child);
      },
    };
  }

  // The .agister folder holding files, { 'agents/a.toml': text, ... }.
  function agisterFromFiles(files) {
    const root = folderNode('.agister');
    for (const [path, text] of Object.entries(files)) {
      const parts = path.split('/').filter(Boolean);
      const name = parts.pop();
      let node = root;
      for (const part of parts) {
        if (!node.children.has(part)) node.children.set(part, folderNode(part));
        node = node.children.get(part);
        if (node.kind !== 'directory') break;
      }
      if (name && node.kind === 'directory') node.children.set(name, { kind: 'file', name, file: { text: async () => text } });
    }
    return asHandle(root);
  }

  globalThis.AgisterRepos = {
    RECENT_KEY, RECENT_CAP, CURRENT_KEY, HOME_ID, NO_SERVER,
    readRecent, writeRecent, addRecent, removeRecent, rememberRepo, forgetRepo, baseName,
    readCurrent, writeCurrent,
    fetchSettings, fetchFolders, agisterFromFiles,
  };
})();
