// Agister pages: the repo picker's logic that does not touch the DOM.
//
// A classic script that sets globalThis.AgisterRepos, not an ES module with
// exports: Chrome refuses module scripts from file:// (CORS), and the page
// must open from disk. The tests import this file for that side effect.
(() => {
  const RECENT_KEY = 'agister-pages:recent';
  const RECENT_CAP = 10;
  const AGISTER_DIR = '.agister';

  const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

  // Dotfiles stay hidden, except .agister.
  function isVisibleName(name) {
    return !name.startsWith('.') || name === AGISTER_DIR;
  }

  // Directories first, then by name.
  function compareEntries(a, b) {
    if (a.kind !== b.kind) return a.kind === 'directory' ? -1 : 1;
    return collator.compare(a.name, b.name) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  }

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

  // The visible entries of dir, sorted; each subfolder carries `agister`.
  async function listFolder(dir) {
    const entries = [];
    for await (const [name, handle] of dir.entries()) {
      if (isVisibleName(name)) entries.push({ name, kind: handle.kind, handle, agister: false });
    }
    entries.sort(compareEntries);
    await Promise.all(entries.map(async (entry) => {
      if (entry.kind === 'directory' && entry.name !== AGISTER_DIR) {
        entry.agister = await isAgisterRepo(entry.handle);
      }
    }));
    return entries;
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

  // Adds entry to the stored list. dropped holds the entries the cap pushed
  // out, whose handles the caller deletes.
  function rememberRepo(storage, entry) {
    const before = readRecent(storage);
    const list = addRecent(before, entry);
    writeRecent(storage, list);
    const kept = new Set(list.map((e) => e.id));
    return { list, dropped: before.filter((e) => !kept.has(e.id)) };
  }

  function forgetRepo(storage, id) {
    const list = removeRecent(readRecent(storage), id);
    writeRecent(storage, list);
    return list;
  }

  // The handle store's key: the folder name plus a unique suffix.
  function makeRepoId(name, unique = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8)) {
    return `${name}:${unique()}`;
  }

  // The id of the stored record whose handle is the same folder as handle.
  async function findKnownId(records, handle) {
    for (const record of records) {
      if (await record.handle.isSameEntry(handle)) return record.id;
    }
    return null;
  }

  // True once read access is granted. requestPermission may need a user
  // gesture; a refusal or an error is false.
  async function ensureReadPermission(handle) {
    const opts = { mode: 'read' };
    try {
      if (await handle.queryPermission(opts) === 'granted') return true;
      return await handle.requestPermission(opts) === 'granted';
    } catch {
      return false;
    }
  }

  globalThis.AgisterRepos = {
    RECENT_KEY, RECENT_CAP, AGISTER_DIR,
    isVisibleName, compareEntries, isAgisterRepo, listFolder,
    readRecent, writeRecent, addRecent, removeRecent, rememberRepo, forgetRepo,
    makeRepoId, findKnownId, ensureReadPermission,
  };
})();
