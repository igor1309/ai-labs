// Agister pages: the repo picker's logic that does not touch the DOM.
//
// A classic script that sets globalThis.AgisterRepos, not an ES module with
// exports: browsers refuse module scripts from file:// (CORS), and the page
// must open from disk. The tests import this file for that side effect.
(() => {
  const RECENT_KEY = 'agister-pages:recent';
  const SETTINGS_KEY = 'agister-pages:settings:';
  const SETTINGS_FILE_CAP = 256 * 1024;
  const CURRENT_KEY = 'agister-pages:current';
  // Agister's home, ~/.agister: picked as the .agister folder itself.
  const HOME_ID = '~';
  // What .agister holds as settings; runs/ and logs/ are not settings.
  const SETTINGS_ENTRIES = new Set(['agents', 'policies', 'processes', 'runtimes', 'schemas', 'workflows', 'service.toml']);
  const RECENT_CAP = 10;
  const AGISTER_DIR = '.agister';

  // A folder is an Agister repo when .agister at its root is a directory.
  // A missing entry or a file of that name means no; other errors propagate.
  async function isAgisterRepo(dir) {
    try {
      await dir.getDirectoryHandle(AGISTER_DIR);
      return true;
    } catch (err) {
      if (err && (err.name === 'NotFoundError' || err.name === 'TypeMismatchError')) return false;
      throw err;
    }
  }

  function isRecentEntry(e) {
    return e !== null && typeof e === 'object' && typeof e.id === 'string' &&
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
    storage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, RECENT_CAP)));
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

  // Adds entry to the stored list; the saved settings of the entries the cap
  // pushed out go too. dropped holds those entries.
  function rememberRepo(storage, entry) {
    const before = readRecent(storage);
    const list = addRecent(before, entry);
    writeRecent(storage, list);
    const kept = new Set(list.map((e) => e.id));
    const dropped = before.filter((e) => !kept.has(e.id));
    for (const e of dropped) dropSettings(storage, e.id);
    return { list, dropped };
  }

  function forgetRepo(storage, id) {
    const list = removeRecent(readRecent(storage), id);
    writeRecent(storage, list);
    dropSettings(storage, id);
    return list;
  }

  // --- folders picked with <input type=file webkitdirectory> ---
  //
  // Safari has no folder handles: picking a folder yields its files, each
  // with a webkitRelativePath that starts with the folder's name. These build
  // a read-only tree over them with the handle methods the page and
  // config.js use: entries(), getDirectoryHandle(), getFileHandle() and a
  // file's getFile().

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

  // A folder node: name plus children, a Map of name to folder or file node.
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

  // Adds file under root at the slash-separated path parts.
  function place(root, parts, file) {
    let node = root;
    for (const part of parts.slice(0, -1)) {
      let next = node.children.get(part);
      if (!next) node.children.set(part, (next = folderNode(part)));
      if (next.kind !== 'directory') return;
      node = next;
    }
    const name = parts[parts.length - 1];
    if (name) node.children.set(name, { kind: 'file', name, file });
  }

  // The picked folder as a directory handle, or null when files is empty
  // (an empty folder picks no files, so it cannot be told apart).
  function dirFromFiles(files) {
    let root = null;
    for (const file of files) {
      const parts = (file.webkitRelativePath || file.name).split('/').filter(Boolean);
      if (parts.length < 2) continue;
      root ??= folderNode(parts[0]);
      if (parts[0] === root.name) place(root, parts.slice(1), file);
    }
    return root && asHandle(root);
  }

  // --- the saved copy of a repo's .agister ---
  //
  // Without handles the page cannot reopen a folder, so it keeps the text of
  // each recent repo's .agister in storage and shows that until the folder
  // is opened again.

  // { 'agents/a.toml': text, ... } for the settings files under agister
  // (SETTINGS_ENTRIES), at most SETTINGS_FILE_CAP bytes each; larger files
  // are left out.
  async function readSettings(agister, prefix = '') {
    const out = {};
    for await (const [name, handle] of agister.entries()) {
      if (!prefix && !SETTINGS_ENTRIES.has(name)) continue;
      const path = prefix + name;
      if (handle.kind === 'directory') {
        Object.assign(out, await readSettings(handle, `${path}/`));
      } else {
        const file = await handle.getFile();
        if (file.size === undefined || file.size <= SETTINGS_FILE_CAP) out[path] = await file.text();
      }
    }
    return out;
  }

  // A repo folder holding only .agister with the saved files.
  function dirFromSettings(name, files) {
    const root = folderNode(name);
    for (const [path, text] of Object.entries(files)) {
      place(root, [AGISTER_DIR, ...path.split('/').filter(Boolean)], { text: async () => text, size: text.length });
    }
    if (!root.children.has(AGISTER_DIR)) root.children.set(AGISTER_DIR, folderNode(AGISTER_DIR));
    return asHandle(root);
  }

  // Throws when storage is full; the caller says so.
  function saveSettings(storage, id, files, savedAt) {
    storage.setItem(SETTINGS_KEY + id, JSON.stringify({ savedAt, files }));
  }

  // { savedAt, files } or null when missing or unreadable.
  function loadSettings(storage, id) {
    try {
      const data = JSON.parse(storage.getItem(SETTINGS_KEY + id));
      if (!data || typeof data.savedAt !== 'number' || !data.files || typeof data.files !== 'object') return null;
      if (!Object.values(data.files).every((t) => typeof t === 'string')) return null;
      return data;
    } catch {
      return null;
    }
  }

  // A picked folder named .agister is Agister's home, ~/.agister: a repo
  // is picked as the folder that holds its .agister.
  function isAgisterHome(folder) {
    return folder.name === AGISTER_DIR;
  }

  // The id last shown, or null.
  function readCurrent(storage) {
    try {
      const id = storage.getItem(CURRENT_KEY);
      return typeof id === 'string' && id ? id : null;
    } catch {
      return null;
    }
  }

  function writeCurrent(storage, id) {
    try { storage.setItem(CURRENT_KEY, id); } catch { /* the page still shows it */ }
  }

  function dropSettings(storage, id) {
    try { storage.removeItem(SETTINGS_KEY + id); } catch { /* a stray copy is harmless */ }
  }

  globalThis.AgisterRepos = {
    RECENT_KEY, RECENT_CAP, AGISTER_DIR, SETTINGS_KEY, CURRENT_KEY, HOME_ID,
    isAgisterHome, readCurrent, writeCurrent,
    isAgisterRepo,
    readRecent, writeRecent, addRecent, removeRecent, rememberRepo, forgetRepo,
    dirFromFiles, readSettings, dirFromSettings, saveSettings, loadSettings, dropSettings,
  };
})();
